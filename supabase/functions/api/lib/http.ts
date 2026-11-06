import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Repo, User } from "./repo.ts";

// Values every request handler can read from the Hono context.
export type AppEnv = {
  Variables: {
    privyUserId: string;
    repo: Repo;
  };
};

export type AppContext = Context<AppEnv>;

export type HttpStatus = 400 | 401 | 403 | 404 | 409 | 410 | 422 | 429 | 500 | 502;

// Throw from any handler to answer with a JSON error.
export function fail(status: HttpStatus, code: string, message?: string): never {
  throw new HTTPException(status, {
    res: Response.json({ error: code, message: message ?? code }, { status }),
  });
}

// The caller must have finished onboarding.
export async function requireUser(c: AppContext): Promise<User> {
  const user = await c.var.repo.findUserByPrivyId(c.var.privyUserId);
  if (!user) fail(403, "not_onboarded", "Call POST /api/onboarding/user first.");
  return user;
}
