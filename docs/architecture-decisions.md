# Architecture decisions

Source of truth for the architecture diagram and the `/arkiv/*.md` judging files.
Target: **Arkiv "Build on Arkiv (from scratch)" track** only.

Status legend: **[team]** = decided by the team · **[proposed]** = derived from team decisions, open to change.

---

## 1. Pieces

| Piece | What it does | Tech | Status |
|---|---|---|---|
| Wallet app (user view) | Send money, warnings, the 3 scam questions | React Native (Expo) | [team] |
| Wallet app (trustee view) | Push alert, context card, Allow once / Deny & report | Same React Native app | [team] |
| Login + wallet | Google or phone login, embedded wallet, no seed phrase | Privy | [team] |
| Payment chain | Holds the money; USDC transfers, gas sponsored by Privy and sent by the backend | Base Sepolia, test USDC | [team] |
| Smart contract | **None** | — | [team] |
| Shared, expiring data | Approval requests, trustee decisions, live scam reports | Arkiv (Rabdi testnet, `@arkiv-network/sdk`) | [team] |
| Permanent data | Users, user–trustee link, rules, push tokens, scam report archive | Supabase | [team] |
| Backend | Payment checks, trustee push, report mirror + renewer, list importer, tGLM top-up | Node service | [team] |
| Live address check | Risk lookup for unknown addresses | GoPlus API, called by the backend | [team] |
| Encryption | Request details readable only by the trustee | tweetnacl `box` (x25519) | [team] |
| Optional | Verified-human trustees; report evidence files | World ID, Swarm (drawn dashed) | [from original plan] |

## 2. Key decisions and why

### D1. Each person's own Privy wallet owns their Arkiv entities. [team]
- One Privy embedded wallet per person, with the same address on Base Sepolia and Arkiv. **[proposed]**
- The backend tops up new wallets with a little tGLM, so nobody sees a faucet. **[team]**
- Why: the backend can never forge a user's request or a trustee's decision. Arkiv's owner field proves who wrote what.
- Verified in docs: the Arkiv SDK wallet client accepts an EIP-1193 provider (`custom(provider)`), and Privy Expo provides one (`wallet.getProvider()`). **Still to test:** Privy on the custom Rabdi chain (ID 7794095).

### D2. The backend decides, the app obeys, and no contract. [team]
- The app sends the recipient and amount to the backend. The backend runs every check and answers `safe` or `needs_trustee`. When the answer allows it, the backend itself sends the payment as a signer on the user's wallet (D3a).
- For an approved payment, the backend also verifies the trustee decision on Arkiv before answering `safe` (D5).
- **Known limit, stated openly:** the user still owns their wallet, so a modified app could sign a transfer itself and skip the backend. Since D3a this is much harder: the wallet holds no ETH for gas, so the user would have to fund it with ETH first.
- **Mitigation [team]:** key export is itself an approval request (`kind = export`). The app only shows Privy's export screen after the trustee allows it.

### D3. Payment rules the backend applies, in order. [team]
The backend answers one of: `refused`, `needs_trustee`, `cooldown`, `safe`.

1. **First payment cap.** The wallet's first-ever payment can't exceed **$10**. Over that → `refused`. **[team]**
2. **Flagged payee → trustee must approve.** Any of these flags it:
   - Arkiv scam report for the recipient (`address = <recipient>`). Only **verified** reports count (creator = our seed wallet or a trustee-decision key); the rest show as "unverified". **[proposed]**: Arkiv's docs say to filter by owner or creator when you need to trust data, and this stops spam reports against busy addresses from flooding trustees.
   - GoPlus risk lookup.
   - Look-alike of a past recipient.
   - A reported address is never hard-blocked: **warn + trustee must approve. [team]**
3. **Over the amount limit → trustee must approve. [team]** The limit is **$100** by default, or whatever the trustee set. The trustee also sets a toggle **[team]**:
   - `first_per_payee`: only the first over-limit payment to each payee needs approval.
   - `every_time`: every over-limit payment needs approval.
4. **New payee → 24h cooldown. [team]** Applies even after the trustee allows the payment:
   - After a trustee Allow: the 24h starts at the Allow. **[team]**
   - With no trustee involved (the payee passed every check and is under the limit): the 24h starts at the first attempt to pay that payee. **[proposed, read from the team's wording]**
   - A new payee alone no longer needs the trustee. **[team, changed from the original plan]**
5. Otherwise → `safe`.

- Who can change the rules: **only the trustee**, and their change applies at once. The user can see the rules and a history of the trustee's changes, but can't change them or propose changes, not even to tighten them. **[team]**
- Where they live: rules, the known-payee list and pending cooldowns are kept in Supabase. They're private to the user, so they stay off Arkiv.
- Payment asset: **test USDC on Base Sepolia. [team]** Limits are compared directly in USDC (1 USDC = $1), so no price feed is needed. Payments are ERC-20 `transfer` calls.

### D3a. Gas on Base Sepolia: Privy gas sponsorship, sent from the backend. [team: Privy sponsorship]
- Privy's "App pays" mode covers gas on Base Sepolia (listed in Privy's docs). Users never hold ETH.
- **Constraint from Privy's docs:** `sponsor: true` is supported in the React (web) SDK and the server SDKs, **not React Native / Expo**. Privy's advice for mobile is to build the transaction in the app and relay it through your server with `sponsor: true`. So the app builds the USDC transfer and the **backend submits it** via Privy's server API after the D3 rules pass.
- Side effect, a real improvement over D2's known limit: user wallets hold no ETH, so they can't easily send USDC outside the backend. A user would have to fund the wallet with ETH themselves to bypass the rules.
- Other requirements from Privy's docs: wallets use TEE execution, and sponsorship upgrades wallets via EIP-7702. Enable it on the Dashboard's Fee sponsorship page. The cost is the gas plus a convenience fee (billed prepaid or postpaid).
- Arkiv is not covered: Privy sponsorship doesn't support custom chains, so the backend still tops up tGLM (D1).
- **The backend is a signer on each user's wallet. [team]**
  - At onboarding, the app calls `addSigners` from `useSigners` in `@privy-io/expo`. The signer is the backend's key quorum, configured in the Privy Dashboard.
  - The backend then sends USDC transfers through Privy's server API with `sponsor: true`, only after the D3 rules pass (or the trustee decision verifies).
  - Privy's docs say signers never see the private key; signing happens in Privy's secure enclave.
  - **Signer policy [proposed]:** attach a policy (`policyIds`) that only allows `transfer` calls to the test USDC contract on Base Sepolia, so a leaked backend key can't do anything else with the wallet. Important: per Privy's docs, on React and React Native **no policy applies to the signer if none is given**, so this must be set explicitly.
  - **Trade-off, stated openly:** within that policy, the backend can move a user's USDC to any address. The backend is now a trusted party for user funds, which is the cost of "the backend decides". Payees vary, so the policy can't restrict recipients.
  - Open: whether the user can remove the signer, and what the app shows if they do. Privy's add-signer page doesn't say.

### D4. Approval request = Arkiv entity, owned by the user, expires in 30 min, encrypted. [team]
- `kind`: `payment` | `export`. **[proposed]** (No `rules` kind: the user can't ask to change rules.)
- The payload (amount, recipient, the user's answers to the 3 questions, the reason it was flagged) is **encrypted to the trustee** with tweetnacl `box`.
- Why Arkiv: the trustee's app and the backend find it with one query. It disappears on its own when stale, so no cleanup job is needed.

### D5. Trustee decision = separate Arkiv entity, owned by a per-pair trustee key. [team: the link must stay hidden]
- Arkiv only lets the owner change an entity, so the trustee writes their own decision entity instead of editing the request.
- **Per-pair key [proposed mechanism]:** for each user the trustee protects, the trustee app derives a separate Arkiv key from a Privy signature over `"guardian-pair:" + pairId`. Its address is stored **only in Supabase**. On Arkiv, the decision owner can't be traced back to the trustee's main wallet, so the user–trustee link stays hidden, while authorship is still provable.
- The backend tops up per-pair keys with tGLM, which links nothing to the trustee.
- Allow once: carries `intentHash = hash(recipient, amount, nonce)` and `validFrom`.
  - Known payee: `validFrom` = now, expires in **1 hour**.
  - New payee: `validFrom` = Allow + 24h (cooldown), expires **25 hours** after the Allow, so there's a 1-hour window to send once the cooldown ends.
  - The backend accepts it only if: the owner is the pair key stored in Supabase, the hash matches, `validFrom` has passed, it hasn't expired, and it's unused (marked in Supabase).
- Deny & report: the decision (deny) plus a public `scam_report`, both written by the per-pair key.

### D6. Scam reports: live on Arkiv, permanent archive in Supabase. [team]
- Every report is an Arkiv entity anyone can query, so other wallets read it without our API.
- Owner = the reporter (a per-pair trustee key, or our seed wallet for imported lists like OFAC).
- Expiry 180 days (Arkiv max is about 182.5). Created with `permissionlessExtension`, so the backend renews reports still on file in Supabase. **[proposed mechanism]**
- The backend mirrors every report into Supabase as the permanent record.
- No endorsements. **[team]**

### D7. The user–trustee link and contacts live in Supabase, never on Arkiv. [team]
- Onboarding requires the trustee's email or phone. The trustee joins via Privy.
- Supabase holds: user ↔ trustee, `pairId`, the per-pair key address, and the trustee's encryption public key.

### D8. The trustee's encryption key is derived, not stored. [proposed]
- Privy wallets can't decrypt tweetnacl messages, so the trustee needs an x25519 keypair.
- It's derived from a Privy signature over a fixed message, so the same key comes back on a new phone with no extra backup. The public half is stored in Supabase.

### D9. Trustee alerts: the backend pushes when the app hands it the request. [team]
- After writing an `approval_request` to Arkiv, the app calls `POST /payments/:id/request` with its entity key. The backend checks the entity on Arkiv, maps `pairId → trustee push tokens` in Supabase, and sends an Expo push saying "a payment needs you". The push carries no details.
- The trustee app reads and decrypts the request straight from Arkiv.
- Why not poll Arkiv: a poller runs all day even when nobody is paying, and alerts lag by the poll interval. Every request has to come through `POST /payments/:id/request` anyway (the payment can't go ahead without it), so pushing there costs nothing when idle and is instant. If the app crashes before that call, it retries it, and the push goes out then.
- The user also gets a push when their trustee changes their rules.

## 3. Arkiv entities (draft for `/arkiv/schema.md`)

| Entity | Owner | Expires | Indexed (filtered on) | Stored only | Who reads it |
|---|---|---|---|---|---|
| `approval_request` | User's Privy wallet | 30 min | `pairId`, `kind`, `createdAt` | encrypted payload (bytes) | Trustee app (decrypts), backend (verifies on attach) |
| `trustee_decision` | Per-pair trustee key | Allow: 1 h (known payee) or 25 h (new payee, 24h cooldown) · Deny: 30 min | `pairId`, `requestKey`, `verdict` | `intentHash`, `validFrom`, `reportKey` | Backend (verifies), user app (shows result) |
| `scam_report` | Reporter: per-pair trustee key or our seed wallet | 180 days, extendable by anyone | `address`, `source` (`trustee` / `ofac` / `list`), `category` | reason text, evidence ref (Swarm, optional) | Our backend before every payment; any other wallet |

Example query any judge can run: `select().from(ScamReport).where(eq("address", "0x…"))`.

## 4. Kept off Arkiv, and why (for `/arkiv/why-arkiv.md`)

| Data | Where | Why not Arkiv |
|---|---|---|
| Email, phone, Google identity | Privy / Supabase | Personal data on a public chain is a privacy breach |
| User–trustee link, pairId, per-pair key address, trustee pubkey | Supabase | Private social graph (team requirement); lasts longer than the ~182-day max |
| Push tokens | Supabase | Device secrets, only the backend needs them |
| Rules, address book, used approvals | Supabase | Private and permanent |
| Scam report archive | Supabase | Permanent history beyond Arkiv expiry |
| Keys | Privy (derived keys never leave the phone) | Never stored by us |

## 5. Payment flow (diagram numbering)

1. The user enters a recipient and amount. The app asks the backend to check them.
2. The backend applies the rules in D3: first-payment cap, flags, amount limit, new-payee cooldown.
3. **Safe:** the backend sends the USDC transfer as the wallet's signer, gas sponsored by Privy, and the app shows it as sent. Done. **Cooldown:** the app shows when the payment unlocks. **Refused:** the app shows the $10 first-payment cap.
4. **Needs trustee (flagged or over limit):** the user answers the 3 questions. The app encrypts the details to the trustee's pubkey and writes an `approval_request` to Arkiv (30 min).
5. The app hands the request's key to the backend, which checks it on Arkiv and sends an Expo push to the trustee.
6. The trustee app reads and decrypts the request from Arkiv and shows the context card.
7. **Allow once:** the per-pair key writes a `trustee_decision` (allow, 1 h, `intentHash`). **Deny & report:** a `trustee_decision` (deny) plus a public `scam_report`.
8. The app asks the backend again. The backend verifies the decision (owner = pair key, hash, `validFrom`, expiry, unused). For a new payee the answer is `cooldown` until 24h after the Allow, then `safe`. The backend then sends the transfer as signer (sponsored). On deny, the app shows the denial.
9. The backend mirrors reports to Supabase and renews them on Arkiv. Every wallet now sees the report for that address.

## 6. Open items still to confirm

- Does Privy let the app hide or gate its own export-key screen? Needed for D2's mitigation.
- Privy Expo on the custom Rabdi chain (ID 7794095): needs a quick test.
- Arkiv access key in a mobile app: origin allowlisting doesn't apply to native apps, so the key would be extractable. Worth raising in `friction.md`.
- Which "older lists" to import alongside OFAC.
- Gas for USDC transfers: **decided**, Privy sponsorship relayed by the backend (D3a). Still to confirm: TEE execution works for Expo embedded wallets. The backend's permission comes from it being a signer on the user's wallet (D3a).
- The test USDC contract address: take it from Circle's docs, don't hardcode it from memory.
