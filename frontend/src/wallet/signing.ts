import { deriveEncKey, derivePairKey, pairKeyMessage } from '@guardian/arkiv/src/crypto';
import { createWalletClient } from '@arkiv-network/sdk';
import { custom, stringToHex, type EIP1193Provider, type Hex } from 'viem';

import { rabdi, RABDI_CHAIN_ID } from './chains';
import { useWallet } from './context';

export const ENCRYPTION_KEY_MESSAGE = 'guardian-encryption:v1';

export async function signDerivationMessage(provider: EIP1193Provider, address: string, message: string): Promise<Hex> {
  const accounts = await provider.request({ method: 'eth_accounts' });
  if (accounts[0]?.toLowerCase() !== address.toLowerCase()) throw new Error('The connected wallet changed.');
  const signature = await provider.request({ method: 'personal_sign', params: [stringToHex(message), accounts[0]] });
  if (!/^0x[\da-f]{130}$/i.test(signature)) throw new Error('The wallet returned an invalid signature.');
  return signature;
}

/** Signing material stays in memory. Only addresses/public keys may go to the API. */
export function useWalletSigning() {
  const { getProvider, walletAddress } = useWallet();
  return {
    getArkivWalletClient: async () => {
      if (!walletAddress) throw new Error('Connect your wallet first.');
      const provider = await getProvider(RABDI_CHAIN_ID);
      const [accounts, chainId] = await Promise.all([
        provider.request({ method: 'eth_accounts' }), provider.request({ method: 'eth_chainId' }),
      ]);
      if (Number(BigInt(chainId)) !== RABDI_CHAIN_ID || accounts[0]?.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new Error('Reconnect your wallet to Rabdi before writing.');
      }
      return createWalletClient({ chain: rabdi, account: accounts[0], transport: custom(provider, { retryCount: 0 }) });
    },
    deriveTrusteeKeys: async (pairId: string) => {
      if (!/^0x[\da-f]{64}$/i.test(pairId)) throw new Error('Invalid trustee pair ID.');
      if (!walletAddress) throw new Error('Connect your wallet first.');
      const provider = await getProvider();
      const pairSignature = await signDerivationMessage(provider, walletAddress, pairKeyMessage(pairId.toLowerCase()));
      const encSignature = await signDerivationMessage(provider, walletAddress, ENCRYPTION_KEY_MESSAGE);
      return { pair: derivePairKey(pairSignature), encryption: deriveEncKey(encSignature) };
    },
  };
}
