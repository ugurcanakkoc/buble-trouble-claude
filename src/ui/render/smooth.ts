// Snapshot-correction smoothing for clients. Normal motion is rendered exactly at the sim
// position (no follower lag); only the *jump* a snapshot causes is turned into an offset that
// decays exponentially (framerate-independent). Big jumps (teleports, resets) snap at once.

export const SMOOTH_TAU_MS = 90;
export const SNAP_DIST = 80;

interface Offset {
  x: number;
  y: number;
}

export class Smoother {
  private offs = new Map<string, Offset>();

  /** Entity jumped from (fromX,fromY) to (toX,toY) because of a correction: keep it where it was. */
  correct(key: string, fromX: number, fromY: number, toX: number, toY: number): void {
    const o = this.offs.get(key) ?? { x: 0, y: 0 };
    o.x += fromX - toX;
    o.y += fromY - toY;
    if (Math.hypot(o.x, o.y) > SNAP_DIST) this.offs.delete(key);
    else this.offs.set(key, o);
  }

  /** Call once per rendered frame. */
  decay(dtMs: number): void {
    const keep = Math.exp(-dtMs / SMOOTH_TAU_MS);
    for (const [k, o] of this.offs) {
      o.x *= keep;
      o.y *= keep;
      if (Math.abs(o.x) < 0.05 && Math.abs(o.y) < 0.05) this.offs.delete(k);
    }
  }

  /** Display position for an entity at sim position (x, y). */
  at(key: string, x: number, y: number): Offset {
    const o = this.offs.get(key);
    return o ? { x: x + o.x, y: y + o.y } : { x, y };
  }

  clear(): void {
    this.offs.clear();
  }
}
