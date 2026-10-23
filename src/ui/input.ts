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

export function createControls(): { read(): InputState; destroy(): void } {
  const down = new Set<string>();
  const onDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || !(e.code in KEYS)) return;
    e.preventDefault();
    down.add(e.code);
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

  return {
    read() {
      const s: InputState = { ...EMPTY_INPUT };
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
