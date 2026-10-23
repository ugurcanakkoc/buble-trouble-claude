// All games on the platform. The first three are imported explicitly; any other game is picked up
// automatically from src/games/<id>/index.ts if it has a default export `{ def, scene }` (a GameModule),
// so parallel teams can add games without touching this file.
import type Phaser from 'phaser';
import { BubbleScene, bubbleGame } from './bubble';
import type { GameDef, GameId } from './types';
import { BombScene, bombGame } from './bomb';
import { WarScene, warGame } from './war';

type SceneClass = new () => Phaser.Scene;
export interface GameModule {
  def: GameDef;
  scene: SceneClass;
}

const discovered = Object.values(
  import.meta.glob<{ default?: GameModule }>('./*/index.ts', { eager: true }),
)
  .map((m) => m.default)
  .filter((m): m is GameModule => !!m?.def && !!m.scene);

const READY: [GameDef, SceneClass][] = [
  [bubbleGame, BubbleScene],
  [warGame, WarScene],
  [bombGame, BombScene],
  ...discovered.map((m): [GameDef, SceneClass] => [m.def, m.scene]),
];

/** Picker order: registration order. */
export const GAMES: GameDef[] = READY.map(([d]) => d);
export const GAME_SCENES: SceneClass[] = READY.map(([, s]) => s);
const ready = new Set(GAMES.map((g) => g.id));
export const isPlayable = (id: GameId) => ready.has(id);
export const getGame = (id: GameId): GameDef => GAMES.find((g) => g.id === id) ?? GAMES[0];
