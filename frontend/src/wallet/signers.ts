/**
 * Privy refuses to add a signer the wallet already has ("Duplicate signer(s)
 * provided when updating wallet…"). For Nod that means the backend signer is
 * already set up, so it counts as done. This happens when the phone forgot it
 * added the signer: a reinstall, a new device, or cleared app data.
 */
export function isAlreadyAddedSigner(err: unknown): boolean {
  return err instanceof Error && /duplicate signer/i.test(err.message);
}
