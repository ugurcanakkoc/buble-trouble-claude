// Test-only helper: an in-memory RoomSession whose callbacks are fired by hand. (Not imported by the app.)
import { vi } from 'vitest';
import type { LobbyPlayer, RoomSession } from '../net';

export function fakeSession(isHost: boolean, selfId = isHost ? 'h' : 'c') {
  const cbs: Record<string, ((...a: any[]) => void)[]> = {};
  const on = (k: string) => (cb: (...a: any[]) => void) => {
    (cbs[k] ??= []).push(cb);
    return () => void (cbs[k] = cbs[k].filter((f) => f !== cb));
  };
  const self: LobbyPlayer = { id: selfId, name: selfId, color: 0xff0000, isHost };
  const s = {
    code: 'ABCD',
    self,
    isHost,
    game: 'bubble',
    players: () => [self],
    onPlayersChange: on('players'),
    startGame: vi.fn(),
    sendSnapshot: vi.fn(),
    onInput: on('input'),
    onStart: on('start'),
    sendInput: vi.fn(),
    onSnapshot: on('snapshot'),
    onHostLeft: on('hostLeft'),
    linkInfo: () => ({ mode: 'relay' as const, rttMs: null }),
    leave: vi.fn(async () => {}),
  } satisfies RoomSession;
  const emit = (k: string, ...a: any[]) => cbs[k]?.forEach((f) => f(...a));
  return { s, emit };
}
