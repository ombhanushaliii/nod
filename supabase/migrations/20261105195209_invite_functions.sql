-- Invite create/accept as single transactions. Called only by the api
-- function (service role). Errors use short codes the API maps to HTTP.

-- Creates the user's pair + invite, or replaces the token on a pending invite
-- (re-sending). Refuses if the user already has an active trustee.
create function public.create_invite(
  p_user_id     uuid,
  p_pair_id     public.hex32,
  p_contact     text,
  p_token_hash  text,
  p_expires_at  timestamptz
) returns uuid
  language plpgsql set search_path = ''
as $$
declare
  v_pair public.pairs;
begin
  select * into v_pair from public.pairs
   where user_id = p_user_id and status in ('invited', 'active')
   for update;

  if v_pair.status = 'active' then
    raise exception 'pair_active';
  end if;

  if v_pair.id is null then
    insert into public.pairs (pair_id, user_id)
    values (p_pair_id, p_user_id)
    returning * into v_pair;

    insert into public.invites (pair_id, channel, contact, token_hash, expires_at)
    values (v_pair.id, 'email', p_contact, p_token_hash, p_expires_at);
  else
    update public.invites
       set contact = p_contact, token_hash = p_token_hash,
           expires_at = p_expires_at, accepted_at = null, created_at = now()
     where pair_id = v_pair.id;
  end if;

  return v_pair.id;
end;
$$;

-- Trustee accepts: activates the pair with their per-pair key and encryption
-- key, and deletes the stored contact. Returns the Arkiv pairId.
create function public.accept_invite(
  p_token_hash        text,
  p_trustee_id        uuid,
  p_pair_key_address  public.evm_address,
  p_enc_pubkey        public.hex32
) returns public.hex32
  language plpgsql set search_path = ''
as $$
declare
  v_invite public.invites;
  v_pair   public.pairs;
begin
  select * into v_invite from public.invites where token_hash = p_token_hash for update;
  if v_invite.id is null then raise exception 'invite_not_found'; end if;

  select * into v_pair from public.pairs where id = v_invite.pair_id for update;

  if v_invite.accepted_at is not null or v_pair.status <> 'invited' then
    raise exception 'invite_used';
  end if;
  if v_invite.expires_at < now() then raise exception 'invite_expired'; end if;
  if v_pair.user_id = p_trustee_id then raise exception 'self_trustee'; end if;

  update public.pairs
     set trustee_id = p_trustee_id, pair_key_address = p_pair_key_address,
         trustee_enc_pubkey = p_enc_pubkey, status = 'active', accepted_at = now()
   where id = v_pair.id;

  update public.invites set accepted_at = now(), contact = null where id = v_invite.id;

  return v_pair.pair_id;
end;
$$;

revoke execute on function public.create_invite(uuid, public.hex32, text, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.accept_invite(text, uuid, public.evm_address, public.hex32)
  from public, anon, authenticated;
