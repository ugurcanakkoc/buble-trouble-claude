// Small ⚙ settings panel (global, reachable from menu and game).
import { h, load, save } from './dom';

const SWAP_KEY = 'bubble.swapControls';
const STATS_KEY = 'bubble.showStats';
let swapped = load(SWAP_KEY) === '1';
let stats = load(STATS_KEY) !== '0'; // default on for now

export const controlsSwapped = () => swapped;
export const statsVisible = () => stats;

function toggleRow(label: string, value: () => boolean, set: (v: boolean) => void) {
  const input = h('input', { type: 'checkbox', checked: value() });
  input.addEventListener('change', () => set(input.checked));
  return { input, row: h('label', { class: 'switch' }, input, h('span', { text: label })) };
}

/** Mounts the ⚙ button next to the mute toggle (idempotent). */
export function mountSettingsButton(): void {
  if (document.querySelector('.gear')) return;
  const swap = toggleRow('Kontrolleri ters çevir', controlsSwapped, (v) => {
    swapped = v;
    save(SWAP_KEY, v ? '1' : '0');
    window.dispatchEvent(new Event('controls-swap'));
  });
  const perf = toggleRow('Ping/FPS göster', statsVisible, (v) => {
    stats = v;
    save(STATS_KEY, v ? '1' : '0');
  });
  const panel = h('div', { class: 'screen settings', hidden: true },
    h('div', { class: 'card' },
      h('h2', { class: 'title small', text: 'Ayarlar' }),
      swap.row,
      h('div', { class: 'hint', text: 'Telefonda: hareket tuşları sağda, ATEŞ solda olur.' }),
      perf.row,
      h('button', { class: 'btn ghost', text: 'Kapat', onclick: () => (panel.hidden = true) }),
    ),
  );
  panel.addEventListener('pointerdown', (e) => e.target === panel && (panel.hidden = true));
  const btn = h('button', { class: 'mute gear', title: 'Ayarlar', 'aria-label': 'Ayarlar', text: '⚙' });
  btn.addEventListener('click', () => {
    swap.input.checked = swapped;
    perf.input.checked = stats;
    panel.hidden = !panel.hidden;
    btn.blur();
  });
  document.body.append(btn, panel);
}
