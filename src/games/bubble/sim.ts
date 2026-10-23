// Bubble ("Balon Avı") adapter: src/sim behind the GameSim contract, plus the bubble-only
// client snapshot handling (god cloud, pop synthesis, render smoothing). No Phaser here.
import {
  EMPTY_INPUT, TICK_RATE, createGame, step,
  type GameMode, type GameState, type InputState, type PlayerId, type SimEvent,
} from '../../sim';
import type { LoopOptions } from '../../ui/loop';
import type { Smoother } from '../../ui/render/smooth';
import type { GameSim } from '../types';

// ownPos.y encodes what the player controls: 0 = their floor x, CLOUD_Y = the god cloud x.
// A role change between local state and snapshot then always counts as "far off".
export const CLOUD_Y = -1000;
export const RECONCILE_X = 120;
export const RECONCILE_CLOUD_X = 200; // the cloud moves faster, so a wider window

export const bubbleSim: GameSim<GameState, InputState, SimEvent> = {
  tickRate: TICK_RATE,
  emptyInput: EMPTY_INPUT,
  createGame: (seed, players, mode, levelIndex = 0) => createGame(seed, players, levelIndex, mode as GameMode),
  step,
  ownPos(s, id) {
    if (s.god?.godId === id) return { x: s.god.x, y: CLOUD_Y };
    const p = s.players.find((q) => q.id === id);
    return p && !p.trapped ? { x: p.x, y: 0 } : null;
  },
  setOwnPos(s, id, pos) {
    if (pos.y === CLOUD_Y) {
      if (s.god?.godId === id) s.god.x = pos.x;
      return;
    }
    const p = s.players.find((q) => q.id === id);
    if (p && !p.trapped) p.x = pos.x;
  },
  setConnected(s, id, connected) {
    const p = s.players.find((q) => q.id === id);
    if (p) p.connected = connected;
  },
};

export function bubbleLoopOptions(selfId: PlayerId, smooth: Smoother): LoopOptions<GameState, SimEvent> {
  return {
    reconcileDist: (snap) => (snap.god?.godId === selfId ? RECONCILE_CLOUD_X : RECONCILE_X),
    fastForward: (snap) => snap.phase === 'playing',
    // keep my own charge so hold-to-grow feedback isn't reset by every lagging snapshot
    prepareSnapshot(prev, snap) {
      if (prev?.god && snap.god && snap.god.godId === selfId && prev.god.godId === selfId) {
        snap.god.charge = prev.god.charge;
        snap.god.chargeStart = prev.god.chargeStart;
      }
    },
    onSnapshot(prev, snap) {
      recordCorrections(smooth, selfId, prev, snap);
      // Balls that existed locally but are gone in the snapshot were popped by someone else:
      // synthesize pop events so every client gets the sound + particles.
      const out: SimEvent[] = [];
      if (prev && prev.levelIndex === snap.levelIndex && snap.phase !== 'ready') {
        const alive = new Set(snap.balls.map((b) => b.id));
        for (const b of prev.balls) {
          if (!alive.has(b.id)) out.push({ type: 'pop', x: b.x, y: b.y, size: b.size, playerId: '', points: 0, combo: 1 });
        }
      }
      return out;
    },
  };
}

/** Turn snapshot jumps of balls / other players / someone else's cloud into smoothing offsets. */
function recordCorrections(smooth: Smoother, selfId: PlayerId, prev: GameState | null, snap: GameState): void {
  if (!prev || prev.levelIndex !== snap.levelIndex || (snap.phase === 'ready' && prev.phase !== 'ready')) {
    smooth.clear();
    return;
  }
  const balls = new Map(prev.balls.map((b) => [b.id, b]));
  for (const b of snap.balls) {
    const o = balls.get(b.id);
    if (o) smooth.correct(`b${b.id}`, o.x, o.y, b.x, b.y);
  }
  const players = new Map(prev.players.map((p) => [p.id, p]));
  for (const p of snap.players) {
    const o = players.get(p.id);
    if (o && p.id !== selfId) smooth.correct(`p${p.id}`, o.x, o.y, p.x, p.y);
  }
  if (prev.god && snap.god && snap.god.godId !== selfId) smooth.correct('god', prev.god.x, 0, snap.god.x, 0);
}
