import { describe, expect, it } from 'vitest';
import { SMOOTH_TAU_MS, Smoother } from './smooth';

describe('Smoother', () => {
  it('renders untouched entities exactly at the sim position', () => {
    expect(new Smoother().at('b1', 10, 20)).toEqual({ x: 10, y: 20 });
  });

  it('keeps a corrected entity where it was, then converges to the sim position', () => {
    const s = new Smoother();
    s.correct('b1', 100, 50, 130, 40); // snapshot moved it +30, -10
    expect(s.at('b1', 130, 40)).toEqual({ x: 100, y: 50 });
    s.decay(SMOOTH_TAU_MS);
    const mid = s.at('b1', 130, 40);
    expect(mid.x).toBeCloseTo(130 - 30 * Math.exp(-1));
    for (let i = 0; i < 60; i++) s.decay(16.7);
    expect(s.at('b1', 130, 40)).toEqual({ x: 130, y: 40 });
  });

  it('snaps immediately on a large gap', () => {
    const s = new Smoother();
    s.correct('p', 0, 0, 200, 0);
    expect(s.at('p', 200, 0)).toEqual({ x: 200, y: 0 });
  });

  it('is framerate independent', () => {
    const a = new Smoother();
    const b = new Smoother();
    a.correct('k', 0, 0, 40, 0);
    b.correct('k', 0, 0, 40, 0);
    for (let i = 0; i < 6; i++) a.decay(1000 / 60);
    for (let i = 0; i < 3; i++) b.decay(1000 / 30);
    expect(a.at('k', 40, 0).x).toBeCloseTo(b.at('k', 40, 0).x, 6);
  });

  it('accumulates successive corrections and clear() resets', () => {
    const s = new Smoother();
    s.correct('k', 0, 0, 10, 0);
    s.correct('k', 10, 0, 20, 0);
    expect(s.at('k', 20, 0).x).toBe(0);
    s.clear();
    expect(s.at('k', 20, 0).x).toBe(20);
  });
});
