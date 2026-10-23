import Phaser from 'phaser';
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
      session.startGame(startPayload(session));
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
        h('div', { class: 'card' },
          h('div', { class: 'hint', text: 'Oda kodu' }),
          h('div', { class: 'code-big', text: session.code }),
          copy,
          list,
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
