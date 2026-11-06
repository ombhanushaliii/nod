import { createPublicClient, defineChain, fallback, http } from 'viem';
import { sepolia } from 'viem/chains';

import { walletConfig } from './config';

// Payments (USDC) run on Ethereum Sepolia; Arkiv data lives on Rabdi.
export { sepolia };
export const RABDI_CHAIN_ID = 7794095;
// Circle's native test USDC, 6 decimals. Keep in sync with the backend sender.
export { USDC_ADDRESS } from './transactions';
export const rabdi = defineChain({
  id: RABDI_CHAIN_ID,
  name: 'Arkiv Rabdi',
  nativeCurrency: { name: 'Test GLM', symbol: 'tGLM', decimals: 18 },
  rpcUrls: { default: { http: [walletConfig.rabdiRpcUrl] } },
  blockExplorers: { default: { name: 'Arkiv Explorer', url: 'https://rabdi.explorer.arkiv.network' } },
  testnet: true,
});

// viem's default Sepolia RPC (thirdweb's free endpoint) rate-limits shared traffic and then
// every balance read fails. Try a few public endpoints in turn; the default stays last.
const SEPOLIA_RPCS = ['https://ethereum-sepolia-rpc.publicnode.com', 'https://sepolia.gateway.tenderly.co', undefined];
export const paymentClient = createPublicClient({
  chain: sepolia,
  transport: fallback(SEPOLIA_RPCS.map((url) => http(url, { timeout: 8_000, retryCount: 0 }))),
  cacheTime: 0,
});
