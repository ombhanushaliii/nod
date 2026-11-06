// Endpoints Supabase Cron calls (see the arkiv_cron migration). No Privy
// token: the caller sends the shared JOBS_SECRET in x-jobs-secret.
import { Hono } from "hono";
import type { AppEnv } from "../lib/http.ts";

export type JobsDeps = {
  secret: string;
  mirror: () => Promise<unknown>;
  renew: () => Promise<unknown>;
};

async function digest(s: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

// Compares hashes, so the time taken says nothing about the secret.
async function secretMatches(given: string, secret: string) {
  const [a, b] = await Promise.all([digest(given), digest(secret)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function jobsRoutes(deps: JobsDeps) {
  const r = new Hono<AppEnv>();
  r.use("/jobs/*", async (c, next) => {
    if (!(await secretMatches(c.req.header("x-jobs-secret") ?? "", deps.secret))) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  });
  r.post("/jobs/mirror", async (c) => c.json(await deps.mirror()));
  r.post("/jobs/renew", async (c) => c.json(await deps.renew()));
  return r;
}
