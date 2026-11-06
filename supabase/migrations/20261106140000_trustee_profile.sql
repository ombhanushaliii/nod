-- How a trustee appears to the people they protect: the name and avatar they
-- pick in the trustee app. Until now these stayed on the trustee's phone, so
-- the user's app could only guess a name from the invited email, and that
-- email is wiped once the invite is accepted (invites_contact_until_accepted).
-- Shown only to users this person is the active trustee of (GET /pair).
-- "if not exists": safe to rerun if an earlier push stopped partway (this
-- file first had version 20261106130000, which rule_change_limit also uses).
alter table public.users
  add column if not exists trustee_name   text check (char_length(btrim(trustee_name)) between 1 and 40),
  add column if not exists trustee_avatar smallint check (trustee_avatar between 0 and 7);
