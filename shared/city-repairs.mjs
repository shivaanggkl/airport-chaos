// Gameplay-only city anchors: rendering is client-owned, validation is server-owned.
export const cityRepairBeacons = Object.freeze({
  dallas: [
    { id: 'dfw-service', x: -21_350, z: -12_100, radius: 105, maxAltitude: 180 },
    { id: 'love-service', x: -4_420, z: -6_950, radius: 95, maxAltitude: 180 },
    { id: 'addison-service', x: -2_950, z: -20_250, radius: 90, maxAltitude: 180 },
    { id: 'executive-service', x: -5_900, z: 9_750, radius: 90, maxAltitude: 180 },
    { id: 'irving-service', x: -15_100, z: -8_450, radius: 100, maxAltitude: 210 },
    { id: 'downtown-service', x: -2_050, z: -1_450, radius: 100, maxAltitude: 210 },
    { id: 'trinity-service', x: -4_100, z: 2_500, radius: 100, maxAltitude: 200 },
    { id: 'white-rock-service', x: 4_900, z: -7_700, radius: 100, maxAltitude: 210 },
    { id: 'north-dallas-service', x: -1_050, z: -15_300, radius: 95, maxAltitude: 200 },
    { id: 'south-industrial-service', x: -10_900, z: 4_650, radius: 95, maxAltitude: 190 },
  ],
  milwaukee: [
    { id: 'central-service', x: 640, z: 420, radius: 95, maxAltitude: 170 },
    { id: 'coast-service', x: 4_600, z: 3_120, radius: 90, maxAltitude: 170 },
    { id: 'mountain-service', x: -2_900, z: -4_350, radius: 85, maxAltitude: 170 },
    { id: 'countryside-service', x: -3_900, z: 3_300, radius: 85, maxAltitude: 170 },
  ],
});

export function repairsForCity(cityId) {
  return cityRepairBeacons[cityId] ?? [];
}
