import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { ballisticIntercept, ballisticShotSpeed, COMBAT_RANGE, BASE_PROJECTILE_SPEED } from '../../shared/protocol.mjs';

type V = { x: number; y: number; z: number };
type Aircraft = keyof typeof aircraftFlightEnvelope;
export type HunterMotion = { expertControl?: boolean; speed: number; bankControl: number; flightAltitude?: number; terrainAltitude?: number; combatTurnSign: number };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const angle = (v: number) => Math.atan2(Math.sin(v), Math.cos(v));
const toward = (a: number, b: number, step: number) => a + clamp(b - a, -step, step);

/** A flight intercept, distinct from the much faster bullet intercept. */
export function hunterFlightIntercept(position: V, speed: number, target: V, velocity: V): V {
  const x = target.x - position.x, z = target.z - position.z;
  const a = velocity.x ** 2 + velocity.z ** 2 - speed ** 2;
  const b = 2 * (x * velocity.x + z * velocity.z), c = x * x + z * z;
  let seconds = Math.sqrt(c) / Math.max(speed, 1);
  const discriminant = b * b - 4 * a * c;
  if (Math.abs(a) < 1e-6 && b < 0) seconds = -c / b;
  else if (discriminant >= 0 && Math.abs(a) >= 1e-6) {
    const roots = [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)].filter(t => t > 0);
    if (roots.length) seconds = Math.min(...roots);
  }
  seconds = clamp(seconds, 1, 12);
  return { x: target.x + velocity.x * seconds, y: target.y + velocity.y * seconds, z: target.z + velocity.z * seconds };
}

/** Same launch-speed and range solver used by the existing server projectile system. */
export function hunterBallisticSolution(origin: V, velocity: V, target: V, targetVelocity: V, turnRate = 0) {
  if (!Number.isFinite(turnRate) || Math.hypot(target.x-origin.x,target.y-origin.y,target.z-origin.z)>COMBAT_RANGE) return null;
  if (Math.abs(turnRate)<.02) return ballisticIntercept(origin,velocity,target,targetVelocity);
  // Launch-time forecast of an observed bank. The projectile remains straight and can be dodged.
  const sample=(seconds:number)=>{
    const sine=Math.sin(turnRate*seconds),cosine=Math.cos(turnRate*seconds);
    const point={x:target.x+(targetVelocity.x*sine+targetVelocity.z*(1-cosine))/turnRate,
      y:target.y+targetVelocity.y*seconds,z:target.z+(targetVelocity.z*sine-targetVelocity.x*(1-cosine))/turnRate};
    const x=point.x-origin.x,y=point.y-origin.y,z=point.z-origin.z,distance=Math.hypot(x,y,z);
    const direction=distance>.000001?{x:x/distance,y:y/distance,z:z/distance}:{x:0,y:0,z:-1};
    const speed=ballisticShotSpeed(velocity,direction);
    return {direction,distance,speed,point,error:distance-speed*seconds};
  };
  let low=0,high=0;
  for(let step=1;step<=64;step++){high=COMBAT_RANGE/BASE_PROJECTILE_SPEED*step/64;if(sample(high).error<=0)break;low=high;}
  if(sample(high).error>0)return null;
  for(let step=0;step<26;step++){const middle=(low+high)/2;if(sample(middle).error>0)low=middle;else high=middle;}
  const solution=sample(high);
  return solution.distance<=COMBAT_RANGE&&Math.abs(solution.error)<=.01
    ? {direction:solution.direction,distance:solution.distance,speed:solution.speed,point:solution.point,seconds:high}:null;
}

/** Bank, yaw, acceleration and pitch all remain bounded by the authored aircraft envelope. */
export function advanceHunterFlight(player: { position: V; rotation: V; velocity: V; aircraftType: Aircraft },
  motion: HunterMotion, target: V, cruise: number, delta: number, floorAt: (x: number, z: number) => number): void {
  const e = aircraftFlightEnvelope[player.aircraftType];
  const forwardX = -Math.sin(player.rotation.y), forwardZ = -Math.cos(player.rotation.y);
  let floor = floorAt(player.position.x, player.position.z), blocked = false;
  const climbRate = Math.max(1, motion.speed * Math.sin(e.maxClimbPitch));
  for (const seconds of [1.5, 3, 5, 8]) {
    const sample = floorAt(player.position.x + forwardX * motion.speed * seconds, player.position.z + forwardZ * motion.speed * seconds);
    floor = Math.max(floor, sample);
    if (sample > player.position.y + climbRate * seconds * .7) blocked = true;
  }
  if (blocked) motion.terrainAltitude = Math.max(motion.terrainAltitude ?? 0, floor + 35);
  if (motion.terrainAltitude !== undefined) {
    if (player.position.y < motion.terrainAltitude - 10) blocked = true;
    else motion.terrainAltitude = undefined;
  }
  const desiredAltitude = Math.max(target.y, floor + 35, motion.terrainAltitude ?? 0);
  motion.flightAltitude ??= Math.max(player.position.y, desiredAltitude);
  motion.flightAltitude += (desiredAltitude - motion.flightAltitude) * (1 - Math.exp(-delta * .8));
  const steps = Math.max(1, Math.ceil(delta / .05)), dt = delta / steps;
  for (let step = 0; step < steps; step++) {
    const dx = target.x - player.position.x, dz = target.z - player.position.z;
    let error = angle(Math.atan2(-dx, -dz) - player.rotation.y);
    // Retain the chosen return-turn side when the target is behind the tail.
    if (Math.abs(error) > 2.3) error = Math.abs(error) * motion.combatTurnSign;
    if (blocked) error = motion.combatTurnSign * 1.2;
    const bankTarget = clamp(error * .85, -.82, .82);
    const bankCommand = clamp((bankTarget - player.rotation.z) / .5, -1, 1);
    motion.bankControl += (bankCommand - motion.bankControl) * (1 - Math.exp(-e.rollInputResponse * dt));
    player.rotation.z = clamp(player.rotation.z + motion.bankControl * e.rollRate * dt, -.82, .82);
    const ratio = clamp(motion.speed / e.maxSpeed, 0, 1);
    const authority = (0.42 + ratio * .5) * e.yawRate / e.inertia;
    const turnLimit = authority + Math.abs(Math.sin(player.rotation.z)) * ratio * e.bankTurn;
    const yawRate = Math.sign(player.rotation.z) * Math.min(Math.abs(error) * (motion.expertControl ? e.alignmentRate / e.inertia : .85), turnLimit) * Math.min(1, Math.abs(player.rotation.z) / .35);
    player.rotation.y = angle(player.rotation.y + yawRate * dt);
    const desiredSpeed = clamp(cruise * (1 - Math.abs(Math.sin(player.rotation.z)) * .16), e.stallSpeed * 1.2, e.maxSpeed);
    const drag = e.drag * (motion.speed / e.maxSpeed) ** 2 / e.inertia;
    motion.speed = toward(motion.speed, desiredSpeed,
      (desiredSpeed > motion.speed ? Math.max(0, e.acceleration / e.inertia - drag) : Math.max(drag, e.airbrakeDrag / e.inertia * .35)) * dt);
    const dy = motion.flightAltitude - player.position.y;
    const verticalTarget = clamp(dy * .2, -motion.speed * Math.sin(e.maxDivePitch), motion.speed * Math.sin(e.maxClimbPitch));
    const verticalAcceleration = Math.min(18, e.acceleration / e.inertia * .55);
    const vertical = toward(player.velocity.y, verticalTarget, verticalAcceleration * dt);
    const pitchTarget = Math.asin(clamp(vertical / Math.max(1, motion.speed), -.9, .9));
    player.rotation.x = toward(player.rotation.x, pitchTarget, e.pitchRate / e.inertia * dt);
    const horizontal = motion.speed * Math.cos(player.rotation.x);
    player.velocity.x = -Math.sin(player.rotation.y) * horizontal;
    player.velocity.y = Math.sin(player.rotation.x) * motion.speed;
    player.velocity.z = -Math.cos(player.rotation.y) * horizontal;
    player.position.x += player.velocity.x * dt;
    player.position.y += player.velocity.y * dt;
    player.position.z += player.velocity.z * dt;
  }
}
