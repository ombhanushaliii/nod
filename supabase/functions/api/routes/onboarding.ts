// Onboarding (D7): register the user's wallet, invite the trustee by email,
// and let the trustee look up and accept the invite.
import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, fail, type HttpStatus, requireUser } from "../lib/http.ts";
import { randomHex32, randomToken, sha256Hex } from "../lib/crypto.ts";
import { RepoError, type InviteError } from "../lib/repo.ts";
import type { ArkivFunder, Mailer, PrivyApi } from "../lib/services.ts";
import { body, evmAddress, hex32 } from "../lib/validate.ts";

export type OnboardingDeps = {
  privy: PrivyApi;
  mailer: Mailer;
  funder: ArkivFunder;
  // The invite token is appended, e.g. "myapp://invite/" or "https://.../invite/".
  inviteUrlBase: string;
};

const INVITE_DAYS = 7;

const inviteStatus: Record<InviteError, [HttpStatus, string]> = {
  pair_active: [409, "You already have an active trustee."],
  invite_not_found: [404, "This invite doesn't exist."],
  invite_used: [410, "This invite was already used."],
  invite_expired: [410, "This invite has expired."],
  self_trustee: [409, "You can't be your own trustee."],
};

function mapRepoError(err: unknown): never {
  if (err instanceof RepoError) {
    const [status, message] = inviteStatus[err.code];
    fail(status, err.code, message);
  }
  throw err;
}

export function onboardingRoutes(deps: OnboardingDeps) {
  const r = new Hono<AppEnv>();

  // Register the caller's Privy embedded wallet. Idempotent.
  r.post("/onboarding/user", async (c) => {
    const { walletAddress } = await body(c, z.object({ walletAddress: evmAddress }));

    const existing = await c.var.repo.findUserByPrivyId(c.var.privyUserId);
    if (existing) {
      if (existing.wallet_address !== walletAddress) fail(409, "wallet_mismatch", "This account is registered with another wallet.");
      return c.json({ user: existing, created: false });
    }

    // Prove the wallet belongs to this Privy user before trusting it.
    const owned = await deps.privy.embeddedEthWallets(c.var.privyUserId);
    if (!owned.includes(walletAddress)) fail(403, "wallet_not_owned", "That wallet isn't this user's Privy embedded wallet.");
    if (await c.var.repo.findUserByWallet(walletAddress)) fail(409, "wallet_taken");

    const user = await c.var.repo.createUser(c.var.privyUserId, walletAddress);
    await deps.funder.fund(walletAddress);
    return c.json({ user, created: true }, 201);
  });

  // Required onboarding step: invite the trustee by email. Calling again re-sends
  // with a fresh link (the old link stops working).
  r.post("/onboarding/invite", async (c) => {
    const user = await requireUser(c);
    const { trusteeEmail } = await body(c, z.object({ trusteeEmail: z.string().trim().toLowerCase().email() }));

    const token = randomToken();
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 3600 * 1000);
    await c.var.repo.createInvite({
      userId: user.id, pairId: randomHex32(), contact: trusteeEmail,
      tokenHash: await sha256Hex(token), expiresAt,
    }).catch(mapRepoError);

    try {
      await deps.mailer.sendTrusteeInvite(trusteeEmail, deps.inviteUrlBase + token);
    } catch (err) {
      console.error(err);
      fail(502, "email_failed", "The invite was saved but the email didn't send. Try again.");
    }
    return c.json({ sent: true, expiresAt: expiresAt.toISOString() });
  });

  // Trustee opens the invite link: returns the pairId they need to derive
  // their per-pair key (D5) before accepting.
  r.get("/invites/:token", async (c) => {
    await requireUser(c);
    const invite = await c.var.repo.findInvite(await sha256Hex(c.req.param("token")));
    if (!invite) fail(404, "invite_not_found", inviteStatus.invite_not_found[1]);
    if (!invite.usable) fail(410, "invite_unusable", "This invite was used or has expired.");
    return c.json({ pairId: invite.pairId, expiresAt: invite.expiresAt });
  });

  r.post("/pairs/accept", async (c) => {
    const trustee = await requireUser(c);
    const { token, pairKeyAddress, encPubKey } = await body(c, z.object({
      token: z.string().min(1),
      pairKeyAddress: evmAddress,
      encPubKey: hex32,
    }));
    // The per-pair key must not be the trustee's main wallet, or the link leaks (D5).
    if (pairKeyAddress === trustee.wallet_address) fail(422, "pair_key_is_main_wallet");

    const pairId = await c.var.repo.acceptInvite({
      tokenHash: await sha256Hex(token), trusteeId: trustee.id, pairKeyAddress, encPubKey,
    }).catch(mapRepoError);

    await deps.funder.fund(pairKeyAddress);
    return c.json({ pairId });
  });

  return r;
}
