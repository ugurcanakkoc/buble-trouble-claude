// Animated menu/lobby background: level sky + a few bouncing glossy balls.
import Phaser from 'phaser';
import type { BallSize } from '../../sim';
import { BALL_RADIUS } from '../../sim';
import { RES, ballTexture, bgTexture } from '../textures';

const COLORS = [0xff4f8b, 0x3fd8ff, 0xffd23f, 0x4be37a, 0xb06bff];

export function addBackdrop(scene: Phaser.Scene, variant: number): void {
  scene.add.image(0, 0, bgTexture(scene, variant)).setOrigin(0).setDisplaySize(960, 540);
  const balls = [3, 2, 2, 1, 1, 0].map((size, i) => {
    const r = BALL_RADIUS[size];
    return {
      img: scene.add.image(0, 0, ballTexture(scene, size as BallSize, COLORS[(i + variant) % COLORS.length])).setScale(1 / RES),
      r,
      x: 80 + ((i * 173) % 800),
      y: 100 + i * 40,
      vx: (i % 2 ? 1 : -1) * (70 + i * 10),
      vy: 0,
      peak: 160 + size * 70,
    };
  });
  const tick = (_t: number, dtMs: number) => {
    const dt = Math.min(dtMs, 50) / 1000;
    for (const b of balls) {
      b.vy += 600 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < b.r || b.x > 960 - b.r) {
        b.vx *= -1;
        b.x = Phaser.Math.Clamp(b.x, b.r, 960 - b.r);
      }
      if (b.y > 540 - b.r) {
        b.y = 540 - b.r;
        b.vy = -Math.sqrt(2 * 600 * b.peak);
      }
      b.img.setPosition(b.x, b.y);
    }
  };
  scene.events.on('update', tick);
  scene.events.once('shutdown', () => scene.events.off('update', tick));
}
