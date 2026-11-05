export const MIN = 6e4;
export const HOUR = 36e5;
export const DAY = 864e5;

export function money(n: number) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Money without a trailing ".00" — "$10", "$12.50". */
export function m0(n: number) {
  return money(n).replace('.00', '');
}

export function moneyParts(n: number) {
  return { whole: Math.floor(n).toLocaleString('en-US'), cents: money(n).split('.')[1] };
}

export function short(a?: string | null) {
  if (!a) return '';
  return a.startsWith('@') ? a : a.slice(0, 6) + '…' + a.slice(-4);
}

export function dur(ms: number) {
  ms = Math.max(0, ms);
  const h = Math.floor(ms / HOUR);
  const m = Math.floor((ms % HOUR) / MIN);
  const s = Math.floor((ms % MIN) / 1000);
  return h ? `${h}h ${m}m` : m ? `${m}m` : `${s}s`;
}

export function when(t: number, now: number) {
  const d = new Date(t);
  const n = new Date(now);
  const tm = new Date(now + DAY);
  const day =
    d.toDateString() === n.toDateString()
      ? 'Today'
      : d.toDateString() === tm.toDateString()
        ? 'Tomorrow'
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${day}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

export function ago(t: number, now: number) {
  const s = (now - t) / 1000;
  if (s < 60) return 'Now';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
}
