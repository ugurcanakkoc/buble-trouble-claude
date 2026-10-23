// Bubble-specific client/host loop behavior (moved from ui/loop.test.ts when the loop went generic).
import { describe, expect, it } from 'vitest';
import { EMPTY_INPUT, createGame, newStats, type GameState, type InputState, type PlayerInfo } from '../../sim';
import type { StartPayload } from '../../net';
import { GameLoop } from '../../ui/loop';
import { Smoother } from '../../ui/render/smooth';
import { fakeSession } from '../../ui/testSession';
import { CLOUD_Y, bubbleLoopOptions, bubbleSim } from './sim';
import type { GameSim } from '../types';

const IDLE: InputState = { ...EMPTY_INPUT };

function mkState(players: PlayerInfo[]): GameState {
  return {
    tick: 0, rng: 1, levelIndex: 0, phase: 'playing', phaseUntil: 0, timeLeftTicks: 6000, lives: 5,
    freezeUntil: 0, nextId: 10, balls: [], projectiles: [], powerUps: [], blocks: [], mode: 'classic', god: null, timeBonus: 0,
    players: players.map((p, i) => ({
      ...p, x: 100 + i * 100, y: 480, facing: 1, weapon: 'harpoon', shield: false, score: 0,
      invulnUntil: 0, connected: true, fireHeld: false, nextFireTick: 0, trapped: false, combo: 1, comboUntil: 0, stats: newStats(),
    })),
  };
}

// real bubble ownPos/setOwnPos, trivial step so snapshots stay predictable
const testSim: GameSim<GameState, InputState, never> = {
  ...bubbleSim,
  createGame: (_seed, players) => mkState(players),
  step: (s) => {
    s.tick++;
    return [];
  },
};

const payload: StartPayload = {
  seed: 1, game: 'bubble', mode: 'classic', levelIndex: 0,
  players: [{ id: 'h', name: 'h', color: 1 }, { id: 'c', name: 'c', color: 2 }],
};

function client() {
  const { s, emit } = fakeSession(false);
  const smooth = new Smoother();
  const loop = new GameLoop(s, testSim, bubbleLoopOptions('c', smooth));
  emit('start', payload);
  return { s, emit, loop, smooth };
}

const god = (x: number, charge: number) => ({
  godId: 'c', x, mana: 5, charge, chargeStart: 10, nextDropTick: 0, round: 0, roundEndsTick: 0,
  roundWins: {}, order: ['c', 'h'], aiTargetX: 0, aiTargetSize: 0,
});

describe('bubble adapter', () => {
  it('creates real games through the GameSim contract', () => {
    const s = bubbleSim.createGame(7, payload.players, 'classic', 2);
    expect(s).toEqual(createGame(7, payload.players, 2, 'classic'));
    expect(bubbleSim.createGame(7, payload.players, 'rain').mode).toBe('rain');
  });

  it('host takes a client-reported x, but not for trapped players or keepalives', () => {
    const { s, emit } = fakeSession(true);
    const loop = new GameLoop(s, testSim);
    emit('start', payload);
    const c = () => loop.state!.players.find((p) => p.id === 'c')!;
    emit('input', 'c', IDLE, { x: 444, y: 0 });
    expect(c().x).toBe(444);
    emit('input', 'c', IDLE, undefined);
    expect(c().x).toBe(444);
    c().trapped = true;
    emit('input', 'c', IDLE, { x: 10, y: 0 });
    expect(c().x).toBe(444);
  });

  it('host marks players that left presence as disconnected', () => {
    const { s, emit } = fakeSession(true);
    const loop = new GameLoop(s, testSim);
    emit('start', payload);
    emit('players', [s.self]);
    expect(loop.state!.players.find((p) => p.id === 'c')!.connected).toBe(false);
  });

  it('client sends its floor x, or cloud x while god', () => {
    const { s, loop } = client();
    loop.state!.players[1].x = 321;
    loop.setLocalInput({ ...IDLE, right: true });
    expect(s.sendInput).toHaveBeenLastCalledWith({ ...IDLE, right: true }, { x: 321, y: 0 });
    loop.state!.god = god(250, -1);
    loop.setLocalInput(IDLE);
    expect(s.sendInput).toHaveBeenLastCalledWith(IDLE, { x: 250, y: CLOUD_Y });
  });

  it('client keeps own x unless far off or trapped', () => {
    const { emit, loop } = client();
    const localX = loop.state!.players.find((p) => p.id === 'c')!.x;

    const near = mkState(payload.players);
    near.players[1].x = localX + 100;
    near.players[0].x = 555;
    emit('snapshot', near);
    expect(loop.state!.players[1].x).toBe(localX);
    expect(loop.state!.players[0].x).toBe(555);

    const far = mkState(payload.players);
    far.players[1].x = localX + 150;
    emit('snapshot', far);
    expect(loop.state!.players[1].x).toBe(localX + 150);

    const trapped = mkState(payload.players);
    trapped.players[1].x = localX + 160;
    trapped.players[1].trapped = true;
    emit('snapshot', trapped);
    expect(loop.state!.players[1].x).toBe(localX + 160);
  });

  it('client keeps my own god cloud x (unless far off) and charge across snapshots', () => {
    const { emit, loop } = client();
    loop.state!.god = god(300, 2);
    const near = mkState(payload.players);
    near.god = god(450, -1);
    emit('snapshot', near);
    expect(loop.state!.god!.x).toBe(300);
    expect(loop.state!.god!.charge).toBe(2);
    const far = mkState(payload.players);
    far.god = god(520, -1);
    emit('snapshot', far);
    expect(loop.state!.god!.x).toBe(520);
  });

  it('client synthesizes pop events for balls that disappeared in a snapshot', () => {
    const { emit, loop } = client();
    loop.state!.balls.push({ id: 1, x: 10, y: 20, vx: 0, vy: 0, size: 2, color: 0xff0000 });
    emit('snapshot', mkState(payload.players));
    expect(loop.update(0)).toEqual([{ type: 'pop', x: 10, y: 20, size: 2, playerId: '', points: 0, combo: 1 }]);
  });

  it('client smooths snapshot jumps of balls and other players, never my own player', () => {
    const { emit, loop, smooth } = client();
    loop.state!.balls.push({ id: 1, x: 100, y: 100, vx: 0, vy: 0, size: 1, color: 1 });
    const snap = mkState(payload.players);
    snap.balls.push({ id: 1, x: 110, y: 100, vx: 0, vy: 0, size: 1, color: 1 });
    snap.players[0].x += 20; // host player (other)
    emit('snapshot', snap);
    expect(smooth.at('b1', 110, 100)).toEqual({ x: 100, y: 100 });
    expect(smooth.at('ph', snap.players[0].x, 480).x).toBe(snap.players[0].x - 20);
    expect(smooth.at('pc', 5, 5)).toEqual({ x: 5, y: 5 });
  });
});
