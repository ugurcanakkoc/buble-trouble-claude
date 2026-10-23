import type { GameState, InputState, Player } from './types';
import { WORLD_H, WORLD_W } from './types';
import { DT } from './geom';

export const PLAYER_W = 32;
export const PLAYER_H = 48;
const SPEED = 220;

/** Players always stand on the floor; only horizontal movement. */
export function movePlayer(p: Player, inp: InputState): void {
  const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  if (dir === 0) return;
  p.facing = dir > 0 ? 1 : -1;
  p.x = Math.max(PLAYER_W / 2, Math.min(WORLD_W - PLAYER_W / 2, p.x + dir * SPEED * DT));
}

/** Spread connected players across the floor. */
export function placePlayers(s: GameState): void {
  const active = s.players.filter((p) => p.connected);
  active.forEach((p, i) => {
    p.x = (WORLD_W * (i + 1)) / (active.length + 1);
    p.y = WORLD_H;
    p.facing = 1;
  });
}
