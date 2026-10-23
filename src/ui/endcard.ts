// Generic game-over overlay: title, a few lines (and/or a custom body), host restart + menu.
import { h, mount } from './dom';

export interface EndCardOptions {
  title: string;
  lines: string[];
  body?: HTMLElement; // optional rich content under the lines (tables, stats)
  isHost: boolean;
  onRestart(): void; // host only ("Tekrar Oyna"); usually session.startGame(startPayload(session, mode))
  onMenu(): void;
}

/** Mounts the end card; returns a function that removes it. */
export function showEndCard(o: EndCardOptions): () => void {
  const again = h('button', { class: 'btn green big', text: 'Tekrar Oyna' });
  again.onclick = () => {
    again.disabled = true;
    o.onRestart();
  };
  return mount(
    h('div', { class: 'screen endcard' },
      h('div', { class: 'card' },
        h('h1', { class: 'title', text: o.title }),
        ...o.lines.map((t) => h('div', { class: 'endline', text: t })),
        ...(o.body ? [o.body] : []),
        o.isHost ? again : h('div', { class: 'hint', text: 'Kurucu yeni oyunu başlatabilir…' }),
        h('button', { class: 'btn ghost', text: 'Menü', onclick: () => o.onMenu() }),
      ),
    ),
  );
}
