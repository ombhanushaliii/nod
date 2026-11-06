// Outside risk signals for a payee address.

// categories: what the verified reports say the address is, e.g.
// "sanctioned", "phishing", "exploit" (importer) or "scam" (trustee deny).
// Only the known ones, each once.
// trustees: how many different trustees reported it (verified, source "trustee").
export type ReportCounts = { verified: number; unverified: number; categories?: string[]; trustees?: number };

// An address and how many different trustees reported it.
export type TrusteeReported = { address: string; trustees: number; lastReportedAt: Date };

// Report rows -> one line per address: distinct trustees, newest report first.
export function groupTrusteeReports(rows: { address: string; creator: string; at: Date }[]): TrusteeReported[] {
  const by = new Map<string, { creators: Set<string>; last: Date }>();
  for (const r of rows) {
    const a = r.address.toLowerCase();
    const e = by.get(a) ?? { creators: new Set<string>(), last: r.at };
    e.creators.add(r.creator.toLowerCase());
    if (r.at > e.last) e.last = r.at;
    by.set(a, e);
  }
  return [...by.entries()]
    .map(([address, e]) => ({ address, trustees: e.creators.size, lastReportedAt: e.last }))
    .sort((a, b) => b.lastReportedAt.getTime() - a.lastReportedAt.getTime());
}

export const REPORT_CATEGORIES = ["sanctioned", "phishing", "exploit", "scam"] as const;

// Known categories from verified reports, in a fixed order.
export function knownCategories(categories: (string | null | undefined)[]): string[] {
  const seen = new Set(categories.map((c) => (c ?? "").toLowerCase()));
  return REPORT_CATEGORIES.filter((c) => seen.has(c));
}

// Live scam reports on Arkiv (D3, D6). Owned by the Arkiv work; it filters by
// trusted creators (our seed wallet and trustee per-pair keys).
export interface ScamReports {
  countFor(address: string): Promise<ReportCounts>;
  // Addresses trustees reported (Deny & report), most recent first.
  trusteeReported(limit: number): Promise<TrusteeReported[]>;
}

export type GoPlusResult = { flagged: string[] } | { unavailable: true };

export interface GoPlus {
  check(address: string): Promise<GoPlusResult>;
}

// GoPlus labels that mean "don't pay this address without a trustee".
const GOPLUS_RISK_FIELDS = [
  "cybercrime", "money_laundering", "financial_crime", "darkweb_transactions",
  "phishing_activities", "fake_kyc", "blacklist_doubt", "stealing_attack",
  "blackmail_activities", "sanctioned", "malicious_mining_activities", "mixer",
  "honeypot_related_address", "fake_token", "fake_standard_interface", "gas_abuse", "reinit",
];

// Free public API, no key. Queried without chain_id: the labels are about the
// address, not one chain.
export function goPlusApi(timeoutMs = 5000): GoPlus {
  return {
    async check(address) {
      try {
        const res = await fetch(`https://api.gopluslabs.io/api/v1/address_security/${address}`, {
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return { unavailable: true };
        const body = await res.json() as { code?: number; result?: Record<string, string> };
        if (body.code !== 1 || !body.result) return { unavailable: true };
        const r = body.result;
        const flagged = GOPLUS_RISK_FIELDS.filter((f) => r[f] === "1");
        if (Number(r.number_of_malicious_contracts_created ?? "0") > 0) flagged.push("malicious_contracts_created");
        return { flagged };
      } catch {
        return { unavailable: true };
      }
    },
  };
}

// Placeholder until the Arkiv person wires live queries.
export const noScamReports: ScamReports = {
  countFor: () => Promise.resolve({ verified: 0, unverified: 0 }),
  trusteeReported: () => Promise.resolve([]),
};
