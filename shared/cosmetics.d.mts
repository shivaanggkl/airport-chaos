export type CosmeticCategory='livery'|'contrail'|'badge';
export type CosmeticDefinition={id:string;category:CosmeticCategory;displayName:string;description:string;aircraftRestriction:string|null;unlockType:'free'|'credits'|'pilotLevel'|'achievement'|'premiumFuture'|'sponsorFuture';creditPrice:number;requiredLevel:number;visualConfig:{primary?:number;accent?:number;color?:number|null};availableFrom?:number;availableUntil?:number;seasonId?:string;source?:string;rarity?:string;unlockRequirement?:number;sponsorSlotId?:string};
export declare const cosmeticCatalog:CosmeticDefinition[];
export declare const defaultCosmeticIds:string[];
