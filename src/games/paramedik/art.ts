// Paramedik procedural art. Every texture is drawn at RES(2)x of its logical size: display with setDisplaySize(logical w,h)
// or scale 0.5. Non-graphic style (no blood: "wound" is a bandage + drop icon). ensureTextures(scene) is idempotent.
import Phaser from 'phaser';
import { RES, shade, hex } from '../../ui/textures';
import { ALL_TEX, TEX } from './assets';
import { COLORS, TOOLS, LABELS, type AmpulColor, type SignId, type ToolId, type AgeGroup } from './types';

type G = CanvasRenderingContext2D;
const AGES: AgeGroup[] = ['cocuk', 'yetiskin', 'yasli'];
const SIGNS = Object.keys(LABELS.sign) as SignId[];
const INK = '#2b2f44';
const FACE = '#ffd9b0';
const AMPUL: Record<AmpulColor, number> = { kirmizi: 0xe5484d, mavi: 0x3e7be0, sari: 0xf2c230, yesil: 0x3fb868, mor: 0x8d5bd6 };
const SKIN: Record<AgeGroup, string> = { cocuk: '#ffd2a8', yetiskin: '#f2b98c', yasli: '#e8c4a4' };

const rr = (g: G, x: number, y: number, w: number, h: number, r: number) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
const fillRR = (g: G, x: number, y: number, w: number, h: number, r: number, c: string) => { g.fillStyle = c; rr(g, x, y, w, h, r); g.fill(); };
const circ = (g: G, x: number, y: number, r: number, c: string) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
const ell = (g: G, x: number, y: number, rx: number, ry: number, c: string, rot = 0) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, 7); g.fill(); };
const line = (g: G, pts: number[], c: string, w: number) => {
  g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.stroke();
};
const cross = (g: G, x: number, y: number, s: number, c: string) => { fillRR(g, x - s / 2, y - s / 6, s, s / 3, s / 8, c); fillRR(g, x - s / 6, y - s / 2, s / 3, s, s / 8, c); };
const eyes = (g: G, x: number, y: number, gap: number, r = 2) => { circ(g, x - gap, y, r, INK); circ(g, x + gap, y, r, INK); };
const drop = (g: G, x: number, y: number, s: number, c: string) => {
  g.fillStyle = c; g.beginPath(); g.moveTo(x, y - s); g.bezierCurveTo(x + s * 0.8, y - s * 0.1, x + s * 0.8, y + s * 0.6, x, y + s * 0.6);
  g.bezierCurveTo(x - s * 0.8, y + s * 0.6, x - s * 0.8, y - s * 0.1, x, y - s); g.fill();
};

function mk(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w * RES, h * RES);
  if (!tex) return;
  const g = tex.getContext();
  g.save(); g.scale(RES, RES); draw(g); g.restore();
  tex.refresh();
}

// ---- fixed pieces -----------------------------------------------------------------------------
function bg(g: G) {
  const W = 960, H = 540;
  g.fillStyle = '#f0dcc0'; g.fillRect(0, 0, W, 330); // wall
  g.fillStyle = 'rgba(255,255,255,0.18)';
  for (let x = 0; x < W; x += 60) g.fillRect(x, 0, 30, 330);
  g.fillStyle = '#b98557'; g.fillRect(0, 330, W, H - 330); // floor
  for (let x = 0; x < W; x += 80) { g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(x, 330, 2, H - 330); }
  g.fillStyle = '#8f6540'; g.fillRect(0, 322, W, 10); // skirting
  fillRR(g, 90, 60, 170, 150, 8, '#fff6e6'); fillRR(g, 98, 68, 154, 134, 4, '#a8dcf5'); // window
  g.fillStyle = '#fff6e6'; g.fillRect(172, 68, 6, 134); g.fillRect(98, 131, 154, 6);
  circ(g, 215, 105, 14, '#ffe27a');
  fillRR(g, 420, 70, 110, 80, 6, '#7a5a3a'); fillRR(g, 428, 78, 94, 64, 3, '#bfe3b0'); circ(g, 475, 118, 14, '#ffd36b'); // picture
  g.fillStyle = '#7bbf6a'; g.beginPath(); g.moveTo(428, 142); g.lineTo(460, 110); g.lineTo(490, 142); g.fill();
  fillRR(g, 760, 250, 44, 60, 8, '#c2603f'); // plant
  for (let i = 0; i < 5; i++) ell(g, 782 + (i - 2) * 14, 225 - (i % 2) * 14, 10, 34, i % 2 ? '#3fa05a' : '#56b86e', (i - 2) * 0.35);
  fillRR(g, 560, 235, 330, 100, 20, '#c9565d'); fillRR(g, 548, 275, 354, 70, 18, '#dd6a71'); // sofa
  fillRR(g, 575, 255, 140, 56, 14, '#e47c82'); fillRR(g, 730, 255, 140, 56, 14, '#e47c82');
  ell(g, 330, 440, 280, 70, 'rgba(80,120,200,0.55)'); // rug under patient
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 3; g.beginPath(); g.ellipse(330, 440, 250, 54, 0, 0, 7); g.stroke();
  const v = g.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 620);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(30,20,40,0.35)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
}

function monitor(g: G) {
  fillRR(g, 2, 4, 256, 144, 14, 'rgba(0,0,0,0.3)');
  fillRR(g, 0, 0, 256, 144, 14, '#3a4058');
  fillRR(g, 8, 8, 240, 128, 9, '#0c1a16'); // screen: scene draws live values on top
  g.strokeStyle = 'rgba(80,255,170,0.08)'; g.lineWidth = 1;
  for (let x = 8; x < 248; x += 16) { g.beginPath(); g.moveTo(x, 8); g.lineTo(x, 136); g.stroke(); }
  for (let y = 8; y < 136; y += 16) { g.beginPath(); g.moveTo(8, y); g.lineTo(248, y); g.stroke(); }
  circ(g, 238, 14, 3, '#7dffb8');
}

function heart(g: G) { // white so the scene can tint by status
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(24, 42);
  g.bezierCurveTo(-6, 22, 6, 0, 24, 12); g.bezierCurveTo(42, 0, 54, 22, 24, 42); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2; g.stroke();
}

function bag(g: G) {
  g.strokeStyle = '#6b3b2a'; g.lineWidth = 5; g.beginPath(); g.arc(60, 24, 20, Math.PI, 0); g.stroke();
  fillRR(g, 4, 22, 112, 54, 12, '#d6403f'); fillRR(g, 4, 22, 112, 18, 9, '#ea5a56');
  fillRR(g, 52, 38, 16, 12, 3, '#ffd34d');
  cross(g, 60, 60, 20, '#fff');
}

function bubble(g: G) { // tail points down-left
  fillRR(g, 3, 3, 214, 56, 18, 'rgba(0,0,0,0.15)');
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(34, 50); g.lineTo(24, 68); g.lineTo(56, 50); g.fill();
  line(g, [36, 56, 24, 68, 54, 56], INK, 2.5);
  fillRR(g, 0, 0, 214, 56, 18, '#fff'); g.strokeStyle = INK; g.lineWidth = 2.5; rr(g, 0, 0, 214, 56, 18); g.stroke();
  g.fillStyle = '#fff'; g.fillRect(38, 53, 16, 6);
}

function teyze(g: G) {
  ell(g, 35, 114, 28, 6, 'rgba(0,0,0,0.2)');
  fillRR(g, 12, 56, 46, 56, 18, '#7a5fb0'); fillRR(g, 12, 56, 46, 14, 8, '#9478c8'); // dress
  g.fillStyle = '#e3d4f2'; g.beginPath(); g.arc(35, 36, 23, Math.PI * 0.9, Math.PI * 2.1); g.lineTo(55, 62); g.lineTo(15, 62); g.fill(); // headscarf
  circ(g, 35, 40, 15, '#f0c09a'); eyes(g, 35, 39, 6, 1.8);
  line(g, [30, 46, 35, 49, 40, 46], '#b4573c', 1.8);
  circ(g, 24, 44, 3, 'rgba(240,120,120,0.45)'); circ(g, 46, 44, 3, 'rgba(240,120,120,0.45)');
}

function wound(g: G) { // non-graphic: bandage + drop icon
  g.save(); g.translate(24, 28); g.rotate(-0.5); fillRR(g, -22, -10, 44, 20, 10, '#f5d9b8'); fillRR(g, -9, -10, 18, 20, 2, '#e8c196'); g.restore();
  drop(g, 34, 14, 12, '#e5484d'); circ(g, 31, 13, 2.2, 'rgba(255,255,255,0.7)');
}

function pressure(g: G) { // vertical bar; scene overlays its own marker
  fillRR(g, 0, 0, 30, 160, 10, '#2b2f44'); fillRR(g, 4, 4, 22, 152, 7, '#3c4260');
  fillRR(g, 4, 40, 22, 16, 3, '#f2c230'); fillRR(g, 4, 104, 22, 16, 3, '#f2c230');
  fillRR(g, 4, 56, 22, 48, 3, '#3fb868'); // sweet spot
}

function cprHands(g: G) {
  fillRR(g, 12, 26, 56, 26, 12, '#f2b98c'); fillRR(g, 18, 12, 44, 24, 11, '#ffd0a6');
  for (let i = 0; i < 4; i++) fillRR(g, 20 + i * 10, 6, 8, 14, 4, '#ffd0a6');
  fillRR(g, 6, 44, 68, 12, 6, '#fff'); // cuff
}

function mask(g: G) {
  g.strokeStyle = '#7fc6e8'; g.lineWidth = 3; g.beginPath(); g.arc(25, 20, 22, Math.PI * 0.8, Math.PI * 2.2); g.stroke();
  g.fillStyle = 'rgba(190,235,255,0.9)'; g.beginPath(); g.moveTo(8, 14); g.bezierCurveTo(8, 4, 42, 4, 42, 14); g.bezierCurveTo(46, 30, 36, 38, 25, 38); g.bezierCurveTo(14, 38, 4, 30, 8, 14); g.fill();
  g.strokeStyle = '#5aa8cc'; g.lineWidth = 2; g.stroke();
  circ(g, 25, 22, 6, '#5aa8cc'); circ(g, 25, 22, 3, '#d6f2ff');
}

// ---- patients: supine body 320x140, head on the left; eyes open (scene may overlay lids) ------------
function patient(g: G, grp: AgeGroup) {
  const k = grp === 'cocuk' ? 0.72 : 1;
  const skin = SKIN[grp];
  const cloth = grp === 'cocuk' ? 0xf2a54a : grp === 'yetiskin' ? 0x4aa3d9 : 0x8fb86a;
  g.save(); g.translate(0, 140 * (1 - k) / 1.4); g.scale(k, k);
  ell(g, 160, 122, 150, 12, 'rgba(0,0,0,0.18)');
  fillRR(g, 60, 60, 180, 52, 20, hex(cloth)); fillRR(g, 60, 60, 180, 14, 10, shade(cloth, 0.2)); // torso
  fillRR(g, 220, 66, 96, 40, 16, grp === 'cocuk' ? '#5b6bb5' : '#4b5570'); fillRR(g, 296, 70, 22, 34, 10, '#444'); // legs + shoes
  fillRR(g, 100, 100, 70, 16, 8, skin); fillRR(g, 150, 84, 70, 16, 8, skin); // arms
  fillRR(g, -2, 98, 74, 16, 8, '#fff'); // pillow
  circ(g, 40, 82, 30, skin);
  g.fillStyle = grp === 'yasli' ? '#e6e6ea' : grp === 'cocuk' ? '#8a5a32' : '#3a2a22';
  g.beginPath(); g.arc(40, 76, 31, Math.PI * 0.9, Math.PI * 1.95); g.fill();
  circ(g, 30, 84, 1.8, INK); circ(g, 50, 84, 1.8, INK);
  line(g, [34, 96, 40, 98, 46, 96], '#b4573c', 1.8);
  g.restore();
}

function chest(g: G, grp: AgeGroup) { // shirt-colored bulge, scene scales it for breathing
  const c = grp === 'cocuk' ? '#f7b862' : grp === 'yetiskin' ? '#62b6e8' : '#a2c97c';
  const w = grp === 'cocuk' ? 64 : 82;
  ell(g, 45, 36, w / 2, 22, c);
  ell(g, 45, 28, w / 2.8, 10, 'rgba(255,255,255,0.25)');
}

// ---- tools 48x48 -------------------------------------------------------------------------------
function tool(g: G, t: ToolId) {
  fillRR(g, 2, 2, 44, 44, 11, '#f7f7fb'); g.strokeStyle = '#c9cde0'; g.lineWidth = 2; rr(g, 2, 2, 44, 44, 11); g.stroke();
  if (t === 'pulseox') {
    fillRR(g, 9, 14, 30, 22, 7, '#4c5578'); fillRR(g, 9, 14, 30, 8, 5, '#6a75a0'); fillRR(g, 14, 24, 20, 8, 3, '#0c1a16');
    circ(g, 33, 18, 2, '#ff6b6b'); line(g, [16, 28, 20, 28, 22, 26, 24, 30, 26, 28, 32, 28], '#7dffb8', 1.4);
  } else if (t === 'tansiyon') {
    fillRR(g, 6, 12, 28, 22, 6, '#4e8fd6'); fillRR(g, 6, 12, 28, 7, 4, '#6fa8e6'); line(g, [34, 24, 40, 30, 38, 38], '#444', 2.2);
    circ(g, 38, 40, 4.5, '#2b2f44');
  } else if (t === 'glukometre') {
    fillRR(g, 11, 8, 20, 32, 6, '#f2c230'); fillRR(g, 14, 12, 14, 10, 2, '#0c1a16'); circ(g, 21, 31, 3.5, '#d9a516');
    drop(g, 38, 27, 8, '#e5484d');
  } else if (t === 'stetoskop') {
    line(g, [14, 8, 14, 22, 24, 32, 34, 22, 34, 8], '#444b66', 3); circ(g, 14, 8, 3, '#8a93b8'); circ(g, 34, 8, 3, '#8a93b8');
    line(g, [24, 32, 24, 38], '#444b66', 3); circ(g, 24, 39, 6, '#8a93b8'); circ(g, 24, 39, 3, '#444b66');
  } else {
    ell(g, 16, 26, 7, 12, '#f08a9a', 0.15); ell(g, 32, 26, 7, 12, '#f08a9a', -0.15);
    line(g, [24, 8, 24, 20], '#b4573c', 2.5); line(g, [6, 40, 12, 36, 18, 41, 24, 36, 30, 41, 36, 36, 42, 40], '#4e8fd6', 2);
  }
}

// ---- ampuls 48x48 ------------------------------------------------------------------------------
function ampul(g: G, c: AmpulColor) {
  const col = AMPUL[c];
  ell(g, 24, 45, 12, 2.5, 'rgba(0,0,0,0.15)');
  g.fillStyle = 'rgba(235,245,255,0.95)'; g.beginPath(); g.moveTo(20, 2); g.lineTo(28, 2); g.lineTo(28, 12);
  g.bezierCurveTo(38, 18, 38, 30, 36, 38); g.quadraticCurveTo(24, 46, 12, 38); g.bezierCurveTo(10, 30, 10, 18, 20, 12); g.closePath(); g.fill();
  g.save(); g.clip(); g.fillStyle = hex(col); g.fillRect(8, 24, 32, 22); g.fillStyle = shade(col, 0.35); g.fillRect(8, 24, 32, 3); g.restore();
  g.strokeStyle = '#9aa6c2'; g.lineWidth = 1.8; g.stroke();
  fillRR(g, 19, 5, 10, 4, 2, hex(col)); // colored cap
  line(g, [16, 22, 16, 34], 'rgba(255,255,255,0.8)', 2.5);
}

// ---- sign icons 48x48 (cute, non-graphic) --------------------------------------------------------
function sign(g: G, s: SignId) {
  fillRR(g, 1, 1, 46, 46, 12, '#fff'); g.strokeStyle = '#d6d9e8'; g.lineWidth = 2; rr(g, 1, 1, 46, 46, 12); g.stroke();
  const face = (c = FACE) => circ(g, 24, 25, 15, c);
  const mouth = (y: number, w = 4) => line(g, [24 - w, y, 24, y + 1.5, 24 + w, y], '#b4573c', 1.8);
  const txt = (t: string, x: number, y: number, size: number, c: string) => { g.fillStyle = c; g.font = `bold ${size}px sans-serif`; g.textAlign = 'center'; g.fillText(t, x, y); };
  switch (s) {
    case 'dokuntu': face(); for (const [x, y] of [[17, 20], [30, 18], [22, 32], [32, 29], [15, 30]]) circ(g, x, y, 2.4, '#e5484d'); eyes(g, 24, 24, 6, 1.4); break;
    case 'sisYuz': circ(g, 24, 25, 19, '#f6b0a0'); circ(g, 24, 25, 14, FACE); circ(g, 13, 29, 6, '#f6b0a0'); circ(g, 35, 29, 6, '#f6b0a0'); eyes(g, 24, 21, 6, 1.5); mouth(35, 3); break;
    case 'morDudak': face(); eyes(g, 24, 20, 6, 1.8); fillRR(g, 17, 30, 14, 5, 2.5, '#7b55c2'); break;
    case 'kasinti': face(); eyes(g, 24, 20, 6, 1.8); mouth(32); line(g, [34, 34, 40, 40], '#8a93b8', 2); line(g, [37, 32, 43, 38], '#8a93b8', 2); circ(g, 12, 20, 2, '#e5484d'); break;
    case 'konusamiyor': face(); eyes(g, 24, 21, 6, 1.8); fillRR(g, 19, 30, 10, 5, 2.5, '#b4573c'); line(g, [36, 12, 42, 6], '#e5484d', 2.5); line(g, [10, 12, 6, 6], '#e5484d', 2.5); break;
    case 'omuzNefes': circ(g, 24, 14, 8, FACE); fillRR(g, 10, 24, 28, 16, 8, '#4aa3d9'); line(g, [8, 22, 14, 26], INK, 2); line(g, [40, 22, 34, 26], INK, 2); line(g, [20, 6, 18, 2], '#9aa6c2', 2); line(g, [28, 6, 30, 2], '#9aa6c2', 2); break;
    case 'terleme': face(); eyes(g, 24, 24, 6, 1.8); mouth(34, 3); drop(g, 10, 12, 5, '#5aa8ff'); drop(g, 38, 14, 5, '#5aa8ff'); drop(g, 8, 28, 5, '#5aa8ff'); break;
    case 'titreme': face(); eyes(g, 24, 22, 6, 1.8); mouth(33, 3); line(g, [5, 18, 8, 24, 5, 30], '#7a86b8', 2); line(g, [43, 18, 40, 24, 43, 30], '#7a86b8', 2); break;
    case 'konfuzyon': face(); eyes(g, 24, 24, 6, 1.8); mouth(34, 3); txt('?', 38, 14, 16, '#7b55c2'); txt('?', 10, 14, 16, '#7b55c2'); break;
    case 'solukluk': face('#f5ead8'); eyes(g, 24, 24, 6, 1.8); mouth(34, 3); circ(g, 24, 25, 15, 'rgba(200,215,240,0.5)'); break;
    case 'kanama': fillRR(g, 6, 24, 36, 14, 7, '#f5d9b8'); fillRR(g, 19, 24, 10, 14, 2, '#e8c196'); drop(g, 24, 13, 9, '#e5484d'); break;
    case 'deformite': fillRR(g, 6, 20, 18, 9, 4, '#4b5570'); line(g, [22, 24, 32, 18], '#4b5570', 9); fillRR(g, 33, 8, 10, 8, 4, '#444'); line(g, [26, 12, 30, 6], '#e5484d', 2.4); line(g, [34, 26, 40, 30], '#e5484d', 2.4); break;
    case 'sogukCilt': face('#dff0ff'); eyes(g, 24, 24, 6, 1.8); mouth(34, 3);
      for (const [x, y] of [[9, 10], [40, 12]]) { line(g, [x - 4, y, x + 4, y], '#6fb4f0', 2); line(g, [x, y - 4, x, y + 4], '#6fb4f0', 2); line(g, [x - 3, y - 3, x + 3, y + 3], '#6fb4f0', 1.6); line(g, [x - 3, y + 3, x + 3, y - 3], '#6fb4f0', 1.6); }
      break;
    case 'bilincsiz': face(); line(g, [15, 22, 21, 22], INK, 2); line(g, [27, 22, 33, 22], INK, 2); mouth(33, 3); txt('z', 38, 12, 12, '#7b55c2'); txt('Z', 43, 7, 9, '#7b55c2'); break;
    case 'nefesYok': face(); eyes(g, 24, 23, 6, 1.8); fillRR(g, 20, 31, 8, 4, 2, '#b4573c'); g.strokeStyle = '#e5484d'; g.lineWidth = 3; g.beginPath(); g.arc(24, 24, 20, 0, 7); g.stroke(); line(g, [10, 38, 38, 10], '#e5484d', 3); break;
    case 'basDonmesi': face(); eyes(g, 24, 24, 6, 1.6); mouth(34, 3); g.strokeStyle = '#f2a54a'; g.lineWidth = 2.2; g.beginPath(); g.arc(24, 8, 8, 0.5, 5.2); g.stroke(); g.beginPath(); g.arc(24, 8, 4, 0.5, 5.2); g.stroke(); break;
  }
}

export function ensureTextures(scene: Phaser.Scene): void {
  if (ALL_TEX.every((k) => scene.textures.exists(k))) return;
  mk(scene, TEX.bg, 960, 540, bg);
  mk(scene, TEX.monitor, 260, 150, monitor);
  mk(scene, TEX.heart, 48, 44, heart);
  mk(scene, TEX.bag, 120, 80, bag);
  mk(scene, TEX.bubble, 220, 70, bubble);
  mk(scene, TEX.teyze, 70, 120, teyze);
  mk(scene, TEX.wound, 48, 48, wound);
  mk(scene, TEX.pressure, 30, 160, pressure);
  mk(scene, TEX.cprHands, 80, 60, cprHands);
  mk(scene, TEX.mask, 50, 40, mask);
  for (const a of AGES) { mk(scene, TEX.patient(a), 320, 140, (g) => patient(g, a)); mk(scene, TEX.chest(a), 90, 60, (g) => chest(g, a)); }
  for (const t of TOOLS) mk(scene, TEX.tool(t), 48, 48, (g) => tool(g, t));
  for (const c of COLORS) mk(scene, TEX.ampul(c), 48, 48, (g) => ampul(g, c));
  for (const s of SIGNS) mk(scene, TEX.sign(s), 48, 48, (g) => sign(g, s));
}
