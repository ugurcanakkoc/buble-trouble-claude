import Phaser from 'phaser';
import { BALL_RADIUS, PLAYER_H, type Ball, type GameState, type Player, type PowerUp } from '../../sim';
import { FONT, PLAYER_TEX_H, RES, ballTexture, hex, playerTexture, powerTexture } from '../textures';
import { Pool } from './pool';

class PlayerView extends Phaser.GameObjects.Container {
  private img: Phaser.GameObjects.Image;
  private shield: Phaser.GameObjects.Graphics;
  private bubble: Phaser.GameObjects.Graphics;
  private help: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, p: Player) {
    super(scene);
    this.shield = scene.add.graphics();
    this.img = scene.add.image(0, 0, playerTexture(scene, p.color)).setOrigin(0.5, 1).setScale(1 / RES);
    const label = scene.add
      .text(0, -PLAYER_TEX_H - 2, p.name, {
        fontFamily: FONT, fontSize: '22px', fontStyle: '700', color: hex(p.color),
        stroke: '#0d1020', strokeThickness: 5, resolution: 2,
      })
      .setOrigin(0.5, 1);
    this.bubble = scene.add.graphics();
    this.help = scene.add
      .text(0, -PLAYER_TEX_H - 30, 'Kurtar!', {
        fontFamily: FONT, fontSize: '20px', fontStyle: '700', color: '#fff6a8',
        stroke: '#a3204f', strokeThickness: 5, resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setVisible(false);
    this.add([this.shield, this.img, this.bubble, label, this.help]);
    this.setDepth(5);
    scene.add.existing(this);
  }

  sync(p: Player, s: GameState, time: number) {
    this.setVisible(p.connected);
    const moving = Math.abs(this.x - p.x) > 0.1;
    this.setPosition(p.x, p.y);
    this.img.setFlipX(p.facing < 0);
    // walk bob, blink while invulnerable, float when trapped
    this.img.y = p.trapped ? -6 + Math.sin(time / 260) * 3 : moving ? -Math.abs(Math.sin(time / 70)) * 3 : 0;
    this.img.setAlpha(p.invulnUntil > s.tick && (s.tick >> 2) % 2 ? 0.35 : 1);
    this.bubble.clear();
    this.help.setVisible(p.trapped);
    if (p.trapped) {
      const cy = -PLAYER_H / 2 - 6 + Math.sin(time / 260) * 3;
      const rx = PLAYER_H * 0.62 + Math.sin(time / 170) * 3;
      const ry = PLAYER_H * 0.62 - Math.sin(time / 170) * 3;
      this.bubble.fillStyle(0xbfe9ff, 0.22).fillEllipse(0, cy, rx * 2, ry * 2);
      this.bubble.lineStyle(3, 0xe8f7ff, 0.8).strokeEllipse(0, cy, rx * 2, ry * 2);
      this.bubble.fillStyle(0xffffff, 0.7).fillEllipse(-rx * 0.4, cy - ry * 0.5, rx * 0.35, ry * 0.2);
      this.help.setScale(1 + Math.sin(time / 120) * 0.08);
    }
    this.shield.clear();
    if (p.shield) {
      const r = PLAYER_H * 0.68 + Math.sin(time / 150) * 2;
      this.shield.fillStyle(0x3fa9ff, 0.18).fillCircle(0, -PLAYER_H / 2, r);
      this.shield.lineStyle(3, 0x9fd8ff, 0.85).strokeCircle(0, -PLAYER_H / 2, r);
    }
  }
}

export class EntityRenderer {
  private balls: Pool<number, Ball, Phaser.GameObjects.Image>;
  private powers: Pool<number, PowerUp, Phaser.GameObjects.Image>;
  private players: Pool<string, Player, PlayerView>;
  private ice: Phaser.GameObjects.Graphics;

  constructor(private scene: Phaser.Scene) {
    const img = () => scene.add.image(0, 0, '__DEFAULT').setDepth(4).setScale(1 / RES);
    this.balls = new Pool(img);
    this.powers = new Pool(img);
    this.players = new Pool((p) => new PlayerView(scene, p));
    this.ice = scene.add.graphics().setDepth(4);
  }

  update(s: GameState, time: number): void {
    const frozen = s.freezeUntil > s.tick;
    const thawing = frozen && s.freezeUntil - s.tick < 60 && (s.tick >> 3) % 2 === 1;
    this.balls.sync(s.balls, (b) => b.id, (img, b) => {
      img.setTexture(ballTexture(this.scene, b.size, b.color)).setPosition(b.x, b.y);
    });
    this.ice.clear();
    if (frozen && !thawing) {
      for (const b of s.balls) this.ice.lineStyle(3, 0xbfefff, 0.85).strokeCircle(b.x, b.y, BALL_RADIUS[b.size] + 3);
    }
    this.powers.sync(s.powerUps, (p) => p.id, (img, p) => {
      img.setTexture(powerTexture(this.scene, p.kind)).setPosition(p.x, p.y - 6 + Math.sin(time / 200 + p.id) * 1.5);
      img.setVisible(p.expiresAt === 0 || p.expiresAt - s.tick > 120 || (s.tick >> 3) % 2 === 0); // blink before vanishing
    });
    const godId = s.mode === 'god' ? s.god?.godId : undefined; // the god rides the cloud instead
    this.players.sync(s.players, (p) => p.id, (v, p) => {
      v.sync(p, s, time);
      if (p.id === godId) v.setVisible(false);
    });
  }
}
