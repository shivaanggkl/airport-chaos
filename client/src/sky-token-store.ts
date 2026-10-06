import { skyTokenPacks, type SkyTokenPackId } from '../../shared/sky-token-economy.mjs';
import { legalConfig } from '../../shared/legal-config.mjs';
import { legalPolicyHref } from './brand';

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
  private busy = false;

  constructor(private readonly buy: (packId: SkyTokenPackId) => Promise<void>) {
    this.overlay.className = 'sky-token-overlay'; this.overlay.hidden = true;
    const panel = document.createElement('section'); panel.className = 'sky-token-panel';
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', 'Get Sky Tokens');
    const heading = document.createElement('h2'); heading.textContent = 'GET SKY TOKENS';
    const close = document.createElement('button'); close.type = 'button'; close.className = 'sky-token-close'; close.textContent = 'CLOSE';
    close.addEventListener('click', () => this.close());
    const header = document.createElement('header'); header.append(heading, close);
    const balanceLine = document.createElement('p'); balanceLine.append('Your balance: ', this.balance);
    this.recommendation.className = 'sky-token-recommendation';
    this.list.className = 'sky-token-pack-list';
    this.message.className = 'sky-token-message'; this.message.setAttribute('role', 'status');
    const disclosure = document.createElement('p'); disclosure.className = 'sky-token-disclosure';
    disclosure.textContent = 'Sky Tokens are digital game currency. They do not expire or have cash value.';
    const legal = document.createElement('nav'); legal.className = 'sky-token-legal';
    for (const [label, path] of [['Terms', legalConfig.policyRoutes.terms], ['Refund', legalConfig.policyRoutes.refund], ['Privacy', legalConfig.policyRoutes.privacy]] as const) {
      const link = document.createElement('a'); link.textContent = label; link.href = legalPolicyHref(path);
      link.target = '_blank'; link.rel = 'noopener noreferrer'; legal.append(link);
    }
    panel.append(header, balanceLine, this.recommendation, this.list, this.message, disclosure, legal);
    this.overlay.append(panel); document.body.append(this.overlay);
    this.overlay.addEventListener('click', event => { if (event.target === this.overlay) this.close(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !this.overlay.hidden) this.close(); });
  }

  open(balance: number, offers: readonly SkyTokenOffer[], missing = 0, previewOnly = false): void {
    this.balance.textContent = `${balance.toLocaleString()} Sky Tokens`;
    const order = [500, 1200, 2400, 100];
    const orderedOffers = [...offers].sort((a, b) => order.indexOf(a.tokens) - order.indexOf(b.tokens));
    const combination = exactTopUp(missing, orderedOffers.map(offer => offer.tokens));
    this.recommendation.textContent = combination.length
      ? `Need ${missing.toLocaleString()} more? Exact top-up: ${combination.map(value => value.toLocaleString()).join(' + ')} Sky Tokens.` : '';
    this.list.replaceChildren();
    for (const offer of orderedOffers) {
      if (!skyTokenPacks[offer.id] || offer.tokens !== skyTokenPacks[offer.id].tokens) continue;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'sky-token-pack';
      button.disabled = previewOnly;
      const quantity = document.createElement('strong'); quantity.textContent = `${offer.tokens.toLocaleString()} Sky Tokens`;
      const price = document.createElement('span'); price.textContent = offer.price;
      button.append(quantity, price);
      button.addEventListener('click', () => {
        if (previewOnly || this.busy) return;
        this.setBusy(true);
        void this.buy(offer.id).catch(() => this.setMessage('Unable to start purchase. Please try again.'))
          .finally(() => this.setBusy(false));
      });
      this.list.append(button);
    }
    this.message.textContent = previewOnly ? 'Purchases are unavailable in this staging build.' : '';
    this.overlay.hidden = false;
    (this.list.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? this.overlay.querySelector<HTMLButtonElement>('.sky-token-close'))?.focus();
  }

  updateBalance(balance: number): void { this.balance.textContent = `${balance.toLocaleString()} Sky Tokens`; }
  setMessage(message: string): void { this.message.textContent = message; }
  close(): void { if (!this.busy) this.overlay.hidden = true; }
  isOpen(): boolean { return !this.overlay.hidden; }
  private setBusy(busy: boolean): void {
    this.busy = busy;
    for (const button of this.list.querySelectorAll<HTMLButtonElement>('button')) button.disabled = busy;
    if (busy) this.setMessage('Opening purchase…');
  }
}
