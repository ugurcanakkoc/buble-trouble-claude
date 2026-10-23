// Çağlar Savaşı: pure deterministic sim (plain-JSON state, 60 Hz, seeded mulberry32).
import type { GameSim } from '../types';
import type { PlayerId, PlayerInfo } from '../../sim/types';
import * as B from './balance';
import { aiCommand } from './ai';

export type Team = 0 | 1;

export type WarCommand =
  | { type: 'train'; unit: 0 | 1 | 2 | 3 }
  | { type: 'turret'; slot: number; kind: number }
  | { type: 'sellTurret'; slot: number }
  | { type: 'buySlot' }
  | { type: 'special' }
  | { type: 'evolve' };

export interface WarInput {
  cmd: WarCommand | null;
  seq: number;
}

/** s: 0 walking, 1 blocked/waiting, 2 fighting */
export interface Unit { i: number; t: Team; k: number; x: number; hp: number; cd: number; s: 0 | 1 | 2 }

export interface QueueItem { k: number; by: string }

export interface TeamState {
  gold: number;
  xp: number;
  age: number;
  hp: number;
  maxHp: number;
  q: QueueItem[];
  qt: number; // ticks trained on q[0]
  slots: number;
  tur: number[]; // TURRETS index per slot, -1 empty (length MAX_SLOTS)
  tcd: number[];
  spCd: number;
  kills: number;
  ai: number; // -1 humans, else AI level 0..2
}

export interface Special { t: Team; age: number; at: number; done: number }

/** seq: last command seq seen; -1 until the first input arrives (that one only sets the baseline, so a
 *  stale input from the previous match can never fire in a new one). */
export interface WarPlayer extends PlayerInfo { team: Team; seq: number; connected: boolean }

/** Recent human commands (shown as "Ali: Okçu eğitiyor" to teammates). Capped at LOG_MAX. */
export interface LogEntry { by: string; seq: number; team: Team; ok: boolean; text: string }
export const LOG_MAX = 6;

export interface WarState {
  tick: number;
  rng: number;
  nextId: number;
  mode: 'ai' | 'pvp';
  phase: 'playing' | 'over';
  winner: Team | -1;
  teams: [TeamState, TeamState];
  units: Unit[];
  sp: Special[];
  players: WarPlayer[];
  log: LogEntry[];
}

export type WarEvent =
  | { type: 'cmd'; by: string; seq: number; team: Team; ok: boolean; text: string }
  | { type: 'spawn'; team: Team; k: number; x: number }
  | { type: 'attack'; team: Team; k: number; x: number; tx: number; ranged: boolean }
  | { type: 'turret'; team: Team; slot: number; k: number; tx: number }
  | { type: 'death'; team: Team; k: number; x: number; gold: number }
  | { type: 'baseHit'; team: Team; dmg: number }
  | { type: 'special'; team: Team; age: number; by: string }
  | { type: 'impact'; team: Team; age: number; x: number }
  | { type: 'evolve'; team: Team; age: number; by: string }
  | { type: 'over'; winner: Team };

export const dirOf = (t: Team) => (t === 0 ? 1 : -1);
/** x of a team's base wall (units of the other team attack it here) */
export const wallX = (t: Team) => (t === 0 ? B.BASE_FRONT : B.LANE_W - B.BASE_FRONT);
export const spawnX = (t: Team) => (t === 0 ? B.SPAWN_X : B.LANE_W - B.SPAWN_X);

export function random(s: WarState): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function newTeam(ai: number): TeamState {
  return {
    gold: B.START_GOLD, xp: 0, age: 0, hp: B.AGES[0].baseHp, maxHp: B.AGES[0].baseHp,
    q: [], qt: 0, slots: B.START_SLOTS, tur: Array(B.MAX_SLOTS).fill(-1), tcd: Array(B.MAX_SLOTS).fill(0),
    spCd: B.SPECIAL_FIRST_CD, kills: 0, ai,
  };
}

export function createGame(seed: number, players: PlayerInfo[], mode: string): WarState {
  const pvp = mode === 'pvp' && players.length >= 2;
  const list = players.slice(0, 2).map((p, i) => ({
    id: p.id, name: p.name, color: p.color, team: (pvp ? i % 2 : 0) as Team, seq: -1, connected: true,
  }));
  const humans = list.length;
  return {
    tick: 0, rng: seed | 0, nextId: 1, mode: pvp ? 'pvp' : 'ai', phase: 'playing', winner: -1,
    teams: [newTeam(-1), newTeam(pvp ? -1 : Math.min(2, Math.max(1, humans)))],
    units: [], sp: [], players: list, log: [],
  };
}

/** Unit table index for a train button of a team, or -1 if not available in its age. */
export function unitIndex(team: TeamState, slot: number): number {
  if (slot >= 0 && slot < 3) return team.age * 3 + slot;
  return slot === 3 && team.age === 4 ? B.SUPER_UNIT : -1;
}

export function setConnected(s: WarState, id: PlayerId, on: boolean): void {
  const p = s.players.find((q) => q.id === id);
  if (p) p.connected = on;
}

const isInt = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

/** Executes one command for a team. Returns a Turkish description and whether it happened. */
export function applyCommand(s: WarState, team: Team, by: string, c: WarCommand, ev: WarEvent[]): { ok: boolean; text: string } {
  const T = s.teams[team];
  const no = (text: string) => ({ ok: false, text });
  switch (c?.type) {
    case 'train': {
      const k = isInt(c.unit, 0, 3) ? unitIndex(T, c.unit) : -1;
      if (k < 0) return no('Bu birim yok');
      const u = B.UNITS[k];
      if (T.q.length >= B.QUEUE_MAX) return no('Sıra dolu');
      if (T.gold < u.cost) return no('Altın yetmiyor');
      T.gold -= u.cost;
      T.q.push({ k, by });
      return { ok: true, text: `${u.name} eğitiyor` };
    }
    case 'turret': {
      if (!isInt(c.slot, 0, B.MAX_SLOTS - 1) || !isInt(c.kind, 0, 2)) return no('Geçersiz');
      if (c.slot >= T.slots) return no('Yuva kilitli');
      const k = T.age * 3 + c.kind;
      const old = T.tur[c.slot];
      const refund = old >= 0 ? Math.floor(B.TURRETS[old].cost * B.SELL_REFUND) : 0;
      if (old === k) return no('Zaten kurulu');
      if (T.gold + refund < B.TURRETS[k].cost) return no('Altın yetmiyor');
      T.gold += refund - B.TURRETS[k].cost;
      T.tur[c.slot] = k;
      T.tcd[c.slot] = 0;
      return { ok: true, text: `${B.TURRETS[k].name} kurdu` };
    }
    case 'sellTurret': {
      if (!isInt(c.slot, 0, B.MAX_SLOTS - 1) || T.tur[c.slot] < 0) return no('Kule yok');
      const k = T.tur[c.slot];
      T.gold += Math.floor(B.TURRETS[k].cost * B.SELL_REFUND);
      T.tur[c.slot] = -1;
      return { ok: true, text: `${B.TURRETS[k].name} sattı` };
    }
    case 'buySlot': {
      if (T.slots >= B.MAX_SLOTS) return no('Tüm yuvalar açık');
      const cost = B.SLOT_COSTS[T.slots - 1];
      if (T.gold < cost) return no('Altın yetmiyor');
      T.gold -= cost;
      T.slots++;
      return { ok: true, text: 'kule yuvası açtı' };
    }
    case 'special': {
      if (T.spCd > 0) return no('Özel güç hazır değil');
      T.spCd = B.SPECIAL_CD;
      s.sp.push({ t: team, age: T.age, at: s.tick, done: 0 });
      ev.push({ type: 'special', team, age: T.age, by });
      return { ok: true, text: `${B.AGES[T.age].special.name}!` };
    }
    case 'evolve': {
      if (T.age >= B.AGES.length - 1) return no('Son çağdasın');
      if (T.xp < B.AGES[T.age].xpToNext) return no('XP yetmiyor');
      T.age++;
      const max = B.AGES[T.age].baseHp;
      T.hp = Math.ceil((T.hp * max) / T.maxHp);
      T.maxHp = max;
      ev.push({ type: 'evolve', team, age: T.age, by });
      return { ok: true, text: `${B.AGES[T.age].name} çağına geçti` };
    }
  }
  return no('Geçersiz');
}

function damageUnit(s: WarState, u: Unit, dmg: number, from: Team): void {
  if (u.hp <= 0) return;
  const d = Math.min(dmg, u.hp);
  u.hp -= dmg;
  s.teams[from].xp += d * B.XP_PER_DMG;
}

function damageArea(s: WarState, from: Team, x: number, r: number, dmg: number): void {
  for (const u of s.units) if (u.t !== from && Math.abs(u.x - x) <= r) damageUnit(s, u, dmg, from);
}

function damageBase(s: WarState, team: Team, dmg: number, from: Team, ev: WarEvent[]): void {
  const T = s.teams[team];
  const d = Math.min(dmg, T.hp);
  T.hp -= d;
  s.teams[from].xp += d * B.XP_PER_DMG;
  ev.push({ type: 'baseHit', team, dmg: d });
}

/** Closest enemy unit (by distance along the lane) to x, or null. */
function nearestEnemy(s: WarState, team: Team, x: number): Unit | null {
  let best: Unit | null = null;
  let bd = Infinity;
  for (const e of s.units) {
    if (e.t === team || e.hp <= 0) continue;
    const d = Math.abs(e.x - x);
    if (d < bd) [best, bd] = [e, d];
  }
  return best;
}

function stepUnits(s: WarState, ev: WarEvent[]): void {
  for (const u of s.units) {
    if (u.hp <= 0) continue;
    const def = B.UNITS[u.k];
    const d = dirOf(u.t);
    if (u.cd > 0) u.cd--;
    const enemy = nearestEnemy(s, u.t, u.x);
    const egap = enemy ? (enemy.x - u.x) * d - (def.w + B.UNITS[enemy.k].w) / 2 : Infinity;
    const foe: Team = u.t === 0 ? 1 : 0;
    const wgap = (wallX(foe) - u.x) * d - def.w / 2;
    const ranged = def.range > 20;
    if (enemy && egap <= def.range) {
      u.s = 2;
      if (u.cd <= 0) {
        u.cd = def.cd;
        if (def.splash) damageArea(s, u.t, enemy.x, def.splash, def.dmg);
        else damageUnit(s, enemy, def.dmg, u.t);
        ev.push({ type: 'attack', team: u.t, k: u.k, x: u.x, tx: enemy.x, ranged });
      }
      continue;
    }
    if (wgap <= def.range) {
      u.s = 2;
      if (u.cd <= 0) {
        u.cd = def.cd;
        damageBase(s, foe, def.dmg, u.t, ev);
        ev.push({ type: 'attack', team: u.t, k: u.k, x: u.x, tx: wallX(foe), ranged });
      }
      continue;
    }
    // walk, but never into the ally ahead or through an enemy
    let move = Math.min(def.speed / B.TICK, egap, wgap);
    for (const a of s.units) {
      if (a === u || a.t !== u.t || a.hp <= 0) continue;
      const ahead = (a.x - u.x) * d;
      if (ahead > 0 || (ahead === 0 && a.i < u.i)) move = Math.min(move, ahead - (def.w + B.UNITS[a.k].w) / 2 - B.UNIT_GAP);
    }
    if (move > 0) {
      u.x += move * d;
      u.s = 0;
    } else u.s = 1;
  }
}

function stepTurrets(s: WarState, ev: WarEvent[]): void {
  for (const team of [0, 1] as Team[]) {
    const T = s.teams[team];
    const wx = wallX(team);
    for (let slot = 0; slot < B.MAX_SLOTS; slot++) {
      const k = T.tur[slot];
      if (k < 0) continue;
      if (T.tcd[slot] > 0) {
        T.tcd[slot]--;
        continue;
      }
      const def = B.TURRETS[k];
      const target = nearestEnemy(s, team, wx);
      if (!target || Math.abs(target.x - wx) > def.range) continue;
      T.tcd[slot] = def.cd;
      if (def.splash) damageArea(s, team, target.x, def.splash, def.dmg);
      else damageUnit(s, target, def.dmg, team);
      ev.push({ type: 'turret', team, slot, k, tx: target.x });
    }
  }
}

function stepSpecials(s: WarState, ev: WarEvent[]): void {
  for (const sp of s.sp) {
    const def = B.AGES[sp.age].special;
    const from = wallX(sp.t);
    const to = wallX(sp.t === 0 ? 1 : 0);
    while (sp.done < def.hits && s.tick - sp.at >= Math.floor((sp.done * def.duration) / def.hits)) {
      const f = def.sweep ? (sp.done + 0.5) / def.hits : 0.08 + random(s) * 0.92;
      const x = from + (to - from) * f;
      damageArea(s, sp.t, x, def.radius, def.dmg);
      ev.push({ type: 'impact', team: sp.t, age: sp.age, x });
      sp.done++;
    }
  }
  s.sp = s.sp.filter((sp) => sp.done < B.AGES[sp.age].special.hits);
}

function stepTraining(s: WarState, ev: WarEvent[]): void {
  for (const team of [0, 1] as Team[]) {
    const T = s.teams[team];
    if (!T.q.length) continue;
    const k = T.q[0].k;
    const def = B.UNITS[k];
    if (T.qt < def.train) {
      T.qt++;
      continue;
    }
    const x = spawnX(team);
    const mine = s.units.filter((u) => u.t === team);
    if (mine.length >= B.TEAM_CAP) continue;
    if (mine.some((u) => Math.abs(u.x - x) < (def.w + B.UNITS[u.k].w) / 2 + B.UNIT_GAP)) continue; // exit blocked
    T.q.shift();
    T.qt = 0;
    s.units.push({ i: s.nextId++, t: team, k, x, hp: def.hp, cd: 0, s: 0 });
    ev.push({ type: 'spawn', team, k, x });
  }
}

function humanIncomeMult(s: WarState, team: Team): number {
  const T = s.teams[team];
  if (T.ai >= 0) return B.AI.incomeMult[T.ai];
  return s.mode === 'ai' ? B.AI_MODE_HUMAN_INCOME : 1;
}

export function step(s: WarState, inputs: Record<PlayerId, WarInput>): WarEvent[] {
  const ev: WarEvent[] = [];
  if (s.phase !== 'playing') return ev;
  s.tick++;

  for (const p of s.players) {
    const inp = inputs[p.id];
    if (!inp || !Number.isFinite(inp.seq) || inp.seq <= p.seq) continue;
    const first = p.seq < 0;
    p.seq = inp.seq;
    if (first || !inp.cmd) continue;
    const e = { by: p.id, seq: p.seq, team: p.team, ...applyCommand(s, p.team, p.id, inp.cmd, ev) };
    ev.push({ type: 'cmd', ...e });
    s.log.push(e);
    if (s.log.length > LOG_MAX) s.log.shift();
  }
  for (const team of [0, 1] as Team[]) {
    const T = s.teams[team];
    if (T.ai < 0 || s.tick % B.AI.thinkEvery[T.ai] !== 0) continue;
    const c = aiCommand(s, team);
    if (c) applyCommand(s, team, 'ai', c, ev);
  }

  for (const team of [0, 1] as Team[]) {
    const T = s.teams[team];
    if (T.spCd > 0) T.spCd--;
    if (s.tick % B.TICK !== 0) continue;
    T.gold += Math.round(B.PASSIVE_GOLD[T.age] * humanIncomeMult(s, team));
    if (s.tick > B.SUDDEN_DEATH) T.hp = Math.max(0, T.hp - Math.ceil(T.maxHp * B.SUDDEN_DEATH_DECAY));
  }

  stepTraining(s, ev);
  stepUnits(s, ev);
  stepTurrets(s, ev);
  stepSpecials(s, ev);

  if (s.units.some((u) => u.hp <= 0)) {
    for (const u of s.units) {
      if (u.hp > 0) continue;
      const killer: Team = u.t === 0 ? 1 : 0;
      const def = B.UNITS[u.k];
      const gold = Math.round(def.cost * B.KILL_GOLD_MULT);
      s.teams[killer].gold += gold;
      s.teams[killer].xp += def.cost * B.XP_KILL_MULT;
      s.teams[killer].kills++;
      ev.push({ type: 'death', team: u.t, k: u.k, x: u.x, gold });
    }
    s.units = s.units.filter((u) => u.hp > 0);
  }

  const [a, b] = s.teams;
  if (a.hp <= 0 || b.hp <= 0 || s.tick >= B.MAX_TICKS) {
    s.phase = 'over';
    const ra = a.hp / a.maxHp;
    const rb = b.hp / b.maxHp;
    s.winner = ra !== rb ? (ra > rb ? 0 : 1) : a.kills >= b.kills ? 0 : 1;
    ev.push({ type: 'over', winner: s.winner });
  }
  return ev;
}

export const warSim: GameSim<WarState, WarInput, WarEvent> = {
  tickRate: B.TICK,
  emptyInput: { cmd: null, seq: 0 },
  createGame,
  step,
  setConnected,
};
