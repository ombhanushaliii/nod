import { numberToHex, type EIP1193Provider } from 'viem';

import { baseSepolia, RABDI_CHAIN_ID } from './chains';
import { walletConfig } from './config';

export function requireSignerPolicy(signerId: string, policyId: string) {
  if (!signerId || !policyId) throw new Error('Configure the backend signer and its USDC policy first.');
  // An empty policy list grants unrestricted signer access in Privy.
  return { signerId, policyIds: [policyId] };
}

export async function checkProvider(provider: EIP1193Provider, address: string, chainId: number) {
  if (chainId !== baseSepolia.id && chainId !== RABDI_CHAIN_ID) throw new Error('Unsupported wallet network.');
  if (chainId === RABDI_CHAIN_ID && !walletConfig.rabdiRpcUrl) throw new Error('Configure your Rabdi RPC URL first.');
  await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: numberToHex(chainId) }] });
  const actualChain = await provider.request({ method: 'eth_chainId' });
  const accounts = await provider.request({ method: 'eth_accounts' });
  if (Number(BigInt(actualChain)) !== chainId || accounts[0]?.toLowerCase() !== address.toLowerCase()) {
    throw new Error('Wallet account or network changed. Reconnect and try again.');
  }
}
