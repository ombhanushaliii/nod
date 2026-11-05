-- Only the trustee changes a user's rules (limit and notify toggle), and the
-- change applies at once. The user can't change or propose changes, so the
-- pending-change table and the 'rules' approval kind go away. Every change is
-- kept in rule_history so the user can see what their trustee did.

drop table public.rule_changes;

alter table public.approvals drop constraint approvals_kind_check;
alter table public.approvals add constraint approvals_kind_check check (kind in ('payment', 'export'));

-- Null until the trustee first edits the rules.
alter table public.rules add column updated_by uuid references public.users (id) on delete set null;

create table public.rule_history (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users (id) on delete cascade,
  changed_by        uuid references public.users (id) on delete set null,
  old_amount_limit  bigint not null,
  new_amount_limit  bigint not null,
  old_notify_mode   text not null,
  new_notify_mode   text not null,
  created_at        timestamptz not null default now()
);

create index rule_history_user_idx on public.rule_history (user_id, created_at desc);

-- The trustee of an active pair sets the user's rules. Null = keep as is.
-- Returns the user's rules after the change.
create function public.set_rules(
  p_pair_id       public.hex32,
  p_trustee_id    uuid,
  p_amount_limit  bigint,
  p_notify_mode   text
) returns public.rules
  language plpgsql set search_path = ''
as $$
declare
  v_user_id uuid;
  v_old     public.rules;
  v_new     public.rules;
begin
  select user_id into v_user_id from public.pairs
   where pair_id = p_pair_id and trustee_id = p_trustee_id and status = 'active';
  if v_user_id is null then raise exception 'not_your_pair'; end if;

  select * into v_old from public.rules where user_id = v_user_id for update;
  update public.rules
     set amount_limit = coalesce(p_amount_limit, amount_limit),
         notify_mode  = coalesce(p_notify_mode, notify_mode),
         updated_by   = p_trustee_id
   where user_id = v_user_id
  returning * into v_new;

  if v_new.amount_limit <> v_old.amount_limit or v_new.notify_mode <> v_old.notify_mode then
    insert into public.rule_history
      (user_id, changed_by, old_amount_limit, new_amount_limit, old_notify_mode, new_notify_mode)
    values
      (v_user_id, p_trustee_id, v_old.amount_limit, v_new.amount_limit, v_old.notify_mode, v_new.notify_mode);
  end if;
  return v_new;
end;
$$;

alter table public.rule_history enable row level security;
revoke all on public.rule_history from anon, authenticated;
revoke execute on function public.set_rules(public.hex32, uuid, bigint, text)
  from public, anon, authenticated;
