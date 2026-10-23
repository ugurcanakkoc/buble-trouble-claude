// "En İyiler" panel + compact top-N list for the game-over card.
import { headToHead, recentMatches, tally, topScores, type MatchRow, type ScoreRow } from '../net';
import { GAMES, getGame, isPlayable } from '../games/registry';
import type { GameId } from '../games/types';
import { h } from './dom';
import { defaultOpponent, fmtDate, fmtDuration, h2hText, winPct } from './scoreFormat';

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

/** Full-screen "Skor Tablosu": per-game tabs with ranking, head-to-head and recent matches. */
export function createBoardPanel(ctx: { game(): GameId; user(): string }): { open(): void; el: HTMLElement } {
  const tabs = h('div', { class: 'tabs' });
  const body = h('div', { class: 'board-body' });
  const el = h('div', { class: 'screen board', hidden: true },
    h('div', { class: 'card board-card' },
      h('h2', { class: 'title small', text: '🏆 Skor Tablosu' }),
      tabs,
      body,
      h('button', { class: 'btn ghost', text: 'Kapat', onclick: () => (el.hidden = true) }),
    ),
  );
  el.addEventListener('pointerdown', (e) => e.target === el && (el.hidden = true));

  let seq = 0;
  const show = (game: GameId) => {
    const my = ++seq;
    for (const t of tabs.children) t.classList.toggle('on', (t as HTMLElement).dataset.id === game);
    body.replaceChildren(h('div', { class: 'hint', text: 'Yükleniyor…' }));
    recentMatches(game, 200).then(
      (rows) => my === seq && body.replaceChildren(...renderGame(game, rows, ctx.user())),
      (e) => {
        console.warn('recentMatches failed', e);
        if (my === seq) body.replaceChildren(h('div', { class: 'error', text: 'Yüklenemedi' }));
      },
    );
  };
  for (const g of GAMES.filter((x) => isPlayable(x.id))) {
    const b = h('button', { class: 'tab', text: `${g.icon} ${g.title}`, onclick: () => show(g.id) });
    b.dataset.id = g.id;
    tabs.append(b);
  }
  return { el, open() { el.hidden = false; show(ctx.game()); } };
}

function renderGame(game: GameId, rows: MatchRow[], me: string): HTMLElement[] {
  const out: HTMLElement[] = [];
  const t = tally(rows);
  if (!rows.length) out.push(h('div', { class: 'hint', text: 'Henüz maç yok — ilk galibiyeti sen al!' }));
  else {
    out.push(h('ol', { class: 'scores' },
      h('li', { class: 'head' },
        h('span', { class: 'rank', text: 'Sıra' }), h('span', { class: 'who', text: 'Oyuncu' }),
        h('span', { class: 'lvl', text: 'Gal.' }), h('span', { class: 'lvl', text: 'Maç' }), h('span', { class: 'pts', text: '%' })),
      ...t.map((p, i) => h('li', { class: p.name === me ? 'me' : '' },
        h('span', { class: 'rank', text: `${i + 1}.` }), h('span', { class: 'who', text: p.name }),
        h('span', { class: 'lvl', text: String(p.wins) }), h('span', { class: 'lvl', text: String(p.played) }),
        h('span', { class: 'pts', text: `%${winPct(p)}` })),
      ),
    ));
    const names = t.map((p) => p.name);
    if (names.length >= 2) {
      const mk = () => h('select', { class: 'sel' }, ...names.map((n) => h('option', { value: n, text: n })));
      const a = mk(), b = mk();
      const a0 = names.includes(me) ? me : names[0];
      a.value = a0;
      b.value = defaultOpponent(rows, a0, names) ?? names.find((n) => n !== a0)!;
      const res = h('div', { class: 'h2h-res' });
      const upd = () => (res.textContent = a.value === b.value ? 'Farklı iki oyuncu seç' : h2hText(a.value, b.value, headToHead(rows, a.value, b.value)));
      a.onchange = b.onchange = upd;
      upd();
      out.push(h('h3', { class: 'sub', text: 'Kafa kafaya' }), h('div', { class: 'h2h' }, a, h('span', { text: 'vs' }), b), res);
    }
    const modes = getGame(game).modes;
    out.push(h('h3', { class: 'sub', text: 'Son maçlar' }), h('ul', { class: 'recent' },
      ...rows.slice(0, 8).map((r) => {
        const who = h('span', { class: 'who' });
        r.players.forEach((p, i) => who.append(i ? ', ' : '', r.winners.includes(p) ? h('b', { text: p }) : p));
        return h('li', {},
          h('span', { class: 'when', text: fmtDate(r.created_at) }),
          h('span', { class: 'mode-l', text: modes.find((m) => m.id === r.mode)?.label ?? r.mode }),
          who,
          h('span', { class: 'dur', text: fmtDuration(r.duration_s) }));
      })));
  }
  if (game === 'bubble') {
    const slot = h('div');
    out.push(h('h3', { class: 'sub', text: 'Klasik rekorlar' }), slot);
    loadScores(slot, 5);
  }
  return out;
}
