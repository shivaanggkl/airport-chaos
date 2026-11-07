import { DALLAS_WORLD_SCALE } from './dallas-world-scale.mjs';
export const competitiveModes = Object.freeze({
  skyDuel: Object.freeze({
    id: 'skyDuel', cityId: 'dallas', playerCount: 2, teamCount: 2,
    entryCredits: 500, prizeCredits: 1000,
    durationMs: 180_000 * DALLAS_WORLD_SCALE, respawnMs: 3_000,
  }),
});
