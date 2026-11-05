// Single Edge Function for the whole backend API, routed with Hono.
// Supabase serves it at /functions/v1/api, so every route lives under /api.
import "@supabase/functions-js/edge-runtime.d.ts";
import { createApp } from "./app.ts";
import { privyAuth } from "./lib/auth.ts";
import { createDb } from "./lib/db.ts";
import { loadEnv } from "./lib/env.ts";

const env = loadEnv();

const app = createApp({
  auth: privyAuth({ appId: env.privyAppId, verificationKey: env.privyVerificationKey }),
  db: createDb(env.supabaseUrl, env.supabaseServiceRoleKey),
});

Deno.serve(app.fetch);
