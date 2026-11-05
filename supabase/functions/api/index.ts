// Single Edge Function for the whole backend API, routed with Hono.
// Supabase serves it at /functions/v1/api, so every route lives under /api.
import "@supabase/functions-js/edge-runtime.d.ts";
import { createApp } from "./app.ts";
import { privyAuth } from "./lib/auth.ts";
import { createDb } from "./lib/db.ts";
import { loadEnv } from "./lib/env.ts";
import { supabaseRepo } from "./lib/repo.ts";
import { goPlusApi, noScamReports } from "./lib/risk.ts";
import { noArkivApprovals } from "./lib/arkiv.ts";
import { noopArkivFunder, privyApi, resendMailer } from "./lib/services.ts";

const env = loadEnv();

const app = createApp({
  auth: privyAuth({ appId: env.privyAppId, verificationKey: env.privyVerificationKey }),
  repo: supabaseRepo(createDb(env.supabaseUrl, env.supabaseServiceRoleKey)),
  privy: privyApi(env.privyAppId, env.privyAppSecret),
  mailer: resendMailer(env.resendApiKey, env.inviteFromEmail),
  funder: noopArkivFunder,
  inviteUrlBase: env.inviteUrlBase,
  // TODO(arkiv): replace with live Arkiv report queries.
  scamReports: noScamReports,
  arkiv: noArkivApprovals,
  goPlus: goPlusApi(),
});

Deno.serve(app.fetch);
