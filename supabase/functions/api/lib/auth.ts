// Checks the Privy access token on every protected request.
// Per Privy's docs: ES256, issuer "privy.io", audience = app ID, sub = user DID,
// verified with the PEM public key from the Privy Dashboard.
import { createMiddleware } from "hono/factory";
import { importSPKI, jwtVerify } from "jose";
import { type AppEnv, fail } from "./http.ts";

export type PrivyAuthConfig = {
  appId: string;
  // PEM string from the Dashboard, or an already imported key (used in tests).
  verificationKey: string | CryptoKey;
};

export function privyAuth(config: PrivyAuthConfig) {
  let key: Promise<CryptoKey> | undefined;
  const getKey = () =>
    key ??= typeof config.verificationKey === "string"
      ? importSPKI(config.verificationKey, "ES256")
      : Promise.resolve(config.verificationKey);

  return createMiddleware<AppEnv>(async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) fail(401, "missing_token", "Send the Privy access token as a Bearer token.");

    let sub: string | undefined;
    try {
      const { payload } = await jwtVerify(token, await getKey(), {
        issuer: "privy.io",
        audience: config.appId,
        algorithms: ["ES256"],
      });
      sub = payload.sub;
    } catch {
      // Expired tokens land here too; the app refreshes with getAccessToken and retries.
      fail(401, "invalid_token");
    }
    if (!sub) fail(401, "invalid_token");

    c.set("privyUserId", sub);
    await next();
  });
}
