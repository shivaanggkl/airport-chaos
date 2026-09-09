// City-local geography belongs in data, while capture behavior stays generic
// in the server. Coordinates use the same meter-based Dallas activity anchors.
export const cityTerritories = {
  dallas: [
    { id: 'dfw', cityId: 'dallas', displayName: 'DFW', center: { x: -22800, z: -13600 }, bounds: { minX: -25000, maxX: -19400, minZ: -16600, maxZ: -10600 }, captureWeight: 1.2, mapColor: '#d6a653' },
    { id: 'downtown', cityId: 'dallas', displayName: 'Downtown', center: { x: -600, z: -450 }, bounds: { minX: -2600, maxX: 1800, minZ: -2800, maxZ: -650 }, captureWeight: 1.15, mapColor: '#d96755' },
    { id: 'las-colinas', cityId: 'dallas', displayName: 'Las Colinas', center: { x: -13500, z: -9350 }, bounds: { minX: -16400, maxX: -10500, minZ: -11800, maxZ: -6900 }, captureWeight: 1, mapColor: '#5a9dc9' },
    { id: 'love-field', cityId: 'dallas', displayName: 'Love Field', center: { x: -5140, z: -7780 }, bounds: { minX: -6900, maxX: -3400, minZ: -9600, maxZ: -5800 }, captureWeight: 1, mapColor: '#c58a56' },
    { id: 'white-rock', cityId: 'dallas', displayName: 'White Rock', center: { x: 5200, z: -8500 }, bounds: { minX: 3000, maxX: 7700, minZ: -10800, maxZ: -6300 }, captureWeight: .95, mapColor: '#5f9fc0' },
    { id: 'trinity-corridor', cityId: 'dallas', displayName: 'Trinity Corridor', center: { x: -2380, z: 720 }, bounds: { minX: -5600, maxX: -1200, minZ: -500, maxZ: 3900 }, captureWeight: 1.05, mapColor: '#658b75' },
    { id: 'addison', cityId: 'dallas', displayName: 'Addison', center: { x: -3700, z: -21100 }, bounds: { minX: -5700, maxX: -1700, minZ: -23100, maxZ: -19000 }, captureWeight: 1, mapColor: '#9a7ac1' },
    { id: 'dallas-executive', cityId: 'dallas', displayName: 'Dallas Executive', center: { x: -6700, z: 10600 }, bounds: { minX: -8500, maxX: -4800, minZ: 8700, maxZ: 12600 }, captureWeight: 1, mapColor: '#b27d61' },
  ],
  milwaukee: [],
};

export function territoriesForCity(cityId) {
  return cityTerritories[cityId] ?? [];
}
