// Pure camera decisions (no Phaser) so they can be unit tested.
import { LANE_W } from './balance';
import type { Team } from './sim';

/** Initial scrollX for a match: the player's own base edge of the lane. */
export const baseScrollX = (team: Team, viewW: number): number => (team === 0 ? 0 : Math.max(0, LANE_W - viewW));

/**
 * True only for a real new match (host "Tekrar Oyna": tick restarts at 0).
 * A client's tick also goes backwards by a few ticks whenever a host snapshot replaces its
 * predicted state — that must NOT count, or the view (camera!) resets on every snapshot.
 */
// A restarted match is at most a snapshot (8 ticks) + lead (4) old when it arrives; 16 leaves slack.
export const isNewMatch = (prevTick: number, tick: number): boolean => tick < prevTick && tick <= 16;
