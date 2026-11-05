import { z } from "zod";
import type { AppContext } from "./http.ts";
import { fail } from "./http.ts";

// Accepts any-case 0x addresses and stores them lower-case (matches the DB domain).
export const evmAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "must be a 0x address")
  .transform((s) => s.toLowerCase() as `0x${string}`);

export const hex32 = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "must be 32 bytes of 0x hex")
  .transform((s) => s.toLowerCase() as `0x${string}`);

export async function body<T extends z.ZodTypeAny>(c: AppContext, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    fail(400, "invalid_json");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    fail(422, "invalid_body", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return parsed.data;
}
