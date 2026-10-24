// Paramedik sounds: soft synth only (no harsh highs), local per device, follows mute via playTone/playNoise.
// Voice limit: each id has a min gap (ms) so snapshot-driven spam cannot pile up voices.
import { playNoise, playTone } from '../../ui/audio';
import type { SfxId } from './assets';

export interface SfxOpts {
  vol?: number; // 0..1 multiplier, default 1
  pitch?: number; // frequency multiplier, default 1 (e.g. 'bip' from heart rate)
}

const GAP: Partial<Record<SfxId, number>> = {
  bip: 120, alarm: 600, cpr_tik: 60, ui_tik: 40, mirilti: 300,
  steto_normal: 400, steto_hirilti: 400, steto_citirti: 400, steto_sessiz: 400,
};
const last: Partial<Record<SfxId, number>> = {};

export function playSfx(id: SfxId, opts: SfxOpts = {}): void {
  const now = performance.now();
  if (now - (last[id] ?? -1e9) < (GAP[id] ?? 80)) return;
  last[id] = now;
  const v = opts.vol ?? 1;
  const p = Math.min(2, Math.max(0.5, opts.pitch ?? 1));
  const tone = (freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.18, slideTo = freq, delay = 0) =>
    playTone({ freq: freq * p, slideTo: slideTo * p, dur, type, vol: vol * v, delay });
  const noise = (dur: number, vol: number, filter: number, delay = 0) => playNoise({ dur, vol: vol * v, filter, delay });
  switch (id) {
    case 'bip': return tone(880, 0.09, 'sine', 0.13); // monitor beep, pitch follows HR
    case 'alarm':
      tone(740, 0.14, 'triangle', 0.14); tone(587, 0.14, 'triangle', 0.14, 587, 0.18);
      return tone(740, 0.14, 'triangle', 0.14, 740, 0.36);
    case 'steto_normal': // lub-dub
      noise(0.09, 0.3, 140); tone(60, 0.1, 'sine', 0.25); noise(0.07, 0.22, 170, 0.28);
      return tone(70, 0.08, 'sine', 0.18, 70, 0.28);
    case 'steto_hirilti': // lub-dub + wheeze whistle
      noise(0.09, 0.22, 150); noise(0.07, 0.18, 170, 0.28); noise(0.5, 0.1, 900, 0.1);
      return tone(520, 0.5, 'sine', 0.035, 600, 0.1);
    case 'steto_citirti': // crackle
      for (let i = 0; i < 7; i++) noise(0.025, 0.14, 1800 + ((i * 331) % 700), i * 0.06 + ((i * 7) % 3) * 0.01);
      return noise(0.08, 0.2, 150);
    case 'steto_sessiz': return noise(0.35, 0.05, 160);
    case 'cpr_tik': noise(0.05, 0.3, 500); return tone(95, 0.07, 'sine', 0.22, 60);
    case 'nefes': noise(0.55, 0.12, 550); return tone(180, 0.5, 'sine', 0.025, 240);
    case 'tansiyon_pompa':
      for (let i = 0; i < 4; i++) noise(0.07, 0.14, 300 + i * 40, i * 0.11);
      return noise(0.35, 0.08, 700, 0.5);
    case 'ilac': tone(900, 0.05, 'triangle', 0.1); tone(1250, 0.07, 'sine', 0.09, 1250, 0.06); return noise(0.12, 0.06, 2200, 0.05);
    case 'dogru': tone(523, 0.1, 'triangle'); return tone(784, 0.18, 'triangle', 0.16, 784, 0.09);
    case 'hata': return tone(260, 0.22, 'triangle', 0.14, 190);
    case 'onay': tone(988, 0.07, 'sine', 0.12); return tone(1318, 0.1, 'sine', 0.1, 1318, 0.07);
    case 'takim':
      tone(523, 0.1, 'triangle'); tone(659, 0.1, 'triangle', 0.15, 659, 0.09); tone(784, 0.1, 'triangle', 0.15, 784, 0.18);
      return tone(1047, 0.25, 'triangle', 0.15, 1047, 0.27);
    case 'mirilti': for (let i = 0; i < 5; i++) tone(260 + ((i * 97) % 140), 0.07, 'triangle', 0.07, 230 + ((i * 53) % 120), i * 0.085); return;
    case 'telsiz': noise(0.2, 0.1, 1400); tone(700, 0.06, 'sine', 0.05, 700, 0.2); return noise(0.12, 0.07, 1600, 0.28);
    case 'teslim': tone(440, 0.14, 'triangle', 0.14); return tone(660, 0.3, 'triangle', 0.14, 660, 0.13);
    case 'kayip': return tone(330, 0.7, 'sine', 0.1, 220);
    case 'ui_tik': return tone(1100, 0.03, 'sine', 0.05);
  }
}
