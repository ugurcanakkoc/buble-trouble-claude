import { supabase } from './supabase';

export interface ScoreEntry {
  players: string[]; // usernames
  level: number; // 1-based level reached
  score: number; // team score
}

export interface ScoreRow extends ScoreEntry {
  id: number;
  created_at: string;
}

// Host calls this once on game over.
export async function submitScore(entry: ScoreEntry): Promise<void> {
  const { error } = await supabase.from('scores').insert(entry);
  if (error) throw new Error(error.message);
}

// Best runs first: furthest level, then highest score.
export async function topScores(limit = 10): Promise<ScoreRow[]> {
  const { data, error } = await supabase
    .from('scores')
    .select('id, players, level, score, created_at')
    .order('level', { ascending: false })
    .order('score', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data as ScoreRow[];
}
