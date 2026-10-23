import type { GameState, InputState, Phase, Player, SimEvent } from './types';
import { TICK_RATE } from './types';
import { BALL_RADIUS, moveBalls } from './balls';
import { circleHitsBox } from './geom';
import { PLAYER_H, PLAYER_W, movePlayer } from './players';
import { updatePowerUps } from './powerups';
import { fire, updateProjectiles } from './weapons';

const SHIELD_INVULN_TICKS = TICK_RATE;
const REVIVE_INVULN_TICKS = Math.round(1.5 * TICK_RATE);
const HITBOX_INSET = 4; // forgiving player hitbox

/** Clear per-level/round player state (scores, shields kept). */
export function resetFighters(players: Player[]): void {
  for (const p of players) {
    p.weapon = 'harpoon';
    p.invulnUntil = 0;
    p.nextFireTick = 0;
    p.trapped = false;
    p.combo = 0;
    p.comboUntil = 0;
  }
}

const touchesBall = (s: GameState, p: Player) =>
  s.balls.some((b) =>
    circleHitsBox(b.x, b.y, BALL_RADIUS[b.size], p.x - PLAYER_W / 2 + HITBOX_INSET, p.y - PLAYER_H + HITBOX_INSET, PLAYER_W - 2 * HITBOX_INSET, PLAYER_H - HITBOX_INSET),
  );

/**
 * One 'playing' tick of the shared world: fighters move/fire, revives, balls, projectiles, power-ups, traps.
 * Returns the id of the last trapped fighter if every fighter is now trapped, else null.
 */
export function worldTick(s: GameState, fighters: Player[], input: (p: Player) => InputState, events: SimEvent[]): string | null {
  const free = fighters.filter((p) => !p.trapped);
  for (const p of free) {
    movePlayer(p, input(p));
    fire(s, p, input(p), events);
  }
  // A free teammate touching a trapped player frees them.
  for (const t of fighters) {
    if (!t.trapped) continue;
    const by = free.find((p) => Math.abs(p.x - t.x) < PLAYER_W);
    if (!by) continue;
    t.trapped = false;
    t.invulnUntil = s.tick + REVIVE_INVULN_TICKS;
    by.stats.revives++;
    events.push({ type: 'revive', playerId: t.id, by: by.id });
  }

  if (s.tick >= s.freezeUntil) moveBalls(s);
  updateProjectiles(s, events);
  updatePowerUps(s, fighters, events);

  let lastTrapped = '';
  for (const p of fighters) {
    if (p.trapped || s.tick < p.invulnUntil || !touchesBall(s, p)) continue;
    if (p.shield) {
      p.shield = false;
      p.invulnUntil = s.tick + SHIELD_INVULN_TICKS;
      events.push({ type: 'shieldBreak', playerId: p.id });
    } else {
      p.trapped = true;
      p.stats.trapped++;
      if (s.mode === 'god' && s.god) { const g = s.players.find((q) => q.id === s.god!.godId); if (g) g.stats.godTraps++; }
      lastTrapped = p.id;
      events.push({ type: 'trapped', playerId: p.id });
    }
  }
  if (fighters.length > 0 && fighters.every((p) => p.trapped)) return lastTrapped || fighters[fighters.length - 1].id;
  return null;
}

export function setPhase(s: GameState, phase: Phase, ticks = 0): void {
  s.phase = phase;
  s.phaseUntil = ticks ? s.tick + ticks : 0;
}
