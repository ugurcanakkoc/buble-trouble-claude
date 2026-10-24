// Every texture key and sound id Paramedik uses. art.ts must create all TEX keys, sound.ts must play all SFX ids.
import { COLORS, TOOLS, type AmpulColor, type SignId, type ToolId, type AgeGroup } from './types';
import { LABELS } from './types';

const SIGNS = Object.keys(LABELS.sign) as SignId[];
const AGES: AgeGroup[] = ['cocuk', 'yetiskin', 'yasli'];

export const TEX = {
  bg: 'pm_bg_ev', // 960×540 living-room background (MVP: one environment)
  monitor: 'pm_monitor', // vitals monitor frame
  heart: 'pm_heart', // deterioration indicator (tinted by status)
  bag: 'pm_bag', // tool bag
  bubble: 'pm_bubble', // speech bubble
  teyze: 'pm_teyze', // neighbor silhouette
  wound: 'pm_wound', // stylized red icon for bleeding (non-graphic)
  pressure: 'pm_pressure', // bleeding-pressure bar
  cprHands: 'pm_cpr', // CPR hands
  mask: 'pm_mask', // O₂ mask
  patient: (g: AgeGroup) => `pm_patient_${g}`, // supine body, stylized
  chest: (g: AgeGroup) => `pm_chest_${g}`, // breathing overlay
  tool: (t: ToolId) => `pm_tool_${t}`,
  ampul: (c: AmpulColor) => `pm_ampul_${c}`,
  sign: (s: SignId) => `pm_sign_${s}`,
} as const;

/** Flat list of every texture key (for ensureTextures / preload checks). */
export const ALL_TEX: string[] = [
  TEX.bg, TEX.monitor, TEX.heart, TEX.bag, TEX.bubble, TEX.teyze, TEX.wound, TEX.pressure, TEX.cprHands, TEX.mask,
  ...AGES.flatMap((g) => [TEX.patient(g), TEX.chest(g)]),
  ...TOOLS.map(TEX.tool),
  ...COLORS.map(TEX.ampul),
  ...SIGNS.map(TEX.sign),
];

export const SFX = [
  'bip', // monitor beep (pitch from HR via opts.pitch)
  'alarm', // status got worse
  'steto_normal', 'steto_hirilti', 'steto_citirti', 'steto_sessiz', // stethoscope clips
  'cpr_tik', // one compression
  'nefes', // rescue breath
  'tansiyon_pompa',
  'ilac', // ampul applied
  'dogru', // correct intervention
  'hata', // wrong / harmful
  'onay', // PU approval arrived
  'takim', // team bonus
  'mirilti', // patient/teyze "babble" line
  'telsiz', // radio static (case start / handover)
  'teslim', // handover
  'kayip', // patient lost (soft, non-dramatic)
  'ui_tik',
] as const;
export type SfxId = (typeof SFX)[number];
