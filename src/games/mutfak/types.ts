// Mutfak Kaosu: plain-JSON state/input/event contract (frozen for scene/art/bot agents).
// Kitchen coords: tile (c,r) spans [c,c+1)×[r,r+1), center c+0.5. Street map (courier) uses the same units.
import type { PlayerId } from '../../sim/types';

export const MODES = [
  { id: 'kampanya', label: 'Kampanya', desc: '3 gün, yıldız topla, iflas etme', minPlayers: 1, icon: '🍲' },
  { id: 'sonsuz', label: 'Sonsuz', desc: 'Gün bitmez, hedef her gün büyür', minPlayers: 1, icon: '♾️' },
] as const;
export type ModeId = (typeof MODES)[number]['id'];

export type Dir = 'u' | 'd' | 'l' | 'r';
export type Role = 'mutfak' | 'garson' | 'kurye' | 'bulasik'; // a hint, not a lock: anyone can do anything
export type Phase = 'prep' | 'service' | 'close' | 'shop' | 'end';
export type Dish = 'cay' | 'corba' | 'lahmacun' | 'durum';
export type UpgradeId = 'ocak2' | 'bicak' | 'makine' | 'botKurye' | 'hali';

/**
 * Item codes. Raw: domates sogan kiyma hamur mercimek lavas. Chopped: domatesD soganD kiymaD mercimekD.
 * et (döner slice), cay (tea glass, served without plate), tabak (clean plate, p = parts on it), kirli (dirty plate),
 * hamur (p = toppings so far), tencere (pot contents, stove only), lahmacunRaw, lahmacun, corba, yanik (burnt),
 * paket (p = [orderId as string]).
 */
export interface Item {
  k: string;
  p?: string[];
}

export type StationKind =
  | 'crate' | 'counter' | 'board' | 'stove' | 'oven' | 'doner' | 'tea' | 'sink' | 'trash'
  | 'pack' | 'serve' | 'pano' | 'cashier' | 'table' | 'door';

export interface Station {
  id: number;
  k: StationKind;
  c: number;
  r: number;
  item: Item | null; // counter-like slot (counter/board/stove/oven/pack/serve/table)
  t: number; // ticks: cook time (stove/oven), brew (tea), slice (doner), wash cycle (dishwasher sink)
  prog: number; // hold-B progress ticks (kept when released)
  n: number; // crate: stock left today; doner: slices ready; tea: glasses; sink: dirty plates; trash: fill
  m: number; // sink: clean plates on the rack
  src?: string; // crate: ingredient it gives
  q?: number[]; // door: order ids of packages on the rack
  table?: number; // table index
  off?: boolean; // locked until an upgrade (2nd stove)
}

export interface Order {
  id: number;
  dish: Dish;
  kind: 'dine' | 'phone';
  st: 'queue' | 'seated' | 'eating' | 'packed' | 'bag'; // phone: queue (on the board) → packed (rack) → bag (courier)
  born: number; // tick created
  pat: number; // patience ticks (dine: from born to served; phone: from born to packed)
  table: number; // dine: table index once seated, else -1
  by: PlayerId | null; // who took the dine-in order at the cashier (sees it)
  pin: boolean; // ticket pinned on the board: the kitchen sees it
  dest: number; // phone: index into STREET.targets, else -1
  packedAt: number; // phone: tick packed (cooling)
  eatUntil: number; // dine: eating until this tick, then leaves a dirty plate
}

export interface MPlayer {
  id: PlayerId;
  name: string;
  color: number;
  slot: number;
  roles: Role[];
  bot: boolean;
  mode: 'kitchen' | 'courier';
  x: number; // kitchen coords, or street coords while mode === 'courier'
  y: number;
  dir: Dir;
  moving: boolean;
  hand: Item | null;
  bag: number[]; // courier: carried phone order ids
  aSeq: number;
  buySeq: number;
  ready: boolean; // shop: "Hazırım"
  work: number; // station id being worked with B this tick (-1 none) — for the hold ring
  resync: number; // until this tick, input seqs are adopted, not pressed (set on reconnect)
  modeAt: number; // tick of the last kitchen/street switch (setOwnPos ignores reports for a moment)
}

export interface BotCourier {
  active: boolean; // owned and on duty
  x: number; // street coords
  y: number;
  nx: number; // cell center it is driving to
  ny: number;
  bag: number[];
  out: boolean; // on a trip
}

export interface DaySummary {
  day: number;
  revenue: number; // gross incl. tips
  tips: number;
  rent: number;
  served: number;
  failed: number; // left angry + cancelled at closing
  dropped: number; // still open when the day closed
  stars: number; // 0..3
}

export interface MutfakState {
  tick: number;
  rng: number;
  mode: ModeId;
  day: number; // 1-based
  phase: Phase;
  phaseLeft: number; // ticks left in the phase
  money: number;
  rep: number; // 0..100
  clean: number; // 0..100
  asym: boolean; // dine-in info asymmetry on (players ≥ 2)
  up: Record<UpgradeId, boolean>;
  players: MPlayer[];
  stations: Station[];
  orders: Order[];
  courier: BotCourier;
  nextId: number;
  nextCustomer: number; // tick of the next spawn
  today: DaySummary; // running numbers for the current day
  history: DaySummary[];
  bankrupt: boolean;
  upBy: Partial<Record<UpgradeId, PlayerId>>; // who bought each upgrade (shop shows it)
}

export interface MutfakInput {
  dx: number; // joystick -1..1 (keys: ±1)
  dy: number;
  b: boolean; // held: chop/wash/slice/take order/pin/empty trash/pack
  aSeq: number; // ++ per A press: take/place/combine/serve (courier: deliver/market/return)
  buy: UpgradeId | '';
  buySeq: number; // ++ per buy click in the shop
  ready: boolean; // shop "Hazırım"
}

export type MutfakEvent =
  | { type: 'pick'; id: PlayerId; k: string }
  | { type: 'place'; id: PlayerId; k: string; st: number }
  | { type: 'reject'; id: PlayerId }
  | { type: 'chopped'; st: number }
  | { type: 'cookStart'; st: number }
  | { type: 'cooked'; st: number }
  | { type: 'burnt'; st: number }
  | { type: 'slice'; st: number }
  | { type: 'brewed'; st: number }
  | { type: 'washed'; st: number }
  | { type: 'trashFull'; st: number }
  | { type: 'customer'; order: number }
  | { type: 'phone'; order: number }
  | { type: 'taken'; order: number; id: PlayerId }
  | { type: 'pinned'; order: number }
  | { type: 'served'; order: number; money: number; tip: number }
  | { type: 'wrong'; order: number }
  | { type: 'left'; order: number } // patience ran out
  | { type: 'packed'; order: number }
  | { type: 'delivered'; order: number; money: number; cold: boolean }
  | { type: 'courier'; id: PlayerId | 'bot'; out: boolean }
  | { type: 'restock'; k: string }
  | { type: 'bought'; up: UpgradeId }
  | { type: 'phase'; phase: Phase; day: number }
  | { type: 'end'; bankrupt: boolean };
