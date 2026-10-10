// The mission Speed Course uses the same tiny route coordinates in browser
// visuals and server gate validation. No city rendering data is duplicated.
export const dfwSpeedGates = Object.freeze([
  { x: -20_400, z: -10_100, altitude: 380, radius: 82 },
  { x: -16_600, z: -8_900, altitude: 510, radius: 82 },
  { x: -12_900, z: -7_400, altitude: 540, radius: 82 },
  { x: -9_400, z: -5_800, altitude: 500, radius: 82 },
]);
export const whiteRockLowGates = Object.freeze([
  { x: 2_900, z: -7_100, altitude: 145, radius: 68, maxAltitude: 290 },
  { x: 4_550, z: -8_080, altitude: 135, radius: 64, maxAltitude: 275 },
  { x: 6_450, z: -9_050, altitude: 150, radius: 64, maxAltitude: 290 },
  { x: 7_950, z: -8_000, altitude: 165, radius: 68, maxAltitude: 310 },
]);
export const downtownPrecisionGates = Object.freeze([
  { x: -2_400, z: -1_700, altitude: 390, radius: 42 },
  { x: -980, z: -720, altitude: 470, radius: 38 },
  { x: 640, z: -1_160, altitude: 420, radius: 38 },
  { x: 1_100, z: 480, altitude: 500, radius: 42 },
]);
export const lasColinasFlybyGates = Object.freeze([
  { x: -15_400, z: -10_200, altitude: 330, radius: 70 },
  { x: -13_700, z: -9_400, altitude: 360, radius: 68 },
  { x: -12_100, z: -8_500, altitude: 340, radius: 70 },
]);
// Existing Addison departure-climb course, shared by Free Flight rendering and Journey validation.
export const addisonClimbGates = Object.freeze([
  { x: -3_880, z: -19_550, altitude: 310, radius: 76 },
  { x: -3_780, z: -18_000, altitude: 680, radius: 72 },
  { x: -3_580, z: -16_500, altitude: 1_080, radius: 70 },
  { x: -3_440, z: -15_000, altitude: 1_460, radius: 72 },
]);
export const cityChallenges = {
  dallas: [
    ['dfw-speed', 4, 62, 180], ['downtown-precision', 4, 72, 280], ['trinity-inverted', 3, 54, 340], ['white-rock-low', 4, 64, 240],
    ['trinity-dive', 3, 58, 310], ['addison-climb', 4, 66, 280], ['downtown-corkscrew', 5, 70, 360], ['las-colinas-flyby', 3, 64, 230],
  ].map(([id, gateCount, timeLimit, reward]) => ({ id, gateCount, timeLimit, reward, gates: id === 'dfw-speed' ? dfwSpeedGates : id === 'white-rock-low' ? whiteRockLowGates : undefined })),
  milwaukee: [],
};
export function challengeForCity(cityId, challengeId) { return cityChallenges[cityId]?.find((challenge) => challenge.id === challengeId); }
