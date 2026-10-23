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
    return el;
  };

  const root = h('div', { class: 'touch' },
    h('div', { class: 'tgroup move' }, btn('left', '◀', ''), btn('right', '▶', '')),
    h('div', { class: 'tgroup shoot' }, btn('fire', 'ATEŞ', 'fire')),
  );
  const applySwap = () => root.classList.toggle('swap', controlsSwapped());
  applySwap();
  window.addEventListener('controls-swap', applySwap);
  document.body.append(root);
  return {
    state,
    destroy() {
      window.removeEventListener('controls-swap', applySwap);
      root.remove();
    },
  };
}
