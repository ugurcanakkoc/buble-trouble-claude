import { describe, expect, it, vi } from 'vitest';
import { createTransport } from './transport';

function setup(isHost: boolean, p2pOk: boolean) {
  const mesh = { send: vi.fn(() => p2pOk) };
  const relay = vi.fn();
  const t = createTransport({ selfId: isHost ? 'h' : 'c', isHost, mesh, relay, hostId: () => 'h' });
  return { t, mesh, relay };
}

describe('transport routing', () => {
  it('host snapshots go P2P to all and never touch the relay when the mesh delivers', () => {
    const { t, mesh, relay } = setup(true, true);
    expect(t.out('snapshot', { state: 1 })).toBe('p2p');
    expect(mesh.send).toHaveBeenCalledWith('*', 'snapshot', { state: 1, seq: 1, from: 'h' }, { reliable: false });
    expect(relay).not.toHaveBeenCalled();
  });

  it('falls back to the relay with the same sequenced message when the mesh returns false', () => {
    const { t, relay } = setup(true, false);
    t.out('snapshot', { state: 1 });
    expect(t.out('snapshot', { state: 2 })).toBe('relay');
    expect(relay).toHaveBeenLastCalledWith('snapshot', { state: 2, seq: 2, from: 'h' });
  });

  it('client inputs go to the host id; no host known -> relay', () => {
    const { t, mesh } = setup(false, true);
    t.out('input', { input: 1 }, true);
    expect(mesh.send).toHaveBeenCalledWith('h', 'input', expect.objectContaining({ seq: 1 }), { reliable: true });
    const relay = vi.fn();
    const t2 = createTransport({ selfId: 'c', isHost: false, mesh, relay, hostId: () => undefined });
    expect(t2.out('input', {})).toBe('relay');
  });
});

describe('transport de-dup', () => {
  it('drops duplicates and older seq per sender + event, across both paths', () => {
    const { t } = setup(false, true);
    expect(t.accept('snapshot', { seq: 1, from: 'h' }, 'p2p')).toBe(true);
    expect(t.accept('snapshot', { seq: 1, from: 'h' }, 'relay')).toBe(false); // same msg via relay
    expect(t.accept('snapshot', { seq: 3, from: 'h' }, 'relay')).toBe(true);
    expect(t.accept('snapshot', { seq: 2, from: 'h' }, 'p2p')).toBe(false); // late, unordered channel
    expect(t.accept('input', { seq: 2, from: 'h' }, 'p2p')).toBe(true); // separate stream
    expect(t.accept('snapshot', { seq: 1, from: 'x' }, 'p2p')).toBe(true); // separate sender
    expect(t.accept('snapshot', {}, 'relay')).toBe(true); // unsequenced
  });

  it('forget() resets a sender', () => {
    const { t } = setup(true, true);
    t.accept('input', { seq: 5, from: 'c' }, 'p2p');
    t.forget('c');
    expect(t.accept('input', { seq: 1, from: 'c' }, 'relay')).toBe(true);
  });
});
