/** One queued runway departure for M5's cinematic and authoritative handoff. */
export const territoryDeparture = Object.freeze({establishMs: 3500, spacingMs: 1800, rollMs: 2000, clearMs: 3600, overviewMs: 900, handoffMs: 2200, queueSpacing: 50});
export const territoryDepartureFleetStartMs = 6 * territoryDeparture.overviewMs;
export const territoryDepartureTakeoffMs = territoryDepartureFleetStartMs + territoryDeparture.establishMs;
export const territoryDepartureFleetMs = territoryDepartureTakeoffMs + 8 * territoryDeparture.spacingMs + territoryDeparture.rollMs + territoryDeparture.clearMs;
export const territoryDepartureDurationMs = territoryDepartureFleetMs + territoryDeparture.handoffMs;

export function territoryDeparturePose(slot, elapsed, origin, output = {position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0}}) {
  const queueSpeed = territoryDeparture.queueSpacing * 1000 / territoryDeparture.spacingMs;
  const lineAge = Math.max(0, elapsed - territoryDepartureTakeoffMs) / 1000;
  const releaseAt = slot * territoryDeparture.spacingMs / 1000;
  const waiting = elapsed < territoryDepartureTakeoffMs || lineAge < releaseAt;
  const age = Math.max(0, lineAge - releaseAt);
  const roll = Math.min(age, territoryDeparture.rollMs / 1000), climb = Math.max(0, age - territoryDeparture.rollMs / 1000);
  const initialSpeed = slot === 0 ? 0 : queueSpeed;
  const acceleration = 250, liftSpeed = initialSpeed + acceleration * territoryDeparture.rollMs / 1000;
  const rollDistance = initialSpeed * roll + .5 * acceleration * roll * roll;
  output.position.x = origin.x;
  output.position.y = origin.y + 120 * (climb - 1 + Math.exp(-climb));
  output.position.z = origin.z + (waiting
    ? (9 - slot) * territoryDeparture.queueSpacing + Math.min(slot * territoryDeparture.queueSpacing, lineAge * queueSpeed)
    : 9 * territoryDeparture.queueSpacing + rollDistance + liftSpeed * climb + 15 * climb * climb);
  output.rotation.x = Math.min(.14, climb * .2);
  output.rotation.y = Math.PI;
  output.rotation.z = 0;
  output.velocity.x = 0;
  output.velocity.y = 120 * (1 - Math.exp(-climb));
  output.velocity.z = waiting ? elapsed > territoryDepartureTakeoffMs ? queueSpeed : 0
    : age <= territoryDeparture.rollMs / 1000 ? initialSpeed + acceleration * roll : liftSpeed + 30 * climb;
  return output;
}
