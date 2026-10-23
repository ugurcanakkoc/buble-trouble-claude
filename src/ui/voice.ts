// Chipmunk "YARDIM" voice: pre-rendered clips in public/sfx/ (made by scripts/make-voice-sfx.ps1),
// decoded into the shared AudioContext. One random variant at a time (never the same twice in a row),
// ±8% playback rate for liveliness. If the clips fail to load, a cute procedural babble plays instead.
import { isMuted, loadBuffer, playBuffer, playTone } from './audio';

const NAMES = ['yardim-1', 'yardim-2', 'yardim-3', 'yardim-4'];

/** Random index in [0, n) that differs from `last` (when n > 1). */
export function pickVariant(n: number, last: number, rnd = Math.random): number {
  if (n <= 1) return 0;
  if (last < 0 || last >= n) return Math.floor(rnd() * n);
  const i = Math.floor(rnd() * (n - 1));
  return i >= last ? i + 1 : i;
}

let clips: AudioBuffer[] = [];
let last = -1;
let playing: AudioBufferSourceNode | null = null;

if (typeof window !== 'undefined') { // ponytail: guard only so unit tests can import pickVariant
  const ext = new Audio().canPlayType('audio/webm; codecs="opus"') ? 'webm' : 'mp3';
  Promise.all(NAMES.map((n) => loadBuffer(`${import.meta.env.BASE_URL}sfx/${n}.${ext}`)))
    .then((bufs) => (clips = bufs.filter((b): b is AudioBuffer => !!b)))
    .catch(() => (clips = []));
}

/** Animal-Crossing-style syllable blips, rising at the end. */
function babble(): void {
  const n = 5 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const f = 900 + Math.random() * 500 + (i === n - 1 ? 500 : 0);
    playTone({ freq: f, slideTo: f * (i === n - 1 ? 1.5 : 1.15), dur: 0.07, type: 'triangle', vol: 0.18, delay: i * 0.085 });
  }
}

export function squeak(): void {
  if (isMuted() || playing) return; // never overlap shouts
  if (!clips.length) return babble();
  last = pickVariant(clips.length, last);
  playing = playBuffer(clips[last], 0.92 + Math.random() * 0.16);
  if (playing) playing.onended = () => (playing = null);
}
