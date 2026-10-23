import type { GameDef } from '../types';

export { GameScene as BubbleScene } from '../../ui/scenes/GameScene';
export { bubbleSim } from './sim';

export const bubbleGame: GameDef = {
  id: 'bubble',
  title: 'Balon Avı',
  tagline: 'Arkadaşlarınla balonları patlat!',
  icon: '🎈',
  minPlayers: 1,
  maxPlayers: 4,
  modes: [
    { id: 'classic', label: 'Klasik', desc: 'Sonsuz seviye', minPlayers: 1, icon: '🎈' },
    { id: 'god', label: 'Tanrı', desc: 'Biri top yağdırır, sırayla herkes tanrı olur', minPlayers: 2, icon: '☁️' },
    { id: 'rain', label: 'Yağmur', desc: 'Herkes aynı takım, toplar yukarıdan yağar', minPlayers: 1, icon: '🌧️' },
  ],
  sceneKey: 'Game',
};
