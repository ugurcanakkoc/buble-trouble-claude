import type { GameDef } from '../types';
import { ParamedikScene } from './Scene';
import { PARAMEDIK_MODES } from './types';

export const paramedikGame: GameDef = {
  id: 'paramedik',
  title: 'Paramedik',
  tagline: 'Konuş, yoksa hasta gider! Biri hastada, biri kitapçıkta.',
  icon: '🚑',
  minPlayers: 1,
  maxPlayers: 4,
  modes: PARAMEDIK_MODES,
  sceneKey: 'ParamedikGame',
};

export default { def: paramedikGame, scene: ParamedikScene };
