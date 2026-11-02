export type TerrainAirportZone={x:number;z:number;heading:number;runwayLength:number;safetyHalfWidth:number};
export type TerrainHeightSampler=(x:number,z:number)=>number;
export declare function createTerrainHeightSampler(airports:ReadonlyArray<TerrainAirportZone>):TerrainHeightSampler;
export declare const milwaukeeTerrainHeight:TerrainHeightSampler;
