// All tunable numbers for Paramedik. Times in ticks (60/s) unless named *Sec/*Min; severity is 0..100.
export const TICK = 60;

export const BALANCE = {
  introTicks: 15 * TICK, // disclaimer + case briefing (skippable with 'hazir'; everyone ready → starts at once)
  resultTicks: 12 * TICK, // case report (skippable)
  casesPerShift: { vardiya: 3, tek: 1, antrenman: 2 } as Record<string, number>,
  etaSec: [240, 330] as [number, number], // auto handover window (doc: 4–8 min case)
  etaPerCaseSec: 20, // later cases in a shift last a bit longer (more to do)

  // severity curve
  critSev: 60,
  arrestSev: 85,
  rateMult: { vardiya: 1, tek: 1, antrenman: 0.5 } as Record<string, number>,
  rateGrowthPerCase: 0.2, // +20 % deterioration per case index (vardiya difficulty)
  stepRateFactor: 0.55, // each correct step multiplies a positive rate by this
  recoverPerMin: -10, // rate once every required step is done
  arrestPerMin: 15, // severity gain while in arrest (85 → 100 in ~1 min)
  harmSev: 8, // severity added by a harmful action
  harmRatePerMin: 2, // ...and permanently faster deterioration

  // CPR
  cprMinQuality: 0.5, // cycles below this don't count
  cprSev: 6, // severity removed per good cycle (× quality)
  cprCycles: 2, // good cycles for ROSC
  roscSev: 70, // severity right after ROSC
  basincMinQuality: 0.5,

  // tools: SP busy time
  toolTicks: { pulseox: 2 * TICK, tansiyon: 4 * TICK, glukometre: 3 * TICK, stetoskop: 3 * TICK, solunum: 3 * TICK } as Record<string, number>,
  actTicks: 2 * TICK, // drug / O₂ / position / triage
  noise: { hr: 3, rr: 2, spo2: 1, sys: 6, glu: 4, gcs: 0 } as Record<string, number>, // ± on one-shot readings

  // patient lines
  sayEverySec: 18,

  // scoring
  outcomeScore: { stabil: 100, kritik: 60, kayip: 0 } as Record<string, number>,
  kritikIdleScore: 20, // 'kritik' handover with no correct step done (or still in arrest): the team did nothing useful
  autoTeslimTicks: 10 * TICK, // every step done + stabil this long → automatic early handover
  onayMax: 8, // cap on live approvals (one per PU anyway)
  earlyBonusMax: 0.5, // timeMult = 1 + this × (time left / case length) on an early 'teslim'
  harmPenalty: 15,
  wastePenalty: 5,
  teamBonus: 5,
  teamBonusMax: 20,
  teamWindowTicks: 10 * TICK,

  // generation
  herrings: [0, 1, 2] as number[], // red herrings by case index (clamped)
  allergyChance: 0.35,
};
