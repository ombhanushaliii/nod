import { createPublicClient, defineChain, http } from 'viem';
import { baseSepolia } from 'viem/chains';

import { walletConfig } from './config';

export { baseSepolia };
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

export const baseClient = createPublicClient({ chain: baseSepolia, transport: http(), cacheTime: 0 });
