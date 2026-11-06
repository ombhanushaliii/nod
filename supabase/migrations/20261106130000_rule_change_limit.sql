-- A trustee can change one person's rules at most 5 times in 10 minutes.
-- Each change pushes the user a notification, and quick flip-flopping
-- (raise the limit, send, lower it) is exactly what this stops. Only real
-- changes count: saving the same values again is free and always allowed.
-- Keep the numbers in step with RULE_CHANGE_LIMIT / RULE_CHANGE_WINDOW_MS in
-- supabase/functions/api/routes/rules.ts.
--
-- Same as set_rules in the trustee_rules migration, plus the limit check. The
-- check runs after `for update` on the user's rules row, so two requests at
-- once can't both slip in as the 5th.
create or replace function public.set_rules(
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

  if coalesce(p_amount_limit, v_old.amount_limit) <> v_old.amount_limit
     or coalesce(p_notify_mode, v_old.notify_mode) <> v_old.notify_mode then
    if (select count(*) from public.rule_history
         where user_id = v_user_id and created_at > now() - interval '10 minutes') >= 5 then
      raise exception 'too_many_rule_changes';
    end if;
  end if;

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

revoke execute on function public.set_rules(public.hex32, uuid, bigint, text)
  from public, anon, authenticated;
