import { mountAirportChaosLogo } from './brand';

export type AppShellActive = 'STORE' | 'GARAGE' | 'REWARDS' | 'PROFILE' | 'SETTINGS' | undefined;

export type AppShellHeaderData = {
  active: AppShellActive;
  hubActions: boolean;
  advertiseVisible: boolean;
  pilotName: string;
  credits: number;
  skyTokens: number;
  storeHasOffers: boolean;
  storeAttention?: boolean | number;
  tokenStoreAvailable?: boolean;
  rewardsAvailable: boolean;
  rewardsCount?: number;
  rewardsAvailableInMs?: number;
  avatarUrl?: string;
};

export type AppShellHandlers = {
  home: () => void;
  advertise: (trigger: HTMLButtonElement) => void;
  friends: (trigger: HTMLButtonElement) => void;
  garage: () => void;
  store: () => void;
  rewards: () => void;
  profile: () => void;
  skyTokens?: (trigger: HTMLButtonElement) => void;
};

const advertiseIcon = '<img src="/media/hub/advertise.avif" alt="" aria-hidden="true" />';
const friendsIcon = '<img src="/media/hub/friends.avif" alt="" aria-hidden="true" />';
const storeIcon = '<img src="/media/hub/store.png" alt="" aria-hidden="true" />';
const rewardsIcon = '<img src="/media/hub/rewards.png" alt="" aria-hidden="true" />';
const profileIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.2"/><path d="M5.8 19c.8-3.2 3-5 6.2-5s5.4 1.8 6.2 5"/></svg>';
const creditIcon = '<img src="/media/hub/credits.avif" alt="" aria-hidden="true" />';
const tokenIcon = '<img src="/media/hub/sky-tokens.avif" alt="" aria-hidden="true" />';

export class AppShellHeader {
  private readonly credits: HTMLElement;
  private readonly skyTokens: HTMLElement;
  private readonly tokenCard: HTMLButtonElement;
  private readonly tokenAdd: HTMLElement;
  private readonly advertise: HTMLButtonElement;
  private readonly friends: HTMLButtonElement;
  readonly aircraftPreviewHost = document.createElement('div');
  private readonly garage: HTMLButtonElement;
  private readonly store: HTMLButtonElement;
  private readonly storeIndicator: HTMLElement;
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
    void mountAirportChaosLogo(brand, 'app-shell-logo', '/brand/airport-chaos-logo-transparent.avif');

    this.advertise = document.createElement('button');
    this.advertise.type = 'button';
    this.advertise.className = 'flight-header-control app-shell-action app-shell-advertise';
    this.advertise.setAttribute('aria-label', 'Advertise in Airport Chaos');
    this.advertise.innerHTML = `${advertiseIcon}<span>ADVERTISE</span>`;
    this.advertise.addEventListener('click', () => handlers.advertise(this.advertise));

    this.friends = document.createElement('button');
    this.friends.type = 'button';
    this.friends.className = 'flight-header-control app-shell-action app-shell-friends';
    this.friends.setAttribute('aria-label', 'Friends');
    this.friends.innerHTML = `${friendsIcon}<span>FRIENDS</span>`;
    this.friends.addEventListener('click', () => handlers.friends(this.friends));

    const utilities = document.createElement('nav');
    utilities.className = 'app-shell-utilities';
    utilities.setAttribute('aria-label', 'Pilot utilities');

    this.store = document.createElement('button');
    this.store.type = 'button';
    this.store.className = 'flight-header-control app-shell-action app-shell-store';
    this.store.setAttribute('aria-label', 'Store');
    this.store.innerHTML = `<div class="app-shell-badge-art">${storeIcon}<i class="app-shell-notification-badge" data-store-indicator aria-hidden="true" hidden></i></div><span>STORE</span>`;
    this.storeIndicator = this.store.querySelector('[data-store-indicator]')!;
    this.store.addEventListener('click', handlers.store);

    this.garage = document.createElement('button');
    this.garage.type = 'button';
    this.garage.className = 'flight-header-control app-shell-action app-shell-garage';
    this.garage.setAttribute('aria-label', 'Aircraft');
    this.garage.innerHTML = '<span>AIRCRAFT</span>';
    this.aircraftPreviewHost.className = 'app-shell-aircraft-preview';
    this.aircraftPreviewHost.setAttribute('aria-hidden', 'true');
    this.garage.prepend(this.aircraftPreviewHost);
    this.garage.addEventListener('click', handlers.garage);

    this.rewards = document.createElement('button');
    this.rewards.type = 'button';
    this.rewards.className = 'flight-header-control app-shell-action app-shell-rewards';
    this.rewards.setAttribute('aria-label', 'Rewards');
    this.rewards.innerHTML = `<div class="app-shell-badge-art">${rewardsIcon}<i class="app-shell-notification-badge" data-rewards-indicator aria-hidden="true" hidden></i></div><span>REWARDS</span>`;
    this.rewardsIndicator = this.rewards.querySelector('[data-rewards-indicator]')!;
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
    this.tokenCard.addEventListener('click', () => handlers.skyTokens?.(this.tokenCard));
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
    const profileLabel = document.createElement('span');
    profileLabel.className = 'app-shell-profile-label';
    profileLabel.textContent = 'PROFILE';
    this.avatar.append(this.avatarImage, this.avatarFallback, profileLabel);

    utilities.append(this.store, this.garage, this.rewards, this.avatar);
    this.element.replaceChildren(brand, this.advertise, this.friends, wallet, utilities);
    this.element.classList.toggle('is-page-hidden', document.hidden);
    document.addEventListener('visibilitychange', () => {
      this.element.classList.toggle('is-page-hidden', document.hidden);
    });
  }

  show(data: AppShellHeaderData): void {
    this.updateIdentity(data.pilotName, data.credits, data.skyTokens, data.avatarUrl);
    this.tokenCard.disabled = false;
    this.tokenAdd.hidden = false;
    this.tokenCard.dataset.storeAvailable = String(Boolean(data.tokenStoreAvailable));
    this.updateRewards(data.rewardsAvailable, data.rewardsAvailableInMs, data.rewardsCount);
    this.setBadge(this.store, this.storeIndicator, data.storeAttention, 'Store');
    this.element.classList.toggle('is-hub', data.hubActions);
    this.store.classList.toggle('has-offers', data.storeHasOffers);
    this.store.hidden = !data.hubActions && data.active !== 'STORE';
    this.advertise.hidden = !data.advertiseVisible;
    this.friends.hidden = !data.advertiseVisible;
    this.rewards.hidden = !data.hubActions;
    this.setActive(this.store, data.active === 'STORE');
    this.setActive(this.garage, data.active === 'GARAGE');
    this.setActive(this.rewards, data.active === 'REWARDS');
    this.setActive(this.avatar, data.active === 'PROFILE' || data.active === 'SETTINGS');
    this.element.hidden = false;
  }

  updateIdentity(pilotName: string, credits: number, skyTokens: number, avatarUrl?: string): void {
    const creditBalance = credits.toLocaleString();
    const tokenBalance = skyTokens.toLocaleString();
    this.credits.textContent = creditBalance;
    this.skyTokens.textContent = tokenBalance;
    this.credits.classList.toggle('is-long-balance', creditBalance.length > 8);
    this.skyTokens.classList.toggle('is-long-balance', tokenBalance.length > 8);
    this.tokenCard.setAttribute('aria-label', `Sky Tokens, ${tokenBalance} available`);
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

  updateRewards(available: boolean, availableInMs?: number, count?: number): void {
    this.setBadge(this.rewards, this.rewardsIndicator, available ? count ?? 1 : false, 'Rewards');
    if (this.rewardTimer !== undefined) window.clearTimeout(this.rewardTimer);
    this.rewardTimer = undefined;
    if (!available && availableInMs && availableInMs > 0) {
      this.rewardTimer = window.setTimeout(() => {
        this.setBadge(this.rewards, this.rewardsIndicator, count ?? 1, 'Rewards');
      }, availableInMs);
    }
  }

  hide(): void {
    this.element.hidden = true;
  }

  private setBadge(control: HTMLButtonElement, badge: HTMLElement, attention: boolean | number | undefined, label: 'Store' | 'Rewards'): void {
    const visible = typeof attention === 'number' ? Number.isInteger(attention) && attention > 0 : attention === true;
    const text = typeof attention === 'number' ? attention > 99 ? '99+' : String(attention) : label === 'Rewards' ? '1' : '!';
    badge.hidden = !visible;
    badge.textContent = visible ? text : '';
    badge.classList.toggle('is-wide', text === '99+');
    control.querySelector('.app-shell-badge-art')?.classList.toggle('has-badge', visible);
    control.setAttribute('aria-label', visible ? `${label}, ${text === '!' ? 'attention available' : `${text} available`}` : label);
  }

  private setActive(control: HTMLButtonElement, active: boolean): void {
    control.classList.toggle('is-active', active);
    if (active) control.setAttribute('aria-current', 'page');
    else control.removeAttribute('aria-current');
  }
}
