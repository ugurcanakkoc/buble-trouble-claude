import { describe, expect, it } from 'vitest';
import * as B from './balance';
import { aiCommand } from './ai';
import { createGame, spawnX, step, wallX, type Team, type Unit, type WarCommand, type WarEvent, type WarInput, type WarState } from './sim';

const P = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: 0xffffff }));
/** First tick with empty inputs: sets every player's seq baseline (like GameLoop does). */
const synced = (s: WarState) => {
  step(s, Object.fromEntries(s.players.map((p) => [p.id, { cmd: null, seq: 0 }])));
  return s;
};
/** pvp game, both teams human (no AI), empty lane */
const pvp = (seed = 1) => synced(createGame(seed, P(2), 'pvp'));
const run = (s: WarState, ticks: number, inputs: (t: number) => Record<string, WarInput> = () => ({})) => {
  const ev: WarEvent[] = [];
  for (let i = 0; i < ticks && s.phase === 'playing'; i++) ev.push(...step(s, inputs(i)));
  return ev;
};
let seqs: Record<string, number> = {};
const cmd = (s: WarState, id: string, c: WarCommand) => step(s, { [id]: { cmd: c, seq: (seqs[id] = (seqs[id] ?? 0) + 1) } });
const unit = (s: WarState, t: Team, k: number, x: number): Unit => {
  const u: Unit = { i: s.nextId++, t, k, x, hp: B.UNITS[k].hp, cd: 0, s: 0 };
  s.units.push(u);
  return u;
};

describe('setup', () => {
  it('pvp: p0 left, p1 right; ai mode: everyone left vs AI scaled by humans', () => {
    const s = pvp();
    expect(s.players.map((p) => p.team)).toEqual([0, 1]);
    expect(s.teams.map((t) => t.ai)).toEqual([-1, -1]);
    const a1 = createGame(1, P(1), 'ai');
    const a2 = createGame(1, P(2), 'ai');
    expect(a2.players.map((p) => p.team)).toEqual([0, 0]);
    expect([a1.teams[1].ai, a2.teams[1].ai]).toEqual([1, 2]);
    expect(createGame(1, P(3), 'pvp').players).toHaveLength(2); // max 2
  });
});

describe('combat', () => {
  it('melee units meet, fight, one dies; killer team gets gold + XP + kill', () => {
    const s = pvp();
    s.teams[0].hp = s.teams[1].hp = 1e9;
    const a = unit(s, 0, 2, 1000); // dino rider
    unit(s, 1, 0, 1100); // club man
    const g0 = s.teams[0].gold;
    const ev = run(s, 600);
    const death = ev.find((e) => e.type === 'death')!;
    expect(death).toMatchObject({ type: 'death', team: 1, k: 0 });
    expect(a.hp).toBeLessThan(B.UNITS[2].hp);
    expect(s.teams[0].kills).toBe(1);
    const reward = Math.round(B.UNITS[0].cost * B.KILL_GOLD_MULT);
    expect(s.teams[0].gold).toBeGreaterThanOrEqual(g0 + reward);
    expect(s.teams[0].xp).toBeGreaterThanOrEqual(B.UNITS[0].cost * B.XP_KILL_MULT + B.UNITS[0].hp * B.XP_PER_DMG - 1);
  });

  it('ranged units shoot from range; melee needs contact', () => {
    const s = pvp();
    const r = unit(s, 0, 1, 1000);
    const e = unit(s, 1, 0, 1000 + B.UNITS[1].range + 22 - 1);
    e.cd = 1e9; // never hits back
    step(s, {});
    expect(r.s).toBe(2);
    expect(e.hp).toBe(B.UNITS[0].hp - B.UNITS[1].dmg);
  });

  it('allies queue behind each other and never pass', () => {
    const s = pvp();
    const front = unit(s, 0, 0, 1000);
    front.hp = 1e9;
    const back = unit(s, 0, 2, 900); // faster dino behind slow club man
    const blocker = unit(s, 1, 0, 1040);
    blocker.hp = 1e9;
    blocker.cd = 1e9;
    for (let i = 0; i < 600; i++) {
      step(s, {});
      expect(back.x).toBeLessThan(front.x - (B.UNITS[0].w + B.UNITS[2].w) / 2 - B.UNIT_GAP + 0.001);
    }
    expect(back.s).toBe(1);
  });

  it('units attack the enemy base when they reach it; base at 0 ends the game', () => {
    const s = pvp();
    s.teams[1].hp = 20;
    unit(s, 0, 0, wallX(1) - 20);
    const ev = run(s, 300);
    expect(ev.some((e) => e.type === 'baseHit' && e.team === 1)).toBe(true);
    expect(s.phase).toBe('over');
    expect(s.winner).toBe(0);
    expect(ev.at(-1)).toEqual({ type: 'over', winner: 0 });
    expect(step(s, {})).toEqual([]); // frozen
  });
});

describe('commands', () => {
  it('train: costs gold, queues (max 5), spawns after train time at the base', () => {
    seqs = {};
    const s = pvp();
    s.teams[0].gold = 1000;
    for (let i = 0; i < 6; i++) cmd(s, 'p0', { type: 'train', unit: 0 });
    expect(s.teams[0].q).toHaveLength(B.QUEUE_MAX);
    expect(s.teams[0].q[0].by).toBe('p0');
    expect(s.teams[0].gold).toBeLessThanOrEqual(1000 - 5 * B.UNITS[0].cost + B.PASSIVE_GOLD[0]);
    const ev = run(s, B.UNITS[0].train + 2);
    expect(ev.filter((e) => e.type === 'spawn')).toHaveLength(1);
    expect(s.units[0].x - spawnX(0)).toBeGreaterThan(0);
    expect(s.units[0].x - spawnX(0)).toBeLessThan(10);
  });

  it('train refused without gold; super unit only in the last age', () => {
    seqs = {};
    const s = pvp();
    s.teams[0].gold = 0;
    const ev = cmd(s, 'p0', { type: 'train', unit: 2 });
    expect(ev[0]).toMatchObject({ type: 'cmd', by: 'p0', ok: false });
    s.teams[0].gold = 1e7;
    expect(cmd(s, 'p0', { type: 'train', unit: 3 })[0]).toMatchObject({ ok: false });
    s.teams[0].age = 4;
    expect(cmd(s, 'p0', { type: 'train', unit: 3 })[0]).toMatchObject({ ok: true });
    expect(s.teams[0].q[0].k).toBe(B.SUPER_UNIT);
  });

  it('re-sent input with the same seq does nothing', () => {
    const s = pvp();
    s.teams[0].gold = 1000;
    const inp = { p0: { cmd: { type: 'train', unit: 0 } as WarCommand, seq: 7 } };
    step(s, inp);
    step(s, inp);
    step(s, { p0: { ...inp.p0, seq: 5 } }); // older seq too
    expect(s.teams[0].q.length + s.units.length).toBe(1);
    step(s, { p0: { ...inp.p0, seq: 8 } });
    expect(s.teams[0].q.length + s.units.length).toBe(2);
  });

  it('malformed commands are rejected', () => {
    const s = pvp();
    s.teams[0].gold = 1e6;
    const bad = [{ type: 'train', unit: 9 }, { type: 'turret', slot: -1, kind: 0 }, { type: 'turret', slot: 0, kind: 1.5 }, { type: 'nope' }, null];
    bad.forEach((c, i) => step(s, { p0: { cmd: c as WarCommand, seq: i + 1 } }));
    expect(s.teams[0].gold).toBe(1e6 + B.PASSIVE_GOLD[0] * Math.floor(s.tick / 60));
  });

  it('age-up gated by XP; scales base HP and unlocks the new units', () => {
    seqs = {};
    const s = pvp();
    s.teams[0].hp = 250; // half
    expect(cmd(s, 'p0', { type: 'evolve' })[0]).toMatchObject({ ok: false });
    s.teams[0].xp = B.AGES[0].xpToNext;
    const ev = cmd(s, 'p0', { type: 'evolve' });
    expect(ev.find((e) => e.type === 'evolve')).toMatchObject({ team: 0, age: 1, by: 'p0' });
    expect(s.teams[0].maxHp).toBe(B.AGES[1].baseHp);
    expect(s.teams[0].hp).toBe(Math.ceil(B.AGES[1].baseHp / 2));
    s.teams[0].gold = 1000;
    cmd(s, 'p0', { type: 'train', unit: 0 });
    expect(s.teams[0].q[0].k).toBe(3); // Kılıççı
  });

  it('turrets: buy into unlocked slots, extra slots cost gold, sell refunds 50%, they shoot', () => {
    seqs = {};
    const s = pvp();
    s.teams[0].gold = 10000;
    expect(cmd(s, 'p0', { type: 'turret', slot: 1, kind: 0 })[0]).toMatchObject({ ok: false }); // locked
    cmd(s, 'p0', { type: 'turret', slot: 0, kind: 2 });
    expect(s.teams[0].tur[0]).toBe(2);
    const g = s.teams[0].gold;
    cmd(s, 'p0', { type: 'buySlot' });
    expect(s.teams[0].slots).toBe(2);
    expect(s.teams[0].gold).toBe(g - B.SLOT_COSTS[0]);
    cmd(s, 'p0', { type: 'buySlot' });
    expect(cmd(s, 'p0', { type: 'buySlot' }).find((e) => e.type === 'cmd')).toMatchObject({ ok: false });
    const g2 = s.teams[0].gold;
    cmd(s, 'p0', { type: 'sellTurret', slot: 0 });
    expect(s.teams[0].tur[0]).toBe(-1);
    expect(s.teams[0].gold).toBe(g2 + B.TURRETS[2].cost / 2);
    cmd(s, 'p0', { type: 'turret', slot: 2, kind: 0 });
    const e = unit(s, 1, 0, wallX(0) + 200);
    e.cd = 1e9;
    const ev = run(s, 5);
    expect(ev.some((x) => x.type === 'turret' && x.team === 0)).toBe(true);
    expect(e.hp).toBeLessThan(B.UNITS[0].hp);
  });

  it('special: damages enemies along the lane over time, then cooldown', () => {
    seqs = {};
    const s = pvp();
    expect(cmd(s, 'p0', { type: 'special' }).find((e) => e.type === 'cmd')).toMatchObject({ ok: false }); // first cooldown
    s.teams[0].spCd = 0;
    const foes = [800, 1200, 1600].map((x) => unit(s, 1, 2, x));
    for (const f of foes) f.cd = 1e9;
    const ev = [...cmd(s, 'p0', { type: 'special' }), ...run(s, B.AGES[0].special.duration + 5)];
    expect(ev.filter((e) => e.type === 'impact')).toHaveLength(B.AGES[0].special.hits);
    expect(foes.some((f) => f.hp < B.UNITS[2].hp)).toBe(true);
    expect(s.sp).toHaveLength(0);
    expect(s.teams[0].spCd).toBeGreaterThan(B.SPECIAL_CD - 400);
    expect(cmd(s, 'p0', { type: 'special' }).find((e) => e.type === 'cmd')).toMatchObject({ ok: false });
  });

  it('shared economy: teammates spend the same team gold', () => {
    seqs = {};
    const s = synced(createGame(1, P(2), 'ai'));
    s.teams[0].gold = 30;
    cmd(s, 'p0', { type: 'train', unit: 0 });
    const ev = cmd(s, 'p1', { type: 'train', unit: 0 });
    expect(ev.find((e) => e.type === 'cmd')).toMatchObject({ by: 'p1', ok: true });
    expect(s.teams[0].q.map((q) => q.by)).toEqual(['p0', 'p1']);
    expect(s.log.map((l) => l.by)).toEqual(['p0', 'p1']);
  });

  it('first input of a match only sets the baseline (stale input from the last match never fires)', () => {
    const s = createGame(1, P(1), 'ai');
    s.teams[0].gold = 1000;
    const stale = { p0: { cmd: { type: 'train', unit: 0 } as WarCommand, seq: 15 } };
    step(s, stale);
    step(s, stale);
    expect(s.teams[0].q).toHaveLength(0);
    step(s, { p0: { ...stale.p0, seq: 16 } });
    expect(s.teams[0].q).toHaveLength(1);
  });
});

// --- whole matches -------------------------------------------------------------------------
function greedy(s: WarState, t: Team): WarCommand | null {
  const T = s.teams[t];
  if (T.age < 4 && T.xp >= B.AGES[T.age].xpToNext) return { type: 'evolve' };
  if (T.q.length >= B.QUEUE_MAX) return null;
  for (const u of [2, 1, 0] as const) if (T.gold >= B.UNITS[T.age * 3 + u].cost) return { type: 'train', unit: u };
  return null;
}
/** Team 0 driven by a bot through p0's input (vs the built-in AI on team 1 at `level`). */
function match(seed: number, bot: ((s: WarState) => WarCommand | null) | null, level: number) {
  const s = synced(createGame(seed, P(1), 'ai'));
  s.teams[1].ai = level;
  let seq = 0;
  while (s.phase === 'playing') {
    const c = bot && s.tick % 30 === 0 ? bot(s) : null;
    step(s, c ? { p0: { cmd: c, seq: ++seq } } : {});
  }
  return s;
}

describe('matches', () => {
  it('determinism: same seed + inputs → identical state after 5000 ticks; JSON round-trip', () => {
    const play = () => {
      const s = synced(createGame(99, P(2), 'pvp'));
      let seq = 0;
      for (let i = 0; i < 5000; i++) {
        const inp: Record<string, WarInput> = {};
        if (i % 30 === 0) for (const t of [0, 1] as Team[]) inp[`p${t}`] = { cmd: aiCommand(s, t, 1), seq: ++seq };
        step(s, inp);
      }
      return s;
    };
    const a = play();
    expect(a.units.length + a.teams[0].kills).toBeGreaterThan(0);
    expect(play()).toEqual(a);
    const copy = JSON.parse(JSON.stringify(a));
    expect(copy).toEqual(a);
    step(a, {});
    step(copy, {});
    expect(copy).toEqual(a);
  });

  it('AI vs AI finishes in under 15 minutes', () => {
    for (const seed of [1, 2, 3]) {
      const s = match(seed, (st) => aiCommand(st, 0, 1), 1);
      expect(s.phase).toBe('over');
      expect(s.tick).toBeLessThan(15 * 60 * 60);
    }
  }, 60000);

  it('AI beats an idle opponent', () => {
    const s = match(5, null, 1);
    expect(s.winner).toBe(1);
    expect(s.tick).toBeLessThan(12 * 60 * 60);
  }, 30000);

  it('easy AI loses to a greedy bot sometimes (and not always)', () => {
    const wins = [1, 2, 3, 4, 5, 6].map((seed) => match(seed, (st) => greedy(st, 0), 0).winner === 0);
    expect(wins.some(Boolean)).toBe(true);
    expect(wins.every(Boolean)).toBe(false);
  }, 120000);
});

describe('stats + alerts', () => {
  it('counts trained, killed, gold earned/spent (team + issuer), damage, specials, age-up tick', () => {
    seqs = {};
    const s = synced(createGame(1, P(2), 'ai'));
    s.teams[1].ai = -1; // keep the lane clean
    const T = s.teams[0];
    T.gold = 1000;
    cmd(s, 'p0', { type: 'train', unit: 0 });
    cmd(s, 'p1', { type: 'train', unit: 2 });
    cmd(s, 'p1', { type: 'turret', slot: 0, kind: 0 });
    expect(T.st.goldSpent).toBe(B.UNITS[0].cost + B.UNITS[2].cost + B.TURRETS[0].cost);
    expect(s.players.map((p) => p.spent)).toEqual([B.UNITS[0].cost, B.UNITS[2].cost + B.TURRETS[0].cost]);
    run(s, B.UNITS[0].train + B.UNITS[2].train + 30);
    expect(T.st.trained).toBe(2);
    expect(T.st.goldEarned).toBe(Math.round(B.PASSIVE_GOLD[0] * B.AI_MODE_HUMAN_INCOME) * Math.floor(s.tick / 60));
    T.spCd = 0;
    cmd(s, 'p0', { type: 'special' });
    expect(T.st.specials).toBe(1);
    T.xp = B.AGES[0].xpToNext;
    cmd(s, 'p0', { type: 'evolve' });
    expect(T.st.ageAt).toEqual([0, s.tick, -1, -1, -1]);
    const e = unit(s, 1, 0, 1200);
    e.cd = 1e9;
    unit(s, 0, 2, 1150);
    const earned = T.st.goldEarned;
    const ev = run(s, 400);
    expect(ev.some((x) => x.type === 'death' && x.team === 1)).toBe(true);
    expect(T.kills).toBe(1);
    expect(T.st.dmgUnits).toBe(B.UNITS[0].hp);
    expect(T.st.goldEarned - earned).toBeGreaterThanOrEqual(Math.round(B.UNITS[0].cost * B.KILL_GOLD_MULT));
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it("'base under attack' at most once per 5 s; HP thresholds fire once each", () => {
    const s = pvp();
    s.teams[1].hp = s.teams[1].maxHp = 1e6;
    unit(s, 0, 0, wallX(1) - 20).hp = 1e9;
    const ev = run(s, 12 * 60);
    const alerts = ev.filter((e) => e.type === 'alert');
    expect(ev.filter((e) => e.type === 'baseHit').length).toBeGreaterThan(alerts.length);
    expect(alerts).toHaveLength(3); // t≈0, 5 s, 10 s
    expect(alerts.every((e) => e.type === 'alert' && e.team === 1 && e.kind === 'attack')).toBe(true);
    expect(s.teams[0].st.dmgBase).toBe(1e6 - s.teams[1].hp);

    const t = pvp();
    const kinds = () => run(t, 1).filter((e) => e.type === 'alert').map((e) => (e as { kind: string }).kind);
    t.teams[0].hp = 240; // < 50 %
    expect(kinds()).toEqual(['hp50']);
    expect(kinds()).toEqual([]);
    t.teams[0].hp = 100; // < 25 %
    expect(kinds()).toEqual(['hp25']);
    expect(kinds()).toEqual([]);
  });
});

describe('fairness', () => {
  /** Mirrored script: identical rules for both sides (incl. turrets + slots). */
  const script = (s: WarState, t: Team): WarCommand | null => {
    const T = s.teams[t];
    if (T.age < 4 && T.xp >= B.AGES[T.age].xpToNext) return { type: 'evolve' };
    const empty = T.tur.findIndex((k, i) => i < T.slots && k < 0);
    if (empty >= 0 && T.gold >= B.TURRETS[T.age * 3].cost) return { type: 'turret', slot: empty, kind: 0 };
    if (empty < 0 && T.slots < B.MAX_SLOTS && T.gold >= B.SLOT_COSTS[T.slots - 1] * 2) return { type: 'buySlot' };
    return greedy(s, t);
  };

  it('pvp is left/right symmetric: mirrored commands → mirrored state, draw', () => {
    const s = pvp(7);
    let seq = 0;
    let turrets = 0;
    while (s.phase === 'playing') {
      const inp: Record<string, WarInput> = {};
      if (s.tick % 30 === 0) {
        seq++;
        for (const t of [0, 1] as Team[]) inp[`p${t}`] = { cmd: script(s, t), seq };
      }
      step(s, inp);
      turrets = Math.max(turrets, s.teams[0].tur.filter((k) => k >= 0).length);
      if (s.tick % 60 === 0) {
        const [a, b] = s.teams;
        expect(a.hp).toBe(b.hp);
        expect(a.gold).toBe(b.gold);
        const xs = (t: Team) => s.units.filter((u) => u.t === t).map((u) => (t === 0 ? u.x : B.LANE_W - u.x)).sort((p, q) => p - q);
        const d = xs(0).map((x, i) => Math.abs(x - (xs(1)[i] ?? -1e9)));
        expect(Math.max(0, ...d)).toBeLessThan(1e-6);
      }
    }
    const [a, b] = s.teams;
    expect(a.st).toEqual(b.st);
    expect(a.kills).toBe(b.kills);
    expect(s.winner).toBe(-1);
    expect(a.st.trained).toBeGreaterThan(10);
    expect(turrets).toBeGreaterThan(0);
  }, 60000);
});
