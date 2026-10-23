import { setExitHandler } from '../settings';
import Phaser from 'phaser';
import type { LobbyPlayer, RoomSession } from '../../net';
import { getGame } from '../../games/registry';
import type { ModeDef } from '../../games/types';
import { cssColor, h, mount, toast } from '../dom';
import { shareInvite } from '../invite';
import { startPayload } from '../loop';
import { addBackdrop } from './backdrop';

export class LobbyScene extends Phaser.Scene {
  constructor() {
    super('Lobby');
  }

  create({ session }: { session: RoomSession }): void {
    addBackdrop(this, 2);
    const game = getGame(session.game);

    const list = h('ul', { class: 'players' });
    const count = h('span', { class: 'count' });
    const start = h('button', { class: 'btn green big', text: 'Başlat' });
    const invite = h('button', { class: 'btn cyan', text: '📨 Davet linki gönder' });
    const leave = h('button', { class: 'btn ghost', text: 'Ayrıl' });

    // host-only mode picker (modes from the GameDef, gated by minPlayers)
    let mode = game.modes[0].id;
    const cards = game.modes.map((m) => ({ m, el: modeCard(m) }));
    const pick = (id: string) => {
      mode = id;
      for (const c of cards) c.el.classList.toggle('on', c.m.id === id);
    };
    for (const c of cards) c.el.onclick = () => !c.el.disabled && pick(c.m.id);
    pick(mode);

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
      count.textContent = `${players.length}/${game.maxPlayers}`;
      for (const { m, el } of cards) {
        const short = players.length < m.minPlayers;
        el.disabled = short;
        el.querySelector('small')!.textContent = short ? `En az ${m.minPlayers} kişi` : m.desc;
      }
      const current = cards.find((c) => c.m.id === mode)!;
      if (current.el.disabled) pick(cards.find((c) => !c.el.disabled)?.m.id ?? mode);
      start.disabled = players.length < game.minPlayers || cards.every((c) => c.el.disabled);
    };
    render(session.players());

    invite.onclick = async () => {
      const r = await shareInvite(session.code, game.title);
      if (r === 'copied') toast('Davet linki kopyalandı, arkadaşına yapıştır');
      else if (r === 'failed') toast(`Oda kodu: ${session.code}`);
    };
    start.onclick = () => {
      start.disabled = true;
      session.startGame(startPayload(session, mode));
    };
    leave.onclick = async () => {
      leave.disabled = true;
      await session.leave().catch(() => {});
      this.scene.start('Menu');
    };

    const offs = [
      session.onPlayersChange(render),
      session.onStart((payload) => this.scene.start(getGame(payload.game ?? session.game).sceneKey, { session, payload })),
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
        h('div', { class: 'card wide lobby' },
          h('div', { class: 'col' },
            h('div', { class: 'game-head' }, h('span', { text: game.icon }), h('b', { text: game.title })),
            h('div', { class: 'hint', text: 'Oda kodu' }),
            h('div', { class: 'code-big', text: session.code }),
            invite,
            h('div', { class: 'hint players-head' }, h('span', { text: 'Oyuncular' }), count),
            list,
          ),
          h('div', { class: 'col' },
            session.isHost
              ? h('div', { class: 'modes', style: `grid-template-columns:repeat(${Math.min(cards.length, 3)},1fr)` }, ...cards.map((c) => c.el))
              : h('div', { class: 'hint', text: 'Mod kurucu tarafından seçilir' }),
            session.isHost ? start : h('div', { class: 'hint', text: 'Kurucunun başlatması bekleniyor…' }),
            leave,
          ),
        ),
      ),
    );
    setExitHandler(() => leave.click(), session.isHost); // disabled after first click, so no double leave
    this.events.once('shutdown', () => {
      setExitHandler(null);
      offs.forEach((off) => off());
      unmount();
    });
  }
}

function modeCard(m: ModeDef): HTMLButtonElement {
  return h('button', { class: 'mode' },
    h('span', { class: 'icon', text: m.icon ?? '🎮' }),
    h('b', { text: m.label }),
    h('small', { text: m.desc }),
  );
}
