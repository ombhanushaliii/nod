// Push notifications through Expo's push service (free, no key needed).
//   POST https://exp.host/--/api/v2/push/send  with up to 100 messages
// Each message gets a ticket; "DeviceNotRegistered" means the app was
// uninstalled or the token is dead, so that token is deleted.
//
// Messages never carry payment details (D9): the app fetches those itself.
import type { Repo } from "./repo.ts";

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH = 100;

// ExponentPushToken[...] or ExpoPushToken[...]
export const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/;

export type PushMessage = { title: string; body: string; data: Record<string, string> };

export interface PushSender {
  // Returns the tokens Expo says are no longer valid.
  send(tokens: string[], message: PushMessage): Promise<{ deadTokens: string[] }>;
}

export function expoPush(opts: { fetch?: typeof fetch; timeoutMs?: number } = {}): PushSender {
  const doFetch = opts.fetch ?? fetch;
  return {
    async send(tokens, message) {
      const dead: string[] = [];
      for (let i = 0; i < tokens.length; i += BATCH) {
        const batch = tokens.slice(i, i + BATCH);
        const res = await doFetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify(batch.map((to) => ({ to, sound: "default", priority: "high", ...message }))),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
        });
        if (!res.ok) throw new Error(`Expo push failed: ${res.status} ${await res.text()}`);
        const out = await res.json() as { data?: { status: string; details?: { error?: string } }[] };
        (out.data ?? []).forEach((ticket, j) => {
          if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") dead.push(batch[j]);
        });
      }
      return { deadTokens: dead };
    },
  };
}

export const MESSAGES = {
  // To the trustee, when a user they protect asks for approval.
  approvalRequest: (pairId: string): PushMessage => ({
    title: "Someone you protect needs you",
    body: "A payment is waiting for your answer.",
    data: { type: "approval_request", pairId },
  }),
  // To the user, when the person they invited accepted.
  trusteeAccepted: (): PushMessage => ({
    title: "Your trustee is set up",
    body: "They'll check risky payments before they go out.",
    data: { type: "trustee_accepted" },
  }),
  // To the user, when their trustee answered a request. No details.
  trusteeAnswered: (): PushMessage => ({
    title: "Your trustee answered",
    body: "Open the app to see if your payment can go out.",
    data: { type: "trustee_answered" },
  }),
  // To the user, when their trustee changed their rules.
  rulesChanged: (): PushMessage => ({
    title: "Your trustee changed your payment rules",
    body: "Open the app to see what changed.",
    data: { type: "rules_changed" },
  }),
};

// Best effort: a push failure never fails the request that caused it.
export async function notifyUser(repo: Repo, push: PushSender, userId: string, message: PushMessage): Promise<void> {
  try {
    const tokens = await repo.pushTokensFor(userId);
    if (tokens.length === 0) return;
    const { deadTokens } = await push.send(tokens, message);
    if (deadTokens.length > 0) await repo.deletePushTokens(deadTokens);
  } catch (err) {
    console.error("push failed", err);
  }
}
