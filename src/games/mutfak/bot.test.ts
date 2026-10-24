import { describe, expect, it } from 'vitest';
import { createGame, setConnected, step } from './sim';
import type { MutfakEvent, MutfakInput, MutfakState } from './types';
import { EMPTY_INPUT } from './sim';

const mk = (n: number, bots: number, seed = 11): MutfakState => {
  const s = createGame(seed, Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, color: 0 })), 'sonsuz');
  s.players.slice(n - bots).forEach((p) => setConnected(s, p.id, false));
  return s;
};

/** Run ticks; humans stay idle. Returns served/delivered counts per 30 s window. */
function sim(s: MutfakState, ticks: number) {
  const windows: number[] = [];
  let w = 0;
  const idle: Record<string, MutfakInput> = {};
  for (let i = 1; i <= ticks && s.phase !== 'end'; i++) {
    const ev: MutfakEvent[] = step(s, idle);
    w += ev.filter((e) => e.type === 'served' || e.type === 'delivered').length;
    if (i % 1800 === 0) (windows.push(w), (w = 0));
  }
  return windows;
}

describe('mutfak bots', () => {
  it('bot-only kitchen (1 player) serves orders all day and never stalls', () => {
    const s = mk(1, 1);
    const w = sim(s, 18000);
    expect(w.reduce((a, b) => a + b, 0)).toBeGreaterThan(3);
    expect(w.slice(3, 9).filter((n) => n > 0).length).toBeGreaterThanOrEqual(2); // service windows keep producing
  });
  it('idle human + 1 bot (courier/dishwasher role) still serves', () => {
    const s = mk(2, 1);
    expect(sim(s, 18000).reduce((a, b) => a + b, 0)).toBeGreaterThan(3);
  });
  it('4 bots across two days: no crash, deterministic', () => {
    const run = () => {
      const s = mk(4, 4, 5);
      const served = sim(s, 30000).reduce((a, b) => a + b, 0);
      expect(served).toBeGreaterThan(5);
      return JSON.stringify([served, s.day, s.money, s.rep, s.history.length]);
    };
    expect(run()).toBe(run());
  }, 60000);
  it('bot courier mode delivers via the street map', () => {
    const s = mk(2, 1);
    let delivered = 0;
    for (let i = 0; i < 30000 && s.phase !== 'end'; i++)
      delivered += step(s, { p0: EMPTY_INPUT }).filter((e) => e.type === 'delivered').length;
    expect(delivered).toBeGreaterThan(0);
  });
});
