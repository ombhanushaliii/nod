// Reads required secrets once at startup and fails loudly if any is missing.
export type Env = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  privyAppId: string;
  privyVerificationKey: string;
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
    // Stored with literal "\n" in secrets; turn them back into newlines.
    privyVerificationKey: required("PRIVY_VERIFICATION_KEY").replaceAll("\\n", "\n"),
  };
}
