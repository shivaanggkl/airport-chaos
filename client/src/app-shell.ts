import { mountAirportChaosLogo } from './brand';

export type AppShellActive = 'GARAGE' | 'PROFILE' | 'SETTINGS' | undefined;

export type AppShellHeaderData = {
  active: AppShellActive;
  pilotName: string;
  credits: number;
  avatarUrl?: string;
};

export type AppShellHandlers = {
  home: () => void;
  garage: () => void;
  profile: () => void;
};

const garageIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20V8l9-5 9 5v12M6 20v-9h12v9M8 14h8M8 17h8"/></svg>';
const profileIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.2"/><path d="M5.8 19c.8-3.2 3-5 6.2-5s5.4 1.8 6.2 5"/></svg>';

export class AppShellHeader {
  private readonly credits: HTMLElement;
  private readonly garage: HTMLButtonElement;
  private readonly avatar: HTMLButtonElement;
  private readonly avatarImage: HTMLImageElement;
  private readonly avatarFallback: HTMLElement;

  constructor(private readonly element: HTMLElement, handlers: AppShellHandlers) {
    const brand = document.createElement('button');
    brand.type = 'button';
    brand.className = 'app-shell-brand';
    brand.setAttribute('aria-label', 'Airport Chaos Pilot Hub');
    brand.addEventListener('click', handlers.home);
    brand.textContent = 'AIRPORT CHAOS';
    void mountAirportChaosLogo(brand, 'app-shell-logo');

    const utilities = document.createElement('nav');
    utilities.className = 'app-shell-utilities';
    utilities.setAttribute('aria-label', 'Pilot utilities');

    this.garage = document.createElement('button');
    this.garage.type = 'button';
    this.garage.className = 'flight-header-control app-shell-garage';
    this.garage.setAttribute('aria-label', 'Aircraft Garage');
    this.garage.innerHTML = `${garageIcon}<span>GARAGE</span>`;
    this.garage.addEventListener('click', handlers.garage);

    const creditsCard = document.createElement('span');
    creditsCard.className = 'flight-header-credits app-shell-credits app-shell-center';
    const creditMark = document.createElement('span'); creditMark.className = 'flight-header-credit-icon'; creditMark.textContent = '$'; creditMark.setAttribute('aria-hidden', 'true');
    const creditCopy = document.createElement('span'); creditCopy.className = 'flight-header-credit-copy';
    const creditsLabel = document.createElement('small'); creditsLabel.textContent = 'CREDITS';
    this.credits = document.createElement('strong');
    creditCopy.append(creditsLabel, this.credits);
    creditsCard.append(creditMark, creditCopy);

    this.avatar = document.createElement('button');
    this.avatar.type = 'button';
    this.avatar.className = 'flight-header-control flight-header-avatar app-shell-avatar';
    this.avatar.setAttribute('aria-label', 'Open profile');
    this.avatar.addEventListener('click', handlers.profile);
    this.avatarImage = document.createElement('img');
    this.avatarImage.alt = '';
    this.avatarImage.referrerPolicy = 'no-referrer';
    this.avatarImage.hidden = true;
    this.avatarFallback = document.createElement('span');
    this.avatarFallback.className = 'avatar-fallback';
    this.avatarFallback.innerHTML = profileIcon;
    this.avatarImage.addEventListener('load', () => {
      this.avatarImage.hidden = false;
      this.avatarFallback.hidden = true;
    });
    this.avatarImage.addEventListener('error', () => {
      this.avatarImage.hidden = true;
      this.avatarImage.removeAttribute('src');
      this.avatarFallback.hidden = false;
    });
    this.avatar.append(this.avatarImage, this.avatarFallback);

    utilities.append(this.garage, this.avatar);
    this.element.replaceChildren(brand, creditsCard, utilities);
  }

  show(data: AppShellHeaderData): void {
    this.updateIdentity(data.pilotName, data.credits, data.avatarUrl);
    this.setActive(this.garage, data.active === 'GARAGE');
    this.setActive(this.avatar, data.active === 'PROFILE' || data.active === 'SETTINGS');
    this.element.hidden = false;
  }

  updateIdentity(pilotName: string, credits: number, avatarUrl?: string): void {
    this.credits.textContent = credits.toLocaleString();
    this.avatar.setAttribute('aria-label', `Open ${pilotName || 'pilot'} profile`);
    this.avatarFallback.hidden = false;
    this.avatarImage.hidden = true;
    if (!avatarUrl) {
      this.avatarImage.removeAttribute('src');
      return;
    }
    if (this.avatarImage.getAttribute('src') === avatarUrl && this.avatarImage.complete && this.avatarImage.naturalWidth > 0) {
      this.avatarImage.hidden = false;
      this.avatarFallback.hidden = true;
      return;
    }
    this.avatarImage.src = avatarUrl;
  }

  hide(): void {
    this.element.hidden = true;
  }

  private setActive(control: HTMLButtonElement, active: boolean): void {
    control.classList.toggle('is-active', active);
    if (active) control.setAttribute('aria-current', 'page');
    else control.removeAttribute('aria-current');
  }
}
