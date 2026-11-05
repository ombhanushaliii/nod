export const walletConfig = {
  mode: process.env.EXPO_PUBLIC_WALLET_MODE === 'demo' ? 'demo' : 'privy',
  appId: process.env.EXPO_PUBLIC_PRIVY_APP_ID?.trim() ?? '',
  clientId: process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID?.trim() ?? '',
  signerId: process.env.EXPO_PUBLIC_PRIVY_SIGNER_ID?.trim() ?? '',
  policyId: process.env.EXPO_PUBLIC_PRIVY_SIGNER_POLICY_ID?.trim() ?? '',
  apiUrl: process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, '') ?? '',
  rabdiRpcUrl: process.env.EXPO_PUBLIC_RABDI_RPC_URL?.trim() ?? '',
} as const;

export const isDemo = walletConfig.mode === 'demo';
