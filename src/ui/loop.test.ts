import { describe, expect, it, vi } from 'vitest';
import { EMPTY_INPUT, type GameState, type InputState, type PlayerId, type PlayerInfo } from '../sim';
import type { LobbyPlayer, RoomSession, StartPayload } from '../net';
import { GameLoop, STEP_MS, type SimFns } from './loop';

const IDLE: InputState = { ...EMPTY_INPUT };

function fakeSession(isHost: boolean, selfId = isHost ? 'h' : 'c') {
  const cbs: Record<string, ((...a: any[]) => void)[]> = {};
  const on = (k: string) => (cb: (...a: any[]) => void) => {
    (cbs[k] ??= []).push(cb);
    return () => (cbs[k] = cbs[k].filter((f) => f !== cb));
  };
  const self: LobbyPlayer = { id: selfId, name: selfId, color: 0xff0000, isHost };
  const s = {
    code: 'ABCD',
    self,
    isHost,
    players: () => [self],
    onPlayersChange: on('players'),
    startGame: vi.fn(),
    sendSnapshot: vi.fn(),
    onInput: on('input'),
    onStart: on('start'),
    sendInput: vi.fn(),
    onSnapshot: on('snapshot'),
    onHostLeft: on('hostLeft'),
    leave: vi.fn(async () => {}),
  } satisfies RoomSession;
  const emit = (k: string, ...a: any[]) => cbs[k]?.forEach((f) => f(...a));
  return { s, emit };
}

function mkState(players: PlayerInfo[]): GameState {
  return {
    tick: 0, rng: 1, levelIndex: 0, phase: 'playing', phaseUntil: 0, timeLeftTicks: 6000, lives: 5,
    freezeUntil: 0, nextId: 10, balls: [], projectiles: [], powerUps: [], blocks: [], mode: 'classic', god: null,
    players: players.map((p, i) => ({
      ...p, x: 100 + i * 100, y: 480, facing: 1, weapon: 'harpoon', shield: false, score: 0,
      invulnUntil: 0, connected: true, fireHeld: false, nextFireTick: 0, trapped: false, combo: 1, comboUntil: 0,
    })),
  };
}

function fakeSim() {
  const calls: Record<PlayerId, InputState>[] = [];
  const sim: SimFns = {
    createGame: (_seed, players) => mkState(players),
    step: (state, inputs) => {
      calls.push(inputs);
      state.tick++;
      const me = state.players[0];
      if (inputs[me.id]?.right) me.x += 1;
      return [];
    },
  };
  return { sim, calls };
}

const payload: StartPayload = {
  seed: 1,
  players: [{ id: 'h', name: 'h', color: 1 }, { id: 'c', name: 'c', color: 2 }],
  levelIndex: 0,
  mode: 'classic',
};

describe('GameLoop host', () => {
  it('runs fixed 60 Hz steps with an accumulator and caps catch-up at 5', () => {
    const { s, emit } = fakeSession(true);
    const { sim, calls } = fakeSim();
    const loop = new GameLoop(s, sim);
    emit('start', payload);
    loop.update(STEP_MS * 0.5);
    expect(calls.length).toBe(0);
    loop.update(STEP_MS * 0.6); // 1.1 steps accumulated
    expect(calls.length).toBe(1);
    loop.update(STEP_MS * 2);
    expect(calls.length).toBe(3);
    loop.update(1000); // huge hitch
    expect(calls.length).toBe(8);
    loop.update(STEP_MS * 0.5); // backlog dropped, not replayed
    expect(calls.length).toBe(8);
  });

  it('broadcasts a snapshot every 8 ticks', () => {
    const { s, emit } = fakeSession(true);
    const loop = new GameLoop(s, fakeSim().sim);
    emit('start', payload);
    for (let i = 0; i < 7; i++) loop.update(STEP_MS);
    expect(s.sendSnapshot).not.toHaveBeenCalled();
    for (let i = 0; i < 17; i++) loop.update(STEP_MS);
    expect(s.sendSnapshot).toHaveBeenCalledTimes(3);
  });

  it('feeds local input + latest remote input per player', () => {
    const { s, emit } = fakeSession(true);
    const { sim, calls } = fakeSim();
    const loop = new GameLoop(s, sim);
    emit('start', payload);
    loop.setLocalInput({ ...IDLE, fire: true });
    emit('input', 'c', { ...IDLE, left: true });
    loop.update(STEP_MS);
    expect(calls[0].h.fire).toBe(true);
    expect(calls[0].c.left).toBe(true);
    expect(s.sendInput).not.toHaveBeenCalled();
  });

  it('marks players that left presence as disconnected', () => {
    const { s, emit } = fakeSession(true);
    const loop = new GameLoop(s, fakeSim().sim);
    emit('start', payload);
    emit('players', [s.self]);
    expect(loop.state!.players.find((p) => p.id === 'c')!.connected).toBe(false);
  });
});

describe('GameLoop client', () => {
  it('sends input only when it changes', () => {
    const { s, emit } = fakeSession(false);
    const loop = new GameLoop(s, fakeSim().sim);
    emit('start', payload);
    loop.setLocalInput(IDLE);
    loop.setLocalInput(IDLE);
    expect(s.sendInput).toHaveBeenCalledTimes(1);
    loop.setLocalInput({ ...IDLE, right: true });
    loop.setLocalInput({ ...IDLE, right: true });
    expect(s.sendInput).toHaveBeenCalledTimes(2);
    loop.update(1100); // no keepalive here: the net layer owns that
    expect(s.sendInput).toHaveBeenCalledTimes(2);
    expect(s.sendSnapshot).not.toHaveBeenCalled();
  });

  it('predicts locally with own input and idle input for others', () => {
    const { s, emit } = fakeSession(false);
    const { sim, calls } = fakeSim();
    const loop = new GameLoop(s, sim);
    emit('start', payload);
    loop.setLocalInput({ ...IDLE, fire: true });
    loop.update(STEP_MS);
    expect(calls[0].c.fire).toBe(true);
    expect(calls[0].h).toEqual(IDLE);
  });

  it('reconciles softly: keeps own x within 24 units, snaps beyond', () => {
    const { s, emit } = fakeSession(false);
    const loop = new GameLoop(s, fakeSim().sim);
    emit('start', payload);
    const localX = loop.state!.players.find((p) => p.id === 'c')!.x;

    const near = mkState(payload.players);
    near.players[1].x = localX + 20;
    near.players[0].x = 555;
    emit('snapshot', near);
    expect(loop.state!.players[1].x).toBe(localX);
    expect(loop.state!.players[0].x).toBe(555); // others always taken from snapshot

    const far = mkState(payload.players);
    far.players[1].x = localX + 30;
    emit('snapshot', far);
    expect(loop.state!.players[1].x).toBe(localX + 30);
  });

  it('keeps my own god cloud x (within 60) and charge across snapshots', () => {
    const { s, emit } = fakeSession(false);
    const loop = new GameLoop(s, fakeSim().sim);
    emit('start', payload);
    const god = (x: number, charge: number) => ({
      godId: 'c', x, mana: 5, charge, chargeStart: 10, nextDropTick: 0, round: 0, roundEndsTick: 0,
      roundWins: {}, order: ['c', 'h'], aiTargetX: 0, aiTargetSize: 0,
    });
    loop.state!.god = god(300, 2);
    const near = mkState(payload.players);
    near.god = god(340, -1);
    emit('snapshot', near);
    expect(loop.state!.god!.x).toBe(300);
    expect(loop.state!.god!.charge).toBe(2);
    const far = mkState(payload.players);
    far.god = god(400, -1);
    emit('snapshot', far);
    expect(loop.state!.god!.x).toBe(400);
  });

  it('synthesizes pop events for balls that disappeared in a snapshot', () => {
    const { s, emit } = fakeSession(false);
    const loop = new GameLoop(s, fakeSim().sim);
    emit('start', payload);
    loop.state!.balls.push({ id: 1, x: 10, y: 20, vx: 0, vy: 0, size: 2, color: 0xff0000 });
    emit('snapshot', mkState(payload.players));
    const ev = loop.update(0);
    expect(ev).toEqual([{ type: 'pop', x: 10, y: 20, size: 2, playerId: '', points: 0, combo: 1 }]);
  });

  it('calls onHostLeft and unsubscribes on dispose', () => {
    const { s, emit } = fakeSession(false);
    const left = vi.fn();
    const loop = new GameLoop(s, fakeSim().sim, left);
    emit('hostLeft');
    expect(left).toHaveBeenCalledTimes(1);
    loop.dispose();
    emit('hostLeft');
    emit('start', payload);
    expect(left).toHaveBeenCalledTimes(1);
    expect(loop.state).toBeNull();
  });
});
