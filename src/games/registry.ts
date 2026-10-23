// All games on the platform. A game is playable once its GameDef + scene class are in READY;
// the rest show on the picker as "yakında" (disabled) with their provisional defs below.
import type Phaser from 'phaser';
import { BubbleScene, bubbleGame } from './bubble';
import type { GameDef, GameId } from './types';
import { BombScene, bombGame } from './bomb';
import { WarScene, warGame } from './war';

type SceneClass = new () => Phaser.Scene;
const READY: [GameDef, SceneClass][] = [
  [bubbleGame, BubbleScene],
  [warGame, WarScene],
  [bombGame, BombScene],
];

const PROVISIONAL: GameDef[] = [
  {
    id: 'war', title: 'Çağlar Savaşı', tagline: 'Üssünü koru, çağ atla, rakibi yık!', icon: '⚔️',
    minPlayers: 1, maxPlayers: 2, sceneKey: 'WarGame',
    modes: [
      { id: 'pvp', label: "1'e 1", desc: 'İki oyuncu karşı karşıya', minPlayers: 2 },
      { id: 'ai', label: 'Bilgisayara karşı', desc: 'Bilgisayara karşı savaş', minPlayers: 1 },
    ],
  },
  {
    id: 'bomb', title: 'Bomba', tagline: 'Bombanı koy, kaç, son kalan kazanır!', icon: '💣',
    minPlayers: 1, maxPlayers: 4, sceneKey: 'BombGame',
    modes: [
      { id: 'ffa', label: 'Herkes tek', desc: 'Herkes kendi için, boş yerleri botlar doldurur', minPlayers: 1 },
      { id: 'team', label: 'Takım', desc: 'İki takım', minPlayers: 2 },
    ],
  },
];

const ready = new Set(READY.map(([d]) => d.id));
/** Picker order: bubble, war, bomb. */
export const GAMES: GameDef[] = (['bubble', 'war', 'bomb'] as GameId[]).map(
  (id) => READY.find(([d]) => d.id === id)?.[0] ?? PROVISIONAL.find((d) => d.id === id)!,
);
export const GAME_SCENES: SceneClass[] = READY.map(([, s]) => s);
export const isPlayable = (id: GameId) => ready.has(id);
export const getGame = (id: GameId): GameDef => GAMES.find((g) => g.id === id) ?? GAMES[0];
