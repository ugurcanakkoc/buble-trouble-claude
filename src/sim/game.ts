import type { GameMode, GameState, InputState, Player, PlayerId, PlayerInfo, SimEvent } from './types';
import { EMPTY_INPUT, TICK_RATE, newStats } from './types';
import { BALL_VX } from './balls';
import { resetFighters, setPhase, worldTick } from './fighters';
import { godStep, initGodMode } from './god';
import { DEFAULT_BALL_Y, getLevel } from './levels';
import { movePlayer, placePlayers } from './players';

export const START_LIVES = 5;
const READY_TICKS = Math.round(1.5 * TICK_RATE);
const DYING_TICKS = 2 * TICK_RATE;
const COMPLETE_TICKS = 2 * TICK_RATE;
export const BALL_COLORS = [0xe53935, 0x1e88e5, 0x43a047, 0xfdd835, 0x8e24aa, 0xfb8c00];

/** God mode needs ≥2 players (throws otherwise). */
export function createGame(seed: number, players: PlayerInfo[], levelIndex = 0, mode: GameMode = 'classic'): GameState {
  const s: GameState = {
    tick: 0, rng: seed | 0, levelIndex, phase: 'ready', phaseUntil: 0, timeLeftTicks: 0, lives: START_LIVES,
    freezeUntil: 0, nextId: 1, balls: [], projectiles: [], powerUps: [], blocks: [], mode, god: null, timeBonus: 0,
    players: players.map((p): Player => ({
      id: p.id, name: p.name, color: p.color, x: 0, y: 0, facing: 1, weapon: 'harpoon', shield: false, score: 0,
      invulnUntil: 0, connected: true, fireHeld: false, nextFireTick: 0, trapped: false, combo: 0, comboUntil: 0, stats: newStats(),
    })),
  };
  if (mode === 'classic') loadLevel(s, levelIndex, []);
  else initGodMode(s, []);
  return s;
}

/** (Re)start a level: everything but scores, lives and shields is reset. */
function loadLevel(s: GameState, index: number, events: SimEvent[]): void {
  const def = getLevel(index);
  const vx = BALL_VX * (def.speed ?? 1);
  s.levelIndex = index;
  s.blocks = def.blocks.map((b) => ({ id: s.nextId++, kind: b.kind, x: b.x, y: b.y, w: b.w, h: b.h, hp: b.kind === 'breakable' ? (b.hp ?? 1) : 0 }));
  s.balls = def.balls.map((b, i) => ({
    id: s.nextId++, x: b.x, y: b.y ?? DEFAULT_BALL_Y, vx: b.dir * vx, vy: 0, size: b.size, color: BALL_COLORS[(index + i) % BALL_COLORS.length],
  }));
  s.projectiles = [];
  s.powerUps = [];
  s.freezeUntil = 0;
  s.timeBonus = 0;
  s.timeLeftTicks = def.timeSeconds * TICK_RATE;
  resetFighters(s.players);
  placePlayers(s.players.filter((p) => p.connected));
  setPhase(s, 'ready', READY_TICKS);
  events.push({ type: 'levelStart', levelIndex: index });
}

export const TIME_BONUS_PER_SEC = 10;

/** Seconds left x 10 points, credited to every free (not trapped) player. */
function awardTimeBonus(s: GameState, active: Player[]): void {
  s.timeBonus = Math.floor(s.timeLeftTicks / TICK_RATE) * TIME_BONUS_PER_SEC;
  for (const p of active) if (!p.trapped) p.score += s.timeBonus;
}

function loseLife(s: GameState, event: SimEvent, events: SimEvent[]): void {
  s.lives--;
  events.push(event);
  setPhase(s, 'dying', DYING_TICKS);
}

/** Advance exactly one tick. Mutates state; returns the events of this tick. */
export function step(s: GameState, inputs: Record<PlayerId, InputState>): SimEvent[] {
  const events: SimEvent[] = [];
  s.tick++;
  const active = s.players.filter((p) => p.connected);
  const input = (p: Player) => inputs[p.id] ?? EMPTY_INPUT;

  if (s.mode !== 'classic') godStep(s, input, events);
  else classicStep(s, active, input, events);

  for (const p of active) p.fireHeld = input(p).fire;
  return events;
}

function classicStep(s: GameState, active: Player[], input: (p: Player) => InputState, events: SimEvent[]): void {
  const timeUp = s.phaseUntil > 0 && s.tick >= s.phaseUntil;
  switch (s.phase) {
    case 'ready':
      for (const p of active) movePlayer(p, input(p));
      if (timeUp) setPhase(s, 'playing');
      break;
    case 'playing': {
      const lastTrapped = worldTick(s, active, input, events);
      if (lastTrapped !== null) loseLife(s, { type: 'hit', playerId: lastTrapped }, events);
      else if (s.balls.length === 0) {
        awardTimeBonus(s, active);
        setPhase(s, 'levelComplete', COMPLETE_TICKS);
        events.push({ type: 'levelComplete', levelIndex: s.levelIndex });
      } else if (--s.timeLeftTicks <= 0) loseLife(s, { type: 'timeout' }, events);
      break;
    }
    case 'dying':
      if (!timeUp) break;
      if (s.lives <= 0) { setPhase(s, 'gameOver'); events.push({ type: 'gameOver' }); }
      else loadLevel(s, s.levelIndex, events);
      break;
    case 'levelComplete':
      if (timeUp) loadLevel(s, s.levelIndex + 1, events); // endless
      break;
  }
}
