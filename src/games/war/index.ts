import type { GameDef } from '../types';

export { WarScene } from './WarScene';
export { warSim, type WarState, type WarInput, type WarEvent, type WarCommand } from './sim';

export const warGame: GameDef = {
  id: 'war',
  title: 'Çağlar Savaşı',
  tagline: 'Üssünü koru, çağ atla, rakibi yık!',
  icon: '⚔️',
  minPlayers: 1,
  maxPlayers: 2,
  modes: [
    { id: 'pvp', label: "1'e 1", desc: 'İki oyuncu karşı karşıya', minPlayers: 2, icon: '⚔️' },
    { id: 'ai', label: 'Bilgisayara karşı', desc: '1-2 kişi aynı takımda, ortak altın', minPlayers: 1, icon: '🤖' },
  ],
  sceneKey: 'WarGame',
};
