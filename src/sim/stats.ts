import type { GameState, Player } from './types';
import { TICK_RATE } from './types';

export const totalPops = (p: Player) => p.stats.pops.reduce((a, b) => a + b, 0);

/** Co-op MVP = highest score (ties: more pops, then seating order). Null if nobody scored. */
export function mvpOf(players: Player[]): Player | null {
  const best = [...players].sort((a, b) => b.score - a.score || totalPops(b) - totalPops(a))[0];
  return best && best.score > 0 ? best : null;
}

/** Names that count as winners: god = most round wins (ties -> all tied, 0 wins -> nobody); co-op = the MVP. */
export function matchWinners(s: GameState): string[] {
  if (s.mode === 'god' && s.god) {
    const w = (p: Player) => s.god!.roundWins[p.id] ?? 0;
    const best = Math.max(0, ...s.players.map(w));
    return best > 0 ? s.players.filter((p) => w(p) === best).map((p) => p.name) : [];
  }
  const m = mvpOf(s.players);
  return m ? [m.name] : [];
}

/** Everything `recordMatch` needs except game/mode ids. */
export function matchSummary(s: GameState) {
  return {
    players: s.players.map((p) => p.name),
    winners: matchWinners(s),
    stats: { score: Object.fromEntries(s.players.map((p) => [p.name, p.score])), level: s.levelIndex + 1 },
    durationS: s.tick / TICK_RATE,
  };
}
