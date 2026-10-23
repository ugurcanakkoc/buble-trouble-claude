// Pure formatting helpers for the Skor Tablosu panel.
import type { PlayerTally } from '../net';

export const fmtDuration = (s: number) => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

const pad = (n: number) => String(n).padStart(2, '0');
/** "23.10 14:05" (local time) */
export const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(+d) ? '' : `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const winPct = (t: PlayerTally) => (t.played ? Math.round((t.wins / t.played) * 100) : 0);

/** Opponent `me` shared the most matches with (ties: alphabetical); falls back to the top other player. */
export function defaultOpponent(rows: { players: string[] }[], me: string, names: string[]): string | null {
  const n = new Map<string, number>();
  for (const r of rows) if (r.players.includes(me)) for (const p of r.players) if (p !== me) n.set(p, (n.get(p) ?? 0) + 1);
  const best = [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  return best ?? names.find((x) => x !== me) ?? null;
}

export const h2hText = (a: string, b: string, r: { a: number; b: number; draws: number }) =>
  `${a} ${r.a} – ${r.b} ${b}` + (r.draws ? ` (${r.draws} berabere)` : '');
