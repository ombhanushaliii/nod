# Haven — mobile app (Expo)

The wallet app for both roles. The **wallet user** and the **trustee** use the same app; the UI switches after sign-in based on which account signed in.

Frontend only for now: every backend, wallet and Arkiv call is mocked locally, so the whole flow can be demoed on one phone. The design this is built from is [`Wallet Prototype v3.dc.html`](./Wallet%20Prototype%20v3.dc.html).

## Run it

```bash
npm install
npx expo start
```

Then scan the QR code with Expo Go (Android) or the Camera app (iOS), or press `i` / `a` for a simulator.

Face ID needs a development build (`npx expo run:ios`); in Expo Go on iOS the lock falls back to the device passcode. Fingerprint works in Expo Go on Android.

## Checks

```bash
npx tsc --noEmit
npx expo lint
```
