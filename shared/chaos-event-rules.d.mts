export type LandingChaosEventType='stormLanding'|'fogApproach'|'cargoRush'|'soloAirportSprint';
export declare const landingChaosEventTypes:readonly LandingChaosEventType[];
export declare function canCompleteLandingChaosEvent(event:{eventType:string;lifecycle:string;targetAirportId?:string;progress:number}|undefined,airportId:string):boolean;
export declare function advanceCargoRush(event:{eventType:string;lifecycle:string;progress:number}|undefined,insidePickup:boolean):number;
export declare function lowAltitudeRunResult(input:{inside:boolean;altitude:number;minimumAltitude:number;maximumAltitude:number;elapsed:number;targetSeconds:number}):'failed'|'reset'|'completed'|'active';
export declare function airspaceControlProgress(input:{inside:boolean;contested:boolean;progress:number;deltaSeconds:number;targetSeconds:number}):{progress:number;completed:boolean};
