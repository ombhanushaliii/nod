import { assertEquals } from "@std/assert";
import { addr } from "./helpers.ts";
import { HOUR, setup, TRUSTEE, USER } from "./flow.ts";
import { summarizeReports } from "../lib/arkivLive.ts";
import { groupTrusteeReports } from "../lib/risk.ts";

const reported = (trustees: number) => ({ verified: trustees, unverified: 0, categories: ["scam"], trustees });

async function withPush() {
  const t = await setup();
  await t.call(USER, "POST", "/push/register", { expoToken: "ExponentPushToken[user]" });
  await t.call(TRUSTEE, "POST", "/push/register", { expoToken: "ExponentPushToken[trustee]" });
  return t;
}

Deno.test("trustee count: different trustees, not reports, and only trusted trustee reports", () => {
  const trusted = new Set([addr("1"), addr("2"), addr("3")]);
  const r = summarizeReports([
    { creator: addr("1"), category: "scam", source: "trustee" },
    { creator: addr("1"), category: "scam", source: "trustee" }, // same trustee again
    { creator: addr("2"), category: "scam", source: "trustee" },
    { creator: addr("3"), category: "sanctioned", source: "ofac" }, // seed import, not a trustee
    { creator: addr("9"), category: "scam", source: "trustee" }, // stranger
  ], trusted);
  assertEquals(r.trustees, 2);
});

Deno.test("1 to 4 trustees: goes to the payer's trustee, with the count", async () => {
  const t = await withPush();
  t.markPaid(addr("9"));
  t.state.reports.set(addr("9"), reported(3));
  const res = await t.call(USER, "POST", "/payments/check", { to: addr("9"), amount: "5" });
  assertEquals(res.body.verdict, "needs_trustee");
  assertEquals(res.body.reasons, ["scam_report", "reported_by_trustees", "trustee_reporters:3"]);
});

Deno.test("5 trustees: blocked, nobody can allow it, and the trustee is told once an hour", async () => {
  const t = await withPush();
  t.markPaid(addr("9"));
  t.state.reports.set(addr("9"), reported(5));
  const res = await t.call(USER, "POST", "/payments/check", { to: addr("9"), amount: "5" });
  assertEquals(res.body.verdict, "refused");
  assertEquals(res.body.reasons, ["blocked_by_trustees", "trustee_reporters:5"]);
  const toTrustee = () => t.state.pushes.filter((p) => p.message.data.type === "payment_blocked");
  assertEquals(toTrustee().length, 1);

  // Trying again soon: still blocked, no second push.
  await t.call(USER, "POST", "/payments/check", { to: addr("9"), amount: "5" });
  assertEquals(toTrustee().length, 1);
  // An hour later, the trustee hears again.
  t.state.now = new Date(t.state.now.getTime() + HOUR + 1000);
  await t.call(USER, "POST", "/payments/check", { to: addr("9"), amount: "5" });
  assertEquals(toTrustee().length, 2);

  // The trustee's feed lists the blocked attempts with the count.
  const feed = await t.call(TRUSTEE, "GET", "/trustee/blocked");
  assertEquals(feed.body.blocked.length, 3);
  assertEquals([feed.body.blocked[0].to, feed.body.blocked[0].amount, feed.body.blocked[0].reporters, feed.body.blocked[0].pairId],
    [addr("9"), "5", 5, t.pairId]);
  // The user sees none of that feed.
  assertEquals((await t.call(USER, "GET", "/trustee/blocked")).body.blocked, []);
});

Deno.test("the reported-by-trustees list: per address, newest first", async () => {
  const t = await setup();
  t.state.trusteeReported = groupTrusteeReports([
    { address: addr("a"), creator: addr("1"), at: new Date(1000) },
    { address: addr("b"), creator: addr("1"), at: new Date(3000) },
    { address: addr("a"), creator: addr("2"), at: new Date(2000) },
  ]);
  const res = await t.call(USER, "GET", "/reports/trustees");
  assertEquals(res.body.blockAt, 5);
  assertEquals(res.body.reports.map((r: { address: string; trustees: number }) => [r.address, r.trustees]), [[addr("b"), 1], [addr("a"), 2]]);
});
