// Onboarding (D7): register the user's wallet, invite the trustee by email,
// and let the trustee look up and accept the invite.
import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, fail, requireUser } from "../lib/http.ts";
import { randomHex32, randomToken, sha256Hex } from "../lib/crypto.ts";
import { mapRepoError, statusOf } from "../lib/errors.ts";
import type { ArkivFunder, Mailer, PrivyApi } from "../lib/services.ts";
import { MESSAGES, notifyUser, type PushSender } from "../lib/push.ts";
import { body, evmAddress, hex32 } from "../lib/validate.ts";
import { formatUsdc } from "../lib/rules.ts";

export type OnboardingDeps = {
  privy: PrivyApi;
  mailer: Mailer;
  funder: ArkivFunder;
  push: PushSender;
  // The invite token is appended, e.g. "myapp://invite/" or "https://.../invite/".
  inviteUrlBase: string;
};

const INVITE_DAYS = 7;

export function onboardingRoutes(deps: OnboardingDeps) {
  const r = new Hono<AppEnv>();

  // Register the caller's Privy embedded wallet. Idempotent.
  // Best effort: a failed top-up never fails the request. The app calls
  // /onboarding/user on every sign-in, which tops up again if needed.
  // Best effort, like the top-up: a welcome email that fails never fails the request.
  const emailThem = async (privyUserId: string, send: (to: string) => Promise<void>) => {
    try {
      const to = await deps.privy.contactEmail(privyUserId);
      if (to) await send(to);
    } catch (err) {
      console.error("welcome email failed", err);
    }
  };

  const topUp = (addresses: string[]) =>
    Promise.all(addresses.map((a) => deps.funder.fund(a).catch((err) => console.error(`tGLM top-up failed for ${a}`, err))));

  r.post("/onboarding/user", async (c) => {
    const { walletAddress, username } = await body(c, z.object({
      walletAddress: evmAddress,
      // The user's @handle, for the welcome email; trustees leave it out. Checked and escaped by the mailer.
      username: z.string().max(64).optional(),
    }));

    const existing = await c.var.repo.findUserByPrivyId(c.var.privyUserId);
    if (existing) {
      if (existing.wallet_address !== walletAddress) fail(409, "wallet_mismatch", "This account is registered with another wallet.");
      // Refill the wallet and, for a trustee, their per-pair keys.
      await topUp([existing.wallet_address, ...await c.var.repo.pairKeysOfTrustee(existing.id)]);
      return c.json({ user: existing, created: false });
    }

    // Prove the wallet belongs to this Privy user before trusting it.
    const owned = (await deps.privy.embeddedEthWallets(c.var.privyUserId)).find((w) => w.address === walletAddress);
    if (!owned) fail(403, "wallet_not_owned", "That wallet isn't this user's Privy embedded wallet.");
    if (await c.var.repo.findUserByWallet(walletAddress)) fail(409, "wallet_taken");

    const user = await c.var.repo.createUser(c.var.privyUserId, walletAddress, owned.id);
    await topUp([walletAddress]);
    // Only the user's sign-up sends a username; a trustee's account gets no user welcome.
    if (username !== undefined) await emailThem(c.var.privyUserId, (to) => deps.mailer.sendWelcome(to, username));
    return c.json({ user, created: true }, 201);
  });

  // Required onboarding step: invite the trustee by email. Calling again re-sends
  // with a fresh link (the old link stops working).
  r.post("/onboarding/invite", async (c) => {
    const user = await requireUser(c);
    const { trusteeEmail, inviterName } = await body(c, z.object({
      trusteeEmail: z.string().trim().toLowerCase().email(),
      // The user's @handle, shown in the email. Checked and escaped by the mailer.
      inviterName: z.string().max(64).optional(),
    }));

    const token = randomToken();
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 3600 * 1000);
    await c.var.repo.createInvite({
      userId: user.id, pairId: randomHex32(), contact: trusteeEmail,
      tokenHash: await sha256Hex(token), expiresAt,
    }).catch(mapRepoError);

    try {
      await deps.mailer.sendTrusteeInvite(trusteeEmail, deps.inviteUrlBase + token, inviterName);
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
    if (!invite) fail(404, "invite_not_found", statusOf("invite_not_found")[1]);
    if (!invite.usable) fail(410, "invite_unusable", "This invite was used or has expired.");
    return c.json({ pairId: invite.pairId, expiresAt: invite.expiresAt });
  });

  // The user's trustee link. While invited: who was asked and until when.
  // Once active: what the app needs to write approval requests (the pairId for
  // the Arkiv entity, and the trustee's key to seal the payment details).
  r.get("/pair", async (c) => {
    const user = await requireUser(c);
    const pair = await c.var.repo.userPair(user.id);
    if (!pair) return c.json({ status: "none" });
    if (pair.status === "active") {
      return c.json({ status: "active", pairId: pair.pairId, trusteeEncPubKey: pair.trusteeEncPubKey, acceptedAt: pair.acceptedAt.toISOString() });
    }
    const expired = pair.inviteExpiresAt.getTime() <= Date.now();
    return c.json({
      status: expired ? "invite_expired" : "invited",
      contact: pair.contact,
      inviteExpiresAt: pair.inviteExpiresAt.toISOString(),
    });
  });

  // Open invites sent to the signed-in person's email, so a trustee can accept
  // in the app without opening the email link. The email comes from Privy
  // (Google-verified), never from the request, so nobody can list someone
  // else's invites. A user's own invites are left out: they can't accept them.
  const callerEmail = async (privyUserId: string) =>
    (await deps.privy.contactEmail(privyUserId))?.trim().toLowerCase() ?? null;

  // Works before the account is set up (signed in only), so the app can open a
  // newly invited trustee on the trustee side straight after their first sign-in.
  r.get("/trustee/invites", async (c) => {
    const email = await callerEmail(c.var.privyUserId);
    if (!email) return c.json({ invites: [] });
    const open = (await c.var.repo.invitesFor(email)).filter((i) => i.inviterPrivyUserId !== c.var.privyUserId);
    const invites = await Promise.all(open.map(async (i) => ({
      inviteId: i.inviteId,
      pairId: i.pairId,
      expiresAt: i.expiresAt,
      // Who sent it, so the trustee knows whose invite they're accepting. Best effort.
      from: await deps.privy.contactEmail(i.inviterPrivyUserId).catch(() => null),
    })));
    return c.json({ invites });
  });

  r.post("/pairs/accept", async (c) => {
    const trustee = await requireUser(c);
    const input = await body(c, z.object({
      // From the email link...
      token: z.string().min(1).optional(),
      // ...or from GET /trustee/invites, for an invite sent to this account's email.
      inviteId: z.string().uuid().optional(),
      pairKeyAddress: evmAddress,
      encPubKey: hex32,
    }).refine((b) => !b.token !== !b.inviteId, { message: "Send either the invite token or the invite id." }));
    const { pairKeyAddress, encPubKey } = input;
    // The per-pair key must not be the trustee's main wallet, or the link leaks (D5).
    if (pairKeyAddress === trustee.wallet_address) fail(422, "pair_key_is_main_wallet");

    let tokenHash: string;
    if (input.token) {
      tokenHash = await sha256Hex(input.token);
    } else {
      // Only an invite sent to this account's own email can be accepted by id.
      const email = await callerEmail(c.var.privyUserId);
      const invite = email ? (await c.var.repo.invitesFor(email)).find((i) => i.inviteId === input.inviteId) : undefined;
      if (!invite) fail(404, "invite_not_found", statusOf("invite_not_found")[1]);
      tokenHash = invite.tokenHash;
    }

    const pairId = await c.var.repo.acceptInvite({
      tokenHash, trusteeId: trustee.id, pairKeyAddress, encPubKey,
    }).catch(mapRepoError);

    await topUp([pairKeyAddress]);
    // Tell the user, so their app doesn't have to keep asking. Never throws.
    const userId = await c.var.repo.pairUserId(pairId);
    if (userId) await notifyUser(c.var.repo, deps.push, userId, MESSAGES.trusteeAccepted());
    if (userId) {
      await emailThem(c.var.privyUserId, async (to) =>
        deps.mailer.sendTrusteeWelcome(to, formatUsdc((await c.var.repo.getRules(userId)).amountLimit)));
    }
    return c.json({ pairId });
  });

  return r;
}
