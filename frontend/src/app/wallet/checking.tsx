import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { Button, Screen, Spinner, Txt } from '@/components';
import { useStore } from '@/data/store';
import type { Verdict } from '@/data/types';
import { useCheckPayment } from '@/hooks/api';
import { useBackGoesHome } from '@/hooks/nav';
import { haptic } from '@/lib/haptics';
import { colors } from '@/theme';

const NEXT = {
  refused: '/wallet/refused',
  waiting: '/wallet/waiting',
  needs_trustee: '/wallet/flagged',
  safe: '/wallet/review',
  cooldown: '/wallet/cooldown',
} as const satisfies Record<Verdict, string>;

/** Runs the payment check, then replaces itself with the result screen. */
export default function Checking() {
  const check = useCheckPayment();
  const [error, setError] = useState<string | null>(null);
  useBackGoesHome();

  useEffect(() => {
    const draft = useStore.getState().draft;
    if (!draft) {
      router.back();
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await check(draft);
        if (cancelled) return;
        if (res.verdict === 'refused') haptic('warning');
        else if (res.verdict === 'needs_trustee') haptic(res.why === 'flagged' ? 'error' : 'warning');
        else if (res.verdict === 'cooldown') haptic('medium');
        router.replace(NEXT[res.verdict]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'The payment check failed. Try again.');
      }
    }, 1100);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run the check once per visit
  }, []);

  return (
    <Screen style={{ alignItems: 'center', justifyContent: 'center', gap: 22 }}>
      {!error && <Spinner />}
      <Txt size={22} w={800} ls={-0.02}>
        {error ? 'Could not check payment' : 'Checking…'}
      </Txt>
      <Txt size={15} color={colors.sub}>
        {error ?? "Making sure it's safe"}
      </Txt>
      {error && <Button label="Back to payment" onPress={() => router.back()} />}
    </Screen>
  );
}
