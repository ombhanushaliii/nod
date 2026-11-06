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
import { brevoMailer, privyApi } from "./lib/services.ts";
import { rabdiSeedWallet, seedFunder } from "./lib/arkivFunder.ts";
import { runMirror, runRenewer } from "./lib/jobs.ts";
import { createWalletClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { http } from "viem";

const env = loadEnv();
const repo = supabaseRepo(createDb(env.supabaseUrl, env.supabaseServiceRoleKey));
const arkiv = arkivClient(env.arkivAccessKey);
const seedAccount = privateKeyToAccount(env.arkivSeedPrivateKey as Hex);
const seedAddress = seedAccount.address.toLowerCase();
const trustedCreators = async () => [seedAddress, ...await repo.trusteePairKeys()];
const seedArkiv = createWalletClient({
  account: seedAccount,
  chain: rabdi({ accessKey: env.arkivAccessKey }),
  transport: http(undefined, { timeout: 30_000, retryCount: 0, fetchOptions: { redirect: "error" } }),
});

const app = createApp({
  webOrigins: env.webOrigins,
  auth: privyAuth({ appId: env.privyAppId, verificationKey: env.privyVerificationKey }),
  repo,
  privy: privyApi(env.privyAppId, env.privyAppSecret),
  mailer: brevoMailer(env.brevoApiKey, env.inviteFromEmail),
  funder: seedFunder(rabdiSeedWallet(env.arkivSeedPrivateKey as Hex, env.arkivAccessKey)),
  inviteUrlBase: env.inviteUrlBase,
  scamReports: arkivScamReports({
    client: arkiv,
    trustedCreators,
    archive: (address) => repo.archivedReportCounts(address),
    archiveTrustee: (limit) => repo.archivedTrusteeReports(limit),
  }),
  arkiv: arkivApprovals(arkiv),
  goPlus: goPlusApi(),
  sender: privySender({
    appId: env.privyAppId, appSecret: env.privyAppSecret, authorizationKey: env.privyAuthorizationKey,
  }),
  push: expoPush(),
  jobs: {
    secret: env.jobsSecret,
    mirror: () => runMirror({ client: arkiv, trustedCreators, repo }),
    renew: () => runRenewer({ client: arkiv, seed: seedArkiv, repo }),
  },
});

Deno.serve(app.fetch);
