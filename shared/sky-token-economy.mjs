// Fixed quantities and US base prices. Provider product configuration controls availability.
export const skyTokenPacks = Object.freeze({
  SKY_TOKENS_100: Object.freeze({ tokens: 100, usdCents: 100, appleProductId: 'com.vadensoftware.airportchaos.skytokens100', googleProductId: 'sky_tokens_100' }),
  SKY_TOKENS_500: Object.freeze({ tokens: 500, usdCents: 500, appleProductId: 'com.vadensoftware.airportchaos.skytokens500', googleProductId: 'sky_tokens_500' }),
  SKY_TOKENS_1200: Object.freeze({ tokens: 1200, usdCents: 1200, appleProductId: 'com.vadensoftware.airportchaos.skytokens1200', googleProductId: 'sky_tokens_1200' }),
  SKY_TOKENS_2400: Object.freeze({ tokens: 2400, usdCents: 2400, appleProductId: 'com.vadensoftware.airportchaos.skytokens2400', googleProductId: 'sky_tokens_2400' }),
});
export const aircraftSkyTokenPrices = Object.freeze({ cargo: 500, privateJet: 1200, fighter: 2400 });
export function skyTokenPack(id) { return Object.hasOwn(skyTokenPacks, id) ? skyTokenPacks[id] : undefined; }
export function aircraftSkyTokenPrice(type) { return Object.hasOwn(aircraftSkyTokenPrices, type) ? aircraftSkyTokenPrices[type] : undefined; }
