import { describe, expect, it } from 'vitest';
import { BALANCE as B } from './balance';
import {
  CRATE, EMPTY_INPUT, FLOOR, SPIRAL, WALL, bombAt, bombSim, createGame, flameAt, idx, setOwnPos, step,
  type BombInput, type BombState,
} from './sim';

const humans = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: 0 }));

/** Open arena (no crates), all players human and idle, in play phase. */
function arena(n = 4, mode = 'ffa'): BombState {
  const s = createGame(42, humans(n), mode);
  s.grid = s.grid.map((t) => (t === CRATE ? FLOOR : t));
  s.phase = 'play';
  return s;
}
const idle = (s: BombState) => Object.fromEntries(s.players.map((p) => [p.id, EMPTY_INPUT]));
function run(s: BombState, n: number, inputs: Record<string, BombInput> = {}) {
  const ev = [];
  for (let i = 0; i < n; i++) ev.push(...step(s, { ...idle(s), ...inputs }));
  return ev;
}
const at = (s: BombState, id: string, x: number, y: number) => {
  const p = s.players.find((q) => q.id === id)!;
  p.x = x;
  p.y = y;
  return p;
};
const press = (seq: number, extra: Partial<BombInput> = {}): BombInput => ({ ...EMPTY_INPUT, bomb: true, seq, ...extra });
const bomb = (s: BombState, c: number, r: number, fire = 2, fuse = 1, owner = 'x') =>
  s.bombs.push({ id: s.nextId++, owner, c, r, fuse, fire, dx: 0, dy: 0, s: 0, pass: [] });

describe('arena', () => {
  it('has walls, pillars, crates and clear spawn corners', () => {
    const s = createGame(1, humans(1), 'ffa');
    expect(s.grid.length).toBe(15 * 13);
    expect(s.grid[idx(0, 5)]).toBe(WALL);
    expect(s.grid[idx(2, 2)]).toBe(WALL);
    for (const [c, r] of [[1, 1], [2, 1], [1, 2], [13, 11], [12, 11], [13, 10]]) expect(s.grid[idx(c, r)]).toBe(FLOOR);
    const free = s.grid.filter((t) => t !== WALL).length;
    const crates = s.grid.filter((t) => t === CRATE).length;
    expect(crates / free).toBeGreaterThan(0.55);
    expect(s.players.filter((p) => p.bot).length).toBe(3);
  });
});

describe('flames', () => {
  it('propagate in a cross with range and stop at pillars and walls', () => {
    const s = arena();
    s.players.forEach((p) => (p.alive = false));
    bomb(s, 3, 1, 3);
    run(s, 1);
    for (const [c, r] of [[3, 1], [1, 1], [2, 1], [4, 1], [5, 1], [6, 1], [3, 2], [3, 3], [3, 4]]) expect(flameAt(s, c, r)).toBe(true);
    expect(flameAt(s, 7, 1)).toBe(false); // range 3
    expect(flameAt(s, 3, 0)).toBe(false); // outer wall
    bomb(s, 2, 3, 5);
    run(s, 1);
    expect(flameAt(s, 2, 2)).toBe(false); // pillar blocks upward arm
  });

  it('stop at crates, destroying them', () => {
    const s = arena();
    s.players.forEach((p) => (p.alive = false));
    s.grid[idx(5, 1)] = CRATE;
    bomb(s, 3, 1, 5);
    const ev = run(s, 1);
    expect(s.grid[idx(5, 1)]).toBe(FLOOR);
    expect(flameAt(s, 5, 1)).toBe(false);
    expect(flameAt(s, 6, 1)).toBe(false);
    expect(ev.some((e) => e.type === 'crate' && e.c === 5)).toBe(true);
  });

  it('chain-react other bombs in range', () => {
    const s = arena();
    s.players.forEach((p) => (p.alive = false));
    bomb(s, 3, 1, 2, 1);
    bomb(s, 5, 1, 2, 999);
    bomb(s, 5, 3, 1, 999);
    const ev = run(s, 1);
    expect(ev.filter((e) => e.type === 'explode').length).toBe(3);
    expect(s.bombs.length).toBe(0);
    expect(flameAt(s, 5, 4)).toBe(true);
  });

  it('kill players and are absorbed by a shield once', () => {
    const s = arena();
    const a = at(s, 'p0', 3.5, 1.5);
    const b = at(s, 'p1', 4.5, 1.5);
    b.shield = true;
    bomb(s, 3, 3, 2);
    const ev = run(s, 1);
    expect(a.alive).toBe(false);
    expect(b.alive).toBe(true);
    expect(ev.some((e) => e.type === 'death' && e.id === 'p0')).toBe(true);
    // b wasn't in the blast; put it in a flame now
    at(s, 'p1', 3.5, 2.5);
    const ev2 = run(s, 1);
    expect(ev2.some((e) => e.type === 'shield')).toBe(true);
    expect(b.alive).toBe(true);
    run(s, B.flameTicks);
    expect(b.alive).toBe(true);
  });
});

describe('crates and power-ups', () => {
  it('drops are deterministic for the same seed', () => {
    const go = () => {
      const s = createGame(7, humans(1), 'ffa');
      s.phase = 'play';
      s.players.forEach((p) => (p.alive = false));
      s.players[0].alive = true;
      for (let r = 1; r < 12; r += 2) bomb(s, 1, r, 13, 1);
      run(s, 1);
      return JSON.stringify(s.items);
    };
    expect(go()).toBe(go());
    expect(JSON.parse(go()).length).toBeGreaterThan(0);
  });

  it('applies bomb/fire/speed/maxfire/kick/shield/skull', () => {
    const s = arena();
    const p = at(s, 'p0', 1.5, 1.5);
    const kinds = ['bomb', 'fire', 'speed', 'kick', 'shield', 'skull'] as const;
    for (const k of kinds) {
      s.items.push({ c: 1, r: 1, k });
      run(s, 1);
    }
    expect([p.bombs, p.fire, p.speed, p.kick, p.shield]).toEqual([2, 3, 1, true, true]);
    expect(p.curse).not.toBeNull();
    s.items.push({ c: 1, r: 1, k: 'maxfire' });
    run(s, 1);
    expect(p.fire).toBe(B.maxFire);
    run(s, B.curseTicks);
    expect(p.curse).toBeNull();
  });

  it('flames destroy power-ups', () => {
    const s = arena();
    s.players.forEach((p) => (p.alive = false));
    s.items.push({ c: 4, r: 1, k: 'fire' });
    bomb(s, 3, 1, 2);
    run(s, 1);
    expect(s.items.length).toBe(0);
  });

  it('kick sends a bomb sliding until it hits something', () => {
    const s = arena();
    const p = at(s, 'p0', 1.5, 1.5);
    p.kick = true;
    bomb(s, 2, 1, 1, 999);
    run(s, 80, { p0: { ...EMPTY_INPUT, right: true } });
    const b = s.bombs[0];
    expect(b.c).toBeGreaterThan(5);
    expect(b.r).toBe(1);
    expect(p.x).toBeGreaterThan(2); // the kicker can follow
  });
});

describe('bombs', () => {
  it('respects the bomb count limit', () => {
    const s = arena();
    at(s, 'p0', 1.5, 1.5);
    run(s, 1, { p0: press(1) });
    at(s, 'p0', 1.5, 3.5);
    run(s, 1, { p0: press(2) });
    expect(s.bombs.length).toBe(1);
    s.players[0].bombs = 2;
    run(s, 1, { p0: press(3) });
    expect(s.bombs.length).toBe(2);
  });

  it('de-dups by seq (keepalive resends do not place twice)', () => {
    const s = arena();
    s.players[0].bombs = 5;
    run(s, 1, { p0: press(1) });
    at(s, 'p0', 1.5, 3.5);
    run(s, 5, { p0: press(1) });
    expect(s.bombs.length).toBe(1);
    run(s, 1, { p0: press(2) });
    expect(s.bombs.length).toBe(2);
  });

  it('lets you walk off your own bomb but not back onto it', () => {
    const s = arena();
    const p = at(s, 'p0', 1.5, 1.5);
    run(s, 1, { p0: press(1) });
    expect(bombAt(s, 1, 1)).toBeTruthy();
    run(s, 30, { p0: { ...EMPTY_INPUT, seq: 1, right: true } });
    expect(p.x).toBeGreaterThan(2.4);
    run(s, 30, { p0: { ...EMPTY_INPUT, seq: 1, left: true } });
    expect(p.x).toBeCloseTo(2.5, 5);
  });

  it('other players cannot walk through bombs', () => {
    const s = arena();
    const p = at(s, 'p0', 1.5, 1.5);
    bomb(s, 3, 1, 1, 999);
    run(s, 60, { p0: { ...EMPTY_INPUT, right: true } });
    expect(p.x).toBeCloseTo(2.5, 5);
  });
});

describe('movement', () => {
  it('corner-assist slides around a pillar edge', () => {
    const s = arena();
    // in column 1 slightly below row 1's center, pressing right: row 1 is open, slide up into it
    const p = at(s, 'p0', 1.5, 1.8);
    run(s, 20, { p0: { ...EMPTY_INPUT, right: true } });
    expect(p.y).toBeCloseTo(1.5, 5);
    expect(p.x).toBeGreaterThan(1.6);
    // just past half into row 2 (pillar row at column 2): still slides back up around the pillar
    const q = at(s, 'p0', 1.5, 2.1);
    run(s, 25, { p0: { ...EMPTY_INPUT, right: true } });
    expect(q.y).toBeCloseTo(1.5, 5);
    expect(q.x).toBeGreaterThan(1.6);
  });

  it('stops at walls, aligned to the tile center', () => {
    const s = arena();
    const p = at(s, 'p0', 1.5, 1.5);
    run(s, 30, { p0: { ...EMPTY_INPUT, up: true } });
    expect(p.y).toBeCloseTo(1.5, 5);
  });

  it('a dropped-out human is played by a bot until they return', () => {
    const s = arena(2);
    bombSim.setConnected!(s, 'p1', false);
    expect(s.players[1].bot).toBe(true);
    bombSim.setConnected!(s, 'p1', true);
    expect(s.players[1].bot).toBe(false);
    bombSim.setConnected!(s, 'bot2', true);
    expect(s.players[2].bot).toBe(true);
  });

  it('setOwnPos rejects walls and teleports', () => {
    const s = arena();
    const p = at(s, 'p0', 1.5, 1.5);
    setOwnPos(s, 'p0', { x: 2.5, y: 2.5 }); // pillar
    expect(p.x).toBe(1.5);
    setOwnPos(s, 'p0', { x: 9.5, y: 1.5 }); // teleport
    expect(p.x).toBe(1.5);
    setOwnPos(s, 'p0', { x: 2.2, y: 1.6 }); // both axes off: snap the smaller one
    expect([p.x, p.y]).toEqual([2.2, 1.5]);
  });
});

describe('rounds', () => {
  it('last player standing wins the round; first to 3 wins the match', () => {
    const s = arena(2);
    s.players.forEach((p, i) => (p.alive = i === 0));
    const ev = run(s, B.endGraceTicks + 1);
    expect(ev.find((e) => e.type === 'roundEnd')).toEqual({ type: 'roundEnd', winner: 'p0' });
    expect(s.players[0].wins).toBe(1);
    expect(s.phase).toBe('roundEnd');
    run(s, B.roundEndTicks);
    expect(s.phase).toBe('countdown');
    expect(s.round).toBe(2);
    s.players[0].wins = 2;
    s.phase = 'play';
    s.players.forEach((p, i) => (p.alive = i === 0));
    const ev2 = run(s, B.endGraceTicks + B.roundEndTicks + 2);
    expect(ev2.some((e) => e.type === 'matchEnd' && e.winner === 'p0')).toBe(true);
    expect(s.phase).toBe('matchEnd');
  });

  it('simultaneous death is a draw', () => {
    const s = arena(2);
    s.players.forEach((p) => (p.alive = false));
    at(s, 'p0', 3.5, 1.5).alive = true;
    at(s, 'p1', 4.5, 1.5).alive = true;
    bomb(s, 3, 1, 2);
    const ev = run(s, B.endGraceTicks + 2);
    expect(ev.find((e) => e.type === 'roundEnd')).toEqual({ type: 'roundEnd', winner: null });
    expect(s.players.every((p) => p.wins === 0)).toBe(true);
  });

  it('team mode: the surviving team wins, all members score', () => {
    const s = arena(4, 'team');
    expect(s.players.map((p) => p.team)).toEqual([0, 1, 0, 1]);
    s.players[1].alive = false;
    s.players[3].alive = false;
    s.players[2].alive = false;
    const ev = run(s, B.endGraceTicks + 1);
    expect(ev.find((e) => e.type === 'roundEnd')).toEqual({ type: 'roundEnd', winner: 'team0' });
    expect(s.players.map((p) => p.wins)).toEqual([1, 0, 1, 0]);
  });

  it('sudden death drops blocks in a spiral and crushes players', () => {
    const s = arena(2);
    const p = at(s, 'p0', 1.5, 1.5); // first spiral cell
    at(s, 'p1', 7.5, 5.5);
    s.timeLeft = 1;
    const ev = run(s, 3);
    expect(ev.some((e) => e.type === 'sudden')).toBe(true);
    expect(s.grid[idx(...SPIRAL[0])]).toBe(WALL);
    expect(p.alive).toBe(false);
    run(s, B.suddenEveryTicks * 20);
    expect(s.grid[idx(...SPIRAL[18])]).toBe(WALL);
  });
});

describe('determinism', () => {
  it('same seed + inputs → identical state after 5000 ticks, JSON round-trips', () => {
    const go = () => {
      const s = bombSim.createGame(99, humans(2), 'ffa');
      for (let t = 0; t < 5000; t++) {
        const k = Math.floor(t / 37);
        step(s, {
          p0: { ...EMPTY_INPUT, right: k % 4 === 0, down: k % 4 === 1, left: k % 4 === 2, up: k % 4 === 3, bomb: t % 90 < 3, seq: Math.floor(t / 90) },
          p1: { ...EMPTY_INPUT, left: k % 3 === 0, up: k % 3 === 1, bomb: t % 120 < 2, seq: Math.floor(t / 120) },
        });
      }
      return s;
    };
    const a = go();
    const b = go();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    // continuing from a round-tripped copy stays identical
    const c = JSON.parse(JSON.stringify(a)) as BombState;
    for (let t = 0; t < 300; t++) step(a, {}), step(c, {});
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));
  });
});
