// RFC 8785 JSON Canonicalization: object keys sorted by UTF-16 code units, no
// whitespace, numbers and strings serialized the way ECMAScript's JSON does.
// Privy signs requests over this form.
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new TypeError("non-finite number");
    if (value === undefined || typeof value === "function" || typeof value === "bigint" || typeof value === "symbol") {
      throw new TypeError(`can't canonicalize ${typeof value}`);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}
