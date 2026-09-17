type NetworkInformation = { saveData?: boolean; effectiveType?: string };

export type LaunchBackgroundController = { setActive(active: boolean): void };

/** Poster-first launch media that never participates in game rendering. */
export function setupLaunchBackground(root: HTMLElement): LaunchBackgroundController {
  const video = root.querySelector<HTMLVideoElement>('video');
  if (!video) return { setActive: () => undefined };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const compactViewport = window.matchMedia('(max-width: 680px)');
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  const constrainedNetwork = connection?.saveData === true || ['slow-2g', '2g'].includes(connection?.effectiveType ?? '');
  let active = false;
  let loaded = false;
  let failed = false;

  const showPoster = () => root.classList.remove('is-video-playing');
  const syncPlayback = (): void => {
    const videoAllowed = !reducedMotion.matches && !compactViewport.matches && !constrainedNetwork && !failed;
    if (!active || document.hidden || !videoAllowed) {
      video.pause();
      if (!videoAllowed) showPoster();
      return;
    }
    if (!loaded) {
      for (const source of video.querySelectorAll<HTMLSourceElement>('source[data-src]')) {
        source.src = source.dataset.src ?? '';
      }
      video.load();
      loaded = true;
    }
    void video.play().catch(showPoster);
  };

  video.addEventListener('playing', () => root.classList.add('is-video-playing'));
  video.addEventListener('error', () => { failed = true; showPoster(); }, true);
  document.addEventListener('visibilitychange', syncPlayback);
  reducedMotion.addEventListener('change', syncPlayback);

  return {
    setActive(nextActive: boolean): void {
      active = nextActive;
      syncPlayback();
    },
  };
}
