import Phaser from 'phaser';
import { PLAYER_H, WORLD_H, WORLD_W, createGame, getLevel, step, type Ball, type GameState, type Phase, type SimEvent } from '../../sim';
import { submitScore, type RoomSession, type StartPayload } from '../../net';
import { sfx } from '../audio';
import { h, mount, toast } from '../dom';
import { Hud } from '../hud';
import { createControls } from '../input';
import { loadScores } from '../leaderboard';
import { GameLoop, startPayload } from '../loop';
import { BlockRenderer } from '../render/blocks';
import { EntityRenderer } from '../render/entities';
import { Fx } from '../render/fx';
import { ProjectileRenderer } from '../render/projectiles';
import { FONT, RES, bgTexture } from '../textures';

export class GameScene extends Phaser.Scene {
  private session!: RoomSession;
  private loop!: GameLoop;
  private controls!: ReturnType<typeof createControls>;
  private bg!: Phaser.GameObjects.Image;
  private blocks!: BlockRenderer;
  private shots!: ProjectileRenderer;
  private entities!: EntityRenderer;
  private fx!: Fx;
  private hud!: Hud;
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

    this.bg = this.add.image(0, 0, bgTexture(this, payload.levelIndex)).setOrigin(0).setScale(1 / RES).setDepth(0);
    this.blocks = new BlockRenderer(this);
    this.shots = new ProjectileRenderer(this);
    this.entities = new EntityRenderer(this);
    this.fx = new Fx(this);
    this.hud = new Hud(this);
    const style = (size: number, color: string) => ({
      fontFamily: FONT, fontSize: `${size}px`, fontStyle: '700', color, stroke: '#0d1020', strokeThickness: 8,
      resolution: 2, align: 'center',
    });
    this.banner = this.add.text(WORLD_W / 2, WORLD_H / 2 - 20, '', style(64, '#ffd23f')).setOrigin(0.5).setDepth(20);
    this.bannerSub = this.add.text(WORLD_W / 2, WORLD_H / 2 + 36, '', style(28, '#f4f1ff')).setOrigin(0.5).setDepth(20);

    this.controls = createControls();
    this.loop = new GameLoop(session, { createGame, step }, () => {
      toast('Oda kurucusu ayrıldı');
      this.toMenu();
    });
    this.loop.start(payload);

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
    this.entities.update(s, time);
    this.hud.update(s);
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
        case 'gameOver':
          sfx.gameOver();
          if (this.session.isHost) {
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
        set(`Seviye ${s.levelIndex + 1}`, getLevel(s.levelIndex).name);
        break;
      case 'levelComplete':
        set('Tamamlandı!', '', '#4be37a');
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
    const again = h('button', { class: 'btn green big', text: 'Tekrar Oyna' });
    again.onclick = () => {
      again.disabled = true;
      this.session.startGame(startPayload(this.session)); // loop picks it up via onStart
    };
    const menu = h('button', { class: 'btn ghost', text: 'Menü' });
    menu.onclick = () => this.toMenu();
    const top = h('div');
    // give the host's submit a moment so this game can show up in the list
    setTimeout(() => top.isConnected && loadScores(top, 3), 1200);
    this.endCard = mount(
      h('div', { class: 'screen endcard' },
        h('div', { class: 'card' },
          h('h1', { class: 'title', text: 'Oyun Bitti' }),
          h('div', { class: 'stats' },
            h('div', {}, h('b', { text: String(s.levelIndex + 1) }), 'Seviye'),
            h('div', {}, h('b', { text: String(teamScore(s)) }), 'Takım skoru'),
          ),
          top,
          this.session.isHost ? again : h('div', { class: 'hint', text: 'Kurucu yeni oyunu başlatabilir…' }),
          menu,
        ),
      ),
    );
  }

  private toMenu(): void {
    void this.session.leave().catch(() => {});
    this.scene.start('Menu');
  }
}

const teamScore = (s: GameState) => s.players.reduce((n, p) => n + p.score, 0);
