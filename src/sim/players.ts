import type { GameState, InputState, Player } from './types';
import { WORLD_H, WORLD_W } from './types';
import { DT, isSolid } from './geom';

export const PLAYER_W = 32;
export const PLAYER_H = 48;
const SPEED = 220;
const CLIMB_SPEED = 160;
const FALL_SPEED = 360;

/**
 * Sim-private per-player fields, stored on the Player object (plain JSON, survives snapshots).
 * fireHeld: fire button state last tick (harpoons are edge-triggered).
 * nextFireTick: gun cooldown (fractional ticks, 8 shots/s).
 */
export interface SimPlayer extends Player {
  fireHeld: boolean;
  nextFireTick: number;
}

function overlapsSolid(s: GameState, x: number, y: number): boolean {
  const l = x - PLAYER_W / 2, r = x + PLAYER_W / 2, t = y - PLAYER_H;
  return s.blocks.some((k) => isSolid(k) && l < k.x + k.w && r > k.x && t < k.y + k.h && y > k.y);
}

export function movePlayer(s: GameState, p: Player, inp: InputState): void {
  const ladder = s.blocks.find(
    (k) => k.kind === 'ladder' && Math.abs(p.x - (k.x + k.w / 2)) <= k.w / 2 && p.y >= k.y && p.y <= k.y + k.h,
  );
  if (!ladder) p.onLadder = false;
  else if (inp.up || inp.down) p.onLadder = true;
  if (ladder && p.onLadder) {
    if (inp.up) p.y = Math.max(ladder.y, p.y - CLIMB_SPEED * DT);
    if (inp.down) p.y = Math.min(ladder.y + ladder.h, p.y + CLIMB_SPEED * DT);
  }

  const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  if (dir !== 0) {
    p.facing = dir > 0 ? 1 : -1;
    const nx = Math.max(PLAYER_W / 2, Math.min(WORLD_W - PLAYER_W / 2, p.x + dir * SPEED * DT));
    // Allow moving out if already overlapping (e.g. climbed next to a platform).
    if (!overlapsSolid(s, nx, p.y) || overlapsSolid(s, p.x, p.y)) p.x = nx;
  }

  if (!p.onLadder) {
    // Gravity: fall at constant speed until the floor or a surface (solid top or ladder top) under the feet.
    let floor = WORLD_H;
    for (const k of s.blocks) {
      if (p.x >= k.x && p.x <= k.x + k.w && k.y >= p.y && k.y < floor) floor = k.y;
    }
    p.y = Math.min(p.y + FALL_SPEED * DT, floor);
  }
}

/** Spread connected players across the floor. */
export function placePlayers(s: GameState): void {
  const active = s.players.filter((p) => p.connected);
  active.forEach((p, i) => {
    p.x = (WORLD_W * (i + 1)) / (active.length + 1);
    p.y = WORLD_H;
    p.onLadder = false;
    p.facing = 1;
  });
}
