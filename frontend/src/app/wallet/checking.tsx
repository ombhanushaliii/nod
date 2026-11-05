import { router } from 'expo-router';
import { useEffect } from 'react';

import { Screen, Spinner, Txt } from '@/components';
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
  useBackGoesHome();

  useEffect(() => {
    const draft = useStore.getState().draft;
    if (!draft) {
      router.back();
      return;
    }
    let cancelled = false;
    // A short pause so "Checking…" reads as a real check, like the prototype (1.1s).
    const t = setTimeout(async () => {
      const res = await check(draft);
      if (cancelled) return;
      if (res.verdict === 'refused') haptic('warning');
      else if (res.verdict === 'needs_trustee') haptic(res.why === 'flagged' ? 'error' : 'warning');
      else if (res.verdict === 'cooldown') haptic('medium');
      router.replace(NEXT[res.verdict]);
    }, 1100);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run the check once per visit
  }, []);

  return (
    <Screen style={{ alignItems: 'center', justifyContent: 'center', gap: 22 }}>
      <Spinner />
      <Txt size={22} w={800} ls={-0.02}>
        Checking…
      </Txt>
      <Txt size={15} color={colors.sub}>
        Making sure it&apos;s safe
      </Txt>
    </Screen>
  );
}
