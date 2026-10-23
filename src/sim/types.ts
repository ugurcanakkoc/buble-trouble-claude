// Shared contract between sim, net and ui. Pure data: everything here must be JSON-serializable
// because the host broadcasts GameState as a snapshot.

export const TICK_RATE = 60; // fixed simulation steps per second
export const WORLD_W = 960; // play area width (logical units)
export const WORLD_H = 480; // play area height; floor is at y = WORLD_H, y grows downward
export const MAX_PLAYERS = 3;

export type PlayerId = string;

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean; // climb ladder
  down: boolean;
  fire: boolean;
}

export const EMPTY_INPUT: InputState = { left: false, right: false, up: false, down: false, fire: false };

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
  onLadder: boolean;
  invulnUntil: number; // tick
  connected: boolean;
}

export type BlockKind = 'wall' | 'breakable' | 'ladder';

export interface Block {
  id: number;
  kind: BlockKind;
  x: number; // top-left
  y: number;
  w: number;
  h: number;
  hp: number; // breakable: hits left; others: 0
}

export type Phase = 'ready' | 'playing' | 'levelComplete' | 'dying' | 'gameOver' | 'victory';

export interface GameState {
  tick: number;
  rng: number; // seeded PRNG state (mulberry32), advanced only by sim
  levelIndex: number;
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
}

export type SimEvent =
  | { type: 'shoot'; playerId: PlayerId; kind: WeaponKind }
  | { type: 'pop'; x: number; y: number; size: BallSize; playerId: PlayerId }
  | { type: 'powerup'; kind: PowerUpKind; playerId: PlayerId }
  | { type: 'shieldBreak'; playerId: PlayerId }
  | { type: 'hit'; playerId: PlayerId }
  | { type: 'blockBreak'; x: number; y: number }
  | { type: 'levelStart'; levelIndex: number }
  | { type: 'levelComplete'; levelIndex: number }
  | { type: 'gameOver' }
  | { type: 'victory' };

export interface LevelDef {
  name: string;
  timeSeconds: number;
  balls: { x: number; size: BallSize; dir: -1 | 1; y?: number }[];
  blocks: { kind: BlockKind; x: number; y: number; w: number; h: number; hp?: number }[];
}
