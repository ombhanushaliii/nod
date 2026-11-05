import { assertEquals } from "@std/assert";
import { makeTestApp } from "./helpers.ts";

Deno.test("allowed website can preflight an authenticated payment request", async () => {
  const { app } = makeTestApp({ webOrigins: ["http://localhost:8081"] });
  const res = await app.request("/api/payments/check", {
    method: "OPTIONS",
    headers: {
      origin: "http://localhost:8081",
      "access-control-request-method": "POST",
      "access-control-request-headers": "authorization,content-type",
    },
  });
  assertEquals(res.status, 204);
  assertEquals(res.headers.get("access-control-allow-origin"), "http://localhost:8081");
  assertEquals(res.headers.get("access-control-allow-headers"), "Authorization,Content-Type");
});

Deno.test("unlisted origins receive no CORS access", async () => {
  const { app } = makeTestApp({ webOrigins: ["http://localhost:8081"] });
  const res = await app.request("/api/health", { headers: { origin: "https://unlisted.example" } });
  assertEquals(res.headers.get("access-control-allow-origin"), null);
});

Deno.test("CORS does not bypass Privy authentication", async () => {
  const { app } = makeTestApp({ webOrigins: ["http://localhost:8081"] });
  const res = await app.request("/api/me", { headers: { origin: "http://localhost:8081" } });
  assertEquals(res.status, 401);
  assertEquals(res.headers.get("access-control-allow-origin"), "http://localhost:8081");
});
