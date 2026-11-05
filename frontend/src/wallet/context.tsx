import { createContext, useContext, type ReactNode } from 'react';
import type { EIP1193Provider } from 'viem';

import { MY_ADDRESS } from '@/data/engine';
import { useStore } from '@/data/store';
import type { Role, Session } from '@/data/types';

import type { AccessToken } from './backend';

export type WalletSession = {
  mode: 'demo' | 'privy';
  ready: boolean;
  session: Session | null;
  userId: string | null;
  walletAddress: string | null;
  error: string | null;
  signIn: (role: Role, email?: string) => Promise<void>;
  sendPhoneCode: (role: Role, phone: string) => Promise<void>;
  verifyPhoneCode: (role: Role, phone: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: AccessToken;
  getProvider: (chainId?: number) => Promise<EIP1193Provider>;
  enableBackendSigner: () => Promise<void>;
};

const unavailable = async (): Promise<never> => { throw new Error('Wallet connection is unavailable.'); };
export const unavailableSession: WalletSession = {
  mode: 'privy', ready: true, session: null, userId: null, walletAddress: null, error: null,
  signIn: unavailable, sendPhoneCode: unavailable, verifyPhoneCode: unavailable,
  signOut: unavailable, getAccessToken: unavailable, getProvider: unavailable, enableBackendSigner: unavailable,
};
export const WalletContext = createContext<WalletSession>(unavailableSession);
export const useWallet = () => useContext(WalletContext);

export function DemoWalletProvider({ children }: { children: ReactNode }) {
  const session = useStore((s) => s.session);
  return <WalletContext.Provider value={{
    ...unavailableSession, mode: 'demo', session, walletAddress: session ? MY_ADDRESS : null,
    signIn: async (role, email = 'alex.rivera@gmail.com') => useStore.getState().signIn(role, email),
    signOut: async () => useStore.getState().signOut(),
  }}>{children}</WalletContext.Provider>;
}
