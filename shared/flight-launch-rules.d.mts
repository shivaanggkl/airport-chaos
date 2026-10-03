export const FLIGHT_LAUNCH_DURATION_MS: 2800;
export const FLIGHT_LAUNCH_SWEEP_MS: 1500;
export const FLIGHT_LAUNCH_HUD_FADE_MS: 500;
export const FLIGHT_LAUNCH_MIN_SKIP_MS: 500;
export const FLIGHT_LAUNCH_SKIP_BLEND_MS: 260;

export type FlightLaunchProgress = {
  canSkip: boolean;
  sweep: number;
  handoff: number;
  hudOpacity: number;
  complete: boolean;
};

export function smoothstep01(value: number): number;
export function flightLaunchProgress(elapsedMs: number): FlightLaunchProgress;
