import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { brevoMailer, parseSender } from "../lib/services.ts";

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
  await mailer.sendTrusteeInvite("t@example.com", "https://trynod.pages.dev/invite?token=abc");

  assertEquals(seen!.url, "https://api.brevo.com/v3/smtp/email");
  assertEquals((seen!.init.headers as Record<string, string>)["api-key"], "xkeysib-test");
  const body = JSON.parse(seen!.init.body as string);
  assertEquals(body.sender, { name: "Nod", email: "invites@nod.app" });
  assertEquals(body.to, [{ email: "t@example.com" }]);
  assertEquals(body.textContent.includes("https://trynod.pages.dev/invite?token=abc"), true);
});

Deno.test("brevo: an error answer throws", async () => {
  const mailer = brevoMailer("k", "a@b.co", {
    fetch: () => Promise.resolve(Response.json({ code: "unauthorized" }, { status: 401 })),
  });
  await assertRejects(() => mailer.sendTrusteeInvite("t@example.com", "u"));
});
