import { describe, expect, it } from 'vitest';
import { clampVec, joyDir } from './joystick';

const R = 60;

describe('joyDir', () => {
  it('is neutral inside the dead zone', () => {
    expect(joyDir(0, 0, R)).toBeNull();
    expect(joyDir(9, 9, R)).toBeNull(); // |v| ≈ 12.7 < 13.2
    expect(joyDir(10, 0, R, 'right')).toBeNull();
  });
  it('maps the 4 directions (+y is down)', () => {
    expect(joyDir(0, -40, R)).toBe('up');
    expect(joyDir(0, 40, R)).toBe('down');
    expect(joyDir(-40, 0, R)).toBe('left');
    expect(joyDir(40, 0, R)).toBe('right');
    expect(joyDir(40, -20, R)).toBe('right');
  });
  it('keeps the current axis near the diagonal (hysteresis)', () => {
    expect(joyDir(40, 44, R, 'right')).toBe('right'); // 44 < 40*1.15
    expect(joyDir(44, 40, R, 'down')).toBe('down');
    expect(joyDir(40, 47, R, 'right')).toBe('down'); // 47 > 46
    expect(joyDir(-47, -40, R, 'up')).toBe('left');
  });
  it('flips sign on the same axis without hysteresis', () => {
    expect(joyDir(-40, 5, R, 'right')).toBe('left');
  });
  it('works past the radius (finger outside the base)', () => {
    expect(joyDir(500, 10, R)).toBe('right');
  });
});

describe('clampVec', () => {
  it('leaves vectors inside the radius alone', () => {
    expect(clampVec(30, 40, R)).toEqual([30, 40]);
  });
  it('clamps longer vectors to the radius, keeping direction', () => {
    const [x, y] = clampVec(300, 400, R);
    expect(Math.hypot(x, y)).toBeCloseTo(R);
    expect(x / y).toBeCloseTo(0.75);
  });
});
