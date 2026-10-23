// Game-message routing for a room: P2P mesh first, Supabase relay when the mesh can't deliver,
// and per-sender seq de-dup so a message that arrives over both paths (or out of order on the
// unreliable channel) is handled once. Pure: no supabase import, so it's unit-testable.
import type { PeerMesh } from './p2p';

export type Route = 'p2p' | 'relay';
export interface WireMsg {
  seq?: number;
  from?: string;
}

export const netStats = {
  sent: { p2p: {} as Record<string, number>, relay: {} as Record<string, number> },
  recv: { p2p: {} as Record<string, number>, relay: {} as Record<string, number> },
};
const count = (bucket: Record<string, number>, event: string) => void (bucket[event] = (bucket[event] ?? 0) + 1);

export function createTransport(o: {
  selfId: string;
  isHost: boolean;
  mesh: Pick<PeerMesh, 'send'>;
  relay: (event: string, payload: object) => void;
  hostId: () => string | undefined;
}) {
  let seq = 0;
  const lastSeq = new Map<string, number>(); // `${from}:${event}` -> newest seq seen

  return {
    /** Send a game message (host: to all clients, client: to the host). */
    out(event: string, payload: object, reliable = false): Route {
      const msg = { ...payload, seq: ++seq, from: o.selfId };
      const to = o.isHost ? '*' : o.hostId();
      if (to && o.mesh.send(to, event, msg, { reliable })) {
        count(netStats.sent.p2p, event);
        return 'p2p';
      }
      o.relay(event, msg);
      count(netStats.sent.relay, event);
      return 'relay';
    },
    /** true if this message is new; false for duplicates / older seq from the same sender. */
    accept(event: string, m: WireMsg, via: Route): boolean {
      if (m.seq === undefined || m.from === undefined) return true; // unsequenced (legacy) message
      const k = `${m.from}:${event}`;
      if ((lastSeq.get(k) ?? 0) >= m.seq) return false;
      lastSeq.set(k, m.seq);
      count(netStats.recv[via], event);
      return true;
    },
    /** Forget a sender's seq (presence left) so a reused id starts fresh. */
    forget(id: string): void {
      for (const k of [...lastSeq.keys()]) if (k.startsWith(`${id}:`)) lastSeq.delete(k);
    },
  };
}
