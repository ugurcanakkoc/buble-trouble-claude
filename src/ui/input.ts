// Keyboard + touch -> InputState. Plain DOM listeners (not Phaser keys) so typing in the
// overlay's text fields is never swallowed.
import { EMPTY_INPUT, type InputState } from '../sim';
import { isTouch } from './dom';
import { mountTouchControls } from './touch';

type Action = 'left' | 'right' | 'fire';
const KEYS: Record<string, Action> = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'fire', KeyZ: 'fire', ArrowUp: 'fire',
};

export function createControls(): { read(): InputState; setFireLabel(text: string): void; destroy(): void } {
  const down = new Set<string>();
  const tappedAt = new Map<string, number>(); // a key tap shorter than a sim step still counts (50 ms)
  const onDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || !(e.code in KEYS)) return;
    e.preventDefault();
    down.add(e.code);
    tappedAt.set(e.code, performance.now());
  };
  const onUp = (e: KeyboardEvent) => down.delete(e.code);
  const clear = () => down.clear();
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', clear);
  const touch = isTouch()
    ? mountTouchControls({
        left: [{ id: 'left', label: '◀' }, { id: 'right', label: '▶' }],
        right: [{ id: 'fire', label: 'ATEŞ', size: 'big' }],
      })
    : null;

  let fireLabel = 'ATEŞ';
  return {
    setFireLabel(text) {
      if (text === fireLabel) return;
      fireLabel = text;
      touch?.setLabel('fire', text);
    },
    read() {
      const s: InputState = { ...EMPTY_INPUT };
      const now = performance.now();
      for (const [code, t] of tappedAt) if (now - t < 50) s[KEYS[code]] = true;
      for (const code of down) s[KEYS[code]] = true;
      if (touch) for (const k of ['left', 'right', 'fire'] as const) s[k] ||= touch.isDown(k);
      return s;
    },
    destroy() {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', clear);
      touch?.destroy();
    },
  };
}
