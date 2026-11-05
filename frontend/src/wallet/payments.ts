type PaymentView = { status: string; txHash: string | null };
type PaymentRequest = <T>(path: string, body?: unknown) => Promise<T>;

/** Resume an already submitted payment after timeouts; never create a new intent. */
export async function sendCheckedPayment(
  paymentId: string,
  tx: unknown,
  request: PaymentRequest,
  assertSession: () => void,
  wait = () => new Promise<void>((resolve) => setTimeout(resolve, 2000)),
): Promise<string> {
  const path = `/payments/${encodeURIComponent(paymentId)}`;
  const confirmedHash = (payment: PaymentView) => {
    if (payment.status === 'failed') throw new Error('The transfer failed. Check your payment history before trying again.');
    if (payment.status !== 'sent') return null;
    if (!payment.txHash || !/^0x[\da-f]{64}$/i.test(payment.txHash)) throw new Error('The backend returned an invalid transaction hash.');
    return payment.txHash;
  };
  assertSession();
  let payment = await request<PaymentView>(path);
  assertSession();
  const existingHash = confirmedHash(payment);
  if (existingHash) return existingHash;
  if (!['submitted', 'sending'].includes(payment.status)) {
    await request(`${path}/send`, { tx });
  }
  for (let attempt = 0; attempt < 30; attempt++) {
    await wait();
    assertSession();
    payment = await request<PaymentView>(path);
    assertSession();
    const hash = confirmedHash(payment);
    if (hash) return hash;
  }
  throw new Error('Your payment is still confirming. Return to this payment to check again; do not start another transfer.');
}
