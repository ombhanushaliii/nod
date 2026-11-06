import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deriveEncKey, intentHash, open, seal } from '../../packages/arkiv/src/crypto.ts';
import { parsePaymentPayload, usdcToUnits } from '../../packages/arkiv/src/payload.ts';
import { approvalPatch, pollDelay, requestPaymentApproval } from '../src/wallet/approvals.ts';

const trustee = deriveEncKey(`0x${'11'.repeat(65)}`);
const pubHex = '0x' + Buffer.from(trustee.publicKey).toString('hex');
const input = {
  paymentId: 'pay-1', to: '0x1234567890ABCDEF1234567890abcdef12345678', amountText: '12.5',
  nonce: `0x${'AB'.repeat(32)}`, name: 'Landlord', reasons: ['new_payee'], answers: [false, false, true], newPayee: true,
};
const apiError = (code) => Object.assign(new Error(code), { code });

function harness({ pair = { status: 'active', pairId: `0x${'p'.charCodeAt(0).toString(16).repeat(32)}`, trusteeEncPubKey: pubHex }, attach = [], write = [] } = {}) {
  const log = { writes: [], attaches: 0, refills: 0, saved: {} };
  const attachResults = [...attach];
  const writeResults = [...write];
  const deps = {
    api: async (path, body) => {
      if (path === '/pair') return pair;
      log.attaches++;
      const next = attachResults.shift();
      if (next instanceof Error) throw next;
      return { status: 'awaiting_trustee', expiresAt: '2026-11-06T12:30:00Z', ...body };
    },
    toUnits: usdcToUnits,
    seal,
    writeRequest: async (pairId, sealed) => {
      const next = writeResults.shift();
      if (next instanceof Error) throw next;
      log.writes.push({ pairId, sealed });
      return `0x${'e'.repeat(64)}`;
    },
    refill: async () => { log.refills++; },
    savedKey: (id) => log.saved[id],
    saveKey: (id, key) => { log.saved[id] = key; },
    assertSession: () => {},
    wait: async () => {},
  };
  return { deps, log };
}

test('the sealed request opens for the trustee, and its intent hash binds the exact payment', async () => {
  const { deps, log } = harness();
  const out = await requestPaymentApproval(input, deps);
  assert.equal(out.requestKey, `0x${'e'.repeat(64)}`);
  assert.equal(out.expiresAt, Date.parse('2026-11-06T12:30:00Z'));
  const payload = parsePaymentPayload(open(log.writes[0].sealed, trustee.secretKey));
  assert.equal(payload.amount, '12500000');
  assert.equal(payload.to, input.to.toLowerCase());
  assert.equal(
    intentHash(payload.to, BigInt(payload.amount), payload.nonce),
    '0x7e35f3baf495f6f8baaaf7ddaac6ca1c703d2fcaca83d6f01ae1513b0ca5527e',
  );
});

test('a retry reuses the written request instead of writing again', async () => {
  const { deps, log } = harness({ attach: [new Error('network down')] });
  await assert.rejects(requestPaymentApproval(input, deps), /network down/);
  await requestPaymentApproval(input, deps);
  assert.equal(log.writes.length, 1);
  assert.equal(log.attaches, 2);
});

test('waits for Arkiv to show the request, and treats already_requested as done', async () => {
  const slow = harness({ attach: [apiError('request_not_on_arkiv'), apiError('request_not_on_arkiv')] });
  await requestPaymentApproval(input, slow.deps);
  assert.equal(slow.log.attaches, 3);

  const again = harness({ attach: [apiError('already_requested')] });
  assert.equal((await requestPaymentApproval(input, again.deps)).expiresAt, null);

  const never = harness({ attach: Array(5).fill(apiError('request_not_on_arkiv')) });
  await assert.rejects(requestPaymentApproval(input, never.deps), /request_not_on_arkiv/);
});

test('out of tGLM: tops up once and writes again', async () => {
  const { deps, log } = harness({ write: [new Error('insufficient funds for gas')] });
  await requestPaymentApproval(input, deps);
  assert.equal(log.refills, 1);
  assert.equal(log.writes.length, 1);
});

test('no active trustee: nothing is written', async () => {
  const { deps, log } = harness({ pair: { status: 'invited', contact: 't@example.com', inviteExpiresAt: '' } });
  await assert.rejects(requestPaymentApproval(input, deps), /hasn't accepted/);
  assert.equal(log.writes.length, 0);
});

test('backend statuses map onto the request', () => {
  const now = 1000;
  assert.deepEqual(approvalPatch({ status: 'awaiting_trustee' }, now), { status: 'pending' });
  assert.deepEqual(approvalPatch({ status: 'cooling_down', unlockAt: '1970-01-02T00:00:00Z', validUntil: '1970-01-02T01:00:00Z' }, now),
    { status: 'allowed', validFrom: 86400000, validUntil: 90000000 });
  assert.deepEqual(approvalPatch({ status: 'ready', unlockAt: null }, now), { status: 'allowed', validFrom: now });
  assert.deepEqual(approvalPatch({ status: 'denied' }, now), { status: 'denied', decidedAt: now });
  assert.deepEqual(approvalPatch({ status: 'expired' }, now), { status: 'expired' });
  for (const s of ['sending', 'submitted', 'sent', 'failed']) assert.deepEqual(approvalPatch({ status: s }, now), { used: true });
  assert.equal(approvalPatch({ status: 'checked' }, now), null);
  assert.deepEqual([0, 1, 2, 3, 9].map(pollDelay), [5000, 10000, 15000, 30000, 30000]);
});
