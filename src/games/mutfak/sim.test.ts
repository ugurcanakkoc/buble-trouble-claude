import { beforeEach, describe, expect, it } from 'vitest';
import { BALANCE as B, PLATE, PRICES, STREET } from './balance';
import {
  EMPTY_INPUT, assignRoles, canSeeOrder, createGame, dayTarget, dishOf, mutfakSim, random, rankOf, setOwnPos, stationAt, step,
} from './sim';
import type { Dir, Dish, MutfakInput, MutfakState, Order } from './types';

const humans = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: 0 }));

/** Service phase, no random customers. */
function kitchen(n = 1): MutfakState {
  const s = createGame(7, humans(n), 'kampanya');
  s.phase = 'service';
  s.phaseLeft = 1e7;
  s.nextCustomer = 1e9;
  return s;
}
let seqs: Record<string, number> = {};
beforeEach(() => {
  seqs = {};
});
const input = (pid: string, extra: Partial<MutfakInput> = {}): MutfakInput => ({ ...EMPTY_INPUT, aSeq: seqs[pid] ?? 0, ...extra });
function run(s: MutfakState, n: number, inputs: Record<string, MutfakInput> = {}) {
  const ev = [];
  for (let i = 0; i < n; i++) ev.push(...step(s, { ...Object.fromEntries(s.players.map((p) => [p.id, input(p.id)])), ...inputs }));
  return ev;
}
const put = (s: MutfakState, c: number, r: number, dir: Dir, pid = 'p0') => {
  const p = s.players.find((q) => q.id === pid)!;
  Object.assign(p, { x: c + 0.5, y: r + 0.5, dir });
  return p;
};
/** Stand at (c,r) facing dir and press A once. */
function A(s: MutfakState, c: number, r: number, dir: Dir, pid = 'p0') {
  put(s, c, r, dir, pid);
  seqs[pid] = (seqs[pid] ?? 0) + 1;
  return run(s, 1, { [pid]: input(pid) });
}
function holdB(s: MutfakState, c: number, r: number, dir: Dir, ticks: number, pid = 'p0') {
  put(s, c, r, dir, pid);
  return run(s, ticks, { [pid]: input(pid, { b: true }) });
}
const hand = (s: MutfakState, pid = 'p0') => s.players.find((p) => p.id === pid)!.hand;
function dineOrder(s: MutfakState, dish: Dish): Order {
  const o: Order = {
    id: s.nextId++, dish, kind: 'dine', st: 'queue', born: s.tick, pat: B.patience, table: -1, by: null, pin: false, dest: -1, packedAt: 0, eatUntil: 0,
  };
  s.orders.push(o);
  return o;
}

/** Chop one ingredient from crate at (cc,0) and leave it in hand. */
function chopped(s: MutfakState, cc: number) {
  A(s, cc, 1, 'u'); // crate
  A(s, 1, 2, 'l'); // onto the board (0,2)
  holdB(s, 1, 2, 'l', B.chopTicks);
  A(s, 1, 2, 'l'); // pick chopped
}

function makeLahmacunPlate(s: MutfakState) {
  A(s, 4, 1, 'u'); // hamur
  A(s, 4, 2, 'd'); // onto island counter (4,3)
  chopped(s, 1); // domatesD
  A(s, 4, 2, 'd'); // onto hamur
  chopped(s, 3); // kiymaD
  A(s, 4, 2, 'd');
  expect(stationAt(s, 4, 3)!.item).toEqual({ k: 'lahmacunRaw' });
  A(s, 4, 2, 'd'); // pick
  A(s, 3, 6, 'd'); // into oven (3,7)
  const ev = run(s, B.ovenTicks);
  expect(ev.some((e) => e.type === 'cooked')).toBe(true);
  A(s, 3, 6, 'd');
  expect(hand(s)).toEqual({ k: 'lahmacun' });
  A(s, 1, 3, 'l'); // park it on counter (0,3)
  A(s, 1, 5, 'l'); // clean plate from sink
  A(s, 1, 3, 'l'); // plate takes the lahmacun
  expect(dishOf(hand(s))).toBe('lahmacun');
}

describe('recipes', () => {
  it('lahmacun end to end: assemble, bake, plate, take order, serve', () => {
    const s = kitchen();
    makeLahmacunPlate(s);
    const o = dineOrder(s, 'lahmacun');
    holdB(s, 9, 1, 'u', B.takeOrderTicks); // cashier
    expect(o.st).toBe('seated');
    expect(o.by).toBe('p0');
    expect(o.table).toBe(3); // first free table: (8,7)
    const table = stationAt(s, 8, 7)!;
    const money = s.money;
    const ev = A(s, 8, 6, 'd');
    const served = ev.find((e) => e.type === 'served');
    expect(served).toBeTruthy();
    const tip = Math.round(PRICES.lahmacun * B.tipFrac);
    expect(s.money - money).toBe(Math.round(PRICES.lahmacun * (1 - B.ingredientFrac) + tip));
    expect(s.today.revenue).toBe(PRICES.lahmacun + tip);
    expect(s.rep).toBe(B.startRep + B.repServe);
    run(s, B.eatTicks + 1);
    expect(table.item).toEqual({ k: 'kirli' });
    expect(s.orders).toHaveLength(0);
  });

  it('soup cooks on the stove and burns when left', () => {
    const s = kitchen();
    chopped(s, 5); // mercimekD
    A(s, 1, 6, 'd'); // stove (1,7)
    chopped(s, 2); // soganD
    A(s, 1, 6, 'd');
    const st = stationAt(s, 1, 7)!;
    expect(st.item).toEqual({ k: 'tencere', p: ['mercimekD', 'soganD'] });
    run(s, B.soupTicks);
    expect(st.item).toEqual({ k: 'corba' });
    run(s, Math.round(B.soupTicks * B.burnMul) - B.soupTicks);
    expect(st.item).toEqual({ k: 'yanik' });
    A(s, 1, 6, 'd');
    expect(hand(s)).toEqual({ k: 'yanik' });
    A(s, 1, 4, 'l'); // trash
    expect(hand(s)).toBeNull();
    expect(stationAt(s, 0, 4)!.n).toBe(1);
  });

  it('2nd stove is locked until bought', () => {
    const s = kitchen();
    expect(stationAt(s, 2, 7)!.off).toBe(true);
    s.up.ocak2 = true;
    s.phase = 'shop';
    s.phaseLeft = 1;
    run(s, 1);
    expect(stationAt(s, 2, 7)!.off).toBe(false);
  });

  it('döner slices accumulate and are cut with B; dürüm plate', () => {
    const s = kitchen();
    const d = stationAt(s, 4, 7)!;
    run(s, B.donerEvery * 4);
    expect(d.n).toBe(B.donerMax);
    A(s, 1, 5, 'l'); // plate
    holdB(s, 4, 6, 'd', B.sliceTicks);
    expect(hand(s)).toEqual({ k: 'tabak', p: ['et'] });
    A(s, 6, 1, 'u'); // lavaş straight onto the plate
    A(s, 1, 3, 'l'); // park plate
    chopped(s, 1);
    A(s, 1, 3, 'l'); // domatesD onto the plate
    A(s, 1, 3, 'l'); // pick
    expect(dishOf(hand(s))).toBe('durum');
  });

  it('tea: 6 glasses, then a 30 s brew', () => {
    const s = kitchen();
    const t = stationAt(s, 5, 7)!;
    for (let i = 0; i < 6; i++) {
      A(s, 5, 6, 'd');
      expect(hand(s)).toEqual({ k: 'cay' });
      s.players[0].hand = null;
    }
    expect(t.n).toBe(0);
    A(s, 5, 6, 'd');
    expect(hand(s)).toBeNull();
    run(s, B.teaBrewTicks);
    expect(t.n).toBe(B.teaGlasses);
  });

  it('rejects wrong placements', () => {
    const s = kitchen();
    A(s, 4, 1, 'u'); // hamur
    const ev = A(s, 1, 6, 'd'); // stove refuses hamur
    expect(ev.some((e) => e.type === 'reject')).toBe(true);
    expect(hand(s)).toEqual({ k: 'hamur' });
  });
});

describe('customers', () => {
  it('leave when patience runs out (−rep, counted as failed)', () => {
    const s = kitchen();
    dineOrder(s, 'cay');
    const ev = run(s, B.patience + 1);
    expect(ev.some((e) => e.type === 'left')).toBe(true);
    expect(s.rep).toBe(B.startRep - B.repFail);
    expect(s.today.failed).toBe(1);
  });

  it('wrong dish: iade, plate comes back dirty', () => {
    const s = kitchen();
    const o = dineOrder(s, 'corba');
    holdB(s, 9, 1, 'u', B.takeOrderTicks);
    A(s, 1, 5, 'l'); // plate from the sink
    s.players[0].hand!.p = ['lahmacun'];
    const ev = A(s, 8, 6, 'd'); // table 3 is first free
    expect(o.table).toBe(3);
    expect(ev.some((e) => e.type === 'wrong')).toBe(true);
    expect(hand(s)).toEqual({ k: 'kirli' });
    A(s, 1, 5, 'l');
    expect(stationAt(s, 0, 5)!.n).toBe(1);
    holdB(s, 1, 5, 'l', B.washTicks / 2); // solo washes twice as fast
    expect(stationAt(s, 0, 5)!.m).toBe(B.plates);
  });

  it('spawns customers during service, faster in the rush', () => {
    const s = createGame(3, humans(2), 'kampanya');
    s.rep = 1e9; // nobody works: don't go bankrupt
    const ev = run(s, B.prepTicks + B.serviceTicks);
    expect(s.phase).toBe('close');
    const at = ev.filter((e) => e.type === 'customer' || e.type === 'phone').length;
    expect(at).toBeGreaterThan(12);
    expect(ev.some((e) => e.type === 'phone')).toBe(true);
    expect(s.today.failed).toBeGreaterThan(5);
  });
});

describe('asymmetric orders', () => {
  it('only the taker (or a pinned ticket) reveals a dine-in order; solo has no asymmetry', () => {
    const s = kitchen(2);
    put(s, 2, 2, 'd', 'p0');
    put(s, 5, 5, 'd', 'p1');
    const o = dineOrder(s, 'durum');
    expect(canSeeOrder(s, 'p1', o)).toBe(false);
    put(s, 9, 1, 'u', 'p1');
    expect(canSeeOrder(s, 'p1', o)).toBe(true); // standing at the cashier
    holdB(s, 9, 1, 'u', B.takeOrderTicks, 'p1');
    put(s, 5, 5, 'd', 'p1');
    expect(canSeeOrder(s, 'p1', o)).toBe(true);
    expect(canSeeOrder(s, 'p0', o)).toBe(false);
    holdB(s, 8, 4, 'l', B.pinTicks, 'p1'); // pano (7,4)
    expect(o.pin).toBe(true);
    expect(canSeeOrder(s, 'p0', o)).toBe(true);
    const solo = kitchen(1);
    expect(canSeeOrder(solo, 'p0', dineOrder(solo, 'cay'))).toBe(true);
  });
});

describe('roles', () => {
  it('assigns 1–4 players a role set covering the whole job', () => {
    for (let n = 1; n <= 4; n++) {
      const s = createGame(1, humans(n), 'kampanya');
      expect(s.players.map((p) => p.roles)).toEqual(assignRoles(n));
      const all = new Set(s.players.flatMap((p) => p.roles));
      for (const r of ['mutfak', 'garson', 'bulasik'] as const) expect(all.has(r)).toBe(true);
      expect(all.has('kurye') || s.up.botKurye).toBe(true);
      const cells = s.players.map((p) => `${Math.floor(p.x)},${Math.floor(p.y)}`);
      expect(new Set(cells).size).toBe(n);
    }
    expect(createGame(1, humans(1), 'kampanya').up.botKurye).toBe(true);
    expect(createGame(1, humans(2), 'kampanya').asym).toBe(true);
  });
});

describe('courier', () => {
  function packedPhone(s: MutfakState, dish: Dish) {
    const o: Order = {
      id: s.nextId++, dish, kind: 'phone', st: 'queue', born: s.tick, pat: B.phonePatience, table: -1, by: null, pin: false, dest: 4, packedAt: 0, eatUntil: 0,
    };
    s.orders.push(o);
    s.players[0].hand = { k: 'tabak', p: dish === 'durum' ? [...PLATE.durum] : [dish] };
    A(s, 6, 6, 'd'); // pack station (6,7)
    holdB(s, 6, 6, 'd', B.packTicks);
    expect(o.st).toBe('packed');
    A(s, 6, 6, 'd'); // pick paket
    A(s, 10, 6, 'd'); // door rack
    return o;
  }

  it('player courier delivers on the street map and comes back', () => {
    const s = kitchen(2);
    const o = packedPhone(s, 'corba');
    expect(stationAt(s, 6, 7)!.item).toBeNull();
    expect(s.stations.find((t) => t.k === 'sink')!.n).toBe(1); // plate went to the sink
    A(s, 10, 6, 'd'); // mount scooter
    const p = s.players[0];
    expect(p.mode).toBe('courier');
    expect(p.bag).toEqual([o.id]);
    const [tc, tr] = STREET.targets[4];
    const money = s.money;
    const ev = A(s, tc, tr, 'r');
    expect(ev.some((e) => e.type === 'delivered' && !e.cold)).toBe(true);
    expect(s.money - money).toBe(Math.round(PRICES.corba * (1 - B.ingredientFrac) + B.courierTip));
    A(s, STREET.home[0], STREET.home[1], 'l');
    expect(p.mode).toBe('kitchen');
  });

  it('cold packages pay half', () => {
    const s = kitchen(2);
    packedPhone(s, 'durum');
    A(s, 10, 6, 'd');
    run(s, B.coldTicks + 1);
    const [tc, tr] = STREET.targets[4];
    const ev = A(s, tc, tr, 'r');
    const d = ev.find((e) => e.type === 'delivered');
    expect(d && d.type === 'delivered' && d.cold).toBe(true);
  });

  it('bot courier (solo) drives there by itself', () => {
    const s = kitchen(1);
    const o = packedPhone(s, 'lahmacun');
    const ev = run(s, 60 * 60);
    expect(ev.some((e) => e.type === 'delivered' && e.order === o.id)).toBe(true);
    expect(s.courier.out).toBe(false);
    expect(s.courier.x).toBe(STREET.home[0] + 0.5);
  });

  it('market restocks the emptiest crate', () => {
    const s = kitchen(2);
    stationAt(s, 3, 0)!.n = 0;
    A(s, 10, 6, 'd');
    const money = s.money;
    A(s, STREET.market[0], STREET.market[1], 'r');
    expect(stationAt(s, 3, 0)!.n).toBe(B.restockAmount);
    expect(money - s.money).toBe(B.restockCost);
  });
});

describe('day loop & economy', () => {
  it('prep → service → close → shop, rent paid, stars, buy, ready → day 2', () => {
    const s = createGame(5, humans(1), 'kampanya');
    s.money = 1000;
    s.nextCustomer = 1e9;
    run(s, B.prepTicks);
    expect(s.phase).toBe('service');
    s.nextCustomer = 1e9;
    s.today.revenue = dayTarget(s) * 1.5;
    run(s, B.serviceTicks + B.closeTicks);
    expect(s.phase).toBe('shop');
    expect(s.history[0].stars).toBe(2);
    expect(s.money).toBe(1000); // açılış günü: no rent on day 1
    const money = s.money;
    run(s, 1, { p0: { ...EMPTY_INPUT, buy: 'bicak', buySeq: 1 } });
    expect(s.up.bicak).toBe(true);
    expect(money - s.money).toBe(120);
    run(s, 1, { p0: { ...EMPTY_INPUT, buy: 'bicak', buySeq: 2 } }); // already owned
    expect(money - s.money).toBe(120);
    run(s, 1, { p0: { ...EMPTY_INPUT, buySeq: 2, ready: true } });
    expect(s.phase).toBe('prep');
    expect(s.day).toBe(2);
  });

  it('açılış günü: no day-1 bankruptcy, reputation floor; rep 0 at the end of a later day bankrupts', () => {
    const s = createGame(5, humans(1), 'kampanya');
    s.money = 0;
    run(s, B.prepTicks + B.serviceTicks + B.closeTicks); // idle day 1: customers leave unserved
    expect(s.bankrupt).toBe(false);
    expect(s.phase).toBe('shop');
    expect(s.rep).toBeGreaterThanOrEqual(B.graceRepFloor);
    const d = createGame(5, humans(1), 'kampanya');
    d.day = 2;
    d.money = 1e6;
    d.rep = 1;
    run(d, B.prepTicks + B.serviceTicks); // rep hits 0 mid-day: the day still runs to the end
    expect(d.phase).not.toBe('end');
    run(d, B.closeTicks);
    expect(d.bankrupt).toBe(true);
  });

  it('campaign ends after day 3; bankrupt when rent cannot be paid', () => {
    const s = createGame(5, humans(1), 'kampanya');
    s.money = 5000;
    s.rep = 1e9;
    const dayTicks = B.prepTicks + B.serviceTicks + B.closeTicks + B.shopTicks;
    run(s, dayTicks * 3);
    expect(s.phase).toBe('end');
    expect(s.history).toHaveLength(3);
    expect(s.bankrupt).toBe(false);
    expect(rankOf(9)).toBe("Ankara'nın Lokantası");
    expect(rankOf(0)).toBe('Çırak');

    const b = createGame(5, humans(1), 'kampanya');
    b.money = 0;
    b.day = 2; // rent is due from day 2
    const ev = run(b, B.prepTicks + B.serviceTicks + B.closeTicks);
    expect(b.phase).toBe('end');
    expect(b.bankrupt).toBe(true);
    expect(ev.some((e) => e.type === 'end')).toBe(true);
  });

  it('endless mode keeps going', () => {
    const s = createGame(5, humans(1), 'sonsuz');
    s.money = 1e6;
    s.rep = 1e9;
    run(s, (B.prepTicks + B.serviceTicks + B.closeTicks + B.shopTicks) * 4);
    expect(s.day).toBe(5);
    expect(dayTarget(s, 5)).toBeGreaterThan(dayTarget(s, 3));
  });
});

describe('net', () => {
  it('setOwnPos rejects walls, teleports and stations', () => {
    const s = kitchen(1);
    const p = put(s, 2, 2, 'd');
    setOwnPos(s, 'p0', { x: 2.5, y: 0.5 }); // crate row
    expect(p.y).toBe(2.5);
    setOwnPos(s, 'p0', { x: 9.5, y: 5.5 }); // too far
    expect(p.x).toBe(2.5);
    setOwnPos(s, 'p0', { x: 2.5, y: 3.2 });
    expect(p.y).toBe(3.2);
  });

  function randomInputs(seed: number, n: number, ticks: number) {
    const r = { rng: seed };
    const out: Record<string, MutfakInput>[] = [];
    const cur = Array.from({ length: n }, () => ({ ...EMPTY_INPUT }));
    for (let t = 0; t < ticks; t++) {
      for (const c of cur) {
        if (random(r) < 0.05) {
          c.dx = Math.floor(random(r) * 3) - 1;
          c.dy = Math.floor(random(r) * 3) - 1;
        }
        if (random(r) < 0.04) c.aSeq++;
        c.b = random(r) < 0.5 ? c.b : !c.b;
        if (random(r) < 0.01) c.buySeq++;
        c.buy = (['ocak2', 'bicak', 'makine', 'botKurye', 'hali'] as const)[Math.floor(random(r) * 5)];
        c.ready = random(r) < 0.3;
      }
      out.push(Object.fromEntries(cur.map((c, i) => [`p${i}`, { ...c }])));
    }
    return out;
  }

  it('is deterministic over 5000 ticks and survives a JSON round trip', () => {
    const inputs = randomInputs(99, 3, 5000);
    const a = mutfakSim.createGame(1234, humans(3), 'kampanya');
    const b = mutfakSim.createGame(1234, humans(3), 'kampanya');
    let c: MutfakState | null = null;
    for (let t = 0; t < 5000; t++) {
      mutfakSim.step(a, inputs[t]);
      mutfakSim.step(b, inputs[t]);
      if (c) mutfakSim.step(c, inputs[t]);
      if (t === 2500) c = JSON.parse(JSON.stringify(a));
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));
    expect(a.tick).toBe(5000);
    expect(a.players.some((p) => p.x !== a.players[0].x || p.y !== a.players[0].y)).toBe(true);
  });

  it('disconnected players are driven by the bot hook (no phantom presses)', () => {
    const s = kitchen(2);
    mutfakSim.setConnected!(s, 'p1', false);
    expect(s.players[1].bot).toBe(true);
    const ev = run(s, 10);
    expect(ev.filter((e) => e.type === 'reject')).toHaveLength(0);
  });
});

describe('review fixes', () => {
  it('an empty or half-built plate next to a seated table is rejected without penalty', () => {
    const s = kitchen();
    dineOrder(s, 'durum');
    holdB(s, 9, 1, 'u', B.takeOrderTicks); // seated at table 3 (8,7)
    A(s, 1, 5, 'l'); // clean plate
    let ev = A(s, 8, 6, 'd');
    expect(ev.some((e) => e.type === 'reject')).toBe(true);
    expect(hand(s)).toEqual({ k: 'tabak', p: [] });
    s.players[0].hand = { k: 'tabak', p: ['lavas'] };
    ev = A(s, 8, 6, 'd');
    expect(ev.some((e) => e.type === 'wrong')).toBe(false);
    expect(hand(s)).toEqual({ k: 'tabak', p: ['lavas'] });
    expect(s.rep).toBe(B.startRep);
  });

  it('door: empty rack needs facing it; a returning courier never lands on another player', () => {
    const s = kitchen(2);
    A(s, 10, 6, 'l'); // next to the door, facing away, rack empty
    expect(s.players[0].mode).toBe('kitchen');
    A(s, 10, 6, 'd'); // facing it: market run
    expect(s.players[0].mode).toBe('courier');
    put(s, 10, 6, 'd', 'p1'); // someone stands on the door spot
    A(s, STREET.home[0], STREET.home[1], 'l');
    const p = s.players[0];
    expect(p.mode).toBe('kitchen');
    expect([Math.floor(p.x), Math.floor(p.y)]).not.toEqual([10, 6]);
  });

  it('reconnect adopts the client seqs instead of pressing A', () => {
    const s = kitchen(2);
    A(s, 1, 5, 'l', 'p1'); // p1 holds a plate
    mutfakSim.setConnected!(s, 'p1', false);
    mutfakSim.setConnected!(s, 'p1', true);
    const p1 = s.players[1];
    p1.hand = { k: 'tabak', p: [] };
    put(s, 1, 5, 'l', 'p1');
    const ev = run(s, 2, { p1: { ...EMPTY_INPUT, aSeq: 0 } }); // a restarted client starts from 0
    expect(ev.some((e) => e.type === 'reject' || e.type === 'pick' || e.type === 'place')).toBe(false);
    expect(hand(s, 'p1')).toEqual({ k: 'tabak', p: [] });
  });

  it('setOwnPos is ignored right after a kitchen/street switch', () => {
    const s = kitchen(2);
    A(s, 10, 6, 'd');
    const p = s.players[0];
    expect(p.mode).toBe('courier');
    setOwnPos(s, 'p0', { x: 1.5, y: 6.5 }); // stale kitchen pose that is also a road cell
    expect([p.x, p.y]).toEqual([STREET.home[0] + 0.5, STREET.home[1] + 0.5]);
  });

  it('close ends early once nothing is open; leftovers at closing count as lost', () => {
    const s = kitchen();
    s.phase = 'close';
    s.phaseLeft = B.closeTicks;
    s.money = 1000;
    run(s, B.closeGraceTicks + 1);
    expect(s.phase).toBe('shop');

    const t = kitchen();
    t.phase = 'close';
    t.phaseLeft = 10;
    t.rep = 1e9;
    t.money = 1000;
    dineOrder(t, 'cay');
    run(t, 10);
    expect(t.phase).toBe('shop');
    expect(t.history[0].dropped).toBe(1);
    expect(t.history[0].failed).toBe(1);
  });
});
