import type { Ball, BallSize, GameState, SimEvent } from './types';
import { WORLD_H, WORLD_W } from './types';
import { DT, circleHitsBox, isSolid } from './geom';
import { maybeDropPowerUp } from './powerups';

/** Radius by size (index = BallSize). */
export const BALL_RADIUS: readonly number[] = [9, 16, 26, 40];
/** Score per pop by size. */
export const BALL_SCORE: readonly number[] = [200, 150, 100, 50];
/** Center y at the top of a floor bounce, by size. Fixed so bounces never drift. */
const APEX_Y = [330, 250, 170, 100];
export const BALL_GRAVITY = 600;
export const BALL_VX = 100;
const SPLIT_KICK = 250;

/** Upward speed needed after a floor bounce to reach the size's apex. */
export const bounceSpeed = (size: BallSize) =>
  Math.sqrt(2 * BALL_GRAVITY * (WORLD_H - BALL_RADIUS[size] - APEX_Y[size]));

export function moveBalls(s: GameState): void {
  for (const b of s.balls) {
    const r = BALL_RADIUS[b.size];
    const px = b.x;
    const py = b.y;
    b.vy += BALL_GRAVITY * DT;
    b.x += b.vx * DT;
    b.y += b.vy * DT;

    if (b.x - r < 0) { b.x = r; b.vx = Math.abs(b.vx); }
    if (b.x + r > WORLD_W) { b.x = WORLD_W - r; b.vx = -Math.abs(b.vx); }
    if (b.y - r < 0) { b.y = r; b.vy = Math.abs(b.vy); }
    if (b.y + r >= WORLD_H) { b.y = WORLD_H - r; b.vy = -bounceSpeed(b.size); }

    for (const k of s.blocks) {
      if (!isSolid(k) || !circleHitsBox(b.x, b.y, r, k.x, k.y, k.w, k.h)) continue;
      // Decide the face from where the ball was last tick (robust when the center tunnels in).
      if (py + r <= k.y) { b.y = k.y - r; b.vy = -Math.abs(b.vy); }
      else if (py - r >= k.y + k.h) { b.y = k.y + k.h + r; b.vy = Math.abs(b.vy); }
      else if (px < k.x + k.w / 2) { b.x = k.x - r; b.vx = -Math.abs(b.vx); }
      else { b.x = k.x + k.w + r; b.vx = Math.abs(b.vx); }
    }
  }
}

/** Pop a ball: score, event, split into two smaller balls, maybe drop a power-up. */
export function popBall(s: GameState, ball: Ball, playerId: string, events: SimEvent[]): void {
  s.balls.splice(s.balls.indexOf(ball), 1);
  const owner = s.players.find((p) => p.id === playerId);
  if (owner) owner.score += BALL_SCORE[ball.size];
  events.push({ type: 'pop', x: ball.x, y: ball.y, size: ball.size, playerId });
  if (ball.size > 0) {
    const size = (ball.size - 1) as BallSize;
    const vy = Math.min(ball.vy, -SPLIT_KICK);
    for (const dir of [-1, 1]) {
      s.balls.push({ id: s.nextId++, x: ball.x, y: ball.y, vx: dir * BALL_VX, vy, size, color: ball.color });
    }
  }
  maybeDropPowerUp(s, ball.x, ball.y);
}
