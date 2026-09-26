import { legalConfig } from '../../shared/legal-config.mjs';

// One optional source image is shared by DOM branding and cached house-ad
// canvases. If the supplied beta logo has not been installed yet, existing
// text branding remains visible instead of leaving a broken image.
export const airportChaosLogoUrl = '/brand/airport-chaos-logo.avif';
const airportChaosLogoFallbackUrl = '/brand/airport-chaos-logo.png';

export const gameBrand = {
  gameName: legalConfig.gameName,
  studioName: legalConfig.studioName,
  gameUrl: legalConfig.gameUrl,
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

export function mountCompactBrandFooter(container: HTMLElement): void {
  const footer = document.createElement('div');
  footer.className = 'intro-brand-footer';
  const identity = document.createElement('span');
  identity.textContent = `${gameBrand.gameName} • Built by ${gameBrand.studioName}`;
  const links = document.createElement('nav');
  for (const [label, href] of [['Terms', legalConfig.policyRoutes.terms], ['Privacy', legalConfig.policyRoutes.privacy], ['Refund', legalConfig.policyRoutes.refund], ['Support', legalConfig.policyRoutes.support]] as const) {
    const link = document.createElement('a'); link.href = href; link.textContent = label;
    link.target = '_blank'; link.rel = 'noopener noreferrer';
    links.append(link);
  }
  footer.append(identity, links);
  container.replaceChildren(footer);
}
