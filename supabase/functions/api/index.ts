// Single Edge Function for the whole backend API, routed with Hono.
// Supabase serves it at /functions/v1/api, so every route lives under /api.
import "@supabase/functions-js/edge-runtime.d.ts";
import { Hono } from "hono";

const app = new Hono().basePath("/api");

app.get("/health", (c) => c.json({ ok: true }));

Deno.serve(app.fetch);
