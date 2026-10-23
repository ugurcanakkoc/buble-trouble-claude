import { describe, expect, it, vi } from 'vitest';
import type { GameSim } from '../games/types';
import type { PlayerId, PlayerInfo } from '../sim';
import type { StartPayload } from '../net';
import { GameLoop, SNAPSHOT_LEAD_TICKS, STEP_MS, keepPresses, startPayload } from './loop';
import { fakeSession } from './testSession';

// Minimal game: players have x/y, `go` moves +1 x per tick.
interface S { tick: number; players: { id: string; x: number; y: number; online: boolean }[] }
interface I { go: boolean; seq: number }
const IDLE: I = { go: false, seq: 0 };

function fakeSim() {
  const calls: Record<PlayerId, I>[] = [];
  const sim: GameSim<S, I, string> = {
    tickRate: 60,
    emptyInput: IDLE,
    createGame: (_seed, players: PlayerInfo[]) => ({
      tick: 0, players: players.map((p, i) => ({ id: p.id, x: 100 + i * 100, y: 50, online: true })),
    }),
    step(state, inputs) {
      calls.push(inputs);
      state.tick++;
      for (const p of state.players) if (inputs[p.id]?.go) p.x += 1;
      return ['tick'];
    },
    ownPos: (s, id) => {
      const p = s.players.find((q) => q.id === id);
      return p ? { x: p.x, y: p.y } : null;
    },
    setOwnPos(s, id, pos) {
      const p = s.players.find((q) => q.id === id)!;
      p.x = pos.x;
      p.y = pos.y;
    },
    setConnected(s, id, on) {
      s.players.find((q) => q.id === id)!.online = on;
    },
  };
  return { sim, calls };
}

const payload: StartPayload = {
  seed: 1, game: 'bubble', mode: 'x',
  players: [{ id: 'h', name: 'h', color: 1 }, { id: 'c', name: 'c', color: 2 }],
};
const snapOf = (xs: [number, number], tick = 0): S => ({
  tick, players: [{ id: 'h', x: xs[0], y: 50, online: true }, { id: 'c', x: xs[1], y: 50, online: true }],
});

describe('GameLoop host', () => {
  it('runs fixed steps with an accumulator and caps catch-up at 5', () => {
    const { s, emit } = fakeSession(true);
    const { sim, calls } = fakeSim();
    const loop = new GameLoop(s, sim);
    emit('start', payload);
    loop.update(STEP_MS * 0.5);
    expect(calls.length).toBe(0);
    expect(loop.update(STEP_MS * 0.6)).toEqual(['tick']);
    loop.update(STEP_MS * 2);
    expect(calls.length).toBe(3);
    loop.update(1000); // huge hitch
    expect(calls.length).toBe(8);
    loop.update(STEP_MS * 0.5); // backlog dropped, not replayed
    expect(calls.length).toBe(8);
  });

  it('uses the sim tick rate', () => {
    const { s, emit } = fakeSession(true);
    const { sim, calls } = fakeSim();
    const loop = new GameLoop(s, { ...sim, tickRate: 30 });
    emit('start', payload);
    loop.update(1000 / 60 + 1);
    expect(calls.length).toBe(0);
    loop.update(1000 / 60);
    expect(calls.length).toBe(1);
  });

  it('broadcasts a snapshot (with inputs) every 8 ticks', () => {
    const { s, emit } = fakeSession(true);
    const loop = new GameLoop(s, fakeSim().sim);
    emit('start', payload);
    for (let i = 0; i < 7; i++) loop.update(STEP_MS);
    expect(s.sendSnapshot).not.toHaveBeenCalled();
    for (let i = 0; i < 17; i++) loop.update(STEP_MS);
    expect(s.sendSnapshot).toHaveBeenCalledTimes(3);
    expect(s.sendSnapshot.mock.calls[0][1]).toEqual({ h: IDLE, c: IDLE });
  });

  it('feeds local input + latest remote input per player, never sends input', () => {
    const { s, emit } = fakeSession(true);
    const { sim, calls } = fakeSim();
    const loop = new GameLoop(s, sim);
    emit('start', payload);
    loop.setLocalInput({ go: true, seq: 1 });
    emit('input', 'c', { go: false, seq: 4 });
    loop.update(STEP_MS);
    expect(calls[0]).toEqual({ h: { go: true, seq: 1 }, c: { go: false, seq: 4 } });
    expect(s.sendInput).not.toHaveBeenCalled();
  });

  it('applies a client-reported pos via setOwnPos, not on keepalives', () => {
    const { s, emit } = fakeSession(true);
    const loop = new GameLoop(s, fakeSim().sim);
    emit('start', payload);
    const c = () => loop.state!.players[1];
    emit('input', 'c', IDLE, { x: 444, y: 7 });
    expect(c()).toMatchObject({ x: 444, y: 7 });
    emit('input', 'c', IDLE, undefined);
    expect(c().x).toBe(444);
  });

  it('reports presence changes through setConnected', () => {
    const { s, emit } = fakeSession(true);
    const loop = new GameLoop(s, fakeSim().sim);
    emit('start', payload);
    emit('players', [s.self]);
    expect(loop.state!.players.map((p) => p.online)).toEqual([true, false]);
  });

  it('restarts on a new start payload', () => {
    const { s, emit } = fakeSession(true);
    const loop = new GameLoop(s, fakeSim().sim);
    emit('start', payload);
    loop.update(STEP_MS * 3);
    emit('start', payload);
    expect(loop.state!.tick).toBe(0);
  });
});

describe('GameLoop client', () => {
  it('sends input only when it changes (deep compare), with own pos', () => {
    const { s, emit } = fakeSession(false);
    const loop = new GameLoop(s, fakeSim().sim);
    emit('start', payload);
    loop.setLocalInput(IDLE);
    loop.setLocalInput({ ...IDLE });
    expect(s.sendInput).toHaveBeenCalledTimes(1);
    loop.state!.players[1].x = 321;
    loop.setLocalInput({ go: true, seq: 0 });
    loop.setLocalInput({ go: true, seq: 0 });
    expect(s.sendInput).toHaveBeenCalledTimes(2);
    expect(s.sendInput).toHaveBeenLastCalledWith({ go: true, seq: 0 }, { x: 321, y: 50 });
    loop.update(1100); // no keepalive here: the net layer owns that
    expect(s.sendInput).toHaveBeenCalledTimes(2);
    expect(s.sendSnapshot).not.toHaveBeenCalled();
  });

  it('sends no pos for games without ownPos', () => {
    const { s, emit } = fakeSession(false);
    const { ownPos: _o, setOwnPos: _s, ...sim } = fakeSim().sim;
    const loop = new GameLoop(s, sim);
    emit('start', payload);
    loop.setLocalInput(IDLE);
    expect(s.sendInput).toHaveBeenLastCalledWith(IDLE, undefined);
  });

  it('predicts with own input and snapshot inputs for others', () => {
    const { s, emit } = fakeSession(false);
    const { sim, calls } = fakeSim();
    const loop = new GameLoop(s, sim);
    emit('start', payload);
    loop.setLocalInput({ go: true, seq: 0 });
    loop.update(STEP_MS);
    expect(calls[0]).toEqual({ c: { go: true, seq: 0 }, h: IDLE });
    emit('snapshot', snapOf([0, 0]), { h: { go: true, seq: 2 } });
    loop.update(STEP_MS);
    expect(calls.at(-1)!.h).toEqual({ go: true, seq: 2 });
  });

  it('fast-forwards snapshots SNAPSHOT_LEAD_TICKS ticks', () => {
    const { s, emit } = fakeSession(false);
    const loop = new GameLoop(s, fakeSim().sim);
    emit('start', payload);
    emit('snapshot', snapOf([500, 200], 10), { h: { go: true, seq: 0 } });
    expect(loop.state!.tick).toBe(10 + SNAPSHOT_LEAD_TICKS);
    expect(loop.state!.players[0].x).toBe(500 + SNAPSHOT_LEAD_TICKS);
  });

  it('keeps own pos (client-authoritative) unless farther than reconcileDist', () => {
    const { s, emit } = fakeSession(false);
    const loop = new GameLoop(s, fakeSim().sim, { reconcileDist: 50 });
    emit('start', payload);
    const localX = loop.state!.players[1].x;
    emit('snapshot', snapOf([555, localX + 40]));
    expect(loop.state!.players[1].x).toBe(localX);
    expect(loop.state!.players[0].x).toBe(555); // others always from the snapshot
    emit('snapshot', snapOf([555, localX + 60]));
    expect(loop.state!.players[1].x).toBe(localX + 60);
  });

  it('runs prepareSnapshot before and onSnapshot after fast-forward, draining events in update()', () => {
    const { s, emit } = fakeSession(false);
    const seen: number[] = [];
    const loop = new GameLoop(s, fakeSim().sim, {
      prepareSnapshot: (_p, n) => void seen.push(n.tick),
      onSnapshot: (prev, next) => {
        seen.push(next.tick);
        return [`snap ${prev?.tick}`];
      },
      fastForward: (n) => n.tick > 0,
    });
    emit('start', payload);
    emit('snapshot', snapOf([0, 0], 0));
    emit('snapshot', snapOf([0, 0], 5));
    expect(seen).toEqual([0, 0, 5, 5 + SNAPSHOT_LEAD_TICKS]);
    expect(loop.update(0)).toEqual(['snap 0', 'snap 0']);
    expect(loop.update(0)).toEqual([]);
  });

  it('reports snapshot interval avg/max over the last 2 s', () => {
    const { s, emit } = fakeSession(false);
    let t = 0;
    const loop = new GameLoop(s, fakeSim().sim, { now: () => t });
    emit('start', payload);
    expect(loop.snapshotStats()).toBeNull();
    for (const gap of [0, 130, 140, 400]) {
      t += gap;
      emit('snapshot', snapOf([0, 0]));
    }
    expect(loop.snapshotStats()).toEqual({ avg: 670 / 3, max: 400 });
    t += 3000; // old samples drop out, and a stall shows up as max
    emit('snapshot', snapOf([0, 0]));
    t += 500;
    expect(loop.snapshotStats()!.max).toBe(3000);
  });

  it('calls onHostLeft and unsubscribes on dispose', () => {
    const { s, emit } = fakeSession(false);
    const left = vi.fn();
    const loop = new GameLoop(s, fakeSim().sim, { onHostLeft: left });
    emit('hostLeft');
    expect(left).toHaveBeenCalledTimes(1);
    loop.dispose();
    emit('hostLeft');
    emit('start', payload);
    expect(left).toHaveBeenCalledTimes(1);
    expect(loop.state).toBeNull();
  });
});

describe('startPayload', () => {
  it('carries the session game, mode and optional level', () => {
    const { s } = fakeSession(true);
    const p = startPayload(s, 'god', 2);
    expect(p).toMatchObject({ game: 'bubble', mode: 'god', levelIndex: 2, players: [{ id: 'h', name: 'h', color: 0xff0000 }] });
    expect('levelIndex' in startPayload(s, 'pvp')).toBe(false);
  });
});

describe('keepPresses', () => {
  it('keeps a press that no step has seen yet, takes other fields from the newer input', () => {
    const a = { left: false, right: true, fire: true, seq: 3 };
    const b = { left: true, right: false, fire: false, seq: 4 };
    expect(keepPresses(a, b)).toEqual({ left: true, right: true, fire: true, seq: 4 });
    expect(keepPresses(undefined as unknown as typeof b, b)).toEqual(b);
  });
});
