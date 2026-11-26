// Planned offers only. No purchasing, reservation, or delivery entitlement.
export const advertisingPackages = Object.freeze([
  Object.freeze({id:'HUB_SPOTLIGHT', interest:'HUB', name:'Hub Spotlight', plannedUsd:199, durationDays:30}),
  Object.freeze({id:'DALLAS_NETWORK', interest:'DALLAS', name:'Dallas Network', plannedUsd:499, durationDays:30}),
]);
export function advertisingPackage(id) { return advertisingPackages.find(item => item.id === id); }
export const advertisingWaitlistConsent = 'I agree to receive emails about the availability of my selected advertising package.';
