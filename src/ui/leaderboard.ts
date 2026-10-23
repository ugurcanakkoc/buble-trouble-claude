// "En İyiler" panel + compact top-N list for the game-over card.
import { topScores, type ScoreRow } from '../net';
import { h } from './dom';

export function scoreList(rows: ScoreRow[]): HTMLElement {
  if (!rows.length) return h('div', { class: 'hint', text: 'Henüz skor yok' });
  return h('ol', { class: 'scores' },
    h('li', { class: 'head' },
      h('span', { class: 'rank', text: 'Sıra' }),
      h('span', { class: 'who', text: 'Oyuncular' }),
      h('span', { class: 'lvl', text: 'Seviye' }),
      h('span', { class: 'pts', text: 'Skor' }),
    ),
    ...rows.map((r, i) =>
      h('li', {},
        h('span', { class: 'rank', text: `${i + 1}.` }),
        h('span', { class: 'who', text: r.players.join(', ') }),
        h('span', { class: 'lvl', text: String(r.level) }),
        h('span', { class: 'pts', text: String(r.score) }),
      ),
    ),
  );
}

/** Fills `slot` with the top `limit` scores, showing loading / error states. */
export function loadScores(slot: HTMLElement, limit: number): void {
  slot.replaceChildren(h('div', { class: 'hint', text: 'Yükleniyor…' }));
  topScores(limit).then(
    (rows) => slot.replaceChildren(scoreList(rows)),
    (e) => {
      console.warn('topScores failed', e);
      slot.replaceChildren(h('div', { class: 'error', text: 'Yüklenemedi' }));
    },
  );
}

/** Full-screen panel; returns an opener. */
export function createBoardPanel(): { open(): void; el: HTMLElement } {
  const slot = h('div');
  const el = h('div', { class: 'screen board', hidden: true },
    h('div', { class: 'card' },
      h('h2', { class: 'title small', text: 'En İyiler' }),
      slot,
      h('button', { class: 'btn ghost', text: 'Kapat', onclick: () => (el.hidden = true) }),
    ),
  );
  el.addEventListener('pointerdown', (e) => e.target === el && (el.hidden = true));
  return {
    el,
    open() {
      el.hidden = false;
      loadScores(slot, 10);
    },
  };
}
