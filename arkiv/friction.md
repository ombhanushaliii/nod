# What we'd improve in Arkiv

Three things got in our way while building Nod. Here's what we expected, what actually happened, and what would help.

## 1. Anonymous reads get rate limited, and the error is hard to use

**What we expected:** documented limits, and a clear error saying we were rate limited and when to try again.

**What happened:** the trustee app's query to Arkiv failed with HTTP 429 `ANON_COST_LIMITED`. viem passed it on as a generic "HTTP request failed" that included the whole request body, so our app showed a wall of JSON on screen until we noticed and caught it.

**How to reproduce:** from a mobile app with no access key, run `queryPendingRequests` a few dozen times within a few minutes. Reloading the app and coming back to it a few times is enough.

**What would help:** publish the limits, send a `Retry-After` header, give the error its own code in the SDK, and offer free read keys for apps.

## 2. The 182.5 day maximum expiry means extra infrastructure for anything permanent

Scam reports have to outlive that limit. To keep them, we run a Postgres archive plus an hourly job that renews reports on Arkiv before they expire.

`permissionlessExtension` also has to be set when an entity is created. It can't be added later, so a report created without it can never be renewed by our backend.

**What would help:** a "keep forever" option, or a way to turn on extension after an entity exists.

## 3. Every writer needs tGLM

Privy's gas sponsorship doesn't work on custom chains like Rabdi (chain ID 7794095). So our backend tops up every user's wallet and every per-pair trustee key itself.

The app finds out a wallet has run out of gas by matching the text "insufficient funds" in the error, then tops it up and tries again.

**What would help:** a paymaster or sponsored writes, and a proper out-of-gas error code.
