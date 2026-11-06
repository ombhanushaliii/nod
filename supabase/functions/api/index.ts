// Single Edge Function for the whole backend API, routed with Hono.
// Supabase serves it at /functions/v1/api, so every route lives under /api.
import "@supabase/functions-js/edge-runtime.d.ts";
import { createApp } from "./app.ts";
import { privyAuth } from "./lib/auth.ts";
import { createDb } from "./lib/db.ts";
import { loadEnv } from "./lib/env.ts";
import { supabaseRepo } from "./lib/repo.ts";
import { goPlusApi } from "./lib/risk.ts";
import { arkivApprovals, arkivClient, arkivScamReports } from "./lib/arkivLive.ts";
import { privySender } from "./lib/privySigner.ts";
import { expoPush } from "./lib/push.ts";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { brevoMailer, noopArkivFunder, privyApi } from "./lib/services.ts";

const env = loadEnv();
const repo = supabaseRepo(createDb(env.supabaseUrl, env.supabaseServiceRoleKey));
const arkiv = arkivClient(env.arkivAccessKey);
const seedAddress = privateKeyToAccount(env.arkivSeedPrivateKey as Hex).address.toLowerCase();

const app = createApp({
  webOrigins: env.webOrigins,
  auth: privyAuth({ appId: env.privyAppId, verificationKey: env.privyVerificationKey }),
  repo,
  privy: privyApi(env.privyAppId, env.privyAppSecret),
  mailer: brevoMailer(env.brevoApiKey, env.inviteFromEmail),
  funder: noopArkivFunder,
  inviteUrlBase: env.inviteUrlBase,
  scamReports: arkivScamReports({
    client: arkiv,
    trustedCreators: async () => [seedAddress, ...await repo.trusteePairKeys()],
    archive: (address) => repo.archivedReportCounts(address),
  }),
  arkiv: arkivApprovals(arkiv),
  goPlus: goPlusApi(),
  sender: privySender({
    appId: env.privyAppId, appSecret: env.privyAppSecret, authorizationKey: env.privyAuthorizationKey,
  }),
  push: expoPush(),
});

Deno.serve(app.fetch);
