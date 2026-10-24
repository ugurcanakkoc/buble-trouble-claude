// Paramedik: plays a case using ONLY what the paramedic can see (signs, readings, monitor, patient age, code)
// plus the rendered manual facts. Used by the bot hook and by the solvability tests. Deterministic, no RNG.
import type { Act, AmpulColor, CaseState, DrugRole, PmState, RuleSet, ToolId, TriageColor } from '../types';
import { buildManual, type Cond, type Manual, type SymRow } from './manual';

const cache = new WeakMap<RuleSet, Manual>();
export function manualOf(rules: RuleSet): Manual {
  let m = cache.get(rules);
  if (!m) cache.set(rules, (m = buildManual(rules)));
  return m;
}

const TOOL_OF = { lung: 'stetoskop', sys: 'tansiyon', glu: 'glukometre', hr: 'pulseox' } as const;
const NEED_ORDER: ToolId[] = ['stetoskop', 'tansiyon', 'glukometre', 'pulseox'];

/** true / false, or null when the reading isn't taken yet. The HR comes from the monitor once the pulse-ox is on. */
function holds(cond: Cond, c: CaseState): boolean | null {
  if (cond.k === 'sign') return c.signs.includes(cond.has);
  const v = cond.k === 'lung' ? c.readings.stetoskop?.v
    : cond.k === 'hr' ? (c.monitor ? c.vitals.hr : undefined)
      : c.readings[TOOL_OF[cond.k]]?.v;
  if (v === undefined) return null;
  if (cond.k === 'lung') return v === cond.is;
  const n = v as number;
  return (cond.lt === undefined || n < cond.lt) && (cond.gte === undefined || n >= cond.gte);
}

const openTools = (rows: SymRow[], c: CaseState) =>
  new Set<ToolId>(rows.flatMap((r) => r.when.filter((w) => w.k !== 'sign' && holds(w, c) === null).map((w) => TOOL_OF[w.k as keyof typeof TOOL_OF])));

/** Tools the symptom table still asks for to tell the remaining candidate rows apart (never 'gereksiz'). */
export function tableNeeds(m: Manual, c: CaseState): Set<ToolId> {
  return openTools(m.facts.rows.filter((r) => r.when.every((w) => holds(w, c) !== false)), c);
}

/** The one matching table row, or the next tool to pick up, or null when the manual can't decide. */
export function diagnose(m: Manual, c: CaseState): { row: SymRow } | { need: ToolId } | null {
  const alive = m.facts.rows.filter((r) => r.when.every((w) => holds(w, c) !== false));
  const full = alive.filter((r) => r.when.every((w) => holds(w, c) === true));
  if (full.length === 1) return { row: full[0] };
  const need = openTools(alive, c);
  const t = NEED_ORDER.find((x) => need.has(x));
  return t ? { need: t } : null;
}

export function doseOf(m: Manual, c: CaseState): number {
  const f = m.facts.ilac;
  const grp = c.patient.age <= f.ageMaxCocuk ? 'cocuk' : c.patient.age <= f.ageMaxYetiskin ? 'yetiskin' : 'yasli';
  const odd = Number(c.code.split('-')[1]) % 2 === 1;
  const plus = (f.add === 'tek' && odd) || (f.add === 'cift' && !odd) ? 1 : 0;
  return Math.min(f.maxDose, f.dose[grp] + plus);
}

function triage(m: Manual, c: CaseState): Act {
  const f = m.facts.triage;
  const sys = c.readings.tansiyon?.v as number | undefined;
  if (sys === undefined) return { k: 'olc', t: 'tansiyon' };
  let calc: TriageColor = 'sari';
  if (sys < f.sysThr) calc = 'kirmizi';
  else {
    const rr = c.readings.solunum?.v as number | undefined;
    if (rr === undefined) return { k: 'olc', t: 'solunum' };
    if (rr > f.rrThr) calc = 'kirmizi';
  }
  // a wrong call (noisy reading near the threshold) is retried with the other colour
  const tried = c.log.filter((l) => l.key.startsWith('triyaj:') && l.r === 'yanlis').map((l) => l.key.slice(7));
  const c2 = ([calc, 'kirmizi', 'sari'] as TriageColor[]).find((x) => !tried.includes(x)) ?? calc;
  return { k: 'triyaj', c: c2 };
}

export const isTimed = (a: Act) => a.k === 'olc' || a.k === 'ilac' || a.k === 'o2' || a.k === 'poz' || a.k === 'triyaj';

/** Next paramedic action by the manual, or null (wait / nothing left). Ignores busy time; callers handle pacing. */
export function nextAct(s: PmState): Act | null {
  const c = s.cur;
  if (!c || s.phase !== 'case') return null;
  const m = manualOf(s.rules);
  if (c.status === 'arrest') return { k: 'cpr', q: 0.9 };
  const d = diagnose(m, c);
  if (!d) return null;
  if ('need' in d) return { k: 'olc', t: d.need };
  if (!c.readings.pulseox) return { k: 'olc', t: 'pulseox' };
  const a = m.facts.abcde;
  if ((c.readings.pulseox.v as number) < a.spo2Thr && !c.done.some((k) => k.startsWith('o2:'))) return { k: 'o2', n: a.o2Level };
  for (const st of d.row.plan) {
    if (st === 'triyaj' && !c.done.includes('triyaj')) return triage(m, c);
    if (st === 'basinc' && !c.done.includes('basinc')) return { k: 'basinc', q: 0.9 };
    if (st.startsWith('poz:') && !c.done.includes(st)) return { k: 'poz', p: st.slice(4) as 'bacak' | 'otur' | 'yan' };
    if (st.startsWith('ilac:')) {
      const color: AmpulColor = m.facts.ilac.byRole[st.slice(5) as DrugRole];
      const n = doseOf(m, c);
      if (!c.done.includes(`ilac:${color}:${n}`)) return { k: 'ilac', c: color, n };
    }
  }
  if (!c.required.length && c.status === 'stabil') return { k: 'teslim' };
  return null;
}
