// Mutfak Kaosu procedural art: 2D canvas drawings, cheerful flat style with soft shadows. No external assets.
// Tile = 64 px, item icons 32 px, player strip 256x64 (u,d,l,r). Keys come from assets.ts.
import Phaser from 'phaser';
import { ITEM_TEX, STATION_TEX, TEX } from './assets';
import type { ItemTex } from './assets';
import type { StationKind } from './types';

export const TILE = 64;
type G = CanvasRenderingContext2D;

function rr(g: G, x: number, y: number, w: number, h: number, r: number, fill?: string, stroke?: string, lw = 2) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}
function circ(g: G, x: number, y: number, r: number, fill?: string, stroke?: string, lw = 2) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}
function ell(g: G, x: number, y: number, rx: number, ry: number, fill: string, stroke?: string, lw = 2) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fillStyle = fill; g.fill();
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}
function poly(g: G, pts: number[][], fill: string, stroke?: string, lw = 2) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fillStyle = fill; g.fill();
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}
function line(g: G, x1: number, y1: number, x2: number, y2: number, c: string, lw = 2) {
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
  g.strokeStyle = c; g.lineWidth = lw; g.lineCap = 'round'; g.stroke();
}
function smile(g: G, x: number, y: number, r: number) {
  g.beginPath(); g.arc(x, y, r, 0.15 * Math.PI, 0.85 * Math.PI);
  g.strokeStyle = INK; g.lineWidth = 1.8; g.lineCap = 'round'; g.stroke();
}
function text(g: G, s: string, x: number, y: number, size: number, color = INK) {
  g.font = `bold ${size}px Fredoka, sans-serif`;
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(s, x, y);
}

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const g = tex.getContext();
  g.lineJoin = 'round';
  draw(g);
  tex.refresh();
}

const INK = '#3a2a22';

// ---------- items (32x32) ----------
const ITEMS: Record<ItemTex, (g: G) => void> = {
  domates: (g) => {
    circ(g, 16, 18, 11, '#e63b2e', INK);
    circ(g, 12, 14, 3, 'rgba(255,255,255,.45)');
    poly(g, [[16, 8], [11, 6], [14, 10], [16, 12], [18, 10], [21, 6]], '#3fa34d', INK, 1.5);
  },
  domatesD: (g) => {
    for (const [x, y] of [[11, 12], [21, 14], [14, 23], [23, 24]]) {
      circ(g, x, y, 7, '#e63b2e', INK, 1.5);
      circ(g, x, y, 3.5, '#ff8a70');
      circ(g, x, y, 1, '#ffe7a0');
    }
  },
  sogan: (g) => {
    ell(g, 16, 19, 11, 10, '#e9b872', INK);
    line(g, 12, 12, 11, 26, '#c98f48', 1.5); line(g, 20, 12, 21, 26, '#c98f48', 1.5);
    poly(g, [[16, 3], [19, 10], [13, 10]], '#9ccf5a', INK, 1.5);
  },
  soganD: (g) => {
    for (const [x, y] of [[10, 12], [22, 11], [16, 21], [8, 24], [25, 23]]) {
      circ(g, x, y, 5.5, '#fff4dd', INK, 1.5);
      circ(g, x, y, 2.5, undefined, '#d9b27a', 1.5);
    }
  },
  kiyma: (g) => {
    ell(g, 16, 20, 12, 8, '#d9667a', INK);
    for (const [x, y] of [[10, 18], [17, 15], [22, 21], [14, 23]]) circ(g, x, y, 3, '#f08fa0');
  },
  kiymaD: (g) => {
    ell(g, 16, 20, 12, 8, '#a8553f', INK);
    for (const [x, y] of [[10, 18], [17, 15], [22, 21], [14, 23], [20, 17]]) circ(g, x, y, 2.5, '#7a3a2c');
    circ(g, 8, 22, 1.8, '#4f9a45'); circ(g, 24, 18, 1.8, '#4f9a45');
  },
  hamur: (g) => {
    ell(g, 16, 18, 12, 10, '#fff3d6', INK);
    ell(g, 12, 14, 5, 3, 'rgba(255,255,255,.8)');
  },
  mercimek: (g) => {
    rr(g, 5, 10, 22, 16, 6, '#d9873a', INK);
    for (let i = 0; i < 12; i++) ell(g, 9 + (i % 4) * 5, 14 + ((i * 7) % 3) * 4 + (i % 2), 2, 1.4, '#f2b24c');
  },
  mercimekD: (g) => {
    rr(g, 5, 10, 22, 16, 6, '#f6c25a', INK);
    line(g, 9, 15, 23, 15, '#ffe19a', 2); line(g, 9, 20, 20, 20, '#ffe19a', 2);
  },
  lavas: (g) => {
    ell(g, 16, 17, 13, 10, '#f1d09a', INK);
    ell(g, 16, 17, 9, 6, '#f8e2b8');
    for (const [x, y] of [[11, 15], [20, 19], [17, 14]]) circ(g, x, y, 1.3, '#c99a5a');
  },
  et: (g) => {
    ell(g, 16, 18, 12, 9, '#c4473c', INK);
    ell(g, 13, 16, 5, 3, '#f08a7c');
    circ(g, 21, 21, 2, '#fbe3d0');
  },
  cay: (g) => {
    ell(g, 16, 25, 12, 4, '#f3f3f3', INK, 1.5);
    poly(g, [[10, 8], [22, 8], [20, 14], [18, 22], [14, 22], [12, 14]], 'rgba(255,255,255,.7)', INK, 1.5);
    poly(g, [[11, 13], [21, 13], [19, 14], [18, 21], [14, 21], [13, 14]], '#b3261e');
    line(g, 12, 10, 12, 12, 'rgba(255,255,255,.9)', 1.5);
  },
  tabak: (g) => {
    circ(g, 16, 17, 13, '#ffffff', INK);
    circ(g, 16, 17, 8.5, '#e8eef5', '#c3ccd8', 1.5);
  },
  kirli: (g) => {
    circ(g, 16, 17, 13, '#e6e2d6', INK);
    circ(g, 16, 17, 8.5, '#cfc7b2', '#a99f86', 1.5);
    circ(g, 13, 15, 2.5, '#8a5a2b'); circ(g, 19, 20, 2, '#b3261e'); circ(g, 20, 14, 1.5, '#8a5a2b');
  },
  tencere: (g) => {
    rr(g, 5, 12, 22, 14, 4, '#8f9bab', INK);
    rr(g, 4, 9, 24, 5, 2, '#b7c1ce', INK, 1.5);
    rr(g, 1, 14, 5, 4, 2, INK); rr(g, 26, 14, 5, 4, 2, INK);
    rr(g, 8, 15, 4, 8, 2, 'rgba(255,255,255,.4)');
  },
  lahmacunRaw: (g) => {
    circ(g, 16, 17, 13, '#f6e6c4', INK);
    circ(g, 16, 17, 10, '#e58a73');
    for (const [x, y] of [[12, 13], [20, 15], [14, 21], [21, 21]]) circ(g, x, y, 1.6, '#b34a3a');
  },
  lahmacun: (g) => {
    circ(g, 16, 17, 13, '#d79a4b', INK);
    circ(g, 16, 17, 10, '#b5502f');
    for (const [x, y] of [[12, 13], [20, 15], [14, 21], [21, 21]]) circ(g, x, y, 1.6, '#7e2f1c');
    for (const [x, y] of [[16, 12], [10, 18], [22, 18], [16, 23]]) circ(g, x, y, 1.8, '#4f9a45');
  },
  corba: (g) => {
    ell(g, 16, 18, 13, 11, '#ffffff', INK);
    ell(g, 16, 17, 10, 7.5, '#e8821e');
    ell(g, 13, 15, 4, 2, '#f7ae5a');
    circ(g, 21, 18, 1.5, '#ffe8a0');
    g.strokeStyle = 'rgba(120,120,120,.6)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(12, 8); g.quadraticCurveTo(9, 4, 13, 2); g.moveTo(20, 8); g.quadraticCurveTo(23, 4, 19, 2); g.stroke();
  },
  yanik: (g) => {
    poly(g, [[5, 20], [9, 9], [15, 14], [19, 6], [25, 15], [28, 21], [24, 27], [9, 27]], '#2a2523', '#000', 1.5);
    circ(g, 14, 21, 2, '#5a4a44'); circ(g, 21, 20, 1.5, '#5a4a44');
    poly(g, [[16, 4], [18, 9], [14, 9]], '#ff7a1a');
  },
  paket: (g) => {
    rr(g, 4, 8, 24, 19, 3, '#c98f55', INK);
    rr(g, 4, 8, 24, 6, 3, '#dba66c', INK, 1.5);
    rr(g, 13, 8, 6, 19, 0, '#f2dfae');
    rr(g, 18, 18, 7, 5, 1, '#ffffff', '#c3ccd8', 1);
  },
  durum: (g) => {
    g.save(); g.translate(16, 17); g.rotate(-0.5);
    rr(g, -13, -7, 26, 14, 7, '#e8c68a', INK);
    rr(g, -13, -7, 12, 14, 7, '#b5502f');
    circ(g, -7, 0, 3, '#4f9a45');
    rr(g, 2, -7, 11, 14, 4, '#ffffff', INK, 1.5);
    g.restore();
  },
};

// ---------- stations (64x64) ----------
const WOOD = '#b9854e';
const WOOD_D = '#8a5a2b';
const STEEL = '#c9d2dc';
const STEEL_D = '#8f9bab';

function base(g: G, top: string, side: string) {
  ell(g, 32, 58, 28, 4, 'rgba(0,0,0,.25)');
  rr(g, 3, 6, 58, 54, 8, side, INK);
  rr(g, 3, 4, 58, 46, 8, top, INK);
  rr(g, 8, 8, 48, 8, 4, 'rgba(255,255,255,.28)');
}

const STATIONS: Record<StationKind, (g: G) => void> = {
  crate: (g) => {
    ell(g, 32, 58, 28, 4, 'rgba(0,0,0,.25)');
    rr(g, 4, 10, 56, 48, 5, WOOD, INK);
    rr(g, 9, 14, 46, 26, 3, '#6e4520');
    for (const y of [20, 32, 44]) line(g, 4, y + 6, 60, y + 6, WOOD_D, 2);
    rr(g, 4, 10, 8, 48, 3, WOOD_D); rr(g, 52, 10, 8, 48, 3, WOOD_D);
    circ(g, 8, 14, 1.5, '#d6c19a'); circ(g, 56, 14, 1.5, '#d6c19a');
  },
  counter: (g) => {
    base(g, '#e4d2b0', WOOD);
    line(g, 6, 52, 58, 52, WOOD_D, 2);
    rr(g, 24, 44, 16, 4, 2, WOOD_D);
  },
  board: (g) => {
    base(g, '#e4d2b0', WOOD);
    rr(g, 10, 12, 44, 30, 5, '#f0c987', '#a77735');
    line(g, 16, 20, 40, 20, 'rgba(120,80,30,.35)', 2); line(g, 16, 28, 46, 28, 'rgba(120,80,30,.35)', 2);
    circ(g, 48, 17, 2.5, '#a77735');
    poly(g, [[14, 36], [32, 34], [34, 38], [14, 40]], STEEL, INK, 1.5);
    rr(g, 32, 34, 14, 5, 2, '#c1442e', INK, 1.5);
  },
  stove: (g) => {
    base(g, '#434a57', '#2c313b');
    for (const [x, y] of [[20, 20], [44, 20], [20, 38], [44, 38]]) {
      circ(g, x, y, 9, '#20242c', '#6a7280'); circ(g, x, y, 5, undefined, '#6a7280', 1.5);
    }
    for (const x of [14, 26, 38, 50]) circ(g, x, 54, 3, '#e0a43a');
  },
  oven: (g) => {
    base(g, STEEL, STEEL_D);
    rr(g, 9, 14, 46, 32, 5, INK, INK);
    rr(g, 12, 17, 40, 26, 3, '#ffb347');
    rr(g, 14, 19, 14, 9, 2, 'rgba(255,255,255,.45)');
    rr(g, 12, 48, 40, 4, 2, '#e8edf2', INK, 1.5);
    for (const x of [18, 32, 46]) circ(g, x, 10, 2.5, INK);
  },
  doner: (g) => {
    base(g, '#5a606c', '#363b45');
    rr(g, 10, 12, 8, 34, 3, '#e8531e', INK, 1.5);
    rr(g, 46, 12, 8, 34, 3, '#e8531e', INK, 1.5);
    line(g, 32, 6, 32, 54, STEEL, 3);
    poly(g, [[23, 14], [41, 14], [44, 30], [40, 46], [24, 46], [20, 30]], '#9c5a2c', INK);
    poly(g, [[26, 16], [32, 16], [32, 44], [26, 44], [24, 30]], '#c07a3e');
    for (const y of [22, 30, 38]) line(g, 23, y, 41, y, '#7a4220', 1.5);
    circ(g, 32, 8, 3.5, STEEL, INK, 1.5);
  },
  tea: (g) => {
    base(g, '#e4d2b0', WOOD);
    ell(g, 32, 38, 15, 10, '#cfd6de', INK);
    rr(g, 20, 22, 24, 18, 6, '#d9dfe6', INK);
    ell(g, 32, 22, 12, 5, '#b9c2cc', INK);
    ell(g, 32, 15, 9, 6, '#d9dfe6', INK);
    circ(g, 32, 8, 3, '#b3261e', INK, 1.5);
    rr(g, 42, 28, 9, 4, 2, STEEL_D, INK, 1.5);
    circ(g, 32, 31, 4, 'rgba(255,255,255,.55)');
  },
  sink: (g) => {
    base(g, STEEL, STEEL_D);
    rr(g, 9, 14, 46, 28, 8, '#7fb7d9', INK);
    rr(g, 12, 17, 40, 22, 6, '#a9d7ef');
    line(g, 18, 24, 30, 24, 'rgba(255,255,255,.7)', 2);
    rr(g, 29, 6, 6, 10, 3, STEEL_D, INK, 1.5);
    circ(g, 32, 17, 3, STEEL, INK, 1.5);
    circ(g, 46, 30, 2, 'rgba(255,255,255,.8)'); circ(g, 42, 33, 1.5, 'rgba(255,255,255,.8)');
  },
  trash: (g) => {
    ell(g, 32, 58, 22, 4, 'rgba(0,0,0,.25)');
    poly(g, [[12, 18], [52, 18], [48, 56], [16, 56]], '#6c7a89', INK);
    for (const x of [24, 32, 40]) line(g, x, 24, x + (x - 32) * 0.15, 50, '#4e5a66', 2);
    ell(g, 32, 16, 23, 7, '#8795a4', INK);
    ell(g, 32, 16, 17, 4, '#2c313b');
    rr(g, 27, 8, 10, 4, 2, '#4e5a66', INK, 1.5);
  },
  pack: (g) => {
    base(g, '#e4d2b0', WOOD);
    poly(g, [[12, 26], [32, 18], [52, 26], [32, 34]], '#dba66c', INK);
    poly(g, [[12, 26], [32, 34], [32, 50], [12, 42]], '#c98f55', INK);
    poly(g, [[52, 26], [32, 34], [32, 50], [52, 42]], '#b27a44', INK);
    poly(g, [[28, 20], [36, 24], [32, 26], [24, 22]], '#f2dfae');
    rr(g, 44, 8, 10, 8, 2, '#e8531e', INK, 1.5);
  },
  serve: (g) => {
    base(g, '#d5f0d8', '#4fa86a');
    rr(g, 8, 10, 48, 28, 5, '#f4fbf5', '#3f8f5a');
    for (let i = 0; i < 6; i++) rr(g, 10 + i * 8, 40, 6, 6, 1, i % 2 ? '#fff' : '#ffd23f');
    ell(g, 32, 28, 11, 5, STEEL, INK, 1.5);
    ell(g, 32, 24, 8, 6, '#e8c14a', INK, 1.5);
    circ(g, 32, 17, 2, '#e8c14a', INK, 1);
  },
  pano: (g) => {
    ell(g, 32, 58, 26, 4, 'rgba(0,0,0,.25)');
    rr(g, 4, 6, 56, 50, 5, WOOD_D, INK);
    rr(g, 8, 10, 48, 42, 3, '#d9a863');
    const notes: [number, number, string, number][] = [[12, 14, '#fffbe6', -0.1], [30, 13, '#fff1b0', 0.08], [42, 26, '#ffffff', -0.06], [14, 32, '#ffd9d0', 0.1], [32, 35, '#fffbe6', -0.08]];
    for (const [x, y, c, r] of notes) {
      g.save(); g.translate(x + 7, y + 8); g.rotate(r);
      rr(g, -7, -8, 14, 16, 1, c, 'rgba(0,0,0,.25)', 1);
      line(g, -4, -3, 4, -3, '#9aa3b0', 1.2); line(g, -4, 1, 3, 1, '#9aa3b0', 1.2);
      g.restore();
      circ(g, x + 7, y, 2, '#e63b2e');
    }
  },
  cashier: (g) => {
    base(g, '#e4d2b0', WOOD);
    poly(g, [[14, 38], [50, 38], [47, 46], [17, 46]], '#6c7a89', INK);
    rr(g, 18, 14, 28, 20, 4, '#3a4452', INK);
    rr(g, 21, 17, 22, 11, 2, '#9be0b0');
    line(g, 24, 22, 32, 22, '#2f7a4a', 2); line(g, 24, 25, 38, 25, '#2f7a4a', 1.5);
    for (let i = 0; i < 4; i++) circ(g, 22 + i * 7, 32, 1.5, '#e8edf2');
    circ(g, 52, 14, 5, '#ffd23f', INK, 1.5);
    text(g, 'TL', 52, 14, 6);
  },
  table: (g) => {
    ell(g, 32, 56, 26, 5, 'rgba(0,0,0,.22)');
    circ(g, 32, 31, 26, '#a87a46', INK);
    circ(g, 32, 31, 22, '#fff3e0', '#e4c9a0', 2);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      line(g, 32 + Math.cos(a) * 10, 31 + Math.sin(a) * 10, 32 + Math.cos(a) * 20, 31 + Math.sin(a) * 20, 'rgba(230,59,46,.25)', 3);
    }
    rr(g, 28, 29, 8, 4, 2, '#e63b2e');
  },
  door: (g) => {
    rr(g, 3, 4, 58, 54, 6, '#5a3a20', INK);
    rr(g, 8, 8, 48, 44, 4, '#2c313b');
    for (const y of [16, 28, 40]) rr(g, 10, y, 44, 3, 1, STEEL_D);
    rr(g, 12, 18, 14, 9, 2, '#dba66c', INK, 1.2); rr(g, 36, 30, 14, 9, 2, '#dba66c', INK, 1.2);
    rr(g, 10, 52, 44, 8, 3, '#e8531e', INK, 1.5);
    for (let i = 0; i < 5; i++) line(g, 16 + i * 8, 54, 20 + i * 8, 58, '#ffd23f', 2);
  },
};

// ---------- player (4 frames: u,d,l,r), white so tint = player color ----------
function player(g: G, f: number) {
  const ox = f * TILE;
  const dx = [0, 0, -1, 1][f];
  ell(g, ox + 32, 56, 18, 5, 'rgba(0,0,0,.25)');
  rr(g, ox + 15, 28, 34, 28, 12, '#ffffff', INK);
  if (f !== 0) rr(g, ox + 22 + dx * 3, 36, 20, 18, 6, '#e3e8f0', '#9aa3b0', 1.5);
  if (f >= 2) circ(g, ox + 32 + dx * 15, 44, 5, '#f6f0e8', INK, 1.5);
  else { circ(g, ox + 13, 44, 5, '#f6f0e8', INK, 1.5); circ(g, ox + 51, 44, 5, '#f6f0e8', INK, 1.5); }
  circ(g, ox + 32, 25, 15, '#fff8ee', INK);
  rr(g, ox + 20, 4, 24, 9, 4, '#ffffff', INK);
  circ(g, ox + 22, 8, 7, '#ffffff', INK); circ(g, ox + 32, 5, 8, '#ffffff', INK); circ(g, ox + 42, 8, 7, '#ffffff', INK);
  rr(g, ox + 20, 13, 24, 6, 2, '#f1f4f8', INK, 1.5);
  if (f === 0) return; // back of head
  const fx = ox + 32 + dx * 5;
  if (f === 1) { circ(g, fx - 6, 25, 2.2, INK); circ(g, fx + 6, 25, 2.2, INK); }
  else { circ(g, fx + dx * 5, 25, 2.2, INK); circ(g, fx - dx * 4, 25, 2.2, INK); }
  smile(g, fx, 29, 3.5);
  circ(g, fx - 10, 29, 2.5, 'rgba(255,120,120,.35)'); circ(g, fx + 10, 29, 2.5, 'rgba(255,120,120,.35)');
}

function star(g: G, fill: string, stroke: string) {
  const pts: number[][] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 11 : 27;
    pts.push([32 + Math.cos(a) * r, 34 + Math.sin(a) * r]);
  }
  poly(g, pts, fill, stroke, 3);
  if (fill === '#ffd23f') poly(g, [[32, 14], [36, 28], [28, 28]], 'rgba(255,255,255,.45)');
}

const PAPER = [[12, 6], [52, 6], [52, 56], [46, 60], [40, 56], [34, 60], [28, 56], [22, 60], [16, 56], [12, 58]];

// ---------- remaining textures ----------
const OTHERS: Record<string, (g: G) => void> = {
  [TEX.floor]: (g) => {
    g.fillStyle = '#e9eef2'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#dfe6ec'; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
    g.strokeStyle = 'rgba(120,135,150,.28)'; g.lineWidth = 2; g.strokeRect(1, 1, 62, 62);
    g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(5, 5, 8, 3);
  },
  [TEX.floorDining]: (g) => {
    g.fillStyle = '#d9a86a'; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? '#cf9c5c' : '#dfb176'; g.fillRect(0, i * 16, 64, 15);
      line(g, 0, i * 16, 64, i * 16, 'rgba(90,50,20,.3)', 2);
    }
    for (const [x, y] of [[10, 8], [40, 24], [22, 40], [50, 56]]) line(g, x, y, x + 8, y, 'rgba(90,50,20,.2)', 2);
  },
  [TEX.wall]: (g) => {
    g.fillStyle = '#5b6b86'; g.fillRect(0, 0, 64, 64);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) rr(g, c * 32 + (r % 2 ? -16 : 0) + 1, r * 16 + 1, 30, 14, 3, r % 2 ? '#6b7c98' : '#73839f');
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 54, 64, 10);
  },
  [TEX.stationOff]: (g) => {
    base(g, '#9aa3ad', '#6e7782');
    for (const [x, y] of [[20, 20], [44, 20], [20, 38], [44, 38]]) circ(g, x, y, 8, '#7d8792', '#5a626c');
    rr(g, 22, 22, 20, 18, 4, '#ffd23f', INK);
    g.beginPath(); g.arc(32, 22, 6, Math.PI, 0); g.strokeStyle = INK; g.lineWidth = 3; g.stroke();
    circ(g, 32, 31, 2.5, INK);
  },
  [TEX.customer]: (g) => {
    ell(g, 32, 57, 17, 5, 'rgba(0,0,0,.22)');
    rr(g, 15, 32, 34, 26, 12, '#ffffff', INK);
    circ(g, 32, 24, 16, '#fff8ee', INK);
    g.beginPath(); g.arc(32, 24, 16, Math.PI * 1.05, Math.PI * 1.95); g.closePath(); g.fillStyle = '#e4e9f0'; g.fill();
    circ(g, 26, 27, 2.3, INK); circ(g, 38, 27, 2.3, INK);
    smile(g, 32, 31, 4);
    circ(g, 21, 31, 2.5, 'rgba(255,120,120,.35)'); circ(g, 43, 31, 2.5, 'rgba(255,120,120,.35)');
  },
  [TEX.ticket]: (g) => {
    poly(g, PAPER, '#fffbe6', INK);
    rr(g, 12, 6, 40, 9, 2, '#e63b2e', INK, 1.5);
    for (const y of [24, 33, 42]) line(g, 18, y, 46, y, '#b9b39a', 2.5);
  },
  [TEX.ticketHidden]: (g) => {
    poly(g, PAPER, '#d6dae2', '#6c7a89');
    rr(g, 12, 6, 40, 9, 2, '#8795a4', '#6c7a89', 1.5);
    text(g, '?', 32, 36, 30, '#5a6678');
  },
  [TEX.bubble]: (g) => {
    rr(g, 4, 4, 56, 46, 14, '#ffffff', INK);
    poly(g, [[24, 48], [34, 48], [29, 60]], '#ffffff', INK);
    line(g, 25, 48, 33, 48, '#ffffff', 3);
  },
  [TEX.ring]: (g) => { circ(g, 32, 32, 27, undefined, '#ffffff', 6); },
  [TEX.highlight]: (g) => {
    g.strokeStyle = '#ffd23f'; g.lineWidth = 5; g.lineCap = 'round';
    for (const [x, y, sx, sy] of [[4, 4, 1, 1], [60, 4, -1, 1], [4, 60, 1, -1], [60, 60, -1, -1]]) {
      g.beginPath(); g.moveTo(x + sx * 16, y); g.lineTo(x, y); g.lineTo(x, y + sy * 16); g.stroke();
    }
    rr(g, 3, 3, 58, 58, 8, 'rgba(255,210,63,.12)');
  },
  [TEX.smoke]: (g) => {
    const r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    r.addColorStop(0, 'rgba(90,90,95,.75)'); r.addColorStop(1, 'rgba(90,90,95,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  },
  [TEX.road]: (g) => {
    g.fillStyle = '#59606b'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#6a727e'; g.fillRect(0, 0, 64, 4); g.fillRect(0, 60, 64, 4);
    for (let i = 0; i < 2; i++) rr(g, 6 + i * 32, 29, 20, 6, 2, '#f4e19a');
  },
  [TEX.building]: (g) => {
    ell(g, 32, 58, 27, 4, 'rgba(0,0,0,.25)');
    rr(g, 5, 6, 54, 52, 6, '#e8b27a', INK);
    rr(g, 5, 6, 54, 14, 6, '#c8604a', INK);
    for (const [x, y] of [[12, 26], [36, 26], [12, 42], [36, 42]]) { rr(g, x, y, 16, 11, 2, '#8fd0ee', INK, 1.5); line(g, x + 8, y, x + 8, y + 11, INK, 1); }
  },
  [TEX.home]: (g) => {
    ell(g, 32, 58, 27, 4, 'rgba(0,0,0,.25)');
    rr(g, 5, 14, 54, 44, 6, '#fff1d6', INK);
    for (let i = 0; i < 6; i++) poly(g, [[5 + i * 9, 6], [14 + i * 9, 6], [14 + i * 9, 26], [5 + i * 9, 26]], i % 2 ? '#ffffff' : '#e63b2e', INK, 1.5);
    rr(g, 10, 32, 18, 18, 2, '#8fd0ee', INK, 1.5);
    rr(g, 36, 30, 16, 28, 3, WOOD_D, INK, 1.5);
    circ(g, 48, 45, 1.5, '#ffd23f');
  },
  [TEX.market]: (g) => {
    ell(g, 32, 58, 27, 4, 'rgba(0,0,0,.25)');
    rr(g, 7, 30, 50, 28, 4, WOOD, INK);
    for (let i = 0; i < 5; i++) poly(g, [[5 + i * 11, 8], [16 + i * 11, 8], [18 + i * 11, 28], [3 + i * 11, 28]], i % 2 ? '#ffffff' : '#3fa34d', INK, 1.5);
    for (const [x, c] of [[16, '#e63b2e'], [28, '#f2b24c'], [40, '#9ccf5a'], [50, '#e63b2e']] as [number, string][]) circ(g, x, 38, 5, c, INK, 1.5);
    for (const [x, c] of [[22, '#ffb347'], [34, '#e63b2e'], [45, '#f2b24c']] as [number, string][]) circ(g, x, 48, 5, c, INK, 1.5);
  },
  [TEX.pin]: (g) => {
    ell(g, 32, 58, 9, 3, 'rgba(0,0,0,.3)');
    poly(g, [[32, 58], [14, 28], [22, 10], [42, 10], [50, 28]], '#e63b2e', INK);
    circ(g, 32, 24, 14, '#e63b2e', INK);
    circ(g, 32, 24, 6, '#ffffff', INK, 1.5);
    circ(g, 26, 18, 3, 'rgba(255,255,255,.5)');
  },
  [TEX.scooter]: (g) => {
    ell(g, 32, 57, 26, 4, 'rgba(0,0,0,.25)');
    circ(g, 14, 46, 9, '#2c313b', INK); circ(g, 14, 46, 3.5, STEEL);
    circ(g, 50, 46, 9, '#2c313b', INK); circ(g, 50, 46, 3.5, STEEL);
    rr(g, 12, 32, 40, 10, 5, '#ffffff', INK);
    rr(g, 18, 22, 20, 12, 5, '#ffffff', INK);
    rr(g, 40, 20, 5, 22, 2, STEEL_D, INK, 1.5);
    line(g, 38, 20, 52, 20, INK, 4);
    circ(g, 53, 22, 3, '#ffd23f', INK, 1.5);
    rr(g, 2, 20, 17, 16, 3, '#e63b2e', INK, 1.5);
  },
  [TEX.botCourier]: (g) => {
    ell(g, 32, 57, 24, 4, 'rgba(0,0,0,.25)');
    circ(g, 14, 48, 8, '#2c313b', INK); circ(g, 50, 48, 8, '#2c313b', INK);
    rr(g, 12, 38, 40, 9, 4, '#7fb7d9', INK);
    rr(g, 20, 20, 20, 20, 7, '#7fb7d9', INK);
    rr(g, 21, 6, 22, 16, 6, STEEL, INK);
    rr(g, 24, 10, 16, 7, 3, '#2c313b');
    circ(g, 29, 13, 1.6, '#9be0b0'); circ(g, 36, 13, 1.6, '#9be0b0');
    line(g, 32, 6, 32, 1, INK, 2); circ(g, 32, 2, 2, '#e63b2e');
    rr(g, 2, 24, 15, 14, 3, '#e63b2e', INK, 1.5);
  },
  [TEX.star]: (g) => star(g, '#ffd23f', '#c98f1a'),
  [TEX.starOff]: (g) => star(g, '#b8bec8', '#8a93a0'),
};

/** Creates every Mutfak texture once (no-op for keys that already exist). */
export function ensureTextures(scene: Phaser.Scene): void {
  for (const [k, fn] of Object.entries(ITEMS)) make(scene, ITEM_TEX[k as ItemTex], 32, 32, fn);
  for (const [k, fn] of Object.entries(STATIONS)) make(scene, STATION_TEX[k as StationKind], TILE, TILE, fn);
  for (const [key, fn] of Object.entries(OTHERS)) make(scene, key, TILE, TILE, fn);
  make(scene, TEX.player, TILE * 4, TILE, (g) => { for (let f = 0; f < 4; f++) player(g, f); });
}
