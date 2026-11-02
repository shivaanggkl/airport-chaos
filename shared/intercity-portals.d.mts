export type PortalCity = 'dallas' | 'milwaukee';
export type PortalVec = {
    x: number;
    y: number;
    z: number;
};
export type PortalPose = {
    position: PortalVec;
    rotation: PortalVec;
    velocity: PortalVec;
};
export type PortalGate = {
    cityId: PortalCity;
    destination: PortalCity;
    routeId: string;
    x: number;
    y: number;
    z: number;
    heading: number;
    radius: number;
    normal: {
        x: number;
        z: number;
    };
};
export declare const portalRules: Readonly<{
    radius: number;
    altitude: number;
    towerHeight: number;
    tunnelMinMs: number;
    timeoutMs: number;
    crossingGraceMs: number;
    arrivalClearance: number;
}>;
export declare function portalForCity(cityId: string, terrain: (x: number, z: number) => number): PortalGate | undefined;
export declare function sweptPortalCrossing(g: PortalGate, a: PortalVec, b: PortalVec): boolean;
export declare function portalExit(g: PortalGate, pose: PortalPose, entry: PortalPose, terrain: (x: number, z: number) => number, rollback?: boolean, entryGround?: number): PortalPose;
export declare function portalModeAllowed(mode: string, tutorial?: boolean, journey?: boolean): boolean;
