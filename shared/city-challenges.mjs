// Validation metadata mirrors the existing route definitions without carrying
// world geometry: ordered gate count, time budget, and server reward only.
export const cityChallenges = {
  dallas: [
    ['dfw-speed', 4, 62, 180], ['downtown-precision', 4, 72, 280], ['trinity-inverted', 3, 54, 340], ['white-rock-low', 4, 64, 240],
    ['trinity-dive', 3, 58, 310], ['addison-climb', 4, 66, 280], ['downtown-corkscrew', 5, 70, 360], ['las-colinas-flyby', 3, 64, 230],
  ].map(([id, gateCount, timeLimit, reward]) => ({ id, gateCount, timeLimit, reward })),
  milwaukee: [],
};
export function challengeForCity(cityId, challengeId) { return cityChallenges[cityId]?.find((challenge) => challenge.id === challengeId); }
