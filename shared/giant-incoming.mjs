import { aircraftFlightEnvelope } from './aircraft-flight-envelope.mjs';
import { throttleSpeedTarget } from './flight-control-rules.mjs';
export const transportTuning = Object.freeze({ scale: 4, health: 2000, durationMs: 150000,
    speed: .65 * throttleSpeedTarget(.5, aircraftFlightEnvelope.trainer),
    separation: 1200, warningMs: 1000, burstIntervalMs: 6000, shotSpacingMs: 250,
    shotDamage: 10, yawArc: 70 * Math.PI / 180, pitchArc: 45 * Math.PI / 180 });
// Arc-length table is built once. An eastward crossing with two broad scenic
// bends avoids all four Dallas airport footprints and never reverses direction.
const samples = 4096;
const raw = t => ({ x: -20000 + 40000 * t, z: -2000 + 5000 * Math.sin(2 * Math.PI * t) });
const points = Array.from({ length: samples + 1 }, (_, i) => raw(i / samples));
const lengths = [0];
for (let i = 1; i <= samples; i++)
    lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
const routeScale = transportTuning.speed * transportTuning.durationMs / 1000 / lengths[samples];
export const transportRouteLength = transportTuning.speed * transportTuning.durationMs / 1000;
export function transportPose(elapsedMs, altitude = 900) {
    const distance = Math.max(0, Math.min(1, elapsedMs / transportTuning.durationMs)) * lengths[samples];
    let lo = 0, hi = samples;
    while (lo + 1 < hi) {
        const mid = (lo + hi) >> 1;
        if (lengths[mid] < distance)
            lo = mid;
        else
            hi = mid;
    }
    const blend = (distance - lengths[lo]) / (lengths[hi] - lengths[lo]);
    const t = (lo + blend) / samples;
    const p = raw(t), dx = 40000, dz = 10000 * Math.PI * Math.cos(2 * Math.PI * t);
    const yaw = Math.atan2(-dx, -dz), norm = Math.hypot(dx, dz);
    const yawRate = dx * 20000 * Math.PI * Math.PI * Math.sin(2 * Math.PI * t) / (norm * norm) * transportTuning.speed / (norm * routeScale);
    return { x: p.x * routeScale, y: altitude, z: -2000 + (p.z + 2000) * routeScale, yaw, roll: -yawRate * 3,
        velocity: { x: dx / norm * transportTuning.speed, y: 0, z: dz / norm * transportTuning.speed } };
}
export function transportSpawn(altitude = 900) {
    const p = transportPose(0, altitude);
    return {
        position: { x: p.x - p.velocity.x / transportTuning.speed * transportTuning.separation, y: p.y, z: p.z - p.velocity.z / transportTuning.speed * transportTuning.separation },
        heading: p.yaw, speed: throttleSpeedTarget(.5, aircraftFlightEnvelope.trainer)
    };
}
