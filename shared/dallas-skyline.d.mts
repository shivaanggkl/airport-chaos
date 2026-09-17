export declare const dallasFacadePalette:number[];
export declare const dallasFacadePatterns:string[];
export declare const inDallasCore:(x:number,z:number)=>boolean;
type Airport={x:number;z:number;heading:number;runwayWidth:number;runwayLength:number};
export declare function skylineAirportExcluded(x:number,z:number,padding:number,airports:ReadonlyArray<Airport>):boolean;
export declare function generateDallasSkyline(airports?:ReadonlyArray<Airport>,reserved?:ReadonlyArray<{x:number;z:number;halfX:number;halfZ:number}>):Array<{x:number;z:number;width:number;depth:number;height:number;material:number;pattern:number}>;
