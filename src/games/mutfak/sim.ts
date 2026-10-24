// Mutfak Kaosu: pure deterministic sim (host-authoritative, 60 Hz). Plain-JSON state, see types.ts.
import type { PlayerId, PlayerInfo } from '../../sim/types';
import type { GameSim } from '../types';
import {
  BALANCE as B, CHOP, COLS, DISHES, LAHMACUN_PARTS, PHONE_DISHES, PLATE, PRICES, RANKS, ROWS, SCOLS, SOUP_PARTS,
  SROWS, STREET, UPGRADES,
} from './balance';
import { botInput } from './bot';
import type {
  BotCourier, DaySummary, Dir, Dish, Item, MPlayer, ModeId, MutfakEvent, MutfakInput, MutfakState, Order, Role, Station,
  StationKind, UpgradeId,
} from './types';

export const EMPTY_INPUT: MutfakInput = { dx: 0, dy: 0, b: false, aSeq: 0, buy: '', buySeq: 0, ready: false };
export const SLOT_COLORS = [0xff5a5a, 0x4aa8ff, 0x4be37a, 0xffd23f];
const EPS = 1e-6;

/** Fixed kitchen layout (12×8). Everything else on the border is wall; interior cells without a station are floor. */
export const LAYOUT: [number, number, StationKind, string?][] = [
  [1, 0, 'crate', 'domates'], [2, 0, 'crate', 'sogan'], [3, 0, 'crate', 'kiyma'],
  [4, 0, 'crate', 'hamur'], [5, 0, 'crate', 'mercimek'], [6, 0, 'crate', 'lavas'],
  [9, 0, 'cashier'],
  [0, 2, 'board'], [0, 3, 'counter'], [0, 4, 'trash'], [0, 5, 'sink'],
  [1, 7, 'stove'], [2, 7, 'stove', 'off'], [3, 7, 'oven'], [4, 7, 'doner'], [5, 7, 'tea'], [6, 7, 'pack'],
  [8, 7, 'table', '3'], [10, 7, 'door'],
  [11, 2, 'table', '0'], [11, 4, 'table', '1'], [11, 6, 'table', '2'],
  [7, 1, 'counter'], [7, 2, 'counter'], [7, 3, 'serve'], [7, 4, 'pano'], [7, 5, 'counter'],
  [3, 3, 'counter'], [4, 3, 'counter'],
];
export const KASA_SPOT: [number, number] = [9, 1]; // standing here = at the cashier (sees queued orders)
export const DOOR_SPOT: [number, number] = [10, 6]; // where a returning courier appears
const SPAWN: Record<Role, [number, number]> = { mutfak: [2, 2], garson: [9, 2], kurye: [9, 5], bulasik: [1, 5] };

/** Suggested roles per player count (doc §2). Index = slot. */
export const ROLE_SETS: Role[][][] = [
  [['mutfak', 'garson', 'bulasik']],
  [['mutfak', 'garson'], ['kurye', 'bulasik']],
  [['mutfak'], ['garson', 'bulasik'], ['kurye']],
  [['mutfak'], ['garson'], ['kurye'], ['bulasik']],
];
export const assignRoles = (n: number): Role[][] => ROLE_SETS[Math.min(Math.max(n, 1), 4) - 1];

export function random(s: { rng: number }): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const DIRS: Record<Dir, [number, number]> = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] };
export const cellOf = (p: { x: number; y: number }): [number, number] => [Math.floor(p.x), Math.floor(p.y)];
export const stationAt = (s: MutfakState, c: number, r: number) => s.stations.find((t) => t.c === c && t.r === r);
export const isRoad = (c: number, r: number) => c >= 0 && r >= 0 && c < SCOLS && r < SROWS && (c % 3 === 0 || r % 3 === 0);
export const isFloor = (s: MutfakState, c: number, r: number) => c >= 1 && r >= 1 && c < COLS - 1 && r < ROWS - 1 && !stationAt(s, c, r);
const humans = (s: MutfakState) => s.players.filter((p) => !p.bot);
const sink = (s: MutfakState) => s.stations.find((t) => t.k === 'sink')!;
const door = (s: MutfakState) => s.stations.find((t) => t.k === 'door')!;
const orderById = (s: MutfakState, id: number) => s.orders.find((o) => o.id === id);

// ---------- items ----------
const parts = (it: Item) => it.p ?? [];
const isBase = (it: Item) => it.k === 'tabak' || it.k === 'hamur';
const isSimple = (it: Item) => !isBase(it) && it.k !== 'paket' && it.k !== 'kirli' && it.k !== 'tencere';
function subMultiset(a: string[], b: string[]): boolean {
  const left = [...b];
  for (const x of a) {
    const i = left.indexOf(x);
    if (i < 0) return false;
    left.splice(i, 1);
  }
  return true;
}
/** Can `x` go onto base item `base`? */
export function accepts(base: Item, x: string): boolean {
  if (base.k === 'tabak') return Object.values(PLATE).some((r) => subMultiset([...parts(base), x], r));
  if (base.k === 'hamur') return LAHMACUN_PARTS.includes(x) && !parts(base).includes(x);
  return false;
}
function addTo(base: Item, x: string): Item {
  const p = [...parts(base), x].sort();
  if (base.k === 'hamur' && p.length === LAHMACUN_PARTS.length) return { k: 'lahmacunRaw' };
  return { k: base.k, p };
}
/** The dish an item is, when complete (çay glass or a finished plate), else null. */
export function dishOf(it: Item | null): Dish | null {
  if (!it) return null;
  if (it.k === 'cay') return 'cay';
  if (it.k !== 'tabak') return null;
  const p = [...parts(it)].sort().join(',');
  for (const d of Object.keys(PLATE) as (keyof typeof PLATE)[]) if (PLATE[d].join(',') === p) return d;
  return null;
}

// ---------- numbers ----------
export function dayTarget(s: MutfakState, day = s.day): number {
  const base = B.targets[Math.min(day, B.targets.length) - 1] * B.endlessGrowth ** Math.max(0, day - B.targets.length);
  return Math.round(base * B.playerScale[Math.min(humansCount(s), 4) - 1]);
}
const humansCount = (s: MutfakState) => Math.max(1, s.players.length);
export const rentOf = (day: number) => (day <= B.graceDays ? 0 : B.rentBase + B.rentPerDay * day);
const repFloor = (s: MutfakState) => (s.day <= B.graceDays ? B.graceRepFloor : 0);
export const upgradePrice = (s: MutfakState, id: UpgradeId) =>
  id === 'botKurye' && s.players.length === 1 ? 0 : UPGRADES.find((u) => u.id === id)!.price;
export function starsFor(s: MutfakState, revenue: number, day = s.day): number {
  const t = dayTarget(s, day);
  return B.starMul.filter((m) => revenue >= t * m).length;
}
export function rankOf(stars: number): string {
  return RANKS.find(([n]) => stars >= n)![1];
}
export const totalStars = (s: MutfakState) => s.history.reduce((a, d) => a + d.stars, 0);

/** Asymmetric info: can this player read the dine-in order? (scene must use this to hide order details) */
export function canSeeOrder(s: MutfakState, pid: PlayerId, o: Order): boolean {
  if (!s.asym || o.kind === 'phone' || o.pin || o.by === pid) return true;
  const p = s.players.find((q) => q.id === pid);
  if (!p || p.mode !== 'kitchen' || o.st !== 'queue') return false;
  const [c, r] = cellOf(p);
  return c === KASA_SPOT[0] && r === KASA_SPOT[1];
}

// ---------- setup ----------
const newSummary = (day: number): DaySummary => ({ day, revenue: 0, tips: 0, rent: 0, served: 0, failed: 0, dropped: 0, stars: 0 });

export function createGame(seed: number, infos: PlayerInfo[], mode: string): MutfakState {
  const list = infos.slice(0, 4);
  const roles = assignRoles(list.length);
  const players: MPlayer[] = list.map((h, slot) => ({
    id: h.id, name: h.name, color: h.color ?? SLOT_COLORS[slot], slot, roles: roles[slot], bot: false, mode: 'kitchen',
    x: 0, y: 0, dir: 'd', moving: false, hand: null, bag: [], aSeq: 0, buySeq: 0, ready: false, work: -1, resync: 0, modeAt: -1e9,
  }));
  const stations: Station[] = LAYOUT.map(([c, r, k, extra], id) => ({
    id, k, c, r, item: null, t: 0, prog: 0, n: 0, m: 0,
    ...(k === 'crate' ? { src: extra } : {}),
    ...(k === 'door' ? { q: [] } : {}),
    ...(k === 'table' ? { table: Number(extra) } : {}),
    ...(extra === 'off' ? { off: true } : {}),
  }));
  const s: MutfakState = {
    tick: 0, rng: seed >>> 0 || 1, mode: mode === 'sonsuz' ? 'sonsuz' : ('kampanya' as ModeId), day: 1, phase: 'prep', phaseLeft: 0,
    money: B.startMoney, rep: B.startRep, clean: 100, asym: players.length >= 2,
    up: { ocak2: false, bicak: false, makine: false, botKurye: players.length === 1, hali: false },
    players, stations, orders: [], courier: { active: false, x: 0, y: 0, nx: 0, ny: 0, bag: [], out: false },
    nextId: 1, nextCustomer: 0, today: newSummary(1), history: [], bankrupt: false, upBy: {},
  };
  startDay(s, []);
  return s;
}

function startDay(s: MutfakState, ev: MutfakEvent[]): void {
  s.phase = 'prep';
  s.phaseLeft = B.prepTicks;
  s.orders = [];
  s.today = newSummary(s.day);
  for (const t of s.stations) {
    Object.assign(t, { item: null, t: 0, prog: 0, n: 0, m: 0 });
    if (t.k === 'crate') t.n = B.crateStock;
    if (t.k === 'tea') t.n = B.teaGlasses;
    if (t.k === 'sink') t.m = B.plates;
    if (t.k === 'door') t.q = [];
    if (t.off !== undefined) t.off = !s.up.ocak2;
  }
  for (const p of s.players) {
    const [c, r] = SPAWN[p.roles[0]];
    Object.assign(p, { mode: 'kitchen', x: c + 0.5, y: r + 0.5, dir: 'd', moving: false, hand: null, bag: [], ready: false, work: -1 });
  }
  const [hc, hr] = STREET.home;
  s.courier = { active: s.up.botKurye, x: hc + 0.5, y: hr + 0.5, nx: hc + 0.5, ny: hr + 0.5, bag: [], out: false };
  ev.push({ type: 'phase', phase: 'prep', day: s.day });
}

// ---------- movement ----------
type Body = { x: number; y: number; dir: Dir; moving: boolean };
type Free = (c: number, r: number) => boolean;

/** Move along axis a (0 = x, 1 = y) by up to dist in direction d, corner-assist on the cross axis (bomb rules). */
function moveAxis(p: Body, a: 0 | 1, d: 1 | -1, dist: number, free: Free): number {
  const pos = [p.x, p.y];
  const b = 1 - a;
  const ok = (ia: number, ib: number) => (a === 0 ? free(ia, ib) : free(ib, ia));
  const cellA = Math.floor(pos[a]);
  const cellB = Math.floor(pos[b]);
  let moved = 0;
  const off = pos[b] - (cellB + 0.5);
  if (Math.abs(off) > EPS) {
    let target: number | null = null;
    if (ok(cellA + d, cellB)) target = cellB + 0.5;
    else {
      const nb = cellB + Math.sign(off);
      if (1 - Math.abs(off) <= B.cornerAssist && ok(cellA + d, nb) && ok(cellA, nb)) target = nb + 0.5;
    }
    if (target === null) return 0;
    const st = Math.min(Math.abs(target - pos[b]), dist);
    pos[b] += Math.sign(target - pos[b]) * st;
    if (Math.abs(target - pos[b]) < EPS) pos[b] = target;
    dist -= st;
    moved += st;
  }
  if (dist > EPS && Math.abs(pos[b] - Math.floor(pos[b]) - 0.5) < EPS) {
    const center = cellA + 0.5;
    let target = pos[a] + d * dist;
    if (!ok(cellA + d, Math.floor(pos[b])))
      target = d > 0 ? Math.min(target, Math.max(pos[a], center)) : Math.max(target, Math.min(pos[a], center));
    moved += Math.abs(target - pos[a]);
    pos[a] = target;
  }
  p.x = pos[0];
  p.y = pos[1];
  return moved;
}

const DEAD = 0.35; // joystick dead zone
function moveBody(p: Body, inp: MutfakInput, dist: number, free: Free): void {
  const h = Math.abs(inp.dx) < DEAD ? 0 : Math.sign(inp.dx);
  const v = Math.abs(inp.dy) < DEAD ? 0 : Math.sign(inp.dy);
  const hz: [0 | 1, 1 | -1] | null = h ? [0, h as 1 | -1] : null;
  const vt: [0 | 1, 1 | -1] | null = v ? [1, v as 1 | -1] : null;
  const facingH = p.dir === 'l' || p.dir === 'r';
  const tries = (facingH ? [vt, hz] : [hz, vt]).filter((t): t is [0 | 1, 1 | -1] => !!t);
  const dirOf = ([a, d]: [0 | 1, 1 | -1]): Dir => (a === 0 ? (d > 0 ? 'r' : 'l') : d > 0 ? 'd' : 'u');
  p.moving = false;
  for (const t of tries)
    if (moveAxis(p, t[0], t[1], dist, free) > EPS) {
      p.moving = true;
      p.dir = dirOf(t);
      return;
    }
  if (tries.length) p.dir = dirOf(tries[tries.length - 1]);
}

const kitchenFree = (s: MutfakState, p: MPlayer): Free => (c, r) =>
  isFloor(s, c, r) && !s.players.some((q) => q !== p && q.mode === 'kitchen' && cellOf(q)[0] === c && cellOf(q)[1] === r);

// ---------- interaction ----------
const faced = (s: MutfakState, p: MPlayer) => stationAt(s, cellOf(p)[0] + DIRS[p.dir][0], cellOf(p)[1] + DIRS[p.dir][1]);

/** Closest free floor cell to `to` (by Manhattan distance, fixed scan order). */
function nearestFree(s: MutfakState, p: MPlayer, [c0, r0]: [number, number]): [number, number] {
  const free = kitchenFree(s, p);
  for (let d = 0; d < COLS + ROWS; d++)
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) if (Math.abs(c - c0) + Math.abs(r - r0) === d && free(c, r)) return [c, r];
  return [c0, r0];
}

/** Adjacent stations, the faced one first. */
function neighbours(s: MutfakState, p: MPlayer): Station[] {
  const [c, r] = cellOf(p);
  const out: Station[] = [];
  for (const d of [p.dir, 'u', 'd', 'l', 'r'] as Dir[]) {
    const st = stationAt(s, c + DIRS[d][0], r + DIRS[d][1]);
    if (st && !out.includes(st)) out.push(st);
  }
  return out;
}

/** Station A (or B, when nothing fits A) would act on; the scene highlights it. Faced station as a fallback. */
export function targetOf(s: MutfakState, pid: PlayerId): Station | null {
  const p = s.players.find((q) => q.id === pid);
  if (!p || p.mode !== 'kitchen') return null;
  const nb = neighbours(s, p);
  return nb.find((t) => doA(s, p, t, [], true)) ?? nb.find((t) => holdB(s, p, t, [], true)) ?? nb[0] ?? null;
}

/** Would holding B on st do something for this player? (scene: goal hint, button fill) */
export function canB(s: MutfakState, pid: PlayerId, st: Station): boolean {
  const p = s.players.find((q) => q.id === pid);
  return !!p && p.mode === 'kitchen' && holdB(s, p, st, [], true);
}

const freeTable = (s: MutfakState) =>
  s.stations.find((t) => t.k === 'table' && !t.item && !s.orders.some((o) => o.table === t.table));

/** Counter-style slot: pick / place / combine. place filters what may be put down. */
function slotA(p: MPlayer, st: Station, dry: boolean, place: (it: Item) => boolean): boolean {
  const h = p.hand;
  const it = st.item;
  let nh: Item | null;
  let ni: Item | null;
  if (!h && it) [nh, ni] = [it, null];
  else if (h && !it && place(h)) [nh, ni] = [null, h];
  else if (h && it && isBase(it) && isSimple(h) && !h.p && accepts(it, h.k)) [nh, ni] = [null, addTo(it, h.k)];
  else if (h && it && isBase(h) && isSimple(it) && !it.p && accepts(h, it.k)) [nh, ni] = [addTo(h, it.k), null];
  else return false;
  if (dry) return true;
  p.hand = nh;
  st.item = ni;
  st.prog = 0;
  return true;
}

/** A press on station st. dry = only check whether it would do something. */
function doA(s: MutfakState, p: MPlayer, st: Station, ev: MutfakEvent[], dry: boolean): boolean {
  const h = p.hand;
  const it = st.item;
  const go = (f: () => void) => (dry || f(), true);
  switch (st.k) {
    case 'crate': {
      const src = st.src!;
      if (!h && st.n > 0) return go(() => ((p.hand = { k: src }), st.n--, ev.push({ type: 'pick', id: p.id, k: src })));
      if (h && h.k === src && !h.p) return go(() => ((p.hand = null), st.n++));
      if (h && isBase(h) && accepts(h, src) && st.n > 0) return go(() => ((p.hand = addTo(h, src)), st.n--));
      return false;
    }
    case 'counter':
    case 'serve':
      return slotA(p, st, dry, () => true);
    case 'board':
      return slotA(p, st, dry, (x) => isSimple(x) && !x.p);
    case 'pack':
      return slotA(p, st, dry, (x) => PHONE_DISHES.includes(dishOf(x) as Dish));
    case 'stove': {
      if (st.off) return false;
      if (h && SOUP_PARTS.includes(h.k) && (!it || (it.k === 'tencere' && !parts(it).includes(h.k))))
        return go(() => {
          st.item = { k: 'tencere', p: [...(it ? parts(it) : []), h.k].sort() };
          st.t = 0;
          p.hand = null;
          ev.push({ type: 'place', id: p.id, k: h.k, st: st.id });
          if (st.item.p!.length === SOUP_PARTS.length) ev.push({ type: 'cookStart', st: st.id });
        });
      if (h && h.k === 'tabak' && it?.k === 'corba' && accepts(h, 'corba'))
        return go(() => ((p.hand = addTo(h, 'corba')), (st.item = null), (st.t = 0)));
      if (!h && it?.k === 'yanik') return go(() => ((p.hand = it), (st.item = null), (st.t = 0)));
      return false;
    }
    case 'oven': {
      if (h?.k === 'lahmacunRaw' && !it)
        return go(() => ((st.item = h), (p.hand = null), (st.t = 0), ev.push({ type: 'cookStart', st: st.id })));
      if (!h && (it?.k === 'lahmacun' || it?.k === 'yanik')) return go(() => ((p.hand = it), (st.item = null), (st.t = 0)));
      if (h?.k === 'tabak' && it?.k === 'lahmacun' && accepts(h, 'lahmacun'))
        return go(() => ((p.hand = addTo(h, 'lahmacun')), (st.item = null), (st.t = 0)));
      return false;
    }
    case 'tea':
      if (!h && st.n > 0) return go(() => ((p.hand = { k: 'cay' }), st.n--, ev.push({ type: 'pick', id: p.id, k: 'cay' })));
      return false;
    case 'sink':
      if (h?.k === 'kirli') return go(() => ((p.hand = null), st.n++, ev.push({ type: 'place', id: p.id, k: 'kirli', st: st.id })));
      if (h?.k === 'tabak' && !parts(h).length) return go(() => ((p.hand = null), st.m++));
      if (!h && st.m > 0) return go(() => ((p.hand = { k: 'tabak', p: [] }), st.m--, ev.push({ type: 'pick', id: p.id, k: 'tabak' })));
      return false;
    case 'trash': {
      if (!h || h.k === 'kirli' || h.k === 'paket' || st.n >= B.trashCap) return false;
      if (h.k === 'tabak' && !parts(h).length) return false;
      return go(() => {
        p.hand = h.k === 'tabak' ? { k: 'tabak', p: [] } : null;
        if (++st.n >= B.trashCap) ev.push({ type: 'trashFull', st: st.id });
      });
    }
    case 'table': {
      const o = s.orders.find((q) => q.table === st.table && q.st === 'seated');
      const d = dishOf(h); // only a finished dish is a serve attempt; empty/half plates are just rejected
      if (o && d) return go(() => (d === o.dish ? serveDine(s, p, st, o, ev) : wrongDish(s, p, o, ev)));
      if (!h && it?.k === 'kirli') return go(() => ((p.hand = it), (st.item = null), ev.push({ type: 'pick', id: p.id, k: 'kirli' })));
      return false;
    }
    case 'door': {
      const q = st.q!;
      if (h?.k === 'paket' && q.length < B.rackSize)
        return go(() => (q.push(Number(parts(h)[0])), (p.hand = null), ev.push({ type: 'place', id: p.id, k: 'paket', st: st.id })));
      // empty rack: only when facing the door (a market run), so a stray A next to it doesn't send you out
      if (!h && !s.players.some((o) => o.mode === 'courier') && (q.length > 0 || faced(s, p) === st))
        return go(() => {
          p.mode = 'courier';
          p.modeAt = s.tick;
          p.bag = q.splice(0, B.bagSize);
          for (const id of p.bag) orderById(s, id)!.st = 'bag';
          [p.x, p.y] = [STREET.home[0] + 0.5, STREET.home[1] + 0.5];
          p.dir = 'r';
          p.work = -1;
          ev.push({ type: 'courier', id: p.id, out: true });
        });
      return false;
    }
    default:
      return false; // doner, cashier, pano: B only
  }
}

function pay(s: MutfakState, price: number, tip: number): number {
  const net = Math.round(price * (1 - B.ingredientFrac) + tip);
  s.money += net;
  s.today.revenue += price + tip;
  s.today.tips += tip;
  s.today.served++;
  s.rep = Math.min(100, s.rep + B.repServe);
  return net;
}

function serveDine(s: MutfakState, p: MPlayer, st: Station, o: Order, ev: MutfakEvent[]): void {
  const price = PRICES[o.dish];
  const tip = s.tick - o.born < o.pat / 2 ? Math.round(price * B.tipFrac) : 0;
  const money = pay(s, price, tip);
  o.st = 'eating';
  o.eatUntil = s.tick + B.eatTicks;
  st.item = p.hand;
  p.hand = null;
  ev.push({ type: 'served', order: o.id, money, tip });
}

function wrongDish(s: MutfakState, p: MPlayer, o: Order, ev: MutfakEvent[]): void {
  s.rep = Math.max(repFloor(s), s.rep - B.repFail);
  p.hand = p.hand!.k === 'tabak' ? { k: 'kirli' } : null; // iade: plate comes back dirty, tea is spilled
  ev.push({ type: 'wrong', order: o.id });
}

const workTicks = (s: MutfakState, st: Station): number => {
  switch (st.k) {
    case 'board': return s.up.bicak ? B.chopFastTicks : B.chopTicks;
    case 'sink': return s.players.length === 1 ? B.washTicks / 2 : B.washTicks;
    case 'doner': return B.sliceTicks;
    case 'cashier': return B.takeOrderTicks;
    case 'pano': return B.pinTicks;
    case 'trash': return B.emptyTrashTicks;
    case 'pack': return B.packTicks;
    default: return 0;
  }
};

const queueFront = (s: MutfakState) => s.orders.find((o) => o.kind === 'dine' && o.st === 'queue');
const phoneFor = (s: MutfakState, d: Dish | null) => s.orders.find((o) => o.kind === 'phone' && o.st === 'queue' && o.dish === d);

/** B held this tick on st. Returns whether it applies; dry = check only. */
function holdB(s: MutfakState, p: MPlayer, st: Station, ev: MutfakEvent[], dry: boolean): boolean {
  const h = p.hand;
  const it = st.item;
  let able = false;
  switch (st.k) {
    case 'board': able = !h && !!it && it.k in CHOP; break;
    case 'sink': able = !h && st.n > 0; break;
    case 'doner': able = st.n > 0 && (!h || (h.k === 'tabak' && accepts(h, 'et'))); break;
    case 'cashier': able = !!queueFront(s) && !!freeTable(s); break;
    case 'pano': able = s.orders.some((o) => o.by === p.id && !o.pin); break;
    case 'trash': able = !h && st.n > 0; break;
    case 'pack': able = !h && !!phoneFor(s, dishOf(it)); break;
  }
  if (!able || dry) return able;
  p.work = st.id;
  if (++st.prog < workTicks(s, st)) return true;
  st.prog = 0;
  switch (st.k) {
    case 'board':
      st.item = { k: CHOP[it!.k] };
      ev.push({ type: 'chopped', st: st.id });
      break;
    case 'sink':
      st.n--;
      st.m++;
      ev.push({ type: 'washed', st: st.id });
      break;
    case 'doner':
      st.n--;
      p.hand = h ? addTo(h, 'et') : { k: 'et' };
      ev.push({ type: 'slice', st: st.id });
      break;
    case 'cashier': {
      const o = queueFront(s)!;
      o.st = 'seated';
      o.by = p.id;
      o.table = freeTable(s)!.table!;
      ev.push({ type: 'taken', order: o.id, id: p.id });
      break;
    }
    case 'pano': {
      const o = s.orders.find((q) => q.by === p.id && !q.pin)!;
      o.pin = true;
      ev.push({ type: 'pinned', order: o.id });
      break;
    }
    case 'trash':
      st.n = 0;
      break;
    case 'pack': {
      const o = phoneFor(s, dishOf(it))!;
      o.st = 'packed';
      o.packedAt = s.tick;
      st.item = { k: 'paket', p: [String(o.id)] };
      sink(s).n++; // the box replaces the plate; the plate goes to the sink dirty
      ev.push({ type: 'packed', order: o.id });
      break;
    }
  }
  return true;
}

// ---------- courier ----------
const atCell = (p: { x: number; y: number }, [c, r]: [number, number]) => cellOf(p)[0] === c && cellOf(p)[1] === r;

function deliverAt(s: MutfakState, bag: number[], target: number, bot: boolean, ev: MutfakEvent[]): number[] {
  return bag.filter((id) => {
    const o = orderById(s, id);
    if (!o) return false;
    if (o.dest !== target) return true;
    const age = s.tick - o.packedAt;
    const cold = age > (B.coldTicks);
    const price = cold ? Math.round(PRICES[o.dish] / 2) : PRICES[o.dish];
    const tip = !bot && !cold && age < B.courierTipTicks ? B.courierTip : 0;
    const money = pay(s, price, tip);
    s.orders = s.orders.filter((q) => q !== o);
    ev.push({ type: 'delivered', order: id, money, cold });
    return false;
  });
}

function courierA(s: MutfakState, p: MPlayer, ev: MutfakEvent[]): void {
  if (atCell(p, STREET.home)) {
    p.mode = 'kitchen';
    door(s).q!.push(...p.bag); // undelivered packages go back on the rack
    for (const id of p.bag) {
      const o = orderById(s, id);
      if (o) o.st = 'packed';
    }
    p.bag = [];
    p.modeAt = s.tick;
    const [fc, fr] = nearestFree(s, p, DOOR_SPOT);
    [p.x, p.y] = [fc + 0.5, fr + 0.5];
    p.dir = 'u';
    ev.push({ type: 'courier', id: p.id, out: false });
    return;
  }
  if (atCell(p, STREET.market) && s.money >= B.restockCost) {
    const crates = s.stations.filter((t) => t.k === 'crate');
    const low = crates.reduce((a, b) => (b.n < a.n ? b : a));
    low.n += B.restockAmount;
    s.money -= B.restockCost;
    ev.push({ type: 'restock', k: low.src! });
    return;
  }
  const ti = STREET.targets.findIndex((t) => atCell(p, t));
  if (ti >= 0) p.bag = deliverAt(s, p.bag, ti, false, ev);
}

/** Next road cell on a shortest path from → to (BFS from the goal). */
export function nextRoadCell(from: [number, number], to: [number, number]): [number, number] {
  const N = SCOLS * SROWS;
  const dist = new Array<number>(N).fill(-1);
  const q: [number, number][] = [to];
  dist[to[1] * SCOLS + to[0]] = 0;
  for (let i = 0; i < q.length; i++) {
    const [c, r] = q[i];
    for (const [dx, dy] of Object.values(DIRS)) {
      const nc = c + dx;
      const nr = r + dy;
      if (!isRoad(nc, nr) || dist[nr * SCOLS + nc] >= 0) continue;
      dist[nr * SCOLS + nc] = dist[r * SCOLS + c] + 1;
      q.push([nc, nr]);
    }
  }
  const here = dist[from[1] * SCOLS + from[0]];
  for (const [dx, dy] of Object.values(DIRS)) {
    const nc = from[0] + dx;
    const nr = from[1] + dy;
    if (isRoad(nc, nr) && dist[nr * SCOLS + nc] === here - 1) return [nc, nr];
  }
  return from;
}

function botCourierStep(s: MutfakState, ev: MutfakEvent[]): void {
  const b: BotCourier = s.courier;
  if (!b.active) return;
  const q = door(s).q!;
  if (!b.out) {
    if (!q.length || s.players.some((p) => p.mode === 'courier')) return;
    b.bag = q.splice(0, B.bagSize);
    for (const id of b.bag) orderById(s, id)!.st = 'bag';
    b.out = true;
    ev.push({ type: 'courier', id: 'bot', out: true });
  }
  if (b.x === b.nx && b.y === b.ny) {
    // at a cell center: deliver / come home / pick the next cell
    const o = b.bag.length ? orderById(s, b.bag[0]) : undefined;
    const goal = o ? STREET.targets[o.dest] : STREET.home;
    const cell = cellOf(b);
    if (cell[0] === goal[0] && cell[1] === goal[1]) {
      if (o) b.bag = deliverAt(s, b.bag, o.dest, true, ev);
      else {
        b.out = false;
        ev.push({ type: 'courier', id: 'bot', out: false });
      }
      return;
    }
    const [nc, nr] = nextRoadCell(cell, goal);
    [b.nx, b.ny] = [nc + 0.5, nr + 0.5];
  }
  for (const a of ['x', 'y'] as const) {
    const t = a === 'x' ? b.nx : b.ny;
    const m = Math.min(Math.abs(t - b[a]), B.botCourierSpeed);
    b[a] = Math.abs(t - b[a]) - m < EPS ? t : b[a] + Math.sign(t - b[a]) * m;
  }
}

// ---------- customers & stations ----------
function patienceFor(s: MutfakState, dish: Dish, kind: 'dine' | 'phone'): number {
  const base = kind === 'phone' ? B.phonePatience : dish === 'cay' ? B.teaPatience : B.patience;
  const mul = (s.up.hali ? 1 + B.haliPatience : 1) * (1 - B.endlessPatienceDrop * Math.max(0, s.day - B.targets.length));
  return Math.round(base * Math.max(0.5, mul));
}

function spawnCustomer(s: MutfakState, ev: MutfakEvent[]): void {
  const dayTime = B.prepTicks + B.serviceTicks - s.phaseLeft;
  const rush = dayTime >= B.rushFrom && dayTime < B.rushTo ? B.rushMul : 1;
  const slow = s.clean < B.cleanSlowBelow ? 2 : 1;
  const scale = B.playerScale[Math.min(humansCount(s), 4) - 1];
  s.nextCustomer = s.tick + Math.round(((B.spawnEvery / scale / rush) * slow) + random(s) * B.spawnJitter);
  const canPhone = s.players.length >= 2 || s.up.botKurye;
  const phone = canPhone && random(s) < B.phoneChance;
  const pool = phone ? PHONE_DISHES : DISHES;
  const dish = pool[Math.floor(random(s) * pool.length)];
  if (!phone && s.orders.filter((o) => o.kind === 'dine' && o.st === 'queue').length >= B.queueMax) return;
  const o: Order = {
    id: s.nextId++, dish, kind: phone ? 'phone' : 'dine', st: 'queue', born: s.tick, pat: patienceFor(s, dish, phone ? 'phone' : 'dine'),
    table: -1, by: null, pin: false, dest: phone ? Math.floor(random(s) * STREET.targets.length) : -1, packedAt: 0, eatUntil: 0,
  };
  s.orders.push(o);
  ev.push(phone ? { type: 'phone', order: o.id } : { type: 'customer', order: o.id });
}

function tickOrders(s: MutfakState, ev: MutfakEvent[]): void {
  for (const o of [...s.orders]) {
    if (o.st === 'eating') {
      if (s.tick < o.eatUntil) continue;
      const t = s.stations.find((q) => q.k === 'table' && q.table === o.table)!;
      t.item = t.item?.k === 'tabak' ? { k: 'kirli' } : null;
      s.orders = s.orders.filter((q) => q !== o);
    } else if ((o.st === 'queue' || o.st === 'seated') && s.tick - o.born > o.pat) {
      s.rep = Math.max(repFloor(s), s.rep - B.repFail);
      s.today.failed++;
      s.orders = s.orders.filter((q) => q !== o);
      ev.push({ type: 'left', order: o.id });
    }
  }
}

function tickStations(s: MutfakState, ev: MutfakEvent[]): void {
  for (const st of s.stations) {
    const it = st.item;
    switch (st.k) {
      case 'stove':
      case 'oven': {
        const cook = st.k === 'stove' ? B.soupTicks : B.ovenTicks;
        const raw = st.k === 'stove' ? 'tencere' : 'lahmacunRaw';
        const done = st.k === 'stove' ? 'corba' : 'lahmacun';
        if (!it || it.k === 'yanik' || (it.k === 'tencere' && parts(it).length < SOUP_PARTS.length)) break;
        st.t++;
        if (it.k === raw && st.t >= cook) {
          st.item = { k: done };
          ev.push({ type: 'cooked', st: st.id });
        } else if (it.k === done && st.t >= Math.round(cook * B.burnMul)) {
          st.item = { k: 'yanik' };
          ev.push({ type: 'burnt', st: st.id });
        }
        break;
      }
      case 'doner':
        if (st.n < B.donerMax && ++st.t >= B.donerEvery) {
          st.n++;
          st.t = 0;
        }
        break;
      case 'tea':
        if (st.n === 0 && ++st.t >= B.teaBrewTicks) {
          st.n = B.teaGlasses;
          st.t = 0;
          ev.push({ type: 'brewed', st: st.id });
        }
        break;
      case 'sink':
        if (!s.up.makine || st.n === 0) st.t = 0;
        else if (++st.t >= B.dishwasherTicks) {
          const k = Math.min(B.dishwasherBatch, st.n);
          st.n -= k;
          st.m += k;
          st.t = 0;
          ev.push({ type: 'washed', st: st.id });
        }
        break;
    }
  }
  const bad = (sink(s).n >= B.cleanDirtyAt ? 1 : 0) + (s.stations.find((t) => t.k === 'trash')!.n >= B.trashCap ? 1 : 0);
  s.clean = Math.min(100, Math.max(0, s.clean + (bad ? -B.cleanDrain * bad : B.cleanRecover)));
}

// ---------- day flow ----------
function endDay(s: MutfakState, ev: MutfakEvent[]): void {
  s.today.dropped = s.orders.filter((o) => o.st !== 'eating').length; // still open at closing: cancelled
  s.today.failed += s.today.dropped;
  s.orders = [];
  const rent = rentOf(s.day);
  s.money -= rent;
  s.today.rent = rent;
  s.today.stars = starsFor(s, s.today.revenue);
  s.history.push(s.today);
  // bankruptcy is decided at the end of the day so the team always sees the day's result
  if (s.money < 0 || s.rep <= 0) s.bankrupt = true;
  if (s.bankrupt || (s.mode === 'kampanya' && s.day >= B.campaignDays)) return finish(s, ev);
  s.phase = 'shop';
  s.phaseLeft = B.shopTicks;
  for (const p of s.players) p.ready = false;
  ev.push({ type: 'phase', phase: 'shop', day: s.day });
}

function finish(s: MutfakState, ev: MutfakEvent[]): void {
  s.phase = 'end';
  s.phaseLeft = 0;
  ev.push({ type: 'phase', phase: 'end', day: s.day }, { type: 'end', bankrupt: s.bankrupt });
}

function buy(s: MutfakState, by: PlayerId, id: UpgradeId | '', ev: MutfakEvent[]): void {
  if (!id || !(id in s.up) || s.up[id]) return;
  const price = upgradePrice(s, id);
  if (s.money < price) return;
  s.money -= price;
  s.up[id] = true;
  s.upBy[id] = by;
  ev.push({ type: 'bought', up: id });
}

const KITCHEN_PHASES = ['prep', 'service', 'close'];

export function step(s: MutfakState, inputs: Record<PlayerId, MutfakInput>): MutfakEvent[] {
  const ev: MutfakEvent[] = [];
  s.tick++;
  if (s.phase === 'end') return ev;
  const active = KITCHEN_PHASES.includes(s.phase);

  for (const p of s.players) {
    const inp = p.bot ? botInput(s, p.id) : inputs[p.id] ?? EMPTY_INPUT;
    // just back from a bot spell: adopt the client's seq counters for a moment instead of reading them as presses
    const sync = !p.bot && s.tick < p.resync;
    const pressA = !sync && inp.aSeq !== p.aSeq;
    p.aSeq = inp.aSeq;
    const pressBuy = !sync && inp.buySeq !== p.buySeq;
    p.buySeq = inp.buySeq;
    if (s.phase === 'shop') {
      if (pressBuy) buy(s, p.id, inp.buy, ev);
      p.ready = inp.ready;
      continue;
    }
    if (!active) continue;
    p.work = -1;
    if (p.mode === 'courier') {
      moveBody(p, inp, B.scooterSpeed, isRoad);
      if (pressA) courierA(s, p, ev);
      continue;
    }
    moveBody(p, inp, B.speed, kitchenFree(s, p));
    if (pressA) {
      const st = neighbours(s, p).find((t) => doA(s, p, t, ev, true));
      if (st) doA(s, p, st, ev, false);
      else ev.push({ type: 'reject', id: p.id });
    }
    if (inp.b) {
      const st = neighbours(s, p).find((t) => holdB(s, p, t, ev, true));
      if (st) holdB(s, p, st, ev, false);
    }
  }

  if (s.phase === 'shop') {
    const hs = humans(s);
    if (--s.phaseLeft <= 0 || (hs.length > 0 && hs.every((p) => p.ready))) {
      s.day++;
      startDay(s, ev);
    }
    return ev;
  }

  tickStations(s, ev);
  tickOrders(s, ev);
  botCourierStep(s, ev);
  if (s.phase === 'service' && s.tick >= s.nextCustomer) spawnCustomer(s, ev);
  // closing with nothing left to do: wrap up after a short grace instead of idling the full 40 s
  if (s.phase === 'close' && !s.orders.some((o) => o.st !== 'eating')) s.phaseLeft = Math.min(s.phaseLeft, B.closeGraceTicks);
  if (--s.phaseLeft > 0) return ev;
  if (s.phase === 'prep') {
    s.phase = 'service';
    s.phaseLeft = B.serviceTicks;
    s.nextCustomer = s.tick + 2 * 60;
    ev.push({ type: 'phase', phase: 'service', day: s.day });
  } else if (s.phase === 'service') {
    s.phase = 'close';
    s.phaseLeft = B.closeTicks;
    ev.push({ type: 'phase', phase: 'close', day: s.day });
  } else endDay(s, ev);
  return ev;
}

// ---------- net hooks ----------
export function ownPos(s: MutfakState, id: PlayerId): { x: number; y: number } | null {
  const p = s.players.find((q) => q.id === id);
  return p && KITCHEN_PHASES.includes(s.phase) ? { x: p.x, y: p.y } : null;
}

const MODE_SETTLE = 45; // ticks: covers a snapshot round trip at 130 ms latency
/** Client-authoritative movement, loosely validated: walkable cell in the current view, no teleports, one axis centered. */
export function setOwnPos(s: MutfakState, id: PlayerId, pos: { x: number; y: number }): void {
  const p = s.players.find((q) => q.id === id);
  // right after a kitchen/street switch the client may still report a pose from the other map
  if (!p || p.bot || !KITCHEN_PHASES.includes(s.phase) || s.tick - p.modeAt < MODE_SETTLE) return;
  let { x, y } = pos;
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x - p.x) + Math.abs(y - p.y) > 3) return;
  const c = Math.floor(x);
  const r = Math.floor(y);
  if (p.mode === 'courier' ? !isRoad(c, r) : !kitchenFree(s, p)(c, r)) return;
  if (Math.abs(x - c - 0.5) > EPS && Math.abs(y - r - 0.5) > EPS) {
    if (Math.abs(x - c - 0.5) < Math.abs(y - r - 0.5)) x = c + 0.5;
    else y = r + 0.5;
  }
  p.x = x;
  p.y = y;
}

const RESYNC_TICKS = 60;
/** A player who drops out is driven by botInput until they return. */
export function setConnected(s: MutfakState, id: PlayerId, connected: boolean): void {
  const p = s.players.find((q) => q.id === id);
  if (!p) return;
  if (p.bot && connected) p.resync = s.tick + RESYNC_TICKS;
  p.bot = !connected;
}

export const mutfakSim: GameSim<MutfakState, MutfakInput, MutfakEvent> = {
  tickRate: 60,
  emptyInput: EMPTY_INPUT,
  createGame,
  step,
  ownPos,
  setOwnPos,
  setConnected,
};
