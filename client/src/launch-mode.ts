export type LaunchMode = 'missions' | 'free-fly' | 'sky-duel' | 'air-assault';

export const LAUNCH_MODE_PARAM = 'launchMode';

export function launchModeFromUrl(search: string): LaunchMode {
  const params = new URLSearchParams(search);
  const mode = params.get(LAUNCH_MODE_PARAM);
  if (mode === 'missions' || mode === 'free-fly' || mode === 'sky-duel' || mode === 'air-assault') return mode;
  return params.has('journeyAttempt') ? 'missions' : 'free-fly';
}
