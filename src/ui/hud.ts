// Bottom HUD strip (y 480..540). Mode-aware:
//  classic: level + name | time bar + hearts      | name + score per player
//  god:     round + god   | round timer + mana bar | name + round wins
//  rain:    "Yağmur" + min| survival clock + hearts| name + score
import Phaser from 'phaser';
import { getLevel, MAX_PLAYERS, TICK_RATE, WORLD_H, WORLD_W, type GameState } from '../sim';
import { GOD_BALANCE } from '../sim';
import { FONT, RES, heartTexture, hex } from './textures';

const Y = WORLD_H;
const txt = (size: number, color = '#f4f1ff') => ({
  fontFamily: FONT, fontSize: `${size}px`, fontStyle: '700', color, stroke: '#0d1020', strokeThickness: 4, resolution: 2,
});
const BAR = { x: 232, y: Y + 10, w: 230, h: 16 };
const MANA = { x: 232, y: Y + 36, w: 230, h: 16 };
const SLOT_X = 476;
const SLOT_W = (WORLD_W - SLOT_X - 8) / MAX_PLAYERS;

export const clock = (ticks: number) => {
  const sec = Math.max(0, Math.floor(ticks / TICK_RATE));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

export class Hud {
  private line1: Phaser.GameObjects.Text;
  private line2: Phaser.GameObjects.Text;
  private bar: Phaser.GameObjects.Graphics;
  private barText: Phaser.GameObjects.Text;
  private hearts: Phaser.GameObjects.Image[] = [];
  private livesText: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private slots: { name: Phaser.GameObjects.Text; score: Phaser.GameObjects.Text }[] = [];

  constructor(scene: Phaser.Scene) {
    const g = scene.add.graphics().setDepth(10);
    g.fillGradientStyle(0x232a55, 0x232a55, 0x12162e, 0x12162e).fillRect(0, Y, WORLD_W, 60);
    g.fillStyle(0x4be37a).fillRect(0, Y, WORLD_W, 4); // ground lip
    g.fillStyle(0x22964a).fillRect(0, Y + 4, WORLD_W, 2);
    g.fillStyle(0x2c3468).fillRect(222, Y + 12, 2, 40).fillRect(SLOT_X - 6, Y + 12, 2, 40);

    this.line1 = scene.add.text(14, Y + 5, '', txt(26, '#ffd23f')).setDepth(11);
    this.line2 = scene.add.text(14, Y + 36, '', txt(18, '#c9c8f0')).setDepth(11);
    this.bar = scene.add.graphics().setDepth(11);
    this.barText = scene.add.text(BAR.x + BAR.w / 2, BAR.y + BAR.h / 2, '', txt(20)).setOrigin(0.5).setDepth(12);
    const hk = heartTexture(scene);
    for (let i = 0; i < 8; i++) this.hearts.push(scene.add.image(BAR.x + 12 + i * 27, Y + 43, hk).setScale(1 / RES).setDepth(11));
    this.livesText = scene.add.text(BAR.x + 30, Y + 43, '', txt(20)).setOrigin(0, 0.5).setDepth(11);
    this.hint = scene.add.text(WORLD_W / 2, 160, 'Basılı tut: büyüt, bırak: at', txt(20, '#fff6a8')).setOrigin(0.5).setDepth(11);
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const x = SLOT_X + i * SLOT_W + SLOT_W / 2;
      this.slots.push({
        name: scene.add.text(x, Y + 7, '', txt(20)).setOrigin(0.5, 0).setDepth(11),
        score: scene.add.text(x, Y + 30, '', txt(24)).setOrigin(0.5, 0).setDepth(11),
      });
    }
  }

  update(s: GameState, selfId: string): void {
    const god = s.mode === 'god' ? s.god : null;
    const rain = s.mode === 'rain';
    this.bar.clear();
    this.barText.setVisible(rain);
    this.hint.setVisible(!!god && god.godId === selfId && s.phase === 'playing');

    if (god) {
      const godName = s.players.find((p) => p.id === god.godId)?.name ?? '';
      this.line1.setText(`Raund ${god.round + 1}/${god.order.length}`);
      this.line2.setText(clip(`Tanrı: ${godName}`, 20));
      this.timeBar(s.timeLeftTicks / (GOD_BALANCE.roundSec * TICK_RATE), s.tick);
      this.manaBar(god.mana, s.tick < god.nextDropTick ? (god.nextDropTick - s.tick) / (GOD_BALANCE.cooldownSec * TICK_RATE) : 0);
    } else if (rain) {
      this.line1.setText('Yağmur');
      this.line2.setText(`${s.levelIndex + 1}. dakika`);
      this.barText.setText(`⏱ ${clock(s.timeLeftTicks)}`);
    } else {
      const def = getLevel(s.levelIndex);
      this.line1.setText(`Seviye ${s.levelIndex + 1}`);
      this.line2.setText(clip(def.name, 18));
      this.timeBar(s.timeLeftTicks / (def.timeSeconds * TICK_RATE), s.tick);
    }

    const showLives = !god;
    const many = s.lives > this.hearts.length;
    this.hearts.forEach((h, i) => h.setVisible(showLives && (many ? i === 0 : i < s.lives)));
    this.livesText.setVisible(showLives && many).setText(`x ${s.lives}`);

    this.slots.forEach((slot, i) => {
      const p = s.players[i];
      slot.name.setVisible(!!p);
      slot.score.setVisible(!!p);
      if (!p) return;
      slot.name.setText(clip(p.name, 10)).setColor(hex(p.color)).setAlpha(p.connected ? 1 : 0.4);
      slot.score.setText(god ? `★ ${god.roundWins[p.id] ?? 0}${p.id === god.godId ? ' ☁' : ''}` : String(p.score));
    });
  }

  private timeBar(frac: number, tick: number) {
    const k = Phaser.Math.Clamp(frac, 0, 1);
    const color = k < 0.2 ? ((tick >> 4) % 2 ? 0xff4040 : 0xff8a8a) : k < 0.5 ? 0xffd23f : 0x4be37a;
    const g = this.bar;
    g.fillStyle(0x0d1020).fillRoundedRect(BAR.x - 2, BAR.y - 2, BAR.w + 4, BAR.h + 4, 9);
    if (k > 0) {
      g.fillStyle(color).fillRoundedRect(BAR.x, BAR.y, Math.max(BAR.h, BAR.w * k), BAR.h, 8);
      g.fillStyle(0xffffff, 0.3).fillRoundedRect(BAR.x + 4, BAR.y + 2, Math.max(8, BAR.w * k - 8), 4, 2);
    }
  }

  /** 10 segments, tick marks at the ball costs (1/2/4/8), grey veil while on cooldown. */
  private manaBar(mana: number, cooldown: number) {
    const g = this.bar;
    const cap = GOD_BALANCE.manaCap;
    const seg = MANA.w / cap;
    g.fillStyle(0x0d1020).fillRoundedRect(MANA.x - 2, MANA.y - 2, MANA.w + 4, MANA.h + 4, 6);
    for (let i = 0; i < cap; i++) {
      const fill = Phaser.Math.Clamp(mana - i, 0, 1);
      g.fillStyle(0x2c3468).fillRect(MANA.x + i * seg + 1, MANA.y, seg - 2, MANA.h);
      if (fill > 0) g.fillStyle(fill < 1 ? 0x6a5acd : 0xb06bff).fillRect(MANA.x + i * seg + 1, MANA.y, (seg - 2) * fill, MANA.h);
    }
    for (const c of GOD_BALANCE.cost) {
      g.fillStyle(mana >= c ? 0xffd23f : 0x8a8fb0).fillTriangle(
        MANA.x + c * seg, MANA.y + MANA.h - 1, MANA.x + c * seg - 5, MANA.y + MANA.h + 6, MANA.x + c * seg + 5, MANA.y + MANA.h + 6,
      );
    }
    if (cooldown > 0) g.fillStyle(0x0d1020, 0.6).fillRect(MANA.x, MANA.y, MANA.w * Math.min(1, cooldown), MANA.h);
  }
}

const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
