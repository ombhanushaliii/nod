// A person's @handle, made from their email the same way the app makes it
// (handleFrom in frontend/src/data/engine.ts): the part before the @, lower-case,
// letters, digits and _ only, at most 15 characters. The app pads a handle shorter
// than 3 characters with random digits; here it's returned as is.
export function handleFrom(email: string): string {
  return email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 15) || "user";
}
