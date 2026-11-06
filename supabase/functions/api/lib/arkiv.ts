// What the backend reads from Arkiv about approvals. Owned by the Arkiv work;
// these are the shapes it must return. Entity keys are 0x-prefixed 32 bytes.

export type ArkivRequest = {
  entityKey: string;
  owner: string; // lower-case address that wrote it ($creator, which can't be transferred)
  pairId: string;
  kind: "payment" | "export";
  createdAt: Date;
};

export type ArkivDecision = {
  entityKey: string;
  owner: string;
  pairId: string;
  requestKey: string;
  verdict: "allow" | "deny";
  intentHash: string | null; // allow only
  validFrom: Date | null; // allow only, as set by the trustee app
  createdAt: Date;
  expiresAt: Date;
};

export interface ArkivApprovals {
  getRequest(entityKey: string): Promise<ArkivRequest | null>;
  // Anyone can write an entity that points at a request, so only look at
  // decisions created by the pair's per-pair key.
  findDecision(requestKey: string, owner: string): Promise<ArkivDecision | null>;
}

// Placeholder until the Arkiv person wires live queries: nothing is found.
export const noArkivApprovals: ArkivApprovals = {
  getRequest: () => Promise.resolve(null),
  findDecision: () => Promise.resolve(null),
};
