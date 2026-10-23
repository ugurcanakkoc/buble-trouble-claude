// All tunable numbers for Bomba. Times are in ticks (60/s), distances in tiles.
export const TICK = 60;
export const COLS = 15;
export const ROWS = 13;

export const BALANCE = {
  crateChance: 0.7, // of free (non-spawn) tiles
  fuseTicks: 150, // 2.5 s
  flameTicks: 30, // 0.5 s visible/deadly
  baseSpeed: 3.4 / TICK, // tiles per tick
  speedStep: 0.55 / TICK, // per speed power-up
  maxSpeedLevel: 5,
  slowSpeed: 2.0 / TICK, // skull: slow
  cornerAssist: 0.62, // slide around a pillar when within this many tiles of the free lane's center
  kickSpeed: 9 / TICK,
  startBombs: 1,
  maxBombs: 8,
  startFire: 2,
  maxFire: 10,
  shieldInvulnTicks: 90,
  curseTicks: 10 * TICK,
  // power-up drop: chance a destroyed crate drops anything, then weighted kind
  dropChance: 0.42,
  dropWeights: { bomb: 26, fire: 26, speed: 16, kick: 9, shield: 8, maxfire: 3, skull: 7 } as Record<string, number>,
  countdownTicks: 3 * TICK + 30, // "3-2-1" then "Başla!" overlaps the first 0.5 s of play
  roundTicks: 150 * TICK, // 2:30 then "Ani ölüm"
  suddenEveryTicks: 14, // one falling block every ~0.23 s
  endGraceTicks: 40, // wait after the last-but-one death so near-simultaneous deaths are a draw
  roundEndTicks: 3 * TICK,
  winsToWin: 3,
};
