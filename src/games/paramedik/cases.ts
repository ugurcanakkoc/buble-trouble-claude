// Paramedik case engine data: 6 MVP templates, seeded manual rules, seeded case generation.
// Everything fictional and non-graphic. Pure + deterministic (seed RNG only, no Math.random).
import { BALANCE as B, TICK } from './balance';
import { TEMPLATES } from './content/templates';
import { TEYZE } from './content/lines';
import {
  COLORS, DRUG_ROLES, LABELS, TOPICS,
  type AgeGroup, type AmpulColor, type CaseState, type CaseTemplate, type DrugRole, type HistoryTopic, type RuleSet,
  type SignId, type TriageColor, type VitalKey, type Vitals,
} from './types';

export function random(s: { rng: number }): number {
  let t = (s.rng = (s.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(s: { rng: number }, a: readonly T[]): T => a[Math.floor(random(s) * a.length)];
const roll = (s: { rng: number }, [a, b]: [number, number]) => a + (b - a) * random(s);
const rollInt = (s: { rng: number }, r: [number, number]) => Math.round(roll(s, r));
export function shuffle<T>(s: { rng: number }, a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const VITAL_KEYS: VitalKey[] = ['hr', 'rr', 'spo2', 'sys', 'glu', 'gcs'];
/** Severity 0 point of every curve. */
export const NORMAL: Vitals = { hr: 78, rr: 14, spo2: 98, sys: 122, glu: 100, gcs: 15 };

export { TEMPLATES };
export const tplById = (id: string) => TEMPLATES.find((t) => t.id === id)!;

const GENERIC: Record<HistoryTopic, string[]> = {
  alerji: ['Bildiğim bir alerjim yok', 'Yok yok, alerjim yok'],
  ilac: ['Düzenli ilacım yok', 'Tansiyon hapı içiyorum bazen'],
  gecmis: ['Daha önce böyle bir şey olmadı', 'Hiç hastanelik olmadım'],
  yemek: ['Öğlen yemek yedim', 'Çay içtim sadece'],
  olay: ['Birden oldu'],
};
const NAMES: Record<AgeGroup, string[]> = {
  cocuk: ['Elif', 'Can', 'Zeynep', 'Efe'],
  yetiskin: ['Murat', 'Ayşe', 'Burak', 'Selin', 'Kemal'],
  yasli: ['Hatice Teyze', 'Hüseyin Amca', 'Fadime Nine', 'Rıza Dede'],
};
const AGES: Record<AgeGroup, [number, number]> = { cocuk: [6, 14], yetiskin: [20, 58], yasli: [65, 84] };

/** Per-session manual rules from the session seed (own RNG stream, independent of case rolls). */
export function makeRules(seed: number): RuleSet {
  const r = { rng: (seed ^ 0x5eed1e) >>> 0 || 1 };
  const variant = pick(r, ['A', 'B', 'C'] as const);
  const colors = shuffle(r, [...COLORS]);
  const drugs = Object.fromEntries(DRUG_ROLES.map((d, i) => [d, colors[i]])) as Record<DrugRole, AmpulColor>;
  return {
    rev: `Revizyon 2026-Ç${1 + Math.floor(random(r) * 4)}/${variant}`,
    variant,
    spo2Thr: pick(r, [88, 90, 92]),
    o2Level: 2 + Math.floor(random(r) * 3),
    rrThr: pick(r, [26, 28, 30]),
    sysThr: pick(r, [90, 95, 100]),
    drugs,
    decoy: colors[4],
    dose: { cocuk: 1, yetiskin: pick(r, [2, 3]), yasli: pick(r, [1, 2]) },
    contra: { color: pick(r, colors.slice(0, 4)), hrBelow: pick(r, [50, 55, 60]) },
    cprRate: pick(r, [100, 110, 120]),
    rowOrder: shuffle(r, TEMPLATES.map((t) => t.id)),
  };
}

export const caseNumber = (code: string) => Number(code.split('-')[1]);
/** Tık count the manual prescribes for this patient. */
export function doseFor(rules: RuleSet, c: Pick<CaseState, 'patient' | 'code'>): number {
  const odd = caseNumber(c.code) % 2 === 1;
  const bonus = (rules.variant === 'B' && odd) || (rules.variant === 'C' && !odd) ? 1 : 0;
  return Math.min(3, rules.dose[c.patient.grp] + bonus);
}

/** Hızlı Triyaj flow on the patient's current (true) vitals. */
export function triageColor(rules: RuleSet, tpl: CaseTemplate, v: Vitals): TriageColor {
  if (tpl.walks) return 'yesil';
  if (v.rr > rules.rrThr || v.sys < rules.sysThr) return 'kirmizi';
  return 'sari';
}

/** Abstract step → concrete required key ('triyaj' stays abstract: its color is checked live). */
function resolveStep(rules: RuleSet, c: Pick<CaseState, 'patient' | 'code'>, step: string): string {
  if (step.startsWith('ilac:')) return `ilac:${rules.drugs[step.slice(5) as DrugRole]}:${doseFor(rules, c)}`;
  return step;
}

export function lerpVitals(a: Vitals, b: Vitals, t: number): Vitals {
  const o = {} as Vitals;
  for (const k of VITAL_KEYS) o[k] = Math.round(a[k] + (b[k] - a[k]) * t);
  return o;
}

/** 3-point curve: NORMAL at sev 0, the rolled presentation at sev0, the template's worst at 100. */
export function vitalsAt(c: Pick<CaseState, 'baseV' | 'sev' | 'sev0' | 'status'>, tpl: CaseTemplate): Vitals {
  const v = c.sev >= c.sev0
    ? lerpVitals(c.baseV, tpl.worst, (c.sev - c.sev0) / Math.max(1, 100 - c.sev0))
    : lerpVitals(c.baseV, NORMAL, (c.sev0 - c.sev) / Math.max(1, c.sev0));
  if (c.status === 'arrest') Object.assign(v, { hr: 0, rr: 0, sys: 0, gcs: 3, spo2: Math.min(v.spo2, 60) });
  return v;
}

/** Seeded case for case index `idx` (difficulty grows with idx). Advances s.rng. */
export function makeCase(s: { rng: number; tick: number; mode: string }, rules: RuleSet, idx: number, used: string[]): CaseState {
  const pool = TEMPLATES.filter((t) => !used.includes(t.id));
  const tpl = pick(s, pool.length ? pool : TEMPLATES);
  const grp = pick(s, ['cocuk', 'yetiskin', 'yetiskin', 'yasli'] as AgeGroup[]);
  const patient = { name: pick(s, NAMES[grp]), age: rollInt(s, AGES[grp]), grp };
  const code = `${tpl.code}-${1 + Math.floor(random(s) * 9)}`;
  const baseV = {} as Vitals;
  for (const k of VITAL_KEYS) baseV[k] = rollInt(s, tpl.base[k]);
  const sev0 = roll(s, tpl.sev0);
  const mult = (B.rateMult[s.mode] ?? 1) * (1 + B.rateGrowthPerCase * idx);
  const r0 = roll(s, tpl.rate);
  const rate = r0 > 0 ? r0 * mult : r0;

  const steps = tpl.path.map((st) => resolveStep(rules, { patient, code }, st));
  if (baseV.spo2 < rules.spo2Thr) steps.push(`o2:${rules.o2Level}`);
  const pathColors = steps.filter((k) => k.startsWith('ilac:')).map((k) => k.split(':')[1]);
  const allergy = random(s) < B.allergyChance ? pick(s, COLORS.filter((c) => !pathColors.includes(c))) : null;

  const nHerr = B.herrings[Math.min(idx, B.herrings.length - 1)];
  const others = [...new Set(TEMPLATES.filter((t) => t !== tpl).flatMap((t) => t.signs))].filter(
    (g) => !tpl.signs.includes(g) && g !== 'nefesYok' && g !== 'bilincsiz',
  );
  const herrings: SignId[] = shuffle(s, others).slice(0, nHerr);
  const history = {} as Record<HistoryTopic, string>;
  for (const q of TOPICS) history[q] = pick(s, tpl.history[q] ?? GENERIC[q]);
  if (allergy) history.alerji = `Geçen sefer ${LABELS.color[allergy].toLocaleLowerCase('tr')} ampul vermişlerdi, her yerim şişti`;

  const eta = s.tick + Math.round((roll(s, B.etaSec) + B.etaPerCaseSec * idx) * TICK);
  const c: CaseState = {
    tpl: tpl.id, code, patient, allergy,
    signs: shuffle(s, [...tpl.signs, ...herrings]), herrings,
    history, teyze: pick(s, TEYZE),
    vitals: baseV, baseV, sev: sev0, sev0, rate,
    status: sev0 >= B.arrestSev ? 'arrest' : sev0 >= B.critSev ? 'kritik' : 'stabil',
    monitor: false, readings: {}, asked: [], required: steps, done: [], cprGood: 0,
    harm: 0, waste: 0, team: 0, log: [], startTick: s.tick, eta, say: null, okAt: 0,
  };
  c.vitals = vitalsAt(c, tpl);
  return c;
}
