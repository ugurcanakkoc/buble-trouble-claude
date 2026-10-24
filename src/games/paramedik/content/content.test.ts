import { describe, expect, it } from 'vitest';
import { TEMPLATES, makeCase, makeRules } from '../cases';
import { createGame, step } from '../sim';
import { TABS, type PmState } from '../types';
import { TEYZE_TIPS } from './lines';
import { buildManual } from './manual';

const SEEDS = Array.from({ length: 50 }, (_, i) => i * 7919 + 13);
const infos = [0, 1].map((i) => ({ id: `p${i}`, name: `P${i}`, color: 0 }));

/** All-bot game (bots follow ONLY the rendered manual) with the given template forced as the single case. */
function botGame(seed: number, tpl: string, mode = 'tek'): PmState {
  const s = createGame(seed, infos, mode);
  const used = TEMPLATES.filter((t) => t.id !== tpl).map((t) => t.id);
  s.cur = makeCase({ rng: seed ^ 0xabc, tick: 0, mode }, s.rules, 0, used);
  expect(s.cur.tpl).toBe(tpl);
  for (const p of s.players) p.bot = true;
  return s;
}

describe('manual content', () => {
  it('has the disclaimer and all 5 non-empty tabs', () => {
    const m = buildManual(makeRules(1));
    expect(m.disclaimer).toMatch(/oyundur/);
    for (const t of TABS) expect(m.sections[t].flatMap((x) => x.lines).length).toBeGreaterThan(2);
    expect(m.facts.rows).toHaveLength(TEMPLATES.length);
  });
  it('rule variants differ across 50 seeds (not memorizable)', () => {
    const rules = SEEDS.map(makeRules);
    const n = (f: (r: (typeof rules)[0]) => unknown) => new Set(rules.map((r) => JSON.stringify(f(r)))).size;
    expect(n((r) => r.variant)).toBe(3);
    expect(n((r) => r.spo2Thr)).toBe(3);
    expect(n((r) => r.drugs)).toBeGreaterThan(15);
    expect(n((r) => r.rowOrder)).toBeGreaterThan(30);
    expect(n((r) => r.contra)).toBeGreaterThan(5);
    expect(n((r) => r.dose)).toBeGreaterThan(2);
    const texts = new Set(rules.map((r) => JSON.stringify(buildManual(r).sections)));
    expect(texts.size).toBeGreaterThan(45);
  });
  it('rendered text contains the rule numbers and colours', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const r = makeRules(seed);
      const all = JSON.stringify(buildManual(r).sections);
      for (const x of [r.spo2Thr, r.rrThr, r.sysThr, r.cprRate, r.contra.hrBelow]) expect(all).toContain(String(x));
      expect(all).toContain('yalnız hastanede');
    }
  });
  it('teyze lines exist and some are tied to a template', () => {
    expect(TEYZE_TIPS.length).toBeGreaterThanOrEqual(10);
    expect(TEYZE_TIPS.some((t) => t.good?.length)).toBe(true);
    for (const t of TEMPLATES) if (t.id !== 'arrest') expect(t.says.length).toBeGreaterThanOrEqual(5);
  });
});

describe('every generated case is solvable from the manual alone', () => {
  it('50 seeds x 6 templates: manual-following bots hand over STABIL with zero harm and zero waste', () => {
    const bad: string[] = [];
    for (const seed of SEEDS) {
      for (const t of TEMPLATES) {
        const s = botGame(seed, t.id);
        for (let i = 0; i < 40000 && s.phase !== 'end'; i++) step(s, {});
        const r = s.results[0];
        if (!r || r.outcome !== 'stabil' || r.harm > 0 || r.waste > 0) bad.push(`${seed}/${t.id}: ${r ? `${r.outcome} harm=${r.harm} waste=${r.waste}` : 'no result'}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('a full 3-case shift is solvable too (harder later cases, red herrings)', () => {
    for (const seed of SEEDS.slice(0, 15)) {
      const s = createGame(seed, infos, 'vardiya');
      for (const p of s.players) p.bot = true;
      for (let i = 0; i < 120000 && s.phase !== 'end'; i++) step(s, {});
      expect(s.results).toHaveLength(3);
      expect(s.results.map((r) => r.outcome), `seed ${seed}`).toEqual(['stabil', 'stabil', 'stabil']);
    }
  });
});
