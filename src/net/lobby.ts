// Pure helpers (no network) so they can be unit-tested.
import { MAX_PLAYERS } from '../sim/types';
import type { JoinError, LobbyPlayer } from './types';

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;
export const HOST_COLOR = 0xff5a5a;
export const JOINER_COLORS = [0x4fc3ff, 0x7dff6b, 0xffd84a];

export interface PresenceMeta {
  id: string;
  name: string;
  color: number;
  isHost: boolean;
  inGame: boolean;
  online_at: number;
}

export function generateCode(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return s;
}

export const normalizeCode = (c: string): string => c.trim().toUpperCase();

/** First joiner color not already used by present players. */
export function pickColor(taken: number[]): number {
  return JOINER_COLORS.find((c) => !taken.includes(c)) ?? JOINER_COLORS[0];
}

// supabase presenceState shape: key -> array of metas (+ presence_ref). We only read the first.
export function parsePresence(state: Record<string, Array<Partial<PresenceMeta>>>): PresenceMeta[] {
  const out: PresenceMeta[] = [];
  for (const [key, metas] of Object.entries(state)) {
    const m = metas[0];
    if (!m) continue;
    out.push({
      id: m.id ?? key,
      name: m.name ?? '?',
      color: m.color ?? 0xffffff,
      isHost: !!m.isHost,
      inGame: !!m.inGame,
      online_at: m.online_at ?? 0,
    });
  }
  // host first, then by join time (id as stable tiebreak)
  return out.sort((a, b) => Number(b.isHost) - Number(a.isHost) || a.online_at - b.online_at || a.id.localeCompare(b.id));
}

export const toLobby = (metas: PresenceMeta[]): LobbyPlayer[] =>
  metas.map((m) => ({ id: m.id, name: m.name, color: m.color, isHost: m.isHost }));

export function joinError(metas: PresenceMeta[]): JoinError | null {
  const host = metas.find((m) => m.isHost);
  if (!host) return 'ROOM_NOT_FOUND';
  if (metas.length >= MAX_PLAYERS) return 'ROOM_FULL';
  if (host.inGame) return 'GAME_STARTED';
  return null;
}
