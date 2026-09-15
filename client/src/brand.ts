// One optional source image is shared by DOM branding and cached house-ad
// canvases. If the supplied beta logo has not been installed yet, existing
// text branding remains visible instead of leaving a broken image.
export const airportChaosLogoUrl = '/brand/airport-chaos-logo.avif';
const airportChaosLogoFallbackUrl = '/brand/airport-chaos-logo.png';

export const gameBrand = {
  gameName: 'Airport Chaos',
  studioName: 'Vaden Software',
  gameUrl: 'https://fly.vadensoftware.com',
  gameUrlLabel: 'fly.vadensoftware.com',
  // Add only verified, official destinations here. Empty by design today.
  socialLinks: [] as readonly { label: string; url: string }[],
} as const;

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

export function createGameBrandSignature(className = ''): HTMLElement {
  const signature = document.createElement('div');
  signature.className = `game-brand-signature ${className}`.trim();

  const gameName = document.createElement('strong');
  gameName.textContent = gameBrand.gameName;
  const studio = document.createElement('span');
  studio.textContent = `Built by ${gameBrand.studioName}`;
  const gameLink = document.createElement('a');
  gameLink.href = gameBrand.gameUrl;
  gameLink.target = '_blank';
  gameLink.rel = 'noopener noreferrer';
  gameLink.textContent = `Play free at ${gameBrand.gameUrlLabel}`;
  signature.append(gameName, studio, gameLink);

  if (gameBrand.socialLinks.length > 0) {
    const social = document.createElement('div');
    social.className = 'game-brand-social';
    social.append('Follow development');
    for (const destination of gameBrand.socialLinks) {
      const link = document.createElement('a');
      link.href = destination.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = destination.label;
      social.append(link);
    }
    signature.append(social);
  }
  return signature;
}

export function mountGameBrandSignature(container: HTMLElement, className = ''): void {
  container.replaceChildren(createGameBrandSignature(className));
}
