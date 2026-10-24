// Paramedik: shared contract (sim ↔ scene ↔ manual ↔ bot). Everything here is plain JSON.
// Fictional game medicine: ampul colors, "tık" doses and thresholds are invented and change per session.
import type { PlayerId } from '../../sim/types';
import type { ModeDef } from '../types';

export const DISCLAIMER =
  'Bu bir oyundur, tıbbi tavsiye değildir. Kitapçıktaki kurallar, ilaçlar ve eşik değerler kurgusaldır ve her oturumda değişir. Gerçek acil durumda 112’yi arayın.';

export const PARAMEDIK_MODES: ModeDef[] = [
  { id: 'vardiya', label: 'Vardiya', desc: '3 vaka art arda, her vaka biraz daha zor', minPlayers: 2, icon: '🚑' },
  { id: 'tek', label: 'Tek vaka', desc: 'Hızlı bir vaka, ısınmak için', minPlayers: 2, icon: '🩺' },
  { id: 'antrenman', label: 'Antrenman', desc: 'Tek kişi: hem saha hem kitapçık, hasta yavaş kötüleşir', minPlayers: 1, icon: '📘' },
];
export type ModeId = 'vardiya' | 'tek' | 'antrenman';

// ---- vocabulary -------------------------------------------------------------------------------
export type Role = 'sp' | 'pu'; // Saha Paramediği / Protokol Uzmanı
export type TabId = 'triyaj' | 'abcde' | 'semptom' | 'ilac' | 'ekler';
export const TABS: TabId[] = ['triyaj', 'abcde', 'semptom', 'ilac', 'ekler'];

export type ToolId = 'pulseox' | 'tansiyon' | 'glukometre' | 'stetoskop' | 'solunum';
export const TOOLS: ToolId[] = ['pulseox', 'tansiyon', 'glukometre', 'stetoskop', 'solunum'];
export type AmpulColor = 'kirmizi' | 'mavi' | 'sari' | 'yesil' | 'mor';
export const COLORS: AmpulColor[] = ['kirmizi', 'mavi', 'sari', 'yesil', 'mor'];
export type DrugRole = 'alerji' | 'bronkodilator' | 'seker' | 'agri';
export const DRUG_ROLES: DrugRole[] = ['alerji', 'bronkodilator', 'seker', 'agri'];
export type PoseId = 'bacak' | 'otur' | 'yan';
export type TriageColor = 'yesil' | 'sari' | 'kirmizi';
export type HistoryTopic = 'alerji' | 'ilac' | 'gecmis' | 'yemek' | 'olay'; // SAMPLE
export const TOPICS: HistoryTopic[] = ['alerji', 'ilac', 'gecmis', 'yemek', 'olay'];
export type AgeGroup = 'cocuk' | 'yetiskin' | 'yasli';
export type LungSound = 'normal' | 'hirilti' | 'citirti' | 'sessiz';
export type SignId =
  | 'dokuntu' | 'sisYuz' | 'morDudak' | 'kasinti' | 'konusamiyor' | 'omuzNefes' | 'terleme' | 'titreme'
  | 'konfuzyon' | 'solukluk' | 'kanama' | 'deformite' | 'sogukCilt' | 'bilincsiz' | 'nefesYok' | 'basDonmesi';
export type VitalKey = 'hr' | 'rr' | 'spo2' | 'sys' | 'glu' | 'gcs';
export type Vitals = Record<VitalKey, number>;
export type Status = 'stabil' | 'kritik' | 'arrest' | 'kayip';
export type Outcome = 'stabil' | 'kritik' | 'kayip';
export type Phase = 'intro' | 'case' | 'result' | 'end';

export const LABELS = {
  role: { sp: 'Saha Paramediği', pu: 'Protokol Uzmanı' } as Record<Role, string>,
  tab: { triyaj: 'Hızlı Triyaj', abcde: 'ABCDE', semptom: 'Semptom Tabloları', ilac: 'İlaç Rehberi', ekler: 'Ekler' } as Record<TabId, string>,
  tool: { pulseox: 'Pulse oksimetre', tansiyon: 'Tansiyon aleti', glukometre: 'Glukometre', stetoskop: 'Stetoskop', solunum: 'Solunum say' } as Record<ToolId, string>,
  color: { kirmizi: 'Kırmızı', mavi: 'Mavi', sari: 'Sarı', yesil: 'Yeşil', mor: 'Mor' } as Record<AmpulColor, string>,
  drug: { alerji: 'Alerji karşıtı', bronkodilator: 'Nefes açıcı', seker: 'Şeker desteği', agri: 'Ağrı kesici' } as Record<DrugRole, string>,
  pose: { bacak: 'Bacakları kaldır', otur: 'Dik oturt', yan: 'Yan yatır' } as Record<PoseId, string>,
  triage: { yesil: 'Yeşil', sari: 'Sarı', kirmizi: 'Kırmızı' } as Record<TriageColor, string>,
  topic: { alerji: 'Alerji', ilac: 'İlaçlar', gecmis: 'Geçmiş', yemek: 'Son yemek', olay: 'Olay' } as Record<HistoryTopic, string>,
  age: { cocuk: 'Çocuk', yetiskin: 'Yetişkin', yasli: 'Yaşlı' } as Record<AgeGroup, string>,
  lung: { normal: 'Normal', hirilti: 'Hırıltı', citirti: 'Çıtırtı', sessiz: 'Ses yok' } as Record<LungSound, string>,
  status: { stabil: 'Stabil', kritik: 'Kritik', arrest: 'Arrest!', kayip: 'Kayıp' } as Record<Status, string>,
  outcome: { stabil: 'Stabil teslim', kritik: 'Kritik teslim', kayip: 'Kayıp' } as Record<Outcome, string>,
  sign: {
    dokuntu: 'Döküntü', sisYuz: 'Yüzde şişlik', morDudak: 'Mor dudak', kasinti: 'Kaşıntı', konusamiyor: 'Cümle kuramıyor',
    omuzNefes: 'Omuzla nefes', terleme: 'Terleme', titreme: 'Titreme', konfuzyon: 'Kafa karışıklığı', solukluk: 'Soluk cilt',
    kanama: 'Kanama', deformite: 'Bacakta şekil bozukluğu', sogukCilt: 'Soğuk cilt', bilincsiz: 'Bilinçsiz', nefesYok: 'Nefes yok',
    basDonmesi: 'Baş dönmesi',
  } as Record<SignId, string>,
};

// ---- case templates ---------------------------------------------------------------------------
/** Abstract protocol step; resolved into a concrete action key (see actionKey) once rules + case are known. */
export type StepId = 'triyaj' | 'o2' | 'cpr' | 'basinc' | `ilac:${DrugRole}` | `poz:${PoseId}` | `olc:${ToolId}`;

export interface CaseTemplate {
  id: string; // 'anafilaksi'
  name: string; // Turkish, shown in the report (never to SP during the case)
  code: string; // 2-letter case code prefix, "AN" → "AN-7"
  base: Record<VitalKey, [number, number]>; // presentation range (severity sev0)
  worst: Vitals; // vitals reached at severity 100
  sev0: [number, number]; // starting severity
  rate: [number, number]; // severity per minute without treatment (negative = recovers alone)
  signs: SignId[];
  lung: LungSound;
  history: Partial<Record<HistoryTopic, string[]>>; // line pools; missing topics fall back to generic
  says: string[]; // patient lines (humor, non-graphic)
  path: StepId[]; // correct interventions (order not enforced — ponytail: add order rules if play needs it)
  useful: ToolId[]; // tests that are never "gereksiz"
  trap?: boolean; // vazovagal etc.: heavy interventions are harmful
  walks: boolean; // triage: can walk → Yeşil
}

// ---- seeded per-session manual rules (the manual renders these, the sim validates against them) ----
export interface RuleSet {
  rev: string; // "Revizyon 2026-Ç3/B"
  variant: 'A' | 'B' | 'C'; // A: no dose exception, B: +1 tık if case number is odd, C: +1 if even
  spo2Thr: number; // SpO₂ below this → Maske-O₂
  o2Level: number; // mask setting 1..4 the manual prescribes
  rrThr: number; // triage: RR above → Kırmızı
  sysThr: number; // triage: systolic below → Kırmızı
  drugs: Record<DrugRole, AmpulColor>; // which ampul does what
  decoy: AmpulColor; // the color with no field use ("yalnız hastanede")
  dose: Record<AgeGroup, number>; // tık by age group (1..3)
  contra: { color: AmpulColor; hrBelow: number }; // "Mavi ampul + nabız < 55 → verme"
  cprRate: number; // compressions per minute the manual asks for (scene judges rhythm)
  rowOrder: string[]; // template ids in the order the symptom table lists them
}

// ---- runtime state ----------------------------------------------------------------------------
export interface Patient {
  name: string;
  age: number;
  grp: AgeGroup;
}

export interface Reading {
  v: number | string; // number for vitals, LungSound for stetoskop
  t: number; // tick taken
}

export interface CaseState {
  tpl: string; // template id
  code: string; // "AN-7" (shown to everyone; the number's parity matters in variant B/C)
  patient: Patient;
  allergy: AmpulColor | null; // revealed by asking 'alerji'; giving it is harmful
  signs: SignId[]; // what SP sees (true signs + red herrings, shuffled)
  herrings: SignId[]; // which of `signs` are red herrings (report screen only)
  history: Record<HistoryTopic, string>; // answers to 'sor'
  teyze: string; // neighbor's advice line (sometimes right, sometimes harmful)
  vitals: Vitals; // true values, updated at 1 Hz (SP's scene shows them only through readings / monitor)
  baseV: Vitals; // rolled presentation vitals (sev0 point of the curve)
  sev: number; // severity 0..100 (≥critSev kritik, ≥arrestSev arrest, 100 kayıp)
  sev0: number; // severity at presentation (the baseV point of the curve)
  rate: number; // severity per minute right now
  status: Status;
  monitor: boolean; // pulse ox attached → live HR/SpO₂ on the monitor
  readings: Partial<Record<ToolId, Reading>>;
  asked: HistoryTopic[];
  required: string[]; // concrete action keys still to do
  done: string[]; // concrete action keys done correctly
  cprGood: number; // good CPR cycles in the current arrest
  harm: number;
  waste: number; // unnecessary tests/interventions
  team: number; // matched PU confirmations
  log: LogEntry[]; // timeline for the report
  startTick: number;
  eta: number; // tick the hospital handover happens automatically
  say: { text: string; t: number } | null; // latest patient line
  okAt: number; // tick since every required step is done and the patient is stabil (0 = not ready to hand over)
}

export interface LogEntry {
  t: number; // seconds since case start
  key: string; // action key or 'status:kritik' etc.
  r: ActResult | 'info';
}
export type ActResult = 'dogru' | 'zararli' | 'gereksiz' | 'tekrar' | 'yanlis';

export interface CaseResult {
  tpl: string;
  code: string;
  outcome: Outcome;
  score: number;
  timeMult: number;
  harm: number;
  waste: number;
  team: number;
  secs: number;
}

export interface PmPlayer {
  id: PlayerId;
  name: string;
  color: number;
  role: Role;
  tabs: TabId[]; // manual tabs this player can open (SP gets all in antrenman, else none)
  connected: boolean;
  bot: boolean;
  seq: number; // last action seq seen
}

export interface Onay {
  key: string; // action key the PU approved
  by: PlayerId;
  t: number; // tick
}

export interface PmState {
  tick: number;
  rng: number;
  mode: ModeId;
  disclaimer: true; // scenes must show DISCLAIMER in the intro and at the top of the manual
  phase: Phase;
  phaseUntil: number; // tick the timed phase (intro/result) ends
  rules: RuleSet;
  players: PmPlayer[];
  caseIdx: number; // 0-based
  cases: number; // cases in this shift
  cur: CaseState | null;
  onay: Onay[]; // live PU approvals (expire after teamWindow)
  results: CaseResult[];
  total: number; // shift score
  busyUntil: number; // SP is busy with a tool until this tick
  ready: PlayerId[]; // pressed 'hazir' in this intro/result (all connected humans → skip the wait)
}

// ---- input ------------------------------------------------------------------------------------
export type Act =
  | { k: 'olc'; t: ToolId } // measure
  | { k: 'sor'; q: HistoryTopic } // ask (SAMPLE)
  | { k: 'triyaj'; c: TriageColor }
  | { k: 'ilac'; c: AmpulColor; n: number } // ampul color + tık count
  | { k: 'o2'; n: number } // mask setting
  | { k: 'poz'; p: PoseId }
  | { k: 'basinc'; q: number } // bleeding-pressure minigame result 0..1
  | { k: 'cpr'; q: number } // one CPR cycle (30 compressions) quality 0..1
  | { k: 'teslim' } // early handover (only once every required step is done)
  | { k: 'onay'; a: string } // PU: approve an action key (team bonus if SP does it within 10 s)
  | { k: 'hazir' }; // skip intro/result wait

export interface PmInput {
  seq: number; // increment per command; the sim applies `act` exactly when seq changes
  act: Act | null;
}
export const EMPTY_INPUT: PmInput = { seq: 0, act: null };

export type PmEvent =
  | { type: 'phase'; phase: Phase }
  | { type: 'case'; idx: number; code: string }
  | { type: 'reading'; tool: ToolId }
  | { type: 'answer'; q: HistoryTopic }
  | { type: 'act'; key: string; r: ActResult; by: PlayerId }
  | { type: 'busy' }
  | { type: 'status'; status: Status }
  | { type: 'say'; text: string }
  | { type: 'onay'; key: string; by: PlayerId }
  | { type: 'team'; key: string }
  | { type: 'result'; result: CaseResult };

/** Canonical key for an action (used by required/done lists, PU approvals and logs). */
export function actionKey(a: Act): string {
  switch (a.k) {
    case 'olc': return `olc:${a.t}`;
    case 'sor': return `sor:${a.q}`;
    case 'triyaj': return `triyaj:${a.c}`;
    case 'ilac': return `ilac:${a.c}:${a.n}`;
    case 'o2': return `o2:${a.n}`;
    case 'poz': return `poz:${a.p}`;
    case 'basinc': return 'basinc';
    case 'cpr': return 'cpr';
    case 'teslim': return 'teslim';
    case 'onay': return `onay:${a.a}`;
    case 'hazir': return 'hazir';
  }
}
