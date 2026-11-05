import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeFunctionData, erc20Abi } from 'viem';

import { sendCheckedPayment } from '../src/wallet/payments.ts';
import { amountString, buildUsdcTransfer } from '../src/wallet/transactions.ts';

const recipient = '0x1111111111111111111111111111111111111111';
const hash = `0x${'ab'.repeat(32)}`;
const noWait = async () => {};
const sameSession = () => {};

test('transfer encodes the exact recipient and six-decimal USDC amount on Base Sepolia', () => {
  const tx = buildUsdcTransfer(recipient, '1.000001');
  assert.equal(tx.chainId, '0x14a34');
  assert.equal(tx.to, '0x036cbd53842c5426634e7929541ec2318f3dcf7e');
  assert.equal(tx.value, '0x0');
  const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data });
  assert.equal(decoded.functionName, 'transfer');
  assert.deepEqual(decoded.args, [recipient, 1_000_001n]);
});

test('amount validation rejects rounding, exponent notation, negatives, and invalid recipients', () => {
  for (const value of [0, -1, NaN, Infinity, 0.0000001, 1e12, 0.1 + 0.2]) assert.throws(() => amountString(value));
  for (const value of ['1.0000001', '-1', '0', '1e6', '1junk']) assert.throws(() => buildUsdcTransfer(recipient, value));
  assert.throws(() => buildUsdcTransfer('not an address', '1'));
  assert.equal(amountString(0.000001), '0.000001');
});

test('a hash from submission is not presented as confirmed until the backend settles it', async () => {
  const calls = [];
  let reads = 0;
  const request = async (path, body) => {
    calls.push({ path, body });
    if (body) return { status: 'submitted', txHash: hash };
    reads++;
    return { status: reads === 3 ? 'sent' : reads === 1 ? 'ready' : 'submitted', txHash: reads === 3 ? hash : null };
  };
  assert.equal(await sendCheckedPayment('payment-1', { data: 'transfer' }, request, sameSession, noWait), hash);
  assert.equal(calls.filter((c) => c.body).length, 1);
  assert.equal(reads, 3);
});

test('retrying a submitted or sent payment never posts another send', async () => {
  for (const initial of ['submitted', 'sending', 'sent']) {
    let reads = 0;
    const request = async (_path, body) => {
      assert.equal(body, undefined);
      reads++;
      return { status: reads === 1 ? initial : 'sent', txHash: initial === 'sent' || reads > 1 ? hash : null };
    };
    assert.equal(await sendCheckedPayment('payment-1', {}, request, sameSession, noWait), hash);
  }
});

test('failure, invalid confirmation hashes, and pending timeout never return success', async () => {
  await assert.rejects(sendCheckedPayment('id', {}, async () => ({ status: 'failed', txHash: null }), sameSession, noWait), /transfer failed/);
  await assert.rejects(sendCheckedPayment('id', {}, async () => ({ status: 'sent', txHash: 'invalid' }), sameSession, noWait), /invalid transaction hash/);
  await assert.rejects(sendCheckedPayment('id', {}, async () => ({ status: 'submitted', txHash: null }), sameSession, noWait), /still confirming/);
});

test('switching accounts during a check prevents sending', async () => {
  let checks = 0;
  let sends = 0;
  const assertSession = () => { if (++checks > 1) throw new Error('session changed'); };
  const request = async (_path, body) => { if (body) sends++; return { status: 'ready', txHash: null }; };
  await assert.rejects(sendCheckedPayment('id', {}, request, assertSession, noWait), /session changed/);
  assert.equal(sends, 0);
});
