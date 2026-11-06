// Sends USDC from the user's Privy wallet as the backend signer, with Privy
// gas sponsorship (D3a). Per Privy's docs:
//   POST https://api.privy.io/v1/wallets/{wallet_id}/rpc  (eth_sendTransaction, sponsor: true)
//   privy-authorization-signature = base64(DER(ECDSA-P256-SHA256(RFC8785(payload))))
//   payload = { version: 1, method, url, body, headers: { "privy-app-id", ... } }
//   key = the signer's authorization key, "wallet-auth:" + base64 PKCS#8
import { canonicalize } from "./jcs.ts";

export const SEPOLIA_CAIP2 = "eip155:11155111";
// Circle's USDC on Ethereum Sepolia (6 decimals, checked on-chain).
export const SEPOLIA_USDC = "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238";

export type SendResult = { transactionId: string | null; userOperationHash: string | null; hash: string | null };

export class SendError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
  }
}

// How a submitted transaction ended, from Privy's transaction status.
export type TxOutcome =
  | { outcome: "pending" }
  | { outcome: "sent"; hash: string }
  | { outcome: "failed"; reason: string };

export interface PaymentSender {
  // referenceId is unique per transaction at Privy, so a retry can't send twice.
  sendUsdc(args: { walletId: string; to: string; amount: bigint; referenceId: string }): Promise<SendResult>;
  transactionOutcome(transactionId: string): Promise<TxOutcome>;
}

const FAILED = new Set(["failed", "execution_reverted", "provider_error"]);
const DONE = new Set(["confirmed", "finalized"]);

// Privy statuses: pending, broadcasted, confirmed, finalized, execution_reverted,
// failed, replaced, provider_error. "replaced" stays pending: another
// transaction took its place and may still land.
export function outcomeOf(status: string, hash: string | null): TxOutcome {
  if (FAILED.has(status)) return { outcome: "failed", reason: status };
  if (DONE.has(status) && hash && /^0x[0-9a-fA-F]{64}$/.test(hash)) return { outcome: "sent", hash: hash.toLowerCase() };
  return { outcome: "pending" };
}

// ERC-20 transfer(address,uint256) calldata.
export function transferCalldata(to: string, amount: bigint): string {
  const pad = (hex: string) => hex.replace(/^0x/, "").toLowerCase().padStart(64, "0");
  return `0xa9059cbb${pad(to)}${pad(amount.toString(16))}`;
}

// Web Crypto gives raw r||s; Privy wants ASN.1 DER.
export function rawToDer(raw: Uint8Array): Uint8Array {
  const int = (b: Uint8Array) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    let v = b.slice(i);
    if (v[0] & 0x80) v = new Uint8Array([0, ...v]);
    return new Uint8Array([0x02, v.length, ...v]);
  };
  const r = int(raw.slice(0, 32));
  const s = int(raw.slice(32));
  return new Uint8Array([0x30, r.length + s.length, ...r, ...s]);
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function importAuthorizationKey(walletAuthKey: string): Promise<CryptoKey> {
  const der = unb64(walletAuthKey.replace(/^wallet-auth:/, "").trim());
  return crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

export async function authorizationSignature(
  key: CryptoKey,
  req: { method: "POST"; url: string; body: unknown; appId: string },
): Promise<string> {
  const payload = {
    version: 1,
    method: req.method,
    url: req.url.replace(/\/$/, ""),
    body: req.body,
    headers: { "privy-app-id": req.appId },
  };
  const bytes = new TextEncoder().encode(canonicalize(payload));
  const raw = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, bytes));
  return b64(rawToDer(raw));
}

export function privySender(cfg: {
  appId: string;
  appSecret: string;
  authorizationKey: string;
  usdc?: string;
  caip2?: string;
  fetch?: typeof fetch;
}): PaymentSender {
  const doFetch = cfg.fetch ?? fetch;
  let key: Promise<CryptoKey> | undefined;
  const basic = `Basic ${btoa(`${cfg.appId}:${cfg.appSecret}`)}`;
  return {
    async transactionOutcome(transactionId) {
      const res = await doFetch(`https://api.privy.io/v1/transactions/${encodeURIComponent(transactionId)}`, {
        headers: { authorization: basic, "privy-app-id": cfg.appId },
      });
      if (!res.ok) throw new SendError(`Privy transaction lookup: ${res.status} ${await res.text()}`, res.status);
      const tx = await res.json() as { status: string; transaction_hash: string | null };
      return outcomeOf(tx.status, tx.transaction_hash);
    },
    async sendUsdc({ walletId, to, amount, referenceId }) {
      key ??= importAuthorizationKey(cfg.authorizationKey);
      const url = `https://api.privy.io/v1/wallets/${encodeURIComponent(walletId)}/rpc`;
      const body = {
        method: "eth_sendTransaction",
        caip2: cfg.caip2 ?? SEPOLIA_CAIP2,
        chain_type: "ethereum",
        sponsor: true,
        reference_id: referenceId,
        params: {
          transaction: { to: cfg.usdc ?? SEPOLIA_USDC, data: transferCalldata(to, amount), value: "0x0" },
        },
      };
      const signature = await authorizationSignature(await key, { method: "POST", url, body, appId: cfg.appId });

      let res: Response;
      try {
        res = await doFetch(url, {
          method: "POST",
          headers: {
            authorization: basic,
            "privy-app-id": cfg.appId,
            "privy-authorization-signature": signature,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        });
      } catch (err) {
        throw new SendError(`Privy unreachable: ${err}`, null);
      }
      if (!res.ok) throw new SendError(`Privy refused: ${res.status} ${await res.text()}`, res.status);

      const out = await res.json() as {
        data?: { hash?: string; user_operation_hash?: string; transaction_id?: string };
      };
      return {
        transactionId: out.data?.transaction_id ?? null,
        userOperationHash: out.data?.user_operation_hash ?? null,
        // Empty for sponsored transactions until they confirm. Lower-cased to
        // match the database check, so storing it can't fail after sending.
        hash: /^0x[0-9a-fA-F]{64}$/.test(out.data?.hash ?? "") ? out.data!.hash!.toLowerCase() : null,
      };
    },
  };
}
