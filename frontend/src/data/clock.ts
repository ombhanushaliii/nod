import { useEffect, useState } from 'react';

import { useStore } from './store';

/** Current (simulated) time that re-renders every second, for countdowns and "unlocks in" text. */
export function useNow(intervalMs = 1000) {
  const offset = useStore((s) => s.offset);
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return t + offset;
}

/** True once the persisted store has loaded from disk. */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(() => useStore.persist.hasHydrated());
  useEffect(() => {
    if (useStore.persist.hasHydrated()) setHydrated(true);
    return useStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);
  return hydrated;
}
