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

  const policies = document.createElement('nav');
  policies.className = 'game-brand-policies';
  for (const [label, route] of [['Terms', legalConfig.policyRoutes.terms], ['Privacy', legalConfig.policyRoutes.privacy], ['Refund Policy', legalConfig.policyRoutes.refund]] as const) {
    const link = document.createElement('a');
    link.href = route;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = label;
    policies.append(link);
  }
  const support = document.createElement('a');
  support.href = `mailto:${legalConfig.supportEmail}`;
  support.textContent = 'Support';
  policies.append(support);
  signature.append(policies);

  const legal = document.createElement('small');
  legal.className = 'game-brand-legal';
  legal.textContent = `© 2026 ${legalConfig.legalEntityName}. ${legalConfig.publicBrand} is a product/brand operated by ${legalConfig.legalEntityName}. All rights reserved.`;
  signature.append(legal);

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
