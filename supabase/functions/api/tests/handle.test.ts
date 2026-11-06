import { assertEquals } from "@std/assert";
import { handleFrom } from "../lib/handle.ts";

// Must match handleFrom in frontend/src/data/engine.ts, which the user's own app shows.
Deno.test("handle: the part before @, lower-case, letters/digits/_ only, at most 15", () => {
  assertEquals(handleFrom("yashjoisar.me@gmail.com"), "yashjoisarme");
  assertEquals(handleFrom("Alex.Rivera@gmail.com"), "alexrivera");
  assertEquals(handleFrom("a_b-c+tag@example.com"), "a_bctag");
  assertEquals(handleFrom("averyveryverylongname@example.com"), "averyveryverylo");
  assertEquals(handleFrom("..@example.com"), "user");
});
