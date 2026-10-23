// Squeaky "chipmunk" voice lines via the browser's own speech synthesis (no audio files):
// a Turkish voice at maximum pitch and a fast rate. Falls back to a little squeak if speech is missing.
import { isMuted, playTone } from './audio';

let trVoice: SpeechSynthesisVoice | null | undefined;

function pickVoice(): SpeechSynthesisVoice | null {
  if (trVoice !== undefined) return trVoice;
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return null; // not loaded yet; try again next time
  trVoice = voices.find((v) => v.lang.toLowerCase().startsWith('tr')) ?? null;
  return trVoice;
}

export function squeak(text: string): void {
  if (isMuted()) return;
  if (!('speechSynthesis' in window)) {
    playTone({ freq: 900, dur: 0.08, type: 'square', vol: 0.15, slideTo: 1400 });
    playTone({ freq: 1100, dur: 0.1, type: 'square', vol: 0.15, slideTo: 1700, delay: 0.1 });
    return;
  }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'tr-TR';
  const v = pickVoice();
  if (v) u.voice = v;
  u.pitch = 2; // max: the chipmunk part
  u.rate = 1.45;
  u.volume = 0.9;
  speechSynthesis.cancel(); // never queue up a backlog of shouts
  speechSynthesis.speak(u);
}
