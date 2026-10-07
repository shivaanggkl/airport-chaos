import { aircraftDefinitions, type AircraftType } from './aircraft';
import { aircraftCreditPrice, aircraftDisplayOrder, firehawkProduct } from '../../shared/aircraft-economy.mjs';
import { aircraftSkyTokenPrice } from '../../shared/sky-token-economy.mjs';
import { cosmeticCatalog, defaultCosmeticIds } from '../../shared/cosmetics.mjs';
import type { GarageProfile } from './garage';

export type StoreCategory = 'FEATURED' | 'AIRCRAFT' | 'PAINTS' | 'EFFECTS' | 'CITIES';
export type StoreItem = {
  id: string;
  kind: 'aircraft' | 'paint';
  aircraftType: AircraftType;
  name: string;
  subtitle: string;
  creditPrice?: number;
  tokenPrice?: number;
  colors: readonly number[];
  included?: boolean;
};

const paintOrder = [
  'bluejay-classic', 'bluejay-skybolt', 'bluejay-aurora',
  'mammoth-sand', 'mammoth-desert-sand', 'mammoth-arctic-rescue',
  'nightowl-forest', 'nightowl-midnight-executive', 'nightowl-royal-violet',
  'firehawk-inferno',
];

export const storeAircraft = aircraftDisplayOrder.map((type): StoreItem => {
  const aircraftType = type as AircraftType;
  const definition = aircraftDefinitions[aircraftType];
  return {
    id: aircraftType, kind: 'aircraft', aircraftType,
    name: definition.callsign, subtitle: definition.name,
    creditPrice: aircraftCreditPrice(aircraftType), tokenPrice: aircraftSkyTokenPrice(aircraftType),
    colors: [definition.bodyColor, definition.accentColor, definition.livery.accentColor],
  };
});

export const storePaints = paintOrder.map((id): StoreItem => {
  const paint = cosmeticCatalog.find(item => item.id === id)!;
  const aircraftType = paint.aircraftRestriction as AircraftType;
  return {
    id, kind: 'paint', aircraftType, name: paint.displayName,
    subtitle: `${aircraftDefinitions[aircraftType].callsign} PAINT`,
    creditPrice: paint.unlockType === 'credits' ? paint.creditPrice : undefined,
    tokenPrice: paint.unlockType === 'credits' ? paint.skyTokenPrice : undefined,
    colors: [paint.visualConfig.base, paint.visualConfig.primary, paint.visualConfig.accent],
    included: paint.unlockType === 'included',
  };
});

const featuredIds = ['fighter', 'privateJet', 'cargo', 'mammoth-arctic-rescue', 'nightowl-royal-violet'];
export const storeFeatured = featuredIds.map(id => [...storeAircraft, ...storePaints].find(item => item.id === id)!);
export const storeItems = [...storeAircraft, ...storePaints];

export function ownsStoreAircraft(profile: GarageProfile, type: AircraftType): boolean {
  return type === 'fighter'
    ? profile.aircraftEntitlements?.includes(firehawkProduct.entitlement) === true
    : type === 'trainer' || profile.unlockedAircraft.includes(type);
}

export function storeItemState(item: StoreItem, profile: GarageProfile): 'FREE' | 'OWNED' | 'EQUIPPED' | 'INCLUDED' | 'LOCKED' | 'REQUIRES AIRCRAFT' {
  if (item.kind === 'aircraft') {
    if (item.aircraftType === 'trainer') return profile.selectedAircraft === 'trainer' ? 'EQUIPPED' : 'FREE';
    if (!ownsStoreAircraft(profile, item.aircraftType)) return 'LOCKED';
    return profile.selectedAircraft === item.aircraftType ? 'EQUIPPED' : 'OWNED';
  }
  if (item.included) return ownsStoreAircraft(profile, item.aircraftType) ? 'INCLUDED' : 'REQUIRES AIRCRAFT';
  if (!ownsStoreAircraft(profile, item.aircraftType)) return 'REQUIRES AIRCRAFT';
  const owned = item.aircraftType === 'trainer' && defaultCosmeticIds.includes(item.id)
    || profile.cosmetics?.ownedIds.includes(item.id) === true;
  if (!owned) return 'LOCKED';
  return profile.cosmetics?.equipped[`livery:${item.aircraftType}`] === item.id ? 'EQUIPPED' : 'OWNED';
}

export function storeItemById(id: string): StoreItem | undefined { return storeItems.find(item => item.id === id); }
