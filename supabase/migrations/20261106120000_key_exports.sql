-- Key export (D2): exporting the wallet key is itself a trustee approval.
-- The user asks (a key_exports row with a nonce), the app writes a sealed
-- approval_request of kind 'export' to Arkiv, the trustee allows or denies,
-- and an Allow can be used once, within its window, by the export page.

create table public.key_exports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  -- Goes into exportIntentHash(wallet, nonce), which the trustee's Allow carries.
  nonce        public.hex32 not null unique,
  status       text not null default 'created'
               check (status in ('created', 'awaiting_trustee', 'allowed', 'denied', 'expired', 'used')),
  approval_id  uuid unique references public.approvals (id),
  created_at   timestamptz not null default now(),
  used_at      timestamptz
);

create index key_exports_user_idx on public.key_exports (user_id, created_at desc);

alter table public.key_exports enable row level security;
revoke all on public.key_exports from anon, authenticated;

-- The app wrote the export request on Arkiv; remember it for this export.
create function public.attach_export_request(
  p_export_id    uuid,
  p_user_id      uuid,
  p_request_key  public.hex32
) returns uuid
  language plpgsql set search_path = ''
as $$
declare
  v_export   public.key_exports;
  v_pair_id  uuid;
  v_approval uuid;
begin
  select * into v_export from public.key_exports
   where id = p_export_id and user_id = p_user_id for update;
  if v_export.id is null then raise exception 'export_not_found'; end if;
  if v_export.status <> 'created' then raise exception 'already_requested'; end if;

  select id into v_pair_id from public.pairs where user_id = p_user_id and status = 'active';
  if v_pair_id is null then raise exception 'no_active_trustee'; end if;

  begin
    insert into public.approvals (pair_id, kind, request_key)
    values (v_pair_id, 'export', p_request_key)
    returning id into v_approval;
  exception when unique_violation then
    raise exception 'request_key_used';
  end;

  update public.key_exports set approval_id = v_approval, status = 'awaiting_trustee'
   where id = p_export_id;
  return v_approval;
end;
$$;

-- Store a verified decision. Returns the export's new status.
create function public.record_export_decision(
  p_export_id     uuid,
  p_decision_key  public.hex32,
  p_verdict       text,
  p_valid_from    timestamptz,
  p_valid_until   timestamptz
) returns text
  language plpgsql set search_path = ''
as $$
declare
  v_export public.key_exports;
  v_status text;
begin
  select * into v_export from public.key_exports where id = p_export_id for update;
  if v_export.id is null then raise exception 'export_not_found'; end if;
  if v_export.status <> 'awaiting_trustee' then raise exception 'not_awaiting_trustee'; end if;

  begin
    update public.approvals
       set decision_key = p_decision_key, verdict = p_verdict,
           valid_from = case when p_verdict = 'allow' then p_valid_from end,
           valid_until = case when p_verdict = 'allow' then p_valid_until end
     where id = v_export.approval_id;
  exception when unique_violation then
    raise exception 'decision_key_used';
  end;

  v_status := case when p_verdict = 'allow' then 'allowed' else 'denied' end;
  update public.key_exports set status = v_status where id = p_export_id;
  return v_status;
end;
$$;

-- The export page is about to show Privy's export. Uses up the user's newest
-- allowed export that is inside its window, once. Returns its id.
create function public.claim_export(p_user_id uuid) returns uuid
  language plpgsql set search_path = ''
as $$
declare
  v_export_id   uuid;
  v_approval_id uuid;
begin
  select e.id, a.id into v_export_id, v_approval_id
    from public.key_exports e
    join public.approvals a on a.id = e.approval_id
   where e.user_id = p_user_id and e.status = 'allowed'
     and a.verdict = 'allow' and a.used_at is null
     and a.valid_from <= now() and a.valid_until > now()
   order by e.created_at desc
   limit 1
   for update of e, a;
  if v_export_id is null then raise exception 'export_not_allowed'; end if;

  update public.approvals set used_at = now() where id = v_approval_id;
  update public.key_exports set status = 'used', used_at = now() where id = v_export_id;
  return v_export_id;
end;
$$;

revoke execute on function public.attach_export_request(uuid, uuid, public.hex32) from public, anon, authenticated;
revoke execute on function public.record_export_decision(uuid, public.hex32, text, timestamptz, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.claim_export(uuid) from public, anon, authenticated;
