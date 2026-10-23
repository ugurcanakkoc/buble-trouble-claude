import Phaser from 'phaser';
import type { Projectile } from '../../sim';

/** Ropes (zig-zag) with arrow tips and gun bullets, redrawn each frame on one Graphics. */
export class ProjectileRenderer {
  private g: Phaser.GameObjects.Graphics;
  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(3);
  }

  update(list: Projectile[], tick: number): void {
    const g = this.g.clear();
    for (const p of list) {
      if (p.kind === 'gun') {
        g.fillStyle(0xffe066, 0.35).fillCircle(p.x, p.y, 7);
        g.fillStyle(0xfff3b0).fillRoundedRect(p.x - 2.5, p.y - 7, 5, 14, 2.5);
        continue;
      }
      const stuck = p.stuckUntil > 0;
      const color = stuck ? 0xb06bff : p.kind === 'sticky' ? 0xd9b8ff : 0xe8ecff;
      const top = p.y + 14;
      const phase = (tick >> 1) % 2 ? 3 : -3; // a little shimmer along the rope
      g.lineStyle(3.5, 0x000000, 0.25);
      zig(g, p.x + 1, top, p.baseY, phase);
      g.lineStyle(3, color, 1);
      zig(g, p.x, top, p.baseY, phase);
      // tip
      g.fillStyle(0x9aa4b8).fillRect(p.x - 2, p.y + 12, 4, 6);
      g.fillStyle(stuck ? 0xd9b8ff : 0xffffff).fillTriangle(p.x, p.y - 2, p.x - 9, p.y + 14, p.x + 9, p.y + 14);
      g.lineStyle(2, 0x3a4060, 1).strokeTriangle(p.x, p.y - 2, p.x - 9, p.y + 14, p.x + 9, p.y + 14);
    }
  }
}

function zig(g: Phaser.GameObjects.Graphics, x: number, top: number, bottom: number, amp: number) {
  g.beginPath();
  g.moveTo(x, bottom);
  let i = 0;
  for (let y = bottom - 6; y > top; y -= 6) g.lineTo(x + (i++ % 2 ? amp : -amp), y);
  g.lineTo(x, top);
  g.strokePath();
}
