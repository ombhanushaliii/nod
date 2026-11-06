# Task split: 4 people

Based on [architecture-decisions.md](architecture-decisions.md). Section numbers like D3 refer to that doc.
Items marked **[draft]** are starting points the owner finalizes; tell the others when they change.

| # | Owner | Area | Delivers |
|---|---|---|---|
| A | UI person | Expo screens with mocked data | Every screen, plus a hooks layer the others swap real calls into |
| B | Wallet person | Privy, wallets, signing, chains | Login, wallet, Ethereum Sepolia + Rabdi chains, backend signer, key derivation |
| C | Backend person | Node API, Supabase, Privy server, push | Payment rules, relay with sponsorship, onboarding, push |
| D | Arkiv person | Arkiv schemas, reads/writes, jobs, judging docs | `packages/arkiv`, importer, mirror/renewer, `/arkiv/*.md`, README items |

---

## Repo layout [draft]

```
apps/mobile/          A (screens), B (wallet code in apps/mobile/wallet/)
services/backend/     C (API, rules, Supabase, Privy server, push); D (jobs/arkiv-*)
packages/arkiv/       D: schemas, read/write helpers, encryption helpers; used by app and backend
packages/shared/      C: API request and response types
supabase/             C: migrations
arkiv/                D: schema.md, friction.md, reach.md, why-arkiv.md, how-you-use-arkiv.md
```

---

## Interfaces between people (agree on these first)

### 1. Hooks layer (A defines, B and C fill in)
A builds screens against these hooks, backed by mock data. B and C replace the mocks with real calls without touching the screens. **[draft]**

| Hook | Real implementation by | Returns |
|---|---|---|
| `useAuth()` | B | login with Google or phone, logout, `user`, `wallet address` |
| `useBalance()` | B | USDC balance on Ethereum Sepolia |
| `useCheckPayment(to, amount)` | C | `verdict`, `reasons[]`, `unlockAt?`, `paymentId` |
| `useSendPayment(paymentId)` | B + C | `txHash` or error |
| `useRequestApproval(paymentId, answers)` | B + D | `requestKey` |
| `useApprovalStatus(requestKey)` | D | `pending` / `allowed` (+ `validFrom`) / `denied` / `expired` |
| `usePendingRequests()` (trustee) | D | decrypted requests for this trustee |
| `useDecide(requestKey, allow / deny)` (trustee) | B + D | done |
| `useRules()` | C | limit, toggle, trustee's change history |
| `useScamReports(address)` | D | verified and unverified reports |

### 2. Backend API (C owns) [draft]

| Endpoint | Purpose |
|---|---|
| `POST /payments/check` `{to, amount}` | Applies the D3 rules. Returns `{verdict: refused / needs_trustee / cooldown / safe, reasons, unlockAt, paymentId}` |
| `POST /payments/:id/send` `{tx}` | Re-checks, then relays via the Privy signer with `sponsor: true`. Returns `{txHash}` |
| `POST /payments/:id/approval` `{requestKey}` | Verifies the `trustee_decision` on Arkiv (D5), then marks the payment allowed or still in cooldown |
| `POST /onboarding/user` | Creates the user row and tops up tGLM |
| `POST /onboarding/invite` `{trusteeEmail or trusteePhone}` | Required step; sends the invite |
| `POST /pairs/accept` `{pairId, pairKeyAddress, encPubKey}` | Trustee accepts; tops up the per-pair key with tGLM |
| `POST /push/register`, `POST /push/unregister` `{expoToken}` | Saves / removes the push token (call on login / logout) |
| `GET /rules` | The user's rules and the trustee's change history (read-only for the user) |
| `GET /trustee/users`, `PATCH /trustee/users/:pairId/rules` `{amountLimit?, notifyMode?}` | Trustee only: list who they protect, change their rules (applies at once) |

### 3. `packages/arkiv` (D owns) [draft]

| Function | Used by |
|---|---|
| Schemas: `ApprovalRequest`, `TrusteeDecision`, `ScamReport` (`defineSchema`) | Everyone |
| `createApprovalRequest(walletClient, {pairId, kind, sealed})` | App (user) |
| `createDecision(pairKeyClient, {pairId, requestKey, verdict, intentHash, validFrom})` | App (trustee) |
| `createScamReport(client, {address, source, category, reason})` | App (trustee), importer |
| `queryPendingRequests(client, pairIds, {createdBy})` | Trustee app |
| `getDecision(client, requestKey, pairKey)` (by creator) | Backend verify |
| `queryReports(address, trustedCreators)` → `{verified, unverified}` | Backend rules, app warnings |
| `seal(payload, trusteePubKey)` / `open(sealed, encSecretKey)` (tweetnacl) | App |
| `derivePairKey(signature)` / `deriveEncKey(signature)` | App (B passes in the Privy signature) |

### 4. Supabase tables (C owns) [draft]
`users`, `pairs` (`pair_id`, user, trustee, `pair_key_address`, `trustee_enc_pubkey`, status), `invites`, `rules` (limit default 100, `notify_mode` = `first_per_payee` / `every_time`, `first_payment_done`), `payees` (`first_attempt_at`, `cleared_at`), `payments` (verdict, `request_key`, `decision_key`, `used`, `tx_hash`), `push_tokens`, `scam_reports_archive`.

---

## A: UI person

Screens, all in Expo against mocked hooks:
- [ ] Onboarding: login (Google or phone), **required** trustee contact step, waiting for the trustee to accept
- [ ] Home: USDC balance, recent payments
- [ ] Send: recipient + amount, then one screen for each result: **sent**, **refused ($10 first-payment cap)**, **cooldown (unlocks at …)**, **needs trustee**
- [ ] Warning for a flagged address: shows verified vs unverified reports and the reason
- [ ] The 3 scam questions
- [ ] Waiting for trustee: 30-min countdown; then allowed (with a 24h unlock time if the payee is new), denied, or expired
- [ ] Trustee: accept invite, alerts list, context card (amount, payee, answers, why flagged), **Allow once / Deny & report**
- [ ] Settings: limit and toggle (trustee edits; read-only for the user), export-key request
- [ ] Copy for the push notification. It must carry no payment details.

Done when: every screen works on mocks, and swapping a hook's implementation needs no screen changes.

## B: Wallet person

- [ ] **Day-1 test:** Privy Expo embedded wallet on the custom Rabdi chain (ID 7794095): get the provider, switch chain, send one Arkiv write via `custom(provider)`. Pair with D. **If this fails, D1 changes, so tell everyone immediately.**
- [ ] **Day-1 test, with C:** add the backend signer (`useSigners().addSigners`) with a policy that only allows USDC `transfer` on Ethereum Sepolia, then have C send one sponsored transfer. Confirm the TEE setting works with Expo.
- [ ] Privy login: Google + phone, one embedded wallet per person
- [ ] Chains: Ethereum Sepolia + Rabdi; test USDC address taken from Circle's docs
- [x] Build the USDC `transfer` tx for `POST /payments/:id/send`
- [x] Privy `signMessage` for the two derivations (pair key, encryption key), using D's functions
- [ ] Key export gated behind an approved `export` request (shows "Coming soon" for now)
- [ ] Real implementations of `useAuth`, `useBalance`, and the signing parts of the other hooks

Done when: a fresh phone can log in, see its USDC, and write to Arkiv. The backend can send a sponsored payment from that wallet, and the signer policy rejects anything that isn't a USDC transfer.

## C: Backend + Supabase person

- [ ] Supabase project, migrations for the tables above, row-level security so users only see their own rows
- [ ] Privy server setup: key quorum for the signer, the signer policy (with B), gas sponsorship enabled on the Dashboard
- [x] `POST /payments/check`: the D3 rules in order: $10 first-payment cap → flagged (D's `queryReports` + GoPlus + look-alike) → over limit + toggle → new-payee 24h cooldown
- [x] `POST /payments/:id/send`: re-check, then relay with `sponsor: true`; mark approvals as used
- [x] `POST /payments/:id/approval`: verify via D's `getDecision` (creator = `pair_key_address`, `intentHash`, `validFrom`, expiry, unused)
- [x] Onboarding and invites (email through Brevo), pair accept, tGLM top-ups
- [x] Expo push sender: trustee on request attach; user on accept, trustee answer and rule change
- [x] Rules endpoints: trustee-only edits, applied at once; user reads rules + history

Done when: the full flow works through the API using a test script, without the app.

## D: Arkiv person

- [ ] **Day-1 test with B:** Rabdi write from the Privy wallet (see B)
- [x] `packages/arkiv`: the schemas with indexed fields exactly as in decisions doc §3, plus every helper above
- [x] Scam reports created with `permissionlessExtension`; 180-day expiry; trusted-creator filtering
- [x] Encryption helpers (tweetnacl `box`) and the key derivations
- [x] Backend jobs: **report mirror** (to Supabase) and **renewer** (extends live reports before they expire), hourly on Supabase Cron
- [ ] **Importer** (OFAC + other lists, from the seed wallet): built (`services/backend/jobs/arkiv-importer.ts`), not run yet
- [ ] Judging files: `/arkiv/schema.md`, `friction.md` (log friction as you hit it, with reproduction steps), `reach.md`, `why-arkiv.md`, `how-you-use-arkiv.md`
- [ ] README: the wallet addresses that wrote entities, and one query judges can run

Done when: a judge can run the README query and see real reports, and every judging file answers its questions with links or numbers.

---

## Order of work

1. **Start:** agree the three interfaces above. B + D and B + C run the day-1 tests. A starts screens on mocks.
2. **Safe payment end to end:** login → check → sponsored send. (A, B, C)
3. **Trustee flow end to end:** request → push → decrypt → decide → verify → send after any cooldown. (everyone)
4. **Scam reports:** deny & report, importer, warnings for verified vs unverified, mirror and renewer. (C, D, A)
5. **Submission:** judging files, README, demo recording. (D leads; everyone reviews)

## Open items, each with an owner

| Item | Owner |
|---|---|
| The wording of the 3 scam questions | A, team agrees |
| Which "older lists" to import besides OFAC | D |
| Can a user remove the backend signer, and what does the app do then? | B |
| Key export: coming soon (needs Privy's hosted export page) | B |
| Arkiv access key in a mobile app (it can be extracted); note this in `friction.md` | D |
| Where the backend is hosted: **decided**, Supabase Edge Functions + Supabase Cron | C |
| How invites are sent: **decided**, email through Brevo, link to getnod.pages.dev/invite | C |

## Submission requirements (D checks before submitting)

- [ ] Public repo with an open-source license
- [ ] README: entity-writing wallet addresses, one query to run, how AI was used
- [ ] `/arkiv/schema.md` and the four criterion files
- [ ] At least one user-facing feature reads from Arkiv (warnings, trustee alerts)
