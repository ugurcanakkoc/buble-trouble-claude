// Small ⚙ settings panel (global, reachable from menu and game). Only setting: swap touch sides.
import { h, load, save } from './dom';

const SWAP_KEY = 'bubble.swapControls';
let swapped = load(SWAP_KEY) === '1';

export const controlsSwapped = () => swapped;

function setSwapped(v: boolean) {
  swapped = v;
  save(SWAP_KEY, v ? '1' : '0');
  window.dispatchEvent(new Event('controls-swap'));
}

/** Mounts the ⚙ button next to the mute toggle (idempotent). */
export function mountSettingsButton(): void {
  if (document.querySelector('.gear')) return;
  const toggle = h('input', { type: 'checkbox', checked: swapped });
  toggle.addEventListener('change', () => setSwapped(toggle.checked));
  const panel = h('div', { class: 'screen settings', hidden: true },
    h('div', { class: 'card' },
      h('h2', { class: 'title small', text: 'Ayarlar' }),
      h('label', { class: 'switch' }, toggle, h('span', { text: 'Kontrolleri ters çevir' })),
      h('div', { class: 'hint', text: 'Telefonda: hareket tuşları sağda, ATEŞ solda olur.' }),
      h('button', { class: 'btn ghost', text: 'Kapat', onclick: () => (panel.hidden = true) }),
    ),
  );
  panel.addEventListener('pointerdown', (e) => e.target === panel && (panel.hidden = true));
  const btn = h('button', { class: 'mute gear', title: 'Ayarlar', 'aria-label': 'Ayarlar', text: '⚙' });
  btn.addEventListener('click', () => {
    toggle.checked = swapped;
    panel.hidden = !panel.hidden;
    btn.blur();
  });
  document.body.append(btn, panel);
}
