import type { GameState, InputState, Phase, Player, PlayerId, PlayerInfo, SimEvent } from './types';
import { EMPTY_INPUT, TICK_RATE } from './types';
import { BALL_RADIUS, BALL_VX, moveBalls } from './balls';
import { circleHitsBox } from './geom';
import { DEFAULT_BALL_Y, getLevel } from './levels';
import { PLAYER_H, PLAYER_W, movePlayer, placePlayers } from './players';
import { updatePowerUps } from './powerups';
import { fire, updateProjectiles } from './weapons';

export const START_LIVES = 5;
const READY_TICKS = Math.round(1.5 * TICK_RATE);
const DYING_TICKS = 2 * TICK_RATE;
const COMPLETE_TICKS = 2 * TICK_RATE;
const SHIELD_INVULN_TICKS = TICK_RATE;
const REVIVE_INVULN_TICKS = Math.round(1.5 * TICK_RATE);
const HITBOX_INSET = 4; // forgiving player hitbox
const BALL_COLORS = [0xe53935, 0x1e88e5, 0x43a047, 0xfdd835, 0x8e24aa, 0xfb8c00];

export function createGame(seed: number, players: PlayerInfo[], levelIndex = 0): GameState {
  const s: GameState = {
    tick: 0, rng: seed | 0, levelIndex, phase: 'ready', phaseUntil: 0, timeLeftTicks: 0, lives: START_LIVES,
    freezeUntil: 0, nextId: 1, balls: [], projectiles: [], powerUps: [], blocks: [],
    players: players.map((p): Player => ({
      id: p.id, name: p.name, color: p.color, x: 0, y: 0, facing: 1, weapon: 'harpoon', shield: false, score: 0,
      invulnUntil: 0, connected: true, fireHeld: false, nextFireTick: 0, trapped: false, combo: 0, comboUntil: 0,
    })),
  };
  loadLevel(s, levelIndex, []);
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
  s.timeLeftTicks = def.timeSeconds * TICK_RATE;
  for (const p of s.players) {
    p.weapon = 'harpoon';
    p.invulnUntil = 0;
    p.nextFireTick = 0;
    p.trapped = false;
    p.combo = 0;
    p.comboUntil = 0;
  }
  placePlayers(s);
  setPhase(s, 'ready', READY_TICKS);
  events.push({ type: 'levelStart', levelIndex: index });
}

function setPhase(s: GameState, phase: Phase, ticks = 0): void {
  s.phase = phase;
  s.phaseUntil = ticks ? s.tick + ticks : 0;
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
  const timeUp = s.phaseUntil > 0 && s.tick >= s.phaseUntil;

  switch (s.phase) {
    case 'ready':
      for (const p of active) movePlayer(p, input(p));
      if (timeUp) setPhase(s, 'playing');
      break;
    case 'playing':
      playTick(s, active, input, events);
      break;
    case 'dying':
      if (!timeUp) break;
      if (s.lives <= 0) { setPhase(s, 'gameOver'); events.push({ type: 'gameOver' }); }
      else loadLevel(s, s.levelIndex, events);
      break;
    case 'levelComplete':
      if (timeUp) loadLevel(s, s.levelIndex + 1, events); // endless
      break;
  }

  for (const p of active) p.fireHeld = input(p).fire;
  return events;
}

const touchesBall = (s: GameState, p: Player) =>
  s.balls.some((b) =>
    circleHitsBox(b.x, b.y, BALL_RADIUS[b.size], p.x - PLAYER_W / 2 + HITBOX_INSET, p.y - PLAYER_H + HITBOX_INSET, PLAYER_W - 2 * HITBOX_INSET, PLAYER_H - HITBOX_INSET),
  );

function playTick(s: GameState, active: Player[], input: (p: Player) => InputState, events: SimEvent[]): void {
  const free = active.filter((p) => !p.trapped);
  for (const p of free) {
    movePlayer(p, input(p));
    fire(s, p, input(p), events);
  }
  // A free teammate touching a trapped player frees them.
  for (const t of active) {
    if (!t.trapped) continue;
    const by = free.find((p) => Math.abs(p.x - t.x) < PLAYER_W);
    if (!by) continue;
    t.trapped = false;
    t.invulnUntil = s.tick + REVIVE_INVULN_TICKS;
    events.push({ type: 'revive', playerId: t.id, by: by.id });
  }

  if (s.tick >= s.freezeUntil) moveBalls(s);
  updateProjectiles(s, events);
  updatePowerUps(s, events);

  let lastTrapped = '';
  for (const p of active) {
    if (p.trapped || s.tick < p.invulnUntil || !touchesBall(s, p)) continue;
    if (p.shield) {
      p.shield = false;
      p.invulnUntil = s.tick + SHIELD_INVULN_TICKS;
      events.push({ type: 'shieldBreak', playerId: p.id });
    } else {
      p.trapped = true;
      lastTrapped = p.id;
      events.push({ type: 'trapped', playerId: p.id });
    }
  }
  if (active.length > 0 && active.every((p) => p.trapped)) {
    loseLife(s, { type: 'hit', playerId: lastTrapped || active[active.length - 1].id }, events);
    return;
  }

  if (s.balls.length === 0) {
    setPhase(s, 'levelComplete', COMPLETE_TICKS);
    events.push({ type: 'levelComplete', levelIndex: s.levelIndex });
    return;
  }
  if (--s.timeLeftTicks <= 0) loseLife(s, { type: 'timeout' }, events);
}
