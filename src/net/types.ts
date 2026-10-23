import type { GameMode, GameState, InputState, PlayerId, PlayerInfo } from '../sim/types';

export interface LobbyPlayer extends PlayerInfo {
  isHost: boolean;
}

export interface StartPayload {
  seed: number;
  players: PlayerInfo[]; // order = spawn order
  levelIndex: number;
  mode: GameMode; // chosen by host in lobby
}

export type JoinError = 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'GAME_STARTED' | 'NETWORK';

// One Supabase Realtime channel per room: `room:<CODE>`.
// Host is authoritative: runs the sim, broadcasts snapshots. Clients send inputs only.
export interface RoomSession {
  readonly code: string; // 4 chars, A-Z0-9 without ambiguous chars (0/O/1/I)
  readonly self: LobbyPlayer;
  readonly isHost: boolean;

  players(): LobbyPlayer[]; // current presence, host first
  onPlayersChange(cb: (players: LobbyPlayer[]) => void): () => void;

  // host only
  startGame(payload: StartPayload): void;
  // ~7.5 Hz (every 8 ticks); inputs = latest input per player so clients can predict others' movement
  sendSnapshot(state: GameState, inputs: Record<PlayerId, InputState>): void;
  // x = sender's own player x when the input changed (client-authoritative movement); absent on keepalives
  onInput(cb: (playerId: PlayerId, input: InputState, x: number | undefined) => void): () => void;

  // everyone (host receives its own start via a local callback too)
  onStart(cb: (payload: StartPayload) => void): () => void;

  // clients only
  sendInput(input: InputState, x: number): void; // call only when input changed (+ keepalive every 3s)
  onSnapshot(cb: (state: GameState, inputs: Record<PlayerId, InputState>) => void): () => void;
  onHostLeft(cb: () => void): () => void;

  leave(): Promise<void>;
}

export interface RoomApi {
  createRoom(name: string): Promise<RoomSession>;
  // rejects with Error whose message is a JoinError
  joinRoom(code: string, name: string): Promise<RoomSession>;
}
