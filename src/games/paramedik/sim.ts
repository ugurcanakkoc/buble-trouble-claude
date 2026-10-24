// Paramedik: pure deterministic host-authoritative sim. 60 Hz loop; the patient's body ticks at 1 Hz.
// No movement → no ownPos/setOwnPos. Commands are seq-based intents (PmInput.act applies when seq changes).
import type { PlayerId, PlayerInfo } from '../../sim/types';
import type { GameSim } from '../types';
import { BALANCE as B, TICK } from './balance';
import { botInput } from './bot';
import { manualOf, tableNeeds } from './content/solver';
import { doseFor, makeCase, makeRules, random, tplById, triageColor, vitalsAt } from './cases';
import {
  COLORS, EMPTY_INPUT, PARAMEDIK_MODES, TABS, TOOLS, TOPICS, actionKey,
  type Act, type ActResult, type CaseResult, type ModeId, type Outcome, type PmEvent, type PmInput, type PmPlayer,
  type PmState, type Status, type TabId,
} from './types';

export { EMPTY_INPUT };

export const spOf = (s: PmState) => s.players.find((p) => p.role === 'sp')!;

/** SP = first connected player in `order` (host first); the rest are PUs sharing the manual tabs round-robin. */
export function assignRoles(s: PmState): void {
  const sp = s.players.find((p) => p.connected) ?? s.players[0];
  const pus = s.players.filter((p) => p !== sp);
  sp.role = 'sp';
  const live = pus.filter((p) => p.connected);
  sp.tabs = live.length ? [] : [...TABS]; // nobody to read the manual → SP reads it (antrenman / solo)
  for (const p of pus) {
    p.role = 'pu';
    p.tabs = [];
  }
  const readers = live.length ? live : pus;
  TABS.forEach((t: TabId, i) => readers.length && readers[i % readers.length].tabs.push(t));
}

export function createGame(seed: number, infos: PlayerInfo[], mode: string): PmState {
  const m = (PARAMEDIK_MODES.some((d) => d.id === mode) ? mode : 'vardiya') as ModeId;
  const s: PmState = {
    tick: 0, rng: seed >>> 0 || 1, mode: m, disclaimer: true, phase: 'intro', phaseUntil: B.introTicks,
    rules: makeRules(seed), caseIdx: 0, cases: B.casesPerShift[m] ?? 1, cur: null, onay: [], results: [], total: 0,
    busyUntil: 0, ready: [],
    players: infos.slice(0, 4).map((p): PmPlayer => ({ ...p, role: 'pu', tabs: [], connected: true, bot: false, seq: 0 })),
  };
  assignRoles(s);
  s.cur = makeCase(s, s.rules, 0, []);
  return s;
}

const secs = (s: PmState) => Math.round((s.tick - s.cur!.startTick) / TICK);
const log = (s: PmState, key: string, r: ActResult | 'info') => s.cur!.log.push({ t: secs(s), key, r });

function statusFromSev(sev: number): Status {
  return sev >= 100 ? 'kayip' : sev >= B.arrestSev ? 'arrest' : sev >= B.critSev ? 'kritik' : 'stabil';
}

function setStatus(s: PmState, st: Status, ev: PmEvent[]): void {
  const c = s.cur!;
  if (c.status === st) return;
  c.status = st;
  log(s, `status:${st}`, 'info');
  ev.push({ type: 'status', status: st });
  if (st === 'arrest') {
    c.cprGood = 0;
    if (!c.required.includes('cpr')) c.required.push('cpr');
  }
}

/** Every required step done → the patient recovers on their own. */
function credit(s: PmState, req: string): void {
  const c = s.cur!;
  c.required = c.required.filter((k) => k !== req);
  c.done.push(req);
  if (c.rate > 0) c.rate *= B.stepRateFactor;
  if (!c.required.length) c.rate = Math.min(c.rate, B.recoverPerMin);
}

function harm(s: PmState): void {
  const c = s.cur!;
  c.harm++;
  c.sev = Math.min(100, c.sev + B.harmSev);
  c.rate += B.harmRatePerMin;
}

/** Validate one SP intervention against the rules; returns the verdict (null = info-only, no verdict). */
function judge(s: PmState, a: Act, ev: PmEvent[]): ActResult | null {
  const c = s.cur!;
  const tpl = tplById(c.tpl);
  const key = actionKey(a);
  switch (a.k) {
    case 'olc': {
      const v = c.vitals;
      // a zero (arrest) reads exactly 0; noise never pushes a reading below 0
      const n = (k: string, x: number) => (x <= 0 ? 0 : Math.max(0, Math.round(x + (random(s) * 2 - 1) * (B.noise[k] ?? 0))));
      const val = a.t === 'stetoskop' ? (c.status === 'arrest' ? 'sessiz' : tpl.lung)
        : a.t === 'pulseox' ? v.spo2 : a.t === 'tansiyon' ? n('sys', v.sys) : a.t === 'glukometre' ? n('glu', v.glu) : n('rr', v.rr);
      const asked = tableNeeds(manualOf(s.rules), c).has(a.t); // before this reading changes the candidate rows
      if (a.t === 'pulseox') c.monitor = true;
      const first = !c.readings[a.t];
      c.readings[a.t] = { v: val, t: s.tick };
      ev.push({ type: 'reading', tool: a.t });
      if (c.required.includes(key)) return credit(s, key), 'dogru';
      // Hızlı Triyaj needs tansiyon + solunum, so they are never waste while triage is part of the case
      const forTriage = (a.t === 'tansiyon' || a.t === 'solunum') && (c.required.includes('triyaj') || c.done.includes('triyaj'));
      if (first && !forTriage && !asked && !tpl.useful.includes(a.t) && !c.done.includes(key)) return c.waste++, 'gereksiz';
      return null;
    }
    case 'triyaj': {
      if (!c.required.includes('triyaj')) return c.done.includes('triyaj') ? 'tekrar' : (c.waste++, 'gereksiz');
      // the SP can only follow the flow with their own (noisy) readings, so a call that matches them counts too
      const seen = { ...c.vitals, sys: Number(c.readings.tansiyon?.v ?? c.vitals.sys), rr: Number(c.readings.solunum?.v ?? c.vitals.rr) };
      if (a.c !== triageColor(s.rules, tpl, c.vitals) && a.c !== triageColor(s.rules, tpl, seen)) return c.waste++, 'yanlis';
      return credit(s, 'triyaj'), 'dogru';
    }
    case 'ilac': {
      const needed = c.required.concat(c.done).find((k) => k.startsWith(`ilac:${a.c}:`));
      const contra = a.c === s.rules.contra.color && c.vitals.hr < s.rules.contra.hrBelow;
      if (tpl.trap || !needed || a.c === c.allergy || contra) return harm(s), 'zararli';
      if (c.done.includes(needed)) return harm(s), 'zararli'; // second dose = overdose
      if (a.n !== doseFor(s.rules, c)) return c.waste++, 'yanlis';
      return credit(s, needed), 'dogru';
    }
    case 'o2':
    case 'poz': {
      const family = a.k === 'o2' ? 'o2:' : 'poz:';
      if (c.required.includes(key)) return credit(s, key), 'dogru';
      if (c.done.includes(key)) return 'tekrar';
      if (a.k === 'o2' && c.required.some((k) => k.startsWith(family))) return c.waste++, 'yanlis'; // wrong mask setting
      return c.waste++, 'gereksiz';
    }
    case 'basinc': {
      if (!c.required.includes('basinc')) return c.done.includes('basinc') ? 'tekrar' : (c.waste++, 'gereksiz');
      return a.q >= B.basincMinQuality ? (credit(s, 'basinc'), 'dogru') : 'yanlis';
    }
    case 'cpr': {
      if (c.status !== 'arrest') return harm(s), 'zararli';
      if (a.q < B.cprMinQuality) return 'yanlis';
      c.sev = Math.max(0, c.sev - B.cprSev * Math.min(1, a.q));
      if (++c.cprGood >= B.cprCycles) {
        c.sev = Math.min(c.sev, B.roscSev);
        credit(s, 'cpr');
        setStatus(s, statusFromSev(c.sev), ev);
        c.vitals = vitalsAt(c, tpl);
      }
      return 'dogru';
    }
    default:
      return null;
  }
}

function endCase(s: PmState, outcome: Outcome, timeMult: number, ev: PmEvent[], idle = false): void {
  const c = s.cur!;
  const team = outcome === 'kayip' ? 0 : Math.min(c.team * B.teamBonus, B.teamBonusMax);
  const base = idle ? B.kritikIdleScore : B.outcomeScore[outcome] ?? 0;
  const raw = base * timeMult - c.harm * B.harmPenalty - c.waste * B.wastePenalty + team;
  const result: CaseResult = {
    tpl: c.tpl, code: c.code, outcome, score: Math.max(0, Math.round(raw)), timeMult: Math.round(timeMult * 100) / 100,
    harm: c.harm, waste: c.waste, team: c.team, secs: secs(s),
  };
  s.results.push(result);
  s.total += result.score;
  s.onay = [];
  s.ready = [];
  s.phase = 'result';
  s.phaseUntil = s.tick + B.resultTicks;
  ev.push({ type: 'result', result }, { type: 'phase', phase: 'result' });
}

function handover(s: PmState, early: boolean, ev: PmEvent[]): void {
  const c = s.cur!;
  const outcome: Outcome = c.status === 'kayip' ? 'kayip' : !c.required.length && c.status === 'stabil' ? 'stabil' : 'kritik';
  const len = Math.max(1, c.eta - c.startTick);
  // a 'kritik' handover only earns the full score when the team actually did something (and the heart beats)
  const idle = outcome === 'kritik' && (c.status === 'arrest' || !c.done.length);
  endCase(s, outcome, early ? 1 + B.earlyBonusMax * Math.max(0, c.eta - s.tick) / len : 1, ev, idle);
}

/** The body at 1 Hz: severity drift → status → vitals, patient lines. */
function bodyTick(s: PmState, ev: PmEvent[]): void {
  const c = s.cur!;
  const tpl = tplById(c.tpl);
  c.sev = Math.max(0, Math.min(100, c.sev + (c.status === 'arrest' ? B.arrestPerMin : c.rate) / 60));
  if (c.sev >= 100) setStatus(s, 'kayip', ev);
  else if (c.status !== 'arrest') setStatus(s, statusFromSev(c.sev), ev); // only CPR ends an arrest
  c.vitals = vitalsAt(c, tpl);
  if (c.status === 'kayip') return handover(s, false, ev);
  if (!c.required.length && c.status === 'stabil') {
    if (!c.okAt) c.okAt = s.tick;
    else if (s.tick - c.okAt >= B.autoTeslimTicks) return handover(s, true, ev); // nobody pressed Teslim → we drive off
  } else c.okAt = 0;
  const t = secs(s);
  if (t > 0 && t % B.sayEverySec === 0 && c.status !== 'arrest' && tpl.says.length) {
    c.say = { text: tpl.says[Math.floor(random(s) * tpl.says.length)], t: s.tick };
    ev.push({ type: 'say', text: c.say.text });
  }
}

const TRIAGE = ['yesil', 'sari', 'kirmizi'];
const POSES = ['bacak', 'otur', 'yan'];
const oneOf = (x: unknown, list: readonly string[]) => typeof x === 'string' && list.includes(x);
const intIn = (x: unknown, lo: number, hi: number) => Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi;

/** Network inputs are untrusted: a malformed act is dropped, quality values are clamped to 0..1. */
export function cleanAct(raw: unknown): Act | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  switch (a.k) {
    case 'olc': return oneOf(a.t, TOOLS) ? (a as unknown as Act) : null;
    case 'sor': return oneOf(a.q, TOPICS) ? (a as unknown as Act) : null;
    case 'triyaj': return oneOf(a.c, TRIAGE) ? (a as unknown as Act) : null;
    case 'ilac': return oneOf(a.c, COLORS) && intIn(a.n, 1, 4) ? (a as unknown as Act) : null;
    case 'o2': return intIn(a.n, 1, 4) ? (a as unknown as Act) : null;
    case 'poz': return oneOf(a.p, POSES) ? (a as unknown as Act) : null;
    case 'basinc':
    case 'cpr': return typeof a.q === 'number' && Number.isFinite(a.q) ? { k: a.k, q: Math.max(0, Math.min(1, a.q)) } : null;
    case 'onay': return typeof a.a === 'string' && a.a.length <= 40 ? { k: 'onay', a: a.a } : null;
    case 'teslim':
    case 'hazir': return { k: a.k };
    default: return null;
  }
}

function apply(s: PmState, p: PmPlayer, raw: Act, ev: PmEvent[]): void {
  const a = cleanAct(raw);
  if (!a) return;
  if (a.k === 'hazir') {
    if ((s.phase === 'intro' || s.phase === 'result') && !s.ready.includes(p.id)) s.ready.push(p.id);
    return;
  }
  if (s.phase !== 'case') return;
  const c = s.cur!;
  if (a.k === 'onay') {
    if (p.role !== 'pu') return;
    // one live approval per PU: approving everything at once can't farm the team bonus
    s.onay = s.onay.filter((o) => o.key !== a.a && o.by !== p.id).concat({ key: a.a, by: p.id, t: s.tick }).slice(-B.onayMax);
    ev.push({ type: 'onay', key: a.a, by: p.id });
    return;
  }
  if (p.role !== 'sp') return;
  if (a.k === 'sor') {
    if (!c.asked.includes(a.q)) c.asked.push(a.q);
    ev.push({ type: 'answer', q: a.q });
    return;
  }
  if (a.k === 'teslim') {
    if (!c.required.length && c.status === 'stabil') handover(s, true, ev);
    else ev.push({ type: 'act', key: 'teslim', r: 'yanlis', by: p.id });
    return;
  }
  const timed = a.k === 'olc' || a.k === 'ilac' || a.k === 'o2' || a.k === 'poz' || a.k === 'triyaj';
  if (timed && s.tick < s.busyUntil) return void ev.push({ type: 'busy' });
  if (timed) s.busyUntil = s.tick + (a.k === 'olc' ? B.toolTicks[a.t] : B.actTicks);
  const key = actionKey(a);
  const r = judge(s, a, ev);
  if (!r) return;
  log(s, key, r);
  ev.push({ type: 'act', key, r, by: p.id });
  const o = r === 'dogru' && s.onay.find((q) => q.key === key);
  if (o) {
    c.team++;
    s.onay = s.onay.filter((q) => q !== o);
    ev.push({ type: 'team', key });
  }
}

function nextPhase(s: PmState, ev: PmEvent[]): void {
  s.ready = [];
  if (s.phase === 'intro') {
    const c = s.cur!;
    const len = c.eta - c.startTick;
    c.startTick = s.tick;
    c.eta = s.tick + len;
    s.phase = 'case';
    ev.push({ type: 'phase', phase: 'case' }, { type: 'case', idx: s.caseIdx, code: c.code });
  } else if (s.caseIdx + 1 >= s.cases) {
    s.phase = 'end';
    ev.push({ type: 'phase', phase: 'end' });
  } else {
    s.caseIdx++;
    s.cur = makeCase(s, s.rules, s.caseIdx, s.results.map((r) => r.tpl));
    s.busyUntil = 0;
    s.phase = 'intro';
    s.phaseUntil = s.tick + B.introTicks;
    ev.push({ type: 'phase', phase: 'intro' });
  }
}

export function step(s: PmState, inputs: Record<PlayerId, PmInput>): PmEvent[] {
  const ev: PmEvent[] = [];
  s.tick++;
  if (s.phase === 'end') return ev;
  for (const p of s.players) {
    const inp = p.bot ? botInput(s, p.id) : inputs[p.id] ?? EMPTY_INPUT;
    if (inp.seq === p.seq) continue;
    p.seq = inp.seq;
    if (inp.act) apply(s, p, inp.act, ev);
  }
  if (s.phase === 'intro' || s.phase === 'result') {
    const humans = s.players.filter((p) => p.connected && !p.bot);
    const allReady = humans.length > 0 && humans.every((p) => s.ready.includes(p.id));
    if (allReady || s.tick >= s.phaseUntil) nextPhase(s, ev);
    return ev;
  }
  if (s.onay.length) s.onay = s.onay.filter((o) => s.tick - o.t < B.teamWindowTicks);
  if ((s.tick - s.cur!.startTick) % TICK === 0) bodyTick(s, ev);
  if (s.phase === 'case' && s.tick >= s.cur!.eta) handover(s, false, ev);
  return ev;
}

/** A player who leaves is marked offline (bot hook drives them); if it was the SP, the role moves on. */
export function setConnected(s: PmState, id: PlayerId, connected: boolean): void {
  const p = s.players.find((q) => q.id === id);
  if (!p || p.connected === connected) return;
  p.connected = connected;
  p.bot = !connected;
  if (!connected && p.role === 'sp' && s.players.some((q) => q.connected)) {
    // keep the order but put connected players first so assignRoles picks the next one
    const sp = s.players.find((q) => q.connected)!;
    s.players = [sp, ...s.players.filter((q) => q !== sp)];
  }
  assignRoles(s);
}

export const paramedikSim: GameSim<PmState, PmInput, PmEvent> = {
  tickRate: 60,
  emptyInput: EMPTY_INPUT,
  createGame,
  step,
  setConnected,
};
