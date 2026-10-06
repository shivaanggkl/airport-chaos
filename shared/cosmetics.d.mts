export type CosmeticCategory='livery';
export type CosmeticDefinition={id:string;category:CosmeticCategory;displayName:string;description:string;aircraftRestriction:string;unlockType:'free'|'credits'|'included';creditPrice:number;skyTokenPrice:number;requiredLevel:number;visualConfig:{base:number;primary:number;accent:number}};
export declare const cosmeticCatalog:CosmeticDefinition[];
export declare const defaultCosmeticIds:string[];
export declare const fallbackLiveryIds:Readonly<{trainer:string;cargo:undefined;privateJet:undefined;fighter:string}>;
export declare const includedCosmeticIds:Readonly<{fighter:string}>;
