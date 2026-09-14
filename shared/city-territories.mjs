// City-local geography belongs in data, while capture behavior stays generic
// in the server. Coordinates use the same meter-based Dallas activity anchors.
import { dallasDisplayNames } from './dallas-display-names.mjs';
export const cityTerritories = {
  dallas: [
    { id: 'dfw', cityId: 'dallas', displayName: dallasDisplayNames.dfw, center: { x: -22800, z: -13600 }, bounds: { minX: -27000, maxX: -18700, minZ: -17600, maxZ: -9600 }, captureWeight: 1.2, fixedColor: '#a34dff', colorName: 'Vivid Purple' },
    { id: 'downtown', cityId: 'dallas', displayName: dallasDisplayNames.downtown, center: { x: -600, z: -450 }, bounds: { minX: -3000, maxX: 2400, minZ: -3400, maxZ: 100 }, captureWeight: 1.15, fixedColor: '#2678ff', colorName: 'Electric Blue', botObstacleClearance: 460 },
    { id: 'las-colinas', cityId: 'dallas', displayName: dallasDisplayNames.lasColinas, center: { x: -13500, z: -9350 }, bounds: { minX: -17900, maxX: -9500, minZ: -13000, maxZ: -5800 }, captureWeight: 1, fixedColor: '#00d6b3', colorName: 'Bright Teal' },
    { id: 'love-field', cityId: 'dallas', displayName: dallasDisplayNames.love, center: { x: -5140, z: -7780 }, bounds: { minX: -8000, maxX: -2700, minZ: -10500, maxZ: -5000 }, captureWeight: 1, fixedColor: '#ffd02e', colorName: 'Gold' },
    { id: 'white-rock', cityId: 'dallas', displayName: 'White Rock', center: { x: 5200, z: -8500 }, bounds: { minX: 2700, maxX: 9800, minZ: -12200, maxZ: -5800 }, captureWeight: .95, fixedColor: '#16cfff', colorName: 'Cyan' },
    { id: 'trinity-corridor', cityId: 'dallas', displayName: 'Trinity Corridor', center: { x: -2380, z: 720 }, bounds: { minX: -6700, maxX: -700, minZ: 400, maxZ: 6900 }, captureWeight: 1.05, fixedColor: '#f04ba0', colorName: 'Magenta' },
    { id: 'addison', cityId: 'dallas', displayName: dallasDisplayNames.addison, center: { x: -3700, z: -21100 }, bounds: { minX: -6800, maxX: 0, minZ: -24000, maxZ: -17900 }, captureWeight: 1, fixedColor: '#55df45', colorName: 'Bright Green' },
    { id: 'dallas-executive', cityId: 'dallas', displayName: dallasDisplayNames.executive, center: { x: -6700, z: 10600 }, bounds: { minX: -9600, maxX: -3700, minZ: 7500, maxZ: 13500 }, captureWeight: 1, fixedColor: '#ff8528', colorName: 'Strong Orange' },
  ],
  milwaukee: [],
};

export function territoriesForCity(cityId) {
  return cityTerritories[cityId] ?? [];
}
