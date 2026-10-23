import Phaser from 'phaser';
import type { Block } from '../../sim';

/** Redraws only when the set of blocks / their hp changes. */
export class BlockRenderer {
  private g: Phaser.GameObjects.Graphics;
  private sig = '';
  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(2);
  }

  update(blocks: Block[]): void {
    const sig = blocks.map((b) => `${b.id}:${b.hp}`).join(',');
    if (sig === this.sig) return;
    this.sig = sig;
    const g = this.g.clear();
    for (const b of blocks) {
      if (b.kind === 'wall') wall(g, b);
      else brick(g, b);
    }
  }
}

function wall(g: Phaser.GameObjects.Graphics, b: Block) {
  g.fillStyle(0x2c3042).fillRoundedRect(b.x, b.y + 2, b.w, b.h, 4);
  g.fillStyle(0x6a7390).fillRoundedRect(b.x, b.y, b.w, b.h - 2, 4);
  // stones in offset rows
  g.lineStyle(2, 0x464d66, 1);
  const rowH = Math.min(14, b.h);
  for (let y = b.y, r = 0; y < b.y + b.h - 1; y += rowH, r++) {
    if (y > b.y) g.lineBetween(b.x + 2, y, b.x + b.w - 2, y);
    for (let x = b.x + (r % 2 ? 12 : 24); x < b.x + b.w - 4; x += 24) {
      g.lineBetween(x, y + 1, x, Math.min(y + rowH, b.y + b.h - 2));
    }
  }
  g.fillStyle(0xa7b0cc).fillRect(b.x + 3, b.y + 1, b.w - 6, 3);
}

function brick(g: Phaser.GameObjects.Graphics, b: Block) {
  g.fillStyle(0x5a1e14).fillRect(b.x, b.y + 2, b.w, b.h);
  g.fillStyle(0xd0603f).fillRect(b.x, b.y, b.w, b.h - 2);
  g.lineStyle(2, 0x7a2e22, 1);
  const rowH = Math.max(8, Math.min(12, b.h / 2));
  for (let y = b.y, r = 0; y < b.y + b.h - 1; y += rowH, r++) {
    if (y > b.y) g.lineBetween(b.x, y, b.x + b.w, y);
    for (let x = b.x + (r % 2 ? 10 : 20); x < b.x + b.w - 3; x += 20) {
      g.lineBetween(x, y, x, Math.min(y + rowH, b.y + b.h - 2));
    }
  }
  g.fillStyle(0xf09070).fillRect(b.x + 2, b.y + 1, b.w - 4, 2);
  // cracks: fewer hp left -> more cracks (deterministic per block id)
  const cracks = Math.max(0, 3 - b.hp);
  g.lineStyle(2, 0x2a0c08, 0.9);
  let s = b.id * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < cracks; i++) {
    let x = b.x + b.w * (0.2 + rnd() * 0.6);
    let y = b.y;
    g.beginPath();
    g.moveTo(x, y);
    while (y < b.y + b.h - 3) {
      x += (rnd() - 0.5) * 10;
      y += 4 + rnd() * 5;
      g.lineTo(Phaser.Math.Clamp(x, b.x + 1, b.x + b.w - 1), Math.min(y, b.y + b.h - 2));
    }
    g.strokePath();
  }
}
