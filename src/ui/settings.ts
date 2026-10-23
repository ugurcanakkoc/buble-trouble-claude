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

let exitFn: (() => void) | null = null;
let exitHost = false;

/** In-room scenes register how to leave to the menu; null (menu) hides the "Ana menüye dön" button. */
export function setExitHandler(fn: (() => void) | null, isHost = false): void {
  exitFn = fn;
  exitHost = isHost;
  window.dispatchEvent(new Event('exit-handler'));
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
  const exitBtn = h('button', { class: 'btn ghost', text: '🏠 Ana menüye dön', style: 'color:#ff6b6b' });
  const askText = h('div', { class: 'hint' });
  const yes = h('button', { class: 'btn ghost', text: 'Evet, çık', style: 'color:#ff6b6b' });
  const no = h('button', { class: 'btn ghost', text: 'Vazgeç' });
  const ask = h('div', { hidden: true }, h('b', { text: 'Oyundan çıkılsın mı?' }), askText, yes, no);
  const syncExit = () => {
    exitBtn.hidden = !exitFn;
    ask.hidden = true;
    askText.textContent = exitHost ? 'Kurucu sensin: oda kapanır, herkes menüye döner.' : '';
  };
  exitBtn.addEventListener('click', () => {
    exitBtn.hidden = true;
    ask.hidden = false;
  });
  no.addEventListener('click', syncExit);
  yes.addEventListener('click', () => {
    const fn = exitFn;
    exitFn = null; // a second click can't leave twice
    panel.hidden = true;
    syncExit();
    fn?.();
  });
  window.addEventListener('exit-handler', syncExit);
  syncExit();
  const panel = h('div', { class: 'screen settings', hidden: true },
    h('div', { class: 'card' },
      h('h2', { class: 'title small', text: 'Ayarlar' }),
      swap.row,
      h('div', { class: 'hint', text: 'Telefonda: hareket tuşları sağda, ATEŞ solda olur.' }),
      perf.row,
      exitBtn,
      ask,
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
