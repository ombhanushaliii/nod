// Builds the API. Dependencies are passed in so tests can swap them.
import { Hono, type MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppEnv } from "./lib/http.ts";

export type AppDeps = {
  auth: MiddlewareHandler<AppEnv>;
  db: SupabaseClient;
};

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>().basePath("/api");

  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    console.error(err);
    return c.json({ error: "internal", message: "internal" }, 500);
  });

  app.get("/health", (c) => c.json({ ok: true }));

  // Everything below needs a valid Privy token.
  app.use("*", deps.auth);
  app.use("*", async (c, next) => {
    c.set("db", deps.db);
    await next();
  });

  // Who am I, and have I finished onboarding?
  app.get("/me", async (c) => {
    const { data, error } = await c.var.db
      .from("users")
      .select("id, wallet_address, created_at")
      .eq("privy_user_id", c.var.privyUserId)
      .maybeSingle();
    if (error) throw error;
    return c.json({ privyUserId: c.var.privyUserId, user: data });
  });

  return app;
}
