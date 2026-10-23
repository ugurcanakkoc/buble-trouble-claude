import Phaser from 'phaser';
import { BALL_RADIUS, PLAYER_H, type Ball, type GameState, type Player, type PowerUp } from '../../sim';
import { type Face, FONT, PLAYER_TEX_H, RES, ballTexture, hex, playerTexture, powerTexture } from '../textures';
import { Pool } from './pool';
import type { Smoother } from './smooth';

class PlayerView extends Phaser.GameObjects.Container {
  private img: Phaser.GameObjects.Image;
  private shield: Phaser.GameObjects.Graphics;
  private bubble: Phaser.GameObjects.Graphics;
  private help: Phaser.GameObjects.Text;
  private say: Phaser.GameObjects.Container;
  private shouting = false;
  private face: Face = 'normal';
  private wasTrapped = false;
  private happyUntil = 0;
  private popAt = 0;

  constructor(scene: Phaser.Scene, p: Player) {
    super(scene);
    this.shield = scene.add.graphics();
    this.img = scene.add.image(0, 0, playerTexture(scene, p.color)).setOrigin(0.5, 1).setScale(1 / RES);
    const label = scene.add
      .text(0, -PLAYER_TEX_H - 2, p.name, {
        fontFamily: FONT, fontSize: '26px', fontStyle: '700', color: hex(p.color),
        stroke: '#0d1020', strokeThickness: 5, resolution: 2,
      })
      .setOrigin(0.5, 1);
    this.bubble = scene.add.graphics();
    this.help = scene.add
      .text(0, -PLAYER_TEX_H - 34, 'Kurtar!', {
        fontFamily: FONT, fontSize: '20px', fontStyle: '700', color: '#fff6a8',
        stroke: '#a3204f', strokeThickness: 4, resolution: 2,
      })
      .setOrigin(0.5, 1)
      .setVisible(false);
    const t = scene.add
      .text(0, -9, 'Yardım et!', { fontFamily: FONT, fontSize: '17px', fontStyle: '700', color: '#1b1030', resolution: 2 })
      .setOrigin(0.5, 1);
    const w = t.width + 18, h = t.height + 6;
    const g = scene.add.graphics();
    g.fillStyle(0xffffff, 0.96).lineStyle(2, 0x8a7fb0, 0.9);
    g.fillRoundedRect(-w / 2, -6 - h, w, h, 9).strokeRoundedRect(-w / 2, -6 - h, w, h, 9);
    g.fillTriangle(-5, -7, 5, -7, 0, 0).lineBetween(-5, -6, 0, 0).lineBetween(5, -6, 0, 0);
    t.y = -6 - 3;
    this.say = scene.add.container(0, -PLAYER_TEX_H - 30, [g, t]).setVisible(false);
    this.add([this.shield, this.img, this.bubble, label, this.help, this.say]);
    this.setDepth(5);
    scene.add.existing(this);
  }

  sync(p: Player, s: GameState, time: number, at: { x: number; y: number }) {
    this.setVisible(p.connected);
    const moving = Math.abs(this.x - at.x) > 0.1;
    this.setPosition(at.x, at.y);
    this.img.setFlipX(p.facing < 0);
    // walk bob, blink while invulnerable, float when trapped
    this.img.y = p.trapped ? -6 + Math.sin(time / 260) * 3 : moving ? -Math.abs(Math.sin(time / 70)) * 3 : 0;
    if (this.wasTrapped && !p.trapped) this.happyUntil = time + 1200;
    this.wasTrapped = p.trapped;
    const face = p.trapped ? 'scared' : time < this.happyUntil ? 'happy' : s.tick < p.invulnUntil ? 'dizzy' : 'normal';
    if (face !== this.face) {
      this.face = face;
      this.img.setTexture(playerTexture(this.scene, p.color, face));
    }
    this.img.setAlpha(p.invulnUntil > s.tick && (s.tick >> 2) % 2 ? 0.35 : 1);
    this.bubble.clear();
    const shouting = p.trapped && s.tick < p.helpUntil;
    if (shouting && !this.shouting) this.popAt = time;
    this.shouting = shouting;
    this.help.setVisible(p.trapped && !shouting);
    this.say.setVisible(shouting);
    if (shouting) {
      const k = Math.min(1, (time - this.popAt) / 220);
      this.say.setScale(1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2) - (k < 1 ? 0 : 0)).setRotation(Math.sin(time / 140) * 0.06);
    }
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

  /** `smooth` offsets snapshot corrections (clients); my own player is drawn unsmoothed. */
  update(s: GameState, time: number, smooth: Smoother, selfId: string): void {
    const frozen = s.freezeUntil > s.tick;
    const thawing = frozen && s.freezeUntil - s.tick < 60 && (s.tick >> 3) % 2 === 1;
    this.balls.sync(s.balls, (b) => b.id, (img, b) => {
      const at = smooth.at(`b${b.id}`, b.x, b.y);
      img.setTexture(ballTexture(this.scene, b.size, b.color)).setPosition(at.x, at.y);
    });
    this.ice.clear();
    if (frozen && !thawing) {
      for (const b of s.balls) {
        const at = smooth.at(`b${b.id}`, b.x, b.y);
        this.ice.lineStyle(3, 0xbfefff, 0.85).strokeCircle(at.x, at.y, BALL_RADIUS[b.size] + 3);
      }
    }
    this.powers.sync(s.powerUps, (p) => p.id, (img, p) => {
      img.setTexture(powerTexture(this.scene, p.kind)).setPosition(p.x, p.y - 6 + Math.sin(time / 200 + p.id) * 1.5);
      img.setVisible(p.expiresAt === 0 || p.expiresAt - s.tick > 120 || (s.tick >> 3) % 2 === 0); // blink before vanishing
    });
    const godId = s.mode === 'god' ? s.god?.godId : undefined; // the god rides the cloud instead
    this.players.sync(s.players, (p) => p.id, (v, p) => {
      v.sync(p, s, time, p.id === selfId ? p : smooth.at(`p${p.id}`, p.x, p.y));
      if (p.id === godId) v.setVisible(false);
    });
  }
}
