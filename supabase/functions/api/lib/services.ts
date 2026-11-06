// Outside services the API calls. Each is an interface so tests can fake it.
import { trusteeInviteEmail } from "./inviteEmail.ts";

export interface PrivyApi {
  // The user's Privy embedded Ethereum wallets (lower-case address + Privy wallet id).
  embeddedEthWallets(privyUserId: string): Promise<{ address: string; id: string }[]>;
}

export interface Mailer {
  // inviterName: the user's @handle from their app, untrusted; optional.
  sendTrusteeInvite(to: string, inviteUrl: string, inviterName?: string | null): Promise<void>;
}

// Tops up an Arkiv address with tGLM (D1). See arkivFunder.ts.
export interface ArkivFunder {
  fund(address: string): Promise<void>;
}

// Privy REST API: GET https://api.privy.io/v1/users/{did},
// Basic auth (app id : app secret) plus the privy-app-id header.
export function privyApi(appId: string, appSecret: string): PrivyApi {
  const auth = `Basic ${btoa(`${appId}:${appSecret}`)}`;
  return {
    async embeddedEthWallets(privyUserId) {
      const res = await fetch(`https://api.privy.io/v1/users/${encodeURIComponent(privyUserId)}`, {
        headers: { authorization: auth, "privy-app-id": appId },
      });
      if (!res.ok) throw new Error(`Privy user lookup failed: ${res.status}`);
      const user = await res.json() as {
        linked_accounts?: Array<{ id?: string; type?: string; chain_type?: string; wallet_client_type?: string; address?: string }>;
      };
      return (user.linked_accounts ?? [])
        .filter((a) => a.type === "wallet" && a.chain_type === "ethereum" && a.wallet_client_type === "privy" && a.address && a.id)
        .map((a) => ({ address: a.address!.toLowerCase(), id: a.id! }));
    },
  };
}

// "Nod <invites@example.com>" or a bare address -> Brevo's sender object.
export function parseSender(from: string): { name?: string; email: string } {
  const m = from.trim().match(/^"?([^"<]*?)"?\s*<([^<>\s]+@[^<>\s]+)>$/);
  if (m) return m[1].trim() ? { name: m[1].trim(), email: m[2] } : { email: m[2] };
  if (/^[^<>\s]+@[^<>\s]+$/.test(from.trim())) return { email: from.trim() };
  throw new Error(`INVITE_FROM_EMAIL isn't an email address: ${from}`);
}

// Brevo transactional email: POST https://api.brevo.com/v3/smtp/email with
// the api-key header. The sender must be verified in Brevo.
export function brevoMailer(apiKey: string, from: string, opts: { fetch?: typeof fetch } = {}): Mailer {
  const sender = parseSender(from);
  const doFetch = opts.fetch ?? fetch;
  return {
    async sendTrusteeInvite(to, inviteUrl, inviterName) {
      // HTML from email/trustee-invite.html, plus a plain-text copy.
      const email = trusteeInviteEmail({ inviteUrl, inviterName, expiresDays: 7 });
      const res = await doFetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender,
          to: [{ email: to }],
          subject: email.subject,
          htmlContent: email.html,
          textContent: email.text,
        }),
      });
      if (!res.ok) throw new Error(`Brevo failed: ${res.status} ${await res.text()}`);
    },
  };
}
