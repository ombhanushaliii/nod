// HTTP answers for the short error codes raised by the SQL functions.
import { fail, type HttpStatus } from "./http.ts";
import { RepoError, type RepoErrorCode } from "./repo.ts";

const STATUS: Record<RepoErrorCode, [HttpStatus, string]> = {
  pair_active: [409, "You already have an active trustee."],
  invite_not_found: [404, "This invite doesn't exist."],
  invite_used: [410, "This invite was already used."],
  invite_expired: [410, "This invite has expired."],
  self_trustee: [409, "You can't be your own trustee."],
  payment_not_found: [404, "Payment not found."],
  trustee_not_needed: [409, "This payment doesn't need the trustee."],
  already_requested: [409, "The trustee was already asked about this payment."],
  no_active_trustee: [409, "Your trustee hasn't accepted the invite yet."],
  request_key_used: [409, "That Arkiv request is already linked to a payment."],
  not_awaiting_trustee: [409, "This payment isn't waiting for the trustee."],
  decision_key_used: [409, "That decision was already used."],
};

export function statusOf(code: RepoErrorCode): [HttpStatus, string] {
  return STATUS[code];
}

// Use as .catch(mapRepoError) on repo calls.
export function mapRepoError(err: unknown): never {
  if (err instanceof RepoError) {
    const [status, message] = STATUS[err.code];
    fail(status, err.code, message);
  }
  throw err;
}
