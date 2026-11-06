import { PrivyProvider, useCreateWallet, useLoginWithOAuth, usePrivy, useSigners, useWallets } from '@privy-io/react-auth';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { EIP1193Provider } from 'viem';

import { useStore } from '@/data/store';
import type { Role, Session } from '@/data/types';

import { sepolia, rabdi } from './chains';
import { isDemo, walletConfig } from './config';
import { DemoWalletProvider, unavailableSession, WalletContext } from './context';
import { checkProvider, requireSignerPolicy } from './validation';

const PRIVY_START_TIMEOUT_MS = 15000;

export function WalletProvider({ children }: { children: ReactNode }) {
  if (isDemo) return <DemoWalletProvider>{children}</DemoWalletProvider>;
  if (!walletConfig.appId) {
    return <WalletContext.Provider value={{ ...unavailableSession, error: 'Configure your Privy app ID to sign in.' }}>{children}</WalletContext.Provider>;
  }
  return <PrivyProvider appId={walletConfig.appId} config={{
    loginMethods: ['google'],
    defaultChain: sepolia,
    supportedChains: walletConfig.rabdiRpcUrl ? [sepolia, rabdi] : [sepolia],
    embeddedWallets: { ethereum: { createOnLogin: 'all-users' } },
  }}><ConnectedSession>{children}</ConnectedSession></PrivyProvider>;
}

function loginPreferences(): Pick<Session, 'role' | 'method'> {
  try {
    const saved = JSON.parse(sessionStorage.getItem('haven-login') ?? 'null');
    if (saved) return { role: saved.role === 'trustee' ? 'trustee' : 'user', method: 'Google' };
  } catch {}
  return useStore.getState().session ?? { role: 'user', method: 'Google' };
}

function ConnectedSession({ children }: { children: ReactNode }) {
  const { user, ready, authenticated, logout, getAccessToken } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();
  const { initOAuth } = useLoginWithOAuth();
  const { addSigners } = useSigners();
  const [preferences, setPreferences] = useState(loginPreferences);
  const [error, setError] = useState<string | null>(null);
  // If Privy never starts (site not in Privy's allowed domains, no network) or
  // the wallets never load, the app would stay blank. Give up after a while so
  // the sign-in screen can say what's wrong. Same idea as the native provider.
  const phase = !ready ? 'privy' : authenticated && !walletsReady ? `wallets:${user?.id ?? ''}` : null;
  const [timedOut, setTimedOut] = useState<string | null>(null);
  useEffect(() => {
    if (!phase) return;
    const t = setTimeout(() => setTimedOut(phase), PRIVY_START_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [phase]);
  const startError = phase && timedOut === phase
    ? phase === 'privy'
      ? 'Privy is taking too long to start. Check your connection, and that this site is in Privy’s allowed domains.'
      : 'Your wallet is taking too long to load. Reload the page to try again.'
    : null;
  const creationAttempt = useRef<string | null>(null);
  const wallet = wallets.find((w) => w.walletClientType === 'privy');
  const contact = user?.google?.email ?? user?.email?.address ?? '';
  const name = user?.google?.name ?? '';
  const session = ready && authenticated && user && wallet ? { ...preferences, email: contact, name } : null;
  const currentAccount = useRef<string | undefined>(wallet?.address);
  const accountScope = authenticated ? wallet?.address : undefined;
  useEffect(() => {
    currentAccount.current = accountScope;
    return () => { currentAccount.current = undefined; };
  }, [accountScope]);

  const selectLogin = (role: Role, method: Session['method']) => {
    const selected = { role, method };
    setPreferences(selected);
    try { sessionStorage.setItem('haven-login', JSON.stringify(selected)); } catch {}
    setError(null);
  };

  useEffect(() => {
    if (!ready || !walletsReady || !authenticated || !user || wallet || creationAttempt.current === user.id) return;
    creationAttempt.current = user.id;
    void createWallet().catch(() => setError('Could not create your wallet. Sign out and try again.'));
  }, [ready, walletsReady, authenticated, user, wallet, createWallet]);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated || !user) { useStore.getState().signOut(); return; }
    if (wallet) useStore.getState().activateWalletSession(user.id, { ...preferences, email: contact, name });
  }, [ready, authenticated, user, wallet, preferences, contact, name]);

  const getProvider = useCallback(async (chainId: number = sepolia.id): Promise<EIP1193Provider> => {
    if (!ready || !authenticated || !wallet) throw new Error('Connect your wallet first.');
    const provider = await wallet.getEthereumProvider() as unknown as EIP1193Provider;
    await checkProvider(provider, wallet.address, chainId);
    if (currentAccount.current !== wallet.address) throw new Error('Your wallet session changed.');
    return provider;
  }, [ready, authenticated, wallet]);

  return <WalletContext.Provider value={{
    mode: 'privy', ready: !phase || !!startError, session, userId: user?.id ?? null,
    walletAddress: session ? wallet?.address ?? null : null, error: startError ?? error,
    signIn: async (role) => { selectLogin(role, 'Google'); await initOAuth({ provider: 'google' }); },
    switchRole: (role) => selectLogin(role, preferences.method),
    signOut: async () => { currentAccount.current = undefined; await logout(); creationAttempt.current = null; useStore.getState().signOut(); },
    getAccessToken, getProvider,
    enableBackendSigner: async () => {
      if (!ready || !authenticated || !wallet) throw new Error('Connect your wallet first.');
      const signer = requireSignerPolicy(walletConfig.signerId, walletConfig.policyId);
      await addSigners({ address: wallet.address, signers: [signer] });
    },
  }}>{children}</WalletContext.Provider>;
}
