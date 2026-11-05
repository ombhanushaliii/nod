import { Redirect } from 'expo-router';

import { useAuth } from '@/hooks/api';

/** Entry point: send each role to its own home. */
export default function Index() {
  const { role } = useAuth();
  if (role === 'user') return <Redirect href="/wallet" />;
  if (role === 'trustee') return <Redirect href="/trustee" />;
  return <Redirect href="/login" />;
}
