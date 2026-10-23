// Procedural art for Çağlar Savaşı: every unit, base, turret and projectile is drawn with Canvas2D
// into a texture (2x resolution, shown at 0.5 scale). Units face right; the right team is flipped.
import Phaser from 'phaser';
import { RES } from '../../ui/textures';
import { LANE_W } from './balance';

export const TEAM_COLOR = [0x3d8bff, 0xff4d4d] as const;
export const GROUND_Y = 392; // world y of the lane floor
type G = CanvasRenderingContext2D;

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

function canvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, Math.ceil(w * RES), Math.ceil(h * RES));
  if (!tex) return key;
  const g = tex.getContext();
  g.save();
  g.scale(RES, RES);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  draw(g);
  g.restore();
  tex.refresh();
  return key;
}

// --- tiny drawing kit ------------------------------------------------------------------------
function fill(g: G, c: string, path: () => void, stroke = 'rgba(0,0,0,.55)', lw = 1.4) {
  g.beginPath();
  path();
  g.fillStyle = c;
  g.fill();
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = lw;
    g.stroke();
  }
}
const rect = (g: G, c: string, x: number, y: number, w: number, h: number, r = 2) => fill(g, c, () => g.roundRect(x, y, w, h, r));
const circ = (g: G, c: string, x: number, y: number, r: number) => fill(g, c, () => g.arc(x, y, r, 0, Math.PI * 2));
const ell = (g: G, c: string, x: number, y: number, rx: number, ry: number) => fill(g, c, () => g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2));
function line(g: G, c: string, w: number, ...pts: number[]) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.strokeStyle = 'rgba(0,0,0,.6)';
  g.lineWidth = w + 2;
  g.stroke();
  g.strokeStyle = c;
  g.lineWidth = w;
  g.stroke();
}
function poly(g: G, c: string, ...pts: number[]) {
  fill(g, c, () => {
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
  });
}

interface Look { skin: string; body: string; legs: string; team: string; head?: (g: G, x: number, y: number) => void }
/** Humanoid standing at feet (x, y), ~44 px tall, facing right. */
function person(g: G, x: number, y: number, o: Look) {
  rect(g, o.legs, x - 7, y - 18, 6, 18, 2);
  rect(g, o.legs, x + 1, y - 18, 6, 18, 2);
  rect(g, o.body, x - 8, y - 34, 16, 18, 4);
  rect(g, o.team, x - 8, y - 21, 16, 4, 1); // team belt
  circ(g, o.skin, x + 1, y - 40, 7);
  circ(g, '#111', x + 4, y - 41, 1.2);
  o.head?.(g, x + 1, y - 40);
}
const SKIN = '#f0c08a';

// One draw routine per unit kind. Box sizes per kind come from unitBox().
const UNIT_DRAW: ((g: G, w: number, h: number, team: string) => void)[] = [
  // 0 Sopalı: caveman with a club
  (g, w, h, t) => {
    person(g, w / 2 - 4, h, { skin: SKIN, body: '#8a5a2b', legs: '#c7905a', team: t, head: (g, x, y) => fill(g, '#3b2412', () => g.arc(x - 1, y - 3, 7.5, Math.PI, 0)) });
    line(g, '#7a4a1e', 5, w / 2 + 2, h - 26, w / 2 + 14, h - 46);
    circ(g, '#7a4a1e', w / 2 + 14, h - 47, 5);
  },
  // 1 Sapancı: caveman with a sling
  (g, w, h, t) => {
    person(g, w / 2 - 4, h, { skin: SKIN, body: '#9b6a3a', legs: '#c7905a', team: t, head: (g, x, y) => fill(g, '#5a3417', () => g.arc(x - 1, y - 3, 7.5, Math.PI, 0)) });
    line(g, '#d8c39a', 1.5, w / 2 + 2, h - 28, w / 2 + 12, h - 40, w / 2 + 16, h - 30);
    circ(g, '#9a9a9a', w / 2 + 16, h - 30, 3);
  },
  // 2 Dino Binici: green dinosaur + rider with spear
  (g, w, h, t) => {
    poly(g, '#4f9a3a', 6, h - 26, 22, h - 34, 22, h - 22); // tail
    rect(g, '#3f7f2d', w / 2 - 12, h - 16, 7, 16, 3);
    rect(g, '#3f7f2d', w / 2 + 6, h - 16, 7, 16, 3);
    ell(g, '#5fb045', w / 2, h - 24, 22, 12);
    ell(g, '#5fb045', w - 16, h - 40, 12, 8);
    rect(g, '#5fb045', w - 26, h - 38, 10, 14, 4);
    poly(g, '#fff', w - 10, h - 36, w - 6, h - 36, w - 8, h - 32);
    circ(g, '#111', w - 13, h - 43, 1.6);
    rect(g, t, w / 2 - 10, h - 36, 20, 5, 2); // saddle
    person(g, w / 2 - 2, h - 30, { skin: SKIN, body: '#8a5a2b', legs: '#8a5a2b', team: t });
    line(g, '#7a4a1e', 2.5, w / 2 - 4, h - 52, w / 2 + 26, h - 70);
    poly(g, '#ccc', w / 2 + 26, h - 70, w / 2 + 22, h - 64, w / 2 + 30, h - 74);
  },
  // 3 Kılıççı: armored swordsman
  (g, w, h, t) => {
    person(g, w / 2 - 4, h, { skin: SKIN, body: '#8d96a3', legs: '#5d6470', team: t, head: (g, x, y) => fill(g, '#9aa3b0', () => g.arc(x, y - 1, 8, Math.PI, 0)) });
    line(g, '#e6edf5', 3, w / 2 + 4, h - 28, w / 2 + 18, h - 44);
    line(g, '#8a6a2a', 3, w / 2 + 2, h - 26, w / 2 + 6, h - 30);
    ell(g, t, w / 2 - 10, h - 26, 5, 9);
  },
  // 4 Okçu: hooded archer with a bow
  (g, w, h, t) => {
    person(g, w / 2 - 4, h, { skin: SKIN, body: '#3e7a3a', legs: '#4d3a24', team: t, head: (g, x, y) => fill(g, '#2f5f2c', () => g.arc(x - 1, y - 1, 8.5, Math.PI * 0.9, Math.PI * 2.05)) });
    g.beginPath();
    g.arc(w / 2 + 6, h - 30, 13, -1.2, 1.2);
    g.strokeStyle = '#7a4a1e';
    g.lineWidth = 2.5;
    g.stroke();
    line(g, '#eee', 1, w / 2 + 10, h - 42, w / 2 + 10, h - 18);
  },
  // 5 Şövalye: knight on horseback with a lance
  (g, w, h, t) => {
    for (const lx of [-16, -8, 8, 16]) rect(g, '#6a4423', w / 2 + lx - 3, h - 18, 6, 18, 2);
    ell(g, '#8b5a2b', w / 2, h - 24, 24, 11);
    rect(g, '#8b5a2b', w - 22, h - 46, 9, 22, 4);
    ell(g, '#8b5a2b', w - 12, h - 46, 9, 6);
    fill(g, t, () => g.roundRect(w / 2 - 22, h - 30, 36, 12, 4)); // caparison
    person(g, w / 2 - 4, h - 28, { skin: SKIN, body: '#aab3bf', legs: '#aab3bf', team: t, head: (g, x, y) => rect(g, '#aab3bf', x - 8, y - 9, 16, 15, 3) });
    line(g, '#d9c08a', 3, w / 2, h - 52, w + 6, h - 58);
  },
  // 6 Düellocu: feathered hat + rapier
  (g, w, h, t) => {
    person(g, w / 2 - 4, h, { skin: SKIN, body: '#7a2a3a', legs: '#2a2a3a', team: t, head: (g, x, y) => { rect(g, '#2a1a1a', x - 11, y - 7, 22, 3, 1); rect(g, '#2a1a1a', x - 6, y - 13, 12, 7, 2); line(g, t, 2, x - 4, y - 12, x - 12, y - 20); } });
    line(g, '#e6edf5', 1.6, w / 2 + 4, h - 28, w / 2 + 24, h - 32);
  },
  // 7 Tüfekçi: musketeer with a long musket
  (g, w, h, t) => {
    person(g, w / 2 - 6, h, { skin: SKIN, body: '#2d4f8a', legs: '#e8e0c8', team: t, head: (g, x, y) => poly(g, '#1a1a1a', x - 11, y - 5, x + 11, y - 5, x, y - 15) });
    line(g, '#5a3a1a', 3, w / 2 - 6, h - 26, w / 2 + 22, h - 32);
    line(g, '#444', 2, w / 2 + 10, h - 30, w / 2 + 24, h - 33);
  },
  // 8 Topçu: field cannon + gunner
  (g, w, h, t) => {
    person(g, 12, h, { skin: SKIN, body: '#2d4f8a', legs: '#e8e0c8', team: t });
    line(g, '#333', 9, w / 2 - 6, h - 16, w - 4, h - 26);
    rect(g, '#6a4423', w / 2 - 12, h - 18, 22, 6, 2);
    circ(g, '#5a3a1a', w / 2 - 2, h - 9, 9);
    circ(g, '#8a6a3a', w / 2 - 2, h - 9, 3);
    rect(g, t, w / 2 - 14, h - 22, 8, 5, 1);
  },
  // 9 Piyade: modern infantry with rifle + bayonet
  (g, w, h, t) => {
    person(g, w / 2 - 4, h, { skin: SKIN, body: '#5a6b3a', legs: '#4a5530', team: t, head: (g, x, y) => fill(g, '#46552c', () => g.ellipse(x, y - 3, 9, 6, 0, Math.PI, 0)) });
    line(g, '#2a2a2a', 3, w / 2 - 2, h - 26, w / 2 + 18, h - 30);
    line(g, '#ddd', 1.5, w / 2 + 18, h - 30, w / 2 + 24, h - 31);
  },
  // 10 Makineli: machine gunner
  (g, w, h, t) => {
    person(g, w / 2 - 6, h, { skin: SKIN, body: '#5a6b3a', legs: '#4a5530', team: t, head: (g, x, y) => fill(g, '#46552c', () => g.ellipse(x, y - 3, 9, 6, 0, Math.PI, 0)) });
    rect(g, '#2a2a2a', w / 2 - 6, h - 30, 22, 7, 2);
    line(g, '#444', 3, w / 2 + 16, h - 27, w / 2 + 26, h - 27);
    line(g, '#c9a43a', 2, w / 2 + 2, h - 23, w / 2 - 2, h - 14);
  },
  // 11 Tank
  (g, w, h, t) => {
    rect(g, '#3a3f30', 4, h - 14, w - 8, 14, 7);
    for (let i = 0; i < 6; i++) circ(g, '#22251c', 12 + i * ((w - 24) / 5), h - 7, 4.5);
    rect(g, '#6b7a45', 6, h - 26, w - 14, 13, 4);
    rect(g, t, 10, h - 22, w - 24, 4, 1);
    rect(g, '#5d6a3b', w / 2 - 16, h - 38, 30, 13, 6);
    line(g, '#4c5730', 5, w / 2 + 12, h - 32, w + 2, h - 34);
  },
  // 12 Robot Kılıç: robot with an energy blade
  (g, w, h, t) => {
    rect(g, '#7d8794', w / 2 - 8, h - 18, 6, 18, 1);
    rect(g, '#7d8794', w / 2, h - 18, 6, 18, 1);
    rect(g, '#b8c2cf', w / 2 - 10, h - 36, 20, 19, 3);
    rect(g, t, w / 2 - 10, h - 24, 20, 3, 0);
    rect(g, '#b8c2cf', w / 2 - 7, h - 49, 15, 12, 3);
    rect(g, '#33f0ff', w / 2, h - 46, 7, 3, 1);
    line(g, '#7affff', 3, w / 2 + 8, h - 28, w / 2 + 24, h - 50);
  },
  // 13 Lazerci: robot with a laser rifle
  (g, w, h, t) => {
    rect(g, '#5d6674', w / 2 - 8, h - 18, 6, 18, 1);
    rect(g, '#5d6674', w / 2, h - 18, 6, 18, 1);
    rect(g, '#9aa6b4', w / 2 - 10, h - 36, 20, 19, 3);
    rect(g, t, w / 2 - 10, h - 24, 20, 3, 0);
    circ(g, '#9aa6b4', w / 2, h - 43, 7);
    rect(g, '#ff3df0', w / 2 + 1, h - 45, 6, 3, 1);
    rect(g, '#3a3f4a', w / 2 - 2, h - 32, 22, 6, 2);
    circ(g, '#ff7af5', w / 2 + 21, h - 29, 2.5);
  },
  // 14 Savaş Makinesi: walking mech
  (g, w, h, t) => {
    line(g, '#5a6070', 6, w / 2 - 10, h - 30, w / 2 - 18, h - 14, w / 2 - 12, h);
    line(g, '#5a6070', 6, w / 2 + 8, h - 30, w / 2 + 16, h - 14, w / 2 + 10, h);
    rect(g, '#8892a6', w / 2 - 22, h - 52, 42, 24, 8);
    rect(g, t, w / 2 - 18, h - 38, 34, 4, 1);
    rect(g, '#33f0ff', w / 2 + 8, h - 48, 9, 4, 2);
    line(g, '#3a3f4a', 6, w / 2 + 14, h - 40, w + 2, h - 42);
    circ(g, '#7affff', w + 1, h - 42, 2.5);
  },
  // 15 Süper Asker: golden super soldier with a glowing blade
  (g, w, h, t) => {
    g.fillStyle = 'rgba(255,230,120,.25)';
    g.beginPath();
    g.ellipse(w / 2, h - 34, 24, 36, 0, 0, Math.PI * 2);
    g.fill();
    rect(g, '#c99a2e', w / 2 - 10, h - 26, 8, 26, 2);
    rect(g, '#c99a2e', w / 2 + 2, h - 26, 8, 26, 2);
    rect(g, '#f2c94c', w / 2 - 13, h - 52, 26, 28, 6);
    rect(g, t, w / 2 - 13, h - 34, 26, 4, 1);
    rect(g, '#f2c94c', w / 2 - 8, h - 66, 17, 15, 5);
    rect(g, '#ff4040', w / 2 + 1, h - 62, 8, 3, 1);
    line(g, '#fff7c2', 4, w / 2 + 12, h - 40, w / 2 + 26, h - 72);
  },
];

/** Texture size for a unit kind (feet at bottom center). */
export function unitBox(k: number): { w: number; h: number } {
  if (k === 11) return { w: 84, h: 44 };
  if (k === 14) return { w: 78, h: 64 };
  if (k === 15) return { w: 64, h: 80 };
  if (k === 2 || k === 5) return { w: 76, h: 76 };
  if (k === 8) return { w: 64, h: 46 };
  return { w: 52, h: 56 };
}

export function unitTexture(scene: Phaser.Scene, k: number, team: 0 | 1): string {
  const { w, h } = unitBox(k);
  return canvas(scene, `wu${k}_${team}`, w, h, (g) => UNIT_DRAW[k](g, w, h - 1, hex(TEAM_COLOR[team])));
}

// --- bases (per age), facing right ----------------------------------------------------------
export const BASE_TEX = { w: 150, h: 190 };
export function baseTexture(scene: Phaser.Scene, age: number, team: 0 | 1): string {
  const { w, h } = BASE_TEX;
  const t = hex(TEAM_COLOR[team]);
  return canvas(scene, `wb${age}_${team}`, w, h, (g) => {
    const flag = (x: number, y: number) => {
      line(g, '#5a4a3a', 2, x, y, x, y - 30);
      poly(g, t, x, y - 30, x + 20, y - 24, x, y - 18);
    };
    switch (age) {
      case 0: // cave in a rock mound
        fill(g, '#7b6a58', () => { g.moveTo(0, h); g.quadraticCurveTo(10, 40, 70, 50); g.quadraticCurveTo(130, 60, 140, h); g.closePath(); });
        fill(g, '#6a5a4a', () => g.ellipse(40, 100, 26, 18, 0.2, 0, Math.PI * 2), '');
        fill(g, '#1e1612', () => { g.moveTo(80, h); g.quadraticCurveTo(84, 120, 108, 122); g.quadraticCurveTo(128, 128, 128, h); g.closePath(); });
        flag(70, 52);
        break;
      case 1: // stone keep
        rect(g, '#9a9488', 10, 60, 110, h - 60, 0);
        for (let i = 0; i < 5; i++) rect(g, '#9a9488', 10 + i * 24, 46, 14, 16, 0);
        for (let y = 72; y < h; y += 16) line(g, 'rgba(0,0,0,.18)', 1, 10, y, 120, y);
        fill(g, '#3a2a1a', () => { g.moveTo(84, h); g.lineTo(84, 140); g.arc(100, 140, 16, Math.PI, 0); g.lineTo(116, h); g.closePath(); });
        flag(64, 46);
        break;
      case 2: // renaissance fort with a dome
        rect(g, '#d8c9a8', 6, 80, 124, h - 80, 2);
        fill(g, '#b0482f', () => { g.moveTo(0, 82); g.lineTo(68, 40); g.lineTo(136, 82); g.closePath(); });
        for (const x of [24, 54, 84]) rect(g, '#5a7aa8', x, 100, 16, 22, 8);
        rect(g, '#5a3a1a', 96, 140, 26, h - 140, 12);
        flag(68, 40);
        break;
      case 3: // concrete bunker with radar
        rect(g, '#7f8a7a', 4, 90, 132, h - 90, 10);
        rect(g, '#6c7768', 20, 60, 70, 34, 6);
        rect(g, '#222', 30, 70, 50, 8, 2);
        line(g, '#555', 3, 104, 90, 104, 52);
        fill(g, '#aaa', () => g.ellipse(104, 50, 16, 6, -0.4, 0, Math.PI * 2));
        rect(g, t, 4, 120, 132, 6, 0);
        rect(g, '#333', 98, 140, 30, h - 140, 3);
        break;
      default: // future spire with an energy dome
        fill(g, '#2a3550', () => { g.moveTo(10, h); g.lineTo(40, 40); g.lineTo(96, 40); g.lineTo(130, h); g.closePath(); });
        fill(g, 'rgba(90,240,255,.35)', () => g.arc(68, 44, 34, Math.PI, 0), '#7affff');
        for (let y = 70; y < h; y += 22) line(g, '#33f0ff', 2, 30 + (y - 40) * 0.1, y, 106 - (y - 40) * 0.1 + 14, y);
        rect(g, t, 50, 100, 36, 8, 3);
        rect(g, '#111a2a', 92, 140, 28, h - 140, 4);
        break;
    }
  });
}

// --- turrets (per kind), facing right --------------------------------------------------------
export function turretTexture(scene: Phaser.Scene, k: number): string {
  const age = Math.floor(k / 3);
  const kind = k % 3;
  return canvas(scene, `wt${k}`, 46, 30, (g) => {
    const metal = ['#7a5a3a', '#6a5a4a', '#3a3a3a', '#4c5730', '#4a5a7a'][age];
    rect(g, '#555', 4, 20, 26, 9, 2);
    const len = [18, 22, 26][kind];
    const thick = [5, 6, 8][kind] + age;
    if (age <= 1 && kind !== 1) {
      line(g, metal, 4, 14, 22, 30, 4); // catapult / sling arm
      circ(g, '#888', 30, 5, 4);
    } else {
      rect(g, metal, 8, 10, 18, 12, 4);
      line(g, metal, thick, 20, 15, 20 + len, 13);
      if (kind === 1 && age >= 3) line(g, metal, thick - 2, 20, 21, 18 + len, 20); // twin barrel
      if (age === 4) circ(g, '#7affff', 20 + len, 13, 3);
    }
  });
}

export function projTexture(scene: Phaser.Scene, kind: 'rock' | 'arrow' | 'ball' | 'bullet' | 'laser' | 'shell' | 'meteor'): string {
  return canvas(scene, `wp_${kind}`, 24, 12, (g) => {
    switch (kind) {
      case 'rock': circ(g, '#9a9a9a', 12, 6, 4); break;
      case 'arrow': line(g, '#d9c08a', 1.5, 2, 6, 20, 6); poly(g, '#ccc', 24, 6, 18, 3, 18, 9); break;
      case 'ball': circ(g, '#222', 12, 6, 5); break;
      case 'bullet': line(g, '#ffe27a', 2, 6, 6, 20, 6); break;
      case 'laser': line(g, '#7affff', 3, 0, 6, 24, 6); break;
      case 'shell': ell(g, '#555', 12, 6, 8, 4); break;
      case 'meteor': circ(g, '#ff8a3a', 12, 6, 6); break;
    }
  });
}
/** Projectile look by unit/turret age (ranged attacks only). */
export const PROJ_BY_AGE = ['rock', 'arrow', 'ball', 'bullet', 'laser'] as const;

// --- backdrop --------------------------------------------------------------------------------
export function skyTexture(scene: Phaser.Scene): string {
  return canvas(scene, 'wsky', 960, 540, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 540);
    gr.addColorStop(0, '#6fb7ff');
    gr.addColorStop(0.7, '#cfe8ff');
    gr.addColorStop(1, '#f6e6c8');
    g.fillStyle = gr;
    g.fillRect(0, 0, 960, 540);
    g.fillStyle = 'rgba(255,255,255,.8)';
    for (const [x, y, s] of [[120, 110, 1], [420, 80, 1.3], [760, 130, 0.9]]) {
      g.beginPath();
      g.ellipse(x, y, 50 * s, 16 * s, 0, 0, Math.PI * 2);
      g.ellipse(x + 30 * s, y - 10 * s, 34 * s, 16 * s, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
}

export function hillsTexture(scene: Phaser.Scene): string {
  const w = 1800;
  return canvas(scene, 'whills', w, 200, (g) => {
    g.fillStyle = '#8fb8a0';
    g.beginPath();
    g.moveTo(0, 200);
    for (let x = 0; x <= w; x += 60) g.lineTo(x, 90 + Math.sin(x / 170) * 40 + Math.sin(x / 61) * 12);
    g.lineTo(w, 200);
    g.fill();
    g.fillStyle = '#76a487';
    g.beginPath();
    g.moveTo(0, 200);
    for (let x = 0; x <= w; x += 40) g.lineTo(x, 140 + Math.sin(x / 120 + 1) * 25);
    g.lineTo(w, 200);
    g.fill();
  });
}

export function groundTexture(scene: Phaser.Scene): string {
  return canvas(scene, 'wground', LANE_W, 160, (g) => {
    g.fillStyle = '#6aa84f';
    g.fillRect(0, 0, LANE_W, 10);
    const gr = g.createLinearGradient(0, 10, 0, 160);
    gr.addColorStop(0, '#9a7448');
    gr.addColorStop(1, '#5a4028');
    g.fillStyle = gr;
    g.fillRect(0, 10, LANE_W, 150);
    g.fillStyle = 'rgba(0,0,0,.12)';
    for (let i = 0; i < 260; i++) {
      const x = (i * 977) % LANE_W;
      const y = 20 + ((i * 131) % 120);
      g.fillRect(x, y, 6, 3);
    }
  });
}

