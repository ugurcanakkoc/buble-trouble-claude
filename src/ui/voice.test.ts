import { describe, expect, it, vi } from 'vitest';

vi.mock('./audio', () => ({}));
const { pickVariant } = await import('./voice');

describe('pickVariant', () => {
  it('never repeats the last pick and covers every other index', () => {
    for (let last = -1; last < 4; last++) {
      const seen = new Set<number>();
      for (const r of [0, 0.3, 0.5, 0.7, 0.999]) seen.add(pickVariant(4, last, () => r));
      expect(seen.has(last)).toBe(false);
      expect(seen.size).toBe(last < 0 ? 4 : 3);
    }
    expect(pickVariant(1, 0)).toBe(0);
  });
});
