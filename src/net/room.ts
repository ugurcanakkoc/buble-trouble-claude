import type { RealtimeChannel } from '@supabase/supabase-js';
import type { PlayerId } from '../sim/types';
import type { GameId } from '../games/types';
import { DEFAULT_MAX, HOST_COLOR, JOINER_COLORS, generateCode, joinError, normalizeCode, parsePresence, pickColor, toLobby } from './lobby';
import type { PresenceMeta } from './lobby';
import { createPeerMesh, type LinkMode, type RtcSignal } from './p2p';
import { supabase } from './supabase';
import { createTransport, netStats, type Route, type WireMsg } from './transport';
import type { LobbyPlayer, Pos, RoomApi, RoomSession, StartPayload } from './types';

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
    input: listeners<[PlayerId, unknown, Pos | undefined]>(),
    snap: listeners<[unknown, Record<PlayerId, unknown>]>(),
    recv: (_via: Route, _event: string, _payload: unknown) => {}, // game messages; set by makeSession
    rtc: listeners<[RtcSignal]>(),
  };
  let onFirstSync!: () => void;
  const synced = new Promise<void>((r) => (onFirstSync = r));
  ch.on('presence', { event: 'sync' }, () => {
    onFirstSync();
    hub.onSync();
  });
  // broadcast payloads are untyped at the supabase boundary; we trust our own peers
  ch.on('broadcast', { event: 'start' }, (m) => hub.start.emit(m.payload as StartPayload));
  for (const event of ['snapshot', 'input']) ch.on('broadcast', { event }, (m) => hub.recv('relay', event, m.payload));
  // WebRTC signaling rides the same channel (registered before subscribe so the host's first offer isn't lost)
  ch.on('broadcast', { event: 'rtc' }, (m) => {
    const sig = m.payload as RtcSignal;
    if (sig.to === key) hub.rtc.emit(sig);
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
  let lastInput: unknown = null;
  let keepalive: ReturnType<typeof setInterval> | undefined;

  const send = (event: string, payload: unknown) => void ch.send({ type: 'broadcast', event, payload });

  // P2P first, Supabase relay as fallback (see docs/p2p-integration.md)
  const mesh = createPeerMesh({
    selfId: meta.id,
    isHost,
    signal: { send: (sig) => send('rtc', sig), on: hub.rtc.add },
    log: (m) => console.debug(m),
  });
  const hostId = () => current.find((p) => p.isHost)?.id;
  const net = createTransport({ selfId: meta.id, isHost, mesh, relay: send, hostId });
  type SnapMsg = WireMsg & { state: unknown; inputs?: Record<PlayerId, unknown> };
  type InputMsg = WireMsg & { playerId: PlayerId; input: unknown; pos?: Pos };
  hub.recv = (via, event, payload) => {
    if (left || !net.accept(event, payload as WireMsg, via)) return;
    if (event === 'snapshot' && !isHost) {
      const m = payload as SnapMsg;
      snapL.emit(m.state, m.inputs ?? {});
    } else if (event === 'input' && isHost) {
      const m = payload as InputMsg;
      inputL.emit(m.playerId, m.input, m.pos);
    }
  };
  const offMesh = ['snapshot', 'input'].map((event) => mesh.on(event, (_from, p) => hub.recv('p2p', event, p)));
  const syncPeers = () => {
    const h = hostId();
    mesh.setPeers(isHost ? current.filter((p) => !p.isHost).map((p) => p.id) : h ? [h] : []);
  };

  hub.onSync = () => {
    const before = new Set(current.map((p) => p.id));
    current = toLobby(presenceOf(ch));
    for (const id of before) if (!current.some((p) => p.id === id)) net.forget(id);
    syncPeers();
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
    offMesh.forEach((off) => off());
    mesh.close();
    await ch.untrack().catch(() => undefined);
    await supabase.removeChannel(ch);
  }
  window.addEventListener('pagehide', onHide);
  syncPeers();

  const linkInfo = (): { mode: LinkMode; rttMs: number | null } => {
    const ids = isHost ? mesh.peers() : [hostId()].filter((x): x is string => !!x);
    if (!ids.length) return { mode: 'relay', rttMs: null };
    const modes = ids.map((id) => mesh.mode(id));
    const mode: LinkMode = modes.includes('relay') ? 'relay' : modes.includes('connecting') ? 'connecting' : 'p2p';
    const rtts = ids.map((id) => mesh.rtt(id)?.ms ?? null);
    return { mode, rttMs: mode === 'p2p' && rtts.every((r) => r !== null) ? Math.max(...(rtts as number[])) : null };
  };

  return {
    code,
    self,
    isHost,
    game: meta.game,
    players: () => current,
    onPlayersChange: playersL.add,
    startGame(payload) {
      void ch.track({ ...meta, inGame: true });
      send('start', payload);
      startL.emit(payload); // self broadcast is off
    },
    sendSnapshot: (state, inputs) => void net.out('snapshot', { state, inputs }),
    onInput: inputL.add,
    onStart: startL.add,
    sendInput(input, pos) {
      lastInput = input;
      net.out('input', pos ? { playerId: self.id, input, pos } : { playerId: self.id, input });
      // keepalive omits pos: a stale position would yank the player back on the host
      keepalive ??= setInterval(() => net.out('input', { playerId: self.id, input: lastInput }), KEEPALIVE_MS);
    },
    onSnapshot: snapL.add,
    onHostLeft: hostLeftL.add,
    linkInfo,
    leave,
  };
}

const newMeta = (name: string, isHost: boolean, color: number, game: GameId = 'bubble', max = DEFAULT_MAX): PresenceMeta => ({
  id: crypto.randomUUID(), name, color, isHost, inGame: false, online_at: Date.now(), game, max,
});

async function fail(ch: RealtimeChannel, e: unknown): Promise<never> {
  await supabase.removeChannel(ch).catch(() => undefined);
  throw e instanceof Error && /^(ROOM_|GAME_|NETWORK)/.test(e.message) ? e : new Error('NETWORK');
}

// dev-only debug handle for Playwright: window.__net.sent.relay.snapshot etc.
if (import.meta.env.DEV) (globalThis as { __net?: unknown }).__net = netStats;

export const roomApi: RoomApi = {
  async createRoom(name, game, maxPlayers = DEFAULT_MAX) {
    const meta = newMeta(name, true, HOST_COLOR, game, maxPlayers);
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
      const host = present.find((p) => p.isHost);
      if (err) throw Object.assign(new Error(err), { max: host?.max ?? DEFAULT_MAX });
      // joiner adopts the host's game
      const meta = { ...probe, color: pickColor(present.map((p) => p.color)), game: host!.game, max: host!.max };
      const session = makeSession(ch, hub, code, meta);
      await ch.track(meta);
      return session;
    } catch (e) {
      return fail(ch, e);
    }
  },
};
