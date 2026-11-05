import { useEffect, useState, useSyncExternalStore } from 'react';

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

const subscribeHydration = (onChange: () => void) => useStore.persist.onFinishHydration(onChange);
const getHydrated = () => useStore.persist.hasHydrated();

/** True once the persisted store has loaded from disk. */
export function useHydrated() {
  return useSyncExternalStore(subscribeHydration, getHydrated, getHydrated);
}
