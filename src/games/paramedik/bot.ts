// Paramedik bot hook: a disconnected player is replaced by a manual-following bot (see content/solver.ts).
// SP bot treats the patient by the manual; PU bots only press 'hazir'. Deterministic: acts on tick multiples of 30.
import type { PlayerId } from '../../sim/types';
import { isTimed, nextAct } from './content/solver';
import type { PmInput, PmState } from './types';

export function botInput(s: PmState, id: PlayerId): PmInput {
  const p = s.players.find((q) => q.id === id);
  if (!p) return { seq: 0, act: null };
  const idle: PmInput = { seq: p.seq, act: null };
  if (s.phase === 'intro' || s.phase === 'result') return s.ready.includes(id) ? idle : { seq: p.seq + 1, act: { k: 'hazir' } };
  if (s.phase !== 'case' || p.role !== 'sp' || s.tick % 30) return idle;
  const act = nextAct(s);
  if (!act || (isTimed(act) && s.tick < s.busyUntil) || (act.k === 'cpr' && s.tick % 180)) return idle;
  return { seq: p.seq + 1, act };
}
