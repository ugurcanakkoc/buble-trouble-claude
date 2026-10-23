// "60 FPS · P2P 23ms · güncelleme 135ms (max 410)": FPS, link (P2P rtt / Sunucu relay) and, on clients,
// snapshot gaps, top-left of any scene.
// Shown while the "Ping/FPS göster" setting is on; cleans itself up on scene shutdown.
import Phaser from 'phaser';
import type { RoomSession } from '../net';
import { statsVisible } from './settings';
import { FONT } from './textures';

export function mountNetMeter(
  scene: Phaser.Scene,
  loop: { snapshotStats(): { avg: number; max: number } | null },
  session: Pick<RoomSession, 'isHost' | 'linkInfo'> | boolean, // boolean = isHost (no link info)
): Phaser.GameObjects.Text {
  const isHost = typeof session === 'boolean' ? session : session.isHost;
  const link = () => {
    if (typeof session === 'boolean') return '';
    const l = session.linkInfo();
    return l.mode === 'p2p' ? ` · P2P ${l.rttMs === null ? '…' : Math.round(l.rttMs) + 'ms'}` : l.mode === 'relay' ? ' · Sunucu' : ' · Bağlanıyor…';
  };
  const text = scene.add
    .text(8, 6, '', { fontFamily: FONT, fontSize: '18px', color: '#c9c8f0', stroke: '#0d1020', strokeThickness: 4, resolution: 2 })
    .setAlpha(0.85)
    .setDepth(30)
    .setScrollFactor(0);
  let fps = 60;
  let at = 0;
  const tick = (time: number, delta: number) => {
    if (delta > 0) fps += (1000 / delta - fps) * 0.05;
    const show = statsVisible();
    text.setVisible(show);
    if (!show || time - at < 500) return;
    at = time;
    const net = isHost ? null : loop.snapshotStats();
    text.setText(`${Math.round(fps)} FPS` + link() + (net ? ` · güncelleme ${Math.round(net.avg)}ms (max ${Math.round(net.max)})` : ''));
  };
  scene.events.on('update', tick);
  scene.events.once('shutdown', () => scene.events.off('update', tick));
  return text;
}
