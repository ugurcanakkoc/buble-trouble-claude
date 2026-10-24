// Mutfak Kaosu scene: renders MutfakState (kitchen or, for the courier, the street map), maps keyboard/touch to
// MutfakInput, plays sfx from sim events (every device plays its own; onSnapshot fills in what prediction missed).
import Phaser from 'phaser';
import { recordMatch, type RoomSession, type StartPayload } from '../../net';
import { cssColor, isTouch, load, save, toast } from '../../ui/dom';
import { showEndCard } from '../../ui/endcard';
import { GameLoop, startPayload } from '../../ui/loop';
import { mountNetMeter } from '../../ui/netmeter';
import { Smoother } from '../../ui/render/smooth';
import { setExitHandler } from '../../ui/settings';
import { FONT } from '../../ui/textures';
import { mountTouchControls, type TouchControls } from '../../ui/touch';
import { ensureTextures } from './art';
import { ITEM_TEX, STATION_TEX, TEX, itemTex, type SfxId } from './assets';
import { BALANCE as B, CHOP, COLS, ROWS, SCOLS, SROWS, STREET, TICK, UPGRADES } from './balance';
import { endTable, mountBook, mountShop } from './hud';
import {
  KASA_SPOT, canB, canSeeOrder, cellOf, dayTarget, dishOf, isRoad, mutfakSim, rankOf, rentOf, targetOf, totalStars,
} from './sim';
import { playSfx } from './sound';
import type { Item, MPlayer, MutfakEvent, MutfakInput, MutfakState, Order, Role, Station, UpgradeId } from './types';

// ---------- layout (960×540 canvas; must stay readable at 667×375) ----------
const T = 50; // kitchen tile px
const X0 = (960 - COLS * T) / 2; // 180
const Y0 = 62;
const kx = (x: number) => X0 + x * T;
const ky = (y: number) => Y0 + y * T;
const ST = 30; // street tile px
const SX0 = (960 - SCOLS * ST) / 2; // 180
const SY0 = 66;
const sx = (x: number) => SX0 + x * ST;
const sy = (y: number) => SY0 + y * ST;
const PANEL_W = 168;
const TICKET_H = 60;
const LEFT_X = 6;
const RIGHT_X = 960 - PANEL_W - 6;

const txt = (size: number, color = '#f4f1ff', stroke = 4) => ({
  fontFamily: FONT, fontSize: `${size}px`, fontStyle: '700', color, stroke: '#0d1020', strokeThickness: stroke, resolution: 2,
});
const ROLE_NAMES: Record<Role, string> = { mutfak: 'Aşçı', garson: 'Garson', kurye: 'Kurye', bulasik: 'Bulaşık' };
const PHASE_NAMES = { prep: 'Hazırlık', service: 'Servis', close: 'Kapanış', shop: 'Dükkan', end: 'Bitti' } as const;
const DISH_NAMES = { cay: 'Çay', corba: 'Çorba', lahmacun: 'Lahmacun', durum: 'Dürüm' } as const;
const FRAMES = ['u', 'd', 'l', 'r'] as const;
const B_LABELS: Partial<Record<Station['k'], string>> = {
  board: 'DOĞRA', sink: 'YIKA', doner: 'KES', cashier: 'SİPARİŞ', pano: 'FİŞ AS', trash: 'BOŞALT', pack: 'PAKETLE',
};
const B_VERBS: Partial<Record<Station['k'], string>> = {
  board: 'doğra', sink: 'yıka', doner: 'et kes', cashier: 'sipariş al', pano: 'fişi as', trash: 'çöpü boşalt', pack: 'paketle',
};
const CUSTOMER_COLORS = [0xffb36b, 0x9fe4ff, 0xc89bff, 0xa6ff8a, 0xff9fc8, 0xfff2a8];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const mmss = (ticks: number) => {
  const sec = Math.max(0, Math.ceil(ticks / TICK));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};
const KITCHEN = ['prep', 'service', 'close'];

/** Hold-B duration per station (mirrors sim workTicks) — only for drawing the progress ring. */
function workTicks(s: MutfakState, st: Station): number {
  switch (st.k) {
    case 'board': return s.up.bicak ? B.chopFastTicks : B.chopTicks;
    case 'sink': return s.players.length === 1 ? B.washTicks / 2 : B.washTicks;
    case 'doner': return B.sliceTicks;
    case 'cashier': return B.takeOrderTicks;
    case 'pano': return B.pinTicks;
    case 'trash': return B.emptyTrashTicks;
    case 'pack': return B.packTicks;
    default: return 0;
  }
}

// ---------- input ----------
type Key = 'up' | 'down' | 'left' | 'right' | 'a' | 'b';
const KEYS: Record<string, Key> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Space: 'a', KeyJ: 'a', KeyK: 'b', KeyE: 'b',
};

/** Keyboard (WASD/arrows, J/Space = A, K/E held = B) + touch (joystick, A, B) → MutfakInput. */
function createControls() {
  const down = new Set<string>();
  let aSeq = 0;
  let buySeq = 0;
  let buy: UpgradeId | '' = '';
  let ready = false;
  let touch: TouchControls | null = null;
  const labels: Record<string, string> = {};
  const onDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || !(e.code in KEYS)) return;
    e.preventDefault();
    if (KEYS[e.code] === 'a' && !e.repeat && !down.has(e.code)) aSeq++;
    down.add(e.code);
  };
  const onUp = (e: KeyboardEvent) => down.delete(e.code);
  const clear = () => down.clear();
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', clear);
  const is = (k: Key) => [...down].some((c) => KEYS[c] === k) || !!touch?.isDown(k);
  return {
    /** Touch controls only while the kitchen/street is playable (the joystick zone would eat taps on overlays). */
    setTouch(on: boolean) {
      if (!isTouch() || on === !!touch) return;
      if (on) {
        touch = mountTouchControls({
          left: { joystick: true },
          right: [{ id: 'b', label: 'KULLAN', size: 'normal' }, { id: 'a', label: 'AL', size: 'big' }],
        });
        document.querySelector('.touch')?.classList.add('mk-touch'); // stacked, filled B button (mutfak.css)
        touch.onPress('a', () => aSeq++);
        for (const k of Object.keys(labels)) delete labels[k];
      } else {
        touch!.destroy();
        touch = null;
      }
    },
    label(id: 'a' | 'b', text: string, enabled = true) {
      if (!touch || labels[id] === text + enabled) return;
      labels[id] = text + enabled;
      touch.setLabel(id, text);
      touch.setEnabled(id, enabled);
    },
    /** B button: hold-progress fill (0..1); hidden while on the scooter. */
    bState(fill: number, courier: boolean) {
      const root = touch && document.querySelector<HTMLElement>('.touch.mk-touch');
      if (!root) return;
      root.classList.toggle('mk-courier', courier);
      root.style.setProperty('--hold', fill.toFixed(2));
    },
    buy(id: UpgradeId) {
      buy = id;
      buySeq++;
    },
    toggleReady() {
      ready = !ready;
    },
    setReady(v: boolean) {
      ready = v;
    },
    reset() {
      aSeq = buySeq = 0;
      buy = '';
      ready = false;
    },
    read(): MutfakInput {
      return {
        dx: (is('right') ? 1 : 0) - (is('left') ? 1 : 0),
        dy: (is('down') ? 1 : 0) - (is('up') ? 1 : 0),
        b: is('b'), aSeq, buy, buySeq, ready,
      };
    },
    destroy() {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', clear);
      touch?.destroy();
      touch = null;
    },
  };
}

// ---------- small display helpers ----------
/** An item icon plus up to 3 small part icons (plate/dough/pot contents). */
class ItemView {
  main: Phaser.GameObjects.Image;
  parts: Phaser.GameObjects.Image[];
  private key = '';
  constructor(scene: Phaser.Scene, depth: number) {
    this.main = scene.add.image(0, 0, ITEM_TEX.tabak).setDepth(depth).setVisible(false);
    this.parts = [0, 1, 2].map(() => scene.add.image(0, 0, ITEM_TEX.tabak).setDepth(depth + 0.01).setVisible(false));
  }
  set(it: Item | null, x: number, y: number, size: number, depth?: number): void {
    const k = it ? JSON.stringify(it) : '';
    if (k !== this.key) {
      this.key = k;
      const dish = dishOf(it);
      const showParts = !!it && !dish && !!it.p?.length && it.k !== 'paket';
      this.main.setVisible(!!it);
      if (it) this.main.setTexture(dish && dish !== 'cay' ? itemTex(dish) : itemTex(it.k));
      this.parts.forEach((img, i) => {
        const p = showParts ? it!.p![i] : undefined;
        img.setVisible(!!p);
        if (p) img.setTexture(itemTex(p));
      });
    }
    if (!it) return;
    this.main.setPosition(x, y).setDisplaySize(size, size);
    const ps = size * 0.46;
    this.parts.forEach((img, i) => img.setPosition(x + (i - 1) * ps * 0.9, y + size * 0.42).setDisplaySize(ps, ps));
    if (depth !== undefined) {
      this.main.setDepth(depth);
      this.parts.forEach((img) => img.setDepth(depth + 0.01));
    }
  }
  hide(): void {
    this.set(null, 0, 0, 0);
  }
  destroy(): void {
    this.main.destroy();
    this.parts.forEach((p) => p.destroy());
  }
}

interface StationView {
  base: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image | null; // crate: what it gives
  item: ItemView;
  label: Phaser.GameObjects.Text;
  smoke: Phaser.GameObjects.Image;
}
interface PlayerView {
  spr: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  hand: ItemView;
}
interface CustomerView {
  body: Phaser.GameObjects.Image;
  bubble: Phaser.GameObjects.Image;
  dish: Phaser.GameObjects.Image;
}
interface Ticket {
  icon: Phaser.GameObjects.Image;
  line1: Phaser.GameObjects.Text;
  line2: Phaser.GameObjects.Text;
}
interface PlayerRow {
  dot: Phaser.GameObjects.Graphics;
  name: Phaser.GameObjects.Text;
  sub: Phaser.GameObjects.Text;
  hand: ItemView;
}

export class MutfakScene extends Phaser.Scene {
  private session!: RoomSession;
  private payload!: StartPayload;
  private loop!: GameLoop<MutfakState, MutfakInput, MutfakEvent>;
  private controls!: ReturnType<typeof createControls>;
  private shop!: ReturnType<typeof mountShop>;
  private book!: ReturnType<typeof mountBook>;
  private smooth = new Smoother();
  private kitchenStatic: Phaser.GameObjects.GameObject[] = [];
  private streetStatic: Phaser.GameObjects.GameObject[] = [];
  private stations: StationView[] = [];
  private players: PlayerView[] = [];
  private customers = new Map<number, CustomerView>();
  private tickets: Ticket[] = [];
  private rows: PlayerRow[] = [];
  private g!: Phaser.GameObjects.Graphics; // per-frame bars/rings (world)
  private hudG!: Phaser.GameObjects.Graphics; // per-frame HUD bars
  private highlight!: Phaser.GameObjects.Image;
  private pins: { img: Phaser.GameObjects.Image; name: Phaser.GameObjects.Text }[] = [];
  private scooter!: Phaser.GameObjects.Image;
  private botCourier!: Phaser.GameObjects.Image;
  private hudDay!: Phaser.GameObjects.Text;
  private hudTime!: Phaser.GameObjects.Text;
  private hudMoney!: Phaser.GameObjects.Text;
  private hudTarget!: Phaser.GameObjects.Text;
  private hudStars: Phaser.GameObjects.Image[] = [];
  private hudRep!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private feed: Phaser.GameObjects.Text[] = [];
  private view: 'kitchen' | 'street' | '' = '';
  private played = new Map<string, number>(); // event key → time, dedupes snapshot-synthesized repeats
  private orderSpot = new Map<number, number>(); // order id → table index, for fx after the order is gone
  private closeEnd: (() => void) | null = null;
  private recorded = false;
  private lastTick = 0;

  constructor() {
    super('MutfakGame');
  }

  create({ session, payload }: { session: RoomSession; payload: StartPayload }): void {
    this.session = session;
    this.payload = payload;
    this.kitchenStatic = [];
    this.streetStatic = [];
    this.stations = [];
    this.players = [];
    this.tickets = [];
    this.rows = [];
    this.pins = [];
    this.hudStars = [];
    this.feed = [];
    this.customers = new Map();
    this.view = '';
    this.played.clear();
    this.orderSpot.clear();
    this.closeEnd = null;
    this.recorded = false;
    this.lastTick = 0;
    this.smooth.clear();
    ensureTextures(this);
    this.addPlayerFrames();

    const bg = this.add.graphics().setDepth(0);
    bg.fillGradientStyle(0x2a1d1a, 0x2a1d1a, 0x120d10, 0x120d10).fillRect(0, 0, 960, 540);
    bg.fillStyle(0x000000, 0.3).fillRoundedRect(4, 4, 952, 52, 12);

    this.loop = new GameLoop(session, mutfakSim, {
      onHostLeft: () => {
        toast('Oda kurucusu ayrıldı');
        this.toMenu();
      },
      reconcileDist: 1.5, // tiles
      onSnapshot: (prev, next) => this.diffSnapshot(prev, next),
    });
    this.loop.start(payload);
    const s = this.loop.state!;

    this.buildKitchen(s);
    this.buildStreet();
    this.buildHud();
    this.controls = createControls();
    this.shop = mountShop({ selfId: this.loop.selfId, buy: (id) => this.controls.buy(id), toggleReady: () => this.controls.toggleReady() });
    this.book = mountBook(() => {});
    if (load('mutfak.bookSeen') !== '1') {
      save('mutfak.bookSeen', '1');
      this.book.open();
    }
    mountNetMeter(this, this.loop, session);
    this.onPhase('prep', s.day, s);

    setExitHandler(() => this.toMenu(), session.isHost);
    this.events.once('shutdown', () => {
      setExitHandler(null);
      this.loop.dispose();
      this.controls.destroy();
      this.shop.destroy();
      this.book.destroy();
      this.closeEnd?.();
    });
  }

  private addPlayerFrames(): void {
    const tex = this.textures.get(TEX.player);
    if (tex.has('u')) return;
    const src = tex.getSourceImage() as { width: number; height: number };
    const fw = src.width / 4;
    FRAMES.forEach((f, i) => tex.add(f, 0, i * fw, 0, fw, src.height));
  }

  // ---------- build ----------
  private buildKitchen(s: MutfakState): void {
    const add = (o: Phaser.GameObjects.GameObject) => (this.kitchenStatic.push(o), o);
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const border = c === 0 || r === 0 || c === COLS - 1 || r === ROWS - 1;
        const key = border ? TEX.wall : c >= 8 ? TEX.floorDining : TEX.floor;
        add(this.add.image(kx(c), ky(r), key).setOrigin(0).setDisplaySize(T, T).setDepth(1));
      }
    // cashier standing spot
    const spot = this.add.graphics().setDepth(1.1);
    spot.lineStyle(2, 0xffd23f, 0.5).strokeRoundedRect(kx(KASA_SPOT[0]) + 4, ky(KASA_SPOT[1]) + 4, T - 8, T - 8, 8);
    add(spot);
    add(this.add.text(kx(KASA_SPOT[0] + 0.5), ky(KASA_SPOT[1] + 0.85), 'KASA', txt(14, '#ffd23f', 3)).setOrigin(0.5).setDepth(1.2));
    for (const st of s.stations) {
      const base = this.add.image(kx(st.c), ky(st.r), STATION_TEX[st.k]).setOrigin(0).setDisplaySize(T, T).setDepth(2);
      const icon = st.src
        ? this.add.image(kx(st.c + 0.5), ky(st.r + 0.42), itemTex(st.src)).setDisplaySize(T * 0.5, T * 0.5).setDepth(2.1)
        : null;
      const label = this.add.text(kx(st.c + 0.5), ky(st.r + 1.02), '', txt(15, '#fff6a8', 4)).setOrigin(0.5, 1).setDepth(4.2);
      const smoke = this.add.image(kx(st.c + 0.5), ky(st.r + 0.1), TEX.smoke).setDisplaySize(T * 0.8, T * 0.8).setDepth(4.3).setVisible(false);
      this.stations.push({ base, icon, item: new ItemView(this, 3), label, smoke });
    }
    this.highlight = this.add.image(0, 0, TEX.highlight).setOrigin(0).setDisplaySize(T, T).setDepth(3.6).setVisible(false);
    this.g = this.add.graphics().setDepth(4.1);
    for (const p of s.players) {
      this.players.push({
        spr: this.add.image(0, 0, TEX.player, 'd').setDisplaySize(T * 0.95, T * 0.95).setTint(p.color).setDepth(6),
        name: this.add.text(0, 0, p.name.slice(0, 10), txt(14, cssColor(p.color), 3)).setOrigin(0.5, 1).setDepth(9),
        hand: new ItemView(this, 7),
      });
    }
  }

  private buildStreet(): void {
    const add = (o: Phaser.GameObjects.Image | Phaser.GameObjects.Text) => (this.streetStatic.push(o), o.setVisible(false), o);
    for (let r = 0; r < SROWS; r++)
      for (let c = 0; c < SCOLS; c++)
        add(this.add.image(sx(c), sy(r), isRoad(c, r) ? TEX.road : TEX.building).setOrigin(0).setDisplaySize(ST, ST).setDepth(1));
    const place = (key: string, [c, r]: [number, number], label: string) => {
      add(this.add.image(sx(c + 0.5), sy(r + 0.5), key).setDisplaySize(ST * 1.4, ST * 1.4).setDepth(2));
      add(this.add.text(sx(c + 0.5), sy(r - 0.3), label, txt(15, '#fff6a8', 3)).setOrigin(0.5).setDepth(8));
    };
    place(TEX.home, STREET.home, 'Lokanta');
    place(TEX.market, STREET.market, 'Market');
    this.pins = STREET.targets.map(([c, r], i) => ({
      img: this.add.image(sx(c + 0.5), sy(r + 0.2), TEX.pin).setDisplaySize(ST * 1.2, ST * 1.2).setOrigin(0.5, 0.8).setDepth(5).setVisible(false),
      name: this.add.text(sx(c + 0.5), sy(r + 1), STREET.targetNames[i], txt(15, '#9fe4ff', 3)).setOrigin(0.5, 0).setDepth(8).setVisible(false),
    }));
    this.scooter = this.add.image(0, 0, TEX.scooter).setDisplaySize(ST * 1.3, ST * 1.3).setDepth(6).setVisible(false);
    this.botCourier = this.add.image(0, 0, TEX.botCourier).setDisplaySize(ST * 1.2, ST * 1.2).setDepth(5.5).setVisible(false);
  }

  private buildHud(): void {
    this.hudDay = this.add.text(16, 40, '', txt(20)).setOrigin(0, 0.5).setDepth(10);
    this.hudTime = this.add.text(118, 40, '', txt(24, '#ffd23f', 5)).setOrigin(0, 0.5).setDepth(10);
    this.hudMoney = this.add.text(300, 40, '', txt(22, '#a6ff8a', 5)).setOrigin(0, 0.5).setDepth(10);
    this.hudTarget = this.add.text(450, 17, '', txt(15, '#c9c8f0', 3)).setOrigin(0, 0.5).setDepth(10);
    this.hudStars = B.starMul.map(() => this.add.image(0, 40, TEX.starOff).setDisplaySize(18, 18).setDepth(11));
    this.hudRep = this.add.text(792, 40, '', txt(18)).setOrigin(1, 0.5).setDepth(10);
    this.hudG = this.add.graphics().setDepth(10);
    for (let i = 0; i < 6; i++) {
      const y = Y0 + i * TICKET_H;
      this.tickets.push({
        icon: this.add.image(LEFT_X + 24, y + 24, ITEM_TEX.cay).setDisplaySize(32, 32).setDepth(10.5).setVisible(false),
        line1: this.add.text(LEFT_X + 44, y + 4, '', txt(17, '#fff', 3)).setDepth(10.5),
        line2: this.add.text(LEFT_X + 44, y + 25, '', txt(15, '#c9c8f0', 3)).setDepth(10.5),
      });
    }
    for (let i = 0; i < 4; i++) {
      const y = Y0 + i * 46;
      this.rows.push({
        dot: this.add.graphics().setDepth(9),
        name: this.add.text(RIGHT_X + 22, y + 1, '', txt(16)).setDepth(9.5),
        sub: this.add.text(RIGHT_X + 22, y + 22, '', txt(14, '#c9c8f0', 3)).setDepth(9.5),
        hand: new ItemView(this, 9.6),
      });
    }
    this.status = this.add.text(RIGHT_X, Y0 + 190, '', txt(15, '#c9c8f0', 3)).setDepth(9.5).setWordWrapWidth(PANEL_W);
    this.hint = this.add.text(480, Y0 + ROWS * T + 8, '', { ...txt(17, '#fff6a8', 4), align: 'center' }).setOrigin(0.5, 0).setDepth(10);
    this.banner = this.add.text(480, ky(ROWS / 2), '', txt(40, '#ffd23f', 8)).setOrigin(0.5).setDepth(20).setVisible(false);
  }

  // ---------- frame ----------
  update(time: number, delta: number): void {
    const s0 = this.loop.state;
    if (s0 && s0.tick + 60 < this.lastTick) this.resetForNewGame(); // "Tekrar Oyna" started a fresh state
    const me0 = s0?.players.find((p) => p.id === this.loop.selfId);
    if (s0?.phase !== 'shop') this.controls.setReady(false);
    this.loop.setLocalInput(this.controls.read());
    const events = this.loop.update(Math.min(delta, 250));
    const s = this.loop.state;
    if (!s) return;
    this.lastTick = s.tick;
    this.smooth.decay(Math.min(delta, 250));
    const me = s.players.find((p) => p.id === this.loop.selfId) ?? me0 ?? null;
    const playing = KITCHEN.includes(s.phase);
    this.controls.setTouch(playing && !this.book.isOpen() && !this.closeEnd);
    this.handleEvents(events, s);

    const street = playing && me?.mode === 'courier';
    this.setView(street ? 'street' : 'kitchen');
    this.g.clear();
    if (street) this.drawStreet(s, me!, time);
    else this.drawKitchen(s, me, time);
    this.drawHud(s, me);
    this.updateButtons(s, me);
    this.shop.update(s);
    for (const o of s.orders) if (o.table >= 0) this.orderSpot.set(o.id, o.table);
    if (s.phase === 'end' && !this.closeEnd) this.showEnd(s);
  }

  private resetForNewGame(): void {
    this.closeEnd?.();
    this.closeEnd = null;
    this.recorded = false;
    this.smooth.clear();
    this.played.clear();
    this.orderSpot.clear();
    this.controls.reset();
    for (const c of this.customers.values()) [c.body, c.bubble, c.dish].forEach((o) => o.destroy());
    this.customers.clear();
    const s = this.loop.state;
    if (s) this.onPhase('prep', s.day, s);
  }

  private setView(v: 'kitchen' | 'street'): void {
    if (v === this.view) return;
    this.view = v;
    for (const o of this.kitchenStatic) (o as Phaser.GameObjects.Image).setVisible(v === 'kitchen');
    for (const o of this.streetStatic) (o as Phaser.GameObjects.Image).setVisible(v === 'street');
    for (const st of this.stations) {
      for (const o of [st.base, st.icon, st.label]) o?.setVisible(v === 'kitchen');
      if (v === 'street') (st.item.hide(), st.smoke.setVisible(false));
    }
    if (v === 'street') {
      for (const p of this.players) (p.spr.setVisible(false), p.name.setVisible(false), p.hand.hide());
      for (const c of this.customers.values()) [c.body, c.bubble, c.dish].forEach((o) => o.setVisible(false));
      this.highlight.setVisible(false);
    } else {
      this.scooter.setVisible(false);
      this.botCourier.setVisible(false);
      for (const p of this.pins) (p.img.setVisible(false), p.name.setVisible(false));
    }
  }

  private drawKitchen(s: MutfakState, me: MPlayer | null, time: number): void {
    const g = this.g;
    const bar = (x: number, y: number, w: number, f: number, color: number) => {
      g.fillStyle(0x0d1020, 0.85).fillRect(x - 1, y - 1, w + 2, 7);
      g.fillStyle(color).fillRect(x, y, w * clamp01(f), 5);
    };
    s.stations.forEach((st, i) => {
      const v = this.stations[i];
      v.base.setTexture(st.off ? TEX.stationOff : STATION_TEX[st.k]);
      const cx = kx(st.c + 0.5);
      const cy = ky(st.r + 0.5);
      v.item.set(st.item, cx, cy - 2, T * 0.62);
      v.smoke.setVisible(st.item?.k === 'yanik');
      if (st.item?.k === 'yanik') v.smoke.setAlpha(0.5 + 0.3 * Math.sin(time / 200 + i)).setY(ky(st.r + 0.1) - ((time / 30) % 8));
      let label = '';
      const bx = kx(st.c) + 6;
      const by = ky(st.r) + 3;
      const bw = T - 12;
      switch (st.k) {
        case 'crate': label = String(st.n); v.icon?.setAlpha(st.n > 0 ? 1 : 0.3); break;
        case 'stove':
        case 'oven': {
          const cook = st.k === 'stove' ? B.soupTicks : B.ovenTicks;
          const k = st.item?.k;
          const cooking = (k === 'tencere' && (st.item?.p?.length ?? 0) >= 2) || k === 'lahmacunRaw';
          if (cooking) bar(bx, by, bw, st.t / cook, 0x4be37a);
          else if (k === 'corba' || k === 'lahmacun') {
            const f = (st.t - cook) / (cook * (B.burnMul - 1));
            bar(bx, by, bw, 1 - f, f > 0.6 && Math.floor(time / 150) % 2 ? 0xff3b3b : 0xffa13b);
            if (f > 0.6) {
              // about to burn: pulsing red frame + one warning per dish
              g.lineStyle(3, 0xff3b3b, 0.5 + 0.5 * Math.sin(time / 90)).strokeRoundedRect(kx(st.c) + 2, ky(st.r) + 2, T - 4, T - 4, 8);
              const key = `warn:${st.id}:${s.day}:${s.tick - st.t}`; // tick - t = cook start: once per dish
              if (!this.played.has(key) && this.sfx(key, 'reject', 0.6)) this.float([cx, ky(st.r + 0.2)], 'Al! Yanıyor', '#ffb36b');
            }
          }
          if (st.off) label = '🔒';
          break;
        }
        case 'doner':
          label = `${st.n}/${B.donerMax}`;
          if (st.n < B.donerMax) bar(bx, by, bw, st.t / B.donerEvery, 0xffb36b);
          break;
        case 'tea':
          label = st.n ? `×${st.n}` : '…';
          if (!st.n) bar(bx, by, bw, st.t / B.teaBrewTicks, 0xc8682a);
          break;
        case 'sink':
          label = `✓${st.m} ✗${st.n}`;
          if (s.up.makine && st.n) bar(bx, by, bw, st.t / B.dishwasherTicks, 0x3fd8ff);
          break;
        case 'trash':
          label = `${st.n}/${B.trashCap}`;
          if (st.n) bar(bx, by, bw, st.n / B.trashCap, st.n >= B.trashCap ? 0xff3b3b : 0x9a9a9a);
          break;
        case 'door': label = st.q?.length ? `📦×${st.q.length}` : ''; break;
        case 'cashier': {
          const n = s.orders.filter((o) => o.kind === 'dine' && o.st === 'queue').length;
          label = n ? `sıra ${n}` : '';
          break;
        }
        case 'pano': label = String(s.orders.filter((o) => o.pin && o.st === 'seated').length || ''); break;
      }
      v.label.setText(label);
      const need = workTicks(s, st);
      if (st.prog > 0 && need) {
        const active = s.players.some((p) => p.work === st.id);
        g.lineStyle(5, 0x0d1020, 0.7).beginPath().arc(cx, cy, T * 0.36, 0, Math.PI * 2).strokePath();
        g.lineStyle(4, 0xffd23f, active ? 1 : 0.5).beginPath()
          .arc(cx, cy, T * 0.36, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(st.prog / need)).strokePath();
      }
    });

    const tgt = me && KITCHEN.includes(s.phase) ? targetOf(s, me.id) : null;
    this.highlight.setVisible(!!tgt);
    if (tgt) this.highlight.setPosition(kx(tgt.c), ky(tgt.r)).setAlpha(0.75 + 0.25 * Math.sin(time / 140));

    this.drawCustomers(s, me, time);

    s.players.forEach((p, i) => {
      const v = this.players[i];
      const show = p.mode === 'kitchen' && s.phase !== 'shop' && s.phase !== 'end';
      v.spr.setVisible(show);
      v.name.setVisible(show);
      if (!show) return v.hand.hide();
      const pos = this.smooth.at(p.id, kx(p.x), ky(p.y));
      const bob = p.moving ? Math.abs(Math.sin(time / 90)) * -3 : 0;
      v.spr.setFrame(p.dir).setPosition(pos.x, pos.y - 4 + bob).setDepth(6 + p.y / 100).setAlpha(p.bot ? 0.6 : 1);
      v.name.setText(p.id === this.loop.selfId ? 'SEN' : p.name.slice(0, 10) + (p.bot ? ' 🤖' : ''))
        .setColor(p.id === this.loop.selfId ? '#fff6a8' : cssColor(p.color))
        .setPosition(pos.x, pos.y - T * 0.5);
      const [hx, hy] = { u: [0, -0.32], d: [0, 0.22], l: [-0.32, 0], r: [0.32, 0] }[p.dir];
      v.hand.set(p.hand, pos.x + hx * T, pos.y + hy * T + bob, T * 0.5, 6.5 + p.y / 100 + (p.dir === 'u' ? -0.005 : 0.005));
    });
  }

  private drawCustomers(s: MutfakState, me: MPlayer | null, time: number): void {
    const g = this.g;
    const seen = new Set<number>();
    const queue = s.orders.filter((o) => o.kind === 'dine' && o.st === 'queue');
    for (const o of s.orders) {
      if (o.kind !== 'dine') continue;
      let x: number;
      let y: number;
      if (o.st === 'queue') {
        const qi = queue.indexOf(o);
        x = kx(9.5 + (qi + 1) * 0.58);
        y = ky(0.45);
      } else {
        const t = s.stations.find((q) => q.k === 'table' && q.table === o.table);
        if (!t) continue;
        x = kx(t.c + 0.5) + (t.c === COLS - 1 ? T * 0.18 : 0);
        y = ky(t.r + 0.5) + (t.r === ROWS - 1 ? T * 0.18 : 0);
      }
      seen.add(o.id);
      let v = this.customers.get(o.id);
      if (!v) {
        v = {
          body: this.add.image(x, y, TEX.customer).setTint(CUSTOMER_COLORS[o.id % CUSTOMER_COLORS.length]),
          bubble: this.add.image(x, y, TEX.bubble).setDepth(8),
          dish: this.add.image(x, y, ITEM_TEX.cay).setDepth(8.1),
        };
        this.customers.set(o.id, v);
      }
      const wait = o.st === 'queue' || o.st === 'seated';
      const angry = wait && (s.tick - o.born) / o.pat > 0.75;
      v.body.setPosition(x + (angry ? Math.sin(time / 40) * 1.5 : 0), y).setDisplaySize(T * 0.7, T * 0.7)
        .setDepth(5 + (o.st === 'queue' ? 0 : 0.5)).setVisible(true);
      const visible = canSeeOrder(s, me?.id ?? '', o);
      const bubbleY = y - T * 0.62;
      v.bubble.setVisible(wait).setPosition(x, bubbleY).setDisplaySize(T * 0.62, T * 0.56);
      v.dish.setVisible(wait).setPosition(x, bubbleY - 2).setTexture(visible ? itemTex(o.dish) : TEX.ticketHidden).setDisplaySize(T * 0.4, T * 0.4);
      if (wait) {
        const f = 1 - (s.tick - o.born) / o.pat;
        const w = T * 0.6;
        g.fillStyle(0x0d1020, 0.85).fillRect(x - w / 2 - 1, y + T * 0.3, w + 2, 6);
        g.fillStyle(f > 0.5 ? 0x4be37a : f > 0.25 ? 0xffd23f : 0xff3b3b).fillRect(x - w / 2, y + T * 0.3 + 1, w * clamp01(f), 4);
      }
    }
    for (const [id, v] of this.customers)
      if (!seen.has(id)) {
        [v.body, v.bubble, v.dish].forEach((o) => o.destroy());
        this.customers.delete(id);
      }
  }

  private drawStreet(s: MutfakState, me: MPlayer, time: number): void {
    const dests = new Set(me.bag.map((id) => s.orders.find((o) => o.id === id)?.dest ?? -1));
    this.pins.forEach((p, i) => {
      const on = dests.has(i);
      p.img.setVisible(on).setY(sy(STREET.targets[i][1] + 0.2) + Math.sin(time / 200 + i) * 3);
      p.name.setVisible(true).setAlpha(on ? 1 : 0.45);
    });
    this.scooter.setVisible(true).setPosition(sx(me.x), sy(me.y)).setTint(me.color).setFlipX(me.dir === 'l');
    // arrow to the nearest bag target (or home when the bag is empty), pulsing ring on that spot
    const [c, r] = cellOf(me);
    const goals = [...dests].filter((i) => i >= 0).map((i) => STREET.targets[i]);
    const goal = (goals.length ? goals : [STREET.home]).reduce((a, b) =>
      Math.abs(b[0] - c) + Math.abs(b[1] - r) < Math.abs(a[0] - c) + Math.abs(a[1] - r) ? b : a);
    const gx = sx(goal[0] + 0.5);
    const gy = sy(goal[1] + 0.5);
    const pulse = 0.5 + 0.5 * Math.sin(time / 160);
    this.g.lineStyle(3, 0xffd23f, 0.5 + 0.5 * pulse).strokeCircle(gx, gy, ST * (0.8 + 0.25 * pulse));
    if (Math.hypot(gx - sx(me.x), gy - sy(me.y)) > ST) {
      const ang = Math.atan2(gy - sy(me.y), gx - sx(me.x));
      const ax = sx(me.x) + Math.cos(ang) * ST * 1.1;
      const ay = sy(me.y) + Math.sin(ang) * ST * 1.1;
      const pt = (d: number, a: number) => [ax + Math.cos(ang + a) * d, ay + Math.sin(ang + a) * d];
      const [p1, p2, p3] = [pt(12, 0), pt(9, 2.5), pt(9, -2.5)];
      this.g.fillStyle(0xffd23f, 0.95).fillTriangle(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
    }
    const b = s.courier;
    this.botCourier.setVisible(b.active && b.out).setPosition(sx(b.x), sy(b.y));
  }

  // ---------- HUD ----------
  private drawHud(s: MutfakState, me: MPlayer | null): void {
    const g = this.hudG;
    g.clear();
    this.hudDay.setText(s.mode === 'kampanya' ? `Gün ${s.day}/${B.campaignDays}` : `Gün ${s.day} ♾️`);
    const dayTime = B.prepTicks + B.serviceTicks - s.phaseLeft;
    const rush = s.phase === 'service' && dayTime >= B.rushFrom && dayTime < B.rushTo;
    this.hudTime.setText(`${PHASE_NAMES[s.phase]} ${KITCHEN.includes(s.phase) || s.phase === 'shop' ? mmss(s.phaseLeft) : ''}${rush ? ' 🔥' : ''}`)
      .setColor(s.phase === 'close' || (s.phase === 'service' && s.phaseLeft < 30 * TICK) ? '#ff8a5a' : '#ffd23f');
    this.hudMoney.setText(`Kasa ${s.money} ₺`).setColor(s.money < 0 ? '#ff6b6b' : '#a6ff8a');
    // revenue vs today's target, with ★ marks at 1×, 1.4×, 1.8×
    const target = dayTarget(s);
    const max = target * B.starMul[B.starMul.length - 1];
    const bx = 450;
    const bw = 170;
    this.hudTarget.setText(`Ciro ${s.today.revenue}/${target} ₺ · ${rush ? 'Öğle yoğunluğu!' : `gün sonu kira ${rentOf(s.day)} ₺`}`);
    g.fillStyle(0x0d1020, 0.9).fillRoundedRect(bx - 2, 32, bw + 4, 14, 6);
    g.fillStyle(0x4be37a).fillRoundedRect(bx, 34, Math.max(2, bw * clamp01(s.today.revenue / max)), 10, 5);
    B.starMul.forEach((m, i) => {
      this.hudStars[i].setPosition(bx + (bw * m) / B.starMul[2], 39).setTexture(s.today.revenue >= target * m ? TEX.star : TEX.starOff);
    });
    const col = (v: number) => (v >= 50 ? '#a6ff8a' : v >= 25 ? '#ffd23f' : '#ff6b6b');
    this.hudRep.setText(`❤ ${Math.round(s.rep)}  🧽 ${Math.round(s.clean)}`).setColor(col(Math.min(s.rep, s.clean)));

    this.drawTickets(s, me);
    this.drawRows(s);
    const door = s.stations.find((t) => t.k === 'door');
    const lines: string[] = [];
    if (door?.q?.length) lines.push(`📦 Kapı rafı: ${door.q.length} paket`);
    if (s.courier.active) lines.push(s.courier.out ? `🤖 Bot kurye yolda (${s.courier.bag.length})` : '🤖 Bot kurye kapıda');
    const courier = s.players.find((p) => p.mode === 'courier');
    if (courier) lines.push(`🛵 ${courier.id === me?.id ? 'Sen' : courier.name} yolda (${courier.bag.length})`);
    this.status.setText(lines.join('\n')).setY(Y0 + s.players.length * 46 + 6);
    this.feed.forEach((t, i) => t.setY(this.status.y + this.status.height + 6 + i * 21));

    let hint = '';
    if (me?.mode === 'courier' && KITCHEN.includes(s.phase)) {
      const [c, r] = cellOf(me);
      const at = (p: [number, number]) => p[0] === c && p[1] === r;
      const ti = STREET.targets.findIndex(at);
      if (at(STREET.home)) hint = 'A: Mutfağa dön (kalan paketler rafa)';
      else if (at(STREET.market)) hint = s.money >= B.restockCost ? `A: Malzeme al (${B.restockCost} ₺)` : 'Market: paran yetmiyor';
      else if (ti >= 0 && me.bag.some((id) => s.orders.find((o) => o.id === id)?.dest === ti)) hint = 'A: Teslim et!';
      else hint = me.bag.length ? 'Sarı oku takip et, A: teslim · dönüşte market' : 'Paket kalmadı: oku takip et, lokantaya dön';
    } else if (me && KITCHEN.includes(s.phase)) {
      hint = s.phase === 'close' && !s.orders.some((o) => o.st !== 'eating') ? 'Kapanış: iş bitti, gün kapanıyor…' : this.goal(s, me);
      if (s.phase === 'prep' && !isTouch()) hint += '\nWASD/oklar: yürü · J/Boşluk: al/bırak · K/E basılı: kullan · 📖 tarifler';
    }
    this.hint.setText(hint).setY(this.view === 'street' ? sy(SROWS) + 6 : Y0 + ROWS * T + 8);
  }

  /** One-line next step from what you hold and what is around you (touch players get no other onboarding). */
  private goal(s: MutfakState, me: MPlayer): string {
    const h = me.hand;
    const d = dishOf(h);
    if (d) {
      const o = s.orders.find((q) => q.kind === 'dine' && q.st === 'seated' && q.dish === d);
      if (o) return `→ Masa ${o.table + 1} · A: servis et`;
      if (s.orders.some((q) => q.kind === 'phone' && q.st === 'queue' && q.dish === d)) return '→ Paket tezgâhı · A: koy, B basılı: paketle';
      return 'Bu yemeği bekleyen yok: tezgâha bırak';
    }
    if (h) {
      const k = h.k;
      if (k === 'paket') return '→ Kapı rafı (sağ alt) · A: bırak';
      if (k === 'kirli') return '→ Lavabo (sol) · A: bırak, B basılı: yıka';
      if (k === 'yanik') return '→ Çöp kutusu · A: at';
      if (k === 'tabak') return 'Tabağı doldur: çorba / lahmacun al ya da lavaş + et + domates';
      if (k in CHOP) return '→ Doğrama tahtası (sol) · A: koy, B basılı: doğra';
      if (k === 'hamur') return 'Hamuru tezgâha koy, üstüne doğranmış kıyma + domates';
      if (k === 'lahmacunRaw') return '→ Fırın · A: koy';
      if (k === 'mercimekD' || k === 'soganD') return '→ Ocak · A: koy (mercimek + soğan = çorba)';
      if (k === 'domatesD' || k === 'kiymaD') return 'Hamura (lahmacun) ya da tabağa (dürüm) ekle';
      if (k === 'lahmacun') return 'Tabağa koy: lavabodan boş tabak al';
      return 'Tabağa ekle (📖 tarifler) · A: bırak';
    }
    const t = targetOf(s, me.id);
    if (t && canB(s, me.id, t)) return `B basılı tut: ${B_VERBS[t.k] ?? 'kullan'}`;
    const mine = s.asym && s.orders.find((o) => o.kind === 'dine' && o.st === 'seated' && o.by === me.id && !o.pin);
    if (mine) return `Fişi panoya as (B) ya da mutfağa söyle: ${DISH_NAMES[mine.dish]}!`;
    if (s.orders.some((o) => o.kind === 'dine' && o.st === 'queue')) return 'Müşteri bekliyor → KASA · B basılı: sipariş al';
    const want = s.orders.find((o) => (o.st === 'seated' || (o.kind === 'phone' && o.st === 'queue')) && canSeeOrder(s, me.id, o));
    if (want) return `Hazırla: ${DISH_NAMES[want.dish]} (📖 tarif) · A: al/bırak`;
    if (s.stations.some((q) => q.k === 'table' && q.item?.k === 'kirli')) return 'Masalardaki kirli tabakları lavaboya götür';
    if (s.phase === 'prep') return 'Hazırlık: malzeme doğra, müşteri birazdan gelir';
    return '';
  }

  private drawTickets(s: MutfakState, me: MPlayer | null): void {
    const g = this.hudG;
    const left = (o: Order) =>
      o.st === 'packed' || o.st === 'bag' ? 1 - (s.tick - o.packedAt) / B.coldTicks : 1 - (s.tick - o.born) / o.pat;
    const list = s.orders.filter((o) => o.st !== 'eating').sort((a, b) => left(a) - left(b)).slice(0, this.tickets.length);
    this.tickets.forEach((t, i) => {
      const o = list[i];
      for (const x of [t.icon, t.line1, t.line2]) x.setVisible(!!o);
      if (!o) return;
      const ty = Y0 + i * TICKET_H;
      g.fillStyle(0x1c2350, 0.92).fillRoundedRect(LEFT_X, ty, PANEL_W, TICKET_H - 4, 8);
      g.fillStyle(o.kind === 'phone' ? 0x4fb3ff : 0xff9a3c).fillRoundedRect(LEFT_X, ty, 5, TICKET_H - 4, { tl: 8, bl: 8, tr: 0, br: 0 });
      const vis = canSeeOrder(s, me?.id ?? '', o);
      t.icon.setTexture(vis ? itemTex(o.dish) : TEX.ticketHidden).setDisplaySize(vis ? 34 : 28, 34);
      const where = o.dest >= 0 ? STREET.targetNames[o.dest] : '';
      // hidden dine-in tickets name who took the order, so the kitchen knows whom to ask
      const taker = o.by ? s.players.find((p) => p.id === o.by) : undefined;
      const [l1, l2] =
        o.kind === 'phone'
          ? [`📞 ${DISH_NAMES[o.dish]}`, `${o.st === 'queue' ? '📝' : o.st === 'packed' ? '📦' : '🛵'} ${where}`]
          : o.st === 'queue'
            ? ['Kasada', 'B: sipariş al']
            : [vis ? DISH_NAMES[o.dish] : `??? ${taker?.name.slice(0, 6) ?? ''}`, `Masa ${o.table + 1}${o.pin ? ' 📌' : vis ? '' : ' · sor!'}`];
      t.line1.setText(l1).setColor(!vis && taker ? cssColor(taker.color) : '#fff');
      t.line2.setText(l2);
      const f = left(o);
      const y = Y0 + i * TICKET_H + 47;
      g.fillStyle(0x0d1020, 0.8).fillRect(LEFT_X + 10, y, PANEL_W - 18, 7);
      g.fillStyle(f > 0.5 ? 0x4be37a : f > 0.25 ? 0xffd23f : 0xff3b3b).fillRect(LEFT_X + 10, y, (PANEL_W - 18) * clamp01(f), 7);
    });
  }

  private drawRows(s: MutfakState): void {
    this.rows.forEach((row, i) => {
      const p = s.players[i];
      row.name.setVisible(!!p);
      row.sub.setVisible(!!p);
      row.dot.clear();
      if (!p) return row.hand.hide();
      const y = Y0 + i * 46;
      row.dot.fillStyle(p.color).fillCircle(RIGHT_X + 10, y + 12, 7);
      if (p.id === this.loop.selfId) row.dot.lineStyle(2, 0xfff6a8).strokeCircle(RIGHT_X + 10, y + 12, 9);
      row.name.setText(p.name.slice(0, 9) + (p.bot ? ' 🤖' : '')).setColor(cssColor(p.color));
      const where = p.mode === 'courier' ? '🛵 kuryede' : p.roles.map((r) => ROLE_NAMES[r]).join('+');
      row.sub.setText(s.phase === 'shop' ? (p.ready ? '✓ hazır' : '… dükkanda') : where);
      row.hand.set(p.mode === 'kitchen' ? p.hand : null, RIGHT_X + PANEL_W - 16, y + 18, 28);
    });
  }

  private updateButtons(s: MutfakState, me: MPlayer | null): void {
    if (!me) return;
    if (me.mode === 'courier') {
      const [c, r] = cellOf(me);
      const at = (p: [number, number]) => p[0] === c && p[1] === r;
      const label = at(STREET.home) ? 'DÖN' : at(STREET.market) ? 'MARKET' : STREET.targets.some(at) ? 'TESLİM' : 'A';
      this.controls.label('a', label);
      this.controls.bState(0, true);
    } else {
      const t = targetOf(s, me.id);
      this.controls.label('a', me.hand ? 'BIRAK' : t?.k === 'door' ? 'KURYE' : 'AL');
      this.controls.label('b', (t && B_LABELS[t.k]) || 'KULLAN');
      const need = t ? workTicks(s, t) : 0;
      this.controls.bState(t && need && canB(s, me.id, t) ? clamp01(t.prog / need) : 0, false);
    }
  }

  // ---------- events → sound + fx ----------
  private diffSnapshot(prev: MutfakState | null, next: MutfakState): MutfakEvent[] {
    const ev: MutfakEvent[] = [];
    if (!prev) return ev;
    for (const p of next.players) {
      const o = prev.players.find((q) => q.id === p.id);
      if (!o) continue;
      if (o.mode !== p.mode) ev.push({ type: 'courier', id: p.id, out: p.mode === 'courier' });
      else if (p.id !== this.loop.selfId && p.mode === 'kitchen') this.smooth.correct(p.id, kx(o.x), ky(o.y), kx(p.x), ky(p.y));
    }
    if (prev.courier.out !== next.courier.out) ev.push({ type: 'courier', id: 'bot', out: next.courier.out });
    for (const u of UPGRADES) if (!prev.up[u.id] && next.up[u.id]) ev.push({ type: 'bought', up: u.id });
    if (prev.phase !== next.phase) {
      ev.push({ type: 'phase', phase: next.phase, day: next.day });
      if (next.phase === 'end') ev.push({ type: 'end', bankrupt: next.bankrupt });
    }
    if (prev.day !== next.day || !KITCHEN.includes(next.phase)) return ev;
    const before = new Map(prev.orders.map((o) => [o.id, o]));
    const now = new Set(next.orders.map((o) => o.id));
    for (const o of next.orders) {
      const b = before.get(o.id);
      if (!b) ev.push(o.kind === 'phone' ? { type: 'phone', order: o.id } : { type: 'customer', order: o.id });
      else {
        if (b.st === 'queue' && o.st === 'seated') ev.push({ type: 'taken', order: o.id, id: o.by ?? '' });
        if (!b.pin && o.pin) ev.push({ type: 'pinned', order: o.id });
        if (b.st === 'seated' && o.st === 'eating') ev.push({ type: 'served', order: o.id, money: Math.max(0, next.money - prev.money), tip: 0 });
        if (b.st === 'queue' && o.st === 'packed') ev.push({ type: 'packed', order: o.id });
      }
    }
    for (const b of prev.orders) {
      if (now.has(b.id)) continue;
      if ((b.st === 'queue' || b.st === 'seated') && next.today.failed > prev.today.failed) ev.push({ type: 'left', order: b.id });
      if (b.st === 'bag' && next.today.served > prev.today.served) ev.push({ type: 'delivered', order: b.id, money: 0, cold: false });
    }
    next.stations.forEach((st, i) => {
      const o = prev.stations[i];
      if (!o) return;
      const a = o.item?.k;
      const z = st.item?.k;
      if (a !== z) {
        if ((a === 'tencere' && z === 'corba') || (a === 'lahmacunRaw' && z === 'lahmacun')) ev.push({ type: 'cooked', st: st.id });
        if (z === 'yanik' && (a === 'corba' || a === 'lahmacun')) ev.push({ type: 'burnt', st: st.id });
        if (st.k === 'board' && a && z && z === a + 'D') ev.push({ type: 'chopped', st: st.id });
      }
      if (st.k === 'sink' && st.m > o.m && st.n < o.n) ev.push({ type: 'washed', st: st.id });
      if (st.k === 'tea' && o.n === 0 && st.n > 0) ev.push({ type: 'brewed', st: st.id });
      if (st.k === 'doner' && st.n < o.n) ev.push({ type: 'slice', st: st.id });
    });
    return ev;
  }

  /** Plays sfx once per distinct event (snapshot synthesis can repeat what prediction already played). */
  private sfx(key: string, id: SfxId, vol = 1): boolean {
    const now = this.time.now;
    const at = this.played.get(key);
    if (at !== undefined && now - at < 1500) return false;
    this.played.set(key, now);
    if (this.played.size > 200) for (const [k, t] of this.played) if (now - t > 5000) this.played.delete(k);
    playSfx(id, { vol });
    return true;
  }

  private handleEvents(events: MutfakEvent[], s: MutfakState): void {
    const self = this.loop.selfId;
    const meCourier = s.players.find((p) => p.id === self)?.mode === 'courier';
    const stPos = (id: number) => {
      const st = s.stations[id];
      return st ? [kx(st.c + 0.5), ky(st.r + 0.2)] : [480, 270];
    };
    const tablePos = (order: number) => {
      const t = this.orderSpot.get(order);
      const st = t === undefined ? undefined : s.stations.find((q) => q.k === 'table' && q.table === t);
      return st ? [kx(st.c + 0.5), ky(st.r)] : [kx(KASA_SPOT[0] + 0.5), ky(0.6)];
    };
    const near = (id: string) => (id === self ? 1 : 0.55); // others' small actions a bit quieter
    for (const e of events) {
      switch (e.type) {
        case 'pick': this.sfx(`pick:${e.id}:${e.k}:${s.tick >> 3}`, 'pick', near(e.id)); break;
        case 'place': this.sfx(`place:${e.id}:${e.st}:${s.tick >> 3}`, e.k === 'paket' ? 'pack' : 'place', near(e.id)); break;
        case 'reject': if (e.id === self) this.sfx(`reject:${s.tick >> 2}`, 'reject'); break;
        case 'chopped': if (this.sfx(`chop:${e.st}:${s.tick >> 4}`, 'chop') && !meCourier) this.float(stPos(e.st), '✓', '#a6ff8a'); break;
        case 'cookStart': this.sfx(`cook:${e.st}:${s.tick >> 5}`, 'sizzle'); break;
        case 'cooked':
          if (this.sfx(`cooked:${e.st}`, 'ding') && !meCourier) this.float(stPos(e.st), 'Hazır!', '#a6ff8a');
          break;
        case 'burnt':
          if (this.sfx(`burnt:${e.st}`, 'burn') && !meCourier) this.float(stPos(e.st), 'Yandı!', '#ff6b6b');
          break;
        case 'slice': if (this.sfx(`slice:${e.st}:${s.tick >> 4}`, 'slice') && !meCourier) this.float(stPos(e.st), '✓', '#a6ff8a'); break;
        case 'brewed': this.sfx(`brew:${e.st}`, 'pour'); break;
        case 'washed': if (this.sfx(`wash:${e.st}:${s.tick >> 4}`, 'wash', 0.8) && !meCourier) this.float(stPos(e.st), '✓', '#9fe4ff'); break;
        case 'trashFull': if (this.sfx(`trash:${s.day}:${s.tick >> 8}`, 'trash')) this.pushFeed('🗑️ Çöp doldu! B ile boşalt', '#ffb36b'); break;
        case 'customer': this.sfx(`cust:${e.order}`, 'bell', 0.8); break;
        case 'phone': if (this.sfx(`phone:${e.order}`, 'phone')) this.pushFeed('📞 Paket sipariş geldi', '#9fe4ff'); break;
        case 'taken':
          if (this.sfx(`taken:${e.order}`, 'pin', 0.7) && e.id === self && s.asym)
            this.pushFeed('🧾 Sipariş sende! Panoya as (B) ya da söyle', '#ffd23f');
          break;
        case 'pinned': this.sfx(`pinned:${e.order}`, 'pin'); break;
        case 'served':
          if (this.sfx(`served:${e.order}`, 'cash') && !meCourier && e.money > 0)
            this.float(tablePos(e.order), `+${e.money} ₺${e.tip ? ' bahşiş!' : ''}`, '#a6ff8a');
          break;
        case 'wrong':
          if (this.sfx(`wrong:${e.order}:${s.tick >> 5}`, 'angry') && !meCourier) this.float(tablePos(e.order), 'Yanlış yemek!', '#ff6b6b');
          break;
        case 'left':
          if (this.sfx(`left:${e.order}`, 'angry')) {
            this.pushFeed('😠 Müşteri gitti (−itibar)', '#ff6b6b');
            if (!meCourier) this.float(tablePos(e.order), 'Gitti!', '#ff6b6b');
          }
          break;
        case 'packed': this.sfx(`packed:${e.order}`, 'pack'); break;
        case 'delivered':
          if (this.sfx(`deliv:${e.order}`, 'deliver')) {
            playSfx('cash', { delay: 0.15, vol: 0.7 });
            this.pushFeed(`🛵 Teslim edildi${e.money ? ` +${e.money} ₺` : ''}${e.cold ? ' (soğuk)' : ''}`, e.cold ? '#ffb36b' : '#a6ff8a');
          }
          break;
        case 'courier': if (e.out) this.sfx(`courier:${e.id}:${s.tick >> 6}`, 'scooter', e.id === self ? 1 : 0.5); break;
        case 'restock': if (this.sfx(`restock:${s.tick >> 4}`, 'buy')) this.pushFeed('🛒 Market: +6 malzeme', '#9fe4ff'); break;
        case 'bought': {
          if (this.sfx(`bought:${e.up}`, 'buy')) this.pushFeed(`🛍️ ${UPGRADES.find((u) => u.id === e.up)?.label} alındı`, '#ffd23f');
          break;
        }
        case 'phase': this.onPhase(e.phase, e.day, s); break;
        case 'end': break; // the end card is driven by state
      }
    }
  }

  private onPhase(phase: MutfakState['phase'], day: number, s: MutfakState): void {
    const ok = this.sfx(`phase:${day}:${phase}`, phase === 'prep' ? 'dayStart' : phase === 'service' ? 'bell' : 'dayEnd');
    if (!ok) return;
    const text = {
      prep: `${day}. gün — hazırlık`,
      service: 'Kapılar açıldı!',
      close: 'Kapanış! Yeni müşteri yok',
      shop: 'Gün bitti',
      end: s.bankrupt ? 'İflas!' : 'Kampanya bitti!',
    }[phase];
    this.banner.setText(text).setVisible(true).setScale(0.3).setAlpha(1);
    this.tweens.killTweensOf(this.banner);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.banner, alpha: 0, delay: 1000, duration: 400, onComplete: () => this.banner.setVisible(false) });
  }

  private float([x, y]: number[], msg: string, color: string): void {
    const t = this.add.text(x, y, msg, txt(16, color, 4)).setOrigin(0.5).setDepth(12);
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, delay: 500, duration: 700, onComplete: () => t.destroy() });
  }

  private pushFeed(msg: string, color: string): void {
    const t = this.add.text(RIGHT_X, 0, msg, txt(15, color, 3)).setDepth(9.5).setWordWrapWidth(PANEL_W);
    this.feed.unshift(t);
    while (this.feed.length > 3) {
      const old = this.feed.pop()!;
      this.tweens.killTweensOf(old);
      old.destroy();
    }
    this.tweens.add({
      targets: t, alpha: 0, delay: 4500, duration: 600,
      onComplete: () => {
        this.feed = this.feed.filter((o) => o !== t);
        t.destroy();
      },
    });
  }

  // ---------- end ----------
  private showEnd(s: MutfakState): void {
    const stars = totalStars(s);
    const lines = [
      `⭐ Toplam ${stars} yıldız · ${s.history.length} gün`,
      `💰 Kasa: ${s.money} ₺ · ❤ İtibar ${Math.round(s.rep)}`,
    ];
    if (s.bankrupt) lines.unshift(s.rep <= 0 ? 'İtibar sıfırlandı, müşteri kalmadı.' : 'Kira ödenemedi.');
    this.closeEnd = showEndCard({
      title: s.bankrupt ? 'İflas! 💸' : `Rütbe: ${rankOf(stars)}`,
      lines,
      body: endTable(s),
      isHost: this.session.isHost,
      onRestart: () => this.session.startGame(startPayload(this.session, this.payload.mode)),
      onMenu: () => this.toMenu(),
    });
    if (this.session.isHost && !this.recorded) {
      this.recorded = true;
      void this.record(s);
    }
  }

  /** Host-only, once per game. Co-op: everyone wins unless the restaurant went bankrupt. */
  private async record(s: MutfakState): Promise<void> {
    const names = s.players.map((p) => p.name);
    try {
      await recordMatch({
        game: 'mutfak',
        mode: s.mode,
        players: names,
        winners: s.bankrupt ? [] : names,
        stats: { stars: totalStars(s), money: s.money, days: s.history.length, rank: rankOf(totalStars(s)) },
        durationS: s.tick / TICK,
      });
    } catch (err) {
      console.warn('recordMatch failed', err);
    }
  }

  private toMenu(): void {
    void this.session.leave().catch(() => {});
    this.scene.start('Menu');
  }
}
