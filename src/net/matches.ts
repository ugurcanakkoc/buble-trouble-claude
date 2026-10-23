import type { GameId } from '../games/types';
import { supabase } from './supabase';

export interface MatchRecord {
  game: GameId;
  mode: string;
  players: string[]; // usernames of humans in the match (no bots)
  winners: string[]; // subset of players; [] = draw or AI won
  stats?: Record<string, unknown>; // small per-game summary, e.g. { kills: { Ali: 3 } }
  durationS: number;
}

export interface MatchRow extends Omit<MatchRecord, 'durationS'> {
  id: number;
  duration_s: number;
  created_at: string;
}

// Host calls this once per finished match. Failures are non-fatal for the game.
export async function recordMatch(m: MatchRecord): Promise<void> {
  const { error } = await supabase.from('matches').insert({
    game: m.game, mode: m.mode, players: m.players, winners: m.winners, stats: m.stats ?? {}, duration_s: Math.round(m.durationS),
  });
  if (error) throw new Error(error.message);
}

export async function recentMatches(game: GameId, limit = 200): Promise<MatchRow[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('id, game, mode, players, winners, stats, duration_s, created_at')
    .eq('game', game)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data as MatchRow[];
}

export interface PlayerTally { name: string; played: number; wins: number }

// Wins/played per username across the given rows, best win count first.
export function tally(rows: Pick<MatchRow, 'players' | 'winners'>[]): PlayerTally[] {
  const by = new Map<string, PlayerTally>();
  for (const r of rows) {
    for (const p of r.players) {
      const t = by.get(p) ?? { name: p, played: 0, wins: 0 };
      t.played++;
      if (r.winners.includes(p)) t.wins++;
      by.set(p, t);
    }
  }
  return [...by.values()].sort((a, b) => b.wins - a.wins || a.played - b.played || a.name.localeCompare(b.name));
}

// Head-to-head between two names: matches they were both in, and who won each.
export function headToHead(rows: Pick<MatchRow, 'players' | 'winners'>[], a: string, b: string): { a: number; b: number; draws: number } {
  const out = { a: 0, b: 0, draws: 0 };
  for (const r of rows) {
    if (!r.players.includes(a) || !r.players.includes(b)) continue;
    const wa = r.winners.includes(a), wb = r.winners.includes(b);
    if (wa && !wb) out.a++;
    else if (wb && !wa) out.b++;
    else out.draws++;
  }
  return out;
}
