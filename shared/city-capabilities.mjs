// Server-readable gameplay capabilities only: no coordinates, rendering, or
// duplicated world geometry. City content changes update this compact summary.
export const cityCapabilities = {
  dallas: {
    landableAirportIds: ['dfw', 'love', 'addison', 'executive'],
    airportCount: 4,
    discoveryTotal: 12,
    objectiveSupportedTypes: ['stunt', 'territoryCapture', 'event', 'discovery', 'kill', 'heat3', 'distance'],
  },
  milwaukee: {
    landableAirportIds: ['central', 'coast', 'mountain', 'countryside'],
    airportCount: 4,
    discoveryTotal: 10,
    objectiveSupportedTypes: ['stunt', 'event', 'discovery', 'kill', 'heat3', 'distance'],
  },
};

export function capabilitiesForCity(cityId) { return cityCapabilities[cityId]; }
