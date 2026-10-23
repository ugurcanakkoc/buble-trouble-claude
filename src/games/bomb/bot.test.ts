import { describe, expect, it } from 'vitest';
import { CRATE, FLOOR, createGame, step } from './sim';

describe('bots', () => {
  it('do not die in the first 10 s on an open map', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = createGame(seed, [], 'ffa'); // 4 bots
      s.grid = s.grid.map((t) => (t === CRATE ? FLOOR : t));
      s.phase = 'play';
      let bombs = 0;
      for (let t = 0; t < 600; t++) bombs += step(s, {}).filter((e) => e.type === 'place').length;
      expect(s.players.filter((p) => p.alive).length, `seed ${seed}`).toBe(4);
      expect(bombs).toBeGreaterThan(0);
    }
  });

  it('a bot beats idle players', () => {
    const s = createGame(11, [{ id: 'a', name: 'A', color: 0 }, { id: 'b', name: 'B', color: 0 }, { id: 'c', name: 'C', color: 0 }], 'ffa');
    let rounds = 0;
    for (let t = 0; t < 60 * 60 * 6 && s.phase !== 'matchEnd'; t++) {
      for (const e of step(s, {})) if (e.type === 'roundEnd') rounds++;
    }
    expect(s.phase).toBe('matchEnd');
    expect(s.players[3].wins).toBe(3);
    // it shouldn't need sudden death to do it: 3 rounds well under 3 × 2:30
    expect(s.tick).toBeLessThan(3 * 150 * 60);
    expect(rounds).toBeGreaterThanOrEqual(3);
  });
});
