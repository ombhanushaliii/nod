# Privy wallet setup

The Android app uses `@privy-io/expo`; the website uses `@privy-io/react-auth`.
Both use the hooks in `frontend/src/hooks/api.ts`.

## Configuration

Copy `frontend/.env.example` to `frontend/.env.local`. Set:

| Variable | Value |
| --- | --- |
| `EXPO_PUBLIC_WALLET_MODE` | `privy`, or `demo` for the local prototype |
| `EXPO_PUBLIC_PRIVY_APP_ID` | Privy app ID, shared by Android and web |
| `EXPO_PUBLIC_PRIVY_CLIENT_ID` | React Native client ID; required on Android |
| `EXPO_PUBLIC_PRIVY_SIGNER_ID` | Backend key quorum ID |
| `EXPO_PUBLIC_PRIVY_SIGNER_POLICY_ID` | Policy restricting that signer to USDC transfers on Base Sepolia |
| `EXPO_PUBLIC_API_URL` | API base URL, including `/functions/v1/api` for Supabase |
| `EXPO_PUBLIC_RABDI_RPC_URL` | Rabdi RPC URL with a mobile/user access key |

Enable Google and SMS login in Privy. Configure the native client for
`com.globalmumbai.haven` and the `haven` URL scheme. Add the web development origin
(`http://localhost:8081` by default) to Privy's allowed origins and OAuth redirects.
Set the backend's `WEB_ALLOWED_ORIGINS` to the same origin. Use a comma-separated
list when you have more than one web origin.

The signer policy must allow only Base Sepolia (`eip155:84532`) transactions to
`0x036cbd53842c5426634e7929541ec2318f3dcf7e`, zero native value, and ERC-20
`transfer(address,uint256)` calldata. Deny everything else. Enable TEE wallets and
gas sponsorship in Privy. The app refuses to enroll a signer without a policy ID.

Put `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_VERIFICATION_KEY`, and
`PRIVY_AUTHORIZATION_KEY` in `supabase/functions/.env`. The secret and signing key
must never use the `EXPO_PUBLIC_` prefix. See that directory's `.env.example` for
the other backend services.

## Development

From `frontend`:

```sh
npm install
npm run web
# Or open an installed Android development client:
npm run android
```

The Android command starts Metro and opens the development client. It does not
build an APK. Privy's native modules require a development client already
installed on the device/emulator; Expo Go cannot run them.

## Implemented

- Google and phone OTP login, session restore, and logout on Android and web.
- One embedded Ethereum wallet, shared between Base Sepolia and Rabdi.
- On-chain USDC balance with loading/error states and refresh on app resume.
- Signer enrollment and wallet registration through `useWalletSetup()`.
- Backend payment check, exact USDC calldata, sponsored send, and confirmation
  polling. Retrying resumes the same payment instead of posting another send.
- `useWalletSigning().getArkivWalletClient()` for the user's Rabdi writes.
- `deriveTrusteeKeys(pairId)` using the existing Arkiv derivations. Messages are
  `guardian-pair:<lowercase pairId>` and `guardian-encryption:v1`. Keys stay in memory.

Demo and Privy data use separate storage. Switching Privy accounts clears the
previous account's local UI state. Roles select the UI; the backend authorizes
trustee operations.

## Integration still needed

The backend currently uses `noArkivApprovals`, `noScamReports`, and
`noopArkivFunder`. Connect these before testing approvals or writing on Rabdi.
Trustee/invite/rules screens still contain prototype data. Live approval and key
export actions stay blocked until the approval integration is complete.

Privy requires a hosted React page for native key export. That page and a verified,
single-use export approval are not implemented here. Demo approvals cannot unlock
a real key.

Device login, the Rabdi write, signer-policy rejection, and a sponsored transfer
need real configuration to test. Local checks do not establish those results.

## Checks

```sh
npm run typecheck
npm run lint
npm run test:wallet
```

References: [native setup](https://docs.privy.io/basics/react-native/setup),
[web setup](https://docs.privy.io/basics/react/setup),
[mobile export](https://docs.privy.io/recipes/mobile-key-export),
[Circle USDC addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses).
