import type { Block } from './types';
import { TICK_RATE } from './types';

export const DT = 1 / TICK_RATE;

export const isSolid = (b: Block) => b.kind === 'wall' || b.kind === 'breakable';

/** Circle vs axis-aligned box. */
export function circleHitsBox(cx: number, cy: number, r: number, x: number, y: number, w: number, h: number): boolean {
  const dx = cx - Math.max(x, Math.min(cx, x + w));
  const dy = cy - Math.max(y, Math.min(cy, y + h));
  return dx * dx + dy * dy < r * r;
}

/** Circle vs vertical segment at x from y1 (top) to y2 (bottom). */
export function circleHitsVSeg(cx: number, cy: number, r: number, x: number, y1: number, y2: number): boolean {
  const dy = cy - Math.max(y1, Math.min(cy, y2));
  const dx = cx - x;
  return dx * dx + dy * dy <= r * r;
}
