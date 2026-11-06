# Deploy

How to put Nod online: the API on Supabase, the landing page on Cloudflare
Pages, and the app pointed at both. Run the commands from the repo root unless a
step says otherwise. Never paste a secret into a file that git tracks.

## 1. Backend secrets

Copy `supabase/functions/.env.example` to `supabase/functions/.env` (git ignores
it) and fill in every value. Check these two point at the live site:

```
INVITE_URL_BASE=https://getnod.pages.dev/invite?token=
WEB_ALLOWED_ORIGINS=http://localhost:8081,https://getnod.pages.dev
```

`JOBS_SECRET` is any long random string, for example:

```bash
openssl rand -hex 32
```

## 2. Database

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```

`link` and `db push` ask for the database password (Dashboard > Project
Settings > Database). `db push` runs every file in `supabase/migrations`,
including the one that turns on `pg_cron` and `pg_net` and schedules the two
Arkiv jobs.

Then, in the Dashboard's SQL editor, add the two Vault secrets the jobs read.
`<JOBS_SECRET>` is the same value as in `.env`:

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<JOBS_SECRET>', 'jobs_secret');
```

Until both exist, the jobs run but do nothing (they log a warning).

## 3. API (Edge Function)

```bash
npx supabase secrets set --env-file supabase/functions/.env
npx supabase functions deploy api
```

`supabase/config.toml` turns off Supabase's own JWT check for `api`. The
function checks Privy tokens itself.

Check it's up. An unknown invite token should answer 404:

```bash
curl -i https://<project-ref>.supabase.co/functions/v1/api/public/invites/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
```

Run one job by hand to check the Vault secrets (SQL editor). The result shows up
under Edge Functions > api > Logs:

```sql
select public.call_arkiv_job('mirror');
```

## 4. Landing page (Cloudflare Pages)

Cloudflare builds and deploys the `getnod` project on every new commit. The
`/invite` page needs the API URL at build time. It's in `landing/.env.production`
(a public URL, not a secret), so builds pick it up with nothing to set in
Cloudflare. For another Supabase project, change it there.

The `/export` page (key export) also needs `VITE_PRIVY_APP_ID`, the same public
Privy app ID as the app, in the same file. In the Privy Dashboard, keep
`getnod.pages.dev` as the **only** allowed domain for real users: any allowed
domain can open Privy's key export, which would skip the trustee
(`localhost:8081` is fine while developing).

## 5. App

In `frontend/.env` (see `frontend/.env.example`):

```
EXPO_PUBLIC_WALLET_MODE=privy
EXPO_PUBLIC_API_URL=https://<project-ref>.supabase.co/functions/v1/api
EXPO_PUBLIC_RABDI_RPC_URL=https://rpc.rabdi.db-chain.testnet.arkiv.network/<app access key>
```

Use a separate Arkiv access key for the app: the app's key can be pulled out
of the build. Set up Privy as in [privy-wallet.md](privy-wallet.md), then build
and install the development client. Push stays off until you run `eas init` and
add FCM credentials (see privy-wallet.md).

## 6. Scam report import (optional)

Writes known scam wallets to Arkiv as `scam_report` entities from the seed
wallet. The backend counts the seed wallet's reports as verified, so a payment
to one of these addresses needs the trustee. Two lists, in this order:

| List | What it takes | `source` | `category` |
| --- | --- | --- | --- |
| [OFAC SDN](https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML) (US Treasury) | Every 0x address listed as a "Digital Currency Address" | `ofac` | `sanctioned` |
| [eth-labels](https://github.com/dawsbot/eth-labels) (Etherscan labels, MIT) | Labels `phish-hack`, `scam`, `heist`, `exploit`, `*-exploit`, `ofac-sanctioned`, on any EVM chain | `list` | `phishing`, `exploit` or `sanctioned` |

An address on both lists is written once, as `ofac`. Labels such as `blocked`,
`tornado-cash` and `cpimp-attack` stay out on purpose (see
`services/backend/jobs/sources/eth-labels.ts`).

Dry run first; it writes nothing:

```bash
cd services/backend/jobs
bun install
bun --env-file=../../../supabase/functions/.env run import
```

It prints how many addresses each list has, how many the seed wallet already
reported, and the most the run can cost. Try a few writes, then the rest:

```bash
bun --env-file=../../../supabase/functions/.env run import --yes --limit=5
bun --env-file=../../../supabase/functions/.env run import --yes
```

- Writes go one at a time and the first error stops the run. Nothing is retried.
- A run skips addresses already on Arkiv, so after a stop, check the printed
  tx on the [Rabdi explorer](https://rabdi.explorer.arkiv.network), then run
  the same command again.
- It refuses to start if the worst case (1M gas per report) is more than
  `--max-spend` (default 1 GLM) or the seed wallet's balance.
- `--source=ofac` or `--source=eth-labels` runs one list.
- Each write is logged with its tx hash in `import-log.jsonl` (git ignores it).

Run it again whenever the lists change; only new addresses are written.

An address taken off a list (for example delisted by OFAC) keeps its report
until you prune it. `--prune` lists the seed wallet's reports for addresses on
neither list; `--prune --yes` deletes them, one at a time like writes. Once a
report is gone from Arkiv, the renewer stops extending it. Trustee reports are
never pruned.

```bash
bun --env-file=../../../supabase/functions/.env run import --prune
```

The mirror job copies the reports into Supabase within the hour.

## 7. End-to-end test

Two phones (or one phone and two Google accounts), both on the development
client. The rules shape what you can test in one day:

- The first payment ever is capped at $10.
- An address the user has never paid waits 24h, even after the trustee allows it.

So on day one you test pairing and the trustee's answers. The send after an
Allow comes the next day.

**Day one**

1. **User:** sign in, set up the wallet, invite the trustee's email.
2. **Email:** the invite arrives. On the trustee's phone, open the link: the
   page says the link is open, and **Open in the Nod app** goes to Nod.
3. **Trustee:** sign in on the trustee side and tap **Accept**. The user's app
   shows the trustee as set up.
4. **User:** with test USDC in the wallet, send $5 to a new address. The app
   says it unlocks in 24 hours (new person). This starts that address's wait.
5. **User:** send $5 to a flagged address: one from the scam report import
   (step 6), or one GoPlus flags. Answer the 3 questions and ask the trustee.
6. **Trustee:** the request shows under **Needs you**, with why it was flagged
   and the answers. **Allow once**. The user's waiting screen turns to allowed,
   unlocking 24h after the Allow (it's a new address).
7. Ask again for another flagged address, and **Deny & report** this time. The
   user sees the denial, and the address gets a scam report from the trustee's
   per-pair key.
8. **Trustee:** change the limit or "How often" on the person's page. The user's
   settings show the new rules.
9. Arkiv: the requests, decisions and report are on the Rabdi explorer
   (https://rabdi.explorer.arkiv.network), written by the user's wallet and the
   per-pair key.

**Key export (same day, after the pairing)**

- **User:** Settings → Export wallet key → Ask. The row says it's waiting.
- **Trustee:** the request shows under **Needs you** as "Export wallet key".
  **Allow export**.
- **User:** within the hour, the row says "Allowed · tap to view once". Tap it,
  **Open Privy's export**, sign in with the same Google account, **Show my key**.
  Privy shows the key; the app then says "Key exported".
- Tap the row again: it asks the trustee again. The same Allow can't be used twice.

**Day two**

10. **User:** send $5 to the address from step 4: it goes out (sponsored, on
    Ethereum Sepolia). Within the hour after the unlock, send the allowed
    payment from step 6.

If the trustee app says its key doesn't match the one it accepted with, Privy
didn't sign the same message the same way twice. Note it and stop: answers from
that phone wouldn't count.
