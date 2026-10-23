import { describe, expect, it } from 'vitest';
import { LANE_W, TICK } from './balance';
import { baseScrollX, isNewMatch } from './camera';

describe('war camera', () => {
  it('starts on own base for both teams', () => {
    expect(baseScrollX(0, 960)).toBe(0);
    expect(baseScrollX(1, 960)).toBe(LANE_W - 960);
  });
  it('snapshot rewinds (client prediction) do not reset the view', () => {
    for (const t of [TICK, 600, 5000]) for (const back of [1, 4, 8, 30]) expect(isNewMatch(t, t - back)).toBe(false);
    expect(isNewMatch(100, 100)).toBe(false);
    expect(isNewMatch(100, 101)).toBe(false);
  });
  it('a host restart (tick back to ~0) does', () => {
    expect(isNewMatch(5000, 0)).toBe(true);
    expect(isNewMatch(5000, 4)).toBe(true);
  });
});
