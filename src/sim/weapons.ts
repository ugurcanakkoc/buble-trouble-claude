import type { GameState, InputState, Projectile, SimEvent } from './types';
import { TICK_RATE } from './types';
import { BALL_RADIUS, popBall } from './balls';
import { DT, circleHitsVSeg, isSolid } from './geom';
import { PLAYER_H, type SimPlayer } from './players';

export const HARPOON_SPEED = 600;
export const BULLET_SPEED = 900;
export const GUN_INTERVAL = TICK_RATE / 8; // ticks between shots (fractional)
export const MAX_BULLETS = 6;
export const STICKY_TICKS = 3 * TICK_RATE;

export function fire(s: GameState, p: SimPlayer, inp: InputState, events: SimEvent[]): void {
  const pressed = inp.fire && !p.fireHeld;
  const mine = s.projectiles.filter((q) => q.owner === p.id).length;
  if (p.weapon === 'gun') {
    const next = p.nextFireTick ?? 0;
    if (!inp.fire || s.tick < next || mine >= MAX_BULLETS) return;
    // Keep the fractional schedule while firing continuously; restart it after a pause.
    p.nextFireTick = (s.tick - next < 1 ? next : s.tick) + GUN_INTERVAL;
    const y = p.y - PLAYER_H;
    s.projectiles.push({ id: s.nextId++, owner: p.id, kind: 'gun', x: p.x, y, baseY: y, stuckUntil: 0 });
  } else {
    if (!pressed || mine >= (p.weapon === 'double' ? 2 : 1)) return;
    s.projectiles.push({ id: s.nextId++, owner: p.id, kind: p.weapon, x: p.x, y: p.y, baseY: p.y, stuckUntil: 0 });
  }
  events.push({ type: 'shoot', playerId: p.id, kind: p.weapon });
}

/** Move projectiles, pop balls they touch, stop them at the ceiling / blocks. */
export function updateProjectiles(s: GameState, events: SimEvent[]): void {
  s.projectiles = s.projectiles.filter((q) => {
    if (q.stuckUntil > 0) return s.tick < q.stuckUntil && !hitBall(s, q, q.y, q.baseY, events);

    const gun = q.kind === 'gun';
    const prevY = q.y;
    let ny = q.y - (gun ? BULLET_SPEED : HARPOON_SPEED) * DT;
    // Lowest solid bottom above the projectile in its column.
    let stop = 0;
    let block = null;
    for (const k of s.blocks) {
      const bottom = k.y + k.h;
      if (isSolid(k) && q.x >= k.x && q.x <= k.x + k.w && bottom <= prevY && bottom > stop) { stop = bottom; block = k; }
    }
    const ended = ny <= stop;
    if (ended) ny = stop;
    q.y = ny;
    if (gun) q.baseY = ny;

    if (hitBall(s, q, ny, gun ? prevY : q.baseY, events)) return false;
    if (!ended) return true;
    if (block && block.kind === 'breakable') {
      if (--block.hp <= 0) {
        s.blocks.splice(s.blocks.indexOf(block), 1);
        events.push({ type: 'blockBreak', x: block.x + block.w / 2, y: block.y + block.h / 2 });
      }
      return false;
    }
    if (q.kind === 'sticky') { q.stuckUntil = s.tick + STICKY_TICKS; return true; }
    return false;
  });
}

function hitBall(s: GameState, q: Projectile, top: number, bottom: number, events: SimEvent[]): boolean {
  const ball = s.balls.find((b) => circleHitsVSeg(b.x, b.y, BALL_RADIUS[b.size], q.x, top, bottom));
  if (!ball) return false;
  popBall(s, ball, q.owner, events);
  return true;
}
