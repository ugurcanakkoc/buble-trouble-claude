// Bot hook for Mutfak Kaosu: drives disconnected players (any role). Deterministic, stateless (state in, input out).
// Kitchen: demand-driven (open orders -> next missing ingredient/step), BFS to a floor cell next to the target station,
// face it, then press A (aSeq+1) or hold B. Courier mode: follow nextRoadCell to the first bag order's target.
// ponytail: no look-ahead/coordination between bots (they may overproduce a little); upgrade by claiming orders in state.
import type { PlayerId } from '../../sim/types';
import { BALANCE as B, CHOP, COLS, LAHMACUN_PARTS, PHONE_DISHES, PLATE, ROWS, SOUP_PARTS, STREET } from './balance';
import { cellOf, dishOf, isFloor, nextRoadCell } from './sim'; // circular import with sim.ts: only used inside functions
import type { Dir, Dish, MPlayer, MutfakInput, MutfakState, Order, Station } from './types';

const DV: [number, number][] = [[0, -1], [0, 1], [-1, 0], [1, 0]]; // u d l r (index ^ 1 = opposite)
const DN: Dir[] = ['u', 'd', 'l', 'r'];
const CHOPPED = Object.values(CHOP);
const rawOf = (k: string) => Object.keys(CHOP).find((r) => CHOP[r] === k)!;

interface Nav { dist: Int16Array; first: Int8Array }
interface Task { st: Station; b: boolean; c: number; r: number; face: number; d: number; nav: Nav }
interface Ctx { s: MutfakState; p: MPlayer; navs: Nav[] }

function bfs(s: MutfakState, p: MPlayer, avoidPlayers: boolean): Nav {
  const dist = new Int16Array(COLS * ROWS).fill(-1);
  const first = new Int8Array(COLS * ROWS).fill(-1);
  const taken = new Set(avoidPlayers ? s.players.filter((q) => q !== p && q.mode === 'kitchen').map((q) => cellOf(q)[0] + cellOf(q)[1] * COLS) : []);
  const [c0, r0] = cellOf(p);
  const q = [c0 + r0 * COLS];
  dist[q[0]] = 0;
  for (let i = 0; i < q.length; i++) {
    const c = q[i] % COLS;
    const r = (q[i] - c) / COLS;
    for (let k = 0; k < 4; k++) {
      const nc = c + DV[k][0];
      const nr = r + DV[k][1];
      const n = nc + nr * COLS;
      if (!isFloor(s, nc, nr) || dist[n] >= 0 || taken.has(n)) continue;
      dist[n] = dist[q[i]] + 1;
      first[n] = i === 0 ? k : first[q[i]];
      q.push(n);
    }
  }
  return { dist, first };
}

/** Nearest (by walking) of the candidate stations; b = hold B instead of pressing A. */
function go(x: Ctx, cands: Station[], b = false): Task | null {
  for (const nav of x.navs) {
    let best: Task | null = null;
    for (const st of cands)
      for (let k = 0; k < 4; k++) {
        const c = st.c + DV[k][0];
        const r = st.r + DV[k][1];
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
        const d = nav.dist[c + r * COLS];
        if (d >= 0 && (!best || d < best.d)) best = { st, b, c, r, face: k ^ 1, d, nav };
      }
    if (best) return best;
  }
  return null;
}

const idle = (p: MPlayer, extra: Partial<MutfakInput> = {}): MutfakInput =>
  ({ dx: 0, dy: 0, b: false, aSeq: p.aSeq, buy: '', buySeq: p.buySeq, ready: true, ...extra });

function toInput(p: MPlayer, t: Task): MutfakInput {
  if (t.d > 0) {
    const k = t.nav.first[t.c + t.r * COLS];
    return idle(p, { dx: DV[k][0], dy: DV[k][1] });
  }
  const cx = t.c + 0.5;
  const cy = t.r + 0.5;
  if (Math.abs(p.x - cx) > 0.06) return idle(p, { dx: Math.sign(cx - p.x) });
  if (Math.abs(p.y - cy) > 0.06) return idle(p, { dy: Math.sign(cy - p.y) });
  if (p.dir !== DN[t.face]) return idle(p, { dx: DV[t.face][0], dy: DV[t.face][1] });
  return t.b ? idle(p, { b: true }) : idle(p, { aSeq: p.aSeq + 1 });
}

// ---------- state queries ----------
const kind = (s: MutfakState, k: string) => s.stations.filter((t) => t.k === k);
const one = (s: MutfakState, k: string) => kind(s, k)[0];
const crate = (s: MutfakState, src: string) => s.stations.find((t) => t.k === 'crate' && t.src === src && t.n > 0);
const freeCounters = (s: MutfakState) => s.stations.filter((t) => (t.k === 'counter' || t.k === 'serve') && !t.item);
const simple = (s: MutfakState, k: string, withBoard: boolean) =>
  s.stations.filter((t) => (t.k === 'counter' || t.k === 'serve' || (withBoard && t.k === 'board')) && t.item?.k === k && !t.item.p?.length);
const plateOf = (s: MutfakState, d: Dish) =>
  s.stations.filter((t) => (t.k === 'counter' || t.k === 'serve') && dishOf(t.item) === d);
const seated = (s: MutfakState, d: Dish | null) => s.orders.filter((o) => o.kind === 'dine' && o.st === 'seated' && o.dish === d);
const phoneQ = (s: MutfakState, d: Dish | null) => s.orders.find((o) => o.kind === 'phone' && o.st === 'queue' && o.dish === d);
const tableOf = (s: MutfakState, o: Order) => s.stations.find((t) => t.k === 'table' && t.table === o.table)!;
const trashOk = (s: MutfakState) => one(s, 'trash').n < B.trashCap;
const stoves = (s: MutfakState) => kind(s, 'stove').filter((t) => !t.off);

/** Walk to whatever gives item k with an empty hand (chopping/fetching raw as needed). */
function obtain(x: Ctx, k: string): Task | null {
  const { s } = x;
  const have = simple(s, k, true);
  if (have.length) return go(x, have);
  if (CHOPPED.includes(k)) {
    const board = one(s, 'board');
    const raw = rawOf(k);
    if (board.item?.k === raw) return go(x, [board], true);
    if (board.item) return CHOPPED.includes(board.item.k) ? go(x, [board]) : null; // clear a different chopped item
    return obtain(x, raw);
  }
  const c = crate(s, k);
  return c ? go(x, [c]) : null;
}

// ---------- what to do with something in the hand ----------
function nextDurumPart(x: Ctx, have: string[]): Task | null {
  const { s } = x;
  const left = [...PLATE.durum];
  for (const h of have) left.splice(left.indexOf(h), 1);
  for (const m of left) {
    if (m === 'et' && one(s, 'doner').n > 0) return go(x, [one(s, 'doner')], true);
    if (m === 'lavas' && crate(s, 'lavas')) return go(x, [crate(s, 'lavas')!]);
    if (m === 'domatesD' && simple(s, m, true).length) return go(x, simple(s, m, true));
  }
  return null;
}

function handTask(x: Ctx): Task | null {
  const { s, p } = x;
  const h = p.hand!;
  const trash = trashOk(s) ? go(x, [one(s, 'trash')]) : null;
  const d = dishOf(h);
  if (h.k === 'kirli') return go(x, kind(s, 'sink'));
  if (h.k === 'yanik') return trash;
  if (h.k === 'paket') return one(s, 'door').q!.length < B.rackSize ? go(x, [one(s, 'door')]) : null;
  if (h.k === 'cay') {
    const o = seated(s, 'cay')[0];
    return o ? go(x, [tableOf(s, o)]) : trash;
  }
  if (h.k === 'tabak') {
    if (d) {
      const o = seated(s, d)[0];
      if (o) return go(x, [tableOf(s, o)]);
      return PHONE_DISHES.includes(d) && phoneQ(s, d) && !one(s, 'pack').item ? go(x, [one(s, 'pack')]) : null; // else stash
    }
    const have = h.p ?? [];
    if (!have.length) {
      if (stoves(s).some((t) => t.item?.k === 'corba')) return go(x, stoves(s).filter((t) => t.item?.k === 'corba'));
      if (one(s, 'oven').item?.k === 'lahmacun') return go(x, [one(s, 'oven')]);
    }
    const t = have.length || s.orders.some((o) => o.dish === 'durum') ? nextDurumPart(x, have) : null;
    return t ?? (have.length ? trash : go(x, kind(s, 'sink')));
  }
  if (h.k === 'hamur') {
    const miss = LAHMACUN_PARTS.find((m) => !(h.p ?? []).includes(m) && simple(s, m, true).length);
    return miss ? go(x, simple(s, miss, true)) : trash;
  }
  if (h.k === 'lahmacunRaw') return one(s, 'oven').item ? null : go(x, [one(s, 'oven')]);
  if (h.k in CHOP) return one(s, 'board').item ? null : go(x, [one(s, 'board')]);
  if (SOUP_PARTS.includes(h.k)) {
    const st = stoves(s).filter((t) => !t.item || (t.item.k === 'tencere' && !t.item.p!.includes(h.k)));
    return st.length ? go(x, st) : null; // else stash
  }
  if (CHOPPED.includes(h.k)) return null; // domatesD / kiymaD: stage on a counter
  return trash;
}

const stash = (x: Ctx): Task | null => go(x, freeCounters(x.s)) ?? (trashOk(x.s) ? go(x, [one(x.s, 'trash')]) : null);

// ---------- hand empty ----------
function cook(x: Ctx): Task | null {
  const { s } = x;
  const sink = one(s, 'sink');
  const board = one(s, 'board');
  const demand = s.orders.filter((o) => (o.kind === 'dine' && (o.st === 'queue' || o.st === 'seated')) || (o.kind === 'phone' && o.st === 'queue'));
  if (one(s, 'trash').n >= 8) return go(x, [one(s, 'trash')], true);
  const burnt = s.stations.filter((t) => (t.k === 'stove' || t.k === 'oven') && t.item?.k === 'yanik');
  if (burnt.length) return go(x, burnt);
  const ready = stoves(s).some((t) => t.item?.k === 'corba') || one(s, 'oven').item?.k === 'lahmacun';
  if (ready) return sink.m > 0 ? go(x, [sink]) : sink.n > 0 ? go(x, [sink], true) : null;
  const pack = one(s, 'pack');
  const pd = dishOf(pack.item);
  if (pack.item?.k === 'paket' || (pd && !phoneQ(s, pd))) return go(x, [pack]);
  if (pd && PHONE_DISHES.includes(pd)) return go(x, [pack], true);
  for (const o of demand) {
    const staged = plateOf(s, o.dish);
    if (staged.length && (o.st === 'seated' || o.kind === 'phone')) return go(x, staged);
  }
  const dirty = kind(s, 'table').filter((t) => t.item?.k === 'kirli');
  if (sink.m <= 1 && dirty.length) return go(x, dirty);
  if (sink.m === 0 && sink.n > 0) return go(x, [sink], true);
  const done = new Set<Dish>();
  for (const o of demand) {
    if (done.has(o.dish)) continue;
    done.add(o.dish);
    const want = demand.filter((q) => q.dish === o.dish).length;
    let t: Task | null = null;
    if (o.dish === 'cay') {
      if (seated(s, 'cay').length && one(s, 'tea').n > 0) t = go(x, [one(s, 'tea')]);
    } else if (o.dish === 'corba') {
      const pots = stoves(s).filter((q) => q.item);
      if (want > pots.length + plateOf(s, 'corba').length) {
        const st = stoves(s).find((q) => q.item?.k === 'tencere' && q.item.p!.length < SOUP_PARTS.length) ?? stoves(s).find((q) => !q.item);
        const miss = st && SOUP_PARTS.find((m) => !(st.item?.p ?? []).includes(m));
        if (miss) t = obtain(x, miss);
      }
    } else if (o.dish === 'lahmacun') {
      const oven = one(s, 'oven');
      if (want > (oven.item ? 1 : 0) + plateOf(s, 'lahmacun').length && !oven.item) {
        const miss = LAHMACUN_PARTS.find((m) => !simple(s, m, true).length);
        t = miss ? obtain(x, miss) : obtain(x, 'hamur');
      }
    } else if (want > plateOf(s, 'durum').length && one(s, 'doner').n > 0) {
      t = simple(s, 'domatesD', true).length ? (crate(s, 'lavas') && sink.m > 0 ? go(x, [sink]) : null) : obtain(x, 'domatesD');
    }
    if (t) return t;
  }
  if (board.item && board.item.k in CHOP) return go(x, [board], true);
  return null;
}

function service(x: Ctx): Task | null {
  const { s, p } = x;
  const free = kind(s, 'table').some((t) => !t.item && !s.orders.some((o) => o.table === t.table));
  if (free && s.orders.some((o) => o.kind === 'dine' && o.st === 'queue')) return go(x, [one(s, 'cashier')], true);
  if (s.asym && s.orders.some((o) => o.by === p.id && !o.pin)) return go(x, [one(s, 'pano')], true);
  return null;
}

function tidy(x: Ctx): Task | null {
  const { s } = x;
  const dirty = kind(s, 'table').filter((t) => t.item?.k === 'kirli');
  const sink = one(s, 'sink');
  if (one(s, 'trash').n >= 5) return go(x, [one(s, 'trash')], true);
  if (dirty.length) return go(x, dirty);
  return sink.n > 0 ? go(x, [sink], true) : null;
}

function courierDuty(x: Ctx): Task | null {
  const { s } = x;
  const door = one(s, 'door');
  return !s.courier.active && door.q!.length && !s.players.some((q) => q.mode === 'courier') ? go(x, [door]) : null;
}

const STEPS: Record<string, (x: Ctx) => Task | null> = { garson: service, mutfak: cook, bulasik: tidy, kurye: courierDuty };
const DEFAULT = ['garson', 'mutfak', 'kurye', 'bulasik'];

function courierInput(s: MutfakState, p: MPlayer): MutfakInput {
  const o = s.orders.find((q) => q.id === p.bag[0]);
  const goal = o ? STREET.targets[o.dest] : STREET.home;
  const cell = cellOf(p);
  if (cell[0] === goal[0] && cell[1] === goal[1]) return idle(p, { aSeq: p.aSeq + 1 });
  const [nc, nr] = nextRoadCell(cell, goal);
  return idle(p, { dx: nc - cell[0], dy: nr - cell[1] });
}

export function botInput(s: MutfakState, id: PlayerId): MutfakInput {
  const p = s.players.find((q) => q.id === id);
  if (!p) return { dx: 0, dy: 0, b: false, aSeq: 0, buy: '', buySeq: 0, ready: true };
  if (s.phase === 'shop' || s.phase === 'end') return idle(p);
  if (p.mode === 'courier') return courierInput(s, p);
  const x: Ctx = { s, p, navs: [bfs(s, p, true), bfs(s, p, false)] };
  let t: Task | null = null;
  if (p.hand) t = handTask(x) ?? stash(x);
  else {
    const order = ['garson', ...[p.roles[0], ...DEFAULT].filter((r, i, a) => r !== 'garson' && a.indexOf(r) === i), 'bulasik'];
    for (const r of order) if ((t = STEPS[r](x))) break;
  }
  return t ? toInput(p, t) : idle(p);
}
