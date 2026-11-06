// Routes that need no sign-in. Nothing here may reveal who someone is, or a
// pairId (it links Arkiv entities to a pair).
import { Hono } from "hono";
import type { AppEnv } from "../lib/http.ts";
import type { Repo } from "../lib/repo.ts";
import { sha256Hex } from "../lib/crypto.ts";

export function publicRoutes(repo: Repo) {
  const r = new Hono<AppEnv>();

  // For the invite web page: is this link still good? The token is 32 random
  // bytes, so it can't be guessed.
  r.get("/public/invites/:token", async (c) => {
    const invite = await repo.findInvite(await sha256Hex(c.req.param("token")));
    if (!invite) return c.json({ status: "not_found" }, 404);
    return c.json({ status: invite.usable ? "open" : "closed", expiresAt: invite.expiresAt });
  });

  return r;
}
