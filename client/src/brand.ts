// One optional source image is shared by DOM branding and cached house-ad
// canvases. If the supplied beta logo has not been installed yet, existing
// text branding remains visible instead of leaving a broken image.
export const airportChaosLogoUrl = '/brand/airport-chaos-logo.avif';
const airportChaosLogoFallbackUrl = '/brand/airport-chaos-logo.png';

let logoPromise: Promise<HTMLImageElement | null> | undefined;

export function loadAirportChaosLogo(): Promise<HTMLImageElement | null> {
  logoPromise ??= new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => {
      if (image.src.endsWith(airportChaosLogoFallbackUrl)) resolve(null);
      else image.src = airportChaosLogoFallbackUrl;
    };
    image.src = airportChaosLogoUrl;
  });
  return logoPromise;
}

export async function mountAirportChaosLogo(container: HTMLElement, className: string): Promise<void> {
  const source = await loadAirportChaosLogo();
  if (!source || !container.isConnected) return;
  const image = document.createElement('img');
  image.src = source.src;
  image.alt = 'Airport Chaos';
  image.className = className;
  image.decoding = 'async';
  container.replaceChildren(image);
  container.classList.add('has-brand-logo');
}
