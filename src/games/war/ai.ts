// Computer opponent: a pure function of the state (no rng consumption), so it can also drive
// either team in tests. Level 0 easy … 2 hard (set from the number of humans it faces).
import * as B from './balance';
import { unitIndex, wallX, type Team, type WarCommand, type WarState } from './sim';

/** Deterministic 0..1 noise from the tick (keeps the AI from being perfectly predictable). */
function noise(tick: number, team: number, salt: number): number {
  let h = Math.imul(tick ^ (team * 0x9e3779b1) ^ (salt * 0x85ebca6b), 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x165667b1);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

export function aiCommand(s: WarState, team: Team, level = Math.max(0, s.teams[team].ai)): WarCommand | null {
  const T = s.teams[team];
  const foe: Team = team === 0 ? 1 : 0;
  const age = B.AGES[T.age];
  if (T.age < B.AGES.length - 1 && T.xp >= age.xpToNext) return { type: 'evolve' };
  if (level === 0 && noise(s.tick, team, 1) < 0.3) return null; // easy hesitates

  const wx = wallX(team);
  const enemies = s.units.filter((u) => u.t === foe);
  const mine = s.units.filter((u) => u.t === team);
  const near = enemies.filter((u) => Math.abs(u.x - wx) < B.LANE_W / 2);
  const threat = enemies.filter((u) => Math.abs(u.x - wx) < B.AI.threatDist);
  const enemyPower = threat.reduce((a, u) => a + B.UNITS[u.k].cost, 0);
  const myPower = mine.reduce((a, u) => a + B.UNITS[u.k].cost, 0);

  if (T.spCd <= 0 && near.length >= B.AI.specialMinEnemies) return { type: 'special' };

  // turrets when threatened: fill an empty slot, or replace an outdated one
  if (threat.length >= 2 && enemyPower > myPower * 0.7) {
    const empty = T.tur.findIndex((k, i) => i < T.slots && k < 0);
    const cheapest = B.TURRETS[T.age * 3].cost;
    if (empty >= 0 && T.gold >= cheapest) {
      const kind = [2, 1, 0].find((k) => T.gold >= B.TURRETS[T.age * 3 + k].cost * (level === 2 ? 1 : 1.5)) ?? 0;
      if (T.gold >= B.TURRETS[T.age * 3 + kind].cost) return { type: 'turret', slot: empty, kind };
    }
  }
  const old = T.tur.findIndex((k, i) => i < T.slots && k >= 0 && B.TURRETS[k].age < T.age);
  if (old >= 0 && T.gold >= B.TURRETS[T.age * 3].cost * 2) return { type: 'turret', slot: old, kind: 0 };
  if (level > 0 && T.slots < B.MAX_SLOTS && T.tur.every((k, i) => i >= T.slots || k >= 0) && T.gold > B.SLOT_COSTS[T.slots - 1] * 3)
    return { type: 'buySlot' };

  const rich = T.gold > B.UNITS[unitIndex(T, 2)].cost * 3;
  if (T.q.length >= (rich ? B.QUEUE_MAX : level === 2 ? 3 : 2)) return null;
  // save up just before evolving so the new age's units can be bought right away
  const next = T.age < B.AGES.length - 1 ? B.UNITS[(T.age + 1) * 3].cost * 3 : 0;
  const reserve = T.xp >= age.xpToNext * B.AI.saveAtXp && threat.length < 3 ? next : 0;
  const budget = T.gold - reserve;
  const cost = (slot: number) => B.UNITS[unitIndex(T, slot)].cost;

  if (T.age === 4 && budget >= cost(3) && noise(s.tick, team, 2) < 0.5) return { type: 'train', unit: 3 };
  const enemyHeavy = enemies.some((u) => B.UNITS[u.k].role === 'heavy' || B.UNITS[u.k].role === 'super');
  const melee = mine.filter((u) => B.UNITS[u.k].role === 'melee').length;
  const ranged = mine.filter((u) => B.UNITS[u.k].role === 'ranged').length;
  const r = noise(s.tick, team, 3);
  if (budget >= cost(2) * 1.2 && (r < 0.4 || (level > 0 && enemyHeavy))) return { type: 'train', unit: 2 };
  // counter: a wall of enemy melee calls for ranged support behind our front line
  const wantRanged = ranged * 2 < melee || (level > 0 && enemies.filter((u) => B.UNITS[u.k].role === 'melee').length > 3 && r < 0.6);
  const slot = wantRanged ? 1 : 0;
  if (budget >= cost(slot)) return { type: 'train', unit: slot as 0 | 1 };
  if (budget >= cost(0) && threat.length > 0) return { type: 'train', unit: 0 };
  return null;
}
