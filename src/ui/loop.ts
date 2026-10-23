// Generic host/client game loop for any GameSim. No Phaser here: the scene feeds it frame deltas and
// the local input, and reads `state` + the returned events.
//  host:   fixed-step sim with the latest input per player, snapshot to clients every 8 ticks
//  client: local prediction (own input + others' inputs from the last snapshot); each snapshot replaces
//          the state, fast-forwarded SNAPSHOT_LEAD_TICKS, with the client-authoritative own position kept
import type { GameSim } from '../games/types';
import type { PlayerId } from '../sim/types';
import type { Pos, RoomSession, StartPayload } from '../net';

export const MAX_STEPS_PER_FRAME = 5;
export const SNAPSHOT_EVERY = 8; // ticks -> 7.5 Hz (keeps 4 players under the 100 msg/s budget)
// A snapshot is ~65 ms old on arrival (measured one-way latency): replay this many ticks on top of it.
export const SNAPSHOT_LEAD_TICKS = 4;
// Own position from a snapshot only wins when it is this far off (reset, trap, lost message).
export const RECONCILE_DIST = 120;
export const STEP_MS = 1000 / 60;

export interface LoopOptions<S, E> {
  onHostLeft?: () => void;
  /** Max distance (world units) at which the client keeps its own position over the snapshot's. */
  reconcileDist?: number | ((snap: S, selfId: PlayerId) => number);
  /** Client only, after fast-forward + own-pos restore: return synthesized events (drained by update()). */
  onSnapshot?(prev: S | null, next: S): E[];
  /** Client only, before fast-forward: patch `next` with local-only state (e.g. a held charge). */
  prepareSnapshot?(prev: S | null, next: S): void;
  /** Whether to fast-forward this snapshot (default: always). */
  fastForward?(snap: S): boolean;
  now?: () => number; // tests
}

export function randomSeed(): number {
  return (Math.random() * 0x100000000) >>> 0;
}

/** Payload for session.startGame (lobby start and "Tekrar Oyna"). */
export function startPayload(session: RoomSession, mode: string, levelIndex?: number): StartPayload {
  return {
    seed: randomSeed(),
    players: session.players().map(({ id, name, color }) => ({ id, name, color })),
    game: session.game,
    mode,
    ...(levelIndex === undefined ? {} : { levelIndex }),
  };
}

export class GameLoop<S, I, E = unknown> {
  state: S | null = null;
  private acc = 0;
  private steps = 0;
  private ids: PlayerId[] = [];
  private local: I;
  private lastSent: string | null = null;
  private remote: Record<PlayerId, I> = {};
  private pending: E[] = [];
  private offs: (() => void)[] = [];
  private snapTimes: number[] = []; // arrival times (ms) of recent snapshots
  private readonly stepMs: number;
  private readonly now: () => number;

  constructor(
    private session: RoomSession,
    private sim: GameSim<S, I, E>,
    private opts: LoopOptions<S, E> = {},
  ) {
    this.local = sim.emptyInput;
    this.stepMs = 1000 / sim.tickRate;
    this.now = opts.now ?? (() => performance.now());
    const s = session;
    this.offs.push(s.onStart((p) => this.start(p)));
    if (s.isHost) {
      this.offs.push(
        s.onInput((id, input, pos) => {
          this.remote[id] = input as I;
          if (pos && this.state) this.sim.setOwnPos?.(this.state, id, pos);
        }),
        s.onPlayersChange((list) => {
          if (!this.state || !this.sim.setConnected) return;
          const present = new Set(list.map((p) => p.id));
          for (const id of this.ids) this.sim.setConnected(this.state, id, present.has(id));
        }),
      );
    } else {
      this.offs.push(
        s.onSnapshot((snap, inputs) => {
          this.noteSnapshot(this.now());
          this.remote = (inputs ?? {}) as Record<PlayerId, I>;
          this.applySnapshot(snap as S);
        }),
        s.onHostLeft(() => opts.onHostLeft?.()),
      );
    }
  }

  get selfId(): PlayerId {
    return this.session.self.id;
  }

  start(p: StartPayload): void {
    this.ids = p.players.map((q) => q.id);
    this.state = this.sim.createGame(p.seed, p.players, p.mode, p.levelIndex);
    this.acc = 0;
    this.steps = 0;
    this.pending = [];
  }

  setLocalInput(input: I): void {
    this.local = input;
    if (this.session.isHost) return;
    const key = JSON.stringify(input);
    if (key === this.lastSent) return;
    this.lastSent = key; // keepalive resends are handled inside the net layer
    this.session.sendInput(input, this.ownPos(this.state) ?? undefined);
  }

  private ownPos(s: S | null): Pos | null {
    return s && this.sim.ownPos ? this.sim.ownPos(s, this.selfId) : null;
  }

  /** Advance by a frame delta (ms). Returns sim/synthesized events produced during this frame. */
  update(dtMs: number): E[] {
    const events = this.pending;
    this.pending = [];
    const state = this.state;
    if (!state) return events;

    this.acc += dtMs;
    let n = 0;
    while (this.acc >= this.stepMs && n < MAX_STEPS_PER_FRAME) {
      this.acc -= this.stepMs;
      n++;
      events.push(...this.sim.step(state, this.inputs()));
      this.steps++;
      if (this.session.isHost && this.steps % SNAPSHOT_EVERY === 0) this.session.sendSnapshot(state, this.inputs());
    }
    if (this.acc >= this.stepMs) this.acc = 0; // too far behind (tab was hidden): drop the backlog
    return events;
  }

  private inputs(): Record<PlayerId, I> {
    const out: Record<PlayerId, I> = {};
    // host: latest received input per player; client: others' inputs as of the last snapshot
    for (const id of this.ids) out[id] = id === this.selfId ? this.local : this.remote[id] ?? this.sim.emptyInput;
    return out;
  }

  applySnapshot(snap: S): void {
    const prev = this.state;
    const { reconcileDist = RECONCILE_DIST } = this.opts;
    const mine = this.ownPos(prev);
    const theirs = this.ownPos(snap);
    const limit = typeof reconcileDist === 'number' ? reconcileDist : reconcileDist(snap, this.selfId);
    const keep = mine && theirs && Math.hypot(mine.x - theirs.x, mine.y - theirs.y) < limit ? mine : null;

    this.opts.prepareSnapshot?.(prev, snap);
    if (this.opts.fastForward?.(snap) ?? true) {
      for (let i = 0; i < SNAPSHOT_LEAD_TICKS; i++) this.sim.step(snap, this.inputs());
    }
    if (keep) this.sim.setOwnPos?.(snap, this.selfId, keep);
    if (this.opts.onSnapshot) this.pending.push(...this.opts.onSnapshot(prev, snap));
    this.state = snap;
  }

  private noteSnapshot(t: number): void {
    this.snapTimes.push(t);
    while (this.snapTimes.length > 2 && this.snapTimes[0] < t - 2000) this.snapTimes.shift();
  }

  /** Gaps between snapshots received in the last ~2 s (client only), or null if too few. */
  snapshotStats(): { avg: number; max: number } | null {
    const t = this.snapTimes;
    if (t.length < 2) return null;
    let max = 0;
    for (let i = 1; i < t.length; i++) max = Math.max(max, t[i] - t[i - 1]);
    // include the time since the last one, so a stall shows up while it is happening
    max = Math.max(max, this.now() - t[t.length - 1]);
    return { avg: (t[t.length - 1] - t[0]) / (t.length - 1), max };
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs = [];
  }
}
