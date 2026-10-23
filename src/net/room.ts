import type { RealtimeChannel } from '@supabase/supabase-js';
import type { GameState, InputState, PlayerId } from '../sim/types';
import { EMPTY_INPUT } from '../sim/types';
import { HOST_COLOR, JOINER_COLORS, generateCode, joinError, normalizeCode, parsePresence, pickColor, toLobby } from './lobby';
import type { PresenceMeta } from './lobby';
import { supabase } from './supabase';
import type { LobbyPlayer, RoomApi, RoomSession, StartPayload } from './types';

const SYNC_TIMEOUT_MS = 3000;
const KEEPALIVE_MS = 3000;

type Metas = Record<string, Array<Partial<PresenceMeta>>>;
const presenceOf = (ch: RealtimeChannel) => parsePresence(ch.presenceState() as unknown as Metas);

function listeners<T extends unknown[]>() {
  const set = new Set<(...a: T) => void>();
  return {
    add(cb: (...a: T) => void) {
      set.add(cb);
      return () => void set.delete(cb);
    },
    emit: (...a: T) => set.forEach((cb) => cb(...a)),
  };
}

/** Open channel; `ready` resolves with presence after SUBSCRIBED + first sync, rejects 'NETWORK'. */
function open(code: string, key: string) {
  const ch = supabase.channel(`room:${code}`, { config: { broadcast: { self: false }, presence: { key } } });
  // supabase-js forbids adding presence callbacks after subscribe(), so everything is registered here.
  const hub = {
    onSync: () => {},
    start: listeners<[StartPayload]>(),
    input: listeners<[PlayerId, InputState, number | undefined]>(),
    snap: listeners<[GameState, Record<PlayerId, InputState>]>(),
  };
  let onFirstSync!: () => void;
  const synced = new Promise<void>((r) => (onFirstSync = r));
  ch.on('presence', { event: 'sync' }, () => {
    onFirstSync();
    hub.onSync();
  });
  // broadcast payloads are untyped at the supabase boundary; we trust our own peers
  ch.on('broadcast', { event: 'start' }, (m) => hub.start.emit(m.payload as StartPayload));
  ch.on('broadcast', { event: 'snapshot' }, (m) => {
    const p = m.payload as { state: GameState; inputs: Record<PlayerId, InputState> };
    hub.snap.emit(p.state, p.inputs ?? {});
  });
  ch.on('broadcast', { event: 'input' }, (m) => {
    const p = m.payload as { playerId: PlayerId; input: InputState; x?: number };
    hub.input.emit(p.playerId, p.input, p.x);
  });
  const subscribed = new Promise<void>((res, rej) =>
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') res();
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') rej(new Error('NETWORK'));
    }),
  );
  const timer = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('NETWORK')), SYNC_TIMEOUT_MS));
  const ready = Promise.race([Promise.all([subscribed, synced]), timer]).then(() => presenceOf(ch));
  return { ch, ready, hub };
}

type Hub = ReturnType<typeof open>['hub'];

function makeSession(ch: RealtimeChannel, hub: Hub, code: string, meta: PresenceMeta): RoomSession {
  const isHost = meta.isHost;
  const self: LobbyPlayer = { id: meta.id, name: meta.name, color: meta.color, isHost };
  const playersL = listeners<[LobbyPlayer[]]>();
  const { start: startL, input: inputL, snap: snapL } = hub;
  const hostLeftL = listeners<[]>();
  let current = toLobby(presenceOf(ch));
  let hostSeen = current.some((p) => p.isHost);
  let left = false;
  let lastInput: InputState = EMPTY_INPUT;
  let keepalive: ReturnType<typeof setInterval> | undefined;

  const send = (event: string, payload: unknown) => void ch.send({ type: 'broadcast', event, payload });

  hub.onSync = () => {
    current = toLobby(presenceOf(ch));
    playersL.emit(current);
    const hasHost = current.some((p) => p.isHost);
    if (!isHost && hostSeen && !hasHost && !left) hostLeftL.emit();
    hostSeen = hostSeen || hasHost;
  };

  const onHide = () => void leave();
  async function leave() {
    if (left) return;
    left = true;
    clearInterval(keepalive);
    window.removeEventListener('pagehide', onHide);
    await ch.untrack().catch(() => undefined);
    await supabase.removeChannel(ch);
  }
  window.addEventListener('pagehide', onHide);

  return {
    code,
    self,
    isHost,
    players: () => current,
    onPlayersChange: playersL.add,
    startGame(payload) {
      void ch.track({ ...meta, inGame: true });
      send('start', payload);
      startL.emit(payload); // self broadcast is off
    },
    sendSnapshot: (state, inputs) => send('snapshot', { state, inputs }),
    onInput: inputL.add,
    onStart: startL.add,
    sendInput(input, x) {
      lastInput = input;
      send('input', { playerId: self.id, input, x });
      // keepalive omits x: a stale position would yank the player back on the host
      keepalive ??= setInterval(() => send('input', { playerId: self.id, input: lastInput }), KEEPALIVE_MS);
    },
    onSnapshot: snapL.add,
    onHostLeft: hostLeftL.add,
    leave,
  };
}

const newMeta = (name: string, isHost: boolean, color: number): PresenceMeta => ({
  id: crypto.randomUUID(), name, color, isHost, inGame: false, online_at: Date.now(),
});

async function fail(ch: RealtimeChannel, e: unknown): Promise<never> {
  await supabase.removeChannel(ch).catch(() => undefined);
  throw e instanceof Error && /^(ROOM_|GAME_|NETWORK)/.test(e.message) ? e : new Error('NETWORK');
}

export const roomApi: RoomApi = {
  async createRoom(name) {
    const meta = newMeta(name, true, HOST_COLOR);
    for (let i = 0; i < 8; i++) {
      const code = generateCode();
      const { ch, ready, hub } = open(code, meta.id);
      let occupied: PresenceMeta[];
      try {
        occupied = await ready;
      } catch (e) {
        return fail(ch, e);
      }
      if (occupied.length > 0) {
        await supabase.removeChannel(ch);
        continue;
      }
      const session = makeSession(ch, hub, code, meta);
      await ch.track(meta);
      return session;
    }
    throw new Error('NETWORK');
  },

  async joinRoom(code, name) {
    code = normalizeCode(code);
    const probe = newMeta(name, false, JOINER_COLORS[0]);
    const { ch, ready, hub } = open(code, probe.id);
    try {
      let present = await ready;
      // first sync can be partial (live test: host appeared ~1-3s late); give the host a moment to show up
      for (let i = 0; i < 8 && !present.some((p) => p.isHost); i++) {
        await new Promise((r) => setTimeout(r, 250));
        present = presenceOf(ch);
      }
      const err = joinError(present);
      if (err) throw new Error(err);
      const meta = { ...probe, color: pickColor(present.map((p) => p.color)) };
      const session = makeSession(ch, hub, code, meta);
      await ch.track(meta);
      return session;
    } catch (e) {
      return fail(ch, e);
    }
  },
};
