// Bot brain for empty slots. Stateless and deterministic: recomputed every tick from the state.
// Flee danger (flame map incl. pending bombs + chains + sudden death), bomb only with an escape,
// grab power-ups, break crates, then hunt enemies.
import { BALANCE as B, COLS, ROWS } from './balance';
import {
  DIRS, FLOOR, SPIRAL, WALL, blastCells, bombAt, cellOf, idx, side, speedOf,
  type BPlayer, type BombInput, type BombState,
} from './sim';

export const INF = 1e9;
const N = COLS * ROWS;

interface Pending {
  c: number;
  r: number;
  fire: number;
  fuse: number;
}

/** Ticks until each cell is covered by flame (0 = burning now, INF = safe). */
export function dangerMap(s: BombState, extra?: Pending): number[] {
  const d = new Array<number>(N).fill(INF);
  for (const f of s.flames) d[idx(f.c, f.r)] = 0;
  const bombs: Pending[] = s.bombs.map((b) => ({ c: b.c, r: b.r, fire: b.fire, fuse: b.fuse }));
  if (extra) bombs.push(extra);
  const blasts = bombs.map((b) => blastCells(s, b.c, b.r, b.fire).cells);
  for (let changed = true, n = 0; changed && n < 12; n++) {
    changed = false;
    bombs.forEach((a, i) => {
      for (const o of bombs)
        if (o.fuse > a.fuse && blasts[i].some(([c, r]) => c === o.c && r === o.r)) {
          o.fuse = a.fuse;
          changed = true;
        }
    });
  }
  bombs.forEach((b, i) => {
    for (const [c, r] of blasts[i]) d[idx(c, r)] = Math.min(d[idx(c, r)], Math.max(0, b.fuse));
  });
  if (s.timeLeft < 4 * 60) {
    let t = s.timeLeft + Math.max(0, s.sdNext);
    for (let k = s.sdIdx, n = 0; k < SPIRAL.length && n < 14; k++) {
      const i = idx(...SPIRAL[k]);
      if (s.grid[i] === WALL) continue;
      d[i] = Math.min(d[i], t);
      t += B.suddenEveryTicks;
      n++;
    }
  }
  return d;
}

interface Search {
  dist: number[];
  prev: number[];
  order: number[];
}

/** BFS over walkable cells; a cell is enterable only if we'd be through it before its flame. */
function bfs(s: BombState, start: number, danger: number[], speed: number, safeOnly: boolean, margin = 10): Search {
  const dist = new Array<number>(N).fill(-1);
  const prev = new Array<number>(N).fill(-1);
  const order = [start];
  dist[start] = 0;
  const perTile = 1 / speed;
  for (let q = 0; q < order.length; q++) {
    const i = order[q];
    const c = i % COLS;
    const r = (i - c) / COLS;
    for (const [dx, dy] of DIRS) {
      const j = idx(c + dx, r + dy);
      if (dist[j] >= 0 || s.grid[j] !== FLOOR || bombAt(s, c + dx, r + dy)) continue;
      const dj = danger[j];
      if (safeOnly ? dj < INF : dj < INF && dj < (dist[i] + 1.5) * perTile + margin) continue;
      dist[j] = dist[i] + 1;
      prev[j] = i;
      order.push(j);
    }
  }
  return { dist, prev, order };
}

function firstStep(prev: number[], start: number, target: number): number {
  let t = target;
  while (prev[t] !== start && prev[t] >= 0) t = prev[t];
  return t;
}

export function botInput(s: BombState, p: BPlayer): BombInput {
  const i = decide(s, p);
  // the sim flips a reversed player's controls; pre-flip so the bot still goes where it means to
  return p.curse === 'reverse' ? { ...i, up: i.down, down: i.up, left: i.right, right: i.left } : i;
}

function decide(s: BombState, p: BPlayer): BombInput {
  const inp: BombInput = { up: false, down: false, left: false, right: false, bomb: false, seq: p.seq };
  const [c, r] = cellOf(p);
  const me = idx(c, r);
  const speed = speedOf(p);
  const danger = dangerMap(s);
  const enemies = s.players.filter((q) => q.alive && side(s, q) !== side(s, p));
  const enemyCells = new Set(enemies.map((q) => idx(...cellOf(q))));

  const hits = (cc: number, rr: number) => {
    const { cells, crates } = blastCells(s, cc, rr, p.fire);
    let score = crates.length;
    for (const [x, y] of cells) if (enemyCells.has(idx(x, y))) score += 5;
    return score;
  };
  const canEscape = (cc: number, rr: number) => {
    const d2 = dangerMap(s, { c: cc, r: rr, fire: p.fire, fuse: B.fuseTicks });
    // stricter than fleeing: the timing model is rough, so only bomb with room to spare
    const sr = bfs(s, idx(cc, rr), d2, speed, false, 30);
    return sr.order.some((j) => d2[j] >= INF);
  };

  let target = me;
  if (danger[me] < INF) {
    // flee to the nearest safe cell; if none with a margin, try again cutting it close
    for (const margin of [8, -10]) {
      const sr = bfs(s, me, danger, speed, false, margin);
      const safe = sr.order.find((j) => danger[j] >= INF);
      if (safe !== undefined || margin < 0)
        return steer(inp, p, me, safe ?? sr.order.reduce((a, j) => (danger[j] > danger[a] ? j : a), me), sr.prev);
    }
  }

  const canBomb =
    p.curse !== 'nobomb' && !bombAt(s, c, r) && s.bombs.filter((b) => b.owner === p.id).length < p.bombs;
  if (canBomb && hits(c, r) > 0 && canEscape(c, r)) {
    inp.bomb = true;
    inp.seq = p.seq + 1;
    return inp;
  }

  const sr = bfs(s, me, danger, speed, true);
  const reach = sr.order;
  // 1) power-ups (skulls are avoided as targets)
  let best = -1;
  let bestScore = -INF;
  for (const j of reach) {
    const it = s.items.find((q) => idx(q.c, q.r) === j);
    if (it && it.k !== 'skull' && -sr.dist[j] > bestScore) [best, bestScore] = [j, -sr.dist[j]];
  }
  // 2) bombing spots (crates / enemies in blast)
  if (best < 0 && canBomb) {
    for (const j of reach) {
      if (j === me) continue;
      const h = hits(j % COLS, Math.floor(j / COLS));
      if (h > 0 && h * 2 - sr.dist[j] > bestScore) [best, bestScore] = [j, h * 2 - sr.dist[j]];
    }
  }
  // 3) hunt: get as close as possible to an enemy
  if (best < 0 && enemies.length) {
    for (const j of reach) {
      const jc = j % COLS;
      const jr = Math.floor(j / COLS);
      const m = Math.min(...enemies.map((q) => Math.abs(q.x - 0.5 - jc) + Math.abs(q.y - 0.5 - jr)));
      const sc = -m * 4 - sr.dist[j] * 0.1;
      if (sc > bestScore) [best, bestScore] = [j, sc];
    }
  }
  if (best >= 0) target = best;
  return steer(inp, p, me, target, sr.prev);
}

function steer(inp: BombInput, p: BPlayer, me: number, target: number, prev: number[]): BombInput {
  let tx: number;
  let ty: number;
  if (target === me) {
    tx = (me % COLS) + 0.5;
    ty = Math.floor(me / COLS) + 0.5;
  } else {
    const n = firstStep(prev, me, target);
    tx = (n % COLS) + 0.5;
    ty = Math.floor(n / COLS) + 0.5;
  }
  const dx = tx - p.x;
  const dy = ty - p.y;
  const dead = target === me ? 0.08 : 0.001;
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx > dead) inp.right = true;
    else if (dx < -dead) inp.left = true;
  } else {
    if (dy > dead) inp.down = true;
    else if (dy < -dead) inp.up = true;
  }
  return inp;
}
