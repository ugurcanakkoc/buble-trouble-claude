import { describe, expect, it } from 'vitest';
import { BALL_RADIUS, LEVELS, PLAYER_H, WORLD_H, WORLD_W, createGame, getLevel, step } from './index';
import { DEFAULT_BALL_Y, MIN_LEVEL_SECONDS, MIN_SECONDS_PER_MASS, levelMass } from './levels';
import { circleHitsBox } from './geom';

const infos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: 0xffffff }));
const HANDCRAFTED = LEVELS.map((_, i) => i);
const GENERATED = Array.from({ length: 186 }, (_, i) => i + LEVELS.length); // 15..200

function checkLayout(i: number) {
  const l = getLevel(i);
  expect(l.balls.length, `level ${i + 1}`).toBeGreaterThan(0);
  for (const b of l.balls) {
    const r = BALL_RADIUS[b.size], y = b.y ?? DEFAULT_BALL_Y;
    expect(b.x - r >= 0 && b.x + r <= WORLD_W && y - r >= 0, `level ${i + 1} ball in world`).toBe(true);
    for (const k of l.blocks) expect(circleHitsBox(b.x, y, r, k.x, k.y, k.w, k.h), `level ${i + 1} ball in block`).toBe(false);
  }
  for (const k of l.blocks) expect(k.y + k.h, `level ${i + 1} headroom`).toBeLessThanOrEqual(WORLD_H - PLAYER_H - 64);
}

/** Idle players must survive the first 2 s of balls moving. */
function idleFailures(levels: number[], n: number): string[] {
  const fails: string[] = [];
  for (const i of levels) {
    const s = createGame(1, infos(n), i);
    for (let t = 0; t < 90 + 120; t++) {
      if (step(s, {}).some((e) => e.type === 'trapped' || e.type === 'hit')) { fails.push(`L${i + 1}@${t}`); break; }
    }
  }
  return fails;
}

describe('handcrafted levels', () => {
  it('has 15 levels with sane times', () => {
    expect(LEVELS).toHaveLength(15);
    for (const l of LEVELS) {
      expect(l.timeSeconds).toBeGreaterThanOrEqual(40);
      expect(l.timeSeconds).toBeLessThanOrEqual(90);
    }
  });
  it('layouts are valid', () => HANDCRAFTED.forEach(checkLayout));
  it.each([1, 2, 3, 4])('idle %i player(s) survive the first 2 s', (n) => expect(idleFailures(HANDCRAFTED, n)).toEqual([]));
});

describe('generated levels 15..200', () => {
  it('are deterministic from the index and named', () => {
    expect(getLevel(57)).toEqual(getLevel(57));
    expect(getLevel(57)).not.toEqual(getLevel(58));
    expect(getLevel(15).name).toBe('Seviye 16');
  });
  it('layouts are valid', () => GENERATED.forEach(checkLayout));
  it('enough time for their mass, ramping difficulty', () => {
    for (const i of GENERATED) {
      const l = getLevel(i);
      expect(l.timeSeconds).toBeGreaterThanOrEqual(Math.max(MIN_LEVEL_SECONDS, levelMass(l) * MIN_SECONDS_PER_MASS));
      expect(l.speed).toBeGreaterThan(1);
      expect(l.speed).toBeLessThanOrEqual(1.6);
    }
    expect(getLevel(200).speed!).toBeGreaterThan(getLevel(20).speed!);
    const avgMass = (from: number) => GENERATED.slice(from, from + 30).reduce((m, i) => m + levelMass(getLevel(i)), 0) / 30;
    expect(avgMass(150)).toBeGreaterThan(avgMass(0));
  });
  it.each([1, 2, 3, 4])('idle %i player(s) survive the first 2 s', (n) => expect(idleFailures(GENERATED, n)).toEqual([]));
  it('levelComplete always advances (endless)', () => {
    const s = createGame(1, infos(1), 199);
    s.phase = 'playing';
    s.balls = [];
    const ev: unknown[] = [];
    for (let t = 0; t < 121; t++) ev.push(...step(s, {}));
    expect(ev).toContainEqual({ type: 'levelStart', levelIndex: 200 });
    expect(s.balls.length).toBe(getLevel(200).balls.length);
  });
});
