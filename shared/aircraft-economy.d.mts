export type StableAircraftType = 'trainer' | 'privateJet' | 'cargo' | 'fighter';
export type AircraftEconomyEntry =
  | { readonly access: 'free'; readonly credits: 0 }
  | { readonly access: 'credits'; readonly credits: number }
  | { readonly access: 'premium'; readonly credits: 0; readonly usdPrice: string; readonly entitlement: string };
export const ECONOMY_VERSION: number;
export const firehawkProduct: Readonly<{
  productId: 'firehawk';
  displayPrice: '$9.99';
  amountCents: 999;
  currency: 'usd';
  entitlement: 'REDSPEAR_FIGHTER_PREMIUM';
}>;
export const REDSPEAR_TRIAL_DURATION_MS: number;
export const aircraftDisplayOrder: readonly StableAircraftType[];
export const aircraftEconomy: Readonly<Record<StableAircraftType, AircraftEconomyEntry>>;
export function aircraftCreditPrice(type: StableAircraftType): number | undefined;
export function aircraftEntitlement(type: StableAircraftType): string | undefined;
