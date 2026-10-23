// Bomba scene: renders BombState, plays synthesized sfx, HUD cards on both sides of the arena.
import Phaser from 'phaser';
import type { RoomSession, StartPayload } from '../../net';
import { playNoise, playTone } from '../../ui/audio';
import { cssColor, isTouch, toast } from '../../ui/dom';
import { showEndCard } from '../../ui/endcard';
import { GameLoop, startPayload } from '../../ui/loop';
import { mountNetMeter } from '../../ui/netmeter';
import { Pool } from '../../ui/render/pool';
import { Smoother } from '../../ui/render/smooth';
import { FONT, RES } from '../../ui/textures';
import { mountTouchControls, type TouchControls } from '../../ui/touch';
import {
  PH, T, bombTexture, chipTexture, crateTexture, flameTexture, floorTexture, itemTexture, playerTexture,
  portraitTexture, sparkTexture, starTexture, wallTexture, type Facing,
} from './art';
import { BALANCE as B, COLS, ROWS, TICK } from './balance';
import {
  CRATE, FLOOR, WALL, bombSim, idx, side,
  type BPlayer, type Bomb, type BombEvent, type BombInput, type BombState, type Flame, type Item, type ItemKind,
} from './sim';

const AW = COLS * T; // 540
const AH = ROWS * T; // 468
const X0 = (960 - AW) / 2;
const Y0 = 62;
const px = (x: number) => X0 + x * T;
const py = (y: number) => Y0 + y * T;
const TEAM_NAMES = ['Kırmızı takım', 'Mavi takım'];
const TEAM_COLORS = [0xff5a5a, 0x4aa8ff];
const CURSE_TEXT = { slow: 'Yavaş!', reverse: 'Ters!', nobomb: 'Bombasız!' } as const;
const txt = (size: number, color = '#f4f1ff', stroke = 5) => ({
  fontFamily: FONT, fontSize: `${size}px`, fontStyle: '700', color, stroke: '#0d1020', strokeThickness: stroke, resolution: 2,
});
const isPillar = (c: number, r: number) => c === 0 || r === 0 || c === COLS - 1 || r === ROWS - 1 || (c % 2 === 0 && r % 2 === 0);

type Key = 'up' | 'down' | 'left' | 'right' | 'bomb';
const KEYS: Record<string, Key> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Space: 'bomb', KeyX: 'bomb',
};

/** Keyboard (arrows/WASD + Space/X) and touch (d-pad + BOMBA) → BombInput; each press bumps seq. */
function createControls() {
  const down = new Set<string>();
  let seq = 0;
  const onDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || !(e.code in KEYS)) return;
    e.preventDefault();
    if (KEYS[e.code] === 'bomb' && !e.repeat && !down.has(e.code)) seq++;
    down.add(e.code);
  };
  const onUp = (e: KeyboardEvent) => down.delete(e.code);
  const clear = () => down.clear();
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', clear);
  const touch: TouchControls | null = isTouch()
    ? mountTouchControls({ left: { dpad: true }, right: [{ id: 'bomb', label: 'BOMBA', size: 'big' }] })
    : null;
  touch?.onPress('bomb', () => seq++);
  return {
    read(): BombInput {
      const i: BombInput = { up: false, down: false, left: false, right: false, bomb: false, seq };
      for (const code of down) i[KEYS[code]] = true;
      if (touch) for (const k of ['up', 'down', 'left', 'right', 'bomb'] as const) i[k] ||= touch.isDown(k);
      return i;
    },
    destroy() {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', clear);
      touch?.destroy();
    },
  };
}

const sfx = {
  place: () => playTone({ freq: 260, slideTo: 150, dur: 0.09, type: 'square', vol: 0.14 }),
  tick: () => playTone({ freq: 1800, dur: 0.025, type: 'square', vol: 0.04 }),
  explode() {
    playNoise({ dur: 0.55, vol: 0.7, filter: 260 });
    playTone({ freq: 140, slideTo: 38, dur: 0.4, vol: 0.45 });
  },
  crate: () => playNoise({ dur: 0.18, vol: 0.25, filter: 1400 }),
  pickup: (k: ItemKind) =>
    k === 'skull'
      ? [500, 420, 340].forEach((f, i) => playTone({ freq: f, dur: 0.12, type: 'sawtooth', vol: 0.12, delay: i * 0.08 }))
      : [523, 659, 784, 1047].forEach((f, i) => playTone({ freq: f, dur: 0.1, type: 'triangle', vol: 0.2, delay: i * 0.05 })),
  shield: () => playTone({ freq: 1200, slideTo: 300, dur: 0.25, type: 'triangle', vol: 0.25 }),
  death() {
    playTone({ freq: 600, slideTo: 80, dur: 0.6, type: 'sawtooth', vol: 0.22 });
    playNoise({ dur: 0.25, vol: 0.3, filter: 500, delay: 0.05 });
  },
  kick: () => playTone({ freq: 180, slideTo: 90, dur: 0.1, type: 'square', vol: 0.18 }),
  beep: (hi: boolean) => playTone({ freq: hi ? 880 : 440, dur: hi ? 0.3 : 0.15, type: 'square', vol: 0.12 }),
  sudden: () => [0, 0.3, 0.6].forEach((d) => playTone({ freq: 700, slideTo: 350, dur: 0.25, type: 'sawtooth', vol: 0.14, delay: d })),
  fall: () => playNoise({ dur: 0.12, vol: 0.35, filter: 180 }),
  win: () => [523, 659, 784, 659, 784, 1047].forEach((f, i) => playTone({ freq: f, dur: 0.14, type: 'square', vol: 0.12, delay: i * 0.1 })),
  lose: () => [392, 330, 262].forEach((f, i) => playTone({ freq: f, dur: 0.25, type: 'triangle', vol: 0.2, delay: i * 0.18 })),
};

interface Card {
  bg: Phaser.GameObjects.Graphics;
  portrait: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
  stars: Phaser.GameObjects.Image[];
  stats: Phaser.GameObjects.Text[];
  icons: Phaser.GameObjects.Image[];
  curse: Phaser.GameObjects.Text;
  key: string;
}

export class BombScene extends Phaser.Scene {
  private session!: RoomSession;
  private payload!: StartPayload;
  private loop!: GameLoop<BombState, BombInput, BombEvent>;
  private controls!: ReturnType<typeof createControls>;
  private smooth = new Smoother();
  private cells: Phaser.GameObjects.Image[] = [];
  private gridKey = '';
  private items!: Pool<string, Item, Phaser.GameObjects.Image>;
  private bombs!: Pool<number, Bomb, Phaser.GameObjects.Container>;
  private flames!: Pool<number, Flame, Phaser.GameObjects.Image>;
  private sprites: Phaser.GameObjects.Image[] = [];
  private overlay!: Phaser.GameObjects.Graphics;
  private curseIcons: Phaser.GameObjects.Image[] = [];
  private youTag!: Phaser.GameObjects.Text;
  private cards: Card[] = [];
  private roundText!: Phaser.GameObjects.Text;
  private timer!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private bannerSub!: Phaser.GameObjects.Text;
  private bannerKey = '';
  private closeEnd: (() => void) | null = null;
  private lastTick = 0;
  private tickAt = 0;
  private flameSet = new Set<number>();

  constructor() {
    super('BombGame');
  }

  create({ session, payload }: { session: RoomSession; payload: StartPayload }): void {
    this.session = session;
    this.payload = payload;
    this.cells = [];
    this.sprites = [];
    this.cards = [];
    this.curseIcons = [];
    this.gridKey = '';
    this.bannerKey = '';
    this.closeEnd = null;
    this.lastTick = 0;
    this.smooth.clear();

    const bg = this.add.graphics().setDepth(0);
    bg.fillGradientStyle(0x1b1f3d, 0x1b1f3d, 0x0d1020, 0x0d1020).fillRect(0, 0, 960, 540);
    bg.fillStyle(0x000000, 0.35).fillRoundedRect(X0 - 6, Y0 - 4, AW + 12, AH + 10, 10);
    this.add.image(X0, Y0, floorTexture(this, COLS, ROWS)).setOrigin(0).setScale(1 / RES).setDepth(1);
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        this.cells.push(this.add.image(px(c), py(r), wallTexture(this)).setOrigin(0).setScale(1 / RES).setDepth(3 + r / 100).setVisible(false));
    wallTexture(this, true);
    crateTexture(this);
    chipTexture(this);

    this.items = new Pool((it) => this.add.image(0, 0, itemTexture(this, it.k)).setScale(1 / RES).setDepth(1.4));
    this.flames = new Pool(() => this.add.image(0, 0, flameTexture(this, 'center')).setScale(1 / RES).setDepth(2.2));
    this.bombs = new Pool(() => {
      const img = this.add.image(0, 0, bombTexture(this)).setScale(1 / RES);
      const spark = this.add.image(6, -14, sparkTexture(this)).setScale(1 / RES);
      return this.add.container(0, 0, [img, spark]).setDepth(2.5);
    });
    for (let i = 0; i < 4; i++) {
      this.sprites.push(this.add.image(0, 0, '__DEFAULT').setOrigin(0.5, 1).setScale(1 / RES).setDepth(4));
      this.curseIcons.push(this.add.image(0, 0, itemTexture(this, 'skull')).setScale(0.32).setDepth(6).setVisible(false));
    }
    this.overlay = this.add.graphics().setDepth(5);
    this.youTag = this.add.text(0, 0, 'SEN', txt(14, '#fff6a8', 4)).setOrigin(0.5, 1).setDepth(6);

    this.roundText = this.add.text(480 - 96, 30, '', txt(24, '#c9c8f0')).setOrigin(1, 0.5).setDepth(10);
    this.timer = this.add.text(480, 30, '', txt(34, '#ffd23f', 6)).setOrigin(0.5).setDepth(10);
    this.add
      .text(480 + 96, 30, payload.mode === 'team' ? 'Takım 2v2' : 'Herkes tek', txt(22, '#c9c8f0'))
      .setOrigin(0, 0.5)
      .setDepth(10);
    this.banner = this.add.text(px(COLS / 2), py(ROWS / 2) - 16, '', txt(64, '#ffd23f', 10)).setOrigin(0.5).setDepth(20);
    this.bannerSub = this.add.text(px(COLS / 2), py(ROWS / 2) + 40, '', txt(28, '#f4f1ff', 7)).setOrigin(0.5).setDepth(20);

    this.controls = createControls();
    this.loop = new GameLoop(session, bombSim, {
      onHostLeft: () => {
        toast('Oda kurucusu ayrıldı');
        this.toMenu();
      },
      reconcileDist: 1.25, // tiles
      onSnapshot: (prev, next) => this.diffSnapshot(prev, next),
    });
    this.loop.start(payload);
    mountNetMeter(this, this.loop, session);

    this.events.once('shutdown', () => {
      this.loop.dispose();
      this.controls.destroy();
      this.closeEnd?.();
    });
  }

  update(time: number, delta: number): void {
    this.loop.setLocalInput(this.controls.read());
    const events = this.loop.update(Math.min(delta, 250));
    const s = this.loop.state;
    if (!s) return;
    if (s.tick + 60 < this.lastTick) this.resetForNewGame(); // "Tekrar Oyna" started a fresh state
    this.lastTick = s.tick;
    this.smooth.decay(Math.min(delta, 250));
    this.handleEvents(events, s);
    this.drawGrid(s);
    this.drawEntities(s, time);
    this.drawHud(s);
    this.drawBanner(s, time);
    if (s.bombs.length && time - this.tickAt > 480) {
      this.tickAt = time;
      sfx.tick();
    }
  }

  private resetForNewGame(): void {
    this.closeEnd?.();
    this.closeEnd = null;
    this.smooth.clear();
    this.gridKey = '';
    this.bannerKey = '';
  }

  // ---------- client event synthesis (things the host simulated that local prediction missed)
  private diffSnapshot(prev: BombState | null, next: BombState): BombEvent[] {
    const ev: BombEvent[] = [];
    if (!prev) return ev;
    for (const p of next.players) {
      const o = prev.players.find((q) => q.id === p.id);
      if (!o) continue;
      if (o.alive && !p.alive) ev.push({ type: 'death', id: p.id, x: p.x, y: p.y });
      if (p.id !== this.loop.selfId && prev.round === next.round) this.smooth.correct(p.id, px(o.x), py(o.y), px(p.x), py(p.y));
    }
    if (prev.round === next.round) {
      const now = new Set(next.bombs.map((b) => b.id));
      const before = new Set(prev.bombs.map((b) => b.id));
      for (const b of prev.bombs) if (!now.has(b.id)) ev.push({ type: 'explode', c: b.c, r: b.r });
      for (const b of next.bombs) if (!before.has(b.id)) ev.push({ type: 'place', c: b.c, r: b.r });
      for (let i = 0; i < next.grid.length; i++) {
        const c = i % COLS;
        const r = Math.floor(i / COLS);
        if (prev.grid[i] === CRATE && next.grid[i] === FLOOR) ev.push({ type: 'crate', c, r });
        if (prev.grid[i] !== WALL && next.grid[i] === WALL) ev.push({ type: 'fall', c, r });
      }
      if (prev.timeLeft > 0 && next.timeLeft === 0) ev.push({ type: 'sudden' });
    }
    if (prev.phase !== next.phase) {
      if (next.phase === 'roundEnd') ev.push({ type: 'roundEnd', winner: next.lastWinner });
      if (next.phase === 'matchEnd') ev.push({ type: 'matchEnd', winner: next.lastWinner });
      if (next.phase === 'play' && prev.phase === 'countdown') ev.push({ type: 'go' });
    }
    return ev;
  }

  private handleEvents(events: BombEvent[], s: BombState): void {
    const played = new Set<string>();
    const once = (k: string, f: () => void) => {
      if (!played.has(k)) played.add(k), f();
    };
    for (const e of events) {
      switch (e.type) {
        case 'place': once('place', sfx.place); break;
        case 'explode':
          once('explode', () => {
            sfx.explode();
            this.cameras.main.shake(120, 0.004);
          });
          break;
        case 'crate':
          once('crate', sfx.crate);
          this.debris(e.c, e.r);
          break;
        case 'pickup':
          if (e.id === this.loop.selfId || this.session.isHost) once('pickup', () => sfx.pickup(e.k));
          break;
        case 'shield': once('shield', sfx.shield); break;
        case 'death': {
          once('death', sfx.death);
          const p = s.players.find((q) => q.id === e.id);
          if (p) this.deathFx(p, e.x, e.y);
          break;
        }
        case 'kick': once('kick', sfx.kick); break;
        case 'countdown': sfx.beep(false); break;
        case 'go': sfx.beep(true); break;
        case 'sudden': sfx.sudden(); break;
        case 'fall':
          once('fall', sfx.fall);
          this.fallFx(e.c, e.r);
          break;
        case 'roundEnd': {
          const me = s.players.find((p) => p.id === this.loop.selfId);
          if (me && e.winner !== null && side(s, me) === e.winner) sfx.win();
          else sfx.lose();
          break;
        }
        case 'matchEnd': break;
      }
    }
  }

  private debris(c: number, r: number): void {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.random();
      const chip = this.add.image(px(c + 0.5), py(r + 0.5), 'bomb_chip').setScale(1 / RES).setDepth(4.5).setAngle(Math.random() * 360);
      this.tweens.add({
        targets: chip, x: chip.x + Math.cos(a) * 22, y: chip.y + Math.sin(a) * 22 - 6, angle: chip.angle + 200, alpha: 0,
        duration: 450, ease: 'Quad.easeOut', onComplete: () => chip.destroy(),
      });
    }
  }

  private fallFx(c: number, r: number): void {
    const img = this.add.image(px(c), py(r) - 120, 'bomb_wall_sd').setOrigin(0).setScale(1 / RES).setDepth(4.8).setAlpha(0.9);
    this.tweens.add({ targets: img, y: py(r), duration: 180, ease: 'Quad.easeIn', onComplete: () => img.destroy() });
  }

  private deathFx(p: BPlayer, x: number, y: number): void {
    const img = this.add.image(px(x), py(y) + T * 0.42, playerTexture(this, p.color, 'down', 0)).setOrigin(0.5, 1).setScale(1 / RES).setDepth(6);
    this.tweens.add({ targets: img, angle: 360, scale: 0.1, alpha: 0, y: img.y - 20, duration: 700, ease: 'Quad.easeIn', onComplete: () => img.destroy() });
  }

  // ---------- rendering
  private drawGrid(s: BombState): void {
    const key = s.grid.join('');
    if (key === this.gridKey) return;
    this.gridKey = key;
    s.grid.forEach((t, i) => {
      const c = i % COLS;
      const r = Math.floor(i / COLS);
      const img = this.cells[i];
      img.setVisible(t !== FLOOR);
      if (t === CRATE) img.setTexture('bomb_crate');
      else if (t === WALL) img.setTexture(isPillar(c, r) ? 'bomb_wall' : 'bomb_wall_sd');
    });
  }

  private drawEntities(s: BombState, time: number): void {
    this.items.sync(s.items, (it) => `${it.c},${it.r},${it.k}`, (img, it) => {
      img.setPosition(px(it.c + 0.5), py(it.r + 0.5) + Math.sin(time / 250 + it.c) * 1.5);
    });

    this.flameSet = new Set(s.flames.map((f) => idx(f.c, f.r)));
    const has = (c: number, r: number) => this.flameSet.has(idx(c, r));
    this.flames.sync(s.flames, (f) => idx(f.c, f.r), (img, f) => {
      const l = has(f.c - 1, f.r);
      const rr = has(f.c + 1, f.r);
      const u = has(f.c, f.r - 1);
      const d = has(f.c, f.r + 1);
      const n = +l + +rr + +u + +d;
      let kind: 'center' | 'arm' | 'end' = 'center';
      let angle = 0;
      if (n === 2 && l && rr) kind = 'arm';
      else if (n === 2 && u && d) [kind, angle] = ['arm', 90];
      else if (n === 1) {
        kind = 'end';
        angle = l ? 0 : rr ? 180 : u ? 90 : -90;
      }
      img.setTexture(flameTexture(this, kind)).setAngle(angle).setPosition(px(f.c + 0.5), py(f.r + 0.5));
      const k = f.t / B.flameTicks;
      img.setAlpha(Math.min(1, k * 2.5)).setScale((1 / RES) * (0.85 + 0.15 * Math.min(1, k * 2)));
    });

    this.bombs.sync(s.bombs, (b) => b.id, (cont, b) => {
      cont.setPosition(px(b.c + 0.5 + b.dx * b.s), py(b.r + 0.5 + b.dy * b.s));
      const urgency = 1 - b.fuse / B.fuseTicks;
      cont.setScale(1 + Math.sin(time / (120 - urgency * 80)) * (0.05 + urgency * 0.06));
      const spark = cont.list[1] as Phaser.GameObjects.Image;
      spark.setAlpha(0.6 + Math.random() * 0.4).setScale((1 / RES) * (0.8 + Math.random() * 0.6));
    });

    this.overlay.clear();
    const me = this.loop.selfId;
    this.youTag.setVisible(false);
    s.players.forEach((p, i) => {
      const spr = this.sprites[i];
      const curse = this.curseIcons[i];
      curse.setVisible(false);
      if (!p.alive) {
        spr.setVisible(false);
        return;
      }
      const pos = this.smooth.at(p.id, px(p.x), py(p.y));
      const facing: Facing = p.dir === 'u' ? 'up' : p.dir === 'd' ? 'down' : 'side';
      const frame = p.moving && s.phase === 'play' ? [1, 0, 2, 0][Math.floor(time / 90) % 4] : 0;
      spr.setTexture(playerTexture(this, p.color, facing, frame)).setFlipX(p.dir === 'l');
      spr.setPosition(pos.x, pos.y + T * 0.42).setDepth(3.05 + p.y / 100).setVisible(true);
      spr.setAlpha(s.tick < p.invulnUntil && Math.floor(time / 80) % 2 ? 0.35 : 1);
      if (s.mode === 'team') {
        this.overlay.lineStyle(3, TEAM_COLORS[p.team], 0.9).strokeEllipse(pos.x, pos.y + T * 0.36, 26, 9);
      }
      if (p.shield) {
        this.overlay.lineStyle(2, 0x9fe4ff, 0.5 + 0.3 * Math.sin(time / 150)).strokeCircle(pos.x, pos.y - 4, 21);
        this.overlay.fillStyle(0x9fe4ff, 0.12).fillCircle(pos.x, pos.y - 4, 21);
      }
      if (p.curse) {
        curse.setPosition(pos.x + 14, pos.y - PH * 0.55).setVisible(Math.floor(time / 200) % 3 !== 0);
      }
      if (p.id === me) this.youTag.setPosition(pos.x, pos.y - PH * 0.55 + Math.sin(time / 180) * 2).setVisible(true);
    });
  }

  private card(slot: number): Card {
    if (this.cards[slot]) return this.cards[slot];
    const x = slot % 2 === 0 ? 10 : 960 - 10 - 186;
    const y = slot < 2 ? Y0 : Y0 + 240;
    const c: Card = {
      bg: this.add.graphics().setDepth(9),
      portrait: this.add.image(x + 34, y + 34, '__DEFAULT').setScale(1 / RES).setDepth(10),
      name: this.add.text(x + 66, y + 12, '', txt(20)).setDepth(10),
      status: this.add.text(x + 66, y + 38, '', txt(16, '#c9c8f0', 4)).setDepth(10),
      stars: [0, 1, 2].map((i) => this.add.image(x + 22 + i * 26, y + 82, starTexture(this, false)).setScale(1.1 / RES).setDepth(10)),
      icons: [],
      stats: [],
      curse: this.add.text(x + 93, y + 196, '', txt(18, '#a6ff8a', 4)).setOrigin(0.5).setDepth(10),
      key: '',
    };
    const kinds: ItemKind[] = ['bomb', 'fire', 'speed', 'kick', 'shield'];
    kinds.forEach((k, i) => {
      const ix = x + 22 + (i % 3) * 58;
      const iy = y + 122 + Math.floor(i / 3) * 40;
      c.icons.push(this.add.image(ix, iy, itemTexture(this, k)).setScale(0.8 / RES).setDepth(10));
      c.stats.push(this.add.text(ix + 16, iy, '', txt(20)).setOrigin(0, 0.5).setDepth(10));
    });
    this.cards[slot] = c;
    return c;
  }

  private drawHud(s: BombState): void {
    for (const p of s.players) {
      const c = this.card(p.slot);
      const key = JSON.stringify([p.name, p.alive, p.wins, p.bombs, p.fire, p.speed, p.kick, p.shield, p.curse, p.bot]);
      if (key === c.key) continue;
      c.key = key;
      const x = p.slot % 2 === 0 ? 10 : 960 - 10 - 186;
      const y = p.slot < 2 ? Y0 : Y0 + 240;
      const accent = s.mode === 'team' ? TEAM_COLORS[p.team] : p.color;
      c.bg.clear();
      c.bg.fillStyle(0x161a36, p.alive ? 0.92 : 0.6).fillRoundedRect(x, y, 186, 220, 14);
      c.bg.lineStyle(3, accent, p.alive ? 1 : 0.35).strokeRoundedRect(x, y, 186, 220, 14);
      if (p.id === this.loop.selfId) c.bg.fillStyle(accent, 0.18).fillRoundedRect(x + 3, y + 3, 180, 62, 12);
      c.portrait.setTexture(portraitTexture(this, p.color)).setAlpha(p.alive ? 1 : 0.35);
      c.name.setText(p.name.slice(0, 10)).setColor(cssColor(p.color));
      c.status.setText(p.alive ? (p.bot ? 'Bot' : 'Hayatta') : '💀 Elendi');
      c.stars.forEach((st, i) => st.setTexture(starTexture(this, i < p.wins)));
      const vals = [String(p.bombs), String(p.fire), String(p.speed), p.kick ? '✓' : '–', p.shield ? '✓' : '–'];
      c.stats.forEach((t, i) => t.setText(vals[i]));
      c.icons.forEach((ic, i) => ic.setAlpha(i < 3 || vals[i] === '✓' ? 1 : 0.3));
      c.curse.setText(p.curse ? `☠ ${CURSE_TEXT[p.curse]}` : '');
      for (const o of [c.portrait, c.name, c.status, ...c.stars, ...c.icons, ...c.stats, c.curse]) o.setVisible(true);
    }
    this.roundText.setText(`Raund ${s.round}`);
    const sec = Math.ceil(s.timeLeft / TICK);
    this.timer
      .setText(s.timeLeft > 0 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : 'ANİ ÖLÜM')
      .setColor(s.timeLeft > 0 && sec > 10 ? '#ffd23f' : '#ff5a5a');
  }

  private drawBanner(s: BombState, time: number): void {
    let main = '';
    let sub = '';
    let color = '#ffd23f';
    if (s.phase === 'countdown') {
      const left = s.phaseTicks - 30;
      main = left > 0 ? String(Math.ceil(left / 60)) : 'Başla!';
      sub = `Raund ${s.round}`;
    } else if (s.phase === 'play' && B.roundTicks - s.timeLeft < 40) main = 'Başla!';
    else if (s.phase === 'play' && s.timeLeft === 0 && s.sdIdx < 14) [main, color] = ['Ani ölüm!', '#ff5a5a'];
    else if (s.phase === 'roundEnd' || s.phase === 'matchEnd') {
      [main, color] = s.lastWinner === null ? ['Berabere!', '#c9c8f0'] : [`${this.winnerName(s, s.lastWinner)} kazandı!`, '#4be37a'];
      if (s.phase === 'roundEnd') sub = this.scoreLine(s);
    }
    const key = `${main}|${sub}`;
    if (key !== this.bannerKey) {
      this.bannerKey = key;
      this.banner.setText(main).setColor(color).setVisible(!!main);
      this.bannerSub.setText(sub).setVisible(!!sub);
      if (main) {
        this.banner.setScale(0.3);
        this.tweens.add({ targets: this.banner, scale: 1, duration: 320, ease: 'Back.easeOut' });
      }
    }
    if (main === 'Ani ölüm!') this.banner.setAlpha(0.6 + 0.4 * Math.sin(time / 90));
    else this.banner.setAlpha(1);
    if (s.phase === 'matchEnd' && !this.closeEnd) this.showEnd(s);
  }

  private winnerName(s: BombState, w: string): string {
    if (w.startsWith('team')) return TEAM_NAMES[Number(w.slice(4))] ?? w;
    return s.players.find((p) => p.id === w)?.name ?? w;
  }

  private scoreLine(s: BombState): string {
    if (s.mode === 'team') {
      const w = [0, 1].map((t) => s.players.find((p) => p.team === t)?.wins ?? 0);
      return `${TEAM_NAMES[0]} ${w[0]} – ${w[1]} ${TEAM_NAMES[1]}`;
    }
    return s.players.map((p) => `${p.name.slice(0, 8)} ${p.wins}`).join('  ·  ');
  }

  private showEnd(s: BombState): void {
    const champ = s.lastWinner === null ? null : this.winnerName(s, s.lastWinner);
    const rows = [...s.players].sort((a, b) => b.wins - a.wins || a.slot - b.slot);
    const lines =
      s.mode === 'team'
        ? [0, 1]
            .map((t) => ({ t, w: s.players.find((p) => p.team === t)!.wins }))
            .sort((a, b) => b.w - a.w)
            .map(({ t, w }, i) => `${i + 1}. ${TEAM_NAMES[t]} (${s.players.filter((p) => p.team === t).map((p) => p.name).join(', ')}) ${'★'.repeat(w)}`)
        : rows.map((p, i) => `${i + 1}. ${p.name} ${'★'.repeat(p.wins)}${'☆'.repeat(Math.max(0, B.winsToWin - p.wins))}`);
    this.closeEnd = showEndCard({
      title: champ ? `${champ} şampiyon!` : 'Maç bitti',
      lines,
      isHost: this.session.isHost,
      onRestart: () => this.session.startGame(startPayload(this.session, this.payload.mode)),
      onMenu: () => this.toMenu(),
    });
  }

  private toMenu(): void {
    void this.session.leave().catch(() => {});
    this.scene.start('Menu');
  }
}
