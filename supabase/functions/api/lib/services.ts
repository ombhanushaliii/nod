// Outside services the API calls. Each is an interface so tests can fake it.

export interface PrivyApi {
  // Lower-case addresses of the user's Privy embedded Ethereum wallets.
  embeddedEthWallets(privyUserId: string): Promise<string[]>;
}

export interface Mailer {
  sendTrusteeInvite(to: string, inviteUrl: string): Promise<void>;
}

// Sends a little tGLM to a new Arkiv address (D1). Owned by the Arkiv work.
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
        linked_accounts?: Array<{ type?: string; chain_type?: string; wallet_client_type?: string; address?: string }>;
      };
      return (user.linked_accounts ?? [])
        .filter((a) => a.type === "wallet" && a.chain_type === "ethereum" && a.wallet_client_type === "privy" && a.address)
        .map((a) => a.address!.toLowerCase());
    },
  };
}

// Resend: POST https://api.resend.com/emails with a Bearer API key.
export function resendMailer(apiKey: string, from: string): Mailer {
  return {
    async sendTrusteeInvite(to, inviteUrl) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from,
          to,
          subject: "Someone chose you as their trusted person",
          text:
            "Someone you know picked you to help keep their wallet safe.\n\n" +
            "You'll be asked to approve risky payments before they go out.\n\n" +
            `Accept here: ${inviteUrl}\n\nThis link expires in 7 days.`,
        }),
      });
      if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
    },
  };
}

// Placeholder until the Arkiv person adds real tGLM top-ups.
export const noopArkivFunder: ArkivFunder = {
  fund(address) {
    console.log(`[arkiv-funder] TODO top up tGLM for ${address}`);
    return Promise.resolve();
  },
};
