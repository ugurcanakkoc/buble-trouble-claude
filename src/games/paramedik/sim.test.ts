import { describe, expect, it } from 'vitest';
import { BALANCE as B, TICK } from './balance';
import { TEMPLATES, doseFor, makeCase, makeRules, tplById, triageColor } from './cases';
import { cleanAct, createGame, paramedikSim, setConnected, spOf, step } from './sim';
import { ALL_TEX, SFX } from './assets';
import { manualOf, tableNeeds } from './content/solver';
import { EMPTY_INPUT, TABS, type Act, type PmEvent, type PmInput, type PmState } from './types';

const humans = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: 0 }));

/** Tiny driver: each `act` bumps that player's seq once. */
function driver(s: PmState) {
  const inputs: Record<string, PmInput> = Object.fromEntries(s.players.map((p) => [p.id, EMPTY_INPUT]));
  return {
    inputs,
    run(n: number): PmEvent[] {
      const ev: PmEvent[] = [];
      for (let i = 0; i < n; i++) ev.push(...step(s, inputs));
      return ev;
    },
    act(id: string, act: Act): PmEvent[] {
      inputs[id] = { seq: inputs[id].seq + 1, act };
      return step(s, inputs);
    },
  };
}
/** Game in the 'case' phase with the given template forced as case 0. */
function inCase(tpl: string, n = 2, mode = 'vardiya', seed = 7): { s: PmState; d: ReturnType<typeof driver> } {
  const s = createGame(seed, humans(n), mode);
  for (let i = 0; i < 200 && s.cur!.tpl !== tpl; i++) s.cur = makeCase({ ...s, rng: seed + i * 977 }, s.rules, 0, []);
  expect(s.cur!.tpl).toBe(tpl);
  s.cur!.allergy = null;
  const d = driver(s);
  for (const p of s.players) d.act(p.id, { k: 'hazir' });
  expect(s.phase).toBe('case');
  return { s, d };
}
const free = (s: PmState) => (s.busyUntil = 0);

describe('roles', () => {
  it('assigns SP to the host and splits manual tabs among PUs for 1–4 players', () => {
    for (let n = 1; n <= 4; n++) {
      const s = createGame(1, humans(n), 'vardiya');
      expect(spOf(s).id).toBe('p0');
      expect(s.players.filter((p) => p.role === 'sp')).toHaveLength(1);
      const tabs = s.players.flatMap((p) => p.tabs).sort();
      expect(tabs).toEqual([...TABS].sort()); // every tab readable by exactly one player
      if (n === 1) expect(spOf(s).tabs).toEqual(TABS);
      else {
        expect(spOf(s).tabs).toEqual([]);
        for (const p of s.players.filter((q) => q.role === 'pu')) expect(p.tabs.length).toBeGreaterThan(0);
      }
    }
  });
  it('moves the SP role when the SP drops and re-splits tabs', () => {
    const s = createGame(1, humans(3), 'vardiya');
    setConnected(s, 'p0', false);
    expect(spOf(s).id).toBe('p1');
    expect(s.players.find((p) => p.id === 'p2')!.tabs).toEqual(TABS);
    setConnected(s, 'p0', true);
    expect(spOf(s).id).toBe('p1');
    expect(s.players.flatMap((p) => p.tabs).sort()).toEqual([...TABS].sort());
  });
});

describe('rules & cases', () => {
  it('rules are seeded and consistent', () => {
    expect(makeRules(5)).toEqual(makeRules(5));
    const r = makeRules(5);
    expect(new Set([...Object.values(r.drugs), r.decoy]).size).toBe(5);
    expect([88, 90, 92]).toContain(r.spo2Thr);
    expect(r.rowOrder.sort()).toEqual(TEMPLATES.map((t) => t.id).sort());
  });
  it('cases resolve drug steps into the rule color + dose and add O₂ when SpO₂ is under the threshold', () => {
    const s = { rng: 3, tick: 0, mode: 'vardiya' };
    const rules = makeRules(3);
    for (let i = 0; i < 60; i++) {
      const c = makeCase(s, rules, i % 3, []);
      const tpl = tplById(c.tpl);
      expect(c.required.some((k) => k.startsWith('o2:'))).toBe(c.baseV.spo2 < rules.spo2Thr);
      for (const st of tpl.path.filter((p) => p.startsWith('ilac:')))
        expect(c.required).toContain(`ilac:${rules.drugs[st.slice(5) as 'alerji']}:${doseFor(rules, c)}`);
      if (c.allergy) expect(c.required.join()).not.toContain(c.allergy);
      for (const h of c.herrings) expect(tpl.signs).not.toContain(h);
      expect(c.signs.length).toBe(tpl.signs.length + c.herrings.length);
    }
  });
});

describe('case flow', () => {
  it('deteriorates at 1 Hz without treatment, up to arrest and loss', () => {
    const { s, d } = inCase('kanama');
    const sev = s.cur!.sev;
    d.run(TICK - 1);
    expect(s.cur!.sev).toBe(sev);
    d.run(1);
    expect(s.cur!.sev).toBeGreaterThan(sev);
    s.cur!.sev = B.arrestSev - 0.01;
    const ev = d.run(TICK);
    expect(s.cur!.status).toBe('arrest');
    expect(ev).toContainEqual({ type: 'status', status: 'arrest' });
    expect(s.cur!.vitals.hr).toBe(0);
    expect(s.cur!.required).toContain('cpr');
    d.run(TICK * 70);
    expect(s.phase).toBe('result');
    expect(s.results[0].outcome).toBe('kayip');
    expect(s.results[0].score).toBe(0);
  });

  it('treating the anaphylaxis case by the rules stabilizes it; early handover scores with a time bonus', () => {
    const { s, d } = inCase('anafilaksi');
    const c = s.cur!;
    const tpl = tplById(c.tpl);
    expect(d.act('p0', { k: 'triyaj', c: triageColor(s.rules, tpl, c.vitals) })).toContainEqual(expect.objectContaining({ r: 'dogru' }));
    free(s);
    d.act('p0', { k: 'o2', n: s.rules.o2Level });
    free(s);
    d.act('p1', { k: 'onay', a: `ilac:${s.rules.drugs.alerji}:${doseFor(s.rules, c)}` });
    const ev = d.act('p0', { k: 'ilac', c: s.rules.drugs.alerji, n: doseFor(s.rules, c) });
    expect(ev).toContainEqual(expect.objectContaining({ type: 'team' }));
    expect(c.required).toEqual([]);
    expect(c.rate).toBeLessThan(0);
    d.run(TICK * 60 * 5);
    expect(s.phase === 'case' || s.phase === 'result').toBe(true);
    if (s.phase === 'case') {
      expect(c.status).toBe('stabil');
      d.act('p0', { k: 'teslim' });
    }
    const r = s.results[0];
    expect(r.outcome).toBe('stabil');
    expect(r.team).toBe(1);
    expect(r.score).toBeGreaterThanOrEqual(100);
  });

  it('wrong drug, allergy, contraindication and CPR on a breathing patient are harmful', () => {
    const { s, d } = inCase('anafilaksi');
    const c = s.cur!;
    const sev = c.sev;
    expect(d.act('p0', { k: 'ilac', c: s.rules.decoy, n: 1 })).toContainEqual(expect.objectContaining({ r: 'zararli' }));
    free(s);
    expect(d.act('p0', { k: 'cpr', q: 1 })).toContainEqual(expect.objectContaining({ r: 'zararli' }));
    expect(c.harm).toBe(2);
    expect(c.sev).toBeGreaterThan(sev);
    c.allergy = s.rules.drugs.alerji;
    free(s);
    expect(d.act('p0', { k: 'ilac', c: s.rules.drugs.alerji, n: doseFor(s.rules, c) })).toContainEqual(expect.objectContaining({ r: 'zararli' }));
    c.allergy = null;
    s.rules.contra = { color: s.rules.drugs.alerji, hrBelow: 999 };
    free(s);
    expect(d.act('p0', { k: 'ilac', c: s.rules.drugs.alerji, n: doseFor(s.rules, c) })).toContainEqual(expect.objectContaining({ r: 'zararli' }));
  });

  it('the fainting trap punishes drugs; legs-up + triage is the fix', () => {
    const { s, d } = inCase('bayilma');
    const c = s.cur!;
    expect(d.act('p0', { k: 'ilac', c: s.rules.drugs.seker, n: 1 })).toContainEqual(expect.objectContaining({ r: 'zararli' }));
    free(s);
    d.act('p0', { k: 'poz', p: 'bacak' });
    free(s);
    d.act('p0', { k: 'triyaj', c: triageColor(s.rules, tplById(c.tpl), c.vitals) });
    expect(c.required).toEqual([]);
  });

  it('arrest needs good CPR cycles for ROSC; bad cycles do not count', () => {
    const { s, d } = inCase('arrest');
    const c = s.cur!;
    expect(c.status).toBe('arrest');
    expect(d.act('p0', { k: 'cpr', q: 0.2 })).toContainEqual(expect.objectContaining({ r: 'yanlis' }));
    for (let i = 0; i < B.cprCycles; i++) d.act('p0', { k: 'cpr', q: 0.9 });
    expect(c.status).not.toBe('arrest');
    expect(c.sev).toBeLessThanOrEqual(B.roscSev);
    expect(c.done).toContain('cpr');
  });

  it('tools reveal readings, make the SP busy, and off-case tests are wasteful', () => {
    const { s, d } = inCase('astim');
    const c = s.cur!;
    d.act('p0', { k: 'olc', t: 'pulseox' });
    expect(c.monitor).toBe(true);
    expect(c.readings.pulseox!.v).toBe(c.vitals.spo2);
    expect(d.act('p0', { k: 'olc', t: 'tansiyon' })).toContainEqual({ type: 'busy' });
    free(s);
    d.act('p0', { k: 'olc', t: 'tansiyon' }); // triage needs it → never waste
    free(s);
    d.act('p0', { k: 'olc', t: 'stetoskop' }); // the symptom table asks for it (hırıltı → no sugar test needed)
    expect(c.waste).toBe(0);
    expect(tableNeeds(manualOf(s.rules), c).has('glukometre')).toBe(false);
    free(s);
    expect(d.act('p0', { k: 'olc', t: 'glukometre' })).toContainEqual(expect.objectContaining({ r: 'gereksiz' }));
    free(s);
    d.act('p0', { k: 'olc', t: 'glukometre' }); // repeat measuring is free
    expect(c.waste).toBe(1);
    d.act('p0', { k: 'sor', q: 'olay' });
    expect(c.asked).toEqual(['olay']);
    const t0 = c.readings.stetoskop!.t;
    free(s);
    d.act('p1', { k: 'olc', t: 'stetoskop' }); // PU can't touch the patient
    expect(c.readings.stetoskop!.t).toBe(t0);
  });

  it('auto handover at ETA ends as kritik when untreated; shift ends after all cases', () => {
    const { s, d } = inCase('bayilma', 2, 'tek');
    d.run(s.cur!.eta - s.tick);
    expect(s.phase).toBe('result');
    expect(s.results[0].outcome).toBe('kritik');
    expect(s.results[0].score).toBe(B.kritikIdleScore); // doing nothing is not worth a full 'kritik'
    d.act('p0', { k: 'hazir' });
    d.act('p1', { k: 'hazir' });
    expect(s.phase).toBe('end');
  });

  it('vardiya runs 3 different cases', () => {
    const s = createGame(11, humans(2), 'vardiya');
    const d = driver(s);
    d.run(60 * 60 * 30);
    expect(s.phase).toBe('end');
    expect(s.results).toHaveLength(3);
    expect(new Set(s.results.map((r) => r.tpl)).size).toBe(3);
    expect(s.total).toBe(s.results.reduce((a, r) => a + r.score, 0));
  });
});

describe('review fixes', () => {
  it('a kritik handover with real progress scores 60; team bonus never lifts a kayıp', () => {
    const { s, d } = inCase('astim', 2, 'tek');
    const c = s.cur!;
    d.act('p0', { k: 'poz', p: 'otur' });
    c.rate = 0;
    d.run(c.eta - s.tick);
    expect(s.results[0].outcome).toBe('kritik');
    expect(s.results[0].score).toBe(60);
    const k = inCase('kanama');
    k.s.cur!.team = 4;
    k.s.cur!.sev = 99.99;
    k.d.run(TICK);
    expect(k.s.results[0].outcome).toBe('kayip');
    expect(k.s.results[0].score).toBe(0);
  });
  it('arrest at the ETA counts as an idle kritik', () => {
    const { s, d } = inCase('arrest', 2, 'tek');
    s.cur!.done.push('olc:pulseox');
    s.cur!.sev = 86;
    s.cur!.eta = s.tick + 2;
    d.run(3);
    expect(s.results[0].score).toBe(B.kritikIdleScore);
  });
  it('drops malformed network acts and clamps quality', () => {
    expect(cleanAct({ k: 'olc', t: 'x' })).toBeNull();
    expect(cleanAct({ k: 'cpr' })).toBeNull();
    expect(cleanAct({ k: 'cpr', q: NaN })).toBeNull();
    expect(cleanAct({ k: 'cpr', q: 7 })).toEqual({ k: 'cpr', q: 1 });
    expect(cleanAct({ k: 'ilac', c: 'mavi', n: 2.5 })).toBeNull();
    expect(cleanAct({ k: 'onay', a: 'x'.repeat(41) })).toBeNull();
    expect(cleanAct({ k: 'nope' })).toBeNull();
    expect(cleanAct(null)).toBeNull();
    const { s, d } = inCase('kanama');
    const sev = s.cur!.sev;
    d.act('p0', { k: 'olc', t: 'x' } as unknown as Act);
    expect(s.busyUntil).toBe(0);
    d.act('p0', { k: 'cpr' } as unknown as Act);
    expect(s.cur!.sev).toBe(sev);
  });
  it('one live approval per PU (no bonus farming), capped list', () => {
    const { s, d } = inCase('kanama', 3);
    for (const a of ['triyaj:kirmizi', 'triyaj:sari', 'basinc', 'o2:1']) d.act('p1', { k: 'onay', a });
    expect(s.onay.map((o) => o.key)).toEqual(['o2:1']);
    d.act('p2', { k: 'onay', a: 'basinc' });
    expect(s.onay).toHaveLength(2);
    d.act('p0', { k: 'onay', a: 'basinc' }); // SP can't approve
    expect(s.onay).toHaveLength(2);
  });
  it('readings never go below zero in arrest', () => {
    const { s, d } = inCase('arrest');
    for (let i = 0; i < 30; i++) {
      free(s);
      d.act('p0', { k: 'olc', t: i % 2 ? 'solunum' : 'tansiyon' });
      expect(s.cur!.readings.solunum?.v ?? 0).toBe(0);
      expect(s.cur!.readings.tansiyon?.v ?? 0).toBe(0);
    }
  });
  it('hands over automatically once everything is done and the patient stays stabil', () => {
    const { s, d } = inCase('bayilma', 2, 'tek');
    const c = s.cur!;
    d.act('p0', { k: 'poz', p: 'bacak' });
    free(s);
    d.act('p0', { k: 'triyaj', c: triageColor(s.rules, tplById(c.tpl), c.vitals) });
    expect(c.required).toEqual([]);
    d.run(TICK * 2);
    expect(c.okAt).toBeGreaterThan(0);
    d.run(B.autoTeslimTicks + TICK);
    expect(s.results[0].outcome).toBe('stabil');
    expect(s.results[0].timeMult).toBeGreaterThan(1);
  });
});

describe('determinism & wire format', () => {
  function scripted(seed: number): PmState {
    const s = createGame(seed, humans(3), 'vardiya');
    const d = driver(s);
    const acts: Act[] = [{ k: 'olc', t: 'pulseox' }, { k: 'triyaj', c: 'kirmizi' }, { k: 'o2', n: 3 }, { k: 'ilac', c: 'mavi', n: 2 }, { k: 'cpr', q: 0.8 }, { k: 'hazir' }];
    for (let t = 0; t < 5000; t++) {
      if (t % 97 === 0) d.inputs.p0 = { seq: d.inputs.p0.seq + 1, act: acts[(t / 97) % acts.length] };
      if (t % 211 === 0) d.inputs.p1 = { seq: d.inputs.p1.seq + 1, act: { k: 'onay', a: 'o2:3' } };
      step(s, d.inputs);
    }
    return s;
  }
  it('same seed + inputs → same state after 5000 ticks', () => {
    expect(scripted(99)).toEqual(scripted(99));
    expect(JSON.stringify(scripted(99))).not.toBe(JSON.stringify(scripted(100)));
  });
  it('state survives a JSON round-trip and keeps stepping identically', () => {
    const a = scripted(5);
    const b = JSON.parse(JSON.stringify(a)) as PmState;
    expect(b).toEqual(a);
    for (let i = 0; i < 600; i++) {
      step(a, {});
      step(b, {});
    }
    expect(b).toEqual(a);
  });
  it('sim object and asset manifest are wired', () => {
    expect(paramedikSim.tickRate).toBe(60);
    expect(paramedikSim.createGame(1, humans(2), 'x').mode).toBe('vardiya');
    expect(new Set(ALL_TEX).size).toBe(ALL_TEX.length);
    expect(SFX.length).toBeGreaterThan(10);
  });
});
