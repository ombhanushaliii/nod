-- Sending payments as the backend signer on the user's Privy wallet (D3a).
-- A send is: claim (ready -> sending, approval marked used) -> relay to Privy
-- -> submitted, or released back to ready if Privy refused it.

-- Privy's wallet id is what its /v1/wallets/{wallet_id}/rpc endpoint needs.
alter table public.users add column privy_wallet_id text unique;

-- Sponsored transactions return an empty hash until confirmed, so track
-- Privy's ids instead and require a hash only once confirmed.
alter table public.payments drop constraint payments_sent_has_tx;
alter table public.payments drop constraint payments_status_check;
alter table public.payments add constraint payments_status_check check (status in (
  'checked', 'refused', 'awaiting_trustee', 'denied', 'cooling_down',
  'ready', 'sending', 'submitted', 'sent', 'failed', 'expired'));
alter table public.payments
  add column privy_transaction_id text unique,
  add column user_operation_hash  text,
  add column submitted_at         timestamptz,
  add constraint payments_submitted_has_time
    check (status not in ('submitted', 'sent') or submitted_at is not null),
  add constraint payments_sent_has_tx
    check (status <> 'sent' or tx_hash is not null);

-- Atomically takes a payment for sending. Raises if it isn't allowed to go.
-- A payment with no trustee approval must have been checked recently, so a
-- new scam report since then isn't missed.
create function public.claim_payment(
  p_payment_id     uuid,
  p_user_id        uuid,
  p_max_check_age  interval
) returns public.payments
  language plpgsql set search_path = ''
as $$
declare
  v_payment  public.payments;
  v_approval public.approvals;
begin
  select * into v_payment from public.payments
   where id = p_payment_id and user_id = p_user_id for update;
  if v_payment.id is null then raise exception 'payment_not_found'; end if;

  if v_payment.status = 'cooling_down' then
    if v_payment.unlock_at > now() then raise exception 'still_cooling_down'; end if;
    v_payment.status := 'ready';
  end if;
  if v_payment.status <> 'ready' then raise exception 'not_ready'; end if;

  if v_payment.approval_id is null then
    if v_payment.verdict <> 'safe' or v_payment.created_at < now() - p_max_check_age then
      raise exception 'check_stale';
    end if;
  else
    select * into v_approval from public.approvals where id = v_payment.approval_id for update;
    if v_approval.verdict is distinct from 'allow'
       or v_approval.used_at is not null
       or now() < v_approval.valid_from
       or now() >= v_approval.valid_until then
      raise exception 'approval_not_usable';
    end if;
    update public.approvals set used_at = now() where id = v_approval.id;
  end if;

  update public.payments set status = 'sending' where id = p_payment_id
  returning * into v_payment;
  return v_payment;
end;
$$;

-- Privy accepted the transaction. Records its ids and marks the payee as paid
-- (and, for an approved over-limit payment, as approved for first_per_payee).
create function public.mark_payment_submitted(
  p_payment_id      uuid,
  p_transaction_id  text,
  p_user_op_hash    text,
  p_tx_hash         text
) returns void
  language plpgsql set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  update public.payments
     set status = 'submitted', privy_transaction_id = p_transaction_id,
         user_operation_hash = p_user_op_hash, tx_hash = p_tx_hash, submitted_at = now()
   where id = p_payment_id and status = 'sending'
  returning * into v_payment;
  if v_payment.id is null then raise exception 'not_sending'; end if;

  update public.payees
     set first_paid_at = coalesce(first_paid_at, now()),
         over_limit_approved_at = case
           when v_payment.approval_id is not null and 'over_limit' = any (v_payment.reasons)
             then coalesce(over_limit_approved_at, now())
           else over_limit_approved_at end
   where user_id = v_payment.user_id and address = v_payment.to_address;
end;
$$;

-- Privy refused the transaction (nothing was broadcast): put it back so the
-- user can retry, and give the approval back.
create function public.release_payment(p_payment_id uuid) returns void
  language plpgsql set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  update public.payments set status = 'ready'
   where id = p_payment_id and status = 'sending'
  returning * into v_payment;
  if v_payment.approval_id is not null then
    update public.approvals set used_at = null where id = v_payment.approval_id;
  end if;
end;
$$;

revoke execute on function public.claim_payment(uuid, uuid, interval) from public, anon, authenticated;
revoke execute on function public.mark_payment_submitted(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.release_payment(uuid) from public, anon, authenticated;
