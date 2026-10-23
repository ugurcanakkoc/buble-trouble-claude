import { describe, expect, it } from 'vitest';
import type { GameState, InputState, Player, SimEvent } from './index';
import { BALL_RADIUS, EMPTY_INPUT, TICK_RATE, WORLD_H, WORLD_W, createGame, step } from './index';
import { GOD_BALANCE as B } from './godBalance';
import { ballMass, fightersOf, massCap } from './god';
import { BALL_GRAVITY, bounceSpeed } from './balls';

const infos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: 0xffffff }));
const count = (ev: SimEvent[], type: SimEvent['type']) => ev.filter((e) => e.type === type).length;

// ---------- bots ----------
type Bot = (s: GameState, p: Player) => InputState;

/** Greedy god: chases the nearest free fighter, drops the biggest ball it can afford / fit as soon as possible. */
function greedyGod(s: GameState): InputState {
  const g = s.god!;
  const free = fightersOf(s).filter((p) => !p.trapped);
  const target = free.length ? free.reduce((a, b) => (Math.abs(a.x - g.x) < Math.abs(b.x - g.x) ? a : b)).x : WORLD_W / 2;
  let best = 3;
  while (best >= 0 && (B.cost[best] > g.mana || ballMass(s) + 2 ** best > massCap(s))) best--;
  const fire = g.charge < 0 ? best >= 0 && s.tick >= g.nextDropTick : g.charge < best;
  return { left: target < g.x - 6, right: target > g.x + 6, fire };
}

const idle: Bot = () => EMPTY_INPUT;

/**
 * Dodge + shoot: for each move (stay / left / right held for 0.8 s) predict balls ballistically and pick the
 * move whose first contact is latest (ties: most clearance). Human-ish: re-plans only every REACT ticks.
 * Fires when a ball is roughly above.
 */
const HORIZON = 36, SUB = 2, REACT = 8; // ticks
const plans = new Map<string, number>();
const dodgeShoot: Bot = (s, p) => {
  const above = s.balls.some((b) => Math.abs(b.x - p.x) < BALL_RADIUS[b.size] + 20);
  const fire = above && s.tick % 2 === 0;
  if (s.tick % REACT !== 0 && plans.has(p.id)) {
    const dir = plans.get(p.id)!;
    return { left: dir < 0, right: dir > 0, fire };
  }
  const preds = s.balls.map((b) => {
    const r = BALL_RADIUS[b.size];
    let { x, y, vx, vy } = b;
    const pts: { x: number; y: number }[] = [];
    for (let t = 1; t <= HORIZON; t++) {
      vy += BALL_GRAVITY / TICK_RATE;
      x += vx / TICK_RATE;
      y += vy / TICK_RATE;
      if (x < r) { x = r; vx = Math.abs(vx); }
      if (x > WORLD_W - r) { x = WORLD_W - r; vx = -Math.abs(vx); }
      if (y + r >= WORLD_H) { y = WORLD_H - r; vy = -bounceSpeed(b.size); }
      if (t % SUB === 0) pts.push({ x, y });
    }
    return { r, pts };
  });
  let best = { dir: 0, hit: -1, clear: -Infinity };
  for (const dir of [0, -1, 1]) {
    let hit = Infinity, clear = Infinity;
    preds.forEach(({ r, pts }) => pts.forEach((q, i) => {
      const px = Math.max(16, Math.min(WORLD_W - 16, p.x + (dir * 220 * (i + 1) * SUB) / TICK_RATE));
      const dx = Math.max(0, Math.abs(q.x - px) - 14), dy = Math.max(0, WORLD_H - 46 - q.y);
      const d = Math.hypot(dx, dy) - r;
      if (d < 0) hit = Math.min(hit, i);
      clear = Math.min(clear, d + i * 2);
    }));
    if (hit > best.hit || (hit === best.hit && clear > best.clear + 1)) best = { dir, hit, clear };
  }
  plans.set(p.id, best.dir);
  return { left: best.dir < 0, right: best.dir > 0, fire };
};

function playMatch(seed: number, fighters: number, bot: Bot) {
  const s = createGame(seed, infos(fighters + 1), 0, 'god');
  const rounds: { winner: string; secs: number }[] = [];
  let start = 0;
  while (s.phase !== 'gameOver') {
    const inputs: Record<string, InputState> = {};
    for (const p of s.players) inputs[p.id] = p.id === s.god!.godId ? greedyGod(s) : bot(s, p);
    for (const e of step(s, inputs)) {
      if (e.type === 'levelStart') start = s.tick + Math.round(B.readySec * TICK_RATE);
      if (e.type === 'roundEnd') rounds.push({ winner: e.winner, secs: (s.tick - start) / TICK_RATE });
    }
  }
  return rounds;
}

function stats(fighters: number, bot: Bot, matches = 8) {
  const rounds = Array.from({ length: matches }, (_, i) => playMatch(1000 + i * 77, fighters, bot)).flat();
  const fighterWins = rounds.filter((r) => r.winner === 'fighters').length / rounds.length;
  const godSecs = rounds.filter((r) => r.winner === 'god').map((r) => r.secs);
  return { fighterWins, avgGodWinSecs: godSecs.reduce((a, b) => a + b, 0) / Math.max(1, godSecs.length), rounds: rounds.length };
}

// ---------- balance ----------
describe('god balance', () => {
  it.each([1, 2, 3])('idle %i fighter(s) lose quickly to a greedy god', (n) => {
    const r = stats(n, idle, 3);
    expect(r.fighterWins).toBeLessThan(0.2);
    expect(r.avgGodWinSecs).toBeLessThan(45);
  }, 60_000);

  it.each([1, 2, 3])('dodge+shoot %i fighter(s) win 50-85 pct of rounds vs greedy god', (n) => {
    const r = stats(n, dodgeShoot, 12);
    console.log(`fighters=${n} winRate=${r.fighterWins.toFixed(2)} rounds=${r.rounds} avgGodWin=${r.avgGodWinSecs.toFixed(1)}s`);
    expect(r.fighterWins).toBeGreaterThanOrEqual(0.5);
    expect(r.fighterWins).toBeLessThanOrEqual(0.85);
  }, 60_000);
});

// ---------- rules ----------
describe('god mode rules', () => {
  const playing = (n = 2) => {
    const s = createGame(5, infos(n), 0, 'god');
    for (let i = 0; i < 90; i++) step(s, {});
    expect(s.phase).toBe('playing');
    return s;
  };

  it('needs ≥2 players; starts empty with rotation order', () => {
    expect(() => createGame(1, infos(1), 0, 'god')).toThrow();
    const s = createGame(1, infos(3), 0, 'god');
    expect(s.mode).toBe('god');
    expect(s.balls).toEqual([]);
    expect(s.blocks).toEqual([]);
    expect(s.god!.order).toEqual(['p0', 'p1', 'p2']);
    expect(s.god!.godId).toBe('p0');
    expect(s.timeLeftTicks).toBe(B.roundSec * TICK_RATE);
    expect(createGame(1, infos(1)).god).toBeNull();
  });

  it('holding fire charges by mana; release drops and spends; cooldown applies', () => {
    const s = playing();
    s.god!.mana = 10;
    const hold = { p0: { ...EMPTY_INPUT, fire: true } };
    for (let i = 0; i < 3 * 27 + 1; i++) step(s, hold);
    expect(s.god!.charge).toBe(3);
    const ev = step(s, {});
    expect(ev.find((e) => e.type === 'godDrop')).toMatchObject({ size: 3 });
    expect(s.god!.mana).toBeCloseTo(2, 0);
    expect(s.balls).toHaveLength(1);
    step(s, hold);
    expect(count(step(s, {}), 'godDrop')).toBe(0); // cooldown: refused, nothing spent
    expect(s.god!.charge).toBe(-1);
  });

  it('charge is capped by mana and drops over the mass cap are refused', () => {
    const s = playing();
    s.god!.mana = 4.5;
    for (let i = 0; i < 200; i++) { s.god!.mana = 4.5; step(s, { p0: { ...EMPTY_INPUT, fire: true } }); }
    expect(s.god!.charge).toBe(2);
    expect(massCap(s)).toBe(B.massCapBase + B.massCapPerFighter);
    s.balls = Array.from({ length: 12 }, (_, i) => ({ id: 500 + i, x: 40 + i * 70, y: 100, vx: 0, vy: 0, size: 0 as const, color: 0 }));
    s.freezeUntil = 1e9;
    const mana = s.god!.mana;
    expect(count(step(s, {}), 'godDrop')).toBe(0);
    expect(s.god!.mana).toBeGreaterThanOrEqual(mana);
  });

  it('god cannot be trapped or pick up; fighters all trapped → god wins round; rotation → matchEnd', () => {
    const s = playing(2);
    s.freezeUntil = 1e9;
    const god = s.players[0];
    s.balls.push({ id: 900, x: god.x, y: god.y - 20, vx: 0, vy: 0, size: 2, color: 0 });
    expect(count(step(s, {}), 'trapped')).toBe(0);
    s.balls.push({ id: 901, x: s.players[1].x, y: WORLD_H - 30, vx: 0, vy: 0, size: 1, color: 0 });
    const ev = step(s, {});
    expect(ev).toContainEqual({ type: 'roundEnd', winner: 'god', round: 0 });
    expect(s.god!.roundWins).toEqual({ p0: 1, p1: 0 });
    expect(s.phase).toBe('levelComplete');
    for (let i = 0; i < 150; i++) step(s, {});
    expect(s.god!.godId).toBe('p1');
    expect(s.god!.round).toBe(1);
    expect(s.balls).toEqual([]);
    expect(s.players[1].trapped).toBe(false);
    // round 2: timer runs out with p0 free → fighters win, match ends
    const all: SimEvent[] = [];
    while (s.phase !== 'gameOver') all.push(...step(s, {}));
    expect(all).toContainEqual({ type: 'roundEnd', winner: 'fighters', round: 1 });
    expect(all).toContainEqual({ type: 'matchEnd', roundWins: { p0: 2, p1: 0 } });
  });
});

describe('rain mode', () => {
  it('AI god drops balls, costs lives, gets harder, ends at 0 lives', () => {
    const s = createGame(3, infos(2), 0, 'rain');
    expect(s.god!.godId).toBe('');
    expect(fightersOf(s)).toHaveLength(2);
    const ev: SimEvent[] = [];
    while (s.phase !== 'gameOver' && s.tick < 60 * 60 * 20) ev.push(...step(s, {}));
    expect(count(ev, 'godDrop')).toBeGreaterThan(0);
    expect(count(ev, 'hit')).toBe(5);
    expect(ev).toContainEqual({ type: 'gameOver' });
    expect(s.lives).toBe(0);
    expect(s.players[0].score).toBeGreaterThan(0);
  });

  it('levelIndex = minutes survived', () => {
    const s = createGame(3, infos(1), 0, 'rain');
    s.players[0].invulnUntil = 1e9;
    for (let i = 0; i < 90 + 60 * 60 * 2 + 5; i++) {
      step(s, {});
      if (s.phase === 'ready') s.players[0].invulnUntil = 1e9;
    }
    expect(s.levelIndex).toBe(2);
  });
});

describe('god/rain determinism', () => {
  const script = (seed: number) => {
    let x = seed;
    return () => (x = (x * 1103515245 + 12345) & 0x7fffffff);
  };
  const inputsFor = (r: () => number) => () => {
    const out: Record<string, InputState> = {};
    for (const id of ['p0', 'p1', 'p2']) {
      const v = r();
      out[id] = { left: (v & 3) === 1, right: (v & 3) === 2, fire: (v & 96) > 0 };
    }
    return out;
  };
  it.each(['god', 'rain'] as const)('%s: same seed + inputs → same state; JSON snapshot continues identically', (mode) => {
    const a = createGame(77, infos(3), 0, mode);
    const b = createGame(77, infos(3), 0, mode);
    const ia = inputsFor(script(9)), ib = inputsFor(script(9));
    for (let t = 0; t < 2000; t++) expect(step(a, ia())).toEqual(step(b, ib()));
    expect(a).toEqual(b);
    const c = JSON.parse(JSON.stringify(a)) as GameState;
    for (let t = 0; t < 1500; t++) {
      const i = ia();
      step(a, i);
      step(c, i);
    }
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));
  });
});
