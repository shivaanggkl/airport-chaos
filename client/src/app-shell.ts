import { mountAirportChaosLogo } from './brand';
import { createRankHelmet, rankHelmetForLevel } from './rank-helmets';

export type AppShellActive = 'STORE' | 'GARAGE' | 'REWARDS' | 'PROFILE' | 'SETTINGS' | undefined;

export type AppShellHeaderData = {
  active: AppShellActive;
  hubActions: boolean;
  pageTitle?: string;
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
  pilotLevel?: number;
  readOnlyWallet?: boolean;
};

export type AppShellHandlers = {
  home: () => void;
  back: () => void;
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
const creditIcon = '<img src="/media/hub/credits.avif" alt="" aria-hidden="true" />';
const tokenIcon = '<img src="/media/hub/sky-tokens.avif" alt="" aria-hidden="true" />';

export class AppShellHeader {
  private readonly brand: HTMLButtonElement;
  private readonly pageBack: HTMLButtonElement;
  private readonly pageTitle: HTMLElement;
  private readonly utilities: HTMLElement;
  private readonly credits: HTMLElement;
  private readonly creditMark: HTMLElement;
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
  private readonly profileLabel: HTMLSpanElement;
  private readonly helmetMark: HTMLElement;
  private rewardTimer?: number;
  private creditAnimationFrame?: number;
  private creditAnimationTarget?: number;
  private readonly creditParticles: HTMLImageElement[] = [];
  private readonly onVisibilityChange = (): void => {
    this.element.classList.toggle('is-page-hidden', document.hidden);
    if (document.hidden) this.stopCreditAnimation();
  };

  constructor(private readonly element: HTMLElement, handlers: AppShellHandlers) {
    const brand = document.createElement('button');
    this.brand = brand;
    brand.type = 'button';
    brand.className = 'app-shell-brand';
    brand.setAttribute('aria-label', 'Airport Chaos Pilot Hub');
    brand.addEventListener('click', handlers.home);
    brand.textContent = 'AIRPORT CHAOS';
    void mountAirportChaosLogo(brand, 'app-shell-logo', '/brand/airport-chaos-logo-transparent.avif');

    this.pageBack = document.createElement('button');
    this.pageBack.type = 'button';
    this.pageBack.className = 'app-shell-page-back';
    this.pageBack.setAttribute('aria-label', 'Back');
    this.pageBack.addEventListener('click', handlers.back);
    this.pageTitle = document.createElement('h1');
    this.pageTitle.className = 'context-winged-title app-shell-page-title';

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
    this.utilities = utilities;
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
    this.garage.setAttribute('aria-label', 'Aircraft Hangar');
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
    this.creditMark = creditMark;
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
    const profileLabel = document.createElement('span');
    this.profileLabel = profileLabel;
    profileLabel.className = 'app-shell-profile-label';
    profileLabel.textContent = 'Pilot';
    this.helmetMark = document.createElement('span');
    this.helmetMark.className = 'app-shell-helmet-mark';
    this.avatar.append(this.helmetMark, profileLabel);

    utilities.append(this.garage, this.store, this.rewards);
    this.element.replaceChildren(brand, this.avatar, this.pageBack, this.pageTitle, this.advertise, this.friends, utilities, wallet);
    this.element.classList.toggle('is-page-hidden', document.hidden);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  show(data: AppShellHeaderData): void {
    this.updateIdentity(data.pilotName, data.credits, data.skyTokens, data.pilotLevel);
    this.tokenCard.disabled = data.readOnlyWallet === true;
    this.tokenAdd.hidden = data.readOnlyWallet === true;
    this.tokenCard.dataset.storeAvailable = String(Boolean(data.tokenStoreAvailable));
    this.updateRewards(data.rewardsAvailable, data.rewardsAvailableInMs, data.rewardsCount);
    this.setBadge(this.store, this.storeIndicator, data.storeAttention, 'Store');
    const isPage = Boolean(data.pageTitle);
    this.element.classList.toggle('is-hub', data.hubActions || isPage);
    this.element.classList.toggle('is-page', isPage);
    this.brand.hidden = isPage;
    this.pageBack.hidden = !isPage;
    this.pageTitle.hidden = !isPage;
    this.pageTitle.textContent = data.pageTitle ?? '';
    this.avatar.hidden = isPage;
    this.utilities.hidden = isPage;
    this.store.classList.toggle('has-offers', data.storeHasOffers);
    this.store.hidden = !data.hubActions && data.active !== 'STORE';
    this.advertise.hidden = isPage || !data.advertiseVisible;
    this.friends.hidden = isPage || !data.advertiseVisible;
    this.rewards.hidden = !data.hubActions;
    this.setActive(this.store, data.active === 'STORE');
    this.setActive(this.garage, data.active === 'GARAGE');
    this.setActive(this.rewards, data.active === 'REWARDS');
    this.setActive(this.avatar, data.active === 'PROFILE' || data.active === 'SETTINGS');
    this.element.hidden = false;
  }

  updateIdentity(pilotName: string, credits: number, skyTokens: number, pilotLevel?: number): void {
    const displayedPilotName = pilotName.trim() || 'Pilot';
    const creditBalance = credits.toLocaleString();
    const tokenBalance = skyTokens.toLocaleString();
    if (this.creditAnimationTarget !== undefined && this.creditAnimationTarget !== credits) this.stopCreditAnimation();
    if (this.creditAnimationTarget === undefined) this.credits.textContent = creditBalance;
    this.skyTokens.textContent = tokenBalance;
    this.credits.classList.toggle('is-long-balance', creditBalance.length > 8);
    this.skyTokens.classList.toggle('is-long-balance', tokenBalance.length > 8);
    this.tokenCard.setAttribute('aria-label', `Sky Tokens, ${tokenBalance} available`);
    this.profileLabel.textContent = displayedPilotName;
    this.avatar.setAttribute('aria-label', `Open ${displayedPilotName} profile`);
    const verifiedLevel = pilotLevel !== undefined && Number.isFinite(pilotLevel) ? pilotLevel : 1;
    const helmet = rankHelmetForLevel(verifiedLevel);
    if (this.helmetMark.dataset.rankId !== helmet.id) {
      this.helmetMark.replaceChildren(createRankHelmet(helmet, 'small'));
      this.helmetMark.dataset.rankId = helmet.id;
    }
    this.avatar.title = `${displayedPilotName} · ${helmet.title} · Level ${verifiedLevel}`;
  }

  animateCreditsEarned(source: DOMRect, previousBalance: number, newBalance: number): number {
    this.stopCreditAnimation();
    const target = this.creditMark.getBoundingClientRect();
    if (newBalance <= previousBalance || this.element.hidden || document.hidden ||
      source.width <= 0 || target.width <= 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;
    const startX = source.left + source.width / 2;
    const startY = source.top + source.height / 2;
    const endX = target.left + target.width / 2;
    const endY = target.top + target.height / 2;
    for (let index = 0; index < 5; index += 1) {
      const coin = document.createElement('img');
      coin.src = '/media/hub/credits.avif';
      coin.alt = '';
      coin.setAttribute('aria-hidden', 'true');
      coin.className = 'app-shell-credit-flight';
      document.body.append(coin);
      this.creditParticles.push(coin);
    }
    this.creditAnimationTarget = newBalance;
    this.credits.textContent = previousBalance.toLocaleString();
    const startedAt = performance.now();
    const flightDuration = 850;
    const countDuration = 470;
    let landed = false;
    const frame = (now: number): void => {
      if (this.creditAnimationTarget !== newBalance) return;
      const elapsed = now - startedAt;
      this.creditParticles.forEach((coin, index) => {
        const progress = Math.max(0, Math.min(1, (elapsed - index * 55) / (flightDuration - 4 * 55)));
        const eased = 1 - (1 - progress) ** 3;
        const x = startX + (endX - startX) * eased + (index - 2) * 7 * (1 - eased);
        const y = startY + (endY - startY) * eased - Math.sin(Math.PI * eased) * 45;
        coin.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${0.7 + 0.4 * Math.sin(Math.PI * progress)})`;
        coin.style.opacity = String(elapsed < index * 55 ? 0 : Math.min(1, progress * 5, (1 - progress) * 6));
      });
      if (elapsed >= flightDuration) {
        if (!landed) { landed = true; this.creditMark.classList.add('is-credit-landing'); }
        const countProgress = Math.min(1, (elapsed - flightDuration) / countDuration);
        const easedCount = 1 - (1 - countProgress) ** 3;
        this.credits.textContent = Math.round(previousBalance + (newBalance - previousBalance) * easedCount).toLocaleString();
      }
      if (elapsed >= flightDuration + countDuration) { this.stopCreditAnimation(); return; }
      this.creditAnimationFrame = window.requestAnimationFrame(frame);
    };
    this.creditAnimationFrame = window.requestAnimationFrame(frame);
    return flightDuration + countDuration + 100;
  }

  private stopCreditAnimation(): void {
    if (this.creditAnimationFrame !== undefined) window.cancelAnimationFrame(this.creditAnimationFrame);
    this.creditAnimationFrame = undefined;
    if (this.creditAnimationTarget !== undefined) this.credits.textContent = this.creditAnimationTarget.toLocaleString();
    this.creditAnimationTarget = undefined;
    this.creditMark.classList.remove('is-credit-landing');
    this.creditParticles.splice(0).forEach(coin => coin.remove());
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
    this.stopCreditAnimation();
    this.element.hidden = true;
  }

  dispose(): void {
    this.hide();
    if (this.rewardTimer !== undefined) window.clearTimeout(this.rewardTimer);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  focusBack(): void { this.pageBack.focus(); }

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
