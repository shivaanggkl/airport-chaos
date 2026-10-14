export type LaunchMode = 'missions' | 'free-fly';

export const LAUNCH_MODE_PARAM = 'launchMode';

export function launchModeFromUrl(search: string): LaunchMode {
  const params = new URLSearchParams(search);
  const mode = params.get(LAUNCH_MODE_PARAM);
  if (mode === 'missions' || mode === 'free-fly') return mode;
  return params.has('journeyAttempt') ? 'missions' : 'free-fly';
}
