import { createContextBackButton, createContextPageTitle } from './context-page-shell';
import './game-store.css';
import './sky-token-store.css';
import { skyTokenPacks, type SkyTokenPackId } from '../../shared/sky-token-economy.mjs';
import { hapticsManager } from './haptics-manager';
import { HorizontalRail } from './horizontal-rail';
import { registerUiBackLayer, uiBackPriority } from './ui-back-navigation';

export type SkyTokenOffer = { id: SkyTokenPackId; tokens: number; price: string };

function exactTopUp(missing: number, amounts: readonly number[]): number[] {
  if (!Number.isSafeInteger(missing) || missing <= 0 || missing % 100 !== 0) return [];
  const best: Array<number[] | undefined> = Array(missing / 100 + 1).fill(undefined);
  best[0] = [];
  for (let target = 100; target <= missing; target += 100) {
    for (const amount of amounts) {
      const prior = target >= amount ? best[(target - amount) / 100] : undefined;
      if (prior && (!best[target / 100] || prior.length + 1 < best[target / 100]!.length)) best[target / 100] = [...prior, amount];
    }
  }
  return best[missing / 100] ?? [];
}

export class SkyTokenStore {
  private readonly overlay = document.createElement('div');
  private readonly balance = document.createElement('strong');
  private readonly recommendation = document.createElement('p');
  private readonly message = document.createElement('p');
  private readonly list = document.createElement('div');
  private readonly rail: HorizontalRail;
  private previousFocus: HTMLElement | null = null;
  private busy = false;
  private previewOnly = false;

  constructor(private readonly buy: (packId: SkyTokenPackId) => Promise<void>) {
    this.overlay.className = 'sky-token-overlay context-fullscreen-page'; this.overlay.hidden = true;
    const panel = document.createElement('section'); panel.className = 'sky-token-panel';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', 'Get Sky Tokens');
    const heading = createContextPageTitle('GET SKY TOKENS', 2);
    const close = createContextBackButton('BACK', () => this.close()); close.classList.add('sky-token-close');
    const header = document.createElement('header'); header.className = 'sky-token-heading context-page-heading'; header.append(close, heading);
    const balanceLine = document.createElement('div'); balanceLine.className = 'game-card-frame sky-token-balance';
    const balanceIcon = document.createElement('img'); balanceIcon.src = '/media/hub/sky-tokens.avif'; balanceIcon.alt = ''; balanceIcon.setAttribute('aria-hidden', 'true');
    const balanceCopy = document.createElement('div'); balanceCopy.className = 'sky-token-balance-copy';
    const balanceLabel = document.createElement('span'); balanceLabel.textContent = 'YOUR BALANCE';
    const balanceValue = document.createElement('div'); balanceValue.append(this.balance, document.createTextNode(' SKY TOKENS'));
    balanceCopy.append(balanceLabel, balanceValue); balanceLine.append(balanceIcon, balanceCopy);
    this.recommendation.className = 'sky-token-recommendation';
    this.list.className = 'sky-token-pack-list';
    this.list.tabIndex = 0; this.list.setAttribute('role', 'region'); this.list.setAttribute('aria-label', 'Sky Token packs, scroll horizontally');
    const rail = document.createElement('div'); rail.className = 'sky-token-rail';
    const progress = document.createElement('div'); progress.className = 'sky-token-progress';
    progress.setAttribute('role', 'progressbar'); progress.setAttribute('aria-label', 'Pack scroll position');
    progress.setAttribute('aria-valuemin', '0'); progress.setAttribute('aria-valuemax', '100'); progress.setAttribute('aria-valuenow', '0');
    const thumb = document.createElement('span'); thumb.className = 'sky-token-progress-thumb'; progress.append(thumb);
    rail.append(this.list, progress);
    this.rail = new HorizontalRail(rail, this.list, { itemSelector: '.sky-token-pack', progress, thumb, draggable: true, wheel: true, keyboard: true });
    this.message.className = 'sky-token-message'; this.message.setAttribute('role', 'status');
    const disclosure = document.createElement('p'); disclosure.className = 'sky-token-disclosure';
    disclosure.textContent = 'Sky Tokens are used for eligible in-game purchases. They cannot be redeemed or exchanged for cash.';
    const footer = document.createElement('footer'); footer.className = 'game-card-frame sky-token-footer'; footer.append(disclosure);
    panel.append(header, balanceLine, this.recommendation, rail, this.message, footer);
    this.overlay.append(panel); document.body.append(this.overlay);
    registerUiBackLayer({ id: 'sky-token-store', priority: uiBackPriority.modal,
      isActive: () => this.isOpen(), close: () => this.close() });
  }

  open(balance: number, offers: readonly SkyTokenOffer[], missing = 0, previewOnly = false): void {
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.previewOnly = previewOnly;
    this.balance.textContent = balance.toLocaleString();
    const orderedOffers = [...offers].sort((a, b) => a.tokens - b.tokens);
    const combination = exactTopUp(missing, orderedOffers.map(offer => offer.tokens));
    this.recommendation.textContent = combination.length
      ? `Need ${missing.toLocaleString()} more? Exact top-up: ${combination.map(value => value.toLocaleString()).join(' + ')} Sky Tokens.` : '';
    this.list.replaceChildren();
    for (const offer of orderedOffers) {
      if (!skyTokenPacks[offer.id] || offer.tokens !== skyTokenPacks[offer.id].tokens) continue;
      const card = document.createElement('article'); card.className = 'game-card-frame sky-token-pack';
      const icon = document.createElement('img'); icon.src = '/media/hub/sky-tokens.avif'; icon.alt = ''; icon.loading = 'lazy'; icon.setAttribute('aria-hidden', 'true');
      const quantity = document.createElement('strong'); quantity.textContent = `${offer.tokens.toLocaleString()} SKY TOKENS`;
      const divider = document.createElement('hr');
      const price = document.createElement('span'); price.className = 'sky-token-price'; price.textContent = offer.price;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'context-action context-action--gold store-view sky-token-buy';
      button.textContent = 'BUY'; button.setAttribute('aria-label', `Buy ${offer.tokens.toLocaleString()} Sky Tokens for ${offer.price}`);
      button.disabled = previewOnly;
      card.append(icon, quantity, divider, price, button);
      button.addEventListener('click', () => {
        if (previewOnly || this.busy) return;
        hapticsManager.emit('selection');
        this.setBusy(true);
        void this.buy(offer.id).catch(() => this.setMessage('Unable to start purchase. Please try again.'))
          .finally(() => this.setBusy(false));
      });
      this.list.append(card);
    }
    this.message.textContent = previewOnly ? 'Purchases are unavailable in this staging build.' : '';
    this.overlay.hidden = false;
    this.rail.reset();
    this.overlay.querySelector<HTMLButtonElement>('.sky-token-close')?.focus();
  }

  updateBalance(balance: number): void { this.balance.textContent = balance.toLocaleString(); }
  setMessage(message: string): void { this.message.textContent = message; }
  close(): void {
    if (this.busy) return;
    this.overlay.hidden = true;
    if (this.previousFocus?.isConnected) this.previousFocus.focus();
    this.previousFocus = null;
  }
  isOpen(): boolean { return !this.overlay.hidden; }
  private setBusy(busy: boolean): void {
    this.busy = busy;
    for (const button of this.list.querySelectorAll<HTMLButtonElement>('button')) button.disabled = busy || this.previewOnly;
    if (busy) this.setMessage('Opening purchase…');
  }
}
