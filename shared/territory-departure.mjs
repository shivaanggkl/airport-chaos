/** One deterministic departure path for M5's cinematic and authoritative handoff. */
export const territoryDeparture = Object.freeze({establishMs: 2000, spacingMs: 2600, rollMs: 2000, clearMs: 2400, overviewMs: 900, handoffMs: 2200});
export const territoryDepartureFleetMs = territoryDeparture.establishMs + 8 * territoryDeparture.spacingMs + territoryDeparture.rollMs + territoryDeparture.clearMs;
export const territoryDepartureDurationMs = territoryDepartureFleetMs + 6 * territoryDeparture.overviewMs + territoryDeparture.handoffMs;

export function territoryDeparturePose(slot, elapsed, origin, output = {position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0}}) {
  const age = Math.max(0, elapsed - territoryDeparture.establishMs - slot * territoryDeparture.spacingMs) / 1000;
  const roll = Math.min(age, territoryDeparture.rollMs / 1000), climb = Math.max(0, age - territoryDeparture.rollMs / 1000);
  const acceleration = 250, liftSpeed = acceleration * territoryDeparture.rollMs / 1000;
  output.position.x = origin.x;
  output.position.y = origin.y + 120 * (climb - 1 + Math.exp(-climb));
  output.position.z = origin.z + .5 * acceleration * roll * roll + liftSpeed * climb + 15 * climb * climb;
  output.rotation.x = Math.min(.14, climb * .2);
  output.rotation.y = Math.PI;
  output.rotation.z = 0;
  output.velocity.x = 0;
  output.velocity.y = 120 * (1 - Math.exp(-climb));
  output.velocity.z = age <= territoryDeparture.rollMs / 1000 ? acceleration * roll : liftSpeed + 30 * climb;
  return output;
}
