// Payment rules (D3): the amount limit and the over-limit toggle. Only the
// trustee changes them, and changes apply at once. The user can read them but
// can't change or propose changes. The $10 first-payment cap is fixed.
import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, fail, requireUser } from "../lib/http.ts";
import { mapRepoError } from "../lib/errors.ts";
import type { Rules } from "../lib/repo.ts";
import { FIRST_PAYMENT_CAP, formatUsdc, parseUsdc } from "../lib/rules.ts";
import { body, hex32 } from "../lib/validate.ts";

const HISTORY_LIMIT = 20;

const notifyMode = z.enum(["first_per_payee", "every_time"]);

const show = (r: Rules) => ({ amountLimit: formatUsdc(r.amountLimit), notifyMode: r.notifyMode });

export function rulesRoutes() {
  const r = new Hono<AppEnv>();

  // The user's own rules, plus what their trustee changed.
  r.get("/rules", async (c) => {
    const user = await requireUser(c);
    const v = await c.var.repo.rulesView(user.id, HISTORY_LIMIT);
    return c.json({
      ...show(v),
      firstPaymentCap: formatUsdc(FIRST_PAYMENT_CAP),
      editableBy: "trustee",
      setByTrustee: v.setByTrustee,
      updatedAt: v.updatedAt.toISOString(),
      history: v.history.map((h) => ({ from: show(h.from), to: show(h.to), at: h.at.toISOString() })),
    });
  });

  r.patch("/rules", () => fail(403, "rules_trustee_only", "Only your trustee can change these rules."));

  // For the trustee app: everyone this person protects, with their rules.
  r.get("/trustee/users", async (c) => {
    const me = await requireUser(c);
    const list = await c.var.repo.protectedUsers(me.id);
    return c.json({ users: list.map((u) => ({ pairId: u.pairId, walletAddress: u.walletAddress, ...show(u.rules) })) });
  });

  r.patch("/trustee/users/:pairId/rules", async (c) => {
    const me = await requireUser(c);
    const pairId = hex32.safeParse(c.req.param("pairId"));
    if (!pairId.success) fail(404, "not_your_pair", "You're not this user's trustee.");
    const input = await body(c, z.object({
      // USDC as a decimal string, e.g. "250".
      amountLimit: z.string().optional(),
      notifyMode: notifyMode.optional(),
    }).strict());
    if (input.amountLimit === undefined && input.notifyMode === undefined) {
      fail(422, "nothing_to_change", "Send amountLimit, notifyMode, or both.");
    }
    let amountLimit: bigint | null = null;
    if (input.amountLimit !== undefined) {
      amountLimit = parseUsdc(input.amountLimit);
      if (amountLimit === null) fail(422, "invalid_amount", "The limit must be a positive USDC value with at most 6 decimals.");
    }

    const rules = await c.var.repo.setRules(pairId.data, me.id, {
      amountLimit, notifyMode: input.notifyMode ?? null,
    }).catch(mapRepoError);
    return c.json(show(rules));
  });

  return r;
}
