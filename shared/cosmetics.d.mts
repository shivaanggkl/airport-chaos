export type CosmeticCategory='livery';
export type CosmeticDefinition={id:string;category:CosmeticCategory;displayName:string;description:string;aircraftRestriction:string;unlockType:'free'|'credits'|'included'|'tokens';creditPrice:number;skyTokenPrice:number;requiredLevel:number;visualConfig:{base:number;primary:number;accent:number}};
export declare const cosmeticCatalog:CosmeticDefinition[];
export declare const defaultCosmeticIds:string[];
export declare const fallbackLiveryIds:Readonly<{trainer:string;cargo:undefined;privateJet:undefined;fighter:undefined}>;
export declare function cosmeticUnlockPrice(item:CosmeticDefinition,currency?:'CREDITS'|'SKY_TOKENS'):number|undefined;
