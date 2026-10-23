import { describe, expect, it } from 'vitest';
import { BALANCE as B } from './balance';
import { INF, dangerMap, reactTicks } from './bot';
import { CRATE, FLOOR, createGame, idx, step } from './sim';

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

  it("react to someone else's fresh bomb only after a 150–250 ms delay (own bombs at once)", () => {
    const s = createGame(3, [], 'ffa');
    const bot = s.players[0];
    expect(reactTicks(bot)).toBeGreaterThanOrEqual(9);
    expect(Math.max(...s.players.map(reactTicks))).toBeLessThanOrEqual(15);
    s.bombs.push({ id: 99, owner: 'bot1', c: 1, r: 1, fuse: B.fuseTicks, fire: 2, dx: 0, dy: 0, s: 0, pass: [] });
    expect(dangerMap(s, undefined, bot)[idx(1, 1)]).toBe(INF);
    s.bombs[0].fuse = B.fuseTicks - reactTicks(bot);
    expect(dangerMap(s, undefined, bot)[idx(1, 1)]).toBeLessThan(INF);
    s.bombs[0] = { ...s.bombs[0], owner: bot.id, fuse: B.fuseTicks };
    expect(dangerMap(s, undefined, bot)[idx(1, 1)]).toBeLessThan(INF);
  });
});
