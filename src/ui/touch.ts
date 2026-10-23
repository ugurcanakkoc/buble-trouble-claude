// On-screen multi-touch controls for any game: one button group per bottom corner, overlaid
// semi-transparently on the full-size game. Sides swap via the "Kontrolleri ters çevir" setting.
// Callers decide whether to mount (see dom.isTouch()).
import { h } from './dom';
import { controlsSwapped } from './settings';
import { clampVec, joyDir, type JoyDir } from './joystick';

export interface TouchButtonSpec {
  id: string;
  label: string;
  size?: 'normal' | 'big' | 'small'; // normal: tall pill, big: Ø100 (pink, e.g. ATEŞ/BOMBA), small: 52px
  shape?: 'pill' | 'circle' | 'square'; // default: normal→pill, big→circle, small→square
}
/**
 * A list of buttons (≤3 in a row, more → 2-column grid), a 4-way d-pad, or a floating joystick (whole side
 * zone, dominant axis only). D-pad and joystick both report ids up/down/left/right.
 */
export type TouchGroup = TouchButtonSpec[] | { dpad: true } | { joystick: true };

export interface TouchControls {
  isDown(id: string): boolean;
  /** cb fires on press (up → down). Returns an unsubscribe. */
  onPress(id: string, cb: () => void): () => void;
  setLabel(id: string, text: string): void;
  setEnabled(id: string, on: boolean): void;
  destroy(): void;
}

/** A tap shorter than this still reads as held for this long, so the sim (60 Hz) always sees it. */
const TAP_MS = 50;
const DPAD: [string, string, string][] = [['up', '▲', 'u'], ['left', '◀', 'l'], ['right', '▶', 'r'], ['down', '▼', 'd']];
const JOY_DIRS: JoyDir[] = ['up', 'down', 'left', 'right'];
const DEFAULT_SHAPE = { normal: 'pill', big: 'circle', small: 'square' } as const;

export function mountTouchControls(spec: { left: TouchGroup; right: TouchGroup }): TouchControls {
  const buttons = new Map<string, { el: HTMLElement; active: Set<number>; press: Set<() => void>; enabled: boolean; tappedAt: number }>();

  const btn = (b: TouchButtonSpec, extra = '') => {
    const size = b.size ?? 'normal';
    const el = h('div', { class: `tbtn ${size} ${b.shape ?? DEFAULT_SHAPE[size]} ${extra}`, text: b.label });
    const st = { el, active: new Set<number>(), press: new Set<() => void>(), enabled: true, tappedAt: -1e9 };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (!st.enabled) return;
      const was = st.active.size > 0;
      st.active.add(e.pointerId);
      st.tappedAt = performance.now();
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

  const onRelease: ((e: Event) => void)[] = [];

  // Floating joystick: the base appears where the thumb lands; tracks only its own pointerId.
  const joystick = () => {
    const knob = h('div', { class: 'jknob' });
    const base = h('div', { class: 'jbase idle' }, knob);
    const zone = h('div', { class: 'tgroup joy' }, base);
    const dirs = new Map(
      JOY_DIRS.map((d) => {
        const st = { el: h('i'), active: new Set<number>(), press: new Set<() => void>(), enabled: true, tappedAt: -1e9 };
        buttons.set(d, st);
        return [d, st] as const;
      }),
    );
    let pid: number | null = null;
    let cx = 0;
    let cy = 0;
    let dir: JoyDir | null = null;
    const set = (d: JoyDir | null) => {
      if (d === dir) return;
      if (dir) dirs.get(dir)!.active.clear();
      dir = d;
      const st = d && dirs.get(d)!;
      if (!st || !st.enabled || pid === null) return;
      st.active.add(pid);
      st.tappedAt = performance.now();
      st.press.forEach((cb) => cb());
    };
    const reset = () => {
      set(null);
      pid = null;
      base.classList.add('idle');
      base.style.left = base.style.top = knob.style.transform = '';
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      const r = base.offsetWidth / 2 || 65;
      const [kx, ky] = clampVec(e.clientX - cx, e.clientY - cy, r);
      knob.style.transform = `translate(${kx}px, ${ky}px)`;
      set(joyDir(e.clientX - cx, e.clientY - cy, r, dir));
    };
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (pid !== null) return;
      pid = e.pointerId;
      try {
        zone.setPointerCapture?.(pid); // keep tracking when the thumb slides out of the zone
      } catch {
        /* pointer already gone */
      }
      const z = zone.getBoundingClientRect();
      cx = e.clientX;
      cy = e.clientY;
      base.classList.remove('idle');
      base.style.left = `${cx - z.left}px`;
      base.style.top = `${cy - z.top}px`;
      move(e);
    });
    zone.addEventListener('pointermove', move);
    zone.addEventListener('contextmenu', (e) => e.preventDefault());
    onRelease.push((e) => {
      if (!(e instanceof PointerEvent) || e.pointerId === pid) reset();
    });
    return zone;
  };

  const group = (g: TouchGroup) => {
    if ('joystick' in g) return joystick();
    if (!Array.isArray(g)) return h('div', { class: 'tgroup dpad' }, ...DPAD.map(([id, label, cls]) => btn({ id, label, size: 'small' }, cls)));
    return h('div', { class: `tgroup${g.length > 3 ? ' grid' : ''}` }, ...g.map((b) => btn(b)));
  };
  const leftEl = group(spec.left);
  const rightEl = group(spec.right);
  const root = h('div', { class: 'touch' }, leftEl, rightEl);

  // Safety net: a release anywhere (or losing focus) always lets go, so a held button can never stick.
  const release = (e: Event) => {
    onRelease.forEach((f) => f(e));
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
    isDown(id) {
      const st = get(id);
      if (!st) return false;
      return st.active.size > 0 || performance.now() - st.tappedAt < TAP_MS;
    },
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
