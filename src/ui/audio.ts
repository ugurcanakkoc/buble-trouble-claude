// Synthesized sound effects (WebAudio, no files) + a remembered mute toggle.
import type { BallSize } from '../sim';
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

function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol = 0.3, delay = 0) {
  const c = ac();
  if (!c || !master || muted || c.state !== 'running') return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, freq: number) {
  const c = ac();
  if (!c || !master || muted || c.state !== 'running') return;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start();
}

export const sfx = {
  shoot: () => tone('square', 880, 1760, 0.09, 0.12),
  gun: () => tone('square', 1400, 700, 0.05, 0.08),
  pop(size: BallSize) {
    const base = [700, 480, 330, 220][size];
    tone('sine', base * 1.6, base * 0.6, 0.16 + size * 0.04, 0.35);
    noise(0.12 + size * 0.05, 0.4, base * 3);
  },
  powerup() {
    [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.12, 0.22, i * 0.06));
  },
  hit() {
    tone('sawtooth', 300, 60, 0.5, 0.3);
    noise(0.3, 0.5, 400);
  },
  trapped() {
    tone('sine', 600, 200, 0.35, 0.25);
    tone('sine', 900, 300, 0.35, 0.12, 0.05);
  },
  revive() {
    [440, 660, 880].forEach((f, i) => tone('triangle', f, f * 1.05, 0.1, 0.22, i * 0.05));
  },
  combo(n: number) {
    tone('square', 500 + n * 120, 900 + n * 160, 0.12, 0.1);
  },
  shieldBreak: () => tone('triangle', 1200, 300, 0.25, 0.25),
  blockBreak: () => noise(0.2, 0.6, 900),
  levelComplete() {
    [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.14, 0.12, i * 0.1));
  },
  gameOver() {
    [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f * 0.97, 0.3, 0.25, i * 0.22));
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
