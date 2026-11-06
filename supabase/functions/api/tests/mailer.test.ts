import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { brevoMailer, parseSender } from "../lib/services.ts";
import { cleanInviterName, trusteeInviteEmail } from "../lib/inviteEmail.ts";
import { trusteeWelcomeEmail, welcomeEmail } from "../lib/welcomeEmails.ts";

Deno.test("sender: 'Name <email>', quoted name, or a bare address", () => {
  assertEquals(parseSender("Nod <invites@nod.app>"), { name: "Nod", email: "invites@nod.app" });
  assertEquals(parseSender('"Nod Wallet" <a@b.co>'), { name: "Nod Wallet", email: "a@b.co" });
  assertEquals(parseSender("<a@b.co>"), { email: "a@b.co" });
  assertEquals(parseSender(" a@b.co "), { email: "a@b.co" });
  assertThrows(() => parseSender("Nod"));
  assertThrows(() => parseSender("Nod <not-an-email>"));
});

Deno.test("brevo: posts the invite to the transactional email API", async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  const mailer = brevoMailer("xkeysib-test", "Nod <invites@nod.app>", {
    fetch: (url, init) => {
      seen = { url: String(url), init: init! };
      return Promise.resolve(Response.json({ messageId: "<1@smtp-relay>" }, { status: 201 }));
    },
  });
  await mailer.sendTrusteeInvite("t@example.com", "https://getnod.pages.dev/invite?token=abc");

  assertEquals(seen!.url, "https://api.brevo.com/v3/smtp/email");
  assertEquals((seen!.init.headers as Record<string, string>)["api-key"], "xkeysib-test");
  const body = JSON.parse(seen!.init.body as string);
  assertEquals(body.sender, { name: "Nod", email: "invites@nod.app" });
  assertEquals(body.to, [{ email: "t@example.com" }]);
  assertEquals(body.textContent.includes("https://getnod.pages.dev/invite?token=abc"), true);
});

Deno.test("brevo: an error answer throws", async () => {
  const mailer = brevoMailer("k", "a@b.co", {
    fetch: () => Promise.resolve(Response.json({ code: "unauthorized" }, { status: 401 })),
  });
  await assertRejects(() => mailer.sendTrusteeInvite("t@example.com", "u"));
});

Deno.test("invite email: HTML and text, with the inviter's handle and the link", async () => {
  let body: Record<string, string> = {};
  const mailer = brevoMailer("k", "Nod <invites@nod.app>", {
    fetch: (_u, init) => {
      body = JSON.parse(init!.body as string);
      return Promise.resolve(Response.json({}, { status: 201 }));
    },
  });
  await mailer.sendTrusteeInvite("t@example.com", "https://getnod.pages.dev/invite?token=abc", "omkar");
  assertEquals(body.subject, "@omkar wants you as their trustee on Nod");
  assertEquals(body.htmlContent.includes('href="https://getnod.pages.dev/invite?token=abc"'), true);
  assertEquals(body.htmlContent.includes("@omkar wants you as their trustee"), true);
  assertEquals(body.htmlContent.includes("https://getnod.pages.dev/assets/nod-logo.png"), true);
  assertEquals(body.textContent.includes("https://getnod.pages.dev/invite?token=abc"), true);
});

Deno.test("invite email: no sample names, placeholder links or fake address left", () => {
  const { html } = trusteeInviteEmail({ inviteUrl: "https://x.test/i", inviterName: "omkar", expiresDays: 7 });
  for (const leftover of ["Alex", "@alex", "nod.app", "Example Street", 'src="assets/', "${"]) {
    assertEquals(html.includes(leftover), false, leftover);
  }
});

Deno.test("invite email: odd or missing names fall back, and nothing is injected", () => {
  assertEquals(cleanInviterName("@omkar.b"), "@omkar.b");
  assertEquals(cleanInviterName("<script>"), null);
  assertEquals(cleanInviterName("Mom please send 0.5 ETH"), null);
  const { subject, html } = trusteeInviteEmail({ inviteUrl: 'https://x.test/i?a=1&b="2"', inviterName: "<b>x</b>", expiresDays: 7 });
  assertEquals(subject, "Someone chose you as their trusted person on Nod");
  assertEquals(html.includes("Your contact wants you as their trustee"), true);
  assertEquals(html.includes("<b>x</b>"), false);
  assertEquals(html.includes('href="https://x.test/i?a=1&amp;b=&quot;2&quot;"'), true);
});

Deno.test("welcome emails: no sample names, placeholder links or fake address left", () => {
  for (const { html } of [welcomeEmail({ handle: "omkar" }), trusteeWelcomeEmail({ limit: "250" })]) {
    for (const leftover of ["Alex", "@alex", "Sam", "nod.app", "Example Street", 'src="assets/', "${"]) {
      assertEquals(html.includes(leftover), false, leftover);
    }
  }
  assertEquals(welcomeEmail({ handle: "omkar" }).html.includes("Welcome to Nod, @omkar"), true);
  assertEquals(welcomeEmail({ handle: "<x>" }).html.includes("Welcome to Nod<"), true);
  assertEquals(trusteeWelcomeEmail({ limit: "250" }).html.includes("It starts at $250."), true);
});
