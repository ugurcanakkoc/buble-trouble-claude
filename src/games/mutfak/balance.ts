// All tunable numbers for Mutfak Kaosu. Times in ticks (60/s), distances in tiles, money in ₺.
import type { Dish, UpgradeId } from './types';

export const TICK = 60;
export const COLS = 12; // kitchen
export const ROWS = 8;
export const SCOLS = 20; // street map
export const SROWS = 14;

export const BALANCE = {
  prepTicks: 20 * TICK,
  serviceTicks: 240 * TICK,
  closeTicks: 40 * TICK,
  closeGraceTicks: 5 * TICK, // close ends this soon once no order is open
  shopTicks: 60 * TICK,
  rushFrom: 120 * TICK, // day time (from prep start) 2:00–3:00: spawn ×1.5
  rushTo: 180 * TICK,
  rushMul: 1.5,
  campaignDays: 3,

  speed: 3.0 / TICK, // kitchen walk, tiles/tick
  cornerAssist: 0.62,
  scooterSpeed: 6 / TICK,
  botCourierSpeed: 4 / TICK,
  bagSize: 3,
  rackSize: 4,

  chopTicks: 2 * TICK,
  chopFastTicks: 1.2 * TICK, // bicak
  washTicks: 1.5 * TICK, // ×0.5 solo ("bulaşık yarı hızda")
  takeOrderTicks: 1 * TICK,
  pinTicks: 2 * TICK,
  sliceTicks: 1.5 * TICK,
  packTicks: 1 * TICK,
  emptyTrashTicks: 2 * TICK,
  soupTicks: 12 * TICK,
  ovenTicks: 10 * TICK,
  burnMul: 1.6, // cooked item burns at cook time × this
  donerEvery: 20 * TICK,
  donerMax: 3,
  teaBrewTicks: 30 * TICK,
  teaGlasses: 6,
  dishwasherTicks: 12 * TICK,
  dishwasherBatch: 4,
  eatTicks: 5 * TICK,

  plates: 6,
  crateStock: 12, // per ingredient per day
  restockAmount: 6,
  restockCost: 30,
  trashCap: 10,

  spawnEvery: 13 * TICK, // base customer interval in service
  spawnJitter: 4 * TICK,
  phoneChance: 0.3,
  queueMax: 4,
  patience: 60 * TICK,
  teaPatience: 30 * TICK,
  phonePatience: 150 * TICK, // until packed
  coldTicks: 90 * TICK, // packed → delivered later = half pay
  courierTipTicks: 60 * TICK,
  courierTip: 10,
  tipFrac: 0.3, // served within half the patience
  ingredientFrac: 0.25, // of the price, deducted per sale
  haliPatience: 0.1,

  startMoney: 100,
  startRep: 50,
  repServe: 2,
  repFail: 5,
  rentBase: 150,
  rentPerDay: 25,
  targets: [400, 500, 600], // day 1..3 (1★); endless: last × 1.12^(day-3)
  endlessGrowth: 1.12,
  endlessPatienceDrop: 0.03, // per day past 3
  starMul: [1, 1.4, 1.8],
  // per player count 1..4: target and spawn-rate scale
  playerScale: [0.6, 0.85, 1, 1.15],

  cleanDirtyAt: 8, // dirty plates in sink ≥ this → −1/s
  cleanDrain: 1 / TICK,
  cleanRecover: 0.2 / TICK,
  cleanSlowBelow: 40, // spawn rate halves
};

export const PRICES: Record<Dish, number> = { cay: 5, corba: 20, lahmacun: 25, durum: 40 };
export const DISHES: Dish[] = ['cay', 'corba', 'lahmacun', 'durum'];
export const PHONE_DISHES: Dish[] = ['corba', 'lahmacun', 'durum'];
/** Plate contents (sorted) that make each plated dish. Çay is the glass itself. */
export const PLATE: Record<Exclude<Dish, 'cay'>, string[]> = {
  corba: ['corba'],
  lahmacun: ['lahmacun'],
  durum: ['domatesD', 'et', 'lavas'],
};
export const CHOP: Record<string, string> = { domates: 'domatesD', sogan: 'soganD', kiyma: 'kiymaD', mercimek: 'mercimekD' };
export const SOUP_PARTS = ['mercimekD', 'soganD'];
export const LAHMACUN_PARTS = ['domatesD', 'kiymaD'];
export const INGREDIENTS = ['domates', 'sogan', 'kiyma', 'hamur', 'mercimek', 'lavas'];

export const UPGRADES: { id: UpgradeId; label: string; desc: string; price: number }[] = [
  { id: 'ocak2', label: '2. ocak', desc: 'İki tencere aynı anda', price: 200 },
  { id: 'bicak', label: 'Hızlı bıçak', desc: 'Doğrama 2 s → 1.2 s', price: 120 },
  { id: 'makine', label: 'Bulaşık makinesi', desc: '12 s’de 4 tabak kendi yıkar', price: 300 },
  { id: 'botKurye', label: 'Bot kurye', desc: 'Paketleri yavaşça kendi götürür (bahşiş yok)', price: 150 },
  { id: 'hali', label: 'Halı', desc: 'Müşteri sabrı +%10', price: 80 },
];

export const RANKS: [number, string][] = [
  [8, "Ankara'nın Lokantası"],
  [6, 'Usta'],
  [3, 'Kalfa'],
  [0, 'Çırak'],
];

/** Street map: road where c%3==0 or r%3==0. Home = restaurant door; targets = 6 neighbourhoods. */
export const STREET = {
  home: [0, 6] as [number, number],
  market: [12, 9] as [number, number],
  targets: [[18, 0], [9, 12], [18, 12], [6, 3], [15, 6], [3, 12]] as [number, number][],
  targetNames: ['Bahçelievler', 'Kızılay', 'Çankaya', 'Ulus', 'Kavaklıdere', 'Keçiören'],
};
