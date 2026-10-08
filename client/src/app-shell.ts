import { mountAirportChaosLogo } from './brand';

export type AppShellActive = 'STORE' | 'GARAGE' | 'REWARDS' | 'PROFILE' | 'SETTINGS' | undefined;

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
  store: () => void;
  rewards: () => void;
  profile: () => void;
  skyTokens?: () => void;
};

const aircraftIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c1 0 1.6 1 1.6 2.2v5.7l7.1 4.1v2.3l-7.1-2.2v3.6l2.1 1.6v1.6L12 20.2l-3.7 1.2v-1.6l2.1-1.6v-3.6l-7.1 2.2v-2.3l7.1-4.1V4.7c0-1.2.6-2.2 1.6-2.2Z"/></svg>';
const storeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 4h2l2.1 10.3h11.8l2.1-7.5H5.1M8.2 17h9.6M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"/></svg>';
const rewardsIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16v11H4zM3 7h18v4H3zM12 7v14M12 7H8.5C6.6 7 6 4.4 7.7 3.5 9.4 2.6 11 4.3 12 7Zm0 0h3.5c1.9 0 2.5-2.6.8-3.5C14.6 2.6 13 4.3 12 7Z"/></svg>';
const profileIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.2"/><path d="M5.8 19c.8-3.2 3-5 6.2-5s5.4 1.8 6.2 5"/></svg>';
const creditIcon = '<svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="hub-coin" x2="0" y2="1"><stop stop-color="#fff2ac"/><stop offset=".42" stop-color="#ffd86a"/><stop offset="1" stop-color="#ffb818"/></linearGradient></defs><ellipse cx="18" cy="34" rx="12" ry="5" fill="#ac6a0d"/><path d="M6 27v7c0 6 24 6 24 0v-7" fill="#d78a10" stroke="#ffd86a" stroke-width="1.5"/><ellipse cx="18" cy="27" rx="12" ry="5" fill="url(#hub-coin)" stroke="#fff2ac" stroke-width="1.5"/><path d="M6 22v5c0 6 24 6 24 0v-5" fill="#e79b12" stroke="#ffd86a" stroke-width="1.5"/><ellipse cx="18" cy="22" rx="12" ry="5" fill="url(#hub-coin)" stroke="#fff2ac" stroke-width="1.5"/><path d="M18 15v7c0 6 24 6 24 0v-7" fill="#db8910" stroke="#ffd86a" stroke-width="1.5"/><ellipse cx="30" cy="15" rx="12" ry="5" fill="url(#hub-coin)" stroke="#fff2ac" stroke-width="1.5"/></svg>';
const tokenIcon = '<svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="hub-gem" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f4f9fc"/><stop offset=".42" stop-color="#8beaff"/><stop offset="1" stop-color="#27d3f3"/></linearGradient></defs><path d="M11 9h26l8 11-21 25L3 20Z" fill="#147da8" stroke="#baf3ff" stroke-width="1.5"/><path d="m11 9 6 11 7 25L3 20Zm26 0-6 11-7 25 21-25Z" fill="url(#hub-gem)"/><path d="m17 20 7 25 7-25Zm-6-11 6 11h14l6-11Z" fill="#e2fbff"/><path d="M3 20h42M17 20l7 25 7-25" fill="none" stroke="#64ddfa" stroke-width="1.2"/></svg>';

export class AppShellHeader {
  private readonly credits: HTMLElement;
  private readonly skyTokens: HTMLElement;
  private readonly tokenCard: HTMLButtonElement;
  private readonly tokenAdd: HTMLElement;
  private readonly garage: HTMLButtonElement;
  private readonly store: HTMLButtonElement;
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

    this.store = document.createElement('button');
    this.store.type = 'button';
    this.store.className = 'flight-header-control app-shell-action app-shell-store';
    this.store.setAttribute('aria-label', 'Store');
    this.store.innerHTML = `${storeIcon}<span>STORE</span>`;
    this.store.addEventListener('click', handlers.store);

    this.garage = document.createElement('button');
    this.garage.type = 'button';
    this.garage.className = 'flight-header-control app-shell-action app-shell-garage';
    this.garage.setAttribute('aria-label', 'Aircrafts');
    this.garage.innerHTML = `${aircraftIcon}<span>AIRCRAFTS</span>`;
    this.garage.addEventListener('click', handlers.garage);

    this.rewards = document.createElement('button');
    this.rewards.type = 'button';
    this.rewards.className = 'flight-header-control app-shell-action app-shell-rewards';
    this.rewards.setAttribute('aria-label', 'Rewards');
    this.rewards.innerHTML = `${rewardsIcon}<span>REWARDS</span>`;
    this.rewardsIndicator = document.createElement('i');
    this.rewardsIndicator.dataset.rewardsIndicator = '';
    this.rewardsIndicator.setAttribute('role', 'status');
    this.rewardsIndicator.setAttribute('aria-label', 'Daily Reward available');
    this.rewardsIndicator.textContent = '1';
    this.rewardsIndicator.hidden = true;
    this.rewards.append(this.rewardsIndicator);
    this.rewards.addEventListener('click', handlers.rewards);

    const wallet = document.createElement('span');
    wallet.className = 'app-shell-wallet app-shell-center';
    wallet.setAttribute('aria-label', 'Pilot wallet');
    const creditsCard = document.createElement('span');
    creditsCard.className = 'flight-header-credits app-shell-credits';
    const creditMark = document.createElement('span'); creditMark.className = 'flight-header-credit-icon app-shell-currency-icon'; creditMark.innerHTML = creditIcon; creditMark.setAttribute('aria-hidden', 'true');
    const creditCopy = document.createElement('span'); creditCopy.className = 'flight-header-credit-copy';
    const creditsLabel = document.createElement('small'); creditsLabel.textContent = 'CREDITS';
    this.credits = document.createElement('strong');
    creditCopy.append(creditsLabel, this.credits);
    creditsCard.append(creditMark, creditCopy);
    this.tokenCard = document.createElement('button');
    this.tokenCard.type = 'button';
    this.tokenCard.className = 'flight-header-credits flight-header-sky-tokens app-shell-sky-tokens';
    this.tokenCard.setAttribute('aria-label', 'Get Sky Tokens');
    this.tokenCard.addEventListener('click', () => handlers.skyTokens?.());
    const tokenMark = document.createElement('span'); tokenMark.className = 'flight-header-sky-token-icon app-shell-currency-icon'; tokenMark.innerHTML = tokenIcon; tokenMark.setAttribute('aria-hidden', 'true');
    const tokenCopy = document.createElement('span'); tokenCopy.className = 'flight-header-credit-copy';
    const tokensLabel = document.createElement('small'); tokensLabel.textContent = 'SKY TOKENS';
    this.skyTokens = document.createElement('strong');
    tokenCopy.append(tokensLabel, this.skyTokens);
    this.tokenCard.append(tokenMark, tokenCopy);
    this.tokenAdd = document.createElement('span');
    this.tokenAdd.className = 'app-shell-token-add';
    this.tokenAdd.textContent = '+'; this.tokenAdd.setAttribute('aria-hidden', 'true');
    this.tokenCard.append(this.tokenAdd);
    wallet.append(creditsCard, this.tokenCard);

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

    utilities.append(this.store, this.garage, this.rewards, this.avatar);
    this.element.replaceChildren(brand, wallet, utilities);
  }

  show(data: AppShellHeaderData): void {
    this.updateIdentity(data.pilotName, data.credits, data.skyTokens, data.avatarUrl);
    this.tokenCard.disabled = !data.tokenStoreAvailable;
    this.tokenAdd.hidden = !data.tokenStoreAvailable;
    this.updateRewards(data.rewardsAvailable, data.rewardsAvailableInMs);
    this.element.classList.toggle('is-hub', data.hubActions);
    this.store.hidden = !data.hubActions && data.active !== 'STORE';
    this.rewards.hidden = !data.hubActions;
    this.setActive(this.store, data.active === 'STORE');
    this.setActive(this.garage, data.active === 'GARAGE');
    this.setActive(this.rewards, data.active === 'REWARDS');
    this.setActive(this.avatar, data.active === 'PROFILE' || data.active === 'SETTINGS');
    this.element.hidden = false;
  }

  updateIdentity(pilotName: string, credits: number, skyTokens: number, avatarUrl?: string): void {
    this.credits.textContent = credits.toLocaleString();
    this.skyTokens.textContent = skyTokens.toLocaleString();
    this.tokenCard.setAttribute('aria-label', `Get Sky Tokens, ${skyTokens.toLocaleString()} available`);
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
