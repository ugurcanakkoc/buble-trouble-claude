import type { GameDef } from '../types';
import { MutfakScene } from './Scene';
import { MODES } from './types';

export const def: GameDef = {
  id: 'mutfak',
  title: 'Mutfak Kaosu',
  tagline: 'Doğra, pişir, servis et, paketi kuryeyle yolla!',
  icon: '🍳',
  minPlayers: 1,
  maxPlayers: 4,
  modes: MODES.map((m) => ({ ...m })),
  sceneKey: 'MutfakGame',
};

export default { def, scene: MutfakScene };
