type Vector = {x:number;y:number;z:number};
export type TerritoryDeparturePose = {position:Vector;rotation:Vector;velocity:Vector};
export const territoryDeparture: Readonly<{establishMs:number;spacingMs:number;rollMs:number;clearMs:number;overviewMs:number;handoffMs:number;queueSpacing:number}>;
export const territoryDepartureFleetStartMs: number;
export const territoryDepartureTakeoffMs: number;
export const territoryDepartureFleetMs: number;
export const territoryDepartureDurationMs: number;
export function territoryDeparturePose(slot:number,elapsed:number,origin:Vector,output?:TerritoryDeparturePose):TerritoryDeparturePose;
