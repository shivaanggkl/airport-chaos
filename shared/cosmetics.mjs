export const cosmeticCatalog = [
  ['bluejay-classic', 'livery', 'LEGACY WHITE', 'trainer', 'credits', 750, 75, { base: 0xf4f7fb, primary: 0x3d7be0, accent: 0x7fd8f6 }],
  ['bluejay-skybolt', 'livery', 'SKYWAVE BLUE', 'trainer', 'included', 0, 0, { base: 0x5aa9f4, primary: 0x77d8f2, accent: 0xc8d2dc }],
  ['bluejay-aurora', 'livery', 'AURORA ROSE', 'trainer', 'credits', 1_500, 125, { base: 0x9b7bea, primary: 0xf07cb4, accent: 0x67d6c7 }],
  ['mammoth-sand', 'livery', 'LEGACY GOLD', 'cargo', 'credits', 13_000, 600, { base: 0xd8b76a, primary: 0xc7ccd2, accent: 0xa9783e }],
  ['mammoth-arctic-rescue', 'livery', 'ARCTIC RESCUE', 'cargo', 'credits', 15_000, 750, { base: 0xd9e1e8, primary: 0xf39a5a, accent: 0x5b7fa3 }],
  ['mammoth-desert-sand', 'livery', 'FOREST TITAN', 'cargo', 'credits', 14_000, 650, { base: 0x8fae73, primary: 0xc7b88c, accent: 0x626b73 }],
  ['nightowl-sky-blue', 'livery', 'SKY BLUE', 'privateJet', 'credits', 33_000, 1_350, { base: 0xe8f2fa, primary: 0x215eac, accent: 0x14365d }],
  ['nightowl-sunset-red', 'livery', 'SUNSET RED', 'privateJet', 'credits', 33_000, 1_350, { base: 0xe8f2fa, primary: 0xb92832, accent: 0x5c2027 }],
  ['nightowl-forest-green', 'livery', 'FOREST GREEN', 'privateJet', 'credits', 33_000, 1_350, { base: 0xe8f2fa, primary: 0x24805c, accent: 0x153e35 }],
  ['nightowl-premium-gold', 'livery', 'PREMIUM GOLD', 'privateJet', 'credits', 33_000, 1_350, { base: 0xe8f2fa, primary: 0xb5892f, accent: 0x493a1a }],
  // Historical entitlements stay equipable, but these retired offers cannot be bought again.
  ['nightowl-forest', 'livery', 'LEGACY GREEN', 'privateJet', 'credits', 31_000, 1_300, { base: 0x4f9b71, primary: 0x8fd8b5, accent: 0xc6cfd5 }, true],
  ['nightowl-midnight-executive', 'livery', 'AZURE EXECUTIVE', 'privateJet', 'credits', 32_000, 1_350, { base: 0x5b9fe3, primary: 0x9edcf6, accent: 0xc5cdd6 }, true],
  ['nightowl-royal-violet', 'livery', 'ROYAL VIOLET', 'privateJet', 'credits', 33_000, 1_450, { base: 0x8f73d9, primary: 0xa8b0ba, accent: 0xd6b86a }, true],
  ['firehawk-inferno', 'livery', 'FIREHAWK INFERNO', 'fighter', 'tokens', 0, 2_400, { base: 0xe8eced, primary: 0xd52030, accent: 0xbfcbd0 }],
].map(([id, category, displayName, aircraftRestriction, unlockType, creditPrice, skyTokenPrice, visualConfig, retired]) => ({
  id, category, displayName, description: displayName, aircraftRestriction, unlockType, creditPrice, skyTokenPrice, requiredLevel: 0, visualConfig, retired: retired === true,
}));

export const defaultCosmeticIds = ['bluejay-skybolt'];
export const fallbackLiveryIds = Object.freeze({
  trainer: 'bluejay-skybolt',
  cargo: undefined,
  privateJet: undefined,
  fighter: undefined,
});

export function cosmeticUnlockPrice(item, currency = 'CREDITS') {
  if (item.retired) return undefined;
  if (item.unlockType !== 'credits' && item.unlockType !== 'tokens') return undefined;
  if (currency === 'CREDITS' && item.unlockType === 'tokens') return undefined;
  return currency === 'SKY_TOKENS' ? item.skyTokenPrice : item.creditPrice;
}
