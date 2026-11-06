# What to improve in Arkiv

## 1. Anonymous reads get rate limited, and the error isn't usable

- **Expected:** documented limits, and a clear "rate limited, retry after N seconds" error.
- **What happened:** the trustee app's query to Arkiv failed with HTTP 429 `ANON_COST_LIMITED`. viem passed it on as a generic "HTTP request failed" with the whole request body inside, so our app showed a wall of JSON on screen until we caught it.
- **How to reproduce:** from a mobile app with no access key, run `queryPendingRequests` a few dozen times in a few minutes. Reloading the app and coming back to it a few times is enough.
- **Ask:** publish the limits, send `Retry-After`, give this error its own code in the SDK, and offer free read keys for apps.

## 2. The 182.5 day maximum expiry means extra infrastructure for anything permanent

- Scam reports need to outlive that. We run a Postgres archive plus an hourly job that renews reports on Arkiv before they expire.
- `permissionlessExtension` has to be set when the entity is created. It can't be added later, so a report created without it can never be renewed by our backend.
- **Ask:** a "keep forever" option, or a way to turn on extension later.

## 3. Every writer needs tGLM

- Privy's gas sponsorship doesn't support custom chains like Rabdi (7794095), so our backend tops up every user's wallet and every per-pair trustee key itself.
- The app only finds out a wallet is out of gas by matching "insufficient funds" in the error text. Then it tops the wallet up and tries again.
- **Ask:** a paymaster or sponsored writes, and a proper out-of-gas error code.
