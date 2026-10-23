# Wiring `src/net/p2p.ts` into `room.ts`

The mesh only carries bytes P2P. The Supabase room channel stays the source of truth for presence, and it carries every message the mesh could not deliver. `send()` returning `false` always means **send it over the relay**.

## 1. SignalBus over the existing room channel

Register the handler in `open()` **before** `ch.subscribe()`, the same as the other `ch.on` calls, so the host's first offer is not lost:

```ts
import { createPeerMesh, type RtcSignal, type PeerMesh } from './p2p';

const rtcSubs = new Set<(s: RtcSignal) => void>();
ch.on('broadcast', { event: 'rtc' }, (m) => {
  const s = m.payload as RtcSignal;
  if (s.to === meta.id) rtcSubs.forEach((cb) => cb(s)); // mesh filters again; cheap
});
const signal = {
  send: (s: RtcSignal) => void ch.send({ type: 'broadcast', event: 'rtc', payload: s }),
  on: (cb: (s: RtcSignal) => void) => (rtcSubs.add(cb), () => void rtcSubs.delete(cb)),
};
```

Signaling uses about 6 to 15 small messages per connection attempt. That is well within `eventsPerSecond: 40`.

## 2. Create the mesh in `makeSession`

```ts
const mesh = createPeerMesh({ selfId: meta.id, isHost, signal, log: (m) => console.debug(m) });
```

Call `mesh.close()` in `leave()`. The mesh also closes itself on `pagehide`.

## 3. Presence → `setPeers`

Do this in `hub.onSync`, after `current` is recomputed:

```ts
if (isHost) mesh.setPeers(current.filter((p) => !p.isHost).map((p) => p.id));
else { const h = current.find((p) => p.isHost); mesh.setPeers(h ? [h.id] : []); }
```

On the client, the mesh accepts the host's offer even before `setPeers` runs. `setPeers` sends a `hello`, which tells a host that already gave up to re-offer.

## 4. Outgoing: P2P first, then the relay

Add a per-sender `seq` to every game message:

```ts
let seq = 0;
const out = (event: string, payload: object, reliable = false) => {
  const msg = { ...payload, seq: ++seq, from: meta.id };
  if (!mesh.send(isHost ? '*' : hostId, event, msg, { reliable })) send(event, msg); // send = existing ch.send wrapper
};
// host:   out('snapshot', { state, inputs })
// client: out('input', { playerId, input, pos })
// host:   out('start', startPayload, true)   // reliable, rare
```

- `'*'` returns true only if **every** peer got the message. If one client is on the relay, the message goes over Supabase to everyone, and the clients that also got it P2P drop the copy using `seq`. With 3 or fewer clients this costs little. Per-peer relay sends are not possible, because Supabase broadcast always reaches the whole room.
- `'*'` with zero peers returns false, so the relay is used.
- Inputs: keep sending only on change, plus the 3 s keepalive. The `'u'` channel is lossy, so a lost input is fixed by the next change or keepalive. If movement-critical edges ever get lost, send them with `{ reliable: true }`.
- Size: payloads over 16 KB go automatically over the reliable `'r'` channel. On an unreliable channel, losing any one of the roughly 14 SCTP fragments loses the whole message. Payloads over `pc.sctp.maxMessageSize` (256 KB in Chrome) return false, so the relay carries them.
- The relay is still used for anything non-game, such as presence and lobby.

## 5. Incoming from both paths, de-duplicated

```ts
const lastSeq = new Map<string, number>(); // key: `${from}:${event}`
const accept = (event: string, m: { seq: number; from: string }) => {
  const k = `${m.from}:${event}`;
  if ((lastSeq.get(k) ?? 0) >= m.seq) return false; // duplicate or older (unordered channel)
  lastSeq.set(k, m.seq);
  return true;
};
mesh.on('snapshot', (_from, p) => { const m = p as SnapMsg; if (accept('snapshot', m)) hub.snap.emit(m.state, m.inputs ?? {}); });
// and inside the existing ch.on('broadcast', { event: 'snapshot' }) handler, wrap with the same accept()
```

Dropping messages older than the newest one is correct for snapshots and inputs, because only the latest state matters. For `start`, use the same check. `seq` is strictly increasing per sender, so a duplicate is ignored.

When a sender reloads, it gets a new presence id, so the `seq` keys for that sender start fresh. If ids are ever reused across reloads, also reset `lastSeq` for that id when its presence reappears.

## 6. HUD ping meter

```ts
const peer = isHost ? worstClientId : hostId;
const label = mesh.mode(peer) === 'p2p' ? `P2P ${Math.round(mesh.rtt(peer)?.ms ?? 0)}ms` : 'Sunucu';
```

`rtt()` is null unless the peer is in `p2p` mode. It is an EWMA (alpha 0.25) of ping/pong samples taken every 1 s on `'u'`, and `jitter` is the EWMA of the absolute deviation. Relay RTT is not measured.

## Behaviour summary

| Situation | Result |
|---|---|
| No link 5 s after an attempt starts | mode becomes `relay`, `send` returns false, and the host re-offers every 15 s with a fresh RTCPeerConnection |
| Channel closes or pc `failed` | instant `relay`, and the host re-attempts after about 1 s |
| ICE `disconnected`, or no traffic for 3.5 s | `send` returns false immediately, and the link recovers by itself if packets resume |
| Client hears no offers for 30 s | the client sends `hello` |
| `close()` or `pagehide` | sends `bye` to all peers and closes every pc |
