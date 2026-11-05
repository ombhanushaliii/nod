// Reads required secrets once at startup and fails loudly if any is missing.
export type Env = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  privyAppId: string;
  privyAppSecret: string;
  privyVerificationKey: string;
  privyAuthorizationKey: string;
  resendApiKey: string;
  inviteFromEmail: string;
  inviteUrlBase: string;
  webOrigins: string[];
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
    resendApiKey: required("RESEND_API_KEY"),
    inviteFromEmail: required("INVITE_FROM_EMAIL"),
    inviteUrlBase: required("INVITE_URL_BASE"),
    webOrigins: (Deno.env.get("WEB_ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  };
}
