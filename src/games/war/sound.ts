// Çağlar Savaşı sfx: synthesized per age via ui/audio (which handles mute). Battle sounds go through a
// voice limiter (per-key gap + a global budget) so 30 fighting units don't turn into noise; UI cues,
// fanfares and stingers bypass the budget. Volumes stay low and filters below ~2.5 kHz (no harsh highs).
import { playNoise, playTone, type ToneSpec } from '../../ui/audio';

const tone = (freq: number, slideTo: number, dur: number, vol: number, type: ToneSpec['type'] = 'triangle', delay = 0) =>
  playTone({ freq, slideTo, dur, vol, type, delay });
const noise = (dur: number, vol: number, filter: number, delay = 0) => playNoise({ dur, vol, filter, delay });

const BUDGET = 7; // battle voices per window
const WINDOW = 180; // ms
let last: Record<string, number> = {};
let recent: number[] = [];

/** Plays f unless the same key played < gap ms ago or the global battle budget is used up. */
function voice(key: string, gap: number, f: () => void): void {
  const now = performance.now();
  if (now - (last[key] ?? -1e9) < gap) return;
  recent = recent.filter((t) => now - t < WINDOW);
  if (recent.length >= BUDGET) return;
  recent.push(now);
  last[key] = now;
  f();
}

export function resetSfx(): void {
  last = {};
  recent = [];
}

// [age] melee hit, ranged shot, heavy attack
const MELEE = [
  () => { tone(150, 60, 0.12, 0.16, 'sine'); noise(0.06, 0.18, 320); }, // club thud
  () => { tone(1250, 1180, 0.14, 0.05); tone(1870, 1800, 0.1, 0.025); noise(0.03, 0.08, 2200); }, // sword clang
  () => { tone(1000, 900, 0.1, 0.04); noise(0.05, 0.12, 1600); }, // rapier
  () => { noise(0.05, 0.16, 900); tone(200, 90, 0.08, 0.08, 'sine'); }, // bayonet / punch
  () => { tone(520, 1040, 0.08, 0.05); tone(260, 180, 0.12, 0.06, 'sine'); }, // energy blade
];
const RANGED = [
  () => noise(0.08, 0.12, 800), // sling whoosh
  () => tone(620, 380, 0.08, 0.06), // bow twang
  () => { noise(0.12, 0.26, 1200); tone(180, 60, 0.1, 0.08, 'sine'); }, // musket crack
  () => noise(0.045, 0.16, 1500), // rifle / MG
  () => tone(1100, 280, 0.12, 0.06), // laser zap
];
const HEAVY = [
  () => { tone(110, 45, 0.2, 0.18, 'sine'); noise(0.12, 0.2, 250); }, // dino stomp
  () => { tone(900, 820, 0.18, 0.05); noise(0.08, 0.15, 500); }, // knight
  () => { noise(0.3, 0.32, 220); tone(110, 35, 0.3, 0.16, 'sine'); }, // cannon
  () => { noise(0.35, 0.34, 160); tone(90, 30, 0.35, 0.18, 'sine'); }, // tank
  () => { tone(300, 70, 0.3, 0.08); noise(0.2, 0.2, 400); }, // war machine
];
const TURRET = [
  () => { tone(240, 120, 0.1, 0.1, 'sine'); noise(0.06, 0.12, 500); },
  () => noise(0.18, 0.18, 600),
  () => { noise(0.25, 0.28, 200); tone(120, 40, 0.25, 0.14, 'sine'); },
  () => noise(0.06, 0.16, 1300),
  () => { tone(800, 200, 0.16, 0.06); tone(160, 90, 0.16, 0.06, 'sine'); },
];
// special ability: start cue + one impact
const SPECIAL = [
  () => { tone(500, 70, 1.1, 0.1, 'sine'); noise(0.9, 0.12, 450); }, // meteor whoosh
  () => { for (let i = 0; i < 8; i++) noise(0.05, 0.08, 1800, i * 0.05); }, // arrow volley swish
  () => [0, 0.18, 0.36].forEach((d) => tone(160, 50, 0.25, 0.12, 'sine', d)), // artillery salvo
  () => { tone(140, 95, 1.6, 0.06); noise(1.4, 0.06, 300); }, // airstrike drone
  () => { tone(80, 84, 2.0, 0.07, 'sawtooth'); tone(160, 168, 2.0, 0.05, 'sine'); }, // laser beam hum
];
const IMPACT = [
  () => { noise(0.4, 0.4, 160); tone(130, 40, 0.35, 0.18, 'sine'); },
  () => noise(0.05, 0.1, 1400),
  () => { noise(0.3, 0.36, 180); tone(110, 35, 0.3, 0.14, 'sine'); },
  () => { noise(0.35, 0.4, 140); tone(100, 30, 0.35, 0.16, 'sine'); },
  () => { tone(600, 300, 0.1, 0.04); noise(0.08, 0.1, 700); },
];

export const sfx = {
  attack(age: number, role: string, onScreen: boolean) {
    if (!onScreen) return;
    const set = role === 'heavy' || role === 'super' ? HEAVY : role === 'ranged' ? RANGED : MELEE;
    voice(`a${role}${age}`, role === 'heavy' ? 140 : 80, set[age]);
  },
  turret: (age: number) => voice(`t${age}`, 110, TURRET[age]),
  death: () => voice('d', 90, () => { tone(240, 80, 0.2, 0.07); noise(0.1, 0.1, 400); }),
  baseHit: () => voice('b', 220, () => noise(0.18, 0.24, 200)),
  impact: (age: number) => voice(`i${age}`, age === 1 ? 40 : 90, IMPACT[age]),
  special: (age: number) => SPECIAL[age](),
  /** soft two-tone alarm; callers throttle (the sim emits it at most every 5 s) */
  alarm: () => [0, 0.22, 0.44].forEach((d, i) => tone(i % 2 ? 520 : 660, i % 2 ? 520 : 660, 0.18, 0.09, 'triangle', d)),
  evolve: () => [392, 523, 659, 784].forEach((f, i) => tone(f, f, i === 3 ? 0.45 : 0.16, 0.13, 'triangle', i * 0.1)),
  foeEvolve: () => [330, 311, 262].forEach((f, i) => tone(f, f, 0.22, 0.1, 'triangle', i * 0.13)),
  good: () => [659, 880].forEach((f, i) => tone(f, f, 0.14, 0.1, 'triangle', i * 0.08)),
  click: () => tone(900, 900, 0.04, 0.1),
  deny: () => tone(200, 140, 0.15, 0.08, 'square'),
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.22, 0.2, 'triangle', i * 0.12));
    [523, 659, 784].forEach((f) => tone(f, f, 0.9, 0.1, 'triangle', 0.5));
  },
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, f * 0.97, i === 3 ? 0.7 : 0.3, 0.2, 'triangle', i * 0.22)),
};
