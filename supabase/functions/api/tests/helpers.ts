// Test harness: real Privy-style tokens, in-memory repo, recorded side effects.
import { exportSPKI, generateKeyPair, SignJWT } from "jose";
import { createApp } from "../app.ts";
import { privyAuth } from "../lib/auth.ts";
import { type Repo, RepoError, type User } from "../lib/repo.ts";

export const APP_ID = "test-app-id";
const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
export const PEM = await exportSPKI(publicKey);

export function signToken(sub: string, opts: { iss?: string; aud?: string; exp?: string; key?: CryptoKey } = {}) {
  return new SignJWT({ sid: "s1" })
    .setProtectedHeader({ alg: "ES256" })
    .setSubject(sub)
    .setIssuer(opts.iss ?? "privy.io")
    .setAudience(opts.aud ?? APP_ID)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "1h")
    .sign(opts.key ?? privateKey);
}

type Pair = {
  id: string; pairId: string; userId: string; trusteeId?: string;
  pairKeyAddress?: string; encPubKey?: string; status: "invited" | "active" | "revoked";
};
type Invite = { pairRowId: string; contact: string | null; tokenHash: string; expiresAt: Date; acceptedAt?: Date };

// Same rules as the SQL functions in the invite_functions migration.
export class MemoryRepo implements Repo {
  users: User[] = [];
  pairs: Pair[] = [];
  invites: Invite[] = [];
  rules = new Set<string>();

  findUserByPrivyId(id: string) {
    return Promise.resolve(this.users.find((u) => u.privy_user_id === id) ?? null);
  }
  findUserByWallet(a: string) {
    return Promise.resolve(this.users.find((u) => u.wallet_address === a) ?? null);
  }
  createUser(privyUserId: string, walletAddress: string) {
    const user = { id: crypto.randomUUID(), privy_user_id: privyUserId, wallet_address: walletAddress, created_at: new Date().toISOString() };
    this.users.push(user);
    this.rules.add(user.id);
    return Promise.resolve(user);
  }
  createInvite(a: { userId: string; pairId: string; contact: string; tokenHash: string; expiresAt: Date }) {
    const open = this.pairs.find((p) => p.userId === a.userId && p.status !== "revoked");
    if (open?.status === "active") return Promise.reject(new RepoError("pair_active"));
    if (open) {
      const inv = this.invites.find((i) => i.pairRowId === open.id)!;
      Object.assign(inv, { contact: a.contact, tokenHash: a.tokenHash, expiresAt: a.expiresAt, acceptedAt: undefined });
    } else {
      const pair: Pair = { id: crypto.randomUUID(), pairId: a.pairId, userId: a.userId, status: "invited" };
      this.pairs.push(pair);
      this.invites.push({ pairRowId: pair.id, contact: a.contact, tokenHash: a.tokenHash, expiresAt: a.expiresAt });
    }
    return Promise.resolve();
  }
  findInvite(tokenHash: string) {
    const inv = this.invites.find((i) => i.tokenHash === tokenHash);
    if (!inv) return Promise.resolve(null);
    const pair = this.pairs.find((p) => p.id === inv.pairRowId)!;
    return Promise.resolve({
      pairId: pair.pairId,
      expiresAt: inv.expiresAt.toISOString(),
      usable: !inv.acceptedAt && pair.status === "invited" && inv.expiresAt > new Date(),
    });
  }
  acceptInvite(a: { tokenHash: string; trusteeId: string; pairKeyAddress: string; encPubKey: string }) {
    const inv = this.invites.find((i) => i.tokenHash === a.tokenHash);
    if (!inv) return Promise.reject(new RepoError("invite_not_found"));
    const pair = this.pairs.find((p) => p.id === inv.pairRowId)!;
    if (inv.acceptedAt || pair.status !== "invited") return Promise.reject(new RepoError("invite_used"));
    if (inv.expiresAt < new Date()) return Promise.reject(new RepoError("invite_expired"));
    if (pair.userId === a.trusteeId) return Promise.reject(new RepoError("self_trustee"));
    Object.assign(pair, { trusteeId: a.trusteeId, pairKeyAddress: a.pairKeyAddress, encPubKey: a.encPubKey, status: "active" });
    Object.assign(inv, { acceptedAt: new Date(), contact: null });
    return Promise.resolve(pair.pairId);
  }
}

export function makeTestApp() {
  const repo = new MemoryRepo();
  const mails: { to: string; url: string }[] = [];
  const funded: string[] = [];
  // Privy DID -> embedded wallets, as Privy's API would report.
  const privyWallets = new Map<string, string[]>();
  const state = { mailFails: false };

  const app = createApp({
    auth: privyAuth({ appId: APP_ID, verificationKey: PEM }),
    repo,
    privy: { embeddedEthWallets: (did) => Promise.resolve(privyWallets.get(did) ?? []) },
    mailer: {
      sendTrusteeInvite(to, url) {
        if (state.mailFails) return Promise.reject(new Error("resend down"));
        mails.push({ to, url });
        return Promise.resolve();
      },
    },
    funder: { fund: (a) => (funded.push(a), Promise.resolve()) },
    inviteUrlBase: "guardian://invite/",
  });

  async function call(sub: string | null, method: string, path: string, json?: unknown) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (sub) headers.authorization = `Bearer ${await signToken(sub)}`;
    const res = await app.request(`/api${path}`, { method, headers, body: json === undefined ? undefined : JSON.stringify(json) });
    return { status: res.status, body: await res.json() };
  }

  return { app, repo, mails, funded, privyWallets, state, call };
}

export const addr = (ch: string) => `0x${ch.repeat(40)}`;
export const hex32 = (ch: string) => `0x${ch.repeat(64)}`;
