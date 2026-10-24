// Mutfak Kaosu sfx: synthesized soft tones/noise (ui/audio handles mute). Keep playSfx(id, opts).
import { playNoise, playTone } from '../../ui/audio';
import type { SfxId } from './assets';

export interface SfxOpts {
  vol?: number; // 0..1 multiplier, default 1
  delay?: number; // seconds
}

const tone = (freq: number, dur: number, vol: number, d: number, slideTo = freq, type: OscillatorType = 'sine') =>
  playTone({ freq, slideTo, dur, vol, type, delay: d });
const noise = (dur: number, vol: number, filter: number, d: number) => playNoise({ dur, vol, filter, delay: d });

// Keep highs gentle: mostly sine/triangle under ~1.8 kHz, noise bands <= 2.2 kHz.
const RECIPES: Record<SfxId, (v: number, d: number) => void> = {
  pick: (v, d) => tone(480, 0.07, 0.1 * v, d, 700, 'triangle'),
  place: (v, d) => (tone(300, 0.08, 0.12 * v, d, 220, 'triangle'), noise(0.03, 0.05 * v, 900, d)),
  reject: (v, d) => (tone(200, 0.09, 0.08 * v, d, 160, 'triangle'), tone(160, 0.1, 0.08 * v, d + 0.09, 130, 'triangle')),
  chop: (v, d) => (noise(0.035, 0.22 * v, 1800, d), tone(220, 0.04, 0.1 * v, d, 150, 'triangle')),
  sizzle: (v, d) => { for (let i = 0; i < 3; i++) noise(0.18, 0.05 * v, 2200 - i * 300, d + i * 0.14); },
  ding: (v, d) => (tone(1175, 0.5, 0.1 * v, d), tone(1760, 0.35, 0.04 * v, d)),
  burn: (v, d) => (noise(0.5, 0.16 * v, 600, d), tone(150, 0.4, 0.08 * v, d, 90, 'sawtooth')),
  slice: (v, d) => (noise(0.09, 0.14 * v, 1400, d), noise(0.07, 0.1 * v, 1100, d + 0.1)),
  pour: (v, d) => (tone(520, 0.3, 0.07 * v, d, 880), noise(0.3, 0.07 * v, 1000, d)),
  wash: (v, d) => { for (let i = 0; i < 3; i++) noise(0.14, 0.07 * v, 800 + i * 150, d + i * 0.1); },
  trash: (v, d) => (noise(0.16, 0.14 * v, 350, d), tone(120, 0.14, 0.1 * v, d, 70, 'triangle')),
  bell: (v, d) => (tone(988, 0.45, 0.1 * v, d), tone(1319, 0.35, 0.06 * v, d + 0.02)),
  phone: (v, d) => { for (let i = 0; i < 4; i++) tone(i % 2 ? 740 : 880, 0.09, 0.06 * v, d + i * 0.1, i % 2 ? 740 : 880, 'triangle'); },
  cash: (v, d) => (tone(1046, 0.09, 0.1 * v, d, 1046, 'triangle'), tone(1568, 0.3, 0.1 * v, d + 0.08, 1568, 'triangle')),
  angry: (v, d) => (tone(330, 0.2, 0.07 * v, d, 200, 'triangle'), tone(240, 0.25, 0.07 * v, d + 0.18, 140, 'triangle')),
  pin: (v, d) => (tone(900, 0.04, 0.1 * v, d, 600, 'triangle'), noise(0.03, 0.08 * v, 1500, d)),
  pack: (v, d) => (noise(0.12, 0.1 * v, 1000, d), tone(260, 0.1, 0.08 * v, d + 0.08, 200, 'triangle')),
  scooter: (v, d) => (tone(85, 0.45, 0.05 * v, d, 130, 'sawtooth'), tone(170, 0.45, 0.025 * v, d, 260, 'triangle')),
  deliver: (v, d) => [660, 880, 1175].forEach((f, i) => tone(f, 0.16, 0.09 * v, d + i * 0.07, f, 'triangle')),
  buy: (v, d) => (tone(700, 0.12, 0.09 * v, d, 1000, 'triangle'), tone(1250, 0.2, 0.08 * v, d + 0.1, 1250, 'triangle')),
  dayStart: (v, d) => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 0.09 * v, d + i * 0.11, f, 'triangle')),
  dayEnd: (v, d) => [784, 659, 523, 392].forEach((f, i) => tone(f, 0.24, 0.09 * v, d + i * 0.15, f, 'triangle')),
};

// Voice limit: min gap per sound, and at most 8 sounds per 100 ms overall (4 players can fire events at once).
const MIN_GAP: Partial<Record<SfxId, number>> = { chop: 60, pick: 40, place: 40, sizzle: 500, wash: 250, scooter: 400, reject: 120, slice: 100 };
const last = new Map<SfxId, number>();
let winStart = 0;
let winCount = 0;

/** Plays one sound locally (each device plays its own; call it from sim events). */
export function playSfx(id: SfxId, opts: SfxOpts = {}): void {
  const now = performance.now();
  if (now - (last.get(id) ?? -1e9) < (MIN_GAP[id] ?? 30)) return;
  if (now - winStart > 100) { winStart = now; winCount = 0; }
  if (++winCount > 8) return;
  last.set(id, now);
  RECIPES[id]?.(opts.vol ?? 1, opts.delay ?? 0);
}
