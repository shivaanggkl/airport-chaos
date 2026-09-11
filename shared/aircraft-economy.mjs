// Shared presentation data; the server remains the only authority allowed to
// spend Credits or grant aircraft entitlements.
export const ECONOMY_VERSION = 2;
export const REDSPEAR_PRICE_USD = '$18.99';
export const aircraftEconomy = Object.freeze({
  trainer: Object.freeze({ access: 'free', credits: 0 }),
  cargo: Object.freeze({ access: 'credits', credits: 12_000 }),
  privateJet: Object.freeze({ access: 'credits', credits: 30_000 }),
  fighter: Object.freeze({ access: 'premium', credits: 0, usdPrice: REDSPEAR_PRICE_USD, entitlement: 'REDSPEAR_FIGHTER_PREMIUM' }),
});
export function aircraftCreditPrice(type) {
  const entry = aircraftEconomy[type];
  return entry?.access === 'credits' ? entry.credits : undefined;
}
export function aircraftEntitlement(type) {
  const entry = aircraftEconomy[type];
  return entry?.access === 'premium' ? entry.entitlement : undefined;
}
