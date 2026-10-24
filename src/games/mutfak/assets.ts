// Every texture key and sound id the Mutfak Kaosu scene uses. art.ts/sound.ts implement them; keep keys stable.
import type { StationKind } from './types';

const ITEM_KINDS = [
  'domates', 'sogan', 'kiyma', 'hamur', 'mercimek', 'lavas',
  'domatesD', 'soganD', 'kiymaD', 'mercimekD',
  'et', 'cay', 'tabak', 'kirli', 'tencere', 'lahmacunRaw', 'lahmacun', 'corba', 'yanik', 'paket',
  'durum', // finished dürüm plate icon (also used on tickets)
] as const;
export type ItemTex = (typeof ITEM_KINDS)[number];

const STATION_KINDS: StationKind[] = [
  'crate', 'counter', 'board', 'stove', 'oven', 'doner', 'tea', 'sink', 'trash', 'pack', 'serve', 'pano', 'cashier', 'table', 'door',
];

export const TEX = {
  floor: 'mk_floor', // kitchen tile
  floorDining: 'mk_floor_dining',
  wall: 'mk_wall',
  stationOff: 'mk_st_off', // locked 2nd stove
  player: 'mk_player', // white, tinted per player color; 4 frames of 64 px side by side (u,d,l,r)
  customer: 'mk_customer', // white, tinted
  ticket: 'mk_ticket', // order slip
  ticketHidden: 'mk_ticket_hidden', // "?" slip for orders this player can't see
  bubble: 'mk_bubble', // speech bubble behind a dish icon
  ring: 'mk_ring', // hold progress ring base
  highlight: 'mk_highlight', // yellow target frame
  smoke: 'mk_smoke',
  road: 'mk_road',
  building: 'mk_building',
  home: 'mk_home', // restaurant on the street map
  market: 'mk_market',
  pin: 'mk_pin', // delivery target marker
  scooter: 'mk_scooter',
  botCourier: 'mk_bot_courier',
  star: 'mk_star',
  starOff: 'mk_star_off',
} as const;

/** 'mk_st_<kind>' for every station kind. */
export const STATION_TEX = Object.fromEntries(STATION_KINDS.map((k) => [k, `mk_st_${k}`])) as Record<StationKind, string>;
/** 'mk_it_<code>' for every item code (see types.ts Item) plus dish icons. Icons are 32×32. */
export const ITEM_TEX = Object.fromEntries(ITEM_KINDS.map((k) => [k, `mk_it_${k}`])) as Record<ItemTex, string>;
export const itemTex = (k: string): string => (k in ITEM_TEX ? ITEM_TEX[k as ItemTex] : ITEM_TEX.yanik);

export const ALL_TEXTURES: string[] = [...Object.values(TEX), ...Object.values(STATION_TEX), ...Object.values(ITEM_TEX)];

export const SFX = [
  'pick', 'place', 'reject', 'chop', 'sizzle', 'ding', 'burn', 'slice', 'pour', 'wash', 'trash',
  'bell', 'phone', 'cash', 'angry', 'pin', 'pack', 'scooter', 'deliver', 'buy', 'dayStart', 'dayEnd',
] as const;
export type SfxId = (typeof SFX)[number];
