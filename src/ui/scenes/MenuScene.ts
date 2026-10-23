import Phaser from 'phaser';
import { roomApi, type JoinError } from '../../net';
import { GAMES, getGame, isPlayable } from '../../games/registry';
import type { GameDef, GameId } from '../../games/types';
import { h, load, mount, save } from '../dom';
import { clearInvite, readInvite } from '../invite';
import { createBoardPanel } from '../leaderboard';
import { addBackdrop } from './backdrop';

const JOIN_ERRORS: Record<JoinError, string> = {
  ROOM_NOT_FOUND: 'Oda bulunamadı',
  ROOM_FULL: 'Oda dolu',
  GAME_STARTED: 'Oyun başlamış',
  NETWORK: 'Bağlantı hatası',
};
const NAME_KEY = 'bubble.username';
const GAME_KEY = 'platform.game';

const range = (g: GameDef) => (g.minPlayers === g.maxPlayers ? `${g.maxPlayers}` : `${g.minPlayers}–${g.maxPlayers}`) + ' oyuncu';

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
    const create = h('button', { class: 'btn pink big' });
    const join = h('button', { class: 'btn cyan', text: 'Odaya Katıl' });

    // game picker
    const saved = load(GAME_KEY) as GameId | null;
    let picked: GameId = saved && isPlayable(saved) ? saved : 'bubble';
    const cards = GAMES.map((g) => {
      const soon = !isPlayable(g.id);
      const el = h('button', { class: `gcard${soon ? ' soon' : ''}`, disabled: soon, 'aria-label': g.title },
        h('span', { class: 'icon', text: g.icon }),
        h('b', { text: g.title }),
        h('small', { text: g.tagline }),
        h('span', { class: 'range', text: soon ? 'yakında' : range(g) }),
      );
      el.onclick = () => pick(g.id);
      return { id: g.id, el };
    });
    const pick = (id: GameId) => {
      picked = id;
      save(GAME_KEY, id);
      for (const c of cards) c.el.classList.toggle('on', c.id === id);
      create.textContent = `Oda Kur · ${getGame(id).title}`;
    };
    pick(picked);

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
      const label = create.textContent;
      create.textContent = 'Bağlanıyor…';
      try {
        const session = await roomApi.createRoom(n, picked, getGame(picked).maxPlayers);
        this.scene.start('Lobby', { session });
      } catch {
        error.textContent = JOIN_ERRORS.NETWORK;
        create.textContent = label;
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
        const session = await roomApi.joinRoom(c, n); // game comes from the host
        this.scene.start('Lobby', { session });
      } catch (e) {
        const err = e as Error & { max?: number };
        const msg = JOIN_ERRORS[err?.message as JoinError] ?? JOIN_ERRORS.NETWORK;
        error.textContent = err?.message === 'ROOM_FULL' ? `${msg} (en fazla ${err.max ?? 4} kişi)` : msg;
        join.textContent = 'Odaya Katıl';
        busy(false);
      }
    };

    code.addEventListener('input', () => (code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, '')));
    // Invite link (?oda=CODE): join straight away if we know the name, else ask for it first.
    const invited = readInvite();
    clearInvite();
    code.addEventListener('keydown', (e) => e.key === 'Enter' && join.click());
    name.addEventListener('keydown', (e) => e.key === 'Enter' && (invited ? join : create).click());

    const board = createBoardPanel({ game: () => picked, user: () => name.value.trim() || load(NAME_KEY) || '' });
    const best = h('button', { class: 'btn ghost', text: '🏆 Skor Tablosu', onclick: () => board.open() });

    const unmountBoard = mount(board.el);
    const unmount = mount(
      h('div', { class: 'screen' },
        h('div', { class: 'card wide menu' },
          h('div', { class: 'col' },
            h('h1', { class: 'title', text: 'Oyun Gecesi' }),
            h('p', { class: 'subtitle', text: 'Bir oyun seç, oda kur, arkadaşlarını çağır!' }),
            h('div', { class: 'label', text: 'Kullanıcı adı' }),
            name,
            h('div', { class: 'games' }, ...cards.map((c) => c.el)),
            create,
          ),
          h('div', { class: 'col side' },
            h('div', { class: 'divider', text: 'ya da koda katıl' }),
            h('div', { class: 'row' }, code, join),
            error,
            best,
          ),
        ),
      ),
    );
    this.events.once('shutdown', () => {
      unmount();
      unmountBoard();
    });

    if (invited) {
      code.value = invited;
      if (name.value.trim()) void join.click();
      else {
        error.textContent = `Davet edildin! Adını yaz ve "Odaya Katıl"a bas (oda ${invited})`;
        name.focus();
      }
    }
  }
}
