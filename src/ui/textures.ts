// All art is procedural: drawn into canvas textures (2x resolution, displayed at 0.5 scale so it
// stays crisp when FIT scales the game up on big screens).
import Phaser from 'phaser';
import { BALL_RADIUS, PLAYER_H, PLAYER_W, type BallSize, type PowerUpKind } from '../sim';

export const RES = 2;
export const FONT = "Fredoka, 'Trebuchet MS', system-ui, sans-serif";

const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
/** amt > 0 mixes toward white, < 0 toward black. */
export function shade(c: number, amt: number): string {
  const t = amt < 0 ? 0 : 255;
  const k = Math.abs(amt);
  const [r, g, b] = rgb(c).map((v) => Math.round(v + (t - v) * k));
  return `rgb(${r},${g},${b})`;
}
export const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

function canvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
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

export function ballTexture(scene: Phaser.Scene, size: BallSize, color: number): string {
  const r = BALL_RADIUS[size];
  const d = r * 2 + 4;
  return canvas(scene, `ball${size}_${color}`, d, d, (g) => {
    const c = d / 2;
    const grad = g.createRadialGradient(c - r * 0.35, c - r * 0.4, r * 0.1, c, c, r);
    grad.addColorStop(0, shade(color, 0.55));
    grad.addColorStop(0.45, hex(color));
    grad.addColorStop(1, shade(color, -0.45));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(c, c, r, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = Math.max(1.5, r * 0.06);
    g.strokeStyle = shade(color, -0.6);
    g.stroke();
    // rim light
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = Math.max(1, r * 0.08);
    g.beginPath();
    g.arc(c, c, r * 0.82, Math.PI * 0.15, Math.PI * 0.6);
    g.stroke();
    // glossy highlight
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath();
    g.ellipse(c - r * 0.38, c - r * 0.45, r * 0.3, r * 0.17, -0.7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.arc(c - r * 0.05, c - r * 0.62, Math.max(1, r * 0.07), 0, Math.PI * 2);
    g.fill();
  });
}

/** Texture box is PLAYER_W+16 wide, PLAYER_H+8 tall; feet at the bottom-center. Faces right. */
export const PLAYER_TEX_W = PLAYER_W + 16;
export const PLAYER_TEX_H = PLAYER_H + 8;

export function playerTexture(scene: Phaser.Scene, color: number): string {
  const W = PLAYER_TEX_W;
  const H = PLAYER_TEX_H;
  return canvas(scene, `player_${color}`, W, H, (g) => {
    const cx = W / 2;
    const bw = PLAYER_W;
    const top = H - PLAYER_H + 8;
    // horns
    const horn = (dir: -1 | 1) => {
      g.fillStyle = '#fff3d6';
      g.strokeStyle = '#8a6a3a';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(cx + dir * bw * 0.18, top + 6);
      g.quadraticCurveTo(cx + dir * bw * 0.62, top - 2, cx + dir * bw * 0.58, top - 10);
      g.quadraticCurveTo(cx + dir * bw * 0.5, top + 2, cx + dir * bw * 0.4, top + 9);
      g.closePath();
      g.fill();
      g.stroke();
    };
    horn(-1);
    horn(1);
    // feet
    g.fillStyle = shade(color, -0.55);
    for (const dx of [-0.24, 0.24]) {
      g.beginPath();
      g.ellipse(cx + dx * bw + 2, H - 4, bw * 0.2, 4, 0, 0, Math.PI * 2);
      g.fill();
    }
    // body
    const body = g.createLinearGradient(0, top, 0, H);
    body.addColorStop(0, shade(color, 0.3));
    body.addColorStop(0.6, hex(color));
    body.addColorStop(1, shade(color, -0.35));
    g.fillStyle = body;
    g.strokeStyle = shade(color, -0.6);
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(cx - bw / 2, top, bw, H - top - 5, [bw * 0.48, bw * 0.48, 10, 10]);
    g.fill();
    g.stroke();
    // belly
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.beginPath();
    g.ellipse(cx + 2, H - 17, bw * 0.28, 9, 0, 0, Math.PI * 2);
    g.fill();
    // eyes (looking right)
    for (const dx of [-0.16, 0.2]) {
      const ex = cx + dx * bw + 2;
      const ey = top + 14;
      g.fillStyle = '#fff';
      g.beginPath();
      g.ellipse(ex, ey, 5.2, 6.4, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1b1030';
      g.beginPath();
      g.arc(ex + 2, ey + 1, 2.8, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(ex + 2.8, ey - 0.4, 1, 0, Math.PI * 2);
      g.fill();
    }
    // smile
    g.strokeStyle = '#1b1030';
    g.lineWidth = 1.8;
    g.beginPath();
    g.arc(cx + 4, top + 22, 4.5, 0.2, Math.PI - 0.6);
    g.stroke();
  });
}

const POWER: Record<PowerUpKind, { color: number; letter: string }> = {
  shield: { color: 0x3fa9ff, letter: 'S' },
  clock: { color: 0xffd23f, letter: 'C' },
  dynamite: { color: 0xff4040, letter: 'D' },
  life: { color: 0xff4f8b, letter: '+1' },
  time: { color: 0xff9a3f, letter: 'T' },
  double: { color: 0x4be37a, letter: '2x' },
  sticky: { color: 0xb06bff, letter: 'Y' },
  gun: { color: 0x9aa4b8, letter: 'G' },
};
export const POWER_SIZE = 30;

function powerShape(g: CanvasRenderingContext2D, kind: PowerUpKind, s: number) {
  const c = s / 2;
  g.beginPath();
  switch (kind) {
    case 'shield':
      g.moveTo(c, 2);
      g.lineTo(s - 3, 6);
      g.quadraticCurveTo(s - 3, s * 0.72, c, s - 1);
      g.quadraticCurveTo(3, s * 0.72, 3, 6);
      g.closePath();
      break;
    case 'clock':
      g.arc(c, c, c - 2, 0, Math.PI * 2);
      break;
    case 'dynamite':
      g.roundRect(c - 8, 6, 16, s - 8, 4);
      break;
    case 'life':
      g.moveTo(c, s - 2);
      g.bezierCurveTo(-4, s * 0.5, 4, -2, c, s * 0.3);
      g.bezierCurveTo(s - 4, -2, s + 4, s * 0.5, c, s - 2);
      break;
    case 'time':
      g.moveTo(5, 2);
      g.lineTo(s - 5, 2);
      g.lineTo(c + 3, c);
      g.lineTo(s - 5, s - 2);
      g.lineTo(5, s - 2);
      g.lineTo(c - 3, c);
      g.closePath();
      break;
    case 'double':
      g.roundRect(2, 2, s - 4, s - 4, 7);
      break;
    case 'sticky':
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 ? c * 0.62 : c - 1;
        g.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr);
      }
      g.closePath();
      break;
    case 'gun':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.lineTo(c + Math.cos(a) * (c - 1), c + Math.sin(a) * (c - 1));
      }
      g.closePath();
      break;
  }
}

export function powerTexture(scene: Phaser.Scene, kind: PowerUpKind): string {
  const s = POWER_SIZE;
  const { color, letter } = POWER[kind];
  return canvas(scene, `pow_${kind}`, s, s, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, shade(color, 0.45));
    grad.addColorStop(1, shade(color, -0.25));
    powerShape(g, kind, s);
    g.fillStyle = grad;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = shade(color, -0.6);
    g.stroke();
    if (kind === 'dynamite') {
      g.strokeStyle = '#3a2a1a';
      g.beginPath();
      g.moveTo(s / 2, 6);
      g.quadraticCurveTo(s / 2 + 6, 2, s / 2 + 4, 0);
      g.stroke();
    }
    if (kind === 'clock') {
      g.strokeStyle = 'rgba(0,0,0,.35)';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.beginPath();
        g.moveTo(s / 2 + Math.cos(a) * 11, s / 2 + Math.sin(a) * 11);
        g.lineTo(s / 2 + Math.cos(a) * 13, s / 2 + Math.sin(a) * 13);
        g.stroke();
      }
    }
    g.font = `700 ${letter.length > 1 ? 13 : 16}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(0,0,0,.55)';
    const ty = kind === 'life' ? s * 0.5 : s / 2 + 1;
    g.strokeText(letter, s / 2, ty);
    g.fillStyle = '#fff';
    g.fillText(letter, s / 2, ty);
  });
}

export function heartTexture(scene: Phaser.Scene): string {
  return canvas(scene, 'heart', 24, 22, (g) => {
    g.beginPath();
    g.moveTo(12, 21);
    g.bezierCurveTo(-6, 9, 2, -4, 12, 5);
    g.bezierCurveTo(22, -4, 30, 9, 12, 21);
    const grad = g.createLinearGradient(0, 0, 0, 22);
    grad.addColorStop(0, '#ff8fb3');
    grad.addColorStop(1, '#e0245e');
    g.fillStyle = grad;
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = '#7a1033';
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,.7)';
    g.beginPath();
    g.ellipse(7, 7, 3, 2, -0.6, 0, Math.PI * 2);
    g.fill();
  });
}

export function sparkTexture(scene: Phaser.Scene): string {
  return canvas(scene, 'spark', 10, 10, (g) => {
    const grad = g.createRadialGradient(5, 5, 0, 5, 5, 5);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.8)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 10, 10);
  });
}

const SKIES: [number, number, number][] = [
  [0x1b2a6b, 0x5b7bd6, 0x2a3f8f],
  [0x3b1d5e, 0xc0609a, 0x5a2a7a],
  [0x0e4a4a, 0x47b39b, 0x1d6b5f],
  [0x5a2a14, 0xe39a4a, 0x7a3a1a],
  [0x16213e, 0x4a5a9a, 0x283a6a],
];

/** Background per level (5 palettes cycling): sky gradient, bokeh, hills. Logical 960x480. */
export function bgTexture(scene: Phaser.Scene, levelIndex: number): string {
  const v = levelIndex % SKIES.length;
  const [top, bottom, hill] = SKIES[v];
  return canvas(scene, `bg${v}`, 960, 480, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 480);
    grad.addColorStop(0, hex(top));
    grad.addColorStop(1, hex(bottom));
    g.fillStyle = grad;
    g.fillRect(0, 0, 960, 480);
    let seed = v * 977 + 13;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(255,255,255,${0.03 + rnd() * 0.06})`;
      g.beginPath();
      g.arc(rnd() * 960, rnd() * 330, 8 + rnd() * 50, 0, Math.PI * 2);
      g.fill();
    }
    for (const [amp, base, alpha, f] of [[40, 380, 0.5, 0.006], [28, 420, 0.85, 0.011]] as const) {
      g.fillStyle = hex(hill);
      g.globalAlpha = alpha;
      g.beginPath();
      g.moveTo(0, 480);
      for (let x = 0; x <= 960; x += 16) g.lineTo(x, base - Math.sin(x * f + v) * amp - Math.sin(x * f * 2.3) * amp * 0.4);
      g.lineTo(960, 480);
      g.fill();
    }
    g.globalAlpha = 1;
  });
}
