import type { AircraftType } from './aircraft';

export type FlightLaunchAircraft = {
  pilotId: string;
  type: AircraftType;
  equippedCosmetics: Record<string, string>;
  pilotPreview?: { name: string; level: number; credits: number; skyTokens: number };
};

let launchAircraft: FlightLaunchAircraft | null = null;

export function setFlightLaunchAircraft(aircraft: FlightLaunchAircraft | null): void {
  launchAircraft = aircraft;
}

export function flightLaunchAircraft(pilotId: string): FlightLaunchAircraft | null {
  return launchAircraft?.pilotId === pilotId ? launchAircraft : null;
}
