-- Core tables: people, the user–trustee link, invites, push tokens.
-- The mobile app never talks to Supabase directly; only the api Edge Function
-- does, using the service role. So RLS is on with no policies, and the
-- anon/authenticated roles get no grants at all.

-- Lower-case 0x-prefixed EVM address.
create domain public.evm_address as text
  check (value ~ '^0x[0-9a-f]{40}$');

-- 32 bytes as lower-case 0x-prefixed hex (pairId, x25519 public key).
create domain public.hex32 as text
  check (value ~ '^0x[0-9a-f]{64}$');

-- One row per person. The same person can be a user, a trustee, or both.
create table public.users (
  id              uuid primary key default gen_random_uuid(),
  privy_user_id   text not null unique,
  wallet_address  public.evm_address not null unique,
  created_at      timestamptz not null default now()
);

-- The user–trustee link. Kept off Arkiv on purpose (decisions doc D7).
-- One open (invited or active) pair per user.
create table public.pairs (
  id                  uuid primary key default gen_random_uuid(),
  -- Random id put on Arkiv entities instead of any address.
  pair_id             public.hex32 not null unique,
  user_id             uuid not null references public.users (id) on delete cascade,
  -- Null until the trustee accepts the invite.
  trustee_id          uuid references public.users (id) on delete set null,
  -- Address of the trustee's per-pair Arkiv key (D5). Never linked to them on Arkiv.
  pair_key_address    public.evm_address unique,
  -- Trustee's x25519 public key for sealing requests (D8).
  trustee_enc_pubkey  public.hex32,
  status              text not null default 'invited'
                        check (status in ('invited', 'active', 'revoked')),
  created_at          timestamptz not null default now(),
  accepted_at         timestamptz,

  constraint pairs_not_self check (trustee_id is distinct from user_id),
  constraint pairs_active_complete check (
    status <> 'active' or (
      trustee_id is not null
      and pair_key_address is not null
      and trustee_enc_pubkey is not null
      and accepted_at is not null
    )
  )
);

create unique index pairs_one_open_per_user
  on public.pairs (user_id)
  where status in ('invited', 'active');

create index pairs_trustee_id_idx on public.pairs (trustee_id);

-- Invite sent to the trustee at onboarding (required step).
-- The contact is only kept until the invite is accepted, then cleared.
create table public.invites (
  id           uuid primary key default gen_random_uuid(),
  pair_id      uuid not null unique references public.pairs (id) on delete cascade,
  channel      text not null check (channel in ('email', 'phone')),
  contact      text,
  -- sha256 of the token in the invite link; the raw token is never stored.
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now(),

  constraint invites_contact_until_accepted
    check ((accepted_at is null) = (contact is not null))
);

-- Expo push tokens, used to wake the trustee (D9). A person may have several devices.
create table public.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  expo_token  text not null unique,
  created_at  timestamptz not null default now()
);

create index push_tokens_user_id_idx on public.push_tokens (user_id);

-- Lock down: service role only.
alter table public.users       enable row level security;
alter table public.pairs       enable row level security;
alter table public.invites     enable row level security;
alter table public.push_tokens enable row level security;

revoke all on public.users, public.pairs, public.invites, public.push_tokens
  from anon, authenticated;
