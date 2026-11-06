// Reads required secrets once at startup and fails loudly if any is missing.
export type Env = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  privyAppId: string;
  privyAppSecret: string;
  privyVerificationKey: string;
  privyAuthorizationKey: string;
  brevoApiKey: string;
  inviteFromEmail: string;
  inviteUrlBase: string;
  webOrigins: string[];
  arkivAccessKey: string;
  arkivSeedPrivateKey: string;
  jobsSecret: string;
};

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret ${name}. See supabase/functions/.env.example.`);
  return value;
}

export function loadEnv(): Env {
  return {
    supabaseUrl: required("SUPABASE_URL"),
    supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    privyAppId: required("PRIVY_APP_ID"),
    privyAppSecret: required("PRIVY_APP_SECRET"),
    // Stored with literal "\n" in secrets; turn them back into newlines.
    privyVerificationKey: required("PRIVY_VERIFICATION_KEY").replaceAll("\\n", "\n"),
    // The backend signer's authorization key, "wallet-auth:..." (D3a).
    privyAuthorizationKey: required("PRIVY_AUTHORIZATION_KEY"),
    brevoApiKey: required("BREVO_API_KEY"),
    inviteFromEmail: required("INVITE_FROM_EMAIL"),
    inviteUrlBase: required("INVITE_URL_BASE"),
    arkivAccessKey: required("ARKIV_ACCESS_KEY"),
    // Backend wallet on Rabdi: writes the OFAC/list reports and tops up tGLM.
    arkivSeedPrivateKey: required("ARKIV_SEED_PRIVATE_KEY"),
    // Supabase Cron sends this to /api/jobs/*. Same value as the jobs_secret in Vault.
    jobsSecret: required("JOBS_SECRET"),
    webOrigins: (Deno.env.get("WEB_ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  };
}
