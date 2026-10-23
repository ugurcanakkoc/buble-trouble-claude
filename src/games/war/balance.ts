// Çağlar Savaşı tuning. Every gameplay number lives here. Speeds are px/s, times are ticks (60/s),
// ranges/widths are px along the lane. Costs follow Age of War's spirit (each age ~3x pricier).

export const TICK = 60;
export const LANE_W = 2400; // lane length (px); bases at both ends
export const BASE_FRONT = 110; // distance from lane end to the base wall
export const SPAWN_X = 70; // where units appear (inside the base, they walk out)
export const UNIT_GAP = 6; // extra space kept between allies queueing behind each other
export const TEAM_CAP = 28; // max alive units per team (snapshot size)
export const QUEUE_MAX = 5;
export const START_GOLD = 175;
export const START_SLOTS = 1;
export const SLOT_COSTS = [900, 2800]; // 2nd, 3rd turret slot
export const MAX_SLOTS = 3;
export const SELL_REFUND = 0.5;
export const KILL_GOLD_MULT = 1.3; // gold for a kill = cost * this
export const XP_PER_DMG = 0.4; // XP earned per point of damage dealt to units/base
export const XP_KILL_MULT = 2; // XP for a kill = cost * this
/** Gold per second per age (keeps both teams' economies alive; AI mode humans also get the bonus). */
export const PASSIVE_GOLD = [3, 8, 22, 55, 140];
export const AI_MODE_HUMAN_INCOME = 1.25; // vs-AI: humans' passive income multiplier
export const SPECIAL_CD = 60 * 60; // 60 s
export const SPECIAL_FIRST_CD = 30 * 60; // usable 30 s into the match
/** "Kıyamet": from this tick on both bases crumble every second, so stalemates always end. */
export const SUDDEN_DEATH = 60 * 60 * 12;
export const SUDDEN_DEATH_DECAY = 0.012; // fraction of max base HP lost per second
export const MAX_TICKS = 60 * 60 * 25; // hard stop: 25 min → higher base HP % wins

export interface AgeDef {
  name: string;
  xpToNext: number; // XP needed to evolve out of this age (Infinity in the last)
  baseHp: number;
  special: { name: string; hits: number; dmg: number; radius: number; duration: number; sweep: boolean };
}

export const AGES: AgeDef[] = [
  { name: 'Taş Devri', xpToNext: 4000, baseHp: 500, special: { name: 'Meteor Yağmuru', hits: 14, dmg: 45, radius: 50, duration: 180, sweep: false } },
  { name: 'Orta Çağ', xpToNext: 14000, baseHp: 1100, special: { name: 'Ok Yağmuru', hits: 30, dmg: 50, radius: 30, duration: 150, sweep: false } },
  { name: 'Rönesans', xpToNext: 45000, baseHp: 2000, special: { name: 'Top Atışı', hits: 10, dmg: 260, radius: 70, duration: 160, sweep: false } },
  { name: 'Modern', xpToNext: 160000, baseHp: 3200, special: { name: 'Hava Saldırısı', hits: 16, dmg: 380, radius: 70, duration: 150, sweep: true } },
  { name: 'Gelecek', xpToNext: Infinity, baseHp: 4700, special: { name: 'Lazer Işını', hits: 40, dmg: 330, radius: 45, duration: 180, sweep: true } },
];

export interface UnitDef {
  name: string;
  age: number;
  role: 'melee' | 'ranged' | 'heavy' | 'super';
  cost: number;
  hp: number;
  dmg: number;
  cd: number; // ticks between attacks
  range: number; // attack reach beyond touching distance
  speed: number;
  train: number; // ticks
  w: number; // body width
  splash?: number; // ranged splash radius
}

// index = age*3 + slot (slot 0 melee, 1 ranged, 2 heavy); index 15 = Süper Asker (age 4, slot 3)
export const UNITS: UnitDef[] = [
  { name: 'Sopalı', age: 0, role: 'melee', cost: 15, hp: 55, dmg: 16, cd: 60, range: 4, speed: 42, train: 55, w: 22 },
  { name: 'Sapancı', age: 0, role: 'ranged', cost: 25, hp: 42, dmg: 10, cd: 60, range: 130, speed: 40, train: 70, w: 22 },
  { name: 'Dino Binici', age: 0, role: 'heavy', cost: 100, hp: 260, dmg: 34, cd: 72, range: 6, speed: 46, train: 170, w: 40 },

  { name: 'Kılıççı', age: 1, role: 'melee', cost: 50, hp: 130, dmg: 34, cd: 60, range: 4, speed: 44, train: 60, w: 22 },
  { name: 'Okçu', age: 1, role: 'ranged', cost: 75, hp: 95, dmg: 24, cd: 60, range: 170, speed: 42, train: 75, w: 22 },
  { name: 'Şövalye', age: 1, role: 'heavy', cost: 300, hp: 620, dmg: 70, cd: 66, range: 6, speed: 52, train: 180, w: 38 },

  { name: 'Düellocu', age: 2, role: 'melee', cost: 200, hp: 320, dmg: 75, cd: 54, range: 6, speed: 46, train: 65, w: 22 },
  { name: 'Tüfekçi', age: 2, role: 'ranged', cost: 400, hp: 230, dmg: 62, cd: 70, range: 190, speed: 42, train: 80, w: 22 },
  { name: 'Topçu', age: 2, role: 'heavy', cost: 1000, hp: 1150, dmg: 150, cd: 110, range: 220, speed: 36, train: 200, w: 44, splash: 40 },

  { name: 'Piyade', age: 3, role: 'melee', cost: 1500, hp: 760, dmg: 150, cd: 50, range: 6, speed: 50, train: 70, w: 22 },
  { name: 'Makineli', age: 3, role: 'ranged', cost: 2000, hp: 560, dmg: 34, cd: 12, range: 200, speed: 44, train: 85, w: 24 },
  { name: 'Tank', age: 3, role: 'heavy', cost: 6000, hp: 2900, dmg: 340, cd: 90, range: 170, speed: 40, train: 220, w: 64, splash: 45 },

  { name: 'Robot Kılıç', age: 4, role: 'melee', cost: 5000, hp: 1800, dmg: 330, cd: 48, range: 6, speed: 56, train: 75, w: 24 },
  { name: 'Lazerci', age: 4, role: 'ranged', cost: 6000, hp: 1300, dmg: 270, cd: 54, range: 220, speed: 46, train: 90, w: 24 },
  { name: 'Savaş Makinesi', age: 4, role: 'heavy', cost: 15000, hp: 6000, dmg: 620, cd: 70, range: 120, speed: 40, train: 240, w: 60, splash: 40 },
  { name: 'Süper Asker', age: 4, role: 'super', cost: 100000, hp: 22000, dmg: 1100, cd: 36, range: 8, speed: 48, train: 420, w: 34 },
];
export const SUPER_UNIT = 15;

export interface TurretDef {
  name: string;
  age: number;
  cost: number;
  dmg: number;
  cd: number;
  range: number; // from the base wall
  splash: number; // 0 = single target
}

// index = age*3 + kind
export const TURRETS: TurretDef[] = [
  { name: 'Taş Atar', age: 0, cost: 100, dmg: 12, cd: 55, range: 340, splash: 0 },
  { name: 'Yumurta Topu', age: 0, cost: 200, dmg: 8, cd: 20, range: 300, splash: 0 },
  { name: 'İlkel Mancınık', age: 0, cost: 500, dmg: 32, cd: 100, range: 380, splash: 55 },

  { name: 'Mancınık', age: 1, cost: 500, dmg: 34, cd: 70, range: 360, splash: 40 },
  { name: 'Ateş Mancınığı', age: 1, cost: 750, dmg: 42, cd: 60, range: 340, splash: 50 },
  { name: 'Kızgın Yağ', age: 1, cost: 1000, dmg: 30, cd: 30, range: 260, splash: 60 },

  { name: 'Küçük Top', age: 2, cost: 1500, dmg: 90, cd: 60, range: 380, splash: 0 },
  { name: 'Büyük Top', age: 2, cost: 3000, dmg: 160, cd: 75, range: 420, splash: 40 },
  { name: 'Patlayıcı Top', age: 2, cost: 6000, dmg: 220, cd: 80, range: 420, splash: 70 },

  { name: 'Makineli Kule', age: 3, cost: 7000, dmg: 55, cd: 14, range: 400, splash: 0 },
  { name: 'Roketatar', age: 3, cost: 9000, dmg: 420, cd: 80, range: 460, splash: 60 },
  { name: 'Çift Namlu', age: 3, cost: 14000, dmg: 120, cd: 18, range: 420, splash: 0 },

  { name: 'Lazer Topu', age: 4, cost: 24000, dmg: 380, cd: 50, range: 440, splash: 0 },
  { name: 'Titanyum Atar', age: 4, cost: 40000, dmg: 160, cd: 20, range: 440, splash: 0 },
  { name: 'İyon Topu', age: 4, cost: 90000, dmg: 1600, cd: 100, range: 500, splash: 80 },
];

export const AI = {
  thinkEvery: [50, 30, 20], // ticks between AI decisions by level (0 easy … 2 hard)
  incomeMult: [0.8, 1.0, 1.25], // AI passive income multiplier by level
  specialMinEnemies: 4, // fire special when at least this many enemies are in our half
  threatDist: 700, // enemies closer than this to our wall count as a threat
  saveAtXp: 0.85, // from this XP fraction on, keep a reserve for the new age's units
};
