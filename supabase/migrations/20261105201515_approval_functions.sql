-- Linking a payment to its Arkiv approval_request, and recording the
-- trustee's decision once the backend has verified it on Arkiv (D5).

-- The app wrote an approval_request on Arkiv; remember it for this payment.
create function public.attach_approval_request(
  p_payment_id   uuid,
  p_user_id      uuid,
  p_request_key  public.hex32
) returns uuid
  language plpgsql set search_path = ''
as $$
declare
  v_payment  public.payments;
  v_pair_id  uuid;
  v_approval uuid;
begin
  select * into v_payment from public.payments
   where id = p_payment_id and user_id = p_user_id for update;
  if v_payment.id is null then raise exception 'payment_not_found'; end if;
  if v_payment.verdict <> 'needs_trustee' then raise exception 'trustee_not_needed'; end if;
  if v_payment.status <> 'checked' then raise exception 'already_requested'; end if;

  select id into v_pair_id from public.pairs where user_id = p_user_id and status = 'active';
  if v_pair_id is null then raise exception 'no_active_trustee'; end if;

  begin
    insert into public.approvals (pair_id, kind, request_key)
    values (v_pair_id, 'payment', p_request_key)
    returning id into v_approval;
  exception when unique_violation then
    raise exception 'request_key_used';
  end;

  update public.payments set approval_id = v_approval, status = 'awaiting_trustee'
   where id = p_payment_id;
  return v_approval;
end;
$$;

-- Store a verified decision. Allow: the payment unlocks at p_valid_from
-- (24h later for a new payee) and stays usable until p_valid_until.
create function public.record_decision(
  p_payment_id    uuid,
  p_decision_key  public.hex32,
  p_verdict       text,
  p_valid_from    timestamptz,
  p_valid_until   timestamptz
) returns text
  language plpgsql set search_path = ''
as $$
declare
  v_payment public.payments;
  v_status  text;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null then raise exception 'payment_not_found'; end if;
  if v_payment.status <> 'awaiting_trustee' then raise exception 'not_awaiting_trustee'; end if;

  begin
    update public.approvals
       set decision_key = p_decision_key, verdict = p_verdict,
           valid_from = case when p_verdict = 'allow' then p_valid_from end,
           valid_until = case when p_verdict = 'allow' then p_valid_until end
     where id = v_payment.approval_id;
  exception when unique_violation then
    raise exception 'decision_key_used';
  end;

  if p_verdict = 'deny' then
    v_status := 'denied';
    update public.payments set status = v_status, unlock_at = null where id = p_payment_id;
  else
    v_status := case when p_valid_from > now() then 'cooling_down' else 'ready' end;
    update public.payments set status = v_status, unlock_at = p_valid_from where id = p_payment_id;
  end if;
  return v_status;
end;
$$;

revoke execute on function public.attach_approval_request(uuid, uuid, public.hex32)
  from public, anon, authenticated;
revoke execute on function public.record_decision(uuid, public.hex32, text, timestamptz, timestamptz)
  from public, anon, authenticated;
