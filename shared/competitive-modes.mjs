export const competitiveModes = Object.freeze({
  skyDuel: Object.freeze({
    id: 'skyDuel', cityId: 'dallas', playerCount: 2, teamCount: 2,
    entryCredits: 500, prizeCredits: 1000, takedownsToWin: 3,
    durationMs: 240_000, overtimeMs: 45_000, respawnMs: 3_000,
    // Center and west parallel DFW runways in the Dallas world.
    runwayLaterals: Object.freeze([0, -690]),
  }),
});
