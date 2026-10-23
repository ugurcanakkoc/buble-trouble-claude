import type { PlayerId, PlayerInfo } from '../sim/types';
import type { GameId } from '../games/types';

export interface LobbyPlayer extends PlayerInfo {
  isHost: boolean;
}

export interface StartPayload {
  seed: number;
  players: PlayerInfo[]; // order = spawn order
  game: GameId;
  mode: string; // ModeDef.id chosen by host in lobby
  levelIndex?: number;
}

export interface Pos {
  x: number;
  y: number;
}

export type JoinError = 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'GAME_STARTED' | 'NETWORK';

// One Supabase Realtime channel per room: `room:<CODE>`.
// Host is authoritative: runs the sim, broadcasts snapshots. Clients send inputs only.
export interface RoomSession {
  readonly code: string; // 4 chars, A-Z0-9 without ambiguous chars (0/O/1/I)
  readonly self: LobbyPlayer;
  readonly isHost: boolean;
  readonly game: GameId; // host's game; joiners adopt it

  players(): LobbyPlayer[]; // current presence, host first
  onPlayersChange(cb: (players: LobbyPlayer[]) => void): () => void;

  // host only
  startGame(payload: StartPayload): void;
  // ~7.5 Hz (every 8 ticks); inputs = latest input per player so clients can predict others' movement
  sendSnapshot(state: unknown, inputs: Record<PlayerId, unknown>): void;
  // pos = sender's own position when the input changed (client-authoritative movement); absent on keepalives
  onInput(cb: (playerId: PlayerId, input: unknown, pos?: Pos) => void): () => void;

  // everyone (host receives its own start via a local callback too)
  onStart(cb: (payload: StartPayload) => void): () => void;

  // clients only
  sendInput(input: unknown, pos?: Pos): void; // call only when input changed (+ keepalive every 3s, net layer)
  onSnapshot(cb: (state: unknown, inputs: Record<PlayerId, unknown>) => void): () => void;
  onHostLeft(cb: () => void): () => void;

  /** Game-message link: client → host, host → worst client. 'relay' = Supabase ("Sunucu"). */
  linkInfo(): { mode: 'p2p' | 'relay' | 'connecting'; rttMs: number | null };

  leave(): Promise<void>;
}

export interface RoomApi {
  /** maxPlayers: the game's GameDef.maxPlayers (stored in host presence, enforced on join). */
  createRoom(name: string, game: GameId, maxPlayers?: number): Promise<RoomSession>;
  // rejects with Error whose message is a JoinError; ROOM_FULL errors also carry `max: number`
  joinRoom(code: string, name: string): Promise<RoomSession>;
}
