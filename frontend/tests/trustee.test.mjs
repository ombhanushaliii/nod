import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deriveEncKey, exportIntentHash, intentHash, open, seal } from '../../packages/arkiv/src/crypto.ts';
import { parseExportPayload, parsePaymentPayload } from '../../packages/arkiv/src/payload.ts';
import { decide, mergeRequests, NEW_PAYEE_WAIT_MS, readRequests, reasonFromTag, reasonsFor, trusteeReportersIn, whyFrom, withRefill } from '../src/wallet/trustee.ts';

const enc = deriveEncKey(`0x${'22'.repeat(65)}`);
const other = deriveEncKey(`0x${'33'.repeat(65)}`);
const PAIR = `0x${'aa'.repeat(32)}`;
const USER = '0x00000000000000000000000000000000000000a1';
const person = { pairId: PAIR, walletAddress: USER, limit: 100, mode: 'first_per_payee' };
const payload = {
  v: 1, kind: 'payment', paymentId: 'pay-1', to: '0x1234567890abcdef1234567890abcdef12345678',
  amount: '12500000', nonce: `0x${'ab'.repeat(32)}`, name: 'Landlord', reasons: ['new_payee', 'over_limit'],
  answers: [false, false, true], newPayee: true,
};
const row = (over = {}) => ({
  key: `0x${'CD'.repeat(32)}`, creator: USER.toUpperCase().replace('0X', '0x'), pairId: PAIR, kind: 'payment',
  createdAt: 1_000_000, sealed: seal(payload, enc.publicKey), ...over,
});
const read = (rows) => readRequests({
  rows, people: [person], open: (b) => open(b, enc.secretKey), parse: parsePaymentPayload, parseExport: parseExportPayload,
});

test('readRequests opens the user’s own request', () => {
  const [r] = read([row()]);
  assert.equal(r.id, `0x${'cd'.repeat(32)}`);
  assert.equal(r.pairId, PAIR);
  assert.equal(r.amount, 12.5);
  assert.equal(r.amountUnits, '12500000');
  assert.equal(r.expiresAt, 1_000_000 + 24 * 60 * 60 * 1000);
  assert.equal(r.why, 'limit');
  assert.deepEqual(r.answers, [false, false, true]);
});

test('readRequests drops other writers, other pairs, wrong keys and junk', () => {
  assert.equal(read([row({ creator: '0x00000000000000000000000000000000000000b2' })]).length, 0);
  assert.equal(read([row({ pairId: `0x${'bb'.repeat(32)}` })]).length, 0);
  assert.equal(read([row({ kind: 'export' })]).length, 0);
  assert.equal(read([row({ sealed: seal(payload, other.publicKey) })]).length, 0);
  assert.equal(read([row({ sealed: new Uint8Array(80) })]).length, 0);
  assert.equal(read([row({ sealed: seal({ ...payload, amount: '-1' }, enc.publicKey) })]).length, 0);
});

test('reasons read as words, and a flag makes it risky', () => {
  assert.equal(reasonFromTag('scam_report').tone, 'red');
  assert.equal(reasonFromTag('goplus:phishing_activities').title, 'Linked to phishing');
  assert.equal(whyFrom(['new_payee']), 'limit');
  assert.equal(whyFrom(['new_payee', 'look_alike']), 'flagged');
});

test('a report says what the address is, and replaces the generic row', () => {
  const rows = reasonsFor(['scam_report', 'reported:sanctioned', 'reported:phishing', 'new_payee'], 'user');
  assert.deepEqual(rows.map((r) => [r.title, r.tag]), [
    ['Sanctioned by the US government', 'sanctioned'],
    ['Reported for phishing', 'phishing'],
    ['New person', 'new'],
  ]);
  assert.equal(whyFrom(['reported:exploit']), 'flagged');
  // No category: the generic row stays.
  assert.deepEqual(reasonsFor(['scam_report'], 'trustee').map((r) => r.title), ['Reported as a scam']);
});

test('the same finding from a report and the outside check shows once, as the report', () => {
  const rows = reasonsFor(['scam_report', 'reported:sanctioned', 'goplus:sanctioned', 'goplus:stealing_attack'], 'trustee');
  assert.deepEqual(rows.map((r) => r.title), ['Sanctioned by the US government', 'Linked to stealing funds']);
  // Without the report, the outside label still shows.
  assert.deepEqual(reasonsFor(['goplus:sanctioned'], 'trustee').map((r) => r.title), ['On a sanctions list']);
});

test('wording follows who is reading', () => {
  assert.equal(reasonFromTag('new_payee', 'user').detail, "You've never paid this address.");
  assert.equal(reasonFromTag('new_payee', 'trustee').detail, 'They have never paid this address.');
  assert.equal(reasonFromTag('look_alike', 'user').title, 'Looks like someone you know');
});

test('security labels read as words from Nod; unknown ones still show', () => {
  assert.equal(reasonFromTag('goplus:stealing_attack').title, 'Linked to stealing funds');
  assert.equal(reasonFromTag('goplus:stealing_attack').detail, 'Nod links this wallet to stolen funds.');
  assert.equal(reasonFromTag('goplus:new_label').detail, 'Nod links this wallet to new label.');
  assert.equal(reasonFromTag('something_new').tag, 'check');
});

test('the trustee inbox shows report categories in words', () => {
  const [r] = read([row({ sealed: seal({ ...payload, reasons: ['scam_report', 'reported:exploit'] }, enc.publicKey) })]);
  assert.deepEqual(r.reasons.map((x) => x.title), ['Linked to a hack']);
  assert.equal(r.why, 'flagged');
});

test('mergeRequests keeps answers the trustee already gave', () => {
  const [fresh] = read([row()]);
  const answered = { ...fresh, status: 'allowed' };
  assert.equal(mergeRequests([answered], [fresh])[0].status, 'allowed');
  assert.equal(mergeRequests([], [fresh]).length, 1);
});

function deps(over = {}) {
  const log = { decisions: [], reports: 0, notified: 0 };
  return {
    log,
    deps: {
      intentHash,
      exportIntentHash,
      writeReport: async () => { log.reports++; return `0x${'ee'.repeat(32)}`; },
      writeDecision: async (d) => { log.decisions.push(d); return `0x${'ff'.repeat(32)}`; },
      notify: async () => { log.notified++; },
      now: () => 5_000,
      ...over,
    },
  };
}

test('allow binds to this exact payment and waits 24h for a new person', async () => {
  const [r] = read([row()]);
  const { log, deps: d } = deps();
  const patch = await decide(r, true, d);
  const [w] = log.decisions;
  assert.equal(w.verdict, 'allow');
  // Same test vector as the backend's intent.ts.
  assert.equal(w.intentHash, '0x7e35f3baf495f6f8baaaf7ddaac6ca1c703d2fcaca83d6f01ae1513b0ca5527e');
  assert.equal(w.validFrom, 5_000 + NEW_PAYEE_WAIT_MS);
  assert.equal(patch.status, 'allowed');
  assert.equal(log.notified, 1);
  assert.equal(log.reports, 0);
});

test('deny of a limit-only payment reports nothing', async () => {
  const [r] = read([row()]);
  assert.equal(r.why, 'limit');
  const { log, deps: d } = deps();
  const patch = await decide(r, false, d);
  assert.equal(log.reports, 0);
  assert.equal(log.decisions[0].verdict, 'deny');
  assert.equal(log.decisions[0].reportKey, undefined);
  assert.equal(patch.status, 'denied');
});

test('deny of a flagged payment reports the address, and still denies if the report fails', async () => {
  const [r] = read([row({ sealed: seal({ ...payload, reasons: ['look_alike', 'new_payee'] }, enc.publicKey) })]);
  assert.equal(r.why, 'flagged');
  const ok = deps();
  await decide(r, false, ok.deps);
  assert.equal(ok.log.decisions[0].reportKey, `0x${'ee'.repeat(32)}`);

  const failing = deps({ writeReport: async () => { throw new Error('down'); } });
  const patch = await decide(r, false, failing.deps);
  assert.equal(failing.log.decisions[0].verdict, 'deny');
  assert.equal(failing.log.decisions[0].reportKey, undefined);
  assert.equal(patch.status, 'denied');
});

test('a failed backend notice never undoes the decision', async () => {
  const [r] = read([row()]);
  const { deps: d } = deps({ notify: async () => { throw new Error('offline'); } });
  assert.equal((await decide(r, true, d)).status, 'allowed');
});

test('withRefill tops up once on insufficient funds', async () => {
  let calls = 0;
  let refills = 0;
  const out = await withRefill(async () => {
    if (calls++ === 0) throw new Error('insufficient funds for gas * price + value');
    return 'ok';
  }, async () => { refills++; });
  assert.equal(out, 'ok');
  assert.equal(refills, 1);
  await assert.rejects(withRefill(async () => { throw new Error('nonce too low'); }, async () => { refills++; }));
  assert.equal(refills, 1);
});

test('inviteTokenFrom takes only a well-formed invite link', async () => {
  const { inviteTokenFrom } = await import('../src/wallet/trustee.ts');
  const t = 'A'.repeat(42) + '_';
  // nod://trustee/invite?token=… as Linking.parse returns it
  assert.equal(inviteTokenFrom({ hostname: 'trustee', path: 'invite' }, t), t);
  // dev link: exp://host/--/trustee/invite
  assert.equal(inviteTokenFrom({ hostname: null, path: 'trustee/invite' }, t), t);
  assert.equal(inviteTokenFrom({ hostname: 'wallet', path: null }, t), null);
  assert.equal(inviteTokenFrom({ hostname: 'evil', path: 'trustee/invite/x' }, t), null);
  assert.equal(inviteTokenFrom({ hostname: 'trustee', path: 'invite' }, 'short'), null);
  assert.equal(inviteTokenFrom({ hostname: 'trustee', path: 'invite' }, [t]), null);
});

test('notifyDecision asks again while Arkiv catches up, then stops', async () => {
  const { notifyDecision } = await import('../src/wallet/trustee.ts');
  const waits = [];
  const answers = ['awaiting_trustee', 'ready'];
  let calls = 0;
  await notifyDecision(async () => ({ status: answers[calls++] }), async (ms) => { waits.push(ms); });
  assert.equal(calls, 2);
  assert.deepEqual(waits, [1500]);

  calls = 0;
  await notifyDecision(async () => { calls++; return { status: 'awaiting_trustee' }; }, async () => {});
  assert.equal(calls, 3);
});

const exportPayload = { v: 1, kind: 'export', exportId: 'exp-1', nonce: `0x${'cd'.repeat(32)}` };
const exportRow = (over = {}) => row({ kind: 'export', sealed: seal(exportPayload, enc.publicKey), ...over });

test('readRequests opens an export request, with the wallet from the pair', () => {
  const [r] = read([exportRow()]);
  assert.equal(r.kind, 'export');
  assert.equal(r.exportId, 'exp-1');
  assert.equal(r.userWallet, USER);
  assert.equal(r.status, 'pending');
  // A payment-shaped payload under kind export is dropped, and the other way round.
  assert.equal(read([exportRow({ sealed: seal(payload, enc.publicKey) })]).length, 0);
  assert.equal(read([row({ sealed: seal(exportPayload, enc.publicKey) })]).length, 0);
});

test('allow of an export binds to this wallet and nonce, usable now', async () => {
  const [r] = read([exportRow()]);
  const { log, deps: d } = deps();
  const patch = await decide(r, true, d);
  const [w] = log.decisions;
  assert.equal(w.verdict, 'allow');
  assert.equal(w.intentHash, exportIntentHash(USER, exportPayload.nonce));
  assert.equal(w.validFrom, 5_000);
  assert.equal(patch.status, 'allowed');
  assert.equal(log.notified, 1);
});

test('deny of an export reports nothing', async () => {
  const [r] = read([exportRow()]);
  const { log, deps: d } = deps();
  assert.equal((await decide(r, false, d)).status, 'denied');
  assert.equal(log.reports, 0);
  assert.equal(log.decisions[0].verdict, 'deny');
});

test('trustee reports read as one row with the count, for both sides', () => {
  const codes = ['scam_report', 'reported_by_trustees', 'trustee_reporters:3', 'new_payee'];
  assert.equal(trusteeReportersIn(codes), 3);
  const user = reasonsFor(codes, 'user');
  assert.deepEqual(user.map((r) => r.title), ['Reported by 3 trustees', 'New person']);
  assert.match(user[0].detail, /Your trustee has to OK this/);
  const trustee = reasonsFor(codes, 'trustee');
  assert.match(trustee[0].detail, /At 5, Nod blocks it for everyone/);
  assert.equal(reasonsFor(['scam_report', 'reported_by_trustees', 'trustee_reporters:1'], 'user')[0].title, 'Reported by 1 trustee');
  assert.equal(whyFrom(codes), 'flagged');
});

test('a blocked address says how many trustees reported it', () => {
  const [r] = reasonsFor(['blocked_by_trustees', 'trustee_reporters:6'], 'user');
  assert.equal(r.title, 'Blocked: reported by 6 trustees');
  assert.equal(r.tone, 'red');
});
