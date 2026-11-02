import {cityAirports} from './city-airports.mjs';
function smoothstep(edge0, edge1, value) {
    const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}
function gaussian(x, z, centerX, centerZ, radiusX, radiusZ, height) {
    const dx = (x - centerX) / radiusX;
    const dz = (z - centerZ) / radiusZ;
    return Math.exp(-(dx * dx + dz * dz) * 2.2) * height;
}
function rawTerrainHeight(x, z) {
    // A compact, deterministic elevation field authored for City 1's fixed bounds.
    const rolling = Math.sin((x + z * 0.32) * 0.0011) * 8 +
        Math.cos((z - x * 0.24) * 0.00155) * 5;
    const countryside = gaussian(x, z, -3000, 3500, 2400, 2100, 34);
    const foothills = gaussian(x, z, -4100, -2600, 2200, 1900, 105);
    const mountainRidge = gaussian(x, z, -5100, -4700, 1800, 1050, 260) +
        gaussian(x, z, -2550, -5400, 1600, 820, 155);
    const lakeBasin = gaussian(x, z, -280, -3717, 720, 1120, 24);
    const coastShelf = gaussian(x, z, 4800, 2100, 1500, 1900, 13);
    return rolling + countryside + foothills + mountainRidge - lakeBasin - coastShelf;
}
function airportFlattening(x, z, airport) {
    const offsetX = x - airport.x;
    const offsetZ = z - airport.z;
    const cosine = Math.cos(airport.heading);
    const sine = Math.sin(airport.heading);
    const localX = offsetX * cosine - offsetZ * sine;
    const localZ = offsetX * sine + offsetZ * cosine;
    const beyondX = Math.max(0, Math.abs(localX) - airport.safetyHalfWidth);
    const beyondZ = Math.max(0, Math.abs(localZ) - airport.runwayLength / 2 - 220);
    return 1 - smoothstep(0, 260, Math.hypot(beyondX, beyondZ));
}
export function createTerrainHeightSampler(airports) {
    return (x, z) => {
        const rawHeight = rawTerrainHeight(x, z);
        let flattening = 0;
        for (const airport of airports)
            flattening = Math.max(flattening, airportFlattening(x, z, airport));
        return rawHeight * (1 - flattening);
    };
}

export const milwaukeeTerrainHeight=createTerrainHeightSampler(cityAirports.milwaukee.map(airport=>({...airport,safetyHalfWidth:airport.id==='central'?1250:airport.id==='coast'?380:270})));
