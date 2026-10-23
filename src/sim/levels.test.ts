import { describe, expect, it } from 'vitest';
import { BALL_RADIUS, LEVELS, PLAYER_H, WORLD_H, WORLD_W, createGame, step } from './index';
import { circleHitsBox } from './geom';

const infos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: 0xffffff }));

describe('levels.json', () => {
  it('has 15 levels with sane times', () => {
    expect(LEVELS).toHaveLength(15);
    for (const l of LEVELS) expect(l.timeSeconds).toBeGreaterThanOrEqual(40), expect(l.timeSeconds).toBeLessThanOrEqual(90);
  });

  it.each(LEVELS.map((l, i) => [i + 1, l] as const))('level %i: balls in world and not inside blocks; walls leave head room', (_, l) => {
    for (const b of l.balls) {
      const r = BALL_RADIUS[b.size], y = b.y ?? 100;
      expect(b.x - r >= 0 && b.x + r <= WORLD_W && y - r >= 0).toBe(true);
      for (const k of l.blocks) if (k.kind !== 'ladder') expect(circleHitsBox(b.x, y, r, k.x, k.y, k.w, k.h)).toBe(false);
    }
    for (const k of l.blocks) if (k.kind !== 'ladder') expect(k.y + k.h).toBeLessThanOrEqual(WORLD_H - PLAYER_H);
  });

  it.each([1, 2, 3, 4])('idle %i player(s) survive the first 2 s of every level', (n) => {
    const fails: string[] = [];
    LEVELS.forEach((_, i) => {
      const s = createGame(1, infos(n), i);
      for (let t = 0; t < 90 + 120; t++) {
        const ev = step(s, {});
        if (ev.some((e) => e.type === 'hit')) fails.push(`L${i + 1}@${t}`);
      }
    });
    expect(fails).toEqual([]);
  });
});
