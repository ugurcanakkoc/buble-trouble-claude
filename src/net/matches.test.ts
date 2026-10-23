import { describe, expect, it } from 'vitest';
import { headToHead, tally } from './matches';

const rows = [
  { players: ['Ali', 'Veli'], winners: ['Ali'] },
  { players: ['Ali', 'Veli'], winners: ['Veli'] },
  { players: ['Ali', 'Veli', 'Can'], winners: ['Ali'] },
  { players: ['Ali', 'Veli'], winners: [] },
];

describe('match tallies', () => {
  it('counts wins and games per player, best first', () => {
    expect(tally(rows)).toEqual([
      { name: 'Ali', played: 4, wins: 2 },
      { name: 'Veli', played: 4, wins: 1 },
      { name: 'Can', played: 1, wins: 0 },
    ]);
  });
  it('computes head-to-head incl. draws', () => {
    expect(headToHead(rows, 'Ali', 'Veli')).toEqual({ a: 2, b: 1, draws: 1 });
    expect(headToHead(rows, 'Can', 'Veli')).toEqual({ a: 0, b: 0, draws: 1 }); // a third player won
  });
});
