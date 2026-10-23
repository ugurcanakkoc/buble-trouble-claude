import { describe, expect, it } from 'vitest';
import { defaultOpponent, fmtDuration, h2hText, winPct } from './scoreFormat';

describe('scoreFormat', () => {
  it('duration', () => {
    expect(fmtDuration(125)).toBe('2:05');
    expect(fmtDuration(-3)).toBe('0:00');
  });
  it('winPct', () => {
    expect(winPct({ name: 'a', played: 3, wins: 1 })).toBe(33);
    expect(winPct({ name: 'a', played: 0, wins: 0 })).toBe(0);
  });
  it('defaultOpponent', () => {
    const rows = [{ players: ['A', 'B'] }, { players: ['A', 'C'] }, { players: ['A', 'C'] }, { players: ['B', 'D'] }];
    expect(defaultOpponent(rows, 'A', ['A', 'B', 'C', 'D'])).toBe('C');
    expect(defaultOpponent(rows, 'Z', ['B', 'Z'])).toBe('B');
    expect(defaultOpponent([], 'Z', ['Z'])).toBeNull();
  });
  it('h2hText', () => {
    expect(h2hText('Ali', 'Veli', { a: 5, b: 3, draws: 2 })).toBe('Ali 5 – 3 Veli (2 berabere)');
    expect(h2hText('Ali', 'Veli', { a: 1, b: 0, draws: 0 })).toBe('Ali 1 – 0 Veli');
  });
});
