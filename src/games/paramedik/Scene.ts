// Paramedik scene. SP (Saha Paramediği) sees the patient + monitor + action dock (Phaser, 960×540);
// PUs (Protokol Uzmanı) get the DOM manual (panels.ts). Minigames (CPR rhythm, bleeding pressure) are judged
// locally and only their quality goes to the sim. Sounds are derived from state, so every device hears the
// shared ones (alarms, results, approvals, patient babble, monitor beep); stethoscope/tool clips stay on the SP.
import Phaser from 'phaser';
import { recordMatch, type RoomSession, type StartPayload } from '../../net';
import { isMuted } from '../../ui/audio';
import { cssColor, toast } from '../../ui/dom';
import { showEndCard } from '../../ui/endcard';
import { GameLoop, startPayload } from '../../ui/loop';
import { mountNetMeter } from '../../ui/netmeter';
import { setExitHandler } from '../../ui/settings';
import { FONT, RES } from '../../ui/textures';
import { ensureTextures } from './art';
import { TEX } from './assets';
import { BALANCE as B, TICK } from './balance';
import { tplById } from './cases';
import { QUIPS, TEYZE_TIPS } from './content/lines';
import { AMPUL_CSS, Manual, PhaseCard, RESULT_TEXT, TRIAGE_CSS, actLabel, canHandOver, clock, cprQuality } from './panels';
import { paramedikSim } from './sim';
import { playSfx } from './sound';
import {
  COLORS, LABELS, TOOLS, TOPICS, actionKey,
  type Act, type AgeGroup, type AmpulColor, type HistoryTopic, type LungSound, type PmEvent, type PmInput, type PmPlayer, type PmState, type PoseId,
  type Status, type ToolId, type TriageColor,
} from './types';

const PX = 594; // right panel content x
const PW = 354; // right panel content width
const STATUS_COLOR: Record<Status, number> = { stabil: 0x4be37a, kritik: 0xffd23f, arrest: 0xff5a5a, kayip: 0x8a8db0 };
const hexN = (css: string) => parseInt(css.slice(1), 16);
const txt = (size: number, color = '#f4f1ff', stroke = 4) => ({
  fontFamily: FONT, fontSize: `${size}px`, fontStyle: '700', color, stroke: '#0d1020', strokeThickness: stroke, resolution: 2,
});
const PATIENT = { x: 290, y: 330 };
const PS = 1.5; // patient art is 320x140 logical, shown 1.5x; textures are RES x logical
/** Patient-art logical point (320x140, child drawn at 0.72) → screen. */
const onBody = (grp: AgeGroup, lx: number, ly: number) => {
  const k = grp === 'cocuk' ? 0.72 : 1;
  return { x: PATIENT.x + (lx * k - 160) * PS, y: PATIENT.y + (ly * k + (140 * (1 - k)) / 1.4 - 70) * PS };
};
const CPR_TAPS = 30;
const PRESS_SEC = 5;
const BAND: [number, number] = [0.55, 0.8];

type Page = 'olc' | 'sor' | 'mud' | 'ilac';
const PAGES: [Page, string][] = [['olc', 'Ölç'], ['sor', 'Sor'], ['mud', 'Müdahale'], ['ilac', 'İlaç']];

interface Btn {
  bg: Phaser.GameObjects.Rectangle;
  t: Phaser.GameObjects.Text;
  icon?: Phaser.GameObjects.Image;
  fill: number;
  enabled: boolean;
  shown: boolean;
}

type Mini =
  | { k: 'cpr'; taps: number[] }
  | { k: 'basinc'; level: number; started: number; inBand: number; held: boolean };

export class ParamedikScene extends Phaser.Scene {
  private session!: RoomSession;
  private payload!: StartPayload;
  private loop!: GameLoop<PmState, PmInput, PmEvent>;
  private manual!: Manual;
  private card!: PhaseCard;
  private closeEnd: (() => void) | null = null;
  private recorded = false;
  private lastTick = 0;
  private seq = 0;
  private act: Act | null = null;
  private seen = new Set<string>();
  private manualOpen = false; // SP's own toggle (antrenman / solo)

  // field (SP) objects
  private field: Phaser.GameObjects.GameObject[] = [];
  private codeT!: Phaser.GameObjects.Text;
  private timerT!: Phaser.GameObjects.Text;
  private scoreT!: Phaser.GameObjects.Text;
  private bookBtn!: Btn;
  private heart!: Phaser.GameObjects.Image;
  private statusT!: Phaser.GameObjects.Text;
  private patientT!: Phaser.GameObjects.Text;
  private signs: { img: Phaser.GameObjects.Image; t: Phaser.GameObjects.Text }[] = [];
  private signKey = '';
  private patient!: Phaser.GameObjects.Image;
  private chest!: Phaser.GameObjects.Image;
  private mask!: Phaser.GameObjects.Image;
  private wound!: Phaser.GameObjects.Image;
  private tagsT!: Phaser.GameObjects.Text;
  private sayBg!: Phaser.GameObjects.Image;
  private sayT!: Phaser.GameObjects.Text;
  private teyze!: Phaser.GameObjects.Image;
  private teyzeBg!: Phaser.GameObjects.Image;
  private teyzeT!: Phaser.GameObjects.Text;
  private teyzeAt = 0;
  private monitorG!: Phaser.GameObjects.Graphics;
  private hrT!: Phaser.GameObjects.Text;
  private spo2T!: Phaser.GameObjects.Text;
  private monHint!: Phaser.GameObjects.Text;
  private flick = { at: 0, hr: 0, spo2: 0 };
  private readT: Partial<Record<ToolId, Phaser.GameObjects.Text>> = {};
  private tabBtns: Btn[] = [];
  private page: Page = 'olc';
  private pageBtns: Record<Page, Btn[]> = { olc: [], sor: [], mud: [], ilac: [] };
  private pageObjs: Record<Page, Phaser.GameObjects.GameObject[]> = { olc: [], sor: [], mud: [], ilac: [] };
  private timed: Btn[] = []; // the sim keeps the SP busy after these; a press while busy is queued (1 deep)
  private queued: { a: Act; b: Btn } | null = null;
  private busyBtn: Btn | null = null; // the button whose action the SP is busy with (progress bar on it)
  private pushed = 0; // last seq handed to the loop (never send twice in one frame)
  private busyG!: Phaser.GameObjects.Graphics;
  private busyFrom = { until: 0, from: 0 };
  private sevG!: Phaser.GameObjects.Graphics;
  private teslimBtn!: Btn;
  private readyT!: Phaser.GameObjects.Text;
  private teyzeText = '';
  private answerT!: Phaser.GameObjects.Text;
  private lastAsked: HistoryTopic | null = null;
  private ampulBtns: Btn[] = [];
  private tikBtns: Btn[] = [];
  private pick = { c: null as AmpulColor | null, n: 0 };
  private pickT!: Phaser.GameObjects.Text;
  private askBtns: Btn[] = [];

  // minigame overlay
  private mini: Mini | null = null;
  private miniObjs: Phaser.GameObjects.GameObject[] = [];
  private miniImg!: Phaser.GameObjects.Image;
  private miniT!: Phaser.GameObjects.Text;
  private miniHint!: Phaser.GameObjects.Text;
  private miniG!: Phaser.GameObjects.Graphics;

  // sound timing
  private beepAt = 0;
  private alarmAt = 0;

  constructor() {
    super('ParamedikGame');
  }

  create({ session, payload }: { session: RoomSession; payload: StartPayload }): void {
    this.session = session;
    this.payload = payload;
    this.resetLocal();
    this.field = [];
    this.signs = [];
    this.tabBtns = [];
    this.timed = [];
    this.ampulBtns = [];
    this.tikBtns = [];
    this.askBtns = [];
    this.pageBtns = { olc: [], sor: [], mud: [], ilac: [] };
    this.pageObjs = { olc: [], sor: [], mud: [], ilac: [] };
    this.readT = {};
    this.mini = null;
    ensureTextures(this);

    this.add.image(0, 0, TEX.bg).setOrigin(0).setDisplaySize(960, 540).setDepth(0);
    this.buildField();
    this.buildMini();

    this.manual = new Manual((key) => this.send({ k: 'onay', a: key }, 'onay'), () => (this.manualOpen = false));
    this.card = new PhaseCard(() => this.send({ k: 'hazir' }));

    this.loop = new GameLoop(session, paramedikSim, {
      onHostLeft: () => {
        toast('Oda kurucusu ayrıldı');
        this.toMenu();
      },
    });
    this.loop.start(payload);
    mountNetMeter(this, this.loop, session);

    const kb = (e: KeyboardEvent) => this.onKey(e);
    const ku = (e: KeyboardEvent) => {
      if (e.code === 'Space' && this.mini?.k === 'basinc') this.mini.held = false;
    };
    window.addEventListener('keydown', kb);
    window.addEventListener('keyup', ku);
    setExitHandler(() => this.toMenu(), session.isHost);
    this.events.once('shutdown', () => {
      setExitHandler(null);
      window.removeEventListener('keydown', kb);
      window.removeEventListener('keyup', ku);
      this.loop.dispose();
      this.manual.destroy();
      this.card.close();
      this.closeEnd?.();
    });
  }

  private resetLocal(): void {
    this.closeEnd?.();
    this.closeEnd = null;
    this.recorded = false;
    this.seq = 0;
    this.act = null;
    this.seen.clear();
    this.manualOpen = false;
    this.pick = { c: null, n: 0 };
    this.lastAsked = null;
    this.teyzeAt = 0;
    this.queued = null;
    this.busyBtn = null;
    this.pushed = 0;
  }

  /** Timed action (busy lock in the sim): sent now, or queued until the SP is free. */
  private timedSend(a: Act, b: Btn): void {
    const s = this.loop.state;
    if (s && s.tick < s.busyUntil) {
      this.queued = { a, b };
      playSfx('ui_tik');
      this.float(`Sırada: ${actLabel(actionKey(a))}`, '#ffd23f');
      return;
    }
    this.busyBtn = b;
    this.send(a);
  }

  /** One command: bump seq (the sim applies `act` exactly once). */
  private send(a: Act, sfx: 'ui_tik' | 'onay' | null = 'ui_tik'): void {
    this.seq++;
    this.act = a;
    if (sfx) playSfx(sfx);
  }

  private me(s: PmState): PmPlayer | undefined {
    return s.players.find((p) => p.id === this.loop.selfId);
  }

  update(time: number, delta: number): void {
    const prev = this.loop.state;
    // after the shift ends nobody sends commands, so a restart (players' seq back to 0) never replays one
    if (prev?.phase === 'end') this.seq = 0, this.act = null, this.queued = null;
    if (this.queued && prev?.phase !== 'case') this.queued = null;
    if (this.queued && prev && prev.tick >= prev.busyUntil && this.seq === this.pushed) {
      const q = this.queued;
      this.queued = null;
      this.busyBtn = q.b;
      this.send(q.a);
    }
    this.loop.setLocalInput({ seq: this.seq, act: this.act });
    this.pushed = this.seq;
    const events = this.loop.update(Math.min(delta, 250));
    const s = this.loop.state;
    if (!s || !s.cur) return;
    if (s.tick + 60 < this.lastTick) this.resetLocal(); // "Tekrar Oyna" started a fresh shift
    this.lastTick = s.tick;
    const me = this.me(s);
    const isSP = me?.role === 'sp';

    for (const e of events) {
      // SP is the host, so these local events reach the one who acted
      if (e.type === 'busy' && isSP) this.float('Meşgulsün, bekle…', '#ffd23f');
      if (e.type === 'act' && e.key === 'teslim' && e.by === this.loop.selfId) {
        const c = this.loop.state?.cur;
        const why = !c ? '' : c.required.length ? ` (${c.required.length} adım eksik)` : ' (hasta henüz stabil değil)';
        this.float(`Henüz teslim edilemez${why}`, '#ff6b6b');
      }
    }
    this.sounds(s, isSP, time);

    // views
    const fieldOn = isSP && s.phase !== 'end';
    for (const o of this.field) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(fieldOn);
    if (fieldOn) this.drawField(s, me!, time);
    else this.endMini();
    const manualOn = !!me && s.phase !== 'end' && (me.role === 'pu' || (this.manualOpen && me.tabs.length > 0));
    this.manual.show(manualOn);
    if (me && manualOn) this.manual.update(s, me);
    this.card.update(s, this.loop.selfId);
    if (fieldOn && s.phase === 'case') this.updateMini(delta);
    else this.endMini();
    if (s.phase === 'end' && !this.closeEnd) this.showEnd(s);
  }

  // ---------------------------------------------------------------- sounds + feed (state diff, all devices)
  private once(k: string): boolean {
    if (this.seen.has(k)) return false;
    this.seen.add(k);
    return true;
  }

  private sounds(s: PmState, isSP: boolean, time: number): void {
    const c = s.cur!;
    const ci = s.caseIdx;
    if (this.once(`ph:${ci}:${s.phase}`)) {
      if (s.phase === 'case') {
        playSfx('telsiz');
        this.teyzeAt = time + 1500;
        this.teyzeText = c.teyze;
      }
      if (s.phase === 'result' && s.results[ci]?.outcome !== 'kayip') playSfx('teslim');
    }
    c.log.forEach((e, i) => {
      if (!this.once(`log:${ci}:${i}:${e.key}`)) return;
      if (e.r === 'info') {
        if (e.key === 'status:kritik' || e.key === 'status:arrest') playSfx('alarm');
        if (e.key === 'status:kayip') playSfx('kayip');
        const st = e.key.slice(7) as Status;
        this.feed(actLabel(e.key), cssColor(STATUS_COLOR[st] ?? 0xffffff));
        return;
      }
      if (e.r === 'dogru') {
        if (e.key.startsWith('ilac:')) playSfx('ilac');
        playSfx('dogru');
      } else if (e.r === 'zararli') playSfx('hata');
      else if (e.r === 'yanlis') playSfx('hata', { vol: 0.6 });
      else if (e.r === 'gereksiz') playSfx('hata', { vol: 0.3, pitch: 1.4 });
      const color = e.r === 'dogru' ? '#4be37a' : e.r === 'gereksiz' ? '#ffd23f' : e.r === 'tekrar' ? '#a9a8d6' : '#ff6b6b';
      const quips = e.r === 'gereksiz' || e.r === 'zararli' ? QUIPS[e.r] : null;
      this.feed(`${RESULT_TEXT[e.r]}: ${actLabel(e.key)}${quips ? ` · ${quips[i % quips.length]}` : ''}`, color);
    });
    for (const [tool, r] of Object.entries(c.readings)) {
      if (!r || !this.once(`rd:${ci}:${tool}:${r.t}`) || !isSP) continue;
      if (tool === 'stetoskop') playSfx(`steto_${r.v as LungSound}`);
      else if (tool === 'tansiyon') playSfx('tansiyon_pompa');
      else playSfx('bip', { pitch: 1.3 });
    }
    if (c.say && this.once(`say:${ci}:${c.say.t}`)) playSfx('mirilti');
    for (const o of s.onay) {
      if (!this.once(`onay:${o.by}:${o.key}:${o.t}`) || o.by === this.loop.selfId) continue;
      playSfx('onay');
      const who = s.players.find((q) => q.id === o.by)?.name ?? '?';
      if (isSP) this.feed(`${who} onayladı: ${actLabel(o.key)}`, '#3fd8ff');
    }
    if (c.team && this.once(`team:${ci}:${c.team}`)) {
      playSfx('takim');
      this.feed(`Takım bonusu! (${c.team})`, '#ff7ad9');
    }
    if (s.phase !== 'case') return;
    if (canHandOver(s) && this.once(`ok:${ci}`)) {
      playSfx('takim', { pitch: 1.2 });
      this.feed('✓ Hasta stabil · Teslim edebilirsiniz!', '#4be37a');
    }
    // the neighbour's advice reaches the PU too (so "ask the booklet" works both ways)
    if (!isSP && time > this.teyzeAt && this.once(`teyzefeed:${ci}`)) this.manual.setFeed(`Komşu teyze (SP'nin yanında): “${c.teyze}”`, '#ff7ad9');
    // monitor beep (pitch drops with SpO₂, like a real pulse oximeter) and the arrest alarm, on every device
    const v = c.vitals;
    if (c.monitor && v.hr > 0 && time >= this.beepAt) {
      this.beepAt = time + 60000 / Math.max(30, v.hr);
      playSfx('bip', { pitch: Math.max(0.5, Math.min(1, (v.spo2 - 50) / 48)), vol: isSP ? 1 : 0.45 });
      if (isSP) this.heart.setScale(this.heart.scaleX * 1.15);
    }
    if (c.status === 'arrest' && time >= this.alarmAt) {
      this.alarmAt = time + 2500;
      playSfx('alarm', { vol: 0.6 });
    }
  }

  private feed(text: string, color: string): void {
    this.manual.setFeed(text, color);
    this.float(text, color);
  }

  private float(text: string, color: string): void {
    const s = this.loop.state;
    if (this.me(s!)?.role !== 'sp') return;
    const t = this.add.text(PATIENT.x, PATIENT.y - 30, text, txt(22, color, 5)).setOrigin(0.5).setDepth(40);
    t.setWordWrapWidth(540);
    this.tweens.add({ targets: t, y: t.y - 70, alpha: 0, delay: 1400, duration: 900, onComplete: () => t.destroy() });
  }

  // ---------------------------------------------------------------- field (SP) layout
  private keep<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.field.push(o);
    return o;
  }

  private btn(x: number, y: number, w: number, hgt: number, label: string, onTap: () => void, o: { fill?: number; size?: number; icon?: string; page?: Page } = {}): Btn {
    const fill = o.fill ?? 0x2c3468;
    const bg = this.keep(this.add.rectangle(x, y, w, hgt, fill, 0.95).setOrigin(0).setStrokeStyle(2, 0x6a6fb0).setDepth(20));
    bg.setInteractive({ useHandCursor: true });
    const icon = o.icon ? this.keep(this.add.image(x + hgt / 2, y + hgt / 2, o.icon).setDisplaySize(hgt - 14, hgt - 14).setDepth(21)) : undefined;
    const t = this.keep(this.add.text(icon ? x + hgt : x + w / 2, y + hgt / 2, label, txt(o.size ?? 18)).setOrigin(icon ? 0 : 0.5, 0.5).setDepth(21));
    t.setWordWrapWidth(icon ? w - hgt - 4 : w - 8);
    const b: Btn = { bg, t, icon, fill, enabled: true, shown: true };
    bg.on('pointerdown', () => {
      if (b.enabled && b.shown && bg.visible && !this.mini) onTap();
    });
    if (o.page) {
      this.pageBtns[o.page].push(b);
      this.pageObjs[o.page].push(bg, t, ...(icon ? [icon] : []));
    }
    return b;
  }

  private setBtn(b: Btn, enabled: boolean, selected = false): void {
    if (b.enabled !== enabled) {
      b.enabled = enabled;
      for (const o of [b.bg, b.t, b.icon]) o?.setAlpha(enabled ? 1 : 0.4);
    }
    b.bg.setStrokeStyle(selected ? 4 : 2, selected ? 0xffd23f : 0x6a6fb0);
  }

  private label(x: number, y: number, text: string, page: Page): void {
    this.pageObjs[page].push(this.keep(this.add.text(x, y, text, txt(16, '#a9a8d6', 3)).setDepth(21)));
  }

  private buildField(): void {
    const add = this.add;
    this.keep(add.rectangle(0, 0, 960, 52, 0x0d1020, 0.78).setOrigin(0).setDepth(10));
    this.keep(add.rectangle(PX - 10, 52, 960 - PX + 10, 488, 0x0d1020, 0.86).setOrigin(0).setDepth(10));
    this.codeT = this.keep(add.text(14, 40, '', txt(17)).setOrigin(0, 0.5).setDepth(11)); // y 40: netmeter sits at the top-left
    this.timerT = this.keep(add.text(390, 26, '', txt(24, '#ffd23f', 5)).setOrigin(0.5).setDepth(11));
    this.scoreT = this.keep(add.text(PX - 30, 26, '', txt(18, '#c9c8f0')).setOrigin(1, 0.5).setDepth(11));
    this.bookBtn = this.btn(PX, 6, 120, 40, '📘 Kitapçık', () => (this.manualOpen = true), { size: 16 });

    // heart, status and severity bar stay above the minigame dim (depth 50) so CPR/bası never hides them
    this.heart = this.keep(add.image(40, 86, TEX.heart).setDisplaySize(52, 52).setDepth(55));
    this.statusT = this.keep(add.text(72, 76, '', txt(22)).setDepth(55));
    this.sevG = this.keep(add.graphics().setDepth(55));
    this.patientT = this.keep(add.text(72, 100, '', txt(15, '#c9c8f0', 3)).setDepth(12));
    for (let i = 0; i < 6; i++) {
      this.signs.push({
        img: this.keep(add.image(0, 0, TEX.sign('terleme')).setDisplaySize(44, 44).setDepth(12)),
        t: this.keep(add.text(0, 0, '', txt(15, '#f4f1ff', 3)).setOrigin(0.5, 0).setDepth(12).setAlign('center')),
      });
    }
    this.patient = this.keep(add.image(PATIENT.x, PATIENT.y, TEX.patient('yetiskin')).setScale(PS / RES).setDepth(5));
    this.chest = this.keep(add.image(PATIENT.x + 10, PATIENT.y - 10, TEX.chest('yetiskin')).setScale(PS / RES).setDepth(6));
    this.mask = this.keep(add.image(PATIENT.x - 120, PATIENT.y - 14, TEX.mask).setScale(PS / RES).setDepth(7));
    this.wound = this.keep(add.image(PATIENT.x + 100, PATIENT.y + 30, TEX.wound).setScale(PS / RES).setDepth(7));
    this.tagsT = this.keep(add.text(PATIENT.x, PATIENT.y + 82, '', txt(15, '#c9c8f0', 3)).setOrigin(0.5).setDepth(8));
    this.sayBg = this.keep(add.image(PATIENT.x, 222, TEX.bubble).setDisplaySize(360, 62).setDepth(14));
    this.sayT = this.keep(add.text(PATIENT.x, 222, '', txt(17, '#1b2140', 0)).setOrigin(0.5).setDepth(15).setWordWrapWidth(330).setAlign('center'));
    this.teyze = this.keep(add.image(536, 470, TEX.teyze).setScale(1.2 / RES).setDepth(8));
    this.teyzeBg = this.keep(add.image(360, 500, TEX.bubble).setDisplaySize(260, 56).setDepth(14));
    this.teyzeT = this.keep(add.text(360, 500, '', txt(16, '#1b2140', 0)).setOrigin(0.5).setDepth(15).setWordWrapWidth(240).setAlign('center'));

    // monitor + readings
    this.keep(add.image(PX - 4, 58, TEX.monitor).setOrigin(0).setDisplaySize(240, 126).setDepth(11));
    this.monitorG = this.keep(add.graphics().setDepth(12));
    this.hrT = this.keep(add.text(PX + 8, 66, '', txt(28, '#4be37a')).setDepth(13));
    this.spo2T = this.keep(add.text(PX + 120, 66, '', txt(28, '#3fd8ff')).setDepth(13));
    this.monHint = this.keep(add.text(PX + 116, 110, '', txt(15, '#a9a8d6', 3)).setOrigin(0.5).setDepth(13).setAlign('center'));
    TOOLS.filter((t) => t !== 'pulseox').forEach((t, i) => {
      const r = this.keep(add.text(PX + 242, 64 + i * 30, '', txt(17)).setDepth(13));
      if (t === 'stetoskop') {
        r.setInteractive({ useHandCursor: true });
        r.on('pointerdown', () => {
          const v = this.loop.state?.cur?.readings.stetoskop?.v;
          if (v && !this.mini) playSfx(`steto_${v as LungSound}`);
        });
      }
      this.readT[t] = r;
    });

    // dock tabs
    PAGES.forEach(([id, label], i) => {
      this.tabBtns.push(this.btn(PX + i * 89, 186, 85, 52, label, () => {
        this.page = id;
        playSfx('ui_tik');
      }, { size: 20 }));
    });
    this.busyG = this.keep(this.add.graphics().setDepth(22));

    // Ölç
    TOOLS.forEach((t, i) => {
      const b: Btn = this.btn(PX + (i % 2) * 180, 250 + Math.floor(i / 2) * 64, 174, 58, LABELS.tool[t], () => this.timedSend({ k: 'olc', t }, b),
        { icon: TEX.tool(t), page: 'olc', size: 17 });
      this.timed.push(b);
    });
    // Sor
    TOPICS.forEach((q, i) => {
      this.askBtns.push(this.btn(PX + (i % 2) * 180, 250 + Math.floor(i / 2) * 62, 174, 56, LABELS.topic[q], () => {
        this.lastAsked = q;
        this.send({ k: 'sor', q });
      }, { page: 'sor' }));
    });
    this.answerT = this.keep(this.add.text(PX, 440, '', txt(17)).setDepth(21).setWordWrapWidth(PW));
    this.pageObjs.sor.push(this.answerT);
    // Müdahale
    this.label(PX, 246, 'Triyaj rengi', 'mud');
    (['yesil', 'sari', 'kirmizi'] as TriageColor[]).forEach((c, i) => {
      const b: Btn = this.btn(PX + i * 120, 268, 114, 56, LABELS.triage[c], () => this.timedSend({ k: 'triyaj', c }, b),
        { fill: hexN(TRIAGE_CSS[c]) & 0x7f7f7f, page: 'mud' });
      this.timed.push(b);
    });
    [1, 2, 3, 4].forEach((n, i) => {
      const b: Btn = this.btn(PX + i * 90, 332, 84, 56, `O₂ ${n}`, () => this.timedSend({ k: 'o2', n }, b), { page: 'mud' });
      this.timed.push(b);
    });
    (['bacak', 'otur', 'yan'] as PoseId[]).forEach((p, i) => {
      const b: Btn = this.btn(PX + i * 120, 396, 114, 56, LABELS.pose[p], () => this.timedSend({ k: 'poz', p }, b), { page: 'mud', size: 16 });
      this.timed.push(b);
    });
    this.btn(PX, 462, 174, 60, 'Kanamaya bas', () => this.startMini('basinc'), { page: 'mud', size: 19, fill: 0x7a2a3a });
    this.btn(PX + 180, 462, 174, 60, 'CPR', () => this.startMini('cpr'), { page: 'mud', size: 22, fill: 0x7a2a3a });
    // Teslim lives apart from the dock (bottom-left), so it is never a mis-tap next to CPR
    this.teslimBtn = this.btn(14, 474, 200, 56, 'Teslim et', () => this.send({ k: 'teslim' }), { size: 20, fill: 0x22964a });
    this.readyT = this.keep(this.add.text(14, 448, '', txt(18, '#4be37a', 4)).setOrigin(0, 0.5).setDepth(21));
    // İlaç
    this.label(PX, 244, 'Ampul seç (meşgulken de seçilir)', 'ilac');
    COLORS.forEach((c, i) => {
      const b = this.btn(PX + i * 72, 266, 66, 66, '', () => {
        this.pick.c = c;
        playSfx('ui_tik');
      }, { page: 'ilac', icon: TEX.ampul(c) });
      b.icon!.setPosition(b.bg.x + 33, b.bg.y + 33).setDisplaySize(52, 52);
      this.ampulBtns.push(b);
    });
    this.label(PX, 336, 'Doz', 'ilac');
    [1, 2, 3].forEach((n, i) => {
      const b = this.btn(PX + i * 120, 358, 114, 56, `${n} tık`, () => {
        this.pick.n = n;
        playSfx('ui_tik');
      }, { page: 'ilac', size: 20 });
      this.tikBtns.push(b);
    });
    const give: Btn = this.btn(PX, 422, PW, 60, 'Uygula', () => {
      if (!this.pick.c || !this.pick.n) return this.float('Önce ampul ve doz seç', '#ffd23f');
      this.timedSend({ k: 'ilac', c: this.pick.c, n: this.pick.n }, give);
      this.pick = { c: null, n: 0 };
    }, { page: 'ilac', fill: 0x22964a, size: 22 });
    this.timed.push(give);
    this.pickT = this.keep(this.add.text(PX + PW / 2, 502, '', txt(17)).setOrigin(0.5).setDepth(21));
    this.pageObjs.ilac.push(this.pickT);
  }

  private drawField(s: PmState, me: PmPlayer, time: number): void {
    const c = s.cur!;
    const v = c.vitals;
    const inCase = s.phase === 'case';
    this.codeT.setText(`${c.code} · Vaka ${s.caseIdx + 1}/${s.cases}`);
    this.timerT.setText(inCase ? `🚑 ${clock(c.eta - s.tick)}` : '');
    this.scoreT.setText(`Puan ${s.total}`);
    for (const o of [this.bookBtn.bg, this.bookBtn.t]) o.setVisible(me.tabs.length > 0);
    this.bookBtn.shown = me.tabs.length > 0;

    // heart = deterioration indicator (status color, pulses with the beep; blinks in arrest)
    this.heart.setTint(STATUS_COLOR[c.status]);
    const base = 52 / this.heart.width;
    this.heart.setScale(Math.max(base, this.heart.scaleX + (base - this.heart.scaleX) * 0.15));
    this.heart.setAlpha(c.status === 'arrest' ? 0.5 + 0.5 * Math.abs(Math.sin(time / 150)) : 1);
    const trend = c.status === 'arrest' || c.status === 'kayip' ? '' : c.rate > 0 ? ' ↑' : c.rate < 0 ? ' ↓' : '';
    this.statusT.setText(LABELS.status[c.status] + trend).setColor(cssColor(STATUS_COLOR[c.status]));
    // severity bar: green → yellow at kritik (60) → red at arrest (85); the white tick is the patient right now
    const sx = 190;
    const sw = 150;
    const sg = this.sevG.clear();
    sg.fillStyle(0x0d1020, 0.8).fillRect(sx - 2, 82, sw + 4, 10);
    sg.fillStyle(0x4be37a, 0.85).fillRect(sx, 84, (sw * B.critSev) / 100, 6);
    sg.fillStyle(0xffd23f, 0.85).fillRect(sx + (sw * B.critSev) / 100, 84, (sw * (B.arrestSev - B.critSev)) / 100, 6);
    sg.fillStyle(0xff5a5a, 0.85).fillRect(sx + (sw * B.arrestSev) / 100, 84, (sw * (100 - B.arrestSev)) / 100, 6);
    sg.fillStyle(0xffffff, 1).fillRect(sx + (sw * Math.min(100, c.sev)) / 100 - 2, 79, 4, 16);
    this.patientT.setText(`${c.patient.name}, ${c.patient.age} yaş (${LABELS.age[c.patient.grp]})`);

    // signs (true + red herrings, as the sim shuffled them)
    const key = c.signs.join(',');
    if (key !== this.signKey) {
      this.signKey = key;
      const n = c.signs.length;
      const step = Math.min(96, 560 / Math.max(1, n));
      this.signs.forEach((g, i) => {
        const on = i < n;
        g.img.setData('on', on);
        g.t.setData('on', on);
        if (!on) return;
        const x = 290 - ((n - 1) * step) / 2 + i * step;
        g.img.setTexture(TEX.sign(c.signs[i])).setDisplaySize(44, 44).setPosition(x, 146);
        g.t.setText(LABELS.sign[c.signs[i]].replace(' ', '\n')).setPosition(x, 170).setWordWrapWidth(step - 4);
      });
    }
    for (const g of this.signs) {
      g.img.setVisible(!!g.img.getData('on'));
      g.t.setVisible(!!g.t.getData('on'));
    }

    // patient: breathing chest at the true RR (counting it is the "solunum" skill), mask/wound/pose tags
    this.patient.setTexture(TEX.patient(c.patient.grp));
    this.chest.setTexture(TEX.chest(c.patient.grp));
    const breath = v.rr > 0 ? Math.sin((time / 1000) * Math.PI * 2 * (v.rr / 60)) : 0;
    const grp = c.patient.grp;
    const k = grp === 'cocuk' ? 0.72 : 1;
    this.chest.setScale((PS * k) / RES, ((PS * k) / RES) * (1 + 0.12 * breath)).setPosition(onBody(grp, 150, 78).x, onBody(grp, 150, 78).y);
    this.patient.setScale(PS / RES);
    const head = onBody(grp, 40, 88);
    this.mask.setPosition(head.x, head.y).setScale((PS * k) / RES);
    const leg = onBody(grp, 250, 86);
    this.wound.setPosition(leg.x, leg.y);
    // what was physically done (even if unnecessary/wrong): latest mask setting and pose from the log
    const last = (pre: string) => [...c.log].reverse().find((e) => e.key.startsWith(pre) && e.r !== 'tekrar')?.key;
    const o2 = last('o2:');
    const pose = last('poz:');
    this.mask.setVisible(!!o2);
    this.wound.setVisible(c.signs.includes('kanama') && !c.done.includes('basinc'));
    this.tagsT.setText([o2 && actLabel(o2), pose && actLabel(pose), c.done.includes('basinc') && 'Kanama durdu'].filter(Boolean).join(' · '));
    const saying = inCase && c.say && s.tick - c.say.t < 6 * TICK;
    this.sayBg.setVisible(!!saying);
    this.sayT.setVisible(!!saying).setText(saying ? `“${c.say!.text}”` : '');
    const teyze = inCase && time > this.teyzeAt && time < this.teyzeAt + 6000;
    if (inCase && time > this.teyzeAt + 45000) {
      // she repeats herself, with a fresh tip; now and then one that happens to fit (the booklet still decides)
      this.teyzeAt = time;
      const fits = TEYZE_TIPS.filter((t) => t.good?.includes(c.tpl));
      const pool = fits.length && Math.random() < 0.35 ? fits : TEYZE_TIPS;
      this.teyzeText = pool[Math.floor(Math.random() * pool.length)].text;
    }
    if (teyze && this.once(`teyze:${s.caseIdx}:${Math.floor(this.teyzeAt)}`)) playSfx('mirilti', { pitch: 1.35, vol: 0.7 });
    this.teyzeBg.setVisible(teyze);
    this.teyzeT.setVisible(teyze).setText(`Komşu teyze: “${this.teyzeText || c.teyze}”`);

    // monitor: live HR/SpO₂ only once the pulse ox is on, ±3 flicker
    if (time > this.flick.at) {
      this.flick = { at: time + 450, hr: Math.round(Math.random() * 6 - 3), spo2: Math.round(Math.random() * 4 - 2) };
    }
    const g = this.monitorG.clear();
    const hr = v.hr > 0 ? Math.max(0, v.hr + this.flick.hr) : 0;
    this.hrT.setText(c.monitor ? `♥ ${hr || '---'}` : '').setVisible(true);
    this.spo2T.setText(c.monitor ? `SpO₂ ${Math.min(100, v.spo2 + this.flick.spo2)}` : '').setVisible(true);
    this.monHint.setText(c.monitor ? '' : 'Pulse oksimetre bağlı değil');
    if (c.monitor) {
      const x0 = PX + 6;
      const y0 = 148;
      g.lineStyle(2, 0x4be37a, 1).beginPath().moveTo(x0, y0);
      const beatsPerPx = hr / 60 / 70; // 70 px per second
      for (let x = 0; x <= 220; x += 2) {
        const ph = (((time / 1000) * hr) / 60 - x * beatsPerPx) % 1;
        const y = hr > 0 && ph > 0.1 && ph < 0.16 ? y0 - 26 * Math.sin(((ph - 0.1) / 0.06) * Math.PI) : y0;
        g.lineTo(x0 + x, y);
      }
      g.strokePath();
    }
    for (const t of TOOLS) {
      const r = c.readings[t];
      const o = this.readT[t];
      if (!o) continue;
      const fresh = r && s.tick - r.t < 30 * TICK;
      const val = !r ? '—' : t === 'stetoskop' ? (isMuted() ? LABELS.lung[r.v as LungSound] : '▶ dinle') : String(r.v);
      const name = { tansiyon: 'Tansiyon', glukometre: 'Şeker', solunum: 'Solunum', stetoskop: 'Steto', pulseox: '' }[t];
      o.setText(`${name} ${val}`).setAlpha(r ? (fresh ? 1 : 0.55) : 0.4);
    }

    // dock
    this.tabBtns.forEach((b, i) => this.setBtn(b, true, PAGES[i][0] === this.page));
    for (const [p, objs] of Object.entries(this.pageObjs) as [Page, Phaser.GameObjects.GameObject[]][]) {
      for (const o of objs) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(p === this.page);
      for (const b of this.pageBtns[p]) b.shown = p === this.page;
    }
    const busy = inCase && s.tick < s.busyUntil;
    if (s.busyUntil !== this.busyFrom.until) this.busyFrom = { until: s.busyUntil, from: s.tick };
    for (const b of Object.values(this.pageBtns).flat()) this.setBtn(b, inCase, b === this.queued?.b);
    this.ampulBtns.forEach((b, i) => this.setBtn(b, inCase, this.pick.c === COLORS[i]));
    this.tikBtns.forEach((b, i) => this.setBtn(b, inCase, this.pick.n === i + 1));
    // ready to hand over: the Teslim button pulses and says so (auto handover after a few seconds)
    const ready = canHandOver(s);
    this.setBtn(this.teslimBtn, inCase);
    this.teslimBtn.t.setText(ready ? '✓ Teslim et!' : 'Teslim et');
    if (inCase) for (const o of [this.teslimBtn.bg, this.teslimBtn.t]) o.setAlpha(ready ? 1 : 0.6);
    if (ready) this.teslimBtn.bg.setStrokeStyle(5, 0x4be37a, 0.5 + 0.5 * Math.abs(Math.sin(time / 180)));
    const autoSec = c.okAt ? Math.max(0, Math.ceil((c.okAt + B.autoTeslimTicks - s.tick) / TICK)) : B.autoTeslimTicks / TICK;
    this.readyT.setText(ready ? `Hasta stabil! Teslim et (${autoSec} sn sonra otomatik)` : '');
    this.askBtns.forEach((b, i) => b.t.setText(`${c.asked.includes(TOPICS[i]) ? '✓ ' : ''}${LABELS.topic[TOPICS[i]]}`));
    const asked = this.lastAsked && c.asked.includes(this.lastAsked) ? this.lastAsked : c.asked[c.asked.length - 1];
    this.answerT.setText(asked ? `${LABELS.topic[asked]}: “${c.history[asked]}”` : 'Hastaya ya da yakınına sor (SAMPLE).');
    this.pickT.setText(this.pick.c || this.pick.n
      ? `Seçim: ${this.pick.c ? LABELS.color[this.pick.c] + ' ampul' : '?'} · ${this.pick.n ? this.pick.n + ' tık' : '?'}` : '');
    if (this.pick.c) this.pickT.setColor(AMPUL_CSS[this.pick.c]);
    this.busyG.clear();
    if (busy) {
      const k = Math.min(1, (s.tick - this.busyFrom.from) / Math.max(1, this.busyFrom.until - this.busyFrom.from));
      this.busyG.fillStyle(0x0d1020, 0.9).fillRect(PX, 241, PW, 6).fillStyle(0xffd23f, 1).fillRect(PX, 241, PW * k, 6);
      const b = this.busyBtn;
      if (b?.shown) {
        const { x, y, width: w, height: hh } = b.bg;
        this.busyG.fillStyle(0x0d1020, 0.6).fillRect(x, y + hh - 8, w, 8).fillStyle(0xffd23f, 1).fillRect(x, y + hh - 8, w * k, 8);
      }
    }
  }

  // ---------------------------------------------------------------- minigames (local, quality → sim)
  private buildMini(): void {
    const dim = this.add.rectangle(0, 0, 960, 540, 0x0d1020, 0.82).setOrigin(0).setDepth(50).setInteractive();
    dim.on('pointerdown', () => this.miniDown());
    dim.on('pointerup', () => this.miniUp());
    dim.on('pointerout', () => this.miniUp());
    this.miniImg = this.add.image(400, 290, TEX.cprHands).setDepth(51);
    this.miniT = this.add.text(400, 110, '', txt(40, '#ffd23f', 6)).setOrigin(0.5).setDepth(51);
    this.miniHint = this.add.text(400, 440, '', txt(18, '#c9c8f0')).setOrigin(0.5).setDepth(51).setAlign('center').setWordWrapWidth(520);
    this.miniG = this.add.graphics().setDepth(52);
    const xb = this.add.rectangle(16, 466, 160, 60, 0x2c3468, 0.95).setOrigin(0).setStrokeStyle(2, 0x6a6fb0).setDepth(53).setInteractive({ useHandCursor: true });
    const xt = this.add.text(96, 496, '✕ Vazgeç', txt(20)).setOrigin(0.5).setDepth(54);
    xb.on('pointerdown', () => this.endMini());
    this.miniObjs = [dim, this.miniImg, this.miniT, this.miniHint, this.miniG, xb, xt];
    for (const o of this.miniObjs) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(false);
  }

  private startMini(k: 'cpr' | 'basinc'): void {
    if (this.mini) return;
    playSfx('ui_tik');
    this.mini = k === 'cpr' ? { k, taps: [] } : { k, level: 0, started: -1, inBand: 0, held: false };
    for (const o of this.miniObjs) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(true);
    this.miniImg.setTexture(k === 'cpr' ? TEX.cprHands : TEX.wound).setDisplaySize(k === 'cpr' ? 220 : 150, k === 'cpr' ? 165 : 150);
    this.miniHint.setText(k === 'cpr'
      ? 'Halkaya ritimle bas (ya da Boşluk). Tempo kitapçıkta (Ekler › Ritimler). 30 bası = 1 döngü.'
      : `Yaraya basılı tut (ya da Boşluk). Basıncı ${PRESS_SEC} sn yeşil bantta tut.`);
  }

  private endMini(): void {
    if (!this.mini) return;
    this.mini = null;
    for (const o of this.miniObjs) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(false);
  }

  private miniDown(): void {
    const m = this.mini;
    if (!m) return;
    if (m.k === 'basinc') {
      m.held = true;
      if (m.started < 0) m.started = this.time.now;
      return;
    }
    m.taps.push(this.time.now);
    playSfx('cpr_tik');
    this.miniImg.setScale(this.miniImg.scaleX, this.miniImg.scaleY * 0.85);
    if (m.taps.length < CPR_TAPS) return;
    const q = cprQuality(m.taps, this.loop.state!.rules.cprRate);
    this.send({ k: 'cpr', q }, null);
    playSfx('nefes');
    this.endMini();
    this.float(`CPR döngüsü · ritim %${Math.round(q * 100)}`, q >= 0.5 ? '#4be37a' : '#ff6b6b');
  }

  private miniUp(): void {
    if (this.mini?.k === 'basinc') this.mini.held = false;
  }

  private updateMini(delta: number): void {
    const m = this.mini;
    if (!m) return;
    const dt = delta / 1000;
    const g = this.miniG.clear();
    if (m.k === 'cpr') {
      const fullY = 165 / this.miniImg.height;
      this.miniImg.setScale(220 / this.miniImg.width, Math.min(fullY, this.miniImg.scaleY + (fullY - this.miniImg.scaleY) * 0.3));
      this.miniT.setText(`${m.taps.length}/${CPR_TAPS}`);
      // tap target ring: flashes outward on every press (feedback, not a metronome)
      const since = m.taps.length ? this.time.now - m.taps[m.taps.length - 1] : 1e9;
      const pop = Math.max(0, 1 - since / 220);
      g.lineStyle(6, 0xffd23f, 0.5 + 0.5 * pop).strokeCircle(400, 290, 125 + 22 * pop);
      g.lineStyle(2, 0xffd23f, 0.35).strokeCircle(400, 290, 105);
      return;
    }
    // bleeding pressure: hold raises, release lowers, a little hand tremor; quality = time inside the band
    m.level = Math.max(0, Math.min(1, m.level + (m.held ? 0.55 : -0.45) * dt + (Math.random() - 0.5) * 0.04));
    if (m.started >= 0 && m.level >= BAND[0] && m.level <= BAND[1]) m.inBand += dt;
    const left = m.started < 0 ? PRESS_SEC : PRESS_SEC - (this.time.now - m.started) / 1000;
    this.miniT.setText(m.started < 0 ? 'Bas!' : `${Math.max(0, left).toFixed(1)} sn`);
    const bx = 640;
    const by = 170;
    const bh = 240;
    g.fillStyle(0x161a36, 1).fillRect(bx, by, 44, bh);
    g.fillStyle(0x4be37a, 0.45).fillRect(bx, by + bh * (1 - BAND[1]), 44, bh * (BAND[1] - BAND[0]));
    g.fillStyle(m.level > BAND[1] ? 0xff5a5a : 0xffd23f, 1).fillRect(bx + 8, by + bh * (1 - m.level), 28, bh * m.level);
    g.lineStyle(3, 0x6a6fb0, 1).strokeRect(bx, by, 44, bh);
    if (m.started >= 0 && left <= 0) {
      const q = Math.round(Math.min(1, m.inBand / PRESS_SEC) * 100) / 100;
      this.send({ k: 'basinc', q }, null);
      this.endMini();
      this.float(`Bası kalitesi %${Math.round(q * 100)}`, q >= 0.5 ? '#4be37a' : '#ff6b6b');
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const s = this.loop.state;
    if (!s) return;
    if (e.code === 'Enter' && (s.phase === 'intro' || s.phase === 'result') && !s.ready.includes(this.loop.selfId)) {
      this.send({ k: 'hazir' });
      return;
    }
    if (this.me(s)?.role !== 'sp') return;
    if (this.mini) {
      if (e.code === 'Escape') this.endMini();
      if (e.code === 'Space' && !e.repeat) this.miniDown();
      e.preventDefault();
      return;
    }
    const n = Number(e.key);
    if (n >= 1 && n <= 4) this.page = PAGES[n - 1][0];
    if (e.code === 'KeyM' && this.me(s)!.tabs.length) this.manualOpen = !this.manualOpen;
  }

  // ---------------------------------------------------------------- end of shift
  private showEnd(s: PmState): void {
    const avg = s.results.length ? s.total / s.results.length : 0;
    const rank = avg >= 100 ? 'Efsane Ekip' : avg >= 80 ? 'Kıdemli' : avg >= 60 ? 'Paramedik' : avg >= 30 ? 'ATT' : 'Stajyer';
    this.closeEnd = showEndCard({
      title: `Vardiya bitti · ${s.total} puan`,
      lines: [
        ...s.results.map((r) => `${r.code} ${tplById(r.tpl).name}: ${LABELS.outcome[r.outcome]} · ${r.score}`),
        `Rütbe: ${rank}`,
      ],
      isHost: this.session.isHost,
      onRestart: () => this.session.startGame(startPayload(this.session, this.payload.mode)),
      onMenu: () => this.toMenu(),
    });
    if (this.session.isHost && !this.recorded) {
      this.recorded = true;
      void this.record(s, avg);
    }
  }

  /** Host-only, once per shift. Co-op: everyone wins when the shift averages a critical handover or better. */
  private async record(s: PmState, avg: number): Promise<void> {
    const names = s.players.map((p) => p.name);
    try {
      await recordMatch({
        game: 'paramedik',
        mode: s.mode,
        players: names,
        winners: avg >= 60 ? names : [],
        stats: { total: s.total, cases: s.results.map((r) => ({ tpl: r.tpl, outcome: r.outcome, score: r.score })) },
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
