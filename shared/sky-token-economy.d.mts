export type SkyTokenPackId = 'SKY_TOKENS_100' | 'SKY_TOKENS_500' | 'SKY_TOKENS_1200' | 'SKY_TOKENS_2400';
export type SkyTokenPack = Readonly<{ tokens: number; usdCents: number; appleProductId: string; googleProductId: string }>;
export const skyTokenPacks: Readonly<Record<SkyTokenPackId, SkyTokenPack>>;
export const aircraftSkyTokenPrices: Readonly<{ cargo: 500; privateJet: 1200; fighter: 2400 }>;
export function skyTokenPack(id: string): SkyTokenPack | undefined;
export function aircraftSkyTokenPrice(type: string): number | undefined;
