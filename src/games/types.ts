// Contract for every game on the platform. The platform owns menu → game picker → room/lobby → start,
// the network session and the fixed-step host/client loop; a game supplies a pure sim + a Phaser scene.
// Full platform API (loop, touch, helpers): docs/platform-api.md
import type { PlayerId, PlayerInfo } from '../sim/types';

export type GameId = 'bubble' | 'war' | 'bomb';

export interface ModeDef {
  id: string;
  label: string; // Turkish, short ("Klasik", "Takım", "Bilgisayara karşı")
  desc: string; // one line
  minPlayers: number;
  icon?: string; // emoji on the lobby mode card
}

/**
 * Pure, deterministic simulation. State S and input I must be plain JSON (they go over the wire).
 * Discrete commands (buy unit, place bomb) are encoded in I with an incrementing `seq` so a held
 * input that is re-sent (keepalive) never repeats the command: the sim acts when seq changes.
 */
export interface GameSim<S, I, E = unknown> {
  readonly tickRate: number; // fixed steps per second (60 for all current games)
  readonly emptyInput: I;
  /** levelIndex comes from StartPayload.levelIndex (optional, bubble uses it). */
  createGame(seed: number, players: PlayerInfo[], mode: string, levelIndex?: number): S;
  step(state: S, inputs: Record<PlayerId, I>): E[]; // mutates state, 1 tick
  /** Optional client-authoritative movement: the client sends its own position with each input change. */
  ownPos?(state: S, id: PlayerId): { x: number; y: number } | null;
  setOwnPos?(state: S, id: PlayerId, pos: { x: number; y: number }): void;
  /** Optional: host calls this when a player leaves/returns to the room presence. */
  setConnected?(state: S, id: PlayerId, connected: boolean): void;
}

export interface GameDef {
  id: GameId;
  title: string; // "Balon Avı", "Çağlar Savaşı", "Bomba"
  tagline: string; // one line under the title on the picker card
  icon: string; // emoji for the picker card
  minPlayers: number;
  maxPlayers: number; // joinRoom rejects with ROOM_FULL beyond this
  modes: ModeDef[];
  sceneKey: string; // Phaser scene started with { session, payload } (see net/types StartPayload)
}
