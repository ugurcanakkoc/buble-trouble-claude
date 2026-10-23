import { describe, expect, it } from 'vitest';
import { EMPTY_INPUT, TICK_RATE, createGame, step, type GameState } from './index';
import { matchSummary, matchWinners, mvpOf } from './stats';
import { popBall } from './balls';

const infos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: 0xffffff }));
const arena = (n: number, mode: 'classic' | 'god' = 'classic'): GameState => {
  const s = createGame(7, infos(n), 0, mode);
  s.phase = 'playing';
  s.phaseUntil = 0;
  s.balls = [];
  s.blocks = [];
  return s;
};

describe('stats', () => {
  it('counts pops by size and max combo', () => {
    const s = arena(1);
    for (const size of [3, 2, 2, 0] as const) {
      s.balls.push({ id: s.nextId++, x: 100, y: 100, vx: 0, vy: 0, size, color: 0 });
      popBall(s, s.balls[s.balls.length - 1], 'p0', []);
    }
    expect(s.players[0].stats.pops).toEqual([1, 0, 2, 1]);
    expect(s.players[0].stats.maxCombo).toBe(4);
  });

  it('counts revives, trapped and power-ups', () => {
    const s = arena(2);
    s.balls.push({ id: 99, x: s.players[0].x, y: 460, vx: 0, vy: 0, size: 1, color: 0 });
    s.freezeUntil = 1e9;
    step(s, {});
    expect(s.players[0].trapped).toBe(true);
    expect(s.players[0].stats.trapped).toBe(1);
    s.balls = [{ id: 97, x: 900, y: 50, vx: 0, vy: 0, size: 0, color: 0 }];
    s.players[1].x = s.players[0].x;
    step(s, {});
    expect(s.players[1].stats.revives).toBe(1);
    s.powerUps.push({ id: 98, kind: 'time', x: s.players[1].x, y: 460, vy: 0, expiresAt: 1e9 });
    step(s, {});
    expect(s.players[0].stats.powerUps + s.players[1].stats.powerUps).toBe(1);
  });

  it('god mode: drops and fighters trapped', () => {
    const s = arena(2, 'god');
    const god = s.players.find((p) => p.id === s.god!.godId)!;
    s.god!.mana = 10;
    for (let i = 0; i < 3; i++) step(s, { [god.id]: { ...EMPTY_INPUT, fire: true } });
    step(s, {});
    expect(god.stats.drops).toBe(1);
    const fighter = s.players.find((p) => p !== god)!;
    s.balls.push({ id: 99, x: fighter.x, y: 460, vx: 0, vy: 0, size: 1, color: 0 });
    step(s, {});
    expect(god.stats.godTraps).toBe(1);
  });
});

describe('time bonus', () => {
  it('credits secs left x10 to free players only', () => {
    const s = arena(2);
    s.timeLeftTicks = 12 * TICK_RATE + 30;
    s.players[1].trapped = true;
    step(s, {}); // no balls -> level complete
    expect(s.phase).toBe('levelComplete');
    expect(s.timeBonus).toBe(120);
    expect(s.players.map((p) => p.score)).toEqual([120, 0]);
  });
});

describe('mvp / winners', () => {
  it('co-op MVP = top score, tie broken by pops, nobody if no score', () => {
    const s = arena(3);
    expect(mvpOf(s.players)).toBeNull();
    expect(matchWinners(s)).toEqual([]);
    s.players[1].score = 500;
    s.players[2].score = 500;
    s.players[2].stats.pops[0] = 3;
    expect(matchWinners(s)).toEqual(['P2']);
    expect(matchSummary(s)).toMatchObject({ players: ['P0', 'P1', 'P2'], stats: { score: { P0: 0, P1: 500, P2: 500 }, level: 1 } });
  });

  it('god winners = most round wins, ties all, zero = none', () => {
    const s = arena(3, 'god');
    expect(matchWinners(s)).toEqual([]);
    Object.assign(s.god!.roundWins, { p0: 2, p1: 1, p2: 2 });
    expect(matchWinners(s)).toEqual(['P0', 'P2']);
  });
});
