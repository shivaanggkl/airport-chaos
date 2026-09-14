// Pilot numbers are presentation identity; stable pilot IDs own the profile.
export const validPilotNumbers = Object.freeze(Array.from({ length: 900 }, (_, index) => index + 100).filter((number) => number % 3 === 0));

export function getDigitalRoot(number) {
  return Number.isInteger(number) && number > 0 ? 1 + ((number - 1) % 9) : 0;
}

export function isValidPilotNumber(number) {
  return Number.isInteger(number) && number >= 100 && number <= 999 && (getDigitalRoot(number) % 3 === 0);
}

export function pilotNumberForId(pilotId) {
  let hash = 2166136261;
  for (let index = 0; index < pilotId.length; index += 1) hash = Math.imul(hash ^ pilotId.charCodeAt(index), 16777619);
  return validPilotNumbers[(hash >>> 0) % validPilotNumbers.length];
}
