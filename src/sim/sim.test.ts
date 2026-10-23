import { describe, expect, it } from 'vitest';
import type { Ball, BallSize, GameState, InputState, PowerUpKind, SimEvent } from './index';
import { EMPTY_INPUT, LEVELS, WORLD_H, createGame, step } from './index';
import { BALL_SCORE, popBall } from './balls';
import { applyPowerUp } from './powerups';

const infos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: 0xffffff }));
const FIRE: InputState = { ...EMPTY_INPUT, fire: true };

/** Game in 'playing' phase with no balls/blocks; player p0 at x=480 on the floor. */
function arena(players = 1): GameState {
  const s = createGame(42, infos(players));
  s.phase = 'playing';
  s.phaseUntil = 0;
  s.balls = [];
  s.blocks = [];
  return s;
}
function ball(s: GameState, size: BallSize, x: number, y: number, vx = 100): Ball {
  const b = { id: s.nextId++, x, y, vx, vy: 0, size, color: 0 };
  s.balls.push(b);
  return b;
}
function run(s: GameState, ticks: number, inputs: (t: number) => Record<string, InputState> = () => ({})): SimEvent[] {
  const all: SimEvent[] = [];
  for (let t = 0; t < ticks; t++) all.push(...step(s, inputs(t)));
  return all;
}
const count = (ev: SimEvent[], type: SimEvent['type']) => ev.filter((e) => e.type === type).length;

describe('balls', () => {
  it('size n splits into two n-1 moving apart; size 0 vanishes', () => {
    const s = arena();
    s.freezeUntil = 1e9;
    ball(s, 2, 480, 200);
    ball(s, 3, 100, 100); // keeps the level from completing
    const ev = run(s, 40, (t): Record<string, InputState> => (t === 0 ? { p0: FIRE } : {}));
    expect(count(ev, 'pop')).toBe(1);
    const kids = s.balls.filter((b) => b.size === 1);
    expect(kids).toHaveLength(2);
    expect(Math.sign(kids[0].vx)).toBe(-Math.sign(kids[1].vx));
    expect(kids[0].vy).toBeLessThan(0);
    expect(s.players[0].score).toBe(100);

    const t = arena();
    const b0 = ball(t, 0, 480, 300);
    popBall(t, b0, 'p0', []);
    expect(t.balls).toHaveLength(0);
  });

  it('scores 50/100/150/200 for size 3/2/1/0', () => {
    expect(BALL_SCORE[3]).toBe(50);
    for (const size of [0, 1, 2, 3] as BallSize[]) {
      const s = arena();
      popBall(s, ball(s, size, 300, 200), 'p0', []);
      expect(s.players[0].score).toBe([200, 150, 100, 50][size]);
    }
  });

  it('combo: pops within 1.2 s chain up to x5, then reset', () => {
    const s = arena();
    const pts: number[] = [];
    const pop = () => {
      const ev: SimEvent[] = [];
      popBall(s, ball(s, 0, 800, 100), 'p0', ev);
      const e = ev[0] as Extract<SimEvent, { type: 'pop' }>;
      pts.push(e.points * 10 + e.combo);
    };
    for (let i = 0; i < 6; i++) { pop(); s.tick += 60; }
    s.tick += 73;
    pop();
    expect(pts).toEqual([2001, 4002, 6003, 8004, 10005, 10005, 2001]);
    expect(s.players[0].score).toBe(200 * (1 + 2 + 3 + 4 + 5 + 5 + 1));
  });

  it('bounces back to the same apex every time', () => {
    const s = arena();
    s.players[0].connected = false;
    const b = ball(s, 3, 480, 100);
    const apexes: number[] = [];
    let prevVy = 0;
    for (let i = 0; i < 1200; i++) {
      step(s, {});
      if (prevVy < 0 && b.vy >= 0) apexes.push(b.y);
      prevVy = b.vy;
    }
    expect(apexes.length).toBeGreaterThan(3);
    for (const a of apexes) expect(Math.abs(a - apexes[0])).toBeLessThan(3);
  });
});

describe('power-ups', () => {
  const effect = (kind: PowerUpKind) => {
    const s = arena();
    ball(s, 3, 100, 100);
    applyPowerUp(s, s.players[0], kind);
    return s;
  };
  it('shield', () => expect(effect('shield').players[0].shield).toBe(true));
  it('clock freezes balls for 5 s', () => {
    const s = effect('clock');
    expect(s.freezeUntil).toBe(s.tick + 300);
    const y = s.balls[0].y;
    run(s, 299);
    expect(s.balls[0].y).toBe(y);
    run(s, 2);
    expect(s.balls[0].y).not.toBe(y);
  });
  it('dynamite turns all balls into size 0', () => {
    const s = arena();
    ball(s, 3, 100, 100);
    ball(s, 2, 600, 100);
    applyPowerUp(s, s.players[0], 'dynamite');
    expect(s.balls.map((b) => b.size)).toEqual([0, 0]);
  });
  it('life', () => expect(effect('life').lives).toBe(6));
  it('time', () => {
    const s = arena();
    const before = s.timeLeftTicks;
    applyPowerUp(s, s.players[0], 'time');
    expect(s.timeLeftTicks).toBe(before + 600);
  });
  it.each(['double', 'sticky', 'gun'] as const)('weapon %s', (k) => expect(effect(k).players[0].weapon).toBe(k));

  it('falls, is picked up by walking into it, and expires after 6 s on the floor', () => {
    const s = arena();
    ball(s, 3, 100, 100);
    s.powerUps.push({ id: 999, kind: 'life', x: 480, y: 300, vy: 150, expiresAt: 0 });
    const ev = run(s, 120);
    expect(ev).toContainEqual({ type: 'powerup', kind: 'life', playerId: 'p0' });
    expect(s.lives).toBe(6);

    const t = arena();
    ball(t, 3, 100, 100);
    t.freezeUntil = 1e9;
    t.powerUps.push({ id: 999, kind: 'life', x: 800, y: 300, vy: 150, expiresAt: 0 });
    run(t, 80);
    expect(t.powerUps[0].y).toBe(WORLD_H - 10);
    run(t, 360);
    expect(t.powerUps).toHaveLength(0);
  });
});

describe('hits and phases', () => {
  it('hit → lives−1, dying, then the level restarts keeping score', () => {
    const s = arena();
    s.players[0].score = 777;
    s.players[0].weapon = 'gun';
    ball(s, 1, 480, WORLD_H - 30);
    const ev = step(s, {});
    expect(ev).toContainEqual({ type: 'trapped', playerId: 'p0' });
    expect(ev).toContainEqual({ type: 'hit', playerId: 'p0' }); // solo: trapped = life lost
    expect(s.lives).toBe(4);
    expect(s.phase).toBe('dying');
    const ev2 = run(s, 120);
    expect(ev2).toContainEqual({ type: 'levelStart', levelIndex: 0 });
    expect(s.phase).toBe('ready');
    expect(s.balls).toHaveLength(LEVELS[0].balls.length);
    expect(s.players[0].score).toBe(777);
    expect(s.players[0].weapon).toBe('harpoon');
    expect(s.timeLeftTicks).toBe(LEVELS[0].timeSeconds * 60);
    expect(s.players[0].trapped).toBe(false);
  });

  it('co-op: trapped player is revived by a teammate; all trapped → life lost', () => {
    const s = arena(2); // p0 at 320, p1 at 640
    s.freezeUntil = 1e9;
    const b = ball(s, 1, 320, WORLD_H - 30);
    let ev = step(s, {});
    expect(ev).toContainEqual({ type: 'trapped', playerId: 'p0' });
    expect(count(ev, 'hit')).toBe(0);
    expect(s.lives).toBe(5);
    // trapped players can't move or fire
    ev = run(s, 5, () => ({ p0: { ...EMPTY_INPUT, right: true, fire: true } }));
    expect(s.players[0].x).toBe(320);
    expect(count(ev, 'shoot')).toBe(0);
    s.balls.splice(s.balls.indexOf(b), 1);
    ball(s, 3, 100, 100);
    ev = run(s, 120, () => ({ p1: { ...EMPTY_INPUT, left: true } }));
    const rev = ev.find((e) => e.type === 'revive');
    expect(rev).toEqual({ type: 'revive', playerId: 'p0', by: 'p1' });
    expect(s.players[0].trapped).toBe(false);
    expect(s.players[0].invulnUntil).toBeGreaterThan(s.tick);

    const t = arena(2);
    t.freezeUntil = 1e9;
    ball(t, 1, 320, WORLD_H - 30);
    step(t, {});
    ball(t, 1, 640, WORLD_H - 30);
    ev = step(t, {});
    expect(ev).toContainEqual({ type: 'hit', playerId: 'p1' });
    expect(t.lives).toBe(4);
    expect(t.phase).toBe('dying');
  });

  it('nothing hurts during ready', () => {
    const s = createGame(1, infos(1));
    s.balls[0].x = 480;
    s.balls[0].y = WORLD_H - 30;
    expect(count(run(s, 80), 'hit')).toBe(0);
  });

  it('shield absorbs one hit, then 1 s invulnerability', () => {
    const s = arena();
    s.players[0].shield = true;
    s.freezeUntil = 1e9;
    ball(s, 1, 480, WORLD_H - 30);
    const ev = step(s, {});
    expect(ev).toContainEqual({ type: 'shieldBreak', playerId: 'p0' });
    expect(s.players[0].shield).toBe(false);
    expect(count(run(s, 59), 'hit')).toBe(0);
    expect(s.lives).toBe(5);
    expect(count(run(s, 1), 'hit')).toBe(1);
  });

  it('timer timeout costs a life', () => {
    const s = arena();
    ball(s, 3, 100, 100);
    s.timeLeftTicks = 3;
    const ev = run(s, 3);
    expect(ev).toContainEqual({ type: 'timeout' });
    expect(s.lives).toBe(4);
    expect(s.phase).toBe('dying');
  });

  it('game over at 0 lives', () => {
    const s = arena();
    s.lives = 1;
    ball(s, 1, 480, WORLD_H - 30);
    const ev = run(s, 121);
    expect(s.lives).toBe(0);
    expect(ev).toContainEqual({ type: 'gameOver' });
    expect(s.phase).toBe('gameOver');
  });

  it('level complete → next level', () => {
    const s = arena();
    const ev = step(s, {});
    expect(ev).toContainEqual({ type: 'levelComplete', levelIndex: 0 });
    expect(s.phase).toBe('levelComplete');
    const ev2 = run(s, 120);
    expect(ev2).toContainEqual({ type: 'levelStart', levelIndex: 1 });
    expect(s.levelIndex).toBe(1);
    expect(s.phase).toBe('ready');
    run(s, 90);
    expect(s.phase).toBe('playing');
  });

  it('disconnected players are ignored', () => {
    const s = arena(2);
    s.freezeUntil = 1e9;
    s.players[0].connected = false;
    const x = s.players[0].x;
    ball(s, 1, x, WORLD_H - 30);
    const ev = run(s, 10, () => ({ p0: { ...EMPTY_INPUT, right: true } }));
    expect(count(ev, 'hit')).toBe(0);
    expect(s.players[0].x).toBe(x);
  });
});

describe('weapons', () => {
  it('harpoon is edge-triggered and allows one rope; double allows two', () => {
    const s = arena();
    ball(s, 3, 100, 100);
    s.freezeUntil = 1e9;
    expect(count(run(s, 20, () => ({ p0: FIRE })), 'shoot')).toBe(1);
    const press = (t: number) => ({ p0: t % 2 === 0 ? FIRE : EMPTY_INPUT });
    expect(count(run(s, 6, press), 'shoot')).toBe(0); // rope still flying
    s.projectiles = [];
    s.players[0].weapon = 'double';
    expect(count(run(s, 6, press), 'shoot')).toBe(2);
    expect(s.projectiles).toHaveLength(2);
  });

  it('rope stops at a wall bottom and damages breakables', () => {
    const s = arena();
    ball(s, 3, 100, 100);
    s.freezeUntil = 1e9;
    s.blocks.push({ id: 900, kind: 'breakable', x: 460, y: 200, w: 40, h: 20, hp: 2 });
    run(s, 30, (t) => ({ p0: t % 2 === 0 ? FIRE : EMPTY_INPUT }));
    expect(s.blocks[0].hp).toBe(1);
    const ev = run(s, 30, (t) => ({ p0: t % 2 === 0 ? FIRE : EMPTY_INPUT }));
    expect(ev).toContainEqual({ type: 'blockBreak', x: 480, y: 210 });
    expect(s.blocks).toHaveLength(0);
  });

  it('sticky harpoon stays on the ceiling 3 s and still pops balls', () => {
    const s = arena();
    s.freezeUntil = 1e9;
    ball(s, 3, 100, 100);
    s.players[0].weapon = 'sticky';
    step(s, { p0: FIRE });
    run(s, 48); // 480 u at 10 u/tick
    const rope = s.projectiles[0];
    expect(rope.y).toBe(0);
    expect(rope.stuckUntil - s.tick).toBeGreaterThan(170);
    expect(rope.stuckUntil - s.tick).toBeLessThanOrEqual(180);
    const stuckAt = rope.stuckUntil;
    while (s.tick < stuckAt - 10) step(s, {});
    expect(s.projectiles).toHaveLength(1);
    ball(s, 1, 480, 200);
    expect(count(run(s, 1), 'pop')).toBe(1);
    expect(s.projectiles).toHaveLength(0);

    // without a ball it disappears exactly at stuckUntil
    s.balls = s.balls.filter((b) => b.size === 3);
    step(s, { p0: FIRE });
    run(s, 48);
    const until = s.projectiles[0].stuckUntil;
    expect(until - s.tick).toBeLessThanOrEqual(180);
    while (s.tick < until - 1) step(s, {});
    expect(s.projectiles).toHaveLength(1);
    step(s, {});
    expect(s.projectiles).toHaveLength(0);
  });

  it('gun auto-fires 8 shots per second while held, max 6 alive', () => {
    const s = arena();
    s.freezeUntil = 1e9;
    ball(s, 3, 100, 100);
    s.players[0].weapon = 'gun';
    expect(count(run(s, 60, () => ({ p0: FIRE })), 'shoot')).toBe(8);
    expect(count(run(s, 120, () => ({ p0: FIRE })), 'shoot')).toBe(16);
    expect(s.projectiles.length).toBeLessThanOrEqual(6);
  });
});

describe('players', () => {
  it('spawn spread across the floor for 1-4 players', () => {
    expect(createGame(1, infos(4)).players.map((p) => [p.x, p.y])).toEqual([[192, 480], [384, 480], [576, 480], [768, 480]]);
    expect(createGame(1, infos(1)).players[0].x).toBe(480);
  });

});

describe('determinism', () => {
  // Deterministic pseudo-random input script independent of the sim.
  const script = (seed: number) => {
    let x = seed;
    return () => {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      return x;
    };
  };
  const inputsFor = (r: () => number) => () => {
    const out: Record<string, InputState> = {};
    for (const id of ['p0', 'p1', 'p2']) {
      const v = r();
      out[id] = { left: (v & 3) === 1, right: (v & 3) === 2, fire: (v & 32) > 0 };
    }
    return out;
  };

  it('same seed + inputs → identical state after 2000 ticks', () => {
    const a = createGame(1234, infos(3));
    const b = createGame(1234, infos(3));
    const ia = inputsFor(script(7)), ib = inputsFor(script(7));
    for (let t = 0; t < 2000; t++) expect(step(a, ia())).toEqual(step(b, ib()));
    expect(a).toEqual(b);
    expect(a.tick).toBe(2000);
  });

  it('JSON round-trip snapshot continues identically', () => {
    const a = createGame(99, infos(3), 12);
    const r = script(3);
    const ins = inputsFor(r);
    for (let t = 0; t < 500; t++) step(a, ins());
    const b = JSON.parse(JSON.stringify(a)) as GameState;
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    for (let t = 0; t < 1500; t++) {
      const i = ins();
      step(a, i);
      step(b, i);
    }
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});
