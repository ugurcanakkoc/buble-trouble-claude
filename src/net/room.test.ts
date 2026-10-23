import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, HOST_COLOR, JOINER_COLORS, generateCode, joinError, parsePresence, pickColor } from './lobby';

const m = (id: string, o: object = {}) => [{ id, name: id, color: 1, isHost: false, inGame: false, online_at: 1, ...o }];

describe('lobby helpers', () => {
  it('generates 4-char codes from the alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const c = generateCode();
      expect(c).toHaveLength(4);
      for (const ch of c) expect(CODE_ALPHABET).toContain(ch);
    }
    expect(CODE_ALPHABET).not.toMatch(/[01OI]/);
  });
  it('assigns first free joiner color', () => {
    expect(pickColor([HOST_COLOR])).toBe(JOINER_COLORS[0]);
    expect(pickColor([HOST_COLOR, JOINER_COLORS[0]])).toBe(JOINER_COLORS[1]);
    expect(pickColor([HOST_COLOR, JOINER_COLORS[1]])).toBe(JOINER_COLORS[0]);
  });
  it('parses presence: host first, then online_at', () => {
    const ps = parsePresence({ c: m('c', { online_at: 30 }), b: m('b', { online_at: 20 }), a: m('a', { isHost: true, online_at: 50 }) });
    expect(ps.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });
  it('carries the host game + max in presence (defaults: bubble, 4)', () => {
    const [a] = parsePresence({ a: m('a') });
    expect(a.game).toBe('bubble');
    expect(a.max).toBe(4);
    const [w] = parsePresence({ w: m('w', { game: 'war', max: 2 }) });
    expect(w).toMatchObject({ game: 'war', max: 2 });
  });
  it('uses the host game limit for ROOM_FULL', () => {
    const war = (n: number) =>
      parsePresence(Object.fromEntries([['h', m('h', { isHost: true, game: 'war', max: 2 })], ...Array.from({ length: n }, (_, i) => [`p${i}`, m(`p${i}`)])]));
    expect(joinError(war(0))).toBeNull();
    expect(joinError(war(1))).toBe('ROOM_FULL');
  });
  it('decides join errors', () => {
    const host = (o = {}) => parsePresence({ h: m('h', { isHost: true, ...o }) });
    expect(joinError([])).toBe('ROOM_NOT_FOUND');
    expect(joinError(parsePresence({ x: m('x') }))).toBe('ROOM_NOT_FOUND');
    expect(joinError(host())).toBeNull();
    expect(joinError(host({ inGame: true }))).toBe('GAME_STARTED');
    expect(joinError(parsePresence({ h: m('h', { isHost: true }), a: m('a'), b: m('b') }))).toBeNull();
    expect(joinError(parsePresence({ h: m('h', { isHost: true }), a: m('a'), b: m('b'), c: m('c') }))).toBe('ROOM_FULL');
  });
});
