import type { GameState, Player, PowerUpKind, SimEvent } from './types';
import { TICK_RATE, WORLD_H } from './types';
import { DT, isSolid } from './geom';
import { random } from './rng';
import { PLAYER_H, PLAYER_W } from './players';

export const POWERUP_KINDS: PowerUpKind[] = ['shield', 'clock', 'dynamite', 'life', 'time', 'double', 'sticky', 'gun'];
export const POWERUP_SIZE = 20;
const DROP_CHANCE = 0.15;
const FALL_SPEED = 150;
const LIFETIME = 6 * TICK_RATE;

export function maybeDropPowerUp(s: GameState, x: number, y: number): void {
  if (random(s) >= DROP_CHANCE) return;
  const kind = POWERUP_KINDS[Math.floor(random(s) * POWERUP_KINDS.length)];
  // expiresAt = 0 while falling; set when it lands.
  s.powerUps.push({ id: s.nextId++, kind, x, y, vy: FALL_SPEED, expiresAt: 0 });
}

export function applyPowerUp(s: GameState, p: Player, kind: PowerUpKind): void {
  switch (kind) {
    case 'shield': p.shield = true; break;
    case 'clock': s.freezeUntil = s.tick + 5 * TICK_RATE; break;
    case 'dynamite': for (const b of s.balls) b.size = 0; break;
    case 'life': s.lives++; break;
    case 'time': s.timeLeftTicks += 10 * TICK_RATE; break;
    default: p.weapon = kind;
  }
}

export function updatePowerUps(s: GameState, fighters: Player[], events: SimEvent[]): void {
  const half = POWERUP_SIZE / 2;
  s.powerUps = s.powerUps.filter((u) => {
    if (u.vy > 0) {
      const ny = u.y + u.vy * DT;
      let floor = WORLD_H;
      for (const k of s.blocks) {
        if (isSolid(k) && u.x >= k.x && u.x <= k.x + k.w && k.y >= u.y + half && k.y < floor) floor = k.y;
      }
      u.y = Math.min(ny, floor - half);
      if (u.y === floor - half) { u.vy = 0; u.expiresAt = s.tick + LIFETIME; }
    } else if (s.tick >= u.expiresAt) return false;

    for (const p of fighters) {
      if (p.trapped) continue;
      if (Math.abs(p.x - u.x) < PLAYER_W / 2 + half && u.y + half > p.y - PLAYER_H && u.y - half < p.y) {
        applyPowerUp(s, p, u.kind);
        events.push({ type: 'powerup', kind: u.kind, playerId: p.id });
        return false;
      }
    }
    return true;
  });
}
