// All god / rain mode tunables. Seconds unless noted.
export const GOD_BALANCE = {
  cloudSpeed: 360, // u/s
  cloudY: 60, // drop height (ball center)
  cloudMargin: 40, // cloud x clamp from the walls
  chargeStepSec: 0.45, // charge grows one size per step while fire is held
  manaStart: 3,
  manaCap: 10,
  manaRegen: 1.0, // mana/s before factors
  fighterFactor: [0.6, 0.6, 0.85, 1.0, 1.15], // by fighter count (index clamped)
  rampMax: 1.6, // god: regen multiplier reached at round end (linear)
  cost: [1, 2, 4, 8], // mana by ball size
  cooldownSec: 1.5,
  massCapBase: 6, // on-screen mass cap = base + perFighter × fighters (mass = Σ 2^size)
  massCapPerFighter: 6,
  roundSec: 90,
  readySec: 1.5,
  roundOverSec: 2.5,
  rainRampPerMin: 0.25, // rain: regen multiplier grows by this per minute survived (forever)
  rainDyingSec: 2,
  rainScorePerSec: 10, // rain: survival points per second for each free fighter
};
