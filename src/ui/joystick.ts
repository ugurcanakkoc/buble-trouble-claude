// Pure joystick math (no DOM) so it can be unit-tested. Used by ui/touch.ts `{ joystick: true }`.
export type JoyDir = 'up' | 'down' | 'left' | 'right';

/** Below this fraction of the base radius the stick reads as neutral. */
export const DEAD_ZONE = 0.22;
/** Switching axis needs the other axis to exceed the current one by this fraction (no flicker near 45°). */
export const HYSTERESIS = 0.15;

/** Clamp a finger offset to the base radius (for drawing the knob). */
export function clampVec(dx: number, dy: number, radius: number): [number, number] {
  const len = Math.hypot(dx, dy);
  if (len <= radius || len === 0) return [dx, dy];
  const k = radius / len;
  return [dx * k, dy * k];
}

/** Finger offset (screen coords, +y down) → one of 4 directions on the dominant axis, or null in the dead zone. */
export function joyDir(dx: number, dy: number, radius: number, prev: JoyDir | null = null): JoyDir | null {
  if (Math.hypot(dx, dy) < radius * DEAD_ZONE) return null;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const prevH = prev === 'left' || prev === 'right';
  const horizontal = prev === null ? ax >= ay : prevH ? ay <= ax * (1 + HYSTERESIS) : ax > ay * (1 + HYSTERESIS);
  return horizontal ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
}
