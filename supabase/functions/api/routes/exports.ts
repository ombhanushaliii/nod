// Key export (D2): exporting the wallet key is itself a trustee approval.
//
//   POST /exports               the user asks; returns the nonce the Allow is bound to
//   POST /exports/:id/request   the app wrote the sealed request on Arkiv; push the trustee
//   POST /exports/:id/approval  has the trustee answered? (verified on Arkiv)
//   POST /exports/claim         the export page uses up an Allow, once, before
//                               showing Privy's export
//
// The backend never sees the key: Privy's own export screen shows it on the
// export page. All this decides is whether that page may open it.
import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, fail, requireUser } from "../lib/http.ts";
import { randomHex32 } from "../lib/crypto.ts";
import { mapRepoError } from "../lib/errors.ts";
import { checkExportDecision, REQUEST_TTL_MS } from "../lib/approval.ts";
import type { ArkivApprovals } from "../lib/arkiv.ts";
import { MESSAGES, notifyUser, type PushSender } from "../lib/push.ts";
import type { ActivePair, KeyExport, Repo } from "../lib/repo.ts";
import { body, hex32 } from "../lib/validate.ts";

export type ExportDeps = {
  arkiv: ArkivApprovals;
  push: PushSender;
  now?: () => Date;
};

export type ExportView = { status: string; validFrom: string | null; validUntil: string | null };

// Reads the trustee's decision for an export from Arkiv, checks it, and
// records it. Used by the user's poll and by POST /trustee/decisions.
export async function syncExportDecision(
  deps: ExportDeps, repo: Repo, exp: KeyExport, pair: ActivePair | null, wallet: string,
): Promise<ExportView> {
  const now = (deps.now ?? (() => new Date()))();
  if (exp.status !== "awaiting_trustee") return { status: exp.status, validFrom: null, validUntil: null };
  const approval = exp.approvalId ? await repo.getApproval(exp.approvalId) : null;
  if (!approval || !pair) fail(409, "no_active_trustee");

  const decision = await deps.arkiv.findDecision(approval.requestKey, pair.pairKeyAddress);
  if (!decision) {
    if (now.getTime() > approval.createdAt.getTime() + REQUEST_TTL_MS) {
      await repo.expireExport(exp.id);
      return { status: "expired", validFrom: null, validUntil: null };
    }
    return { status: "awaiting_trustee", validFrom: null, validUntil: null };
  }

  const check = checkExportDecision({
    decision, pairId: pair.pairId, now, requestAttachedAt: approval.createdAt,
    export: { wallet, nonce: exp.nonce },
  });
  if (!check.ok) fail(409, check.reason, "The trustee's decision doesn't match this export.");

  const status = await repo.recordExportDecision(exp.id, {
    decisionKey: decision.entityKey,
    verdict: check.verdict,
    validFrom: check.verdict === "allow" ? check.validFrom : null,
    validUntil: check.verdict === "allow" ? check.validUntil : null,
  }).catch(mapRepoError);
  return {
    status,
    validFrom: check.verdict === "allow" ? check.validFrom.toISOString() : null,
    validUntil: check.verdict === "allow" ? check.validUntil.toISOString() : null,
  };
}

export function exportRoutes(deps: ExportDeps) {
  const r = new Hono<AppEnv>();

  r.post("/exports", async (c) => {
    const user = await requireUser(c);
    if (!(await c.var.repo.hasActivePair(user.id))) {
      fail(409, "no_active_trustee", "Your trustee has to be set up before you can export your key.");
    }
    const nonce = randomHex32();
    const { id } = await c.var.repo.createExport(user.id, nonce);
    return c.json({ exportId: id, nonce }, 201);
  });

  // The export page: is there an Allow it may use? Uses it up, once.
  // Registered before /exports/:id so "claim" is never read as an id.
  r.post("/exports/claim", async (c) => {
    const user = await requireUser(c);
    const exportId = await c.var.repo.claimExport(user.id).catch(mapRepoError);
    return c.json({ exportId });
  });

  r.post("/exports/:id/request", async (c) => {
    const user = await requireUser(c);
    const { requestKey } = await body(c, z.object({ requestKey: hex32 }));
    const repo = c.var.repo;

    const exp = await repo.getExport(c.req.param("id"), user.id);
    if (!exp) fail(404, "export_not_found");
    const pair = await repo.getActivePair(user.id);
    if (!pair) fail(409, "no_active_trustee", "Your trustee hasn't accepted the invite yet.");

    const req = await deps.arkiv.getRequest(requestKey);
    if (!req) fail(404, "request_not_on_arkiv", "Arkiv doesn't have that request yet. Retry in a few seconds.");
    if (req.owner.toLowerCase() !== user.wallet_address) fail(403, "request_not_yours");
    if (req.pairId.toLowerCase() !== pair.pairId.toLowerCase()) fail(422, "request_pair_mismatch");
    if (req.kind !== "export") fail(422, "request_wrong_kind");

    await repo.attachExportRequest(exp.id, user.id, requestKey).catch(mapRepoError);
    await notifyUser(repo, deps.push, pair.trusteeId, MESSAGES.exportRequest(pair.pairId));
    return c.json({
      status: "awaiting_trustee",
      expiresAt: new Date(req.createdAt.getTime() + REQUEST_TTL_MS).toISOString(),
    });
  });

  r.post("/exports/:id/approval", async (c) => {
    const user = await requireUser(c);
    const exp = await c.var.repo.getExport(c.req.param("id"), user.id);
    if (!exp) fail(404, "export_not_found");
    const pair = await c.var.repo.getActivePair(user.id);
    return c.json(await syncExportDecision(deps, c.var.repo, exp, pair, user.wallet_address));
  });

  return r;
}
