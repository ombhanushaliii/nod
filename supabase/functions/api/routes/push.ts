// The app registers its Expo push token after login, and removes it on logout.
import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, requireUser } from "../lib/http.ts";
import { EXPO_TOKEN_RE } from "../lib/push.ts";
import { body } from "../lib/validate.ts";

const tokenBody = z.object({ expoToken: z.string().regex(EXPO_TOKEN_RE, "Not an Expo push token.") });

export function pushRoutes() {
  const r = new Hono<AppEnv>();

  // Idempotent. If another account used this device before, the token moves
  // to this one, so the old account stops getting this phone's alerts.
  r.post("/push/register", async (c) => {
    const user = await requireUser(c);
    const { expoToken } = await body(c, tokenBody);
    await c.var.repo.registerPushToken(user.id, expoToken);
    return c.json({ ok: true });
  });

  r.post("/push/unregister", async (c) => {
    const user = await requireUser(c);
    const { expoToken } = await body(c, tokenBody);
    await c.var.repo.removePushToken(user.id, expoToken);
    return c.json({ ok: true });
  });

  return r;
}
