// On-screen multi-touch controls: ◀ ▶ grouped on one side, a big ATEŞ on the other.
// DOM, fixed to the viewport corners (outside the letterboxed play area on wide phones).
// Sides swap via the "Kontrolleri ters çevir" setting (pure CSS class).
import { h } from './dom';
import { controlsSwapped } from './settings';

export interface TouchState {
  left: boolean;
  right: boolean;
  fire: boolean;
}

export function createTouchControls(): { state: TouchState; destroy(): void } {
  const state: TouchState = { left: false, right: false, fire: false };
  const all: { active: Set<number>; sync(): void }[] = [];
  // Safety net: a release anywhere (or losing focus) always lets go, so a held ATEŞ
  // (god charging) can never get stuck down.
  const release = (e: Event) => {
    for (const b of all) {
      if (e instanceof PointerEvent) b.active.delete(e.pointerId);
      else b.active.clear();
      b.sync();
    }
  };

  const btn = (key: keyof TouchState, label: string, cls: string) => {
    const el = h('div', { class: `tbtn ${cls}`, text: label });
    const active = new Set<number>();
    const sync = () => {
      state[key] = active.size > 0;
      el.classList.toggle('on', state[key]);
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      active.add(e.pointerId);
      el.releasePointerCapture?.(e.pointerId); // sliding a finger off releases the button
      sync();
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
      el.addEventListener(ev, (e) => {
        active.delete(e.pointerId);
        sync();
      });
    }
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    all.push({ active, sync });
    return el;
  };

  const root = h('div', { class: 'touch' },
    h('div', { class: 'tgroup move' }, btn('left', '◀', ''), btn('right', '▶', '')),
    h('div', { class: 'tgroup shoot' }, btn('fire', 'ATEŞ', 'fire')),
  );
  // Narrow #app into the space between the gutters (CSS), then make Phaser refit to it.
  const refit = () => window.dispatchEvent(new Event('resize'));
  const applySwap = () => {
    root.classList.toggle('swap', controlsSwapped());
    document.body.classList.toggle('swapped', controlsSwapped());
    refit();
  };
  document.body.classList.add('controls');
  applySwap();
  window.addEventListener('controls-swap', applySwap);
  const globals = ['pointerup', 'pointercancel', 'blur'] as const;
  for (const ev of globals) window.addEventListener(ev, release);
  document.body.append(root);
  return {
    state,
    destroy() {
      window.removeEventListener('controls-swap', applySwap);
      for (const ev of globals) window.removeEventListener(ev, release);
      root.remove();
      document.body.classList.remove('controls', 'swapped');
      refit();
    },
  };
}
