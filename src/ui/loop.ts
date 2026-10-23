// Host/client game loop controller. No Phaser here: the scene feeds it frame deltas and the local
// input, and reads `state` + the returned events. Sim functions are injected so tests can stub them.
import { EMPTY_INPUT, type GameState, type InputState, type PlayerId, type PlayerInfo, type SimEvent } from '../sim';
import type { RoomSession, StartPayload } from '../net';

export const STEP_MS = 1000 / 60;
export const MAX_STEPS_PER_FRAME = 5;
export const SNAPSHOT_EVERY = 8; // ticks -> 7.5 Hz (keeps 4 players under the 100 msg/s budget)
export const RECONCILE_X = 24;

const NO_INPUT = EMPTY_INPUT;

export interface SimFns {
  createGame(seed: number, players: PlayerInfo[], levelIndex?: number): GameState;
  step(state: GameState, inputs: Record<PlayerId, InputState>): SimEvent[];
}

const sameInput = (a: InputState, b: InputState) =>
  (Object.keys(a) as (keyof InputState)[]).every((k) => a[k] === b[k]);

export function randomSeed(): number {
  return (Math.random() * 0x100000000) >>> 0;
}

export function startPayload(session: RoomSession, levelIndex = 0): StartPayload {
  return {
    seed: randomSeed(),
    players: session.players().map(({ id, name, color }) => ({ id, name, color })),
    levelIndex,
  };
}

export class GameLoop {
  state: GameState | null = null;
  private acc = 0;
  private steps = 0;
  private local: InputState = NO_INPUT;
  private lastSent: InputState | null = null;
  private remote: Record<PlayerId, InputState> = {};
  private pending: SimEvent[] = []; // events synthesized from snapshots, drained by update()
  private offs: (() => void)[] = [];

  constructor(
    private session: RoomSession,
    private sim: SimFns,
    onHostLeft: () => void = () => {},
  ) {
    const s = session;
    this.offs.push(s.onStart((p) => this.start(p)));
    if (s.isHost) {
      this.offs.push(s.onInput((id, input) => (this.remote[id] = input)));
      this.offs.push(
        s.onPlayersChange((list) => {
          if (!this.state) return;
          const present = new Set(list.map((p) => p.id));
          for (const p of this.state.players) p.connected = present.has(p.id);
        }),
      );
    } else {
      this.offs.push(s.onSnapshot((snap) => this.applySnapshot(snap)));
      this.offs.push(s.onHostLeft(onHostLeft));
    }
  }

  get selfId(): PlayerId {
    return this.session.self.id;
  }

  start(p: StartPayload): void {
    this.state = this.sim.createGame(p.seed, p.players, p.levelIndex);
    this.acc = 0;
    this.steps = 0;
    this.pending = [];
  }

  setLocalInput(input: InputState): void {
    this.local = { ...input };
    if (!this.session.isHost && (!this.lastSent || !sameInput(this.lastSent, this.local))) this.send();
  }

  private send(): void {
    this.lastSent = this.local; // keepalive resends are handled inside the net layer
    this.session.sendInput(this.local);
  }

  /** Advance by a frame delta (ms). Returns sim/synthesized events produced during this frame. */
  update(dtMs: number): SimEvent[] {
    const events = this.pending;
    this.pending = [];
    const state = this.state;
    if (!state) return events;

    this.acc += dtMs;
    let n = 0;
    while (this.acc >= STEP_MS && n < MAX_STEPS_PER_FRAME) {
      this.acc -= STEP_MS;
      n++;
      events.push(...this.sim.step(state, this.inputs(state)));
      this.steps++;
      if (this.session.isHost && this.steps % SNAPSHOT_EVERY === 0) this.session.sendSnapshot(state);
    }
    if (this.acc >= STEP_MS) this.acc = 0; // too far behind (tab was hidden): drop the backlog
    return events;
  }

  private inputs(state: GameState): Record<PlayerId, InputState> {
    const out: Record<PlayerId, InputState> = {};
    for (const p of state.players) {
      // host: latest received input per remote player; client: others assumed idle
      out[p.id] = p.id === this.selfId ? this.local : this.session.isHost ? this.remote[p.id] ?? NO_INPUT : NO_INPUT;
    }
    return out;
  }

  applySnapshot(snap: GameState): void {
    const prev = this.state;
    if (prev) {
      const mine = prev.players.find((p) => p.id === this.selfId);
      const theirs = snap.players.find((p) => p.id === this.selfId);
      if (mine && theirs && Math.abs(mine.x - theirs.x) < RECONCILE_X) theirs.x = mine.x;

      // Balls that existed locally but are gone in the snapshot were popped by someone else:
      // synthesize pop events so every client gets the sound + particles.
      if (prev.levelIndex === snap.levelIndex && snap.phase !== 'ready') {
        const alive = new Set(snap.balls.map((b) => b.id));
        for (const b of prev.balls) {
          if (!alive.has(b.id)) this.pending.push({ type: 'pop', x: b.x, y: b.y, size: b.size, playerId: '', points: 0, combo: 1 });
        }
      }
    }
    this.state = snap;
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs = [];
  }
}
