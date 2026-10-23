import Phaser from 'phaser';
import './ui/overlay.css';
import { mountMuteButton } from './ui/audio';
import { h } from './ui/dom';
import { mountSettingsButton } from './ui/settings';
import { GameScene } from './ui/scenes/GameScene';
import { LobbyScene } from './ui/scenes/LobbyScene';
import { MenuScene } from './ui/scenes/MenuScene';

async function boot() {
  // Canvas text needs the web font loaded first; don't wait forever if offline.
  await Promise.race([
    document.fonts?.load('700 20px Fredoka').catch(() => {}),
    new Promise((r) => setTimeout(r, 1500)),
  ]);

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'app',
    width: 960,
    height: 540, // 960x480 play area + 60px HUD strip
    backgroundColor: '#0d1020',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 4 },
    scene: [MenuScene, LobbyScene, GameScene],
  });

  mountMuteButton();
  mountSettingsButton();
  document.body.append(
    h('div', { class: 'rotate' }, h('div', { class: 'phone', text: '📱' }), h('div', { text: 'Telefonu yan çevir' })),
  );
}

void boot();
