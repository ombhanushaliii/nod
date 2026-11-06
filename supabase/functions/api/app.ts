// Builds the API. Dependencies are passed in so tests can swap them.
import { Hono, type MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { cors } from "hono/cors";
import type { AppEnv } from "./lib/http.ts";
import type { Repo } from "./lib/repo.ts";
import { type OnboardingDeps, onboardingRoutes } from "./routes/onboarding.ts";
import { type PaymentDeps, paymentRoutes } from "./routes/payments.ts";
import { exportRoutes } from "./routes/exports.ts";
import { pushRoutes } from "./routes/push.ts";
import { type JobsDeps, jobsRoutes } from "./routes/jobs.ts";
import { publicRoutes } from "./routes/public.ts";
import { checkRoutes } from "./routes/check.ts";
import { type RulesDeps, rulesRoutes } from "./routes/rules.ts";

export type AppDeps = OnboardingDeps & PaymentDeps & RulesDeps & {
  auth: MiddlewareHandler<AppEnv>;
  repo: Repo;
  webOrigins?: string[];
  jobs?: JobsDeps;
};

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>().basePath("/api");

  app.use("*", cors({
    origin: (origin) => deps.webOrigins?.includes(origin) ? origin : "",
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
  }));

  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    console.error(err);
    return c.json({ error: "internal", message: "internal" }, 500);
  });

  app.get("/health", (c) => c.json({ ok: true }));

  app.route("/", publicRoutes(deps.repo));

  // Cron jobs use their own secret, not a Privy token.
  if (deps.jobs) app.route("/", jobsRoutes(deps.jobs));

  // Everything below needs a valid Privy token.
  app.use("*", deps.auth);
  app.use("*", async (c, next) => {
    c.set("repo", deps.repo);
    await next();
  });

  // Who am I, and have I finished onboarding?
  app.get("/me", async (c) => {
    const user = await c.var.repo.findUserByPrivyId(c.var.privyUserId);
    return c.json({ privyUserId: c.var.privyUserId, user });
  });

  app.route("/", onboardingRoutes(deps));
  app.route("/", paymentRoutes(deps));
  app.route("/", exportRoutes(deps));
  app.route("/", rulesRoutes(deps));
  app.route("/", checkRoutes(deps));
  app.route("/", pushRoutes());

  return app;
}
