-- Payment rules (decisions doc D3), payees, trustee approvals, payments,
-- and the permanent scam report archive (D6).
-- Amounts are USDC base units (6 decimals): 1 USDC = 1_000_000.

-- Per-user rules. Set by the trustee; the user can only tighten them.
-- The $10 first-payment cap is fixed in code and can't be changed.
create table public.rules (
  user_id       uuid primary key references public.users (id) on delete cascade,
  amount_limit  bigint not null default 100000000 check (amount_limit > 0),  -- $100
  notify_mode   text not null default 'first_per_payee'
                  check (notify_mode in ('first_per_payee', 'every_time')),
  updated_at    timestamptz not null default now()
);

-- Every address a user has tried to pay.
-- "New payee" = first_paid_at is null.
create table public.payees (
  user_id                 uuid not null references public.users (id) on delete cascade,
  address                 public.evm_address not null,
  -- Starts the 24h cooldown when no trustee is involved.
  first_attempt_at        timestamptz not null default now(),
  first_paid_at           timestamptz,
  -- For notify_mode = first_per_payee: set once an over-limit payment was approved.
  over_limit_approved_at  timestamptz,
  primary key (user_id, address)
);

-- Mirror of one approval_request / trustee_decision pair on Arkiv.
-- The Arkiv entities are the source of truth; this row tracks use, so an
-- "Allow once" can't be spent twice.
create table public.approvals (
  id            uuid primary key default gen_random_uuid(),
  pair_id       uuid not null references public.pairs (id) on delete cascade,
  kind          text not null check (kind in ('payment', 'export', 'rules')),
  request_key   public.hex32 not null unique,
  decision_key  public.hex32 unique,
  verdict       text check (verdict in ('allow', 'deny')),
  -- From the decision: when it starts and stops being usable.
  valid_from    timestamptz,
  valid_until   timestamptz,
  used_at       timestamptz,
  created_at    timestamptz not null default now(),

  constraint approvals_decision_complete check (
    (decision_key is null and verdict is null)
    or (decision_key is not null and verdict is not null)
  ),
  constraint approvals_allow_has_window check (
    verdict is distinct from 'allow'
    or (valid_from is not null and valid_until is not null and valid_until > valid_from)
  ),
  constraint approvals_only_allow_used check (used_at is null or verdict = 'allow')
);

create index approvals_pair_id_idx on public.approvals (pair_id);

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  to_address   public.evm_address not null,
  amount       bigint not null check (amount > 0),
  -- The backend's answer from /payments/check.
  verdict      text not null check (verdict in ('refused', 'needs_trustee', 'cooldown', 'safe')),
  reasons      text[] not null default '{}',
  status       text not null default 'checked'
                 check (status in ('checked', 'refused', 'awaiting_trustee', 'denied',
                                   'cooling_down', 'ready', 'sent', 'failed', 'expired')),
  -- Earliest time the payment may be sent (24h cooldown).
  unlock_at    timestamptz,
  -- Random nonce inside intentHash = hash(recipient, amount, nonce).
  nonce        public.hex32 not null unique,
  approval_id  uuid unique references public.approvals (id) on delete set null,
  tx_hash      text unique check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint payments_sent_has_tx check ((status = 'sent') = (tx_hash is not null))
);

create index payments_user_created_idx on public.payments (user_id, created_at desc);

-- A pending loosening of rules: needs trustee approval plus the 24h cooldown.
create table public.rule_changes (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users (id) on delete cascade,
  new_amount_limit  bigint check (new_amount_limit > 0),
  new_notify_mode   text check (new_notify_mode in ('first_per_payee', 'every_time')),
  approval_id       uuid unique references public.approvals (id) on delete set null,
  status            text not null default 'awaiting_trustee'
                      check (status in ('awaiting_trustee', 'cooling_down', 'applied', 'denied', 'expired')),
  effective_at      timestamptz,
  created_at        timestamptz not null default now(),

  constraint rule_changes_something
    check (new_amount_limit is not null or new_notify_mode is not null)
);

create index rule_changes_user_idx on public.rule_changes (user_id, created_at desc);

-- Permanent copy of every scam_report seen on Arkiv. Arkiv holds the live,
-- public copy (180 days, renewed); this table keeps it beyond expiry.
create table public.scam_reports_archive (
  entity_key           public.hex32 primary key,
  address              public.evm_address not null,
  source               text not null check (source in ('trustee', 'ofac', 'list')),
  category             text,
  reason               text,
  creator              public.evm_address not null,
  -- Creator was our seed wallet or a trustee per-pair key (D3).
  verified             boolean not null,
  arkiv_expires_at     timestamptz,
  last_extended_at     timestamptz,
  archived_at          timestamptz not null default now()
);

create index scam_reports_archive_address_idx on public.scam_reports_archive (address);

-- Keep updated_at current.
create function public.touch_updated_at() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();
create trigger rules_touch before update on public.rules
  for each row execute function public.touch_updated_at();

-- Lock down: service role only.
alter table public.rules                enable row level security;
alter table public.payees               enable row level security;
alter table public.approvals            enable row level security;
alter table public.payments             enable row level security;
alter table public.rule_changes         enable row level security;
alter table public.scam_reports_archive enable row level security;

revoke all on public.rules, public.payees, public.approvals, public.payments,
  public.rule_changes, public.scam_reports_archive
  from anon, authenticated;
revoke execute on function public.touch_updated_at() from anon, authenticated, public;
