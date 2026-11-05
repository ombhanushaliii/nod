import { encodeFunctionData, erc20Abi, isAddress, parseUnits } from 'viem';

// Circle's native test USDC on Base Sepolia (6 decimals).
export const USDC_ADDRESS = '0x036cbd53842c5426634e7929541ec2318f3dcf7e';

export function amountString(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999_999_999_999) throw new Error('Enter a positive USDC amount.');
  const text = String(amount);
  if (!/^\d+(?:\.\d{1,6})?$/.test(text)) throw new Error('USDC amounts can have at most 6 decimal places.');
  return text;
}

export function buildUsdcTransfer(to: string, amount: string) {
  if (!isAddress(to)) throw new Error('Enter a valid recipient address.');
  if (!/^\d{1,12}(?:\.\d{1,6})?$/.test(amount) || parseUnits(amount, 6) <= 0n) throw new Error('Enter a valid USDC amount.');
  return {
    chainId: '0x14a34',
    to: USDC_ADDRESS,
    value: '0x0',
    data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, parseUnits(amount, 6)] }),
  };
}
