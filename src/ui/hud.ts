// Bottom HUD strip (y 480..540): level, time bar, shared hearts, per-player name + score.
import Phaser from 'phaser';
import { getLevel, MAX_PLAYERS, TICK_RATE, WORLD_H, WORLD_W, type GameState } from '../sim';
import { FONT, RES, heartTexture, hex } from './textures';

const Y = WORLD_H;
const txt = (size: number, color = '#f4f1ff') => ({
  fontFamily: FONT, fontSize: `${size}px`, fontStyle: '700', color, stroke: '#0d1020', strokeThickness: 4, resolution: 2,
});
const BAR = { x: 232, y: Y + 10, w: 230, h: 16 };
const SLOT_X = 476;
const SLOT_W = (WORLD_W - SLOT_X - 8) / MAX_PLAYERS;

export class Hud {
  private level: Phaser.GameObjects.Text;
  private levelName: Phaser.GameObjects.Text;
  private bar: Phaser.GameObjects.Graphics;
  private hearts: Phaser.GameObjects.Image[] = [];
  private livesText: Phaser.GameObjects.Text;
  private slots: { name: Phaser.GameObjects.Text; score: Phaser.GameObjects.Text }[] = [];

  constructor(private scene: Phaser.Scene) {
    const g = scene.add.graphics().setDepth(10);
    g.fillGradientStyle(0x232a55, 0x232a55, 0x12162e, 0x12162e).fillRect(0, Y, WORLD_W, 60);
    // ground lip
    g.fillStyle(0x4be37a).fillRect(0, Y, WORLD_W, 4);
    g.fillStyle(0x22964a).fillRect(0, Y + 4, WORLD_W, 2);
    g.fillStyle(0x2c3468).fillRect(222, Y + 12, 2, 40).fillRect(SLOT_X - 6, Y + 12, 2, 40);

    this.level = scene.add.text(14, Y + 5, '', txt(26, '#ffd23f')).setDepth(11);
    this.levelName = scene.add.text(14, Y + 36, '', txt(18, '#c9c8f0')).setDepth(11);
    this.bar = scene.add.graphics().setDepth(11);
    const hk = heartTexture(scene);
    for (let i = 0; i < 8; i++) this.hearts.push(scene.add.image(BAR.x + 12 + i * 27, Y + 43, hk).setScale(1 / RES).setDepth(11));
    this.livesText = scene.add.text(BAR.x + 30, Y + 43, '', txt(20)).setOrigin(0, 0.5).setDepth(11);
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const x = SLOT_X + i * SLOT_W + SLOT_W / 2;
      this.slots.push({
        name: scene.add.text(x, Y + 7, '', txt(20)).setOrigin(0.5, 0).setDepth(11),
        score: scene.add.text(x, Y + 30, '', txt(24)).setOrigin(0.5, 0).setDepth(11),
      });
    }
  }

  update(s: GameState): void {
    const def = getLevel(s.levelIndex);
    this.level.setText(`Seviye ${s.levelIndex + 1}`);
    this.levelName.setText(clip(def.name, 18));

    const total = def.timeSeconds * TICK_RATE;
    const k = Phaser.Math.Clamp(s.timeLeftTicks / total, 0, 1);
    const low = k < 0.2;
    const color = low ? ((s.tick >> 4) % 2 ? 0xff4040 : 0xff8a8a) : k < 0.5 ? 0xffd23f : 0x4be37a;
    this.bar.clear();
    this.bar.fillStyle(0x0d1020).fillRoundedRect(BAR.x - 2, BAR.y - 2, BAR.w + 4, BAR.h + 4, 9);
    if (k > 0) {
      this.bar.fillStyle(color).fillRoundedRect(BAR.x, BAR.y, Math.max(BAR.h, BAR.w * k), BAR.h, 8);
      this.bar.fillStyle(0xffffff, 0.3).fillRoundedRect(BAR.x + 4, BAR.y + 2, Math.max(8, BAR.w * k - 8), 4, 2);
    }

    const many = s.lives > this.hearts.length;
    this.hearts.forEach((h, i) => h.setVisible(many ? i === 0 : i < s.lives));
    this.livesText.setVisible(many).setText(`x ${s.lives}`);

    this.slots.forEach((slot, i) => {
      const p = s.players[i];
      slot.name.setVisible(!!p);
      slot.score.setVisible(!!p);
      if (!p) return;
      slot.name.setText(clip(p.name, 10)).setColor(hex(p.color)).setAlpha(p.connected ? 1 : 0.4);
      slot.score.setText(String(p.score));
    });
  }
}

const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
