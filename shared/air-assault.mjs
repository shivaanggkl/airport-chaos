import { enemyAiLevels } from './enemy-ai.mjs';
import { cityAirports } from './city-airports.mjs';
import { DALLAS_WORLD_SCALE, scaleDallasPoint } from './dallas-world-scale.mjs';
export const airAssaultRules = Object.freeze({ cityId: 'dallas', fullCredits: 600, survivalCredits: 250, durationMs: 480000 * DALLAS_WORLD_SCALE, introMs: 15000, countdownMs: 3000, returnMs: 10000, reconnectMs: 30000, maxActive: 4, heartCooldownMs: 60000 });
// Hull values belong to this encounter; intelligence is the canonical shared object.
export const airAssaultTiers = Object.freeze({
  medium: Object.freeze({ health: 100, level: 'MEDIUM', ai: enemyAiLevels.MEDIUM }),
  hard: Object.freeze({ health: 150, level: 'HARD', ai: enemyAiLevels.HARD }),
  legendary: Object.freeze({ health: 200, level: 'LEGENDARY', ai: enemyAiLevels.LEGENDARY }),
});
export const airAssaultAirports = ['love', 'addison', 'executive'].map(id => cityAirports.dallas.find(a => a.id === id));
export const airAssaultHearts = [
  { id: 'assault-heart-love', kind: 'heart', x: -15000, y: 650, z: -10500, radius: 140 },
  { id: 'assault-heart-addison', kind: 'heart', x: -15500, y: 750, z: -18000, radius: 140 },
  { id: 'assault-heart-executive', kind: 'heart', x: -16000, y: 650, z: -2000, radius: 140 },
].map(heart => ({ ...scaleDallasPoint(heart), y: heart.y * DALLAS_WORLD_SCALE, radius: heart.radius * DALLAS_WORLD_SCALE }));
export function airAssaultManifest() {
  const quota = { medium: [5, 5, 5], hard: [3, 4, 3], legendary: [2, 1, 2] };
  const counts = [0, 0, 0], result = [];
  for (const tier of ['medium', 'hard', 'legendary']) {
    const remaining = [...quota[tier]];
    while (remaining.some(n => n > 0))
      for (let a = 0; a < 3; a++)
        if (remaining[a] > 0) {
          remaining[a]--;
          result.push({ tier, airportId: airAssaultAirports[a].id, ordinal: counts[a]++ });
        }
  }
  return result;
}
export function airAssaultQueuePosition(airportId, ordinal, elevation) {
  const a = airAssaultAirports.find(a => a.id === airportId);
  const along = a.runwayLength * .05 + ordinal * 65;
  return { x: a.x + Math.sin(a.heading) * along, y: elevation + 1.2, z: a.z + Math.cos(a.heading) * along };
}
export function airAssaultInside(p) { return p.x >= -32000 * DALLAS_WORLD_SCALE && p.x <= 5000 * DALLAS_WORLD_SCALE && p.z >= -28000 * DALLAS_WORLD_SCALE && p.z <= 17000 * DALLAS_WORLD_SCALE && p.y < 9000 * DALLAS_WORLD_SCALE; }
