// On-screen multi-touch controls for any game: one button group per bottom corner, overlaid
// semi-transparently on the full-size game. Sides swap via the "Kontrolleri ters çevir" setting.
// Callers decide whether to mount (see dom.isTouch()).
import { h } from './dom';
import { controlsSwapped } from './settings';

export interface TouchButtonSpec {
  id: string;
  label: string;
  size?: 'normal' | 'big' | 'small'; // normal: tall pill, big: Ø100 (pink, e.g. ATEŞ/BOMBA), small: 52px
  shape?: 'pill' | 'circle' | 'square'; // default: normal→pill, big→circle, small→square
}
/** A list of buttons (≤3 in a row, more → 2-column grid), or a 4-way d-pad: ids up/down/left/right. */
export type TouchGroup = TouchButtonSpec[] | { dpad: true };

export interface TouchControls {
  isDown(id: string): boolean;
  /** cb fires on press (up → down). Returns an unsubscribe. */
  onPress(id: string, cb: () => void): () => void;
  setLabel(id: string, text: string): void;
  setEnabled(id: string, on: boolean): void;
  destroy(): void;
}

const DPAD: [string, string, string][] = [['up', '▲', 'u'], ['left', '◀', 'l'], ['right', '▶', 'r'], ['down', '▼', 'd']];
const DEFAULT_SHAPE = { normal: 'pill', big: 'circle', small: 'square' } as const;

export function mountTouchControls(spec: { left: TouchGroup; right: TouchGroup }): TouchControls {
  const buttons = new Map<string, { el: HTMLElement; active: Set<number>; press: Set<() => void>; enabled: boolean }>();

  const btn = (b: TouchButtonSpec, extra = '') => {
    const size = b.size ?? 'normal';
    const el = h('div', { class: `tbtn ${size} ${b.shape ?? DEFAULT_SHAPE[size]} ${extra}`, text: b.label });
    const st = { el, active: new Set<number>(), press: new Set<() => void>(), enabled: true };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!st.enabled) return;
      const was = st.active.size > 0;
      st.active.add(e.pointerId);
      sync(st);
      if (!was) st.press.forEach((cb) => cb());
      try {
        el.releasePointerCapture?.(e.pointerId); // sliding a finger off releases the button
      } catch {
        /* pointer already gone */
      }
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
      el.addEventListener(ev, (e) => {
        st.active.delete(e.pointerId);
        sync(st);
      });
    }
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    buttons.set(b.id, st);
    return el;
  };
  const sync = (st: { el: HTMLElement; active: Set<number> }) => st.el.classList.toggle('on', st.active.size > 0);

  const group = (g: TouchGroup) => {
    if (!Array.isArray(g)) return h('div', { class: 'tgroup dpad' }, ...DPAD.map(([id, label, cls]) => btn({ id, label, size: 'small' }, cls)));
    return h('div', { class: `tgroup${g.length > 3 ? ' grid' : ''}` }, ...g.map((b) => btn(b)));
  };
  const leftEl = group(spec.left);
  const rightEl = group(spec.right);
  const root = h('div', { class: 'touch' }, leftEl, rightEl);

  // Safety net: a release anywhere (or losing focus) always lets go, so a held button can never stick.
  const release = (e: Event) => {
    for (const st of buttons.values()) {
      if (e instanceof PointerEvent) st.active.delete(e.pointerId);
      else st.active.clear();
      sync(st);
    }
  };
  const layout = () => {
    const swap = controlsSwapped();
    const [l, r] = swap ? [rightEl, leftEl] : [leftEl, rightEl];
    l.className = l.className.replace(/ ?side-\w+/g, '') + ' side-l';
    r.className = r.className.replace(/ ?side-\w+/g, '') + ' side-r';
  };
  const globals = ['pointerup', 'pointercancel', 'blur'] as const;
  for (const ev of globals) window.addEventListener(ev, release);
  window.addEventListener('controls-swap', layout);
  document.body.append(root);
  layout();

  const get = (id: string) => buttons.get(id);
  return {
    isDown: (id) => (get(id)?.active.size ?? 0) > 0,
    onPress(id, cb) {
      const st = get(id);
      st?.press.add(cb);
      return () => void st?.press.delete(cb);
    },
    setLabel(id, text) {
      const st = get(id);
      if (st) st.el.textContent = text;
    },
    setEnabled(id, on) {
      const st = get(id);
      if (!st) return;
      st.enabled = on;
      st.el.classList.toggle('off', !on);
      if (!on) {
        st.active.clear();
        sync(st);
      }
    },
    destroy() {
      window.removeEventListener('controls-swap', layout);
      for (const ev of globals) window.removeEventListener(ev, release);
      root.remove();
    },
  };
}
