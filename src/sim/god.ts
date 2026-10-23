// God mode (players take turns as the ball-dropping god, one round each) and rain mode (co-op vs an AI god).
// Phases: 'ready' (round start) → 'playing' → god: 'levelComplete' = round-over pause → next round / 'gameOver';
// rain: all trapped → 'dying' → 'ready' (balls cleared) or 'gameOver'.
// god: levelIndex = round, timeLeftTicks = round time left. rain: timeLeftTicks = ticks survived, levelIndex = minutes.
import type { BallSize, GameState, InputState, Player, SimEvent } from './types';
import { EMPTY_INPUT, TICK_RATE, WORLD_W } from './types';
import { BALL_VX } from './balls';
import { resetFighters, setPhase, worldTick } from './fighters';
import { DT } from './geom';
import { GOD_BALANCE as B } from './godBalance';
import { movePlayer, placePlayers } from './players';
import { random } from './rng';

const ticks = (sec: number) => Math.round(sec * TICK_RATE);
const ROUND_TICKS = ticks(B.roundSec);
const SIZE_COLORS = [0xfdd835, 0x43a047, 0x1e88e5, 0xe53935];

export const fightersOf = (s: GameState) => s.players.filter((p) => p.connected && p.id !== s.god!.godId);
export const ballMass = (s: GameState) => s.balls.reduce((m, b) => m + 2 ** b.size, 0);
export const massCap = (s: GameState) => B.massCapBase + B.massCapPerFighter * fightersOf(s).length;

export function initGodMode(s: GameState, events: SimEvent[]): void {
  const god = s.mode === 'god';
  if (god && s.players.length < 2) throw new Error('god mode needs at least 2 players');
  const ids = s.players.map((p) => p.id);
  s.god = {
    godId: god ? ids[0] : '', x: WORLD_W / 2, mana: B.manaStart, charge: -1, chargeStart: 0, nextDropTick: 0, round: 0,
    roundEndsTick: 0, roundWins: god ? Object.fromEntries(ids.map((id) => [id, 0])) : {}, order: god ? ids : [],
    aiTargetX: WORLD_W / 2, aiTargetSize: 0,
  };
  s.levelIndex = 0;
  s.timeLeftTicks = 0;
  startRound(s, events);
}

/** Fresh arena: no blocks, no balls; fighters reset and spread. Rain keeps its survival clock. */
function startRound(s: GameState, events: SimEvent[]): void {
  const g = s.god!;
  if (s.mode === 'god') {
    g.godId = g.order[g.round];
    s.levelIndex = g.round;
    s.timeLeftTicks = ROUND_TICKS;
    g.roundEndsTick = s.tick + ticks(B.readySec) + ROUND_TICKS;
  } else if (g.roundEndsTick === 0) g.roundEndsTick = s.tick + ticks(B.readySec);
  s.blocks = [];
  s.balls = [];
  s.projectiles = [];
  s.powerUps = [];
  s.freezeUntil = 0;
  resetFighters(s.players);
  placePlayers(fightersOf(s));
  Object.assign(g, { x: WORLD_W / 2, mana: B.manaStart, charge: -1, chargeStart: 0, nextDropTick: 0 });
  setPhase(s, 'ready', ticks(B.readySec));
  events.push({ type: 'levelStart', levelIndex: s.levelIndex });
}

export function godStep(s: GameState, input: (p: Player) => InputState, events: SimEvent[]): void {
  const g = s.god!;
  const fighters = fightersOf(s);
  const timeUp = s.phaseUntil > 0 && s.tick >= s.phaseUntil;
  const godPlayer = s.players.find((p) => p.id === g.godId && p.connected);
  const godInput = () => (s.mode === 'rain' ? aiInput(s) : godPlayer ? input(godPlayer) : EMPTY_INPUT);

  switch (s.phase) {
    case 'ready':
      for (const p of fighters) movePlayer(p, input(p));
      moveCloud(s, godInput());
      if (timeUp) setPhase(s, 'playing');
      break;
    case 'playing': {
      godControl(s, godInput(), fighters.length, events);
      const lastTrapped = worldTick(s, fighters, input, events);
      if (s.mode === 'god') {
        if (lastTrapped !== null) endRound(s, 'god', fighters, events);
        else if (--s.timeLeftTicks <= 0) endRound(s, 'fighters', fighters, events);
      } else {
        s.timeLeftTicks++;
        s.levelIndex = Math.floor(s.timeLeftTicks / (60 * TICK_RATE));
        if (s.timeLeftTicks % TICK_RATE === 0) for (const p of fighters) if (!p.trapped) p.score += B.rainScorePerSec;
        if (lastTrapped !== null) {
          s.lives--;
          events.push({ type: 'hit', playerId: lastTrapped });
          setPhase(s, 'dying', ticks(B.rainDyingSec));
        }
      }
      break;
    }
    case 'dying': // rain only
      if (!timeUp) break;
      if (s.lives <= 0) { setPhase(s, 'gameOver'); events.push({ type: 'gameOver' }); }
      else startRound(s, events);
      break;
    case 'levelComplete': // god round-over pause
      if (!timeUp) break;
      if (g.round + 1 < g.order.length) { g.round++; startRound(s, events); }
      else {
        setPhase(s, 'gameOver');
        events.push({ type: 'matchEnd', roundWins: { ...g.roundWins } });
      }
      break;
  }
}

function endRound(s: GameState, winner: 'god' | 'fighters', fighters: Player[], events: SimEvent[]): void {
  const g = s.god!;
  if (winner === 'god') g.roundWins[g.godId] = (g.roundWins[g.godId] ?? 0) + 1;
  else for (const p of fighters) g.roundWins[p.id] = (g.roundWins[p.id] ?? 0) + 1;
  events.push({ type: 'roundEnd', winner, round: g.round });
  setPhase(s, 'levelComplete', ticks(B.roundOverSec));
}

function moveCloud(s: GameState, inp: InputState): void {
  const g = s.god!;
  const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  g.x = Math.max(B.cloudMargin, Math.min(WORLD_W - B.cloudMargin, g.x + dir * B.cloudSpeed * DT));
}

const maxAffordable = (mana: number) => {
  let size = 3;
  while (size > 0 && B.cost[size] > mana) size--;
  return size;
};

export function canDrop(s: GameState, size: number): boolean {
  const g = s.god!;
  return s.tick >= g.nextDropTick && g.mana >= B.cost[size] && ballMass(s) + 2 ** size <= massCap(s);
}

/** Cloud movement, mana regen, charge while fire is held, drop on release. */
function godControl(s: GameState, inp: InputState, fighters: number, events: SimEvent[]): void {
  const g = s.god!;
  moveCloud(s, inp);
  const ramp = s.mode === 'god'
    ? 1 + (B.rampMax - 1) * (1 - s.timeLeftTicks / ROUND_TICKS)
    : 1 + (B.rainRampPerMin * s.timeLeftTicks) / (60 * TICK_RATE);
  const factor = B.fighterFactor[Math.min(fighters, B.fighterFactor.length - 1)];
  g.mana = Math.min(B.manaCap, g.mana + B.manaRegen * factor * ramp * DT);

  if (inp.fire) {
    if (g.charge < 0) { g.charge = 0; g.chargeStart = s.tick; }
    g.charge = Math.min(3, maxAffordable(g.mana), Math.floor((s.tick - g.chargeStart) / ticks(B.chargeStepSec)));
  } else if (g.charge >= 0) {
    const size = g.charge as BallSize;
    g.charge = -1;
    if (!canDrop(s, size)) return; // refused: nothing spent
    g.mana -= B.cost[size];
    g.nextDropTick = s.tick + ticks(B.cooldownSec);
    const dir = random(s) < 0.5 ? -1 : 1;
    s.balls.push({ id: s.nextId++, x: g.x, y: B.cloudY, vx: dir * BALL_VX, vy: 0, size, color: SIZE_COLORS[size] });
    events.push({ type: 'godDrop', x: g.x, size });
  }
}

/** Rain AI: drift to random spots, save for a random size, charge it, release. */
function aiInput(s: GameState): InputState {
  const g = s.god!;
  if (Math.abs(g.x - g.aiTargetX) < 8) g.aiTargetX = B.cloudMargin + random(s) * (WORLD_W - 2 * B.cloudMargin);
  const inp = { left: g.aiTargetX < g.x, right: g.aiTargetX > g.x, fire: false };
  if (s.phase !== 'playing') return inp;
  if (g.charge < 0) inp.fire = canDrop(s, g.aiTargetSize);
  else if (g.charge < g.aiTargetSize) inp.fire = true;
  else g.aiTargetSize = Math.floor(random(s) * 4); // release now, plan the next one
  return inp;
}
