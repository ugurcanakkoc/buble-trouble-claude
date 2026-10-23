import Phaser from 'phaser';
import { MAX_COMBO } from '../../sim/balls';
import { matchSummary, matchWinners, mvpOf, totalPops } from '../../sim/stats';
import { PLAYER_H, TICK_RATE, WORLD_H, WORLD_W, getLevel, type Ball, type GameState, type InputState, type Phase, type SimEvent } from '../../sim';
import { bubbleLoopOptions, bubbleSim } from '../../games/bubble/sim';
import { recordMatch, submitScore, type RoomSession, type StartPayload } from '../../net';
import { sfx } from '../audio';
import { cssColor, h, toast } from '../dom';
import { showEndCard } from '../endcard';
import { mountNetMeter } from '../netmeter';
import { Smoother } from '../render/smooth';
import { Hud } from '../hud';
import { createControls } from '../input';
import { loadScores } from '../leaderboard';
import { GameLoop, startPayload } from '../loop';
import { BlockRenderer } from '../render/blocks';
import { EntityRenderer } from '../render/entities';
import { Fx } from '../render/fx';
import { ProjectileRenderer } from '../render/projectiles';
import { GodRenderer } from '../render/god';
import { FONT, RES, bgTexture } from '../textures';
import { clock } from '../hud';

export class GameScene extends Phaser.Scene {
  private session!: RoomSession;
  private loop!: GameLoop<GameState, InputState, SimEvent>;
  private smooth = new Smoother();
  private controls!: ReturnType<typeof createControls>;
  private bg!: Phaser.GameObjects.Image;
  private bgSides: Phaser.GameObjects.Image[] = [];
  private blocks!: BlockRenderer;
  private shots!: ProjectileRenderer;
  private entities!: EntityRenderer;
  private fx!: Fx;
  private hud!: Hud;
  private godView!: GodRenderer;
  private roundWinner: 'god' | 'fighters' = 'fighters';
  private banner!: Phaser.GameObjects.Text;
  private bannerSub!: Phaser.GameObjects.Text;
  private lastPhase: Phase | null = null;
  private lastLevel = -1;
  private lastBalls: Ball[] = [];
  private lifeLost: 'hit' | 'timeout' = 'hit';
  private endCard: (() => void) | null = null;
  private leader = '';
  private tickSec = -1;
  private bonusShown = 0;

  constructor() {
    super('Game');
  }

  create({ session, payload }: { session: RoomSession; payload: StartPayload }): void {
    this.session = session;
    this.lastPhase = null;
    this.lastLevel = -1;
    this.lastBalls = [];
    this.endCard = null;
    this.leader = '';
    this.tickSec = -1;
    this.bonusShown = 0;

    this.bg = this.add.image(0, 0, bgTexture(this, payload.levelIndex ?? 0)).setOrigin(0).setScale(1 / RES).setDepth(0);
    this.fillScreen();
    this.blocks = new BlockRenderer(this);
    this.shots = new ProjectileRenderer(this);
    this.entities = new EntityRenderer(this);
    this.godView = new GodRenderer(this);
    this.fx = new Fx(this);
    this.hud = new Hud(this);
    const style = (size: number, color: string) => ({
      fontFamily: FONT, fontSize: `${size}px`, fontStyle: '700', color, stroke: '#0d1020', strokeThickness: 8,
      resolution: 2, align: 'center',
    });
    this.banner = this.add.text(WORLD_W / 2, WORLD_H / 2 - 20, '', style(64, '#ffd23f')).setOrigin(0.5).setDepth(20);
    this.bannerSub = this.add.text(WORLD_W / 2, WORLD_H / 2 + 36, '', style(28, '#f4f1ff')).setOrigin(0.5).setDepth(20);

    this.controls = createControls();
    this.smooth.clear();
    this.loop = new GameLoop(session, bubbleSim, {
      ...bubbleLoopOptions(session.self.id, this.smooth),
      onHostLeft: () => {
        toast('Oda kurucusu ayrıldı');
        this.toMenu();
      },
    });
    this.loop.start(payload);
    mountNetMeter(this, this.loop, session);

    this.events.once('shutdown', () => {
      this.loop.dispose();
      this.controls.destroy();
      this.endCard?.();
    });
  }

  /**
   * Phones are wider than 16:9: switch the scale manager to EXPAND while this scene runs so the canvas
   * fills the screen, keep the 960×540 play area centred at full height, and fill the extra side room
   * with a mirrored, dimmed copy of the level art (touch buttons float over it). Back to FIT on exit,
   * because the other scenes are laid out for a fixed 960×540.
   */
  private fillScreen(): void {
    const sm = this.scale;
    // displaySize keeps the aspect lock set at boot for FIT; EXPAND needs it off (0 = Size.NONE)
    sm.scaleMode = Phaser.Scale.EXPAND;
    sm.displaySize.setAspectMode(0);
    sm.refresh();
    const left = this.add.image(0, 0, this.bg.texture.key).setOrigin(1, 0).setScale(1 / RES).setFlipX(true);
    const right = this.add.image(WORLD_W, 0, this.bg.texture.key).setOrigin(0, 0).setScale(1 / RES).setFlipX(true);
    this.bgSides = [left, right];
    const shade = this.add.graphics().setDepth(0.5);
    shade.fillStyle(0x0d1020, 0.45).fillRect(-WORLD_W, 0, WORLD_W, WORLD_H).fillRect(WORLD_W, 0, WORLD_W, WORLD_H);
    shade.fillStyle(0x12162e, 1).fillRect(-WORLD_W, WORLD_H, WORLD_W * 3, 540 - WORLD_H); // HUD strip runs edge to edge
    shade.fillStyle(0xffffff, 0.25).fillRect(-3, 0, 3, WORLD_H).fillRect(WORLD_W, 0, 3, WORLD_H); // side walls
    for (const m of this.bgSides) m.setDepth(0);
    const center = () => this.cameras.main.centerOn(WORLD_W / 2, 270);
    center();
    sm.on('resize', center);
    this.events.once('shutdown', () => {
      sm.off('resize', center);
      sm.scaleMode = Phaser.Scale.FIT;
      sm.displaySize.setAspectMode(Phaser.Scale.FIT);
      sm.setGameSize(960, 540);
      sm.refresh();
    });
  }

  update(time: number, delta: number): void {
    this.loop.setLocalInput(this.controls.read());
    const events = this.loop.update(Math.min(delta, 250));
    const s = this.loop.state;
    if (!s) return;

    if (s.levelIndex !== this.lastLevel) {
      this.lastLevel = s.levelIndex;
      this.bg.setTexture(bgTexture(this, s.levelIndex));
      for (const m of this.bgSides) m.setTexture(this.bg.texture.key);
    }
    this.handleEvents(events, s);
    this.blocks.update(s.blocks);
    this.shots.update(s.projectiles, s.tick);
    this.smooth.decay(Math.min(delta, 250));
    this.entities.update(s, time, this.smooth, this.session.self.id);
    this.godView.update(s, time, this.smooth);
    this.hud.update(s, this.session.self.id);
    this.phaseOverlay(s);
    this.extras(s);
    this.lastBalls = s.balls.map((b) => ({ ...b }));
  }

  private handleEvents(events: SimEvent[], s: GameState): void {
    const player = (id: string) => s.players.find((p) => p.id === id);
    for (const e of events) {
      switch (e.type) {
        case 'shoot':
          if (e.kind === 'gun') sfx.gun();
          else sfx.shoot();
          break;
        case 'pop': {
          // the ball is gone from the state now; recover its color from last frame
          let best: Ball | undefined;
          let bestD = Infinity;
          for (const b of this.lastBalls) {
            const d = (b.x - e.x) ** 2 + (b.y - e.y) ** 2;
            if (b.size === e.size && d < bestD) [best, bestD] = [b, d];
          }
          sfx.pop(e.size);
          this.fx.pop(e.x, e.y, e.size, best?.color ?? 0xffffff, e.points);
          const p = player(e.playerId);
          if (p && e.combo === MAX_COMBO) this.fx.callout(`x${MAX_COMBO} KOMBO!`, p.color, 120, 56);
          if (p && e.combo >= 2) {
            sfx.combo(e.combo);
            this.fx.combo(p.x, p.y - PLAYER_H - 80, e.combo, p.color);
          }
          break;
        }
        case 'powerup':
          sfx.powerup(e.kind);
          break;
        case 'shieldBreak':
          sfx.shieldBreak();
          break;
        case 'trapped':
        case 'revive': {
          const p = player(e.playerId);
          if (e.type === 'trapped') sfx.trapped();
          else {
            sfx.revive();
            const by = player(e.by);
            if (p && by) this.fx.callout(`${by.name}, ${acc(p.name)} kurtardı!`, by.color, 180, 30);
          }
          if (p) this.fx.bubbles(p.x, p.y - PLAYER_H / 2);
          break;
        }
        case 'hit':
        case 'timeout':
          this.lifeLost = e.type;
          sfx.hit();
          this.fx.hit();
          break;
        case 'blockBreak':
          sfx.blockBreak();
          this.fx.blockBreak(e.x, e.y);
          break;
        case 'levelComplete':
          sfx.levelComplete();
          break;
        case 'godDrop':
          sfx.godDrop(e.size);
          break;
        case 'roundEnd': {
          this.roundWinner = e.winner;
          const iAmGod = s.god?.godId === this.session.self.id;
          if ((e.winner === 'god') === iAmGod) sfx.levelComplete();
          else sfx.boo();
          break;
        }
        case 'matchEnd':
          sfx.levelComplete();
          break;
        case 'gameOver':
          sfx.gameOver();
          if (this.session.isHost && s.mode === 'classic') {
            submitScore({ players: s.players.map((p) => p.name), level: s.levelIndex + 1, score: teamScore(s) }).catch(
              (err) => console.warn('submitScore failed', err),
            );
          }
          break;
      }
    }
  }

  private phaseOverlay(s: GameState): void {
    if (s.phase === this.lastPhase) return;
    this.lastPhase = s.phase;
    const set = (main: string, sub = '', color = '#ffd23f') => {
      this.banner.setText(main).setColor(color).setVisible(!!main);
      this.bannerSub.setText(sub).setVisible(!!sub);
      if (main) {
        this.banner.setScale(0.3);
        this.tweens.add({ targets: this.banner, scale: 1, duration: 380, ease: 'Back.easeOut' });
      }
    };
    this.endCard?.();
    this.endCard = null;
    switch (s.phase) {
      case 'ready':
        if (s.mode === 'god' && s.god) {
          const god = s.players.find((p) => p.id === s.god!.godId);
          set(`Raund ${s.god.round + 1}`, `Tanrı: ${god?.name ?? ''}`);
        } else if (s.mode === 'rain') set('Yağmur!', 'Hayatta kalın!', '#3fd8ff');
        else set(`Seviye ${s.levelIndex + 1}`, getLevel(s.levelIndex).name);
        break;
      case 'levelComplete':
        if (s.mode === 'god') set(this.roundWinner === 'god' ? 'Tanrı kazandı!' : 'Savaşçılar kazandı!', '', this.roundWinner === 'god' ? '#b06bff' : '#4be37a');
        else set(`Seviye ${s.levelIndex + 1} tamam!`, '', '#4be37a');
        break;
      case 'dying':
        set(this.lifeLost === 'timeout' ? 'Süre doldu!' : 'Hepiniz yakalandınız!', '', '#ff6b6b');
        break;
      case 'gameOver':
        set('');
        this.showEnd(s);
        break;
      default:
        set('');
    }
  }

  /** Per-frame extras: time bonus count-up, leader change, low-time ticking. */
  private extras(s: GameState): void {
    if (s.mode === 'classic' && s.phase === 'levelComplete' && s.timeBonus > 0) {
      const k = Math.min(1, (120 - (s.phaseUntil - s.tick)) / 80);
      const shown = Math.round((s.timeBonus * k) / 10) * 10;
      this.bannerSub.setText(`Süre bonusu +${shown}`).setVisible(true).setColor('#fff6a8');
      if (shown !== this.bonusShown) sfx.bonusTick();
      this.bonusShown = shown;
    } else this.bonusShown = 0;

    if (s.mode !== 'god' && s.phase === 'playing') {
      const top = [...s.players].sort((a, b) => b.score - a.score);
      const lead = top[0] && top[0].score > 0 && (top.length < 2 || top[0].score > top[1].score) ? top[0] : null;
      if (lead && this.leader && lead.id !== this.leader) this.fx.callout(`${lead.name} öne geçti!`, lead.color, 220, 28);
      if (lead) this.leader = lead.id;
    }
    if (s.mode !== 'rain' && s.phase === 'playing') {
      const sec = Math.ceil(s.timeLeftTicks / TICK_RATE);
      if (sec <= 10 && sec > 0 && sec !== this.tickSec) sfx.tick(sec <= 3);
      this.tickSec = sec;
    } else this.tickSec = -1;
  }

  private showEnd(s: GameState): void {
    const god = s.mode === 'god' && s.god ? s.god : null;
    const mvp = god ? null : mvpOf(s.players);
    const winnerNames = matchWinners(s);
    let title = 'Oyun Bitti';
    if (god) title = winnerNames.length !== 1 ? 'Berabere!' : 'Maç Bitti';
    else if (mvp) title = `${mvp.name} MVP!`;
    const head = god ? ['Oyuncu', 'Raund', 'Düşürülen', 'Yakalanan'] : ['Oyuncu', 'Skor', 'Patlatma', 'Kombo', 'Kurtarma'];
    const rows = [...s.players].sort((a, b) => (god ? (god.roundWins[b.id] ?? 0) - (god.roundWins[a.id] ?? 0) : b.score - a.score));
    const table = h('table', { class: 'final' },
      h('tr', {}, ...head.map((t) => h('th', { text: t }))),
      ...rows.map((p) => {
        const win = winnerNames.length === 1 && winnerNames[0] === p.name;
        const cells = god
          ? [`★ ${god.roundWins[p.id] ?? 0}`, String(p.stats.drops), String(p.stats.godTraps)]
          : [String(p.score), String(totalPops(p)), `x${p.stats.maxCombo}`, String(p.stats.revives)];
        return h('tr', { class: win ? 'win' : '' },
          h('td', { text: `${win ? '👑 ' : ''}${p.name}`, style: `color:${cssColor(p.color)}` }),
          ...cells.map((t) => h('td', { text: t })),
        );
      }),
    );
    let body: HTMLElement;
    if (god) body = table;
    else if (s.mode === 'rain') {
      body = h('div', { class: 'card-body' },
        h('div', { class: 'stats' },
          h('div', {}, h('b', { text: clock(s.timeLeftTicks) }), 'Hayatta kalma'),
          h('div', {}, h('b', { text: String(teamScore(s)) }), 'Takım skoru'),
        ),
        table,
      );
    } else {
      const top = h('div');
      // give the host's submit a moment so this game can show up in the list
      setTimeout(() => top.isConnected && loadScores(top, 3), 1200);
      body = h('div', { class: 'card-body' },
        h('div', { class: 'stats' },
          h('div', {}, h('b', { text: String(s.levelIndex + 1) }), 'Seviye'),
          h('div', {}, h('b', { text: String(teamScore(s)) }), 'Takım skoru'),
        ),
        table,
        top,
      );
    }
    if (this.session.isHost) {
      try {
        recordMatch({ game: 'bubble', mode: s.mode, ...matchSummary(s) }).catch((err) => console.warn('recordMatch failed', err));
      } catch (err) {
        console.warn('recordMatch failed', err);
      }
    }
    this.endCard = showEndCard({
      title,
      lines: [],
      body,
      isHost: this.session.isHost,
      // loop picks the restart up via onStart
      onRestart: () => this.session.startGame(startPayload(this.session, s.mode, 0)),
      onMenu: () => this.toMenu(),
    });
  }

  private toMenu(): void {
    void this.session.leave().catch(() => {});
    this.scene.start('Menu');
  }
}

const teamScore = (s: GameState) => s.players.reduce((n, p) => n + p.score, 0);

/** Turkish accusative with apostrophe ("Veli'yi", "Can'ı"), by last-vowel harmony. */
export function acc(name: string): string {
  const V = 'aıoueeiöü';
  const lower = name.toLowerCase();
  const v = [...lower].filter((c) => V.includes(c)).pop() ?? 'i';
  const suf = 'aı'.includes(v) ? 'ı' : 'ei'.includes(v) ? 'i' : 'ou'.includes(v) ? 'u' : 'ü';
  return `${name}'${V.includes(lower.slice(-1)) ? 'y' : ''}${suf}`;
}
