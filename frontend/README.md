# Nod — mobile app (Expo)

The wallet app for both roles. The **wallet user** and the **trustee** use the same app; after sign-in the UI switches based on which account signed in.

Live mode (`EXPO_PUBLIC_WALLET_MODE=privy`) is connected end to end:

- Privy login and wallets, USDC balance, and sponsored payments on Ethereum Sepolia, through the backend.
- Approval requests: sealed to the trustee and written to Arkiv (Rabdi) from the user's wallet.
- The trustee's side: invite link, reading and opening requests, Allow / Deny with the per-pair key, and rules.

Key export asks the trustee first, then opens Privy's export on `getnod.pages.dev/export`. Push stays off until the app has an EAS project. See [wallet setup](../docs/privy-wallet.md) for configuration, push, and what still needs a device test.

Copy `.env.example` to `.env` and fill it in. `EXPO_PUBLIC_API_URL` is the deployed API (`https://<project-ref>.supabase.co/functions/v1/api`).

## Run it

```bash
npm install
npx expo start
```

Run `npm run web` for the website, or `npm run android` to open an installed Android development client. Privy requires native modules and does not run in Expo Go.

The app has a biometric lock on native devices. Web skips the lock.

## Live: the invite link

The invite email links to `getnod.pages.dev/invite`, which opens `nod://trustee/invite?token=…`. The app keeps the token, starts sign-in on the trustee side, and shows **Accept** once signed in.

## Demo on one phone

Set `EXPO_PUBLIC_WALLET_MODE=demo` to use the local prototype.

1. **Continue with Google** → pick **Alex Rivera** (wallet). Choose an avatar and invite a trustee (any email, e.g. `sam@gmail.com`).
2. Send money. The **Try a test address** chips trigger each rule: new person ($10 for 24h), reported scam, risky address, look-alike of Mom, unconfirmed reports.
3. For a flagged payment, answer the 3 questions and send it to the trustee.
4. Settings → **Sign out**, then sign in with the trustee account (the email you invited). Accept, set a name, and open the request from **Needs you**: **Allow once**, or **Deny** (**Deny & report** when the payment was flagged).
5. Sign back in as Alex to see the answer.

Settings → **Demo** has **Skip 24 hours** (new people unlock) and **Restart demo**.

## How it's put together

| Path | What |
| --- | --- |
| `src/app/login.tsx` | Sign-in; the Google account picked decides the role |
| `src/app/wallet/*` | Wallet user: sign-up, home, send flow, trustee check, settings, key export |
| `src/app/trustee/*` | Trustee: invite, profile, people, person rules, request card, settings |
| `src/hooks/api.ts` | The user's hooks (`useAuth`, `useCheckPayment`, `useRequestApproval`, `useApprovalStatus`, …). Each one runs the demo store or the live backend |
| `src/hooks/trustee.ts` | The trustee's live hooks: `useTrusteeSync`, `useAcceptInvite`, `useLiveDecide`, `useSetLiveRules` |
| `src/wallet/approvals.ts`, `src/wallet/trustee.ts` | The approval logic for each side, as plain functions with tests |
| `src/data/engine.ts` | Mock of the backend payment rules (D3), ported from the prototype |
| `src/data/store.ts` | Persisted state. In demo mode it stands in for the backend, Privy and Arkiv |
| `src/components/AppLock.tsx` | Biometric lock on open and on return from background |

## Checks

```bash
npm run typecheck
npm run lint
npm run test:wallet
```
