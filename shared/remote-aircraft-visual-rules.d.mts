export const remoteAircraftScale: 16;
export const aircraftHitRadii: Readonly<Record<'trainer' | 'privateJet' | 'cargo' | 'fighter', number>>;
export function remoteAircraftVisualScale(distance: number): number;
export function remoteAircraftContactRadius(type: 'trainer' | 'privateJet' | 'cargo' | 'fighter', distance: number): number;
export function remoteAircraftCollisionRadius(type: 'trainer' | 'privateJet' | 'cargo' | 'fighter', distance: number): number;
export function remoteAircraftNearMissRadius(type: 'trainer' | 'privateJet' | 'cargo' | 'fighter', distance: number): number;
export function remoteProxyPixelWidth(distance: number): number;
export function remoteInterpolationDuration(previous: number, packetInterval: number, isBot: boolean): number;
export function remotePredictionSeconds(timeSinceUpdate: number, interpolationDuration: number, isBot: boolean): number;
