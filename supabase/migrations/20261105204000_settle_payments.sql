-- Finishing a payment once Privy knows how its transaction ended. There's no
-- polling job: the backend asks Privy when the app reads the payment.
--   confirmed / finalized          -> sent   (tx_hash recorded)
--   failed / reverted / provider   -> failed (the payee no longer counts as paid)

alter table public.payments
  add column settled_at      timestamptz,
  add column failure_reason  text;

-- Moves a submitted payment to sent or failed. Idempotent: a payment that
-- isn't submitted is left alone. Returns the payment's status afterwards.
create function public.settle_payment(
  p_payment_id  uuid,
  p_outcome     text,
  p_tx_hash     text,
  p_reason      text
) returns text
  language plpgsql set search_path = ''
as $$
declare
  v_payment public.payments;
begin
  if p_outcome not in ('sent', 'failed') then raise exception 'bad_outcome'; end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null then raise exception 'payment_not_found'; end if;
  if v_payment.status <> 'submitted' then return v_payment.status; end if;

  if p_outcome = 'sent' then
    update public.payments
       set status = 'sent', tx_hash = coalesce(p_tx_hash, tx_hash), settled_at = now()
     where id = p_payment_id;
    return 'sent';
  end if;

  update public.payments
     set status = 'failed', failure_reason = p_reason, settled_at = now()
   where id = p_payment_id;

  -- Nothing reached the payee, so undo what mark_payment_submitted recorded,
  -- unless another payment to the same payee went through.
  update public.payees pe
     set first_paid_at = case when exists (
           select 1 from public.payments p
            where p.user_id = pe.user_id and p.to_address = pe.address
              and p.status in ('submitted', 'sent'))
           then pe.first_paid_at end,
         over_limit_approved_at = case when exists (
           select 1 from public.payments p
            where p.user_id = pe.user_id and p.to_address = pe.address
              and p.status in ('submitted', 'sent')
              and p.approval_id is not null and 'over_limit' = any (p.reasons))
           then pe.over_limit_approved_at end
   where pe.user_id = v_payment.user_id and pe.address = v_payment.to_address;
  return 'failed';
end;
$$;

revoke execute on function public.settle_payment(uuid, text, text, text) from public, anon, authenticated;
