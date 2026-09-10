// Compact runway validation data for authoritative server touchdown checks.
// Rendering/world generation remains owned by each city world module.
export const cityAirports = {
  dallas: [
    { id: 'dfw', x: -22_800, z: -13_600, heading: 0, runwayWidth: 60, runwayLength: 4100 },
    { id: 'love', x: -5_140, z: -7_780, heading: 0, runwayWidth: 46, runwayLength: 2700 },
    { id: 'addison', x: -3_700, z: -21_100, heading: 0, runwayWidth: 38, runwayLength: 2200 },
    { id: 'executive', x: -6_700, z: 10_600, heading: 0, runwayWidth: 38, runwayLength: 1800 },
  ],
  milwaukee: [
    { id: 'central', x: 0, z: 0, heading: 0, runwayWidth: 45, runwayLength: 2800 },
    { id: 'coast', x: 5100, z: 3550, heading: 0, runwayWidth: 36, runwayLength: 1800 },
    { id: 'mountain', x: -2300, z: -5000, heading: 0, runwayWidth: 30, runwayLength: 1200 },
    { id: 'countryside', x: -4300, z: 3800, heading: Math.PI / 2, runwayWidth: 28, runwayLength: 1000 },
  ],
};

export function airportForCity(cityId, airportId) {
  return cityAirports[cityId]?.find((airport) => airport.id === airportId);
}
