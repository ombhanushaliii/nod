import { walletConfig } from './config';

export type AccessToken = () => Promise<string | null>;

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export async function apiRequest<T>(getToken: AccessToken, path: string, body?: unknown): Promise<T> {
  if (!walletConfig.apiUrl) throw new Error('Configure EXPO_PUBLIC_API_URL to connect your wallet.');
  const token = await getToken();
  if (!token) throw new Error('Sign in again to continue.');
  const response = await fetch(`${walletConfig.apiUrl}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new ApiError(response.status, data.error ?? 'api_error', data.message ?? 'Wallet request failed.');
  return data as T;
}
