import Phaser from 'phaser';
import { roomApi, type JoinError } from '../../net';
import { h, load, mount, save } from '../dom';
import { createBoardPanel } from '../leaderboard';
import { addBackdrop } from './backdrop';

const JOIN_ERRORS: Record<JoinError, string> = {
  ROOM_NOT_FOUND: 'Oda bulunamadı',
  ROOM_FULL: 'Oda dolu (en fazla 4 kişi)',
  GAME_STARTED: 'Oyun başlamış',
  NETWORK: 'Bağlantı hatası',
};
const NAME_KEY = 'bubble.username';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    addBackdrop(this, 0);

    const name = h('input', {
      class: 'field', maxLength: 12, placeholder: 'Kullanıcı adın', value: load(NAME_KEY) ?? '',
      autocomplete: 'nickname', enterKeyHint: 'done', spellcheck: false,
    });
    const code = h('input', {
      class: 'field code', maxLength: 4, placeholder: 'KOD', autocomplete: 'off', autocapitalize: 'characters',
      enterKeyHint: 'go', spellcheck: false,
    });
    const error = h('div', { class: 'error', role: 'alert' });
    const create = h('button', { class: 'btn pink big', text: 'Oda Kur' });
    const join = h('button', { class: 'btn cyan', text: 'Odaya Katıl' });

    const busy = (on: boolean) => [create, join, name, code].forEach((el) => (el.disabled = on));
    const validName = () => {
      const n = name.value.trim();
      if (n.length < 1 || n.length > 12) {
        error.textContent = 'Önce bir kullanıcı adı yaz (1–12 karakter)';
        name.focus();
        return null;
      }
      save(NAME_KEY, n);
      return n;
    };

    create.onclick = async () => {
      const n = validName();
      if (!n) return;
      busy(true);
      error.textContent = '';
      create.textContent = 'Bağlanıyor…';
      try {
        const session = await roomApi.createRoom(n);
        this.scene.start('Lobby', { session });
      } catch {
        error.textContent = JOIN_ERRORS.NETWORK;
        create.textContent = 'Oda Kur';
        busy(false);
      }
    };

    join.onclick = async () => {
      const n = validName();
      if (!n) return;
      const c = code.value.trim().toUpperCase();
      if (c.length !== 4) {
        error.textContent = 'Oda kodu 4 karakter olmalı';
        code.focus();
        return;
      }
      busy(true);
      error.textContent = '';
      join.textContent = 'Katılıyor…';
      try {
        const session = await roomApi.joinRoom(c, n);
        this.scene.start('Lobby', { session });
      } catch (e) {
        const msg = (e as Error)?.message as JoinError;
        error.textContent = JOIN_ERRORS[msg] ?? JOIN_ERRORS.NETWORK;
        join.textContent = 'Odaya Katıl';
        busy(false);
      }
    };

    code.addEventListener('input', () => (code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, '')));
    code.addEventListener('keydown', (e) => e.key === 'Enter' && join.click());
    name.addEventListener('keydown', (e) => e.key === 'Enter' && create.click());

    const board = createBoardPanel();
    const best = h('button', { class: 'btn ghost', text: '🏆 En İyiler', onclick: () => board.open() });

    const unmountBoard = mount(board.el);
    const unmount = mount(
      h('div', { class: 'screen' },
        h('div', { class: 'card' },
          h('h1', { class: 'title', text: 'Bubble Online' }),
          h('p', { class: 'subtitle', text: 'Arkadaşlarınla balonları patlat!' }),
          h('div', { class: 'label', text: 'Kullanıcı adı' }),
          name,
          create,
          h('div', { class: 'divider', text: 'ya da' }),
          h('div', { class: 'row' }, code, join),
          error,
          best,
        ),
      ),
    );
    this.events.once('shutdown', () => {
      unmount();
      unmountBoard();
    });
  }
}
