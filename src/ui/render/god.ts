// God / rain cloud: the god player sits on a fluffy cloud (rain: grumpy AI storm cloud),
// plus a growing ghost ball under it while charging.
import Phaser from 'phaser';
import { BALL_RADIUS, type BallSize, type GameState } from '../../sim';
import { GOD_BALANCE } from '../../sim';
import type { Smoother } from './smooth';
import { FONT, RES, ballTexture, cloudTexture, hex, playerTexture } from '../textures';

const GHOST_COLORS = [0x4be37a, 0x3fd8ff, 0xffd23f, 0xff4f8b];
const STEP_TICKS = GOD_BALANCE.chargeStepSec * 60;
const CLOUD_Y = 70;

export class GodRenderer {
  private root: Phaser.GameObjects.Container;
  private cloud: Phaser.GameObjects.Image;
  private rider: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private ghost: Phaser.GameObjects.Image;
  private riderId = '';

  constructor(private scene: Phaser.Scene) {
    this.ghost = scene.add.image(0, 0, '__DEFAULT').setDepth(6).setVisible(false);
    this.rider = scene.add.image(0, -30, '__DEFAULT').setOrigin(0.5, 1).setScale(0.7 / RES);
    this.cloud = scene.add.image(0, 0, cloudTexture(scene, false)).setScale(1 / RES);
    this.label = scene.add
      .text(0, 0, '', {
        fontFamily: FONT, fontSize: '20px', fontStyle: '700', color: '#fff',
        stroke: '#0d1020', strokeThickness: 5, resolution: 2,
      })
      .setOrigin(0, 0.5);
    this.root = scene.add.container(0, 0, [this.rider, this.cloud, this.label]).setDepth(7).setVisible(false);
  }

  update(s: GameState, time: number, smooth: Smoother): void {
    const g = s.god;
    this.root.setVisible(!!g);
    if (!g) {
      this.ghost.setVisible(false);
      return;
    }
    const storm = g.godId === '';
    // the cloud sits low enough that the rider on top stays on screen
    const y = CLOUD_Y + Math.sin(time / 400) * 3;
    const x = smooth.at('god', g.x, 0).x; // no offset is ever recorded for my own cloud
    this.root.setPosition(x, y);
    this.cloud.setTexture(cloudTexture(this.scene, storm));
    this.rider.setVisible(!storm);
    this.label.setVisible(!storm);
    // name beside the cloud, on whichever side has room
    const right = x < 680;
    this.label.setOrigin(right ? 0 : 1, 0.5).setX(right ? 78 : -78);
    if (!storm && this.riderId !== g.godId) {
      const p = s.players.find((q) => q.id === g.godId);
      if (p) {
        this.riderId = p.id;
        this.rider.setTexture(playerTexture(this.scene, p.color));
        this.label.setText(`${p.name} (Tanrı)`).setColor(hex(p.color));
      }
    }

    // charging: ghost of the current size, pulsing toward the next one
    const charging = g.charge >= 0 && s.phase === 'playing';
    this.ghost.setVisible(charging);
    if (charging) {
      const size = g.charge as BallSize;
      const into = Math.min(1, ((s.tick - g.chargeStart) % STEP_TICKS) / STEP_TICKS);
      const grow = size < 3 ? 1 + (into * (BALL_RADIUS[size + 1] - BALL_RADIUS[size])) / BALL_RADIUS[size] * 0.35 : 1;
      this.ghost
        .setTexture(ballTexture(this.scene, size, GHOST_COLORS[size]))
        .setPosition(x, CLOUD_Y + 26 + BALL_RADIUS[size] * 0.8)
        .setScale(grow / RES)
        .setAlpha(0.45 + Math.sin(time / 90) * 0.15);
    }
  }
}
