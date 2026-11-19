import { scaleDallasPoint } from './dallas-world-scale.mjs';
// Relative to the server-accepted launch position and heading; already world units.
export const sharpshooterPlacements = Object.freeze([
  Object.freeze({ angleDegrees: 0, distance: 4200, altitude: 0 }),
  Object.freeze({ angleDegrees: 35, distance: 8000, altitude: 650 }),
  Object.freeze({ angleDegrees: -40, distance: 10500, altitude: 1300 }),
  Object.freeze({ angleDegrees: 65, distance: 12500, altitude: 400 }),
  Object.freeze({ angleDegrees: -65, distance: 14500, altitude: 1800 }),
  Object.freeze({ angleDegrees: 0, distance: 18000, altitude: 2400 }),
]);

// Mission 2 anchors follow the Dallas district positions in the mission map.
// Four east/west sweeps, then two stationary targets south of Downtown.
export const movingTargetPlacements = Object.freeze([
  {label:'LAS COLINAS',x:-13500,z:-9350,moving:true},
  {label:'SOUTH ADDISON',x:-2500,z:-16100,moving:true},
  {label:'WHITE ROCK LAKE',x:6000,z:-6500,moving:true},
  {label:'IRVING',x:-12000,z:-3800,moving:true},
  {label:'DALLAS EXECUTIVE APPROACH',x:-5600,z:6800,moving:false},
  {label:'SOUTHEAST DALLAS',x:6500,z:6800,moving:false},
].map(point => Object.freeze(scaleDallasPoint(point))));

// Mission 3 follows the reference's clockwise Dallas route. Targets 4 and 7 stay fixed.
export const doubleTroublePlacements = Object.freeze([
  {label:'NORTH LAS COLINAS',x:-13500,z:-11000,moving:true},
  {label:'SOUTH ADDISON',x:-2500,z:-16100,moving:true},
  {label:'WHITE ROCK LAKE',x:6000,z:-8500,moving:true},
  {label:'EAST DALLAS',x:4800,z:-2500,moving:false},
  {label:'SOUTHEAST DALLAS',x:6500,z:6000,moving:true},
  {label:'EAST OF DALLAS EXECUTIVE',x:-1000,z:10000,moving:true},
  {label:'TRINITY CORRIDOR',x:-10000,z:4000,moving:false},
  {label:'IRVING',x:-16000,z:-2500,moving:true},
].map(point => Object.freeze(scaleDallasPoint(point))));

// A target's anchor never changes after activation. Motion uses mission elapsed
// time, so pausing/reconnecting preserves the same phase without frame packets.
export function sharpshooterTargetPose(target, elapsedMs, out) {
  const amplitude = target.motionAmplitude ?? (target.stage === 2 ? 150 : 0);
  const phase = Math.max(0, elapsedMs - target.activatedAt) * Math.PI * 2 / (target.motionPeriodMs ?? 8000);
  const offset = Math.sin(phase) * amplitude;
  out.x = target.x + Math.cos(target.heading) * offset;
  out.y = target.y;
  out.z = target.z - Math.sin(target.heading) * offset;
  return out;
}
