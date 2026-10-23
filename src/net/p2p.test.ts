import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPeerMesh, type PeerMesh, type RtcSignal } from './p2p';

// In-memory fake WebRTC: an answerer's pc links to the offerer whose localDescription it answered.
const net = { latency: 10, linkable: true };
let pcs: FakePC[] = [];

class FakeDC {
  readyState: RTCDataChannelState = 'connecting';
  bufferedAmount = 0;
  peer?: FakeDC;
  sent: string[] = [];
  onopen: ((e: Event) => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor(readonly label: string) {}
  send(s: string) {
    if (this.readyState !== 'open') throw new Error('not open');
    this.sent.push(s);
    const peer = this.peer;
    setTimeout(() => peer?.readyState === 'open' && peer.onmessage?.({ data: s }), net.latency);
  }
  close() {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    this.onclose?.();
    this.peer?.close();
  }
}

let nPc = 0;
class FakePC {
  id = ++nPc;
  channels: FakeDC[] = [];
  localDescription: { type: string; sdp: string } | null = null;
  remoteDescription: { type: string; sdp: string } | null = null;
  connectionState = 'new';
  sctp = { maxMessageSize: 262144 };
  onicecandidate: ((e: { candidate: unknown }) => void) | null = null;
  ondatachannel: ((e: { channel: FakeDC }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  constructor() {
    pcs.push(this);
  }
  createDataChannel(label: string) {
    const d = new FakeDC(label);
    this.channels.push(d);
    return d;
  }
  async createOffer() {
    return { type: 'offer', sdp: `pc${this.id}` };
  }
  async createAnswer() {
    return { type: 'answer', sdp: `pc${this.id}` };
  }
  async setLocalDescription(d: { type: string; sdp: string }) {
    this.localDescription = d;
    setTimeout(() => this.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: `c${this.id}`, sdpMid: '0' }) } }), 1);
  }
  async setRemoteDescription(d: { type: string; sdp: string }) {
    this.remoteDescription = d;
    const answerer = pcs.find((p) => p.localDescription?.sdp === d.sdp);
    if (d.type !== 'answer' || !answerer || !net.linkable) return;
    setTimeout(() => {
      if (this.connectionState === 'closed' || answerer.connectionState === 'closed') return;
      this.connectionState = answerer.connectionState = 'connected';
      for (const ch of this.channels) {
        const twin = new FakeDC(ch.label);
        ch.peer = twin;
        twin.peer = ch;
        answerer.channels.push(twin);
        answerer.ondatachannel?.({ channel: twin });
        ch.readyState = twin.readyState = 'open';
        ch.onopen?.(new Event('open'));
        twin.onopen?.(new Event('open'));
      }
    }, net.latency);
  }
  async addIceCandidate() {}
  close() {
    this.connectionState = 'closed';
    this.channels.forEach((c) => c.close());
  }
}

function bus() {
  const subs = new Set<(s: RtcSignal) => void>();
  return {
    send: (s: RtcSignal) => {
      const copy = JSON.parse(JSON.stringify(s)) as RtcSignal;
      setTimeout(() => subs.forEach((cb) => cb(copy)), 5);
    },
    on: (cb: (s: RtcSignal) => void) => {
      subs.add(cb);
      return () => void subs.delete(cb);
    },
  };
}

let meshes: PeerMesh[] = [];
let sig: ReturnType<typeof bus>;
const mk = (id: string, isHost = false) => {
  const m = createPeerMesh({ selfId: id, isHost, signal: sig });
  meshes.push(m);
  return m;
};
const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const lastPc = (pred: (p: FakePC) => boolean) => pcs.filter(pred).at(-1)!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
  vi.stubGlobal('RTCPeerConnection', FakePC);
  net.latency = 10;
  net.linkable = true;
  pcs = [];
  meshes = [];
  sig = bus();
});
afterEach(() => {
  meshes.forEach((m) => m.close());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function pair() {
  const host = mk('h', true);
  const client = mk('c');
  client.setPeers(['h']);
  host.setPeers(['c']);
  return { host, client };
}

describe('p2p mesh', () => {
  it('connects host <-> client and delivers both ways', async () => {
    const { host, client } = pair();
    expect(host.mode('c')).toBe('connecting');
    await wait(500);
    expect(host.mode('c')).toBe('p2p');
    expect(client.mode('h')).toBe('p2p');
    expect(client.peers()).toEqual(['h']);
    const got: unknown[] = [];
    host.on('input', (from, p) => got.push([from, p]));
    client.on('snapshot', (from, p) => got.push([from, p]));
    expect(client.send('h', 'input', { k: 1 })).toBe(true);
    expect(host.send('c', 'snapshot', { s: 2 })).toBe(true);
    await wait(50);
    expect(got).toEqual([
      ['c', { k: 1 }],
      ['h', { s: 2 }],
    ]);
  });

  it('client auto-accepts host offer before setPeers', async () => {
    const host = mk('h', true);
    const client = mk('c');
    host.setPeers(['c']);
    await wait(500);
    expect(client.mode('h')).toBe('p2p');
  });

  it('times out to relay, send returns false, retries in background', async () => {
    net.linkable = false;
    const { host, client } = pair();
    await wait(4500);
    expect(host.mode('c')).toBe('connecting');
    await wait(1000);
    expect(host.mode('c')).toBe('relay');
    expect(client.mode('h')).toBe('relay');
    expect(host.send('c', 'snapshot', {})).toBe(false);
    expect(host.rtt('c')).toBeNull();
    net.linkable = true;
    await wait(15000);
    expect(host.mode('c')).toBe('p2p');
    expect(client.send('h', 'x', 1)).toBe(true);
  });

  it("'*' is true only if all peers got it; removed peers are closed", async () => {
    const host = mk('h', true);
    const c1 = mk('c1');
    host.setPeers(['c1']);
    await wait(500);
    net.linkable = false;
    mk('c2');
    host.setPeers(['c1', 'c2']);
    await wait(6000);
    const got: unknown[] = [];
    c1.on('snap', (_f, p) => got.push(p));
    expect(host.send('*', 'snap', 1)).toBe(false);
    await wait(50);
    expect(got).toEqual([1]); // c1 still got it over p2p (caller relays too; receivers de-dup by seq)
    host.setPeers(['c1']);
    expect(host.peers()).toEqual(['c1']);
    expect(host.send('*', 'snap', 2)).toBe(true);
    host.setPeers([]);
    expect(host.send('*', 'snap', 3)).toBe(false);
  });

  it('routes by event and unsubscribes', async () => {
    const { host, client } = pair();
    await wait(500);
    const a: unknown[] = [];
    const b: unknown[] = [];
    const offA = host.on('a', (_f, p) => a.push(p));
    host.on('b', (_f, p) => b.push(p));
    client.send('h', 'a', 1);
    client.send('h', 'b', 2);
    await wait(50);
    offA();
    client.send('h', 'a', 3);
    await wait(50);
    expect(a).toEqual([1]);
    expect(b).toEqual([2]);
  });

  it('uses reliable channel for opts.reliable and > 16 KB payloads', async () => {
    const { host } = pair();
    await wait(500);
    const hostPc = lastPc((p) => p.channels.length > 0 && p.localDescription?.type === 'offer');
    const [u, r] = hostPc.channels;
    host.send('c', 'small', 1);
    host.send('c', 'start', 1, { reliable: true });
    host.send('c', 'big', 'x'.repeat(20000));
    const ev = (ch: FakeDC) => ch.sent.map((s) => JSON.parse(s).e).filter((e: string) => !e.startsWith('\u0000'));
    expect(ev(u)).toEqual(['small']);
    expect(ev(r)).toEqual(['start', 'big']);
    expect(host.send('c', 'huge', 'x'.repeat(300000))).toBe(false); // > maxMessageSize -> relay
  });

  it('falls back instantly on drop and reconnects', async () => {
    const { host, client } = pair();
    await wait(500);
    lastPc((p) => p.localDescription?.type === 'offer').channels[0].close(); // network drop
    expect(host.mode('c')).toBe('relay');
    expect(host.send('c', 'x', 1)).toBe(false);
    expect(client.mode('h')).toBe('relay');
    await wait(2000);
    expect(host.mode('c')).toBe('p2p');
    expect(client.mode('h')).toBe('p2p');
  });

  it('goes relay when traffic stalls (stale link)', async () => {
    const { host } = pair();
    await wait(500);
    net.latency = 1e9; // black hole
    await wait(4000);
    expect(host.send('c', 'x', 1)).toBe(false);
  });

  it('measures RTT via ping/pong', async () => {
    net.latency = 20;
    const { host, client } = pair();
    await wait(4000);
    const r = host.rtt('c')!;
    expect(r.ms).toBeCloseTo(40, 0);
    expect(r.jitter).toBeLessThan(1);
    expect(client.rtt('h')!.ms).toBeCloseTo(40, 0);
  });

  it('close() says bye and tears down', async () => {
    const { host, client } = pair();
    await wait(500);
    client.close();
    expect(client.send('h', 'x', 1)).toBe(false);
    await wait(50);
    expect(host.mode('c')).toBe('relay');
  });
});
