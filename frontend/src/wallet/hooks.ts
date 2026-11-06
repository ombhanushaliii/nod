import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { erc20Abi, formatUnits, isAddress, type Address } from 'viem';

import { useStore } from '@/data/store';

import { apiRequest } from './backend';
import { paymentClient, USDC_ADDRESS } from './chains';
import { useWallet } from './context';

export function useWalletAuth() {
  const wallet = useWallet();
  const username = useStore((s) => s.username);
  return {
    ...wallet,
    role: wallet.session?.role ?? null,
    user: wallet.session ? { id: wallet.userId, email: wallet.session.email, username } : null,
  };
}

export function useUsdcBalance() {
  const { mode, walletAddress } = useWallet();
  const mockBalance = useStore((s) => s.balance);
  const [state, setState] = useState<{ address: string | null; units: bigint | null; loading: boolean; error: string | null }>({
    address: null, units: null, loading: false, error: null,
  });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  useEffect(() => {
    if (mode === 'demo' || !walletAddress || !isAddress(walletAddress)) return;
    let cancelled = false;
    let reading = false;
    const read = async () => {
      if (reading) return;
      reading = true;
      setState((s) => ({ address: walletAddress, units: s.address === walletAddress ? s.units : null, loading: true, error: null }));
      try {
        const units = await paymentClient.readContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [walletAddress as Address] });
        if (!cancelled) setState({ address: walletAddress, units, loading: false, error: null });
      } catch {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: 'Could not load your USDC balance. Try again.' }));
      } finally { reading = false; }
    };
    void read();
    const timer = setInterval(() => void read(), 20_000);
    const subscription = AppState.addEventListener('change', (next) => { if (next === 'active') void read(); });
    return () => { cancelled = true; clearInterval(timer); subscription.remove(); };
  }, [mode, walletAddress, revision]);
  const units = walletAddress && state.address === walletAddress ? state.units : null;
  return {
    balance: mode === 'demo' ? mockBalance : units === null ? 0 : Number(formatUnits(units, 6)),
    balanceUnits: units,
    hasBalance: mode === 'demo' || units !== null,
    symbol: 'USDC' as const,
    loading: mode !== 'demo' && !!walletAddress && (state.address !== walletAddress || state.loading),
    error: state.address === walletAddress ? state.error : null,
    refresh,
  };
}

/**
 * Registers the wallet with the backend (and tops up tGLM). The user's wallet
 * also lets the backend send its checked payments; a trustee sends none, so
 * their app passes signer: false.
 */
export function useWalletSetup({ signer = true }: { signer?: boolean } = {}) {
  const { enableBackendSigner, getAccessToken, walletAddress } = useWallet();
  return useCallback(async () => {
    if (!walletAddress) throw new Error('Connect your wallet first.');
    if (signer) await enableBackendSigner();
    return apiRequest(getAccessToken, '/onboarding/user', { walletAddress: walletAddress.toLowerCase() });
  }, [signer, enableBackendSigner, getAccessToken, walletAddress]);
}
