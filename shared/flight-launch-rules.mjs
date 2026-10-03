export const FLIGHT_LAUNCH_DURATION_MS = 2_800;
export const FLIGHT_LAUNCH_SWEEP_MS = 1_500;
export const FLIGHT_LAUNCH_HUD_FADE_MS = 500;
export const FLIGHT_LAUNCH_MIN_SKIP_MS = 500;
export const FLIGHT_LAUNCH_SKIP_BLEND_MS = 260;

export function smoothstep01(value) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return clamped * clamped * (3 - 2 * clamped);
}

export function flightLaunchProgress(elapsedMs) {
  const elapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  const handoffDuration = FLIGHT_LAUNCH_DURATION_MS - FLIGHT_LAUNCH_SWEEP_MS;
  return {
    canSkip: elapsed >= FLIGHT_LAUNCH_MIN_SKIP_MS,
    sweep: smoothstep01(elapsed / FLIGHT_LAUNCH_SWEEP_MS),
    handoff: smoothstep01((elapsed - FLIGHT_LAUNCH_SWEEP_MS) / handoffDuration),
    hudOpacity: smoothstep01((elapsed - (FLIGHT_LAUNCH_DURATION_MS - FLIGHT_LAUNCH_HUD_FADE_MS)) / FLIGHT_LAUNCH_HUD_FADE_MS),
    complete: elapsed >= FLIGHT_LAUNCH_DURATION_MS,
  };
}
