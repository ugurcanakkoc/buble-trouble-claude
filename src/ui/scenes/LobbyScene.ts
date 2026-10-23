import Phaser from 'phaser';
import type { GameMode } from '../../sim';
import type { LobbyPlayer, RoomSession } from '../../net';
import { cssColor, h, mount, toast } from '../dom';
import { startPayload } from '../loop';
import { addBackdrop } from './backdrop';

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super('Lobby');
  }

  create({ session }: { session: RoomSession }): void {
    addBackdrop(this, 2);

    const list = h('ul', { class: 'players' });
    const start = h('button', { class: 'btn green big', text: 'Başlat' });
    const copy = h('button', { class: 'btn ghost', text: 'Kopyala' });
    const leave = h('button', { class: 'btn ghost', text: 'Ayrıl' });

    // host-only mode picker
    let mode: GameMode = 'classic';
    const cards: Record<GameMode, HTMLButtonElement> = {
      classic: modeCard('🎈', 'Klasik', 'Sonsuz seviye'),
      god: modeCard('☁️', 'Tanrı', 'Biri top yağdırır, sırayla herkes tanrı olur'),
      rain: modeCard('🌧️', 'Yağmur', 'Herkes aynı takım, toplar yukarıdan yağar'),
    };
    const pick = (m: GameMode) => {
      mode = m;
      for (const [k, el] of Object.entries(cards)) el.classList.toggle('on', k === m);
    };
    for (const [k, el] of Object.entries(cards)) el.onclick = () => !el.disabled && pick(k as GameMode);
    pick('classic');

    const render = (players: LobbyPlayer[]) => {
      list.replaceChildren(
        ...players.map((p) =>
          h('li', {},
            h('span', { class: 'dot', style: `background:${cssColor(p.color)}` }),
            h('span', { text: p.name }),
            p.id === session.self.id ? h('span', { class: 'me', text: '(sen)' }) : '',
            p.isHost ? h('span', { class: 'tag', text: '(kurucu)' }) : '',
          ),
        ),
      );
      const solo = players.length < 2;
      cards.god.disabled = solo;
      cards.god.querySelector('small')!.textContent = solo ? 'En az 2 kişi' : 'Biri top yağdırır, sırayla herkes tanrı olur';
      if (solo && mode === 'god') pick('classic');
      start.disabled = players.length < 1;
    };
    render(session.players());

    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(session.code);
        copy.textContent = 'Kopyalandı!';
      } catch {
        copy.textContent = session.code;
      }
      setTimeout(() => (copy.textContent = 'Kopyala'), 1500);
    };
    start.onclick = () => {
      start.disabled = true;
      session.startGame(startPayload(session, 0, mode));
    };
    leave.onclick = async () => {
      leave.disabled = true;
      await session.leave().catch(() => {});
      this.scene.start('Menu');
    };

    const offs = [
      session.onPlayersChange(render),
      session.onStart((payload) => this.scene.start('Game', { session, payload })),
    ];
    if (!session.isHost) {
      offs.push(
        session.onHostLeft(() => {
          toast('Oda kurucusu ayrıldı');
          void session.leave().catch(() => {});
          this.scene.start('Menu');
        }),
      );
    }

    const unmount = mount(
      h('div', { class: 'screen' },
        h('div', { class: 'card wide' },
          h('div', { class: 'hint', text: 'Oda kodu' }),
          h('div', { class: 'code-big', text: session.code }),
          copy,
          list,
          session.isHost
            ? h('div', { class: 'modes' }, cards.classic, cards.god, cards.rain)
            : h('div', { class: 'hint', text: 'Mod kurucu tarafından seçilir' }),
          session.isHost ? start : h('div', { class: 'hint', text: 'Kurucunun başlatması bekleniyor…' }),
          leave,
        ),
      ),
    );
    this.events.once('shutdown', () => {
      offs.forEach((off) => off());
      unmount();
    });
  }
}

function modeCard(icon: string, title: string, desc: string): HTMLButtonElement {
  return h('button', { class: 'mode' }, h('span', { class: 'icon', text: icon }), h('b', { text: title }), h('small', { text: desc }));
}
