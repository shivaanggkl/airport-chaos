import { aircraftFlightEnvelope } from './aircraft-flight-envelope.mjs';
import { throttleSpeedTarget } from './flight-control-rules.mjs';
import { cityAirports, aircraftGroundOffset } from './city-airports.mjs';
import { cityRegistry } from './city-registry.mjs';
import { territoriesForCity } from './city-territories.mjs';
const territories = territoriesForCity('dallas');
const metroplex = territories.find(t => t.id === 'dfw');
const whiteRock = territories.find(t => t.id === 'white-rock');
const scale = 16;
export const transportFootprintRadius = Math.hypot(24, 22) * scale;
const start = Object.freeze({ x: metroplex.bounds.minX, z: metroplex.center.z });
const dx = whiteRock.center.x - start.x, dz = whiteRock.center.z - start.z;
const norm = Math.hypot(dx, dz);
const exitX = cityRegistry.dallas.worldOrigin.x + cityRegistry.dallas.worldSize / 2;
const end = Object.freeze({ x: exitX + transportFootprintRadius,
    z: start.z + (exitX + transportFootprintRadius - start.x) * dz / dx });
export const transportCourse = Object.freeze({ start, whiteRock: whiteRock.center, end, exitX });
export const transportRouteLength = Math.hypot(end.x - start.x, end.z - start.z);
const speed = .9 * .65 * throttleSpeedTarget(.5, aircraftFlightEnvelope.trainer);
// Failure is tied to the complete airframe clearing Dallas, not the former fixed timer.
export const transportTuning = Object.freeze({ scale, health: 2000,
    durationMs: Math.ceil(transportRouteLength / speed * 1000), speed,
    separation: 1200, warningMs: 1000, burstIntervalMs: 6000, shotSpacingMs: 250,
    shotDamage: 10, yawArc: 70 * Math.PI / 180, pitchArc: 45 * Math.PI / 180 });
export function transportPose(elapsedMs, altitude = 900, durationMs = transportTuning.durationMs) {
    const travelSpeed = durationMs === transportTuning.durationMs ? speed : transportRouteLength / (durationMs / 1000);
    const distance = Math.max(0, Math.min(transportRouteLength, elapsedMs / 1000 * travelSpeed));
    return { x: start.x + dx / norm * distance, y: altitude, z: start.z + dz / norm * distance,
        yaw: Math.atan2(-dx, -dz), roll: 0,
        velocity: { x: dx / norm * travelSpeed, y: 0, z: dz / norm * travelSpeed } };
}
export function transportSpawn(groundHeight = 0) {
    const airport = cityAirports.dallas.find(a => a.id === 'dfw');
    return { position: { x: airport.x, y: groundHeight + aircraftGroundOffset, z: airport.z },
        heading: airport.heading, speed: 0 };
}
