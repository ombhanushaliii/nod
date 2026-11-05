# Haven — mobile app (Expo)

The wallet app for both roles. The **wallet user** and the **trustee** use the same app; after sign-in the UI switches based on which account signed in.

Privy login, wallets, balances, signing, and sponsored payments are connected. Trustee approval and some screens still use prototype data. See [wallet setup](../docs/privy-wallet.md) for configuration and integration status.

## Run it

```bash
npm install
npx expo start
```

Run `npm run web` for the website, or `npm run android` to open an installed Android development client. Privy requires native modules and does not run in Expo Go.

The app has a biometric lock on native devices. Web skips the lock.

## Demo on one phone

Set `EXPO_PUBLIC_WALLET_MODE=demo` to use the local prototype.

1. **Continue with Google** → pick **Alex Rivera** (wallet). Choose an avatar and invite a trustee (any email, e.g. `sam@gmail.com`).
2. Send money. The **Try a test address** chips trigger each rule: new person ($10 for 24h), reported scam, risky address, look-alike of Mom, unconfirmed reports.
3. For a flagged payment, answer the 3 questions and send it to the trustee.
4. Settings → **Sign out**, then sign in with the trustee account (the email you invited). Accept, set a name, and open the request from **Needs you**: **Allow once** or **Deny & report**.
5. Sign back in as Alex to see the answer.

Settings → **Demo** has **Skip 24 hours** (new people unlock) and **Restart demo**.

## How it's put together

| Path | What |
| --- | --- |
| `src/app/login.tsx` | Sign-in; the Google account picked decides the role |
| `src/app/wallet/*` | Wallet user: sign-up, home, send flow, trustee check, settings, key export |
| `src/app/trustee/*` | Trustee: invite, profile, people, person rules, request card, settings |
| `src/hooks/api.ts` | The hooks from `docs/task-split.md` (`useAuth`, `useCheckPayment`, `useDecide`, …). **Swap mocks for real calls here**; screens don't change |
| `src/data/engine.ts` | Mock of the backend payment rules (D3), ported from the prototype |
| `src/data/store.ts` | Persisted mock state shared by both roles (stands in for backend, Privy, Arkiv) |
| `src/components/AppLock.tsx` | Biometric lock on open and on return from background |

## Checks

```bash
npx tsc --noEmit
npx expo lint
```
