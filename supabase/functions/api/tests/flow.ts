// Shared setup: a user and trustee paired through the real invite endpoints,
// plus helpers to run the trustee approval flow against a fake Arkiv.
import { assertEquals } from "@std/assert";
import { addr, hex32, makeTestApp } from "./helpers.ts";
import { intentHash } from "../lib/intent.ts";
import type { ArkivDecision } from "../lib/arkiv.ts";

export const USER = "did:privy:user";
export const TRUSTEE = "did:privy:trustee";
export const HOUR = 3600 * 1000;
export const MIN = 60 * 1000;
export const PAIR_KEY = addr("c");

// User + trustee paired through the real invite endpoints.
export async function setup() {
  const t = makeTestApp();
  t.privyWallets.set(USER, [addr("a")]);
  t.privyWallets.set(TRUSTEE, [addr("b")]);
  await t.call(USER, "POST", "/onboarding/user", { walletAddress: addr("a") });
  await t.call(TRUSTEE, "POST", "/onboarding/user", { walletAddress: addr("b") });
  await t.call(USER, "POST", "/onboarding/invite", { trusteeEmail: "t@example.com" });
  const token = t.mails[0].url.replace("guardian://invite/", "");
  const { body } = await t.call(TRUSTEE, "POST", "/pairs/accept", { token, pairKeyAddress: PAIR_KEY, encPubKey: hex32("e") });
  const pairId: string = body.pairId;
  const user = t.repo.users[0];
  // Not the first payment, so the $10 cap is out of the way.
  t.repo.payments.push({
    id: "old", userId: user.id, toAddress: addr("f"), amount: 1n, verdict: "safe", reasons: [],
    status: "sent", unlockAt: null, nonce: "0x0", approvalId: null, createdAt: new Date(0),
  });
  const markPaid = (a: string) =>
    t.repo.payees.set(`${user.id}|${a}`, {
      firstAttemptAt: new Date(t.state.now.getTime() - 72 * HOUR),
      firstPaidAt: new Date(t.state.now.getTime() - 71 * HOUR), overLimitApprovedAt: null,
    });

  // Runs check -> writes a fake Arkiv request -> attaches it.
  async function askTrustee(to: string, amount: string, requestKey = hex32("1")) {
    const check = await t.call(USER, "POST", "/payments/check", { to, amount });
    assertEquals(check.body.verdict, "needs_trustee");
    t.state.arkivRequests.set(requestKey, {
      entityKey: requestKey, owner: addr("a"), pairId, kind: "payment", createdAt: t.state.now,
    });
    const req = await t.call(USER, "POST", `/payments/${check.body.paymentId}/request`, { requestKey });
    assertEquals(req.status, 200);
    return { paymentId: check.body.paymentId as string, nonce: check.body.nonce as string, requestKey };
  }

  function decide(requestKey: string, d: Partial<ArkivDecision> & { to?: string; amount?: bigint; nonce?: string }) {
    const decision: ArkivDecision = {
      entityKey: d.entityKey ?? hex32("d"), owner: d.owner ?? PAIR_KEY, pairId: d.pairId ?? pairId, requestKey,
      verdict: d.verdict ?? "allow",
      intentHash: d.intentHash ?? (d.to ? intentHash(d.to, d.amount!, d.nonce!) : null),
      validFrom: d.validFrom ?? null, createdAt: d.createdAt ?? t.state.now,
      expiresAt: d.expiresAt ?? new Date(t.state.now.getTime() + 25 * HOUR),
    };
    t.state.arkivDecisions.push(decision);
  }

  const poll = (id: string) => t.call(USER, "POST", `/payments/${id}/approval`);
  return { ...t, pairId, markPaid, askTrustee, decide, poll };
}
