import Phaser from 'phaser';
import { PLAYER_H, WORLD_H, WORLD_W, getLevel, type Ball, type GameState, type InputState, type Phase, type SimEvent } from '../../sim';
import { bubbleLoopOptions, bubbleSim } from '../../games/bubble/sim';
import { submitScore, type RoomSession, type StartPayload } from '../../net';
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

  constructor() {
    super('Game');
  }

  create({ session, payload }: { session: RoomSession; payload: StartPayload }): void {
    this.session = session;
    this.lastPhase = null;
    this.lastLevel = -1;
    this.lastBalls = [];
    this.endCard = null;

    this.bg = this.add.image(0, 0, bgTexture(this, payload.levelIndex ?? 0)).setOrigin(0).setScale(1 / RES).setDepth(0);
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

  update(time: number, delta: number): void {
    this.loop.setLocalInput(this.controls.read());
    const events = this.loop.update(Math.min(delta, 250));
    const s = this.loop.state;
    if (!s) return;

    if (s.levelIndex !== this.lastLevel) {
      this.lastLevel = s.levelIndex;
      this.bg.setTexture(bgTexture(this, s.levelIndex));
    }
    this.handleEvents(events, s);
    this.blocks.update(s.blocks);
    this.shots.update(s.projectiles, s.tick);
    this.smooth.decay(Math.min(delta, 250));
    this.entities.update(s, time, this.smooth, this.session.self.id);
    this.godView.update(s, time, this.smooth);
    this.hud.update(s, this.session.self.id);
    this.phaseOverlay(s);
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
          if (p && e.combo >= 2) {
            sfx.combo(e.combo);
            this.fx.combo(p.x, p.y - PLAYER_H - 80, e.combo, p.color);
          }
          break;
        }
        case 'powerup':
          sfx.powerup();
          break;
        case 'shieldBreak':
          sfx.shieldBreak();
          break;
        case 'trapped':
        case 'revive': {
          const p = player(e.playerId);
          if (e.type === 'trapped') sfx.trapped();
          else sfx.revive();
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
        else set('Tamamlandı!', '', '#4be37a');
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

  private showEnd(s: GameState): void {
    let title = 'Oyun Bitti';
    let body: HTMLElement;
    if (s.mode === 'god' && s.god) {
      const wins = s.god.roundWins;
      const rows = [...s.players].sort((a, b) => (wins[b.id] ?? 0) - (wins[a.id] ?? 0));
      const best = wins[rows[0]?.id] ?? 0;
      const winners = rows.filter((p) => (wins[p.id] ?? 0) === best).length;
      title = winners > 1 ? 'Berabere!' : 'Maç Bitti';
      body = h('table', { class: 'final' },
        ...rows.map((p) =>
          h('tr', { class: winners === 1 && (wins[p.id] ?? 0) === best ? 'win' : '' },
            h('td', { text: `${winners === 1 && (wins[p.id] ?? 0) === best ? '👑 ' : ''}${p.name}`, style: `color:${cssColor(p.color)}` }),
            h('td', { text: `★ ${wins[p.id] ?? 0}` }),
          ),
        ),
      );
    } else if (s.mode === 'rain') {
      body = h('div', { class: 'stats' },
        h('div', {}, h('b', { text: clock(s.timeLeftTicks) }), 'Hayatta kalma'),
        h('div', {}, h('b', { text: String(teamScore(s)) }), 'Takım skoru'),
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
        top,
      );
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
