export const cosmeticCatalog = [
  ['bluejay-classic', 'livery', 'LEGACY WHITE', 'trainer', 'free', 0, { base: 0xf4f7fb, primary: 0x3d7be0, accent: 0x7fd8f6 }],
  ['bluejay-skybolt', 'livery', 'SKYWAVE BLUE', 'trainer', 'free', 0, { base: 0x5aa9f4, primary: 0x77d8f2, accent: 0xc8d2dc }],
  ['bluejay-aurora', 'livery', 'AURORA ROSE', 'trainer', 'free', 0, { base: 0x9b7bea, primary: 0xf07cb4, accent: 0x67d6c7 }],
  ['mammoth-sand', 'livery', 'LEGACY GOLD', 'cargo', 'free', 0, { base: 0xd8b76a, primary: 0xc7ccd2, accent: 0xa9783e }],
  ['mammoth-arctic-rescue', 'livery', 'ARCTIC RESCUE', 'cargo', 'credits', 4_000, { base: 0xd9e1e8, primary: 0xf39a5a, accent: 0x5b7fa3 }],
  ['mammoth-desert-sand', 'livery', 'FOREST TITAN', 'cargo', 'credits', 2_500, { base: 0x8fae73, primary: 0xc7b88c, accent: 0x626b73 }],
  ['nightowl-forest', 'livery', 'LEGACY GREEN', 'privateJet', 'free', 0, { base: 0x4f9b71, primary: 0x8fd8b5, accent: 0xc6cfd5 }],
  ['nightowl-midnight-executive', 'livery', 'AZURE EXECUTIVE', 'privateJet', 'credits', 3_500, { base: 0x5b9fe3, primary: 0x9edcf6, accent: 0xc5cdd6 }],
  ['nightowl-royal-violet', 'livery', 'ROYAL VIOLET', 'privateJet', 'credits', 5_000, { base: 0x8f73d9, primary: 0xa8b0ba, accent: 0xd6b86a }],
  ['firehawk-inferno', 'livery', 'FIREHAWK INFERNO', 'fighter', 'included', 0, { base: 0xd73a46, primary: 0x4a5158, accent: 0xd4af37 }],
].map(([id, category, displayName, aircraftRestriction, unlockType, creditPrice, visualConfig]) => ({
  id, category, displayName, description: displayName, aircraftRestriction, unlockType, creditPrice, requiredLevel: 0, visualConfig,
}));

export const defaultCosmeticIds = ['bluejay-classic', 'bluejay-skybolt', 'bluejay-aurora', 'mammoth-sand', 'nightowl-forest'];
export const fallbackLiveryIds = Object.freeze({
  trainer: 'bluejay-skybolt',
  cargo: 'mammoth-sand',
  privateJet: 'nightowl-forest',
  fighter: 'firehawk-inferno',
});
export const includedCosmeticIds = Object.freeze({ fighter: 'firehawk-inferno' });
