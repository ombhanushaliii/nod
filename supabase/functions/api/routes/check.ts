// Address check without a payment: what our scam reports and GoPlus say about
// an address, for a trustee (or anyone signed in) who wants to look one up.
import { Hono } from "hono";
import { type AppEnv, fail } from "../lib/http.ts";
import type { GoPlus, ScamReports } from "../lib/risk.ts";
import { lookAlikeOf } from "../lib/rules.ts";
import { evmAddress } from "../lib/validate.ts";

export type CheckDeps = { scamReports: ScamReports; goPlus: GoPlus };

// danger: a verified report, a GoPlus label, or a copy of an address one of
// your people paid. caution: only an unverified report, or GoPlus was down.
export type AddressVerdict = "danger" | "caution" | "clear";

export function checkRoutes(deps: CheckDeps) {
  const r = new Hono<AppEnv>();

  r.get("/address-check/:address", async (c) => {
    const parsed = evmAddress.safeParse(c.req.param("address"));
    if (!parsed.success) fail(422, "invalid_address", "Enter a 0x address with 40 letters and numbers after it.");
    const address = parsed.data;

    // A trustee also learns how it compares to what their people have paid.
    // Signed in without an account yet: just the outside checks.
    const repo = c.var.repo;
    const me = await repo.findUserByPrivyId(c.var.privyUserId);
    const people = me ? await repo.protectedUsers(me.id) : [];
    const [reports, goplus, paidLists] = await Promise.all([
      deps.scamReports.countFor(address),
      deps.goPlus.check(address),
      Promise.all(people.map((p) => repo.paidPayees(p.userId))),
    ]);
    const paid = paidLists.flat();

    // The same reason codes as the payment check, so the app words them the same way.
    const reasons: string[] = [];
    if (reports.verified > 0) {
      reasons.push("scam_report", ...(reports.categories ?? []).map((cat) => `reported:${cat}`));
    } else if (reports.unverified > 0) reasons.push("unverified_scam_report");
    const goplusChecked = !("unavailable" in goplus);
    if ("unavailable" in goplus) reasons.push("risk_check_unavailable");
    else reasons.push(...goplus.flagged.map((f) => `goplus:${f}`));
    const paidBefore = paid.some((a) => a.toLowerCase() === address);
    const lookAlike = paidBefore ? null : lookAlikeOf(address, paid);
    if (lookAlike) reasons.push("look_alike");

    const danger = reports.verified > 0 || (goplusChecked && goplus.flagged.length > 0) || !!lookAlike;
    const caution = reports.unverified > 0 || !goplusChecked;
    const verdict: AddressVerdict = danger ? "danger" : caution ? "caution" : "clear";

    return c.json({ address, verdict, reasons, paidBefore, goplusChecked });
  });

  return r;
}
