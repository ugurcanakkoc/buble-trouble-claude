// Synthesized sound effects (WebAudio, no files) + a remembered mute toggle.
import type { BallSize, PowerUpKind } from '../sim';
import { h, load, save } from './dom';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = load('bubble.muted') === '1';

function ac(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  return ctx;
}

// Browsers only start audio after a user gesture.
const unlock = () => void ac()?.resume();
for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, unlock, { capture: true });

export interface ToneSpec {
  freq: number; // Hz
  dur: number; // seconds
  type?: OscillatorType; // default 'sine'
  vol?: number; // 0..1, default 0.3
  slideTo?: number; // end frequency (exponential slide), default = freq
  delay?: number; // seconds from now
}
export interface NoiseSpec {
  dur: number;
  vol?: number; // default 0.4
  filter?: number; // bandpass center Hz, default 1000
  delay?: number;
}

/** Synth one oscillator blip (no-op while muted or before the first user gesture). */
export function playTone({ freq, dur, type = 'sine', vol = 0.3, slideTo = freq, delay = 0 }: ToneSpec): void {
  const c = ac();
  if (!c || !master || muted || c.state !== 'running') return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Fading white-noise burst through a bandpass (explosions, pops, hits). */
export function playNoise({ dur, vol = 0.4, filter = 1000, delay = 0 }: NoiseSpec): void {
  const c = ac();
  if (!c || !master || muted || c.state !== 'running') return;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = filter;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(c.currentTime + delay);
}

const tone = (type: OscillatorType, freq: number, slideTo: number, dur: number, vol = 0.3, delay = 0) =>
  playTone({ type, freq, slideTo, dur, vol, delay });
const noise = (dur: number, vol: number, filter: number) => playNoise({ dur, vol, filter });

// Balon Avı sounds
export const sfx = {
  shoot() { // harpoon whoosh
    noise(0.14, 0.12, 2200);
    tone('sine', 500, 1500, 0.12, 0.08);
  },
  gun: () => tone('square', 1400, 700, 0.05, 0.08),
  pop(size: BallSize) {
    const base = [700, 480, 330, 220][size] * (0.94 + Math.random() * 0.12); // small ones high, slight detune
    tone('sine', base * 1.6, base * 0.6, 0.16 + size * 0.04, 0.3);
    noise(0.12 + size * 0.05, 0.4, base * 3);
  },
  powerup(kind: PowerUpKind = 'shield') {
    const notes: Record<PowerUpKind, number[]> = {
      shield: [523, 784], clock: [880, 660, 880, 660], dynamite: [330, 262, 196], life: [523, 659, 784, 1047, 1319],
      time: [660, 880, 1100], double: [587, 880], sticky: [440, 554, 659], gun: [784, 988, 1175],
    };
    const wave = kind === 'dynamite' ? 'sawtooth' : 'triangle';
    notes[kind].forEach((f, i) => tone(wave, f, f, 0.12, 0.2, i * 0.06));
  },
  hit() {
    tone('sawtooth', 300, 60, 0.5, 0.3);
    noise(0.3, 0.5, 400);
  },
  trapped() {
    tone('sine', 700, 180, 0.3, 0.28); // bloop
    tone('sine', 350, 120, 0.25, 0.18, 0.12);
  },
  revive() {
    [880, 1175, 1480, 1760, 2349].forEach((f, i) => tone('sine', f, f * 1.03, 0.14, 0.14, i * 0.045)); // sparkle
  },
  combo(n: number) {
    const f = 440 * 2 ** ((n * 2) / 12); // whole-tone step per chain level
    tone('square', f, f * 1.5, 0.12, 0.1);
    tone('triangle', f * 2, f * 2, 0.08, 0.08, 0.04);
  },
  tick: (urgent = false) => tone('square', urgent ? 1300 : 1000, urgent ? 1300 : 1000, 0.04, 0.07),
  bonusTick: () => tone('square', 1500 + Math.random() * 200, 1700, 0.03, 0.05),
  godDrop(size: BallSize) {
    noise(0.35 + size * 0.08, 0.35, 500 + size * 150);
    tone('sine', 900 - size * 120, 180, 0.4, 0.14);
  },
  boo() {
    [330, 311, 294, 262].forEach((f, i) => tone('sawtooth', f, f * 0.9, 0.22, 0.12, i * 0.16));
  },
  shieldBreak: () => tone('triangle', 1200, 300, 0.25, 0.25),
  blockBreak: () => noise(0.2, 0.6, 900),
  levelComplete() {
    [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.12, 0.12, i * 0.08));
    [784, 988, 1175, 1568].forEach((f) => tone('triangle', f, f, 0.5, 0.12, 0.38)); // held chord
  },
  gameOver() {
    [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f * 0.97, 0.3, 0.25, i * 0.22));
    tone('sawtooth', 98, 70, 0.8, 0.14, 0.9);
  },
};

export function isMuted() {
  return muted;
}

/** Mounts the top-right 🔇/🔊 button (idempotent). */
export function mountMuteButton(): void {
  if (document.querySelector('.mute')) return;
  const btn = h('button', { class: 'mute', title: 'Ses', 'aria-label': 'Ses aç/kapat' });
  const paint = () => (btn.textContent = muted ? '🔇' : '🔊');
  paint();
  btn.addEventListener('click', () => {
    muted = !muted;
    save('bubble.muted', muted ? '1' : '0');
    if (master) master.gain.value = muted ? 0 : 0.5;
    paint();
    btn.blur();
  });
  document.body.append(btn);
}
