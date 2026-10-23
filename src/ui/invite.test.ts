import { describe, expect, it } from 'vitest';
import { inviteUrl, readInvite } from './invite';

describe('invite links', () => {
  it('builds a join link', () => {
    expect(inviteUrl('K7QZ', 'https://x.app')).toBe('https://x.app/?oda=K7QZ');
  });
  it('reads a valid code (any case), rejects junk', () => {
    expect(readInvite('?oda=k7qz')).toBe('K7QZ');
    expect(readInvite('?oda=K7QZ&x=1')).toBe('K7QZ');
    expect(readInvite('')).toBeNull();
    expect(readInvite('?oda=K7Q')).toBeNull();
    expect(readInvite('?oda=K0QZ')).toBeNull(); // 0 is not in the code alphabet
  });
});
