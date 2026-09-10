// Shared combat hull values. Both client UI and server authority consume this
// small table so aircraft durability never diverges by platform.
export const aircraftMaxHealth = Object.freeze({
  trainer: 100,
  privateJet: 100,
  cargo: 175,
  fighter: 125,
});

export function maxHealthForAircraft(aircraftType) {
  return aircraftMaxHealth[aircraftType] ?? aircraftMaxHealth.trainer;
}
