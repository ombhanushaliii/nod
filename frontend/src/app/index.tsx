import { Redirect } from 'expo-router';

import { useStore } from '@/data/store';

/** Entry point: send each role to its own home. */
export default function Index() {
  const role = useStore((s) => s.session?.role ?? null);
  if (role === 'user') return <Redirect href="/wallet" />;
  if (role === 'trustee') return <Redirect href="/trustee" />;
  return <Redirect href="/login" />;
}
