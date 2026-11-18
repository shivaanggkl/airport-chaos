import { aircraftFlightEnvelope } from './aircraft-flight-envelope.mjs';
import { throttleSpeedTarget } from './flight-control-rules.mjs';
import { cityAirports, aircraftGroundOffset } from './city-airports.mjs';
import { cityRegistry } from './city-registry.mjs';
import { territoriesForCity } from './city-territories.mjs';
const territories = territoriesForCity('dallas');
const metroplex = territories.find(t => t.id === 'dfw');
const whiteRock = territories.find(t => t.id === 'white-rock');
const bodyLockParts = Object.freeze(['body']);
const fortressLockParts = Object.freeze(['left', 'right', 'core']);
const noLockParts = Object.freeze([]);
// Displayed M9/M13/M18/M22/M24/M28 use historical IDs 07–12.
export function transportLockParts(missionId) {
    switch (missionId) {
        case 'journey-dallas-07': case 'journey-dallas-08':
        case 'journey-dallas-09': case 'journey-dallas-10': return bodyLockParts;
        case 'journey-dallas-11': case 'journey-dallas-12': return fortressLockParts;
        default: return noLockParts;
    }
}
const legacyGunMounts = Object.freeze([
    Object.freeze({x:0,y:4.699999809265137,z:18.600000381469727,yaw:0}),
    Object.freeze({x:-11,y:4.699999809265137,z:0,yaw:-Math.PI/2}),
    Object.freeze({x:11,y:4.699999809265137,z:0,yaw:Math.PI/2}),
]);
const m16GunMounts = Object.freeze([
    legacyGunMounts[0],
    Object.freeze({...legacyGunMounts[1],yaw:0}),
    Object.freeze({...legacyGunMounts[2],yaw:0}),
    Object.freeze({x:0,y:4.699999809265137,z:-12,yaw:Math.PI}),
]);
export function transportGunMounts(missionId) { return missionId==='journey-dallas-10' ? m16GunMounts : legacyGunMounts; }
const scale = 32;
export function transportScaleForMission(missionId) { return scale; }
export function transportFootprintForMission(missionId) { return Math.hypot(24, 22) * transportScaleForMission(missionId); }
export const transportFootprintRadius = Math.hypot(24, 22) * scale;
const start = Object.freeze({ x: metroplex.bounds.minX, z: metroplex.center.z });
const dx = whiteRock.center.x - start.x, dz = whiteRock.center.z - start.z;
const norm = Math.hypot(dx, dz);
const exitX = cityRegistry.dallas.worldOrigin.x + cityRegistry.dallas.worldSize / 2;
const end = Object.freeze({ x: exitX + transportFootprintRadius,
    z: start.z + (exitX + transportFootprintRadius - start.x) * dz / dx });
export const transportCourse = Object.freeze({ start, whiteRock: whiteRock.center, end, exitX });
export const transportRouteLength = Math.hypot(end.x - start.x, end.z - start.z);
// The compact encounter keeps the established safe corridor and eastern exit.
// The existing eastern exit requires a longer route from a DFW-side entry.
const compactStartX = -55_000;
const compactStart = Object.freeze({x:compactStartX,z:start.z+(compactStartX-start.x)*dz/dx});
const compactLength = Math.hypot(end.x-compactStart.x,end.z-compactStart.z);
const legacyRoute = Object.freeze({...transportCourse,length:transportRouteLength});
const compactRoute = Object.freeze({...transportCourse,start:compactStart,length:compactLength});
export function transportRouteForMission(missionId) {
    return (missionId === 'journey-dallas-07' || missionId === 'journey-dallas-08') ? compactRoute : legacyRoute;
}

// Retain the authored arrival corridor, then make broad continuous turns
// inside Dallas. Pose remains a pure function of encounter time, so clients,
// damage checks, pause and reconnect all use exactly the same path.
export const transportTurnRadius = 6_000;
const cityTransportMissions = new Set(['journey-dallas-07','journey-dallas-08','journey-dallas-09',
    'journey-dallas-10','journey-dallas-11','journey-dallas-12']);
const direction = {x:dx/norm,z:dz/norm};
const normal = {x:-direction.z,z:direction.x};
const cityReturnDistances = new Map([legacyRoute,compactRoute].map(route => {
    const margin=transportFootprintRadius+transportTurnRadius*3,half=cityRegistry.dallas.worldSize/2;
    let high=route.length;
    for(const axis of ['x','z']) {
        const origin=cityRegistry.dallas.worldOrigin[axis],step=direction[axis];
        if(Math.abs(step)<1e-9)continue;
        const a=(origin-half+margin-route.start[axis])/step,b=(origin+half-margin-route.start[axis])/step;
        high=Math.min(high,Math.max(a,b));
    }
    return [route,high];
}));
function cityTransportPose(route,distance,speed,altitude,missionId) {
    const high=cityReturnDistances.get(route),r=transportTurnRadius,arc=Math.PI*r;
    let along=distance,across=0,vx=direction.x,vz=direction.z;
    if(distance>high) {
        const travel=distance-high;
        if(travel<arc) {
            const t=travel/r,sin=Math.sin(t),cos=Math.cos(t);along=high+r*sin;across=r*(1-cos);
            vx=direction.x*cos+normal.x*sin;vz=direction.z*cos+normal.z*sin;
        } else {
            along=high-(travel-arc);across=2*r;vx=-direction.x;vz=-direction.z;
        }
    }
    return {...(missionId==='journey-dallas-10'?{missionId}:{}),scale:transportScaleForMission(missionId),y:altitude,
        x:route.start.x+direction.x*along+normal.x*across,z:route.start.z+direction.z*along+normal.z*across,
        yaw:Math.atan2(-vx,-vz),roll:0,velocity:{x:vx*speed,y:0,z:vz*speed}};
}

const speed = .9 * .65 * throttleSpeedTarget(.5, aircraftFlightEnvelope.trainer);
// Failure is tied to the complete airframe clearing Dallas, not the former fixed timer.
export const transportTuning = Object.freeze({ scale, health: 2000, altitudeMultiplier: 1.5,
    durationMs: Math.ceil(transportRouteLength / speed * 1000), speed,
    separation: 1200, warningMs: 1000, burstIntervalMs: 6000, shotSpacingMs: 250,
    shotDamage: 10, yawArc: 70 * Math.PI / 180, pitchArc: 45 * Math.PI / 180 });
export function transportPose(elapsedMs, altitude = 900, durationMs = transportTuning.durationMs, missionId) {
    const route = transportRouteForMission(missionId);
    if(cityTransportMissions.has(missionId)) {
        const travelSpeed=route===compactRoute?route.length/(durationMs/1000)
            :durationMs===transportTuning.durationMs?speed:transportRouteLength/(durationMs/1000);
        return cityTransportPose(route,Math.max(0,Math.min(elapsedMs,durationMs))/1000*travelSpeed,travelSpeed,altitude,missionId);
    }
    if(route === compactRoute){
        const travelSpeed=route.length/(durationMs/1000);
        const distance=Math.max(0,Math.min(route.length,elapsedMs/1000*travelSpeed));
        return {...(missionId==='journey-dallas-10'?{missionId}:{}),scale:transportScaleForMission(missionId),x:route.start.x+dx/norm*distance,y:altitude,z:route.start.z+dz/norm*distance,
            yaw:Math.atan2(-dx,-dz),roll:0,velocity:{x:dx/norm*travelSpeed,y:0,z:dz/norm*travelSpeed}};
    }
    const travelSpeed = durationMs === transportTuning.durationMs ? speed : transportRouteLength / (durationMs / 1000);
    const distance = Math.max(0, Math.min(transportRouteLength, elapsedMs / 1000 * travelSpeed));
    return { ...(missionId==='journey-dallas-10'?{missionId}:{}), scale: transportScaleForMission(missionId), x: start.x + dx / norm * distance, y: altitude, z: start.z + dz / norm * distance,
        yaw: Math.atan2(-dx, -dz), roll: 0,
        velocity: { x: dx / norm * travelSpeed, y: 0, z: dz / norm * travelSpeed } };
}
export function transportSpawn(groundHeight = 0) {
    const airport = cityAirports.dallas.find(a => a.id === 'dfw');
    return { position: { x: airport.x, y: groundHeight + aircraftGroundOffset, z: airport.z },
        heading: airport.heading, speed: 0 };
}
