import type { BallSize, GameState, LevelDef } from './types';
import { WORLD_H, WORLD_W } from './types';
import { BALL_RADIUS, BALL_VX, moveBalls } from './balls';
import { circleHitsBox } from './geom';
import { PLAYER_H, PLAYER_W } from './players';
import levelsJson from './levels.json';

export const LEVELS = levelsJson as LevelDef[];
export const DEFAULT_BALL_Y = 100;

/** Ball "mass": a size-n ball is worth 2^n size-0 balls. */
export const levelMass = (l: LevelDef) => l.balls.reduce((m, b) => m + 2 ** b.size, 0);
/** Seconds of level time guaranteed per unit of mass (see tests). */
export const MIN_SECONDS_PER_MASS = 1.2;
export const MIN_LEVEL_SECONDS = 25;

type Blocks = LevelDef['blocks'];
const LAYOUTS: Blocks[] = [
  [{ kind: 'wall', x: 330, y: 240, w: 300, h: 16 }],
  [{ kind: 'wall', x: 120, y: 230, w: 200, h: 16 }, { kind: 'wall', x: 640, y: 230, w: 200, h: 16 }],
  [{ kind: 'wall', x: 300, y: 0, w: 24, h: 200 }, { kind: 'wall', x: 636, y: 0, w: 24, h: 200 }],
  [0, 1, 2, 3, 4].map((i) => ({ kind: 'breakable' as const, x: 280 + i * 80, y: 200, w: 80, h: 24, hp: 1 + (i % 3) })),
  [{ kind: 'wall', x: 80, y: 300, w: 160, h: 16 }, { kind: 'wall', x: 400, y: 200, w: 160, h: 16 }, { kind: 'wall', x: 720, y: 300, w: 160, h: 16 }],
];

// Every spawn x for 1..4 players (see placePlayers).
const SPAWN_XS = [1, 2, 3, 4].flatMap((n) => Array.from({ length: n }, (_, i) => (WORLD_W * (i + 1)) / (n + 1)));
const SAFE_TICKS = 150; // idle players must survive this long after balls start moving (2.5 s)
const SAFE_MARGIN = 12;

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    let t = (a = (a + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Simulate one ball alone and check it never comes near any spawn position early on. */
function ballIsFair(ball: LevelDef['balls'][number], speed: number, blocks: Blocks): boolean {
  const y = ball.y ?? DEFAULT_BALL_Y;
  const r = BALL_RADIUS[ball.size];
  if (blocks.some((k) => circleHitsBox(ball.x, y, r, k.x, k.y, k.w, k.h))) return false;
  const sim = {
    balls: [{ id: 0, x: ball.x, y, vx: ball.dir * BALL_VX * speed, vy: 0, size: ball.size, color: 0 }],
    blocks: blocks.map((k, id) => ({ ...k, id, hp: k.hp ?? 0 })),
  } as unknown as GameState;
  const b = sim.balls[0];
  for (let t = 0; t < SAFE_TICKS; t++) {
    moveBalls(sim);
    for (const x of SPAWN_XS) {
      const half = PLAYER_W / 2 + SAFE_MARGIN;
      if (circleHitsBox(b.x, b.y, r, x - half, WORLD_H - PLAYER_H - SAFE_MARGIN, 2 * half, PLAYER_H + SAFE_MARGIN)) return false;
    }
  }
  return true;
}

/** Procedural level, deterministic from index alone; difficulty ramps forever (asymptotically). */
function generateLevel(index: number): LevelDef {
  const rnd = mulberry32(index * 7919 + 17);
  const d = index - LEVELS.length + 1; // 1, 2, 3...
  const speed = 1 + 0.6 * (1 - Math.exp(-d / 60));
  const targetMass = Math.min(64, Math.round(24 + 10 * Math.log2(1 + d / 8)));
  const bigChance = Math.min(0.85, 0.35 + d / 150);
  const blocks = rnd() < 0.45 ? LAYOUTS[Math.floor(rnd() * LAYOUTS.length)] : [];

  const balls: LevelDef['balls'] = [];
  let mass = 0;
  while (mass < targetMass) {
    const left = targetMass - mass;
    let size = (rnd() < bigChance ? 3 : Math.floor(rnd() * 3)) as BallSize;
    while (2 ** size > left) size = (size - 1) as BallSize;
    mass += 2 ** size; // counts toward the target even if no fair spot is found
    const r = BALL_RADIUS[size];
    for (let tries = 0; tries < 300; tries++) {
      const ball = {
        x: Math.round(r + rnd() * (WORLD_W - 2 * r)),
        y: Math.round(r + 10 + rnd() * (150 - r)),
        size,
        dir: (rnd() < 0.5 ? -1 : 1) as -1 | 1,
      };
      if (ballIsFair(ball, speed, blocks)) { balls.push(ball); break; }
    }
  }
  const perMass = MIN_SECONDS_PER_MASS + 1.8 * Math.exp(-d / 80);
  const timeSeconds = Math.max(MIN_LEVEL_SECONDS, Math.ceil(levelMass({ balls } as LevelDef) * perMass));
  return { name: `Seviye ${index + 1}`, timeSeconds, speed, balls, blocks };
}

/** Level by 0-based index: handcrafted first, generated beyond. */
export function getLevel(index: number): LevelDef {
  return index < LEVELS.length ? LEVELS[index] : generateLevel(index);
}
