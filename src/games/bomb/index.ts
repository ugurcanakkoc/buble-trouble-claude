import type { GameDef } from '../types';

export { BombScene } from './BombScene';
export { bombSim } from './sim';

// Team mode: 2v2 (left corners vs right corners), bots fill empty slots. Friendly fire is ON, as in the
// original: your bombs hurt your teammate too.
export const bombGame: GameDef = {
  id: 'bomb',
  title: 'Bomba',
  tagline: 'Bombanı koy, kaç, son kalan kazanır!',
  icon: '💣',
  minPlayers: 1,
  maxPlayers: 4,
  modes: [
    { id: 'ffa', label: 'Herkes tek', desc: 'Herkes kendi için, boş köşeleri botlar doldurur', minPlayers: 1, icon: '💣' },
    { id: 'team', label: 'Takım', desc: '2’ye 2, botlar tamamlar, dost ateşi açık', minPlayers: 2, icon: '🤝' },
  ],
  sceneKey: 'BombGame',
};
