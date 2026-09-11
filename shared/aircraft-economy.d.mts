export type StableAircraftType = 'trainer' | 'privateJet' | 'cargo' | 'fighter';
export type AircraftEconomyEntry =
  | { readonly access: 'free'; readonly credits: 0 }
  | { readonly access: 'credits'; readonly credits: number }
  | { readonly access: 'premium'; readonly credits: 0; readonly usdPrice: string; readonly entitlement: string };
export const ECONOMY_VERSION: number;
export const REDSPEAR_PRICE_USD: string;
export const aircraftEconomy: Readonly<Record<StableAircraftType, AircraftEconomyEntry>>;
export function aircraftCreditPrice(type: StableAircraftType): number | undefined;
export function aircraftEntitlement(type: StableAircraftType): string | undefined;
