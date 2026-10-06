import { mountAirportChaosLogo } from './brand';
import { visualLanguage } from './visual-language';

export type AppShellActive = 'GARAGE' | 'PROFILE' | 'SETTINGS' | undefined;

export type AppShellHeaderData = {
  active: AppShellActive;
  hubActions: boolean;
  pilotName: string;
  credits: number;
  skyTokens: number;
  tokenStoreAvailable?: boolean;
  rewardsAvailable: boolean;
  rewardsAvailableInMs?: number;
  avatarUrl?: string;
};

export type AppShellHandlers = {
  home: () => void;
  garage: () => void;
  aircraft: () => void;
  rewards: () => void;
  profile: () => void;
  skyTokens?: () => void;
};

const garageIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20V8l9-5 9 5v12M6 20v-9h12v9M8 14h8M8 17h8"/></svg>';
const aircraftIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13l8.8-3.2V4.5c0-1 .5-1.8 1.2-1.8s1.2.8 1.2 1.8v5.3L21 13v2l-6.8-1.3v4l2.2 1.5V21L13 20l-3.4 1v-1.8l2.2-1.5v-4L3 15z"/></svg>';
const rewardsIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16v11H4zM3 7h18v4H3zM12 7v14M12 7H8.5C6.6 7 6 4.4 7.7 3.5 9.4 2.6 11 4.3 12 7Zm0 0h3.5c1.9 0 2.5-2.6.8-3.5C14.6 2.6 13 4.3 12 7Z"/></svg>';
const profileIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.2"/><path d="M5.8 19c.8-3.2 3-5 6.2-5s5.4 1.8 6.2 5"/></svg>';

export class AppShellHeader {
  private readonly credits: HTMLElement;
  private readonly skyTokens: HTMLElement;
  private readonly tokenAdd: HTMLButtonElement;
  private readonly garage: HTMLButtonElement;
  private readonly aircraft: HTMLButtonElement;
  private readonly rewards: HTMLButtonElement;
  private readonly rewardsIndicator: HTMLElement;
  private readonly avatar: HTMLButtonElement;
  private readonly avatarImage: HTMLImageElement;
  private readonly avatarFallback: HTMLElement;
  private rewardTimer?: number;

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
    this.garage.className = 'flight-header-control app-shell-action app-shell-garage';
    this.garage.setAttribute('aria-label', 'Aircraft Garage');
    this.garage.innerHTML = `${garageIcon}<span>GARAGE</span>`;
    this.garage.addEventListener('click', handlers.garage);

    this.aircraft = document.createElement('button');
    this.aircraft.type = 'button';
    this.aircraft.className = 'flight-header-control app-shell-action app-shell-aircraft';
    this.aircraft.setAttribute('aria-label', 'Aircraft');
    this.aircraft.innerHTML = `${aircraftIcon}<span>AIRCRAFT</span>`;
    this.aircraft.addEventListener('click', handlers.aircraft);

    this.rewards = document.createElement('button');
    this.rewards.type = 'button';
    this.rewards.className = 'flight-header-control app-shell-action app-shell-rewards';
    this.rewards.setAttribute('aria-label', 'Rewards');
    this.rewards.innerHTML = `${rewardsIcon}<span>REWARDS</span>`;
    this.rewardsIndicator = document.createElement('i');
    this.rewardsIndicator.dataset.rewardsIndicator = '';
    this.rewardsIndicator.setAttribute('role', 'status');
    this.rewardsIndicator.setAttribute('aria-label', 'Daily Reward available');
    this.rewardsIndicator.hidden = true;
    this.rewards.append(this.rewardsIndicator);
    this.rewards.addEventListener('click', handlers.rewards);

    const wallet = document.createElement('span');
    wallet.className = 'app-shell-wallet app-shell-center';
    wallet.setAttribute('aria-label', 'Pilot wallet');
    const creditsCard = document.createElement('span');
    creditsCard.className = 'flight-header-credits app-shell-credits';
    const creditMark = document.createElement('span'); creditMark.className = 'flight-header-credit-icon'; creditMark.textContent = visualLanguage.credits.icon; creditMark.setAttribute('aria-hidden', 'true');
    const creditCopy = document.createElement('span'); creditCopy.className = 'flight-header-credit-copy';
    const creditsLabel = document.createElement('small'); creditsLabel.textContent = 'CREDITS';
    this.credits = document.createElement('strong');
    creditCopy.append(creditsLabel, this.credits);
    creditsCard.append(creditMark, creditCopy);
    const tokensCard = document.createElement('span');
    tokensCard.className = 'flight-header-credits flight-header-sky-tokens app-shell-sky-tokens';
    const tokenMark = document.createElement('span'); tokenMark.className = 'flight-header-sky-token-icon'; tokenMark.textContent = visualLanguage.skyTokens.icon; tokenMark.setAttribute('aria-hidden', 'true');
    const tokenCopy = document.createElement('span'); tokenCopy.className = 'flight-header-credit-copy';
    const tokensLabel = document.createElement('small'); tokensLabel.textContent = 'SKY TOKENS';
    this.skyTokens = document.createElement('strong');
    tokenCopy.append(tokensLabel, this.skyTokens);
    tokensCard.append(tokenMark, tokenCopy);
    this.tokenAdd = document.createElement('button');
    this.tokenAdd.type = 'button'; this.tokenAdd.className = 'app-shell-token-add';
    this.tokenAdd.textContent = '+'; this.tokenAdd.setAttribute('aria-label', 'Get Sky Tokens');
    this.tokenAdd.addEventListener('click', () => handlers.skyTokens?.());
    tokensCard.append(this.tokenAdd);
    wallet.append(creditsCard, tokensCard);

    this.avatar = document.createElement('button');
    this.avatar.type = 'button';
    this.avatar.className = 'flight-header-control flight-header-avatar app-shell-action app-shell-avatar';
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

    utilities.append(this.garage, this.aircraft, this.rewards, this.avatar);
    this.element.replaceChildren(brand, wallet, utilities);
  }

  show(data: AppShellHeaderData): void {
    this.updateIdentity(data.pilotName, data.credits, data.skyTokens, data.avatarUrl);
    this.tokenAdd.hidden = !data.tokenStoreAvailable;
    this.updateRewards(data.rewardsAvailable, data.rewardsAvailableInMs);
    this.element.classList.toggle('is-hub', data.hubActions);
    this.aircraft.hidden = !data.hubActions;
    this.rewards.hidden = !data.hubActions;
    this.setActive(this.garage, data.active === 'GARAGE');
    this.setActive(this.avatar, data.active === 'PROFILE' || data.active === 'SETTINGS');
    this.element.hidden = false;
  }

  updateIdentity(pilotName: string, credits: number, skyTokens: number, avatarUrl?: string): void {
    this.credits.textContent = credits.toLocaleString();
    this.skyTokens.textContent = skyTokens.toLocaleString();
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

  updateRewards(available: boolean, availableInMs?: number): void {
    this.rewardsIndicator.hidden = !available;
    if (this.rewardTimer !== undefined) window.clearTimeout(this.rewardTimer);
    this.rewardTimer = undefined;
    if (!available && availableInMs && availableInMs > 0) {
      this.rewardTimer = window.setTimeout(() => {
        this.rewardsIndicator.hidden = false;
      }, availableInMs);
    }
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
