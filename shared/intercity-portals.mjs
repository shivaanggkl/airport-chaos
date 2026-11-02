export const portalRules = Object.freeze({ radius: 170, altitude: 215, towerHeight: 450, tunnelMinMs: 7000, timeoutMs: 45000, crossingGraceMs: 2500, arrivalClearance: 1550 });
const gates = Object.freeze({ dallas: { cityId: 'dallas', destination: 'milwaukee', routeId: 'dallas-milwaukee', x: 10000, z: -20000, heading: 0 }, milwaukee: { cityId: 'milwaukee', destination: 'dallas', routeId: 'milwaukee-dallas', x: 0, z: 4300, heading: Math.PI } });
export function portalForCity(cityId, terrain) { const g = gates[cityId]; if (!g)
    return; let ground = terrain(g.x, g.z); for (let d = -1500; d <= 1500; d += 150)
    for (const side of [-180, 0, 180])
        ground = Math.max(ground, terrain(g.x + side, g.z + d)); return { ...g, y: ground + portalRules.altitude, radius: portalRules.radius, normal: { x: -Math.sin(g.heading), z: -Math.cos(g.heading) } }; }
export function sweptPortalCrossing(g, a, b) { const da = (a.x - g.x) * g.normal.x + (a.z - g.z) * g.normal.z, db = (b.x - g.x) * g.normal.x + (b.z - g.z) * g.normal.z; if (da >= 0 || db < 0 || db - da < .001)
    return false; const t = -da / (db - da), x = a.x + (b.x - a.x) * t - g.x, z = a.z + (b.z - a.z) * t - g.z, y = a.y + (b.y - a.y) * t - g.y; return x * x + y * y + z * z < (g.radius - 12) ** 2; }
export function portalExit(g, pose, entry, terrain, rollback = false, entryGround = entry.position.y - 215) {
    const sourceHeading = rollback ? g.heading : gates[g.destination].heading;
    const heading = g.heading + Math.PI + pose.rotation.y - sourceHeading;
    const distance = portalRules.arrivalClearance, x = g.x - g.normal.x * distance, z = g.z - g.normal.z * distance;
    const y = terrain(x, z) + Math.max(60, pose.position.y - entryGround);
    const delta = heading - pose.rotation.y, c = Math.cos(delta), s = Math.sin(delta);
    return { position: { x, y, z }, rotation: { ...pose.rotation, y: heading }, velocity: { x: pose.velocity.x * c + pose.velocity.z * s, y: pose.velocity.y, z: -pose.velocity.x * s + pose.velocity.z * c } };
}
export function portalModeAllowed(mode, tutorial = false, journey = false) { return !tutorial && !journey && (mode === 'solo-free-fly' || mode === 'free-fly'); }
