// WebRTC star mesh: host <-> each client over DataChannels, with the Supabase relay as fallback.
// Host is always the offerer (no glare). Every (re)try builds a fresh RTCPeerConnection tagged with a
// `gen`; signals for any other gen are dropped. send() returning false means "use the relay".
//
// Message size: payloads > 16 KB go on the reliable 'r' channel (an unreliable message is lost if ANY
// of its ~1200 B SCTP fragments is lost, so big ones would vanish far more often on mobile links).
// Anything above pc.sctp.maxMessageSize returns false -> relay.

export interface RtcSignal {
  from: string;
  to: string;
  kind: 'offer' | 'answer' | 'ice' | 'hello' | 'bye';
  data?: unknown;
}
export interface SignalBus {
  send(payload: RtcSignal): void;
  on(cb: (payload: RtcSignal) => void): () => void;
}
export type LinkMode = 'connecting' | 'p2p' | 'relay';
export interface PeerMesh {
  /** true if delivered over P2P; false -> caller must use the relay. '*' = all peers (true only if ALL got it; false if none). */
  send(to: string, event: string, payload: unknown, opts?: { reliable?: boolean }): boolean;
  on(event: string, cb: (from: string, payload: unknown) => void): () => void;
  mode(peer: string): LinkMode;
  rtt(peer: string): { ms: number; jitter: number } | null;
  peers(): string[];
  setPeers(ids: string[]): void;
  close(): void;
}

export const STUN_URLS = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'];
export const TIMEOUT_MS = 5000; // no link by then -> 'relay'
export const RETRY_MS = 15000; // host re-offers this often while not p2p
export const PING_MS = 1000;
export const STALE_MS = 3500; // no traffic for this long -> treat link as dead (send returns false)
export const BIG_BYTES = 16 * 1024;
const MAX_BUFFERED = 1 << 20; // congested channel -> let the relay carry it
const TICK_MS = 250;
const PING = '\u0000ping';
const PONG = '\u0000pong';

type Sdp = { type: RTCSdpType; sdp?: string };
interface Peer {
  id: string;
  pc?: RTCPeerConnection;
  u?: RTCDataChannel;
  r?: RTCDataChannel;
  gen: number;
  tried: number; // when the current attempt started
  deadline: number;
  relay: boolean; // sticky after a timeout/drop until the link opens again
  nextTry: number; // host: next re-offer; client: next hello
  lastSeen: number;
  lastPing: number;
  ice: RTCIceCandidateInit[]; // candidates received before remoteDescription
  rtt: { ms: number; jitter: number } | null;
}

const enc = new TextEncoder();

export function createPeerMesh(opts: {
  selfId: string;
  isHost: boolean;
  signal: SignalBus;
  rtcConfig?: RTCConfiguration;
  log?: (msg: string) => void;
}): PeerMesh {
  const { selfId, isHost, signal } = opts;
  const log = opts.log ?? (() => {});
  const rtcConfig = opts.rtcConfig ?? { iceServers: [{ urls: STUN_URLS }] };
  const peers = new Map<string, Peer>();
  const handlers = new Map<string, Set<(from: string, payload: unknown) => void>>();
  const now = () => performance.now();
  let closed = false;

  const isOpen = (p: Peer) => p.u?.readyState === 'open' && p.r?.readyState === 'open';
  const live = (p: Peer) => isOpen(p) && now() - p.lastSeen < STALE_MS;
  const sig = (to: string, kind: RtcSignal['kind'], data?: unknown) => signal.send({ from: selfId, to, kind, data });
  const raw = (dc: RTCDataChannel | undefined, e: string, p: unknown) => {
    if (dc?.readyState === 'open') dc.send(JSON.stringify({ e, p }));
  };

  function teardown(p: Peer) {
    for (const dc of [p.u, p.r]) {
      if (!dc) continue;
      dc.onopen = dc.onclose = dc.onmessage = null;
      dc.close();
    }
    if (p.pc) {
      p.pc.onicecandidate = p.pc.onconnectionstatechange = p.pc.ondatachannel = null;
      p.pc.close();
    }
    p.pc = p.u = p.r = undefined;
    p.rtt = null;
    p.ice = [];
  }

  function dropped(p: Peer, why: string) {
    if (!p.pc) return;
    log(`p2p ${p.id}: ${why} -> relay`);
    teardown(p);
    p.relay = true;
    if (isHost) p.nextTry = Math.min(p.nextTry, now() + 1000); // re-attempt soon
  }

  function onData(p: Peer, data: unknown) {
    if (typeof data !== 'string') return;
    let m: { e: string; p: unknown };
    try {
      m = JSON.parse(data);
    } catch {
      return;
    }
    p.lastSeen = now();
    if (m.e === PING) return raw(p.u, PONG, m.p);
    if (m.e === PONG) {
      const s = now() - (m.p as number);
      p.rtt = p.rtt
        ? { ms: p.rtt.ms + (s - p.rtt.ms) / 4, jitter: p.rtt.jitter + (Math.abs(s - p.rtt.ms) - p.rtt.jitter) / 4 }
        : { ms: s, jitter: 0 };
      return;
    }
    handlers.get(m.e)?.forEach((cb) => cb(p.id, m.p));
  }

  function wire(p: Peer, dc: RTCDataChannel) {
    dc.onopen = () => {
      if (!isOpen(p)) return;
      p.lastSeen = now();
      p.relay = false;
      log(`p2p ${p.id}: open`);
    };
    dc.onclose = () => dropped(p, `channel ${dc.label} closed`);
    dc.onmessage = (ev) => onData(p, ev.data);
    if (dc.readyState === 'open') dc.onopen(new Event('open'));
  }

  function newPc(p: Peer, gen: number) {
    teardown(p);
    const pc = new RTCPeerConnection(rtcConfig);
    p.pc = pc;
    p.gen = gen;
    p.tried = now();
    p.deadline = p.tried + TIMEOUT_MS;
    pc.onicecandidate = (e) => e.candidate && sig(p.id, 'ice', { gen, c: e.candidate.toJSON() });
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'failed' || s === 'closed') dropped(p, `pc ${s}`);
      else if (s === 'disconnected') p.lastSeen = -Infinity; // fall back now; resumes if traffic comes back
    };
    return pc;
  }

  const desc = (d: RTCSessionDescription | null): Sdp | undefined => (d ? { type: d.type, sdp: d.sdp } : undefined);

  async function remote(p: Peer, pc: RTCPeerConnection, sdp: Sdp) {
    await pc.setRemoteDescription(sdp);
    for (const c of p.ice.splice(0)) await pc.addIceCandidate(c).catch((e) => log(`p2p ice: ${e}`));
  }

  async function connect(p: Peer) {
    try {
      // inside try: the constructor throws where WebRTC is blocked/unavailable -> stay on relay
      p.nextTry = now() + RETRY_MS;
      const pc = newPc(p, p.gen + 1);
      const gen = p.gen;
      p.u = pc.createDataChannel('u', { ordered: false, maxRetransmits: 0 });
      p.r = pc.createDataChannel('r');
      wire(p, p.u);
      wire(p, p.r);
      await pc.setLocalDescription(await pc.createOffer());
      if (p.pc === pc) sig(p.id, 'offer', { gen, sdp: desc(pc.localDescription) });
    } catch (e) {
      log(`p2p offer ${p.id}: ${e}`);
    }
  }

  async function answer(p: Peer, gen: number, sdp: Sdp) {
    try {
      const pc = newPc(p, gen);
      pc.ondatachannel = (e) => {
        const dc = e.channel;
        if (dc.label === 'u') p.u = dc;
        else if (dc.label === 'r') p.r = dc;
        else return;
        wire(p, dc);
      };
      await remote(p, pc, sdp);
      await pc.setLocalDescription(await pc.createAnswer());
      if (p.pc === pc) sig(p.id, 'answer', { gen, sdp: desc(pc.localDescription) });
    } catch (e) {
      log(`p2p answer ${p.id}: ${e}`);
    }
  }

  function add(id: string, hello = true) {
    const t = now();
    const p: Peer = { id, gen: 0, tried: t, deadline: t + TIMEOUT_MS, relay: false, nextTry: 0, lastSeen: 0, lastPing: 0, ice: [], rtt: null };
    peers.set(id, p);
    if (isHost) void connect(p);
    else {
      if (hello) sig(id, 'hello'); // host may have offered before we listened
      p.nextTry = t + 2 * RETRY_MS;
    }
    return p;
  }

  function remove(id: string) {
    const p = peers.get(id);
    if (!p) return;
    sig(id, 'bye');
    teardown(p);
    peers.delete(id);
  }

  const offSignal = signal.on((s) => {
    if (closed || s.to !== selfId || s.from === selfId) return;
    const d = (s.data ?? {}) as { gen?: number; sdp?: Sdp; c?: RTCIceCandidateInit };
    let p = peers.get(s.from);
    if (!p) {
      if (isHost || s.kind !== 'offer') return; // host learns clients from presence only
      p = add(s.from, false);
    }
    const pc = p.pc;
    switch (s.kind) {
      case 'hello':
        if (isHost && !live(p) && now() - p.tried > 1500) void connect(p);
        break;
      case 'offer':
        if (!isHost && d.sdp) {
          p.nextTry = now() + 2 * RETRY_MS; // host is alive and retrying; no hello needed
          void answer(p, d.gen ?? 0, d.sdp);
        }
        break;
      case 'answer':
        if (isHost && pc && d.gen === p.gen && d.sdp && !pc.remoteDescription)
          remote(p, pc, d.sdp).catch((e) => log(`p2p answer-in ${p.id}: ${e}`));
        break;
      case 'ice':
        if (!pc || d.gen !== p.gen || !d.c) break;
        if (pc.remoteDescription) pc.addIceCandidate(d.c).catch((e) => log(`p2p ice: ${e}`));
        else p.ice.push(d.c);
        break;
      case 'bye':
        dropped(p, 'bye');
        p.relay = true;
        p.nextTry = now() + RETRY_MS;
        break;
    }
  });

  const timer = setInterval(() => {
    const t = now();
    for (const p of peers.values()) {
      if (isOpen(p) && t - p.lastPing >= PING_MS) {
        p.lastPing = t;
        raw(p.u, PING, t);
      }
      if (live(p)) continue;
      if (!p.relay && t > p.deadline) {
        p.relay = true;
        log(`p2p ${p.id}: no link -> relay`);
      }
      if (t < p.nextTry) continue;
      if (isHost) void connect(p);
      else {
        sig(p.id, 'hello');
        p.nextTry = t + 2 * RETRY_MS;
      }
    }
  }, TICK_MS);

  function sendTo(p: Peer, s: string, reliable: boolean) {
    if (!live(p)) return false;
    const bytes = s.length * 3 > BIG_BYTES ? enc.encode(s).length : s.length;
    if (bytes > (p.pc?.sctp?.maxMessageSize || 65536)) return false;
    const dc = (reliable || bytes > BIG_BYTES ? p.r : p.u)!;
    if (dc.bufferedAmount > MAX_BUFFERED) return false;
    try {
      dc.send(s);
      return true;
    } catch {
      return false;
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    for (const id of [...peers.keys()]) remove(id);
    clearInterval(timer);
    offSignal();
    globalThis.removeEventListener?.('pagehide', close);
  }
  globalThis.addEventListener?.('pagehide', close);

  return {
    send(to, event, payload, o) {
      if (closed) return false;
      const s = JSON.stringify({ e: event, p: payload });
      const rel = !!o?.reliable;
      if (to !== '*') {
        const p = peers.get(to);
        return !!p && sendTo(p, s, rel);
      }
      let all = peers.size > 0;
      for (const p of peers.values()) all = sendTo(p, s, rel) && all;
      return all;
    },
    on(event, cb) {
      let set = handlers.get(event);
      if (!set) handlers.set(event, (set = new Set()));
      set.add(cb);
      return () => void set.delete(cb);
    },
    mode(id) {
      const p = peers.get(id);
      if (!p) return 'relay';
      if (live(p)) return 'p2p';
      return p.relay || now() > p.deadline ? 'relay' : 'connecting';
    },
    rtt(id) {
      const p = peers.get(id);
      return p && live(p) ? p.rtt : null;
    },
    peers: () => [...peers.keys()],
    setPeers(ids) {
      if (closed) return;
      const want = new Set(ids.filter((i) => i !== selfId));
      for (const id of [...peers.keys()]) if (!want.has(id)) remove(id);
      for (const id of want) if (!peers.has(id)) add(id);
    },
    close,
  };
}
