import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { SupabaseClient } from "@supabase/supabase-js";

// Values every request handler can read from the Hono context.
export type AppEnv = {
  Variables: {
    privyUserId: string;
    db: SupabaseClient;
  };
};

export type AppContext = Context<AppEnv>;

// Throw from any handler to answer with a JSON error.
export function fail(status: 400 | 401 | 403 | 404 | 409 | 422 | 500, code: string, message?: string): never {
  throw new HTTPException(status, {
    res: Response.json({ error: code, message: message ?? code }, { status }),
  });
}
