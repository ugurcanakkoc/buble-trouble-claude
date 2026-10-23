// Shared contract between sim, net and ui. Pure data: everything here must be JSON-serializable
// because the host broadcasts GameState as a snapshot.

export const TICK_RATE = 60; // fixed simulation steps per second
export const WORLD_W = 960; // play area width (logical units)
export const WORLD_H = 480; // play area height; floor is at y = WORLD_H, y grows downward
export const MAX_PLAYERS = 4;

export type PlayerId = string;

export interface InputState {
  left: boolean;
  right: boolean;
  fire: boolean;
}

export const EMPTY_INPUT: InputState = { left: false, right: false, fire: false };

export interface PlayerInfo {
  id: PlayerId;
  name: string; // username shown above the character, max 12 chars
  color: number; // 0xRRGGBB
}

// 3 = largest, 0 = smallest. Popping size n>0 spawns two balls of size n-1; popping 0 removes it.
export type BallSize = 0 | 1 | 2 | 3;

export interface Ball {
  id: number;
  x: number; // center
  y: number; // center
  vx: number; // units per second
  vy: number; // units per second
  size: BallSize;
  color: number;
}

export type WeaponKind = 'harpoon' | 'double' | 'sticky' | 'gun';

export interface Projectile {
  id: number;
  owner: PlayerId;
  kind: WeaponKind;
  x: number;
  y: number; // harpoon: tip of the rope (rope spans y..baseY); gun: bullet position
  baseY: number; // harpoon: where the rope starts (player's feet); gun: unused (= y)
  stuckUntil: number; // sticky harpoon: tick until which it stays on the ceiling; 0 = not stuck
}

export type PowerUpKind = 'shield' | 'clock' | 'dynamite' | 'life' | 'time' | 'double' | 'sticky' | 'gun';

export interface PowerUp {
  id: number;
  kind: PowerUpKind;
  x: number;
  y: number;
  vy: number;
  expiresAt: number; // tick
}

/** Per-player match stats (plain JSON). pops is indexed by BallSize. god-only: drops, godTraps (fighters trapped while god). */
export interface PlayerStats {
  pops: [number, number, number, number];
  maxCombo: number;
  revives: number; // teammates freed
  trapped: number; // times caught in a bubble
  powerUps: number;
  drops: number;
  godTraps: number;
}

export const newStats = (): PlayerStats => ({ pops: [0, 0, 0, 0], maxCombo: 0, revives: 0, trapped: 0, powerUps: 0, drops: 0, godTraps: 0 });

export interface Player {
  id: PlayerId;
  name: string;
  color: number;
  x: number; // center
  y: number; // feet
  facing: -1 | 1;
  weapon: WeaponKind;
  shield: boolean;
  score: number;
  invulnUntil: number; // tick
  connected: boolean;
  fireHeld: boolean; // fire was held last tick (a fresh press fires a harpoon immediately)
  nextFireTick: number; // gun cooldown / harpoon hold-to-refire delay
  trapped: boolean;
  helpUntil: number; // tick until the trapped player's "Yardım et!" shout is shown (0 = none) // hit by a ball: stuck in a bubble until a teammate touches them
  combo: number; // current pop chain multiplier, 1..5
  comboUntil: number; // tick when the chain expires
  stats: PlayerStats;
}

export type BlockKind = 'wall' | 'breakable';

export interface Block {
  id: number;
  kind: BlockKind;
  x: number; // top-left
  y: number;
  w: number;
  h: number;
  hp: number; // breakable: hits left; others: 0
}

export type Phase = 'ready' | 'playing' | 'levelComplete' | 'dying' | 'gameOver'; // endless: no victory

export type GameMode = 'classic' | 'god' | 'rain';

// God / rain mode controller. In 'god' a player is the god for one round each (order); in 'rain' an AI (godId '').
export interface GodState {
  godId: PlayerId; // '' in rain = AI
  x: number; // cloud x
  mana: number;
  charge: number; // 0..3 size being charged, -1 idle
  chargeStart: number; // tick charging started
  nextDropTick: number; // drop cooldown
  round: number; // 0-based
  roundEndsTick: number; // god: tick the round timer runs out; rain: tick the run started
  roundWins: Record<PlayerId, number>;
  order: PlayerId[]; // god rotation
  aiTargetX: number; // AI god only: where the cloud drifts to
  aiTargetSize: number; // AI god only: size it saves mana for
}

export interface GameState {
  tick: number;
  rng: number; // seeded PRNG state (mulberry32), advanced only by sim
  levelIndex: number; // 0-based, unbounded (levels past the handcrafted set are generated)
  phase: Phase;
  phaseUntil: number; // tick when a timed phase (ready/levelComplete/dying) ends
  timeLeftTicks: number;
  lives: number; // shared by all players
  freezeUntil: number; // clock power-up: balls frozen until this tick
  nextId: number;
  balls: Ball[];
  projectiles: Projectile[];
  powerUps: PowerUp[];
  players: Player[];
  blocks: Block[];
  timeBonus: number; // classic: per-player points credited on the last level clear (0 otherwise)
  mode: GameMode;
  god: GodState | null; // null in classic
}

export type SimEvent =
  | { type: 'shoot'; playerId: PlayerId; kind: WeaponKind }
  | { type: 'pop'; x: number; y: number; size: BallSize; playerId: PlayerId; points: number; combo: number }
  | { type: 'powerup'; kind: PowerUpKind; playerId: PlayerId }
  | { type: 'shieldBreak'; playerId: PlayerId }
  | { type: 'trapped'; playerId: PlayerId } // player caught in a bubble
  | { type: 'help'; playerId: PlayerId } // trapped player pressed fire: shout for help
  | { type: 'revive'; playerId: PlayerId; by: PlayerId }
  | { type: 'hit'; playerId: PlayerId } // whole team trapped -> life lost (playerId = last trapped)
  | { type: 'timeout' } // timer ran out -> life lost
  | { type: 'blockBreak'; x: number; y: number }
  | { type: 'levelStart'; levelIndex: number }
  | { type: 'levelComplete'; levelIndex: number }
  | { type: 'gameOver' }
  | { type: 'godDrop'; x: number; size: BallSize }
  | { type: 'roundEnd'; winner: 'god' | 'fighters'; round: number }
  | { type: 'matchEnd'; roundWins: Record<PlayerId, number> };

export interface LevelDef {
  name: string;
  timeSeconds: number;
  speed?: number; // ball horizontal speed multiplier, default 1
  balls: { x: number; size: BallSize; dir: -1 | 1; y?: number }[];
  blocks: { kind: BlockKind; x: number; y: number; w: number; h: number; hp?: number }[];
}
