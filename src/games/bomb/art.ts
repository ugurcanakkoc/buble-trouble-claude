// Procedural art for Bomba (canvas textures at 2x, shown at 0.5 scale). No external assets.
import Phaser from 'phaser';
import { RES, shade, hex } from '../../ui/textures';
import type { ItemKind } from './sim';

export const T = 36; // tile size in logical px

function canvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, Math.ceil(w * RES), Math.ceil(h * RES));
  if (!tex) return key;
  const g = tex.getContext();
  g.save();
  g.scale(RES, RES);
  draw(g);
  g.restore();
  tex.refresh();
  return key;
}

function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** Checkered grass floor for the whole arena (cols×rows tiles). */
export function floorTexture(scene: Phaser.Scene, cols: number, rows: number): string {
  return canvas(scene, `bomb_floor_${cols}x${rows}`, cols * T, rows * T, (g) => {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        g.fillStyle = (c + r) % 2 ? '#3f8f4a' : '#45994f';
        g.fillRect(c * T, r * T, T, T);
        g.fillStyle = 'rgba(255,255,255,0.05)';
        g.fillRect(c * T + 5, r * T + 7, 3, 3);
        g.fillRect(c * T + 22, r * T + 24, 2, 2);
      }
  });
}

export function wallTexture(scene: Phaser.Scene, sudden = false): string {
  return canvas(scene, sudden ? 'bomb_wall_sd' : 'bomb_wall', T, T, (g) => {
    const base = sudden ? 0x8a5a6a : 0x6d7896;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(3, 5, T - 3, T - 3); // drop shadow
    g.fillStyle = shade(base, -0.35);
    rrect(g, 1, 1, T - 2, T - 2, 5);
    g.fill();
    g.fillStyle = hex(base);
    rrect(g, 1, 1, T - 2, T - 7, 5);
    g.fill();
    g.fillStyle = shade(base, 0.3);
    rrect(g, 4, 3, T - 8, 5, 2);
    g.fill();
    g.strokeStyle = shade(base, -0.25);
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(4, T / 2 - 2);
    g.lineTo(T - 4, T / 2 - 2);
    g.moveTo(T / 2, 9);
    g.lineTo(T / 2, T / 2 - 2);
    g.stroke();
    if (sudden) {
      g.fillStyle = '#ffd23f';
      for (let i = 0; i < 3; i++) g.fillRect(6 + i * 10, T - 9, 5, 3);
    }
  });
}

export function crateTexture(scene: Phaser.Scene): string {
  return canvas(scene, 'bomb_crate', T, T, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(4, 6, T - 4, T - 4);
    g.fillStyle = '#8a5a2b';
    rrect(g, 2, 2, T - 4, T - 4, 4);
    g.fill();
    g.fillStyle = '#c48a4a';
    rrect(g, 4, 4, T - 8, T - 10, 3);
    g.fill();
    g.strokeStyle = '#8a5a2b';
    g.lineWidth = 2;
    for (const y of [12, 20]) {
      g.beginPath();
      g.moveTo(5, y);
      g.lineTo(T - 5, y);
      g.stroke();
    }
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(6, 6);
    g.lineTo(T - 6, T - 9);
    g.stroke();
    g.fillStyle = '#e8c48a';
    for (const [x, y] of [[6, 6], [T - 8, 6], [6, T - 11], [T - 8, T - 11]]) g.fillRect(x, y, 2, 2);
  });
}

export function chipTexture(scene: Phaser.Scene): string {
  return canvas(scene, 'bomb_chip', 6, 6, (g) => {
    g.fillStyle = '#c48a4a';
    g.fillRect(0, 0, 6, 6);
    g.fillStyle = '#8a5a2b';
    g.fillRect(0, 4, 6, 2);
  });
}

export function bombTexture(scene: Phaser.Scene): string {
  return canvas(scene, 'bomb_bomb', T, T, (g) => {
    const cx = T / 2;
    const cy = T / 2 + 3;
    const r = 12;
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.ellipse(cx + 2, cy + r - 1, r * 0.9, 4, 0, 0, Math.PI * 2);
    g.fill();
    const grad = g.createRadialGradient(cx - 4, cy - 5, 2, cx, cy, r);
    grad.addColorStop(0, '#6a6f9a');
    grad.addColorStop(0.5, '#2a2d4a');
    grad.addColorStop(1, '#0f1020');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath();
    g.ellipse(cx - 5, cy - 5, 3.5, 2, -0.7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#9aa0c0';
    g.fillRect(cx - 3, cy - r - 3, 6, 4);
    g.strokeStyle = '#d8c8a0';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx, cy - r - 3);
    g.quadraticCurveTo(cx + 2, cy - r - 8, cx + 6, cy - r - 7);
    g.stroke();
  });
}

export function sparkTexture(scene: Phaser.Scene): string {
  return canvas(scene, 'bomb_spark', 12, 12, (g) => {
    const grad = g.createRadialGradient(6, 6, 0, 6, 6, 6);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.4, '#ffe14a');
    grad.addColorStop(1, 'rgba(255,120,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 12, 12);
  });
}

/** Flame pieces, all drawn horizontally (arm/end point right); rotate for vertical. */
export function flameTexture(scene: Phaser.Scene, kind: 'center' | 'arm' | 'end'): string {
  return canvas(scene, `bomb_flame_${kind}`, T, T, (g) => {
    const layers: [string, number][] = [['#ff6a1a', 15], ['#ffb52e', 10], ['#fff3b0', 5]];
    const m = T / 2;
    for (const [col, hw] of layers) {
      g.fillStyle = col;
      if (kind === 'arm') g.fillRect(0, m - hw, T, hw * 2);
      else if (kind === 'end') {
        g.beginPath();
        g.moveTo(0, m - hw);
        g.lineTo(T - 16 + hw * 0.4, m - hw);
        g.arc(T - 16 + hw * 0.4, m, hw, -Math.PI / 2, Math.PI / 2);
        g.lineTo(0, m + hw);
        g.closePath();
        g.fill();
      } else {
        g.beginPath();
        g.arc(m, m, hw + 3, 0, Math.PI * 2);
        g.fill();
        g.fillRect(0, m - hw, T, hw * 2);
        g.fillRect(m - hw, 0, hw * 2, T);
      }
    }
  });
}

const ITEM_STYLE: Record<ItemKind, { bg: number; letter: string }> = {
  bomb: { bg: 0x3b4a9a, letter: 'B' },
  fire: { bg: 0xd2452b, letter: 'A' },
  speed: { bg: 0x2a9a8a, letter: 'H' },
  kick: { bg: 0x8a4ac0, letter: 'T' },
  shield: { bg: 0x2f86c9, letter: 'K' },
  maxfire: { bg: 0xe0a01a, letter: 'M' },
  skull: { bg: 0x3a3a3a, letter: '!' },
};

function glyph(g: CanvasRenderingContext2D, k: ItemKind, cx: number, cy: number) {
  g.lineJoin = 'round';
  switch (k) {
    case 'bomb':
      g.fillStyle = '#14152a';
      g.beginPath();
      g.arc(cx, cy + 2, 8, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#ffd23f';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx + 4, cy - 5);
      g.lineTo(cx + 8, cy - 9);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.beginPath();
      g.arc(cx - 3, cy - 1, 2, 0, Math.PI * 2);
      g.fill();
      break;
    case 'fire':
    case 'maxfire': {
      const s = k === 'maxfire' ? 1.2 : 1;
      g.fillStyle = '#ffb52e';
      g.beginPath();
      g.moveTo(cx, cy - 11 * s);
      g.quadraticCurveTo(cx + 10 * s, cy, cx + 6 * s, cy + 7 * s);
      g.quadraticCurveTo(cx, cy + 11 * s, cx - 6 * s, cy + 7 * s);
      g.quadraticCurveTo(cx - 10 * s, cy, cx, cy - 11 * s);
      g.fill();
      g.fillStyle = '#fff3b0';
      g.beginPath();
      g.arc(cx, cy + 4 * s, 3.5 * s, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'speed':
      g.fillStyle = '#fff';
      for (const dx of [-6, 2]) {
        g.beginPath();
        g.moveTo(cx + dx, cy - 8);
        g.lineTo(cx + dx + 7, cy);
        g.lineTo(cx + dx, cy + 8);
        g.lineTo(cx + dx + 3, cy);
        g.closePath();
        g.fill();
      }
      break;
    case 'kick':
      g.fillStyle = '#fff';
      rrect(g, cx - 7, cy - 9, 7, 12, 2);
      g.fill();
      rrect(g, cx - 7, cy + 1, 15, 7, 3);
      g.fill();
      g.fillStyle = '#14152a';
      g.beginPath();
      g.arc(cx + 9, cy - 4, 3.5, 0, Math.PI * 2);
      g.fill();
      break;
    case 'shield':
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(cx, cy - 10);
      g.lineTo(cx + 9, cy - 6);
      g.quadraticCurveTo(cx + 8, cy + 6, cx, cy + 11);
      g.quadraticCurveTo(cx - 8, cy + 6, cx - 9, cy - 6);
      g.closePath();
      g.fill();
      g.fillStyle = '#ff5a7a';
      g.beginPath();
      g.arc(cx - 2.5, cy - 1, 3, 0, Math.PI * 2);
      g.arc(cx + 2.5, cy - 1, 3, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(cx - 5.5, cy);
      g.lineTo(cx, cy + 6);
      g.lineTo(cx + 5.5, cy);
      g.fill();
      break;
    case 'skull':
      g.fillStyle = '#e8ffe0';
      g.beginPath();
      g.arc(cx, cy - 2, 8, 0, Math.PI * 2);
      g.fill();
      g.fillRect(cx - 5, cy + 3, 10, 6);
      g.fillStyle = '#1a1a1a';
      g.beginPath();
      g.arc(cx - 3.5, cy - 2, 2.5, 0, Math.PI * 2);
      g.arc(cx + 3.5, cy - 2, 2.5, 0, Math.PI * 2);
      g.fill();
      g.fillRect(cx - 3, cy + 5, 1.5, 4);
      g.fillRect(cx + 1.5, cy + 5, 1.5, 4);
      break;
  }
}

export function itemTexture(scene: Phaser.Scene, k: ItemKind): string {
  return canvas(scene, `bomb_item_${k}`, T, T, (g) => {
    const st = ITEM_STYLE[k];
    g.fillStyle = 'rgba(0,0,0,0.3)';
    rrect(g, 5, 6, T - 8, T - 8, 7);
    g.fill();
    g.fillStyle = shade(st.bg, -0.35);
    rrect(g, 3, 3, T - 6, T - 6, 7);
    g.fill();
    g.fillStyle = hex(st.bg);
    rrect(g, 3, 3, T - 6, T - 9, 7);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.22)';
    rrect(g, 6, 5, T - 12, 6, 3);
    g.fill();
    glyph(g, k, T / 2 - 1, T / 2 - 1);
    g.font = "700 10px Fredoka, 'Trebuchet MS', sans-serif";
    g.fillStyle = '#fff';
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 2.5;
    g.strokeText(st.letter, T - 12, T - 6);
    g.fillText(st.letter, T - 12, T - 6);
  });
}

export type Facing = 'down' | 'up' | 'side';
export const PW = 40;
export const PH = 46;

/** Chubby bomber: frame 0 idle, 1/2 walking (alternating feet). Side faces right. Feet at bottom. */
export function playerTexture(scene: Phaser.Scene, color: number, facing: Facing, frame: number): string {
  return canvas(scene, `bomb_p_${color}_${facing}_${frame}`, PW, PH, (g) => {
    const cx = PW / 2;
    const bob = frame === 0 ? 0 : -1;
    const step = frame === 1 ? 1 : frame === 2 ? -1 : 0;
    // shadow
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath();
    g.ellipse(cx, PH - 3, 12, 3.5, 0, 0, Math.PI * 2);
    g.fill();
    // feet
    g.fillStyle = '#3a2a4a';
    const fy = PH - 6;
    if (facing === 'side') {
      g.beginPath();
      g.ellipse(cx - 3 + step * 4, fy, 6, 3.5, 0, 0, Math.PI * 2);
      g.ellipse(cx + 3 - step * 4, fy, 6, 3.5, 0, 0, Math.PI * 2);
      g.fill();
    } else {
      g.beginPath();
      g.ellipse(cx - 6, fy - Math.max(0, step) * 2, 5.5, 3.5, 0, 0, Math.PI * 2);
      g.ellipse(cx + 6, fy - Math.max(0, -step) * 2, 5.5, 3.5, 0, 0, Math.PI * 2);
      g.fill();
    }
    // body
    const by = PH - 15 + bob;
    const bodyGrad = g.createRadialGradient(cx - 4, by - 4, 2, cx, by, 13);
    bodyGrad.addColorStop(0, shade(color, 0.35));
    bodyGrad.addColorStop(1, shade(color, -0.3));
    g.fillStyle = bodyGrad;
    g.beginPath();
    g.ellipse(cx, by, 11, 9, 0, 0, Math.PI * 2);
    g.fill();
    // belt
    g.fillStyle = shade(color, -0.55);
    g.fillRect(cx - 10, by + 1, 20, 3);
    // hands
    g.fillStyle = '#fff3e6';
    const hs = facing === 'side' ? [[cx + 2 + step * 3, by + 1]] : [[cx - 12, by + step], [cx + 12, by - step]];
    for (const [x, y] of hs) {
      g.beginPath();
      g.arc(x, y, 3.5, 0, Math.PI * 2);
      g.fill();
    }
    // head
    const hy = 15 + bob;
    const headGrad = g.createRadialGradient(cx - 5, hy - 6, 2, cx, hy, 15);
    headGrad.addColorStop(0, '#ffffff');
    headGrad.addColorStop(1, '#d8dcef');
    g.fillStyle = headGrad;
    g.beginPath();
    g.arc(cx, hy, 13, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = shade(color, -0.45);
    g.lineWidth = 1.5;
    g.stroke();
    // antenna ball in player color
    g.strokeStyle = '#555a7a';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(cx, hy - 13);
    g.lineTo(cx + (facing === 'side' ? -2 : 0), hy - 18);
    g.stroke();
    g.fillStyle = hex(color);
    g.beginPath();
    g.arc(cx + (facing === 'side' ? -2 : 0), hy - 19, 3.5, 0, Math.PI * 2);
    g.fill();
    if (facing === 'up') {
      g.fillStyle = hex(color);
      rrect(g, cx - 9, hy - 2, 18, 5, 2); // headband from behind
      g.fill();
      return;
    }
    // face visor
    const fx = facing === 'side' ? cx + 4 : cx;
    g.fillStyle = shade(color, 0.55);
    rrect(g, fx - 9, hy - 6, 18, 12, 6);
    g.fill();
    g.fillStyle = '#14152a';
    const eyes = facing === 'side' ? [fx + 3] : [fx - 4, fx + 4];
    for (const ex of eyes) {
      rrect(g, ex - 1.6, hy - 4, 3.2, 7, 1.6);
      g.fill();
    }
    // cheeks
    g.fillStyle = 'rgba(255,110,140,0.55)';
    for (const ex of facing === 'side' ? [fx + 7] : [fx - 8, fx + 8]) {
      g.beginPath();
      g.arc(ex, hy + 3, 2, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Round head portrait for the HUD. */
export function portraitTexture(scene: Phaser.Scene, color: number): string {
  return canvas(scene, `bomb_portrait_${color}`, 52, 52, (g) => {
    g.fillStyle = hex(color);
    g.beginPath();
    g.arc(26, 26, 25, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = shade(color, -0.3);
    g.beginPath();
    g.arc(26, 26, 25, 0.2 * Math.PI, 0.8 * Math.PI);
    g.fill();
    g.fillStyle = '#f4f4ff';
    g.beginPath();
    g.arc(26, 26, 18, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = shade(color, 0.55);
    rrect(g, 14, 19, 24, 15, 7);
    g.fill();
    g.fillStyle = '#14152a';
    for (const x of [21, 31]) {
      rrect(g, x - 2, 21, 4, 9, 2);
      g.fill();
    }
  });
}

export function starTexture(scene: Phaser.Scene, on: boolean): string {
  return canvas(scene, on ? 'bomb_star_on' : 'bomb_star_off', 20, 20, (g) => {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 4 : 9;
      g.lineTo(10 + Math.cos(a) * r, 10 + Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = on ? '#ffd23f' : 'rgba(255,255,255,0.15)';
    g.fill();
    g.strokeStyle = on ? '#a07a10' : 'rgba(255,255,255,0.3)';
    g.lineWidth = 1.2;
    g.stroke();
  });
}
