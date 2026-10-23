import Phaser from 'phaser';
import { BALL_RADIUS, type BallSize } from '../../sim';
import { FONT, hex, sparkTexture } from '../textures';


/** Pop bursts, floating score text, screen shake. */
export class Fx {
  private sparks: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(private scene: Phaser.Scene) {
    const key = sparkTexture(scene);
    this.sparks = scene.add
      .particles(0, 0, key, {
        speed: { min: 80, max: 320 }, angle: { min: 0, max: 360 }, lifespan: { min: 350, max: 700 },
        scale: { start: 1.1, end: 0 }, gravityY: 500, emitting: false,
      })
      .setDepth(6);
    this.dust = scene.add
      .particles(0, 0, key, {
        speed: { min: 40, max: 180 }, angle: { min: 200, max: 340 }, lifespan: 600,
        scale: { start: 1.4, end: 0.2 }, alpha: { start: 0.9, end: 0 }, gravityY: 600,
        tint: 0xd0603f, emitting: false,
      })
      .setDepth(6);
  }

  pop(x: number, y: number, size: BallSize, color: number, points: number) {
    const r = BALL_RADIUS[size];
    this.sparks.setParticleTint(color);
    this.sparks.explode(10 + size * 8, x, y);
    this.sparks.setParticleTint(0xffffff);
    this.sparks.explode(4 + size * 2, x, y);
    // expanding ring
    const ring = this.scene.add.circle(x, y, r, 0xffffff, 0).setStrokeStyle(3, color).setDepth(6);
    this.scene.tweens.add({ targets: ring, scale: 1.6, alpha: 0, duration: 260, onComplete: () => ring.destroy() });
    if (points > 0) {
      const t = this.scene.add
        .text(x, y, `+${points}`, {
          fontFamily: FONT, fontSize: '20px', fontStyle: '700', color: '#fff6a8',
          stroke: '#0d1020', strokeThickness: 4, resolution: 2,
        })
        .setOrigin(0.5)
        .setDepth(7);
      this.scene.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 800, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
    }
    if (size >= 2) this.scene.cameras.main.shake(140, size === 3 ? 0.007 : 0.004);
  }

  /** "x3!" popup above a player, in their color, bigger for longer chains. */
  combo(x: number, y: number, n: number, color: number) {
    const t = this.scene.add
      .text(x, y, `x${n}!`, {
        fontFamily: FONT, fontSize: `${26 + n * 4}px`, fontStyle: '700', color: hex(color),
        stroke: '#ffffff', strokeThickness: 6, resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(8)
      .setScale(0.4)
      .setAngle(-8);
    this.scene.tweens.add({ targets: t, scale: 1, angle: 0, duration: 220, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: t, y: y - 36, alpha: 0, delay: 450, duration: 450, onComplete: () => t.destroy() });
  }

  /** Small burst of light-blue bubbles: someone got trapped or freed. */
  bubbles(x: number, y: number) {
    this.sparks.setParticleTint(0xbfe9ff);
    this.sparks.explode(16, x, y);
  }

  blockBreak(x: number, y: number) {
    this.dust.explode(18, x, y);
  }

  hit() {
    this.scene.cameras.main.shake(300, 0.012);
    this.scene.cameras.main.flash(200, 255, 80, 80);
  }
}
