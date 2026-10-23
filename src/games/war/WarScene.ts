// Çağlar Savaşı scene: scrolling side-view lane + HUD strip. Pure view of loop.state; all actions go
// through WarInput commands ({ cmd, seq }) so host and clients run the same deterministic sim.
import Phaser from 'phaser';
import type { RoomSession, StartPayload } from '../../net';
import { playNoise, playTone } from '../../ui/audio';
import { cssColor, h, toast } from '../../ui/dom';
import { showEndCard } from '../../ui/endcard';
import { GameLoop, startPayload } from '../../ui/loop';
import { mountNetMeter } from '../../ui/netmeter';
import { FONT, sparkTexture } from '../../ui/textures';
import * as B from './balance';
import {
  GROUND_Y, PROJ_BY_AGE, TEAM_COLOR, baseTexture, groundTexture, hillsTexture, projTexture, skyTexture,
  turretTexture, unitBox, unitTexture,
} from './art';
import { unitIndex, warSim, wallX, type Team, type WarCommand, type WarEvent, type WarInput, type WarState } from './sim';

const W = 960;
const TOP_H = 46; // top HUD
const MINI_Y = 48;
const MINI_H = 14;
const STRIP_Y = 432; // bottom control strip
const STRIP_H = 540 - STRIP_Y;
const TURRET_Y0 = GROUND_Y - 132; // turret slot 0 height; next slots stack upward
const TURRET_DY = 34;
const HP_X = [120, 640]; // base HP bars (136 wide) in the top bar

const txt = (size: number, color = '#f4f1ff', stroke = 4) => ({
  fontFamily: FONT, fontSize: `${size}px`, fontStyle: '700', color, stroke: '#0d1020', strokeThickness: stroke, resolution: 2,
});
const clock = (ticks: number) => {
  const sec = Math.floor(ticks / 60);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};
const fmt = (n: number) => (n >= 100000 ? `${Math.floor(n / 1000)}k` : String(Math.floor(n)));

// --- synthesized sfx ---------------------------------------------------------------------------
let lastSfx: Record<string, number> = {};
function throttled(key: string, ms: number, f: () => void) {
  const now = performance.now();
  if (now - (lastSfx[key] ?? 0) < ms) return;
  lastSfx[key] = now;
  f();
}
const sfx = {
  melee: () => throttled('m', 70, () => playNoise({ dur: 0.06, vol: 0.25, filter: 1800 })),
  shot: (age: number) =>
    throttled('s', 70, () =>
      age >= 4 ? playTone({ freq: 1400, slideTo: 300, dur: 0.12, type: 'sawtooth', vol: 0.08 })
        : age >= 2 ? playNoise({ dur: 0.1, vol: 0.3, filter: 700 })
          : playTone({ freq: 600, slideTo: 900, dur: 0.06, type: 'triangle', vol: 0.08 })),
  turret: () => throttled('t', 90, () => playNoise({ dur: 0.08, vol: 0.22, filter: 500 })),
  death: () => throttled('d', 80, () => playTone({ freq: 300, slideTo: 90, dur: 0.22, type: 'square', vol: 0.08 })),
  base: () => throttled('b', 160, () => playNoise({ dur: 0.18, vol: 0.35, filter: 220 })),
  impact: () => throttled('i', 60, () => { playNoise({ dur: 0.35, vol: 0.45, filter: 160 }); playTone({ freq: 140, slideTo: 40, dur: 0.3, vol: 0.2 }); }),
  special: () => [220, 330, 440].forEach((f, i) => playTone({ freq: f, slideTo: f * 1.5, dur: 0.3, type: 'sawtooth', vol: 0.12, delay: i * 0.08 })),
  evolve: () => [392, 523, 659, 784, 1047].forEach((f, i) => playTone({ freq: f, dur: 0.18, type: 'square', vol: 0.12, delay: i * 0.09 })),
  click: () => playTone({ freq: 900, dur: 0.04, type: 'triangle', vol: 0.12 }),
  deny: () => playTone({ freq: 200, slideTo: 140, dur: 0.15, type: 'square', vol: 0.12 }),
  win: () => [523, 659, 784, 1047].forEach((f, i) => playTone({ freq: f, dur: 0.25, type: 'triangle', vol: 0.25, delay: i * 0.12 })),
  lose: () => [392, 330, 262, 196].forEach((f, i) => playTone({ freq: f, dur: 0.3, type: 'triangle', vol: 0.25, delay: i * 0.2 })),
};

interface Btn {
  box: Phaser.GameObjects.Rectangle;
  icon?: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  sub: Phaser.GameObjects.Text;
  bar: Phaser.GameObjects.Rectangle;
  all: Phaser.GameObjects.GameObject[];
  set(enabled: boolean): void;
}

export class WarScene extends Phaser.Scene {
  private session!: RoomSession;
  private loop!: GameLoop<WarState, WarInput, WarEvent>;
  private mode = 'ai';
  private seq = 0;
  private input0: WarInput = { cmd: null, seq: 0 };
  private me: Team = 0;
  private lastTick = 0;
  private lastAge: [number, number] = [0, 0];
  private seen = new Set<string>();
  private closeEnd: (() => void) | null = null;
  private ended = false;

  private units = new Map<number, Phaser.GameObjects.Image>();
  private bases: Phaser.GameObjects.Image[] = [];
  private turrets: Phaser.GameObjects.Image[][] = [];
  private slotMarks: Phaser.GameObjects.Rectangle[][] = [];
  private bars!: Phaser.GameObjects.Graphics;
  private mini!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private hills!: Phaser.GameObjects.TileSprite;
  private projCount = 0;

  private hpText: Phaser.GameObjects.Text[] = [];
  private namesText: Phaser.GameObjects.Text[] = [];
  private timeText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private xpText!: Phaser.GameObjects.Text;
  private ageText!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private feed: { t: Phaser.GameObjects.Text; until: number }[] = [];
  private queueIcons: Phaser.GameObjects.Image[] = [];
  private queueTags: Phaser.GameObjects.Text[] = [];

  private trainBtns: Btn[] = [];
  private turretBtn!: Btn;
  private specialBtn!: Btn;
  private evolveBtn!: Btn;
  private specialRing!: Phaser.GameObjects.Graphics;
  private panel: Phaser.GameObjects.GameObject[] = [];
  private panelOpen = false;
  private panelSlot = 0;
  private panelSlotBtns: Btn[] = [];
  private panelKindBtns: Btn[] = [];
  private panelSell!: Btn;

  private keys!: Record<'left' | 'right' | 'a' | 'd', Phaser.Input.Keyboard.Key>;
  private drag: { x: number; scroll: number } | null = null;

  constructor() {
    super('WarGame');
  }

  create({ session, payload }: { session: RoomSession; payload: StartPayload }): void {
    this.session = session;
    this.mode = payload.mode;
    this.units = new Map();
    this.seen = new Set();
    this.feed = [];
    this.panel = [];
    this.trainBtns = [];
    this.panelOpen = false;
    this.ended = false;
    this.closeEnd = null;
    lastSfx = {};

    this.loop = new GameLoop<WarState, WarInput, WarEvent>(session, warSim, {
      onHostLeft: () => {
        toast('Oda kurucusu ayrıldı');
        this.toMenu();
      },
      onSnapshot: (prev, next) => this.synthesize(prev, next),
    });
    this.loop.start(payload);

    this.buildWorld();
    this.buildHud();
    this.buildStrip();
    this.buildPanel();
    this.bindInput();
    mountNetMeter(this, this.loop, session).setPosition(8, 66); // below the HP bars + minimap
    this.resetForMatch();

    this.events.once('shutdown', () => {
      this.loop.dispose();
      this.closeEnd?.();
    });
  }

  // --- setup -----------------------------------------------------------------------------------
  private buildWorld(): void {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, B.LANE_W, 540);
    this.add.image(0, 0, skyTexture(this)).setOrigin(0).setScale(0.5).setScrollFactor(0).setDepth(0);
    // 1800x200 drawn at 2x; repeat across the lane with parallax
    this.hills = this.add.tileSprite(0, GROUND_Y - 190, W, 200, hillsTexture(this)).setOrigin(0).setScrollFactor(0).setDepth(1);
    this.hills.setTileScale(0.5, 0.5);
    this.add.image(0, GROUND_Y - 6, groundTexture(this)).setOrigin(0).setScale(0.5).setDepth(2);
    this.bases = [0, 1].map((t) =>
      this.add.image(t === 0 ? -12 : B.LANE_W + 12, GROUND_Y + 6, baseTexture(this, 0, t as Team))
        .setOrigin(t === 0 ? 0 : 1, 1).setScale(0.5 * 1.25).setFlipX(t === 1).setDepth(3),
    );
    this.turrets = [0, 1].map((t) =>
      Array.from({ length: B.MAX_SLOTS }, (_, i) =>
        this.add.image(this.turretX(t as Team), TURRET_Y0 - i * TURRET_DY, turretTexture(this, 0))
          .setScale(0.5 * 1.4).setFlipX(t === 1).setDepth(4).setVisible(false)),
    );
    this.slotMarks = [0, 1].map((t) =>
      Array.from({ length: B.MAX_SLOTS }, (_, i) =>
        this.add.rectangle(this.turretX(t as Team), TURRET_Y0 - i * TURRET_DY + 10, 30, 6, 0x333333, 0.8)
          .setStrokeStyle(1, 0xffffff, 0.6).setDepth(4).setVisible(false)),
    );
    this.bars = this.add.graphics().setDepth(12);
    this.sparks = this.add.particles(0, 0, sparkTexture(this), {
      speed: { min: 60, max: 220 }, angle: { min: 200, max: 340 }, lifespan: { min: 250, max: 500 },
      scale: { start: 1, end: 0 }, gravityY: 500, emitting: false,
    }).setDepth(13);
  }

  private turretX(t: Team): number {
    return t === 0 ? wallX(0) - 22 : wallX(1) + 22;
  }

  private buildHud(): void {
    this.hud = this.add.graphics().setScrollFactor(0).setDepth(40);
    this.mini = this.add.graphics().setScrollFactor(0).setDepth(41);
    const fix = <T extends Phaser.GameObjects.Text>(t: T) => t.setScrollFactor(0).setDepth(42);
    // right side of the top bar is taken by the global fullscreen/settings/mute buttons
    this.hpText = [fix(this.add.text(12, 6, '', txt(14))), fix(this.add.text(HP_X[1] - 8, 6, '', txt(14)).setOrigin(1, 0))];
    this.namesText = [fix(this.add.text(12, 26, '', txt(12, '#cfe0ff', 3))), fix(this.add.text(HP_X[1] - 8, 26, '', txt(12, '#ffd0d0', 3)).setOrigin(1, 0))];
    this.timeText = fix(this.add.text(380, 8, '', txt(20, '#ffd23f')).setOrigin(0.5, 0));
    this.banner = fix(this.add.text(W / 2, 170, '', txt(40, '#ffd23f', 8)).setOrigin(0.5).setAlpha(0));
    // minimap click → jump the camera there
    const zone = this.add.zone(0, MINI_Y, W, MINI_H + 4).setOrigin(0).setScrollFactor(0).setDepth(43).setInteractive();
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.cameras.main.scrollX = (p.x / W) * B.LANE_W - W / 2;
    });
  }

  private makeBtn(x: number, y: number, w: number, hgt: number, label: string, onClick: () => void, icon?: string): Btn {
    const box = this.add.rectangle(x, y, w, hgt, 0x24284a, 0.95).setOrigin(0).setStrokeStyle(2, 0x6a6fb0).setScrollFactor(0).setDepth(50);
    box.setInteractive({ useHandCursor: true });
    box.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      onClick();
    });
    const img = icon ? this.add.image(x + w / 2, y + hgt - 22, icon).setOrigin(0.5, 1).setScale(0.5).setScrollFactor(0).setDepth(51) : undefined;
    const lab = this.add.text(x + w / 2, y + 3, label, txt(13)).setOrigin(0.5, 0).setScrollFactor(0).setDepth(52);
    const sub = this.add.text(x + w / 2, y + hgt - 4, '', txt(14, '#ffd23f')).setOrigin(0.5, 1).setScrollFactor(0).setDepth(52);
    const bar = this.add.rectangle(x + 3, y + hgt - 3, 0, 4, 0x7dff6b).setOrigin(0, 1).setScrollFactor(0).setDepth(53);
    const all = [box, lab, sub, bar, ...(img ? [img] : [])];
    return {
      box, icon: img, label: lab, sub, bar, all,
      set(enabled) {
        for (const o of all) (o as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(enabled ? 1 : 0.45);
      },
    };
  }

  private buildStrip(): void {
    this.add.rectangle(0, STRIP_Y, W, STRIP_H, 0x14172e, 0.97).setOrigin(0).setScrollFactor(0).setDepth(45)
      .setInteractive(); // swallow clicks so they don't start a lane drag
    this.goldText = this.add.text(12, STRIP_Y + 8, '', txt(22, '#ffd23f')).setScrollFactor(0).setDepth(52);
    this.ageText = this.add.text(12, STRIP_Y + 38, '', txt(14, '#cfe0ff')).setScrollFactor(0).setDepth(52);
    this.xpText = this.add.text(12, STRIP_Y + 78, '', txt(12)).setScrollFactor(0).setDepth(52);
    const bw = 92;
    const by = STRIP_Y + 6;
    const bh = STRIP_H - 12;
    for (let i = 0; i < 4; i++) {
      this.trainBtns.push(this.makeBtn(160 + i * (bw + 6), by, bw, bh, '', () => this.send({ type: 'train', unit: i as 0 | 1 | 2 | 3 }), unitTexture(this, 0, 0)));
    }
    let x = 160 + 4 * (bw + 6) + 6;
    this.turretBtn = this.makeBtn(x, by, 86, bh, 'Kule [T]', () => this.togglePanel(), turretTexture(this, 0));
    x += 92;
    this.specialBtn = this.makeBtn(x, by, 96, bh, 'Özel [Q]', () => this.send({ type: 'special' }));
    this.specialRing = this.add.graphics().setScrollFactor(0).setDepth(53);
    x += 102;
    this.evolveBtn = this.makeBtn(x, by, W - x - 8, bh, 'Çağ atla [E]', () => this.send({ type: 'evolve' }));
    for (let i = 0; i < B.QUEUE_MAX; i++) {
      this.queueIcons.push(this.add.image(166 + i * 30, STRIP_Y - 4, unitTexture(this, 0, 0)).setOrigin(0.5, 1).setScale(0.32).setScrollFactor(0).setDepth(46).setVisible(false));
      this.queueTags.push(this.add.text(166 + i * 30, STRIP_Y - 2, '', txt(10, '#fff', 3)).setOrigin(0.5, 1).setScrollFactor(0).setDepth(47));
    }
  }

  private buildPanel(): void {
    const x0 = 300;
    const y0 = STRIP_Y - 176;
    const bg = this.add.rectangle(x0, y0, 470, 168, 0x0d1020, 0.94).setOrigin(0).setStrokeStyle(2, 0x6a6fb0).setScrollFactor(0).setDepth(48).setInteractive();
    const title = this.add.text(x0 + 10, y0 + 6, 'Kule yuvası seç, sonra kule kur', txt(13, '#cfe0ff')).setScrollFactor(0).setDepth(56);
    this.panel.push(bg, title);
    this.panelSlotBtns = [];
    for (let i = 0; i < B.MAX_SLOTS; i++) {
      const b = this.makeBtn(x0 + 10 + i * 112, y0 + 28, 106, 44, '', () => this.pickSlot(i));
      this.panelSlotBtns.push(b);
    }
    this.panelSell = this.makeBtn(x0 + 350, y0 + 28, 110, 44, 'Sat', () => this.send({ type: 'sellTurret', slot: this.panelSlot }));
    this.panelKindBtns = [];
    for (let k = 0; k < 3; k++) {
      const b = this.makeBtn(x0 + 10 + k * 152, y0 + 80, 146, 80, '', () => this.send({ type: 'turret', slot: this.panelSlot, kind: k }), turretTexture(this, k));
      b.icon!.setY(y0 + 80 + 52);
      this.panelKindBtns.push(b);
    }
    for (const b of [...this.panelSlotBtns, this.panelSell, ...this.panelKindBtns]) this.panel.push(...b.all);
    for (const o of this.panel) (o as unknown as Phaser.GameObjects.Components.Depth).setDepth((o as unknown as { depth: number }).depth + 10);
    this.showPanel(false);
  }

  private showPanel(on: boolean): void {
    this.panelOpen = on;
    for (const o of this.panel) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(on);
    // hidden panel buttons must not eat clicks
    for (const o of this.panel) if (o.input) o.input.enabled = on;
  }

  private togglePanel(): void {
    sfx.click();
    const s = this.loop.state;
    if (s && !this.panelOpen) {
      const T = s.teams[this.me];
      const empty = T.tur.findIndex((k, i) => i < T.slots && k < 0);
      this.panelSlot = empty >= 0 ? empty : 0;
    }
    this.showPanel(!this.panelOpen);
  }

  private pickSlot(i: number): void {
    const s = this.loop.state;
    if (!s) return;
    const T = s.teams[this.me];
    if (i >= T.slots) {
      if (i === T.slots) this.send({ type: 'buySlot' });
      return;
    }
    sfx.click();
    this.panelSlot = i;
  }

  private bindInput(): void {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({ left: 'LEFT', right: 'RIGHT', a: 'A', d: 'D' }) as WarScene['keys'];
    kb.on('keydown', (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
      if (n >= 0) {
        if (this.panelOpen && n < 3) this.send({ type: 'turret', slot: this.panelSlot, kind: n });
        else this.send({ type: 'train', unit: n as 0 | 1 | 2 | 3 });
      } else if (e.code === 'KeyQ') this.send({ type: 'special' });
      else if (e.code === 'KeyE') this.send({ type: 'evolve' });
      else if (e.code === 'KeyT') this.togglePanel();
      else if (e.code === 'Escape') this.showPanel(false);
    });
    // drag/swipe the lane
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y > MINI_Y + MINI_H && p.y < STRIP_Y) {
        this.drag = { x: p.x, scroll: this.cameras.main.scrollX };
        if (this.panelOpen) this.showPanel(false);
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.drag && p.isDown) this.cameras.main.scrollX = this.drag.scroll - (p.x - this.drag.x);
    });
    this.input.on('pointerup', () => (this.drag = null));
  }

  private send(cmd: WarCommand): void {
    if (!this.loop.state || this.loop.state.phase !== 'playing') return;
    this.input0 = { cmd, seq: ++this.seq };
    sfx.click();
  }

  /** New match (first start or host restart): reset view state. */
  private resetForMatch(): void {
    const s = this.loop.state;
    if (!s) return;
    this.closeEnd?.();
    this.closeEnd = null;
    this.ended = false;
    this.me = s.players.find((p) => p.id === this.loop.selfId)?.team ?? 0;
    this.lastAge = [s.teams[0].age, s.teams[1].age];
    for (const img of this.units.values()) img.destroy();
    this.units.clear();
    this.seen = new Set(s.log.map((l) => `${l.by}:${l.seq}`));
    this.cameras.main.scrollX = this.me === 0 ? 0 : B.LANE_W - W;
    for (let i = 0; i < 4; i++) this.trainBtns[i].icon?.setTexture(unitTexture(this, i, this.me));
    this.showPanel(false);
  }

  /** Client: things that happened on the host between snapshots and left no local event. */
  private synthesize(prev: WarState | null, next: WarState): WarEvent[] {
    if (!prev) return [];
    const out: WarEvent[] = [];
    for (const t of [0, 1] as Team[]) {
      if (next.teams[t].age > prev.teams[t].age && next.teams[t].age !== this.lastAge[t]) out.push({ type: 'evolve', team: t, age: next.teams[t].age, by: '' });
    }
    return out;
  }

  // --- frame ---------------------------------------------------------------------------------
  update(time: number, delta: number): void {
    this.loop.setLocalInput(this.input0);
    const events = this.loop.update(Math.min(delta, 250));
    const s = this.loop.state;
    if (!s) return;
    if (s.tick < this.lastTick) this.resetForMatch();
    this.lastTick = s.tick;

    const cam = this.cameras.main;
    const dx = (this.keys.left.isDown || this.keys.a.isDown ? -1 : 0) + (this.keys.right.isDown || this.keys.d.isDown ? 1 : 0);
    if (dx) cam.scrollX += dx * delta * 0.9;
    this.hills.tilePositionX = cam.scrollX * 0.3 * 2;

    this.handleEvents(events, s);
    this.drawWorld(s, time);
    this.drawHud(s, time);
    this.updateFeed(s, time);
    if (s.phase === 'over' && !this.ended) this.showEnd(s);
  }

  private visible(x: number): boolean {
    const c = this.cameras.main.scrollX;
    return x > c - 100 && x < c + W + 100;
  }

  private handleEvents(events: WarEvent[], s: WarState): void {
    for (const e of events) {
      switch (e.type) {
        case 'attack': {
          if (!this.visible(e.x)) break;
          const age = B.UNITS[e.k].age;
          if (e.ranged) {
            this.projectile(e.x + (e.team === 0 ? 14 : -14), GROUND_Y - 30, e.tx, GROUND_Y - 22, PROJ_BY_AGE[age], age <= 2 ? 30 : 4);
            sfx.shot(age);
          } else {
            this.sparks.explode(3, e.tx, GROUND_Y - 24);
            sfx.melee();
          }
          break;
        }
        case 'turret': {
          const age = Math.floor(e.k / 3);
          const fx = this.turretX(e.team) + (e.team === 0 ? 14 : -14);
          this.projectile(fx, TURRET_Y0 - e.slot * TURRET_DY, e.tx, GROUND_Y - 22, PROJ_BY_AGE[age], age <= 1 ? 40 : 0);
          if (this.visible(fx)) sfx.turret();
          break;
        }
        case 'death': {
          if (this.visible(e.x)) {
            sfx.death();
            this.sparks.explode(8, e.x, GROUND_Y - 20);
            if (e.team !== this.me) this.floatText(e.x, GROUND_Y - 60, `+${e.gold}`, '#ffd23f');
          }
          break;
        }
        case 'baseHit':
          if (this.visible(wallX(e.team))) sfx.base();
          if (e.team === this.me) this.bases[e.team].setAlpha(0.75);
          break;
        case 'impact':
          this.impact(e.x, e.age);
          break;
        case 'special':
          sfx.special();
          this.showBanner(B.AGES[e.age].special.name + '!', e.team === this.me ? '#7dff6b' : '#ff6b6b');
          break;
        case 'evolve':
          this.lastAge[e.team] = e.age;
          sfx.evolve();
          this.showBanner(`${e.team === this.me ? 'Çağ atladın' : 'Rakip çağ atladı'}: ${B.AGES[e.age].name}`, e.team === this.me ? '#ffd23f' : '#ff9a6b');
          break;
        case 'cmd':
          if (e.by === this.loop.selfId && !e.ok) sfx.deny();
          break;
        case 'over':
          if (s.winner === this.me) sfx.win();
          else sfx.lose();
          break;
      }
    }
    // clients: age changes seen only via snapshots
    for (const t of [0, 1] as Team[]) if (s.teams[t].age !== this.lastAge[t]) this.lastAge[t] = s.teams[t].age;
  }

  private projectile(x0: number, y0: number, x1: number, y1: number, kind: (typeof PROJ_BY_AGE)[number], arc: number): void {
    if (this.projCount > 70 || (!this.visible(x0) && !this.visible(x1))) return;
    this.projCount++;
    const img = this.add.image(x0, y0, projTexture(this, kind)).setScale(0.5).setDepth(11).setFlipX(x1 < x0);
    const dur = Math.max(90, Math.abs(x1 - x0) * 1.6);
    this.tweens.addCounter({
      from: 0, to: 1, duration: dur,
      onUpdate: (tw) => {
        const f = tw.getValue() ?? 0;
        img.setPosition(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f - Math.sin(f * Math.PI) * arc);
      },
      onComplete: () => {
        img.destroy();
        this.projCount--;
      },
    });
  }

  private impact(x: number, age: number): void {
    const colors = [0xff8a3a, 0xd9c08a, 0x444444, 0xffb03a, 0x7affff];
    if (age === 4) {
      const beam = this.add.rectangle(x, 0, 14, GROUND_Y, 0x7affff, 0.8).setOrigin(0.5, 0).setDepth(14);
      this.tweens.add({ targets: beam, alpha: 0, scaleX: 0.2, duration: 260, onComplete: () => beam.destroy() });
    } else {
      // falling streak (meteor / arrows / shell / bomb)
      const fall = this.add.image(x - 60, GROUND_Y - 300, projTexture(this, age === 0 ? 'meteor' : age === 1 ? 'arrow' : age === 2 ? 'ball' : 'shell'))
        .setScale(age === 0 ? 1.4 : 0.8).setRotation(Math.atan2(300, 60)).setDepth(14);
      this.tweens.add({ targets: fall, x, y: GROUND_Y - 10, duration: 140, onComplete: () => fall.destroy() });
    }
    const boom = this.add.circle(x, GROUND_Y - 10, 10, colors[age], 0.8).setDepth(14);
    this.tweens.add({ targets: boom, scale: B.AGES[age].special.radius / 10, alpha: 0, duration: 320, onComplete: () => boom.destroy() });
    this.sparks.explode(6, x, GROUND_Y - 10);
    if (this.visible(x)) {
      sfx.impact();
      if (age !== 1) this.cameras.main.shake(90, 0.004);
    }
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    const t = this.add.text(x, y, text, txt(14, color, 3)).setOrigin(0.5).setDepth(15);
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }

  private showBanner(text: string, color: string): void {
    this.banner.setText(text).setColor(color).setAlpha(1).setScale(0.6);
    this.tweens.killTweensOf(this.banner);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.banner, alpha: 0, delay: 1600, duration: 500 });
  }

  private drawWorld(s: WarState, time: number): void {
    for (const t of [0, 1] as Team[]) {
      const T = s.teams[t];
      const base = this.bases[t];
      base.setTexture(baseTexture(this, T.age, t));
      if (base.alpha < 1) base.setAlpha(Math.min(1, base.alpha + 0.02));
      for (let i = 0; i < B.MAX_SLOTS; i++) {
        const k = T.tur[i];
        const img = this.turrets[t][i];
        img.setVisible(k >= 0);
        if (k >= 0) img.setTexture(turretTexture(this, k));
        this.slotMarks[t][i].setVisible(i < T.slots && k < 0);
      }
    }

    const alive = new Set<number>();
    this.bars.clear();
    for (const u of s.units) {
      alive.add(u.i);
      let img = this.units.get(u.i);
      if (!img) {
        img = this.add.image(u.x, GROUND_Y, unitTexture(this, u.k, u.t)).setOrigin(0.5, 1).setScale(0.5 * 1.15).setFlipX(u.t === 1).setDepth(8 + (u.i % 7) * 0.01);
        this.units.set(u.i, img);
      }
      const def = B.UNITS[u.k];
      const d = u.t === 0 ? 1 : -1;
      let ox = 0;
      let oy = 0;
      let rot = 0;
      if (u.s === 0) {
        oy = -Math.abs(Math.sin(time / 110 + u.i)) * 3;
        rot = Math.sin(time / 110 + u.i) * 0.04;
      } else if (u.s === 2 && u.cd > def.cd - 10) {
        const f = (u.cd - (def.cd - 10)) / 10; // 1 → 0 right after a swing
        ox = d * f * (def.range > 20 ? -3 : 6);
        rot = d * f * (def.range > 20 ? -0.05 : 0.15);
      }
      img.setPosition(u.x + ox, GROUND_Y + oy).setRotation(rot);
      if (u.hp < def.hp && this.visible(u.x)) {
        const bw = Math.min(40, unitBox(u.k).w * 0.5);
        const by = GROUND_Y - unitBox(u.k).h * 0.575 - 6;
        this.bars.fillStyle(0x000000, 0.6).fillRect(u.x - bw / 2 - 1, by - 1, bw + 2, 5);
        this.bars.fillStyle(u.t === this.me ? 0x7dff6b : 0xff5a5a, 1).fillRect(u.x - bw / 2, by, bw * Math.max(0, u.hp / def.hp), 3);
      }
    }
    for (const [id, img] of this.units) {
      if (alive.has(id)) continue;
      this.units.delete(id);
      // death: tip over and fade
      this.tweens.add({ targets: img, alpha: 0, angle: img.flipX ? 80 : -80, y: img.y + 4, duration: 450, onComplete: () => img.destroy() });
    }
  }

  private drawHud(s: WarState, time: number): void {
    const g = this.hud;
    g.clear();
    g.fillStyle(0x0d1020, 0.75).fillRect(0, 0, W, TOP_H);
    // base HP bars (left team at left, right team at right — like the lane)
    for (const t of [0, 1] as Team[]) {
      const T = s.teams[t];
      const x = HP_X[t];
      g.fillStyle(0x000000, 0.7).fillRect(x, 10, 136, 12);
      g.fillStyle(TEAM_COLOR[t], 1).fillRect(x + 1, 11, 134 * (T.hp / T.maxHp), 10);
      const who = t === this.me ? 'Sen' : s.mode === 'ai' ? 'Bilgisayar' : 'Rakip';
      this.hpText[t].setText(`${who} ${Math.ceil(T.hp)}`);
      const names = s.players.filter((p) => p.team === t).map((p) => p.name + (p.connected ? '' : ' (koptu)'));
      this.namesText[t].setText(names.length ? names.join(', ') : 'Bilgisayar');
    }
    this.timeText.setText(clock(s.tick) + (s.tick > B.SUDDEN_DEATH ? ' ☄ Kıyamet' : ''));

    // minimap
    const m = this.mini;
    m.clear();
    m.fillStyle(0x000000, 0.45).fillRect(0, MINI_Y, W, MINI_H);
    const sx = W / B.LANE_W;
    m.fillStyle(TEAM_COLOR[0], 1).fillRect(0, MINI_Y, B.BASE_FRONT * sx, MINI_H);
    m.fillStyle(TEAM_COLOR[1], 1).fillRect(W - B.BASE_FRONT * sx, MINI_Y, B.BASE_FRONT * sx, MINI_H);
    for (const u of s.units) {
      m.fillStyle(u.t === 0 ? 0x9cc4ff : 0xffa0a0, 1).fillRect(u.x * sx - 1.5, MINI_Y + (u.t === 0 ? 3 : 7), 3, 4);
    }
    m.lineStyle(1.5, 0xffffff, 0.9).strokeRect(this.cameras.main.scrollX * sx, MINI_Y + 0.5, W * sx, MINI_H - 1);

    // strip
    const T = s.teams[this.me];
    const age = B.AGES[T.age];
    this.goldText.setText(`💰 ${fmt(T.gold)}`);
    this.ageText.setText(age.name);
    const next = age.xpToNext;
    const xpF = Number.isFinite(next) ? Math.min(1, T.xp / next) : 1;
    const sg = this.specialRing; // depth above the strip background; cleared below before the ring
    sg.clear();
    sg.fillStyle(0x000000, 0.7).fillRect(12, STRIP_Y + 60, 136, 14);
    sg.fillStyle(xpF >= 1 ? 0xffd23f : 0x9b6bff, 1).fillRect(13, STRIP_Y + 61, 134 * xpF, 12);
    this.xpText.setText(Number.isFinite(next) ? `XP ${fmt(T.xp)} / ${fmt(next)}` : `XP ${fmt(T.xp)} · son çağ`);

    for (let i = 0; i < 4; i++) {
      const b = this.trainBtns[i];
      const k = unitIndex(T, i);
      for (const o of b.all) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(k >= 0);
      if (k < 0) continue;
      const def = B.UNITS[k];
      b.icon!.setTexture(unitTexture(this, k, this.me)).setScale(0.5 * Math.min(1, 50 / unitBox(k).h));
      b.label.setText(`${i + 1} ${def.name}`);
      b.sub.setText(fmt(def.cost));
      b.set(T.gold >= def.cost && T.q.length < B.QUEUE_MAX);
      const head = T.q[0];
      b.bar.width = head && head.k === k ? 86 * Math.min(1, T.qt / B.UNITS[head.k].train) : 0;
    }
    // queue (shared with teammates): icon + initial of who ordered it
    for (let i = 0; i < B.QUEUE_MAX; i++) {
      const q = T.q[i];
      this.queueIcons[i].setVisible(!!q);
      if (q) this.queueIcons[i].setTexture(unitTexture(this, q.k, this.me)).setAlpha(i === 0 ? 1 : 0.7);
      const who = q && s.players.find((p) => p.id === q.by);
      this.queueTags[i].setText(who && s.players.filter((p) => p.team === this.me).length > 1 ? who.name.slice(0, 3) : '');
    }
    this.turretBtn.sub.setText(`${T.tur.filter((k) => k >= 0).length}/${T.slots}`);
    this.turretBtn.icon!.setTexture(turretTexture(this, T.age * 3));
    // special + cooldown ring
    const ready = T.spCd <= 0;
    this.specialBtn.label.setText(age.special.name).setFontSize(11);
    this.specialBtn.sub.setText(ready ? 'HAZIR [Q]' : `${Math.ceil(T.spCd / 60)} sn`);
    this.specialBtn.set(ready);
    const r = this.specialRing;
    const cx = this.specialBtn.box.x + this.specialBtn.box.width / 2;
    const cy = this.specialBtn.box.y + 48;
    const f = ready ? 1 : 1 - T.spCd / B.SPECIAL_CD;
    r.lineStyle(6, 0x000000, 0.5).strokeCircle(cx, cy, 16);
    r.lineStyle(6, ready ? 0xff4f8b : 0x9b6bff, 1).beginPath().arc(cx, cy, 16, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2).strokePath();
    if (ready) r.fillStyle(0xff4f8b, 0.5 + 0.3 * Math.sin(time / 150)).fillCircle(cx, cy, 10);
    // evolve
    const canEvolve = T.age < B.AGES.length - 1 && T.xp >= next;
    this.evolveBtn.set(canEvolve);
    this.evolveBtn.sub.setText(T.age >= B.AGES.length - 1 ? 'Son çağ' : canEvolve ? `→ ${B.AGES[T.age + 1].name}` : `${Math.floor(xpF * 100)}%`);
    this.evolveBtn.box.setStrokeStyle(canEvolve ? 3 : 2, canEvolve ? 0xffd23f : 0x6a6fb0);
    if (canEvolve) this.evolveBtn.box.setFillStyle(0x4a3a10 + Math.round((Math.sin(time / 160) + 1) * 8) * 0x010000, 0.95);
    else this.evolveBtn.box.setFillStyle(0x24284a, 0.95);

    if (this.panelOpen) this.drawPanel(s);
  }

  private drawPanel(s: WarState): void {
    const T = s.teams[this.me];
    for (let i = 0; i < B.MAX_SLOTS; i++) {
      const b = this.panelSlotBtns[i];
      const k = T.tur[i];
      if (i >= T.slots) {
        b.label.setText(`🔒 Yuva ${i + 1}`);
        b.sub.setText(i === T.slots ? `Aç: ${fmt(B.SLOT_COSTS[i - 1])}` : '');
        b.set(i === T.slots && T.gold >= B.SLOT_COSTS[i - 1]);
      } else {
        b.label.setText(`Yuva ${i + 1}`);
        b.sub.setText(k >= 0 ? B.TURRETS[k].name : 'Boş');
        b.set(true);
      }
      b.box.setStrokeStyle(i === this.panelSlot ? 3 : 2, i === this.panelSlot ? 0xffd23f : 0x6a6fb0);
    }
    const cur = T.tur[this.panelSlot] ?? -1;
    const refund = cur >= 0 ? Math.floor(B.TURRETS[cur].cost * B.SELL_REFUND) : 0;
    this.panelSell.sub.setText(cur >= 0 ? `+${fmt(refund)}` : '');
    this.panelSell.set(cur >= 0);
    for (let kind = 0; kind < 3; kind++) {
      const k = T.age * 3 + kind;
      const def = B.TURRETS[k];
      const b = this.panelKindBtns[kind];
      b.label.setText(`${kind + 1} ${def.name}`);
      b.sub.setText(fmt(def.cost));
      b.icon!.setTexture(turretTexture(this, k)).setScale(0.75);
      b.set(this.panelSlot < T.slots && cur !== k && T.gold + refund >= def.cost);
    }
  }

  /** "Ali: Okçu eğitiyor" for my team's commands; my own failures in red. */
  private updateFeed(s: WarState, time: number): void {
    for (const l of s.log) {
      const key = `${l.by}:${l.seq}`;
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      if (l.team !== this.me) continue;
      if (!l.ok && l.by !== this.loop.selfId) continue;
      const p = s.players.find((q) => q.id === l.by);
      const msg = l.ok ? `${p?.name ?? '?'}: ${l.text}` : `✖ ${l.text}`;
      const t = this.add.text(12, MINI_Y + MINI_H + 6, msg, txt(14, l.ok ? cssColor(p?.color ?? 0xffffff) : '#ff8080', 3)).setScrollFactor(0).setDepth(42);
      this.feed.unshift({ t, until: time + 3500 });
    }
    this.feed = this.feed.filter((f, i) => {
      if (time > f.until || i > 3) {
        f.t.destroy();
        return false;
      }
      f.t.setY(MINI_Y + MINI_H + 6 + i * 18).setAlpha(Math.min(1, (f.until - time) / 500));
      return true;
    });
  }

  private showEnd(s: WarState): void {
    this.ended = true;
    this.showPanel(false);
    const won = s.winner === this.me;
    const side = (t: Team) => (s.mode === 'ai' ? (t === 0 ? 'Takımınız' : 'Bilgisayar') : s.players.find((p) => p.team === t)?.name ?? `Takım ${t + 1}`);
    const body = h('div', { class: 'stats' },
      h('div', {}, h('b', { text: clock(s.tick) }), 'Süre'),
      h('div', {}, h('b', { text: String(s.teams[0].kills) }), `${side(0)} öldürdü`),
      h('div', {}, h('b', { text: String(s.teams[1].kills) }), `${side(1)} öldürdü`),
    );
    this.closeEnd = showEndCard({
      title: won ? 'Zafer!' : 'Yenilgi',
      lines: [won ? 'Düşman üssü yıkıldı!' : 'Üssün yıkıldı…', `Ulaşılan çağ: ${B.AGES[s.teams[this.me].age].name}`],
      body,
      isHost: this.session.isHost,
      onRestart: () => this.session.startGame(startPayload(this.session, this.mode)),
      onMenu: () => this.toMenu(),
    });
  }

  private toMenu(): void {
    void this.session.leave().catch(() => {});
    this.scene.start('Menu');
  }
}

