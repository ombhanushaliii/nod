import { PrivyProvider, useEmbeddedEthereumWallet, useLoginWithOAuth, usePrivy, useSigners } from '@privy-io/expo';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { EIP1193Provider } from 'viem';

import { useStore } from '@/data/store';
import type { Role, Session } from '@/data/types';

import { baseSepolia, rabdi } from './chains';
import { isDemo, walletConfig } from './config';
import { DemoWalletProvider, unavailableSession, WalletContext } from './context';
import { checkProvider, requireSignerPolicy } from './validation';

export function WalletProvider({ children }: { children: ReactNode }) {
  if (isDemo) return <DemoWalletProvider>{children}</DemoWalletProvider>;
  if (!walletConfig.appId || !walletConfig.clientId) {
    return <WalletContext.Provider value={{ ...unavailableSession, error: 'Privy needs a public app ID and a React Native client ID.' }}>{children}</WalletContext.Provider>;
  }
  return <PrivyProvider appId={walletConfig.appId} clientId={walletConfig.clientId}
    supportedChains={walletConfig.rabdiRpcUrl ? [baseSepolia, rabdi] : [baseSepolia]}
    config={{ embedded: { ethereum: { createOnLogin: 'all-users' } } }}>
    <ConnectedSession>{children}</ConnectedSession>
  </PrivyProvider>;
}

function ConnectedSession({ children }: { children: ReactNode }) {
  const { user, isReady, error, logout, getAccessToken } = usePrivy();
  const { wallets, create } = useEmbeddedEthereumWallet();
  const { login } = useLoginWithOAuth();
  const { addSigners } = useSigners();
  const [role, setRole] = useState<Role>(() => useStore.getState().session?.role ?? 'user');
  const [method, setMethod] = useState<Session['method']>(() => useStore.getState().session?.method ?? 'Google');
  const [walletError, setWalletError] = useState<string | null>(null);
  const creationAttempt = useRef<string | null>(null);
  const wallet = wallets.find((w) => w.walletIndex === 0) ?? wallets[0];
  const currentAccount = useRef<string | undefined>(wallet?.address);
  const accountScope = user ? wallet?.address : undefined;
  useEffect(() => {
    currentAccount.current = accountScope;
    return () => { currentAccount.current = undefined; };
  }, [accountScope]);
  const google = user?.linked_accounts.find((a) => a.type === 'google_oauth');
  const email = user?.linked_accounts.find((a) => a.type === 'email');
  const contact = google?.email ?? email?.address ?? '';
  const session: Session | null = isReady && user && wallet ? { role, email: contact, method } : null;

  useEffect(() => {
    if (!isReady || !user || wallet || creationAttempt.current === user.id) return;
    creationAttempt.current = user.id;
    void create().catch(() => setWalletError('Wallet creation failed. Sign out and try again.'));
  }, [isReady, user, wallet, create]);

  useEffect(() => {
    if (!isReady) return;
    if (!user) { useStore.getState().signOut(); return; }
    if (wallet) useStore.getState().activateWalletSession(user.id, { role, email: contact, method });
  }, [isReady, user, wallet, role, contact, method]);

  const getProvider = useCallback(async (chainId: number = baseSepolia.id): Promise<EIP1193Provider> => {
    if (!isReady || !user || !wallet) throw new Error('Wait for your wallet to finish connecting.');
    const provider = await wallet.getProvider() as unknown as EIP1193Provider;
    await checkProvider(provider, wallet.address, chainId);
    if (currentAccount.current !== wallet.address) throw new Error('Your wallet session changed.');
    return provider;
  }, [isReady, user, wallet]);

  return <WalletContext.Provider value={{
    mode: 'privy', ready: isReady, session, userId: user?.id ?? null,
    walletAddress: session ? wallet?.address ?? null : null,
    error: error ? 'Unable to restore your wallet session. Check your connection.' : walletError,
    signIn: async (nextRole) => {
      setRole(nextRole); setMethod('Google'); setWalletError(null);
      await login({ provider: 'google' });
    },
    signOut: async () => { currentAccount.current = undefined; await logout(); creationAttempt.current = null; useStore.getState().signOut(); },
    getAccessToken, getProvider,
    enableBackendSigner: async () => {
      if (!wallet || !isReady || !user) throw new Error('Connect your wallet first.');
      const signer = requireSignerPolicy(walletConfig.signerId, walletConfig.policyId);
      await addSigners({ address: wallet.address, signers: [signer] });
    },
  }}>{children}</WalletContext.Provider>;
}
