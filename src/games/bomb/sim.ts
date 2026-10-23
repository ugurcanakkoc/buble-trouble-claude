// Bomba: pure deterministic Bomberman-style sim ("Playing with Fire 2" rules). Plain-JSON state,
// positions in tile units (tile (c,r) spans [c,c+1)×[r,r+1); its center is c+0.5, r+0.5).
import type { PlayerInfo, PlayerId } from '../../sim/types';
import type { GameSim } from '../types';
import { BALANCE as B, COLS, ROWS } from './balance';
import { botInput } from './bot';

export type ItemKind = 'bomb' | 'fire' | 'speed' | 'kick' | 'shield' | 'maxfire' | 'skull';
export type Curse = 'slow' | 'reverse' | 'nobomb';
export type Phase = 'countdown' | 'play' | 'roundEnd' | 'matchEnd';
export type Dir = 'u' | 'd' | 'l' | 'r';
export const FLOOR = 0;
export const WALL = 1;
export const CRATE = 2;

export interface BombInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  bomb: boolean; // held (informational)
  seq: number; // incremented per bomb press; the sim places a bomb exactly when it changes
}
export const EMPTY_INPUT: BombInput = { up: false, down: false, left: false, right: false, bomb: false, seq: 0 };

export interface BPlayer {
  id: PlayerId;
  name: string;
  color: number;
  slot: number; // spawn corner 0 TL, 1 TR, 2 BL, 3 BR
  team: number; // ffa: = slot; team: slot % 2 (left vs right side)
  bot: boolean;
  x: number;
  y: number;
  dir: Dir;
  moving: boolean;
  alive: boolean;
  bombs: number; // max simultaneous
  fire: number;
  speed: number; // speed power-ups taken
  kick: boolean;
  shield: boolean;
  curse: Curse | null;
  curseUntil: number;
  invulnUntil: number;
  seq: number; // last bomb seq seen
  wins: number;
  // per-match stats (reset only by createGame)
  kills: number; // enemies killed (teammates don't count)
  deaths: number;
  suicides: number;
  crates: number;
  items: number;
  death: Death | null; // how this player died this round (null while alive)
}

export type DeathCause = 'bomb' | 'self' | 'crush';
export interface Death {
  by: PlayerId | null; // killer for 'bomb', the player itself for 'self', null for 'crush'
  cause: DeathCause;
  multi: number; // enemies this chain has killed so far (≥2 → "ÇİFTE!", "ÜÇLÜ!")
}

export interface Bomb {
  id: number;
  owner: PlayerId;
  c: number;
  r: number;
  fuse: number;
  fire: number;
  dx: number; // kicked slide direction
  dy: number;
  s: number; // slide progress toward (c+dx, r+dy), [0,1)
  pass: PlayerId[]; // players still standing on it since it was placed (may walk off)
}

export interface Flame {
  c: number;
  r: number;
  t: number; // ticks left
  o: PlayerId; // owner of the bomb that produced it (kill attribution)
  ch: number; // chain id: the root bomb's id, shared by everything it set off
}

export interface Item {
  c: number;
  r: number;
  k: ItemKind;
}

export interface BombState {
  tick: number;
  rng: number;
  mode: 'ffa' | 'team';
  phase: Phase;
  phaseTicks: number;
  round: number;
  timeLeft: number;
  sdIdx: number; // next index into SPIRAL
  sdNext: number;
  grace: number; // -1 = not ending
  lastWinner: string | null; // player id / 'team0' / 'team1'; null = draw
  grid: number[];
  bombs: Bomb[];
  flames: Flame[];
  items: Item[];
  players: BPlayer[];
  nextId: number;
  chainKills: Record<string, number>; // `${chain}|${killer}` → enemies that killer's flames in that chain got this round
}

export type BombEvent =
  | { type: 'place'; c: number; r: number }
  | { type: 'explode'; c: number; r: number }
  | { type: 'crate'; c: number; r: number }
  | { type: 'pickup'; id: PlayerId; k: ItemKind }
  | { type: 'shield'; id: PlayerId }
  | ({ type: 'death'; id: PlayerId; x: number; y: number } & Death)
  | { type: 'kick'; c: number; r: number }
  | { type: 'countdown'; n: number }
  | { type: 'go' }
  | { type: 'sudden' }
  | { type: 'fall'; c: number; r: number }
  | { type: 'roundEnd'; winner: string | null }
  | { type: 'matchEnd'; winner: string | null };

export const SLOT_COLORS = [0xff5a5a, 0x4aa8ff, 0x4be37a, 0xffd23f];
export const SPAWNS: [number, number][] = [
  [1, 1],
  [COLS - 2, 1],
  [1, ROWS - 2],
  [COLS - 2, ROWS - 2],
];
const EPS = 1e-6;
export const DIRS: [number, number][] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

export const idx = (c: number, r: number) => r * COLS + c;
export const inside = (c: number, r: number) => c >= 0 && r >= 0 && c < COLS && r < ROWS;

export function random(s: { rng: number }): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Interior cells from the edges inward, clockwise: the sudden-death fall order. */
export const SPIRAL: [number, number][] = (() => {
  const out: [number, number][] = [];
  let [c0, r0, c1, r1] = [1, 1, COLS - 2, ROWS - 2];
  while (c0 <= c1 && r0 <= r1) {
    for (let c = c0; c <= c1; c++) out.push([c, r0]);
    for (let r = r0 + 1; r <= r1; r++) out.push([c1, r]);
    if (r0 < r1) for (let c = c1 - 1; c >= c0; c--) out.push([c, r1]);
    if (c0 < c1) for (let r = r1 - 1; r > r0; r--) out.push([c0, r]);
    c0++, r0++, c1--, r1--;
  }
  return out;
})();

export const cellOf = (p: { x: number; y: number }): [number, number] => [Math.floor(p.x), Math.floor(p.y)];
export const bombAt = (s: BombState, c: number, r: number) => s.bombs.find((b) => b.c === c && b.r === r);
export const flameAt = (s: BombState, c: number, r: number) => s.flames.some((f) => f.c === c && f.r === r);
export const speedOf = (p: BPlayer) =>
  p.curse === 'slow' ? B.slowSpeed : B.baseSpeed + B.speedStep * Math.min(p.speed, B.maxSpeedLevel);
const overlaps = (p: BPlayer, c: number, r: number) => Math.abs(p.x - c - 0.5) < 1 - EPS && Math.abs(p.y - r - 0.5) < 1 - EPS;
export const side = (s: BombState, p: BPlayer) => (s.mode === 'team' ? `team${p.team}` : p.id);

export function makeGrid(s: { rng: number }): number[] {
  const g: number[] = [];
  const clear = new Set<number>();
  for (const [c, r] of SPAWNS) {
    const dc = c === 1 ? 1 : -1;
    const dr = r === 1 ? 1 : -1;
    for (const [a, b] of [[0, 0], [dc, 0], [0, dr]]) clear.add(idx(c + a, r + b));
  }
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const wall = c === 0 || r === 0 || c === COLS - 1 || r === ROWS - 1 || (c % 2 === 0 && r % 2 === 0);
      g.push(wall ? WALL : clear.has(idx(c, r)) ? FLOOR : random(s) < B.crateChance ? CRATE : FLOOR);
    }
  return g;
}

export function createGame(seed: number, infos: PlayerInfo[], mode: string): BombState {
  const humans = infos.slice(0, 4);
  const players: BPlayer[] = [];
  for (let slot = 0; slot < 4; slot++) {
    const h = humans[slot];
    players.push({
      id: h?.id ?? `bot${slot}`,
      name: h?.name ?? `Bot ${slot + 1}`,
      color: SLOT_COLORS[slot],
      slot,
      team: mode === 'team' ? slot % 2 : slot,
      bot: !h,
      x: 0, y: 0, dir: 'd', moving: false, alive: true,
      bombs: 0, fire: 0, speed: 0, kick: false, shield: false, curse: null, curseUntil: 0, invulnUntil: 0,
      seq: 0, wins: 0, kills: 0, deaths: 0, suicides: 0, crates: 0, items: 0, death: null,
    });
  }
  const s: BombState = {
    tick: 0, rng: seed >>> 0 || 1, mode: mode === 'team' ? 'team' : 'ffa', phase: 'countdown', phaseTicks: 0, round: 0,
    timeLeft: 0, sdIdx: 0, sdNext: 0, grace: -1, lastWinner: null, grid: [], bombs: [], flames: [], items: [], players, nextId: 1, chainKills: {},
  };
  newRound(s);
  return s;
}

export function newRound(s: BombState): void {
  s.round++;
  s.grid = makeGrid(s);
  s.bombs = [];
  s.flames = [];
  s.items = [];
  s.phase = 'countdown';
  s.phaseTicks = B.countdownTicks;
  s.timeLeft = B.roundTicks;
  s.sdIdx = 0;
  s.sdNext = 0;
  s.grace = -1;
  s.chainKills = {};
  for (const p of s.players) {
    const [c, r] = SPAWNS[p.slot];
    Object.assign(p, {
      x: c + 0.5, y: r + 0.5, dir: 'd', moving: false, alive: true, bombs: B.startBombs, fire: B.startFire, speed: 0,
      kick: false, shield: false, curse: null, curseUntil: 0, invulnUntil: 0, death: null,
    });
  }
}

function blockedFor(s: BombState, c: number, r: number, p: BPlayer): boolean {
  if (!inside(c, r) || s.grid[idx(c, r)] !== FLOOR) return true;
  const b = bombAt(s, c, r);
  return !!b && !b.pass.includes(p.id);
}

/** Move along axis a (0 = x, 1 = y) by up to dist in direction d. Corner-assist aligns the cross axis. */
export function moveAxis(s: BombState, p: BPlayer, a: 0 | 1, d: 1 | -1, dist: number, ev: BombEvent[]): number {
  const pos = [p.x, p.y];
  const b = 1 - a;
  const at = (ia: number, ib: number): [number, number] => (a === 0 ? [ia, ib] : [ib, ia]);
  const free = (ia: number, ib: number) => !blockedFor(s, ...at(ia, ib), p);
  const cellA = Math.floor(pos[a]);
  const cellB = Math.floor(pos[b]);
  let moved = 0;
  const off = pos[b] - (cellB + 0.5);
  if (Math.abs(off) > EPS) {
    let target: number | null = null;
    if (free(cellA + d, cellB)) target = cellB + 0.5;
    else {
      const nb = cellB + Math.sign(off);
      if (1 - Math.abs(off) <= B.cornerAssist && free(cellA + d, nb) && free(cellA, nb)) target = nb + 0.5;
    }
    if (target === null) return 0;
    const step = Math.min(Math.abs(target - pos[b]), dist);
    pos[b] += Math.sign(target - pos[b]) * step;
    if (Math.abs(target - pos[b]) < EPS) pos[b] = target;
    dist -= step;
    moved += step;
  }
  if (dist > EPS && Math.abs(pos[b] - Math.floor(pos[b]) - 0.5) < EPS) {
    const rowB = Math.floor(pos[b]);
    const center = cellA + 0.5;
    let target = pos[a] + d * dist;
    if (!free(cellA + d, rowB)) {
      target = d > 0 ? Math.min(target, Math.max(pos[a], center)) : Math.max(target, Math.min(pos[a], center));
      const [kc, kr] = at(cellA + d, rowB);
      const bomb = bombAt(s, kc, kr);
      if (bomb && p.kick && !bomb.pass.includes(p.id) && bomb.dx === 0 && bomb.dy === 0 && Math.abs(target - center) < EPS) {
        const [dx, dy] = at(d, 0);
        if (slideFree(s, bomb, dx, dy)) {
          bomb.dx = dx;
          bomb.dy = dy;
          ev.push({ type: 'kick', c: kc, r: kr });
        }
      }
    }
    moved += Math.abs(target - pos[a]);
    pos[a] = target;
  }
  p.x = pos[0];
  p.y = pos[1];
  return moved;
}

function slideFree(s: BombState, b: Bomb, dx: number, dy: number): boolean {
  const c = b.c + dx;
  const r = b.r + dy;
  if (!inside(c, r) || s.grid[idx(c, r)] !== FLOOR || bombAt(s, c, r)) return false;
  return !s.players.some((p) => p.alive && overlaps(p, c, r));
}

function movePlayer(s: BombState, p: BPlayer, inp: BombInput, ev: BombEvent[]): void {
  let { up, down, left, right } = inp;
  if (p.curse === 'reverse') [up, down, left, right] = [down, up, right, left];
  const h = left === right ? 0 : left ? -1 : 1;
  const v = up === down ? 0 : up ? -1 : 1;
  const tries: [0 | 1, 1 | -1][] = [];
  const hz: [0 | 1, 1 | -1] | null = h ? [0, h as 1 | -1] : null;
  const vt: [0 | 1, 1 | -1] | null = v ? [1, v as 1 | -1] : null;
  // both pressed: try the turn first (perpendicular to facing), fall back to the other axis
  const facingH = p.dir === 'l' || p.dir === 'r';
  for (const t of facingH ? [vt, hz] : [hz, vt]) if (t) tries.push(t);
  p.moving = false;
  const dist = speedOf(p);
  const dirOf = ([a, d]: [0 | 1, 1 | -1]): Dir => (a === 0 ? (d > 0 ? 'r' : 'l') : d > 0 ? 'd' : 'u');
  for (const t of tries) {
    if (moveAxis(s, p, t[0], t[1], dist, ev) > EPS) {
      p.moving = true;
      p.dir = dirOf(t);
      return;
    }
  }
  if (tries.length) p.dir = dirOf(tries[tries.length - 1]);
}

function placeBomb(s: BombState, p: BPlayer, ev: BombEvent[]): void {
  if (p.curse === 'nobomb') return;
  const [c, r] = cellOf(p);
  if (s.grid[idx(c, r)] !== FLOOR || bombAt(s, c, r)) return;
  if (s.bombs.filter((b) => b.owner === p.id).length >= p.bombs) return;
  const pass = s.players.filter((q) => q.alive && overlaps(q, c, r)).map((q) => q.id);
  s.bombs.push({ id: s.nextId++, owner: p.id, c, r, fuse: B.fuseTicks, fire: p.fire, dx: 0, dy: 0, s: 0, pass });
  ev.push({ type: 'place', c, r });
}

function pickItem(s: BombState): ItemKind {
  const w = B.dropWeights;
  let total = 0;
  for (const k in w) total += w[k];
  let roll = random(s) * total;
  for (const k in w) {
    roll -= w[k];
    if (roll < 0) return k as ItemKind;
  }
  return 'bomb';
}

function applyItem(s: BombState, p: BPlayer, k: ItemKind): void {
  switch (k) {
    case 'bomb': p.bombs = Math.min(B.maxBombs, p.bombs + 1); break;
    case 'fire': p.fire = Math.min(B.maxFire, p.fire + 1); break;
    case 'maxfire': p.fire = B.maxFire; break;
    case 'speed': p.speed = Math.min(B.maxSpeedLevel, p.speed + 1); break;
    case 'kick': p.kick = true; break;
    case 'shield': p.shield = true; break;
    case 'skull': {
      const curses: Curse[] = ['slow', 'reverse', 'nobomb'];
      p.curse = curses[Math.floor(random(s) * curses.length)];
      p.curseUntil = s.tick + B.curseTicks;
      break;
    }
  }
}

/** Cells a bomb's flame reaches (center first), and what stops each arm. Pure. */
export function blastCells(s: BombState, c: number, r: number, fire: number): { cells: [number, number][]; crates: [number, number][] } {
  const cells: [number, number][] = [[c, r]];
  const crates: [number, number][] = [];
  for (const [dx, dy] of DIRS) {
    for (let i = 1; i <= fire; i++) {
      const x = c + dx * i;
      const y = r + dy * i;
      const t = inside(x, y) ? s.grid[idx(x, y)] : WALL;
      if (t === WALL) break;
      if (t === CRATE) {
        crates.push([x, y]);
        break;
      }
      cells.push([x, y]);
      if (bombAt(s, x, y)) break; // the other bomb chains and covers the rest; items burn, flame goes on
    }
  }
  return { cells, crates };
}

function explode(s: BombState, ev: BombEvent[]): void {
  // [bomb, chain id]: a bomb set off by a lingering flame joins that flame's chain
  const queue: [Bomb, number][] = s.bombs
    .filter((b) => b.fuse <= 0 || flameAt(s, b.c, b.r))
    .map((b) => [b, s.flames.find((f) => f.c === b.c && f.r === b.r)?.ch ?? b.id]);
  const burning = new Map<number, [number, number, PlayerId]>();
  while (queue.length) {
    const [b, ch] = queue.shift()!;
    const i = s.bombs.indexOf(b);
    if (i < 0) continue;
    s.bombs.splice(i, 1);
    ev.push({ type: 'explode', c: b.c, r: b.r });
    const { cells, crates } = blastCells(s, b.c, b.r, b.fire);
    for (const [c, r] of crates) if (!burning.has(idx(c, r))) burning.set(idx(c, r), [c, r, b.owner]);
    for (const [c, r] of cells) {
      const f = s.flames.find((q) => q.c === c && q.r === r);
      if (f) Object.assign(f, { t: B.flameTicks, o: b.owner, ch });
      else s.flames.push({ c, r, t: B.flameTicks, o: b.owner, ch });
      s.items = s.items.filter((it) => it.c !== c || it.r !== r);
      const other = bombAt(s, c, r);
      if (other && !queue.some(([q]) => q === other)) queue.push([other, ch]);
    }
  }
  for (const [i, [c, r, owner]] of burning) {
    s.grid[i] = FLOOR;
    const o = s.players.find((p) => p.id === owner);
    if (o) o.crates++;
    ev.push({ type: 'crate', c, r });
    if (random(s) < B.dropChance) s.items.push({ c, r, k: pickItem(s) });
  }
}

/** f = the flame that got them; none = crushed by sudden death. */
function kill(s: BombState, p: BPlayer, ev: BombEvent[], f?: Flame): void {
  p.alive = false;
  p.moving = false;
  p.deaths++;
  let d: Death = { by: null, cause: 'crush', multi: 0 };
  if (f) {
    const k = s.players.find((q) => q.id === f.o);
    if (!k || k === p) {
      p.suicides++;
      d = { by: p.id, cause: 'self', multi: 0 };
    } else {
      const enemy = side(s, k) !== side(s, p);
      if (enemy) k.kills++;
      const key = `${f.ch}|${k.id}`;
      const n = (s.chainKills[key] ?? 0) + (enemy ? 1 : 0);
      s.chainKills[key] = n;
      d = { by: k.id, cause: 'bomb', multi: n };
    }
  }
  p.death = d;
  ev.push({ type: 'death', id: p.id, x: p.x, y: p.y, ...d });
}

/** Most kills; ties → fewer deaths → fewer suicides → slot. null if nobody killed anyone. */
export function mvp(players: BPlayer[]): BPlayer | null {
  const best = [...players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.suicides - b.suicides || a.slot - b.slot)[0];
  return best && best.kills > 0 ? best : null;
}

function suddenDeath(s: BombState, ev: BombEvent[]): void {
  if (s.timeLeft === 0 && s.sdIdx === 0 && s.sdNext === 0) ev.push({ type: 'sudden' });
  if (--s.sdNext > 0) return;
  s.sdNext = B.suddenEveryTicks;
  while (s.sdIdx < SPIRAL.length) {
    const [c, r] = SPIRAL[s.sdIdx++];
    const i = idx(c, r);
    if (s.grid[i] === WALL) continue;
    s.grid[i] = WALL;
    s.bombs = s.bombs.filter((b) => b.c !== c || b.r !== r);
    s.items = s.items.filter((it) => it.c !== c || it.r !== r);
    s.flames = s.flames.filter((f) => f.c !== c || f.r !== r);
    ev.push({ type: 'fall', c, r });
    for (const p of s.players) {
      const [pc, pr] = cellOf(p);
      if (p.alive && pc === c && pr === r) kill(s, p, ev);
    }
    return;
  }
}

function sidesAlive(s: BombState): Set<string> {
  return new Set(s.players.filter((p) => p.alive).map((p) => side(s, p)));
}

export function step(s: BombState, inputs: Record<PlayerId, BombInput>): BombEvent[] {
  const ev: BombEvent[] = [];
  s.tick++;
  if (s.phase === 'matchEnd') return ev;
  if (s.phase === 'countdown') {
    s.phaseTicks--;
    const left = s.phaseTicks - 30;
    if (left > 0 && left % 60 === 0) ev.push({ type: 'countdown', n: left / 60 });
    if (left === 0) {
      s.phase = 'play';
      ev.push({ type: 'go' });
    }
    // swallow presses made during the countdown so they don't fire on "Başla!"
    for (const p of s.players) if (!p.bot) p.seq = (inputs[p.id] ?? EMPTY_INPUT).seq;
    return ev;
  }
  if (s.phase === 'roundEnd') {
    if (--s.phaseTicks > 0) return ev;
    const best = Math.max(...s.players.map((p) => p.wins));
    if (best >= B.winsToWin) {
      s.phase = 'matchEnd';
      ev.push({ type: 'matchEnd', winner: s.lastWinner });
    } else newRound(s);
    return ev;
  }

  // play
  for (const p of s.players) {
    if (!p.alive) continue;
    if (p.curse && s.tick >= p.curseUntil) p.curse = null;
    const inp = p.bot ? botInput(s, p) : inputs[p.id] ?? EMPTY_INPUT;
    movePlayer(s, p, inp, ev);
    // a new seq IS the press (bomb is just "held"): a press+release between two ticks still places
    if (inp.seq !== p.seq) {
      p.seq = inp.seq;
      placeBomb(s, p, ev);
    }
    const [c, r] = cellOf(p);
    const it = s.items.findIndex((q) => q.c === c && q.r === r);
    if (it >= 0) {
      const k = s.items[it].k;
      s.items.splice(it, 1);
      applyItem(s, p, k);
      p.items++;
      ev.push({ type: 'pickup', id: p.id, k });
    }
  }
  for (const b of s.bombs) {
    b.pass = b.pass.filter((id) => {
      const p = s.players.find((q) => q.id === id);
      return !!p && p.alive && overlaps(p, b.c, b.r);
    });
    if (b.dx || b.dy) {
      if (b.s === 0 && !slideFree(s, b, b.dx, b.dy)) b.dx = b.dy = 0;
      else if ((b.s += B.kickSpeed) >= 1) {
        b.c += b.dx;
        b.r += b.dy;
        b.s = 0;
      }
    }
    b.fuse--;
  }
  explode(s, ev);
  for (const p of s.players) {
    if (!p.alive || s.tick < p.invulnUntil) continue;
    const [c, r] = cellOf(p);
    const f = s.flames.find((q) => q.c === c && q.r === r);
    if (!f) continue;
    if (p.shield) {
      p.shield = false;
      p.invulnUntil = s.tick + B.shieldInvulnTicks;
      ev.push({ type: 'shield', id: p.id });
    } else kill(s, p, ev, f);
  }
  for (const f of s.flames) f.t--;
  s.flames = s.flames.filter((f) => f.t > 0);

  if (s.timeLeft > 0) s.timeLeft--;
  if (s.timeLeft === 0) suddenDeath(s, ev);

  const sides = sidesAlive(s);
  if (s.grace < 0 && sides.size <= 1) s.grace = B.endGraceTicks;
  if (s.grace >= 0 && --s.grace <= 0) {
    const final = sidesAlive(s);
    const winner = final.size === 1 ? [...final][0] : null;
    s.lastWinner = winner;
    for (const p of s.players) if (winner !== null && side(s, p) === winner) p.wins++;
    s.phase = 'roundEnd';
    s.phaseTicks = B.roundEndTicks;
    s.grace = -1;
    ev.push({ type: 'roundEnd', winner });
  }
  return ev;
}

export function ownPos(s: BombState, id: PlayerId): { x: number; y: number } | null {
  const p = s.players.find((q) => q.id === id);
  return p && p.alive ? { x: p.x, y: p.y } : null;
}

/** Client-authoritative movement, loosely validated: walkable tile, no teleports, one axis centered. */
export function setOwnPos(s: BombState, id: PlayerId, pos: { x: number; y: number }): void {
  const p = s.players.find((q) => q.id === id);
  if (!p || p.bot || !p.alive || s.phase !== 'play') return;
  let { x, y } = pos;
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x - p.x) + Math.abs(y - p.y) > 3) return;
  const c = Math.floor(x);
  const r = Math.floor(y);
  if (!inside(c, r) || s.grid[idx(c, r)] !== FLOOR) return;
  const ox = x - c - 0.5;
  const oy = y - r - 0.5;
  if (Math.abs(ox) > EPS && Math.abs(oy) > EPS) {
    if (Math.abs(ox) < Math.abs(oy)) x = c + 0.5;
    else y = r + 0.5;
  }
  p.x = x;
  p.y = y;
}

/** A human who drops out of the room is played by a bot until they come back. */
export function setConnected(s: BombState, id: PlayerId, connected: boolean): void {
  const p = s.players.find((q) => q.id === id);
  if (p && !p.id.startsWith('bot')) p.bot = !connected;
}

export const bombSim: GameSim<BombState, BombInput, BombEvent> = {
  tickRate: 60,
  emptyInput: EMPTY_INPUT,
  createGame,
  step,
  ownPos,
  setOwnPos,
  setConnected,
};
