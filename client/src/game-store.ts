import './game-store.css';
import type { GarageProfile } from './garage';
import { registerUiBackLayer, uiBackPriority } from './ui-back-navigation';
import { recordProductIntent } from './product-analytics';
import { storeAircraft, storeFeatured, storeItemById, storeItemState, storePaints, type StoreCategory, type StoreItem } from './store-catalog';

type Currency = 'CREDITS' | 'SKY_TOKENS';
type ActionResult = { ok: boolean; message: string };
type StoreHandlers = {
  close: () => void;
  unlock: (item: StoreItem, currency: Currency) => Promise<ActionResult>;
  trial: () => Promise<ActionResult>;
  getTokens: (missing: number) => void;
  viewGarage: (item: StoreItem) => void;
  login: () => void;
  retry: () => void;
};

const categories: readonly StoreCategory[] = ['FEATURED', 'AIRCRAFT', 'PAINTS', 'EFFECTS', 'CITIES'];
const categoryIcons: Record<StoreCategory, string> = { FEATURED: '★', AIRCRAFT: '✈', PAINTS: '◈', EFFECTS: '✦', CITIES: '⌖' };

function color(value: number): string { return `#${value.toString(16).padStart(6, '0')}`; }
function stateLabel(item: StoreItem, state: ReturnType<typeof storeItemState>): string {
  return state === 'REQUIRES AIRCRAFT' ? `REQUIRES ${storeAircraft.find(aircraft => aircraft.aircraftType === item.aircraftType)?.name ?? 'AIRCRAFT'}` : state;
}
function artwork(item: StoreItem): HTMLElement {
  const art = document.createElement('div'); art.className = `store-art store-art-${item.aircraftType}`;
  art.setAttribute('aria-hidden', 'true');
  const [base, primary, accent] = item.colors;
  art.innerHTML = `<div class="store-art-runway"></div><svg viewBox="0 0 320 150" focusable="false"><path fill="${color(base)}" d="M27 71 118 65 154 36 173 36 189 65 291 72 302 81 187 86 174 106 156 106 141 86 25 81Z"/><path fill="${color(primary)}" d="M136 68 157 12 170 12 184 68 171 88 155 88Z"/><path fill="${color(accent)}" d="M122 65 153 59 188 59 215 65 186 71 154 71Z"/><path fill="none" stroke="rgba(255,255,255,.62)" stroke-width="2" d="M28 72 118 67 151 39M290 73 191 67 175 39"/></svg>`;
  if (item.kind === 'paint') {
    const swatches = document.createElement('span'); swatches.className = 'store-art-swatches';
    for (const value of item.colors) { const dot = document.createElement('i'); dot.style.backgroundColor = color(value); swatches.append(dot); }
    art.append(swatches);
  }
  return art;
}

export class GameStore {
  private readonly tabs: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly content: HTMLElement;
  private profile?: GarageProfile;
  private authenticated = false;
  private loading = false;
  private error = '';
  private busy = false;
  private category: StoreCategory = 'FEATURED';
  private selectedId?: string;

  constructor(private readonly element: HTMLElement, private readonly handlers: StoreHandlers) {
    element.innerHTML = `<div class="store-frame"><div class="store-heading"><div><span class="store-eyebrow">PILOT COMMAND / COLLECTIONS</span><h1>STORE</h1><p>Find your next aircraft or finish. Unlock it here, equip it in Aircrafts.</p></div><button class="store-back" type="button" data-store-back>BACK TO HUB</button></div><nav class="store-tabs" aria-label="Store categories"></nav><div class="store-content"><div class="store-grid" aria-live="polite"></div><aside class="store-detail" aria-label="Store item details" hidden></aside></div><p class="store-notice" role="status" aria-live="polite"></p></div>`;
    this.tabs = element.querySelector('.store-tabs')!;
    this.grid = element.querySelector('.store-grid')!;
    this.detail = element.querySelector('.store-detail')!;
    this.notice = element.querySelector('.store-notice')!;
    this.content = element.querySelector('.store-content')!;
    element.querySelector('[data-store-back]')!.addEventListener('click', () => handlers.close());
    for (const category of categories) {
      const tab = document.createElement('button'); tab.type = 'button'; tab.className = 'store-tab';
      tab.dataset.category = category; tab.textContent = `${categoryIcons[category]}  ${category}`;
      tab.addEventListener('click', () => this.setCategory(category)); this.tabs.append(tab);
    }
    registerUiBackLayer({ id: 'game-store-detail', priority: uiBackPriority.modal,
      isActive: () => this.isOpen() && !!this.selectedId, close: () => this.select(undefined) });
    registerUiBackLayer({ id: 'game-store', priority: uiBackPriority.surface,
      isActive: () => this.isOpen(), close: () => handlers.close() });
  }

  isOpen(): boolean { return !this.element.hidden; }
  getContext(): { category: StoreCategory; itemId?: string } { return { category: this.category, itemId: this.selectedId }; }
  restoreContext(category: StoreCategory, itemId?: string): void {
    if (categories.includes(category)) this.category = category;
    this.selectedId = itemId && storeItemById(itemId) ? itemId : undefined;
    this.render();
  }
  open(profile: GarageProfile | undefined, authenticated: boolean, loading = false): void {
    this.profile = profile; this.authenticated = authenticated; this.loading = loading; this.error = '';
    this.element.hidden = false; this.render();
    recordProductIntent('store_opened');
  }
  close(): void { this.element.hidden = true; this.selectedId = undefined; }
  hide(): void { this.element.hidden = true; }
  update(profile: GarageProfile | undefined, authenticated: boolean): void {
    this.profile = profile; this.authenticated = authenticated; this.loading = false; this.error = ''; this.render();
  }
  fail(message: string): void { this.loading = false; this.error = message; this.render(); }
  setNotice(message: string): void {
    this.notice.textContent = message;
    const detailMessage = this.detail.querySelector<HTMLElement>('.store-detail-message');
    if (detailMessage) detailMessage.textContent = message;
  }
  setCategory(category: StoreCategory): void {
    if (category === this.category) return;
    this.category = category; this.selectedId = undefined;
    recordProductIntent('store_category_viewed', { category: category.toLowerCase() });
    this.render();
    this.tabs.querySelector<HTMLElement>(`[data-category="${category}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  select(id?: string): void {
    if (id === this.selectedId) return;
    if (!id && this.selectedId && window.history.state?.airportChaosStoreView === 'DETAIL') { window.history.back(); return; }
    if (id && !this.selectedId && this.isOpen()) window.history.pushState({ airportChaosStoreView: 'DETAIL' }, '', window.location.href);
    this.selectedId = id && storeItemById(id) ? id : undefined;
    this.notice.textContent = '';
    if (this.selectedId) {
      const item = storeItemById(this.selectedId)!;
      recordProductIntent('store_item_viewed', { itemId: item.id, itemType: item.kind, category: this.category.toLowerCase() });
    }
    this.render();
  }
  dismissDetailFromHistory(): void { this.selectedId = undefined; this.render(); }

  private render(): void {
    if (!this.isOpen()) return;
    for (const tab of this.tabs.querySelectorAll<HTMLButtonElement>('button')) {
      const active = tab.dataset.category === this.category;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    }
    this.grid.replaceChildren();
    if (this.loading) {
      for (let index = 0; index < 4; index += 1) { const skeleton = document.createElement('div'); skeleton.className = 'store-skeleton'; this.grid.append(skeleton); }
    } else if (this.error) {
      const retry = document.createElement('div'); retry.className = 'store-empty store-empty-error';
      retry.innerHTML = '<span>CONNECTION INTERRUPTED</span><h2>Unable to load the Store</h2><p>Check your connection and try again.</p>';
      const button = document.createElement('button'); button.type = 'button'; button.textContent = 'TRY AGAIN'; button.addEventListener('click', this.handlers.retry); retry.append(button); this.grid.append(retry);
    } else if (this.category === 'EFFECTS' || this.category === 'CITIES') {
      const empty = document.createElement('div'); empty.className = `store-empty store-empty-${this.category.toLowerCase()}`;
      empty.innerHTML = `<span>${this.category === 'EFFECTS' ? 'AIRCRAFT VISUALS' : 'WORLD EXPANSION'}</span><h2>${this.category} · COMING SOON</h2><p>${this.category === 'EFFECTS' ? 'New ways to personalize your aircraft are being prepared.' : 'More destinations are on the horizon.'}</p>`;
      this.grid.append(empty);
    } else {
      const items = this.category === 'FEATURED' ? storeFeatured : this.category === 'AIRCRAFT' ? storeAircraft : storePaints;
      for (const item of items) this.grid.append(this.card(item));
    }
    this.renderDetail();
  }

  private card(item: StoreItem): HTMLElement {
    const card = document.createElement('button'); card.type = 'button'; card.className = 'store-item-card';
    card.classList.toggle('is-selected', this.selectedId === item.id);
    card.setAttribute('aria-label', `View ${item.name} details`);
    card.append(artwork(item));
    const copy = document.createElement('div'); copy.className = 'store-card-copy';
    const subtitle = document.createElement('small'); subtitle.textContent = item.subtitle;
    const name = document.createElement('strong'); name.textContent = item.name;
    const state = document.createElement('span'); state.className = 'store-state';
    state.textContent = this.profile ? stateLabel(item, storeItemState(item, this.profile)) : item.kind === 'aircraft' && item.aircraftType === 'trainer' ? 'FREE' : 'DISCOVER';
    if (['OWNED', 'EQUIPPED', 'INCLUDED'].includes(state.textContent ?? '')) state.dataset.tone = 'success';
    copy.append(subtitle, name, state);
    const price = document.createElement('div'); price.className = 'store-card-price';
    if (item.creditPrice) price.append(this.priceLine('🪙', item.creditPrice, 'CREDITS'));
    if (item.creditPrice && item.tokenPrice) { const or = document.createElement('span'); or.textContent = 'OR'; price.append(or); }
    if (item.tokenPrice) price.append(this.priceLine('💎', item.tokenPrice, 'SKY TOKENS'));
    if (!item.creditPrice && !item.tokenPrice) price.textContent = item.included ? 'INCLUDED WITH FIREHAWK' : 'FREE';
    card.append(copy, price);
    card.addEventListener('click', () => this.select(item.id));
    return card;
  }

  private priceLine(icon: string, amount: number, currency: string): HTMLElement {
    const line = document.createElement('span'); line.textContent = `${icon} ${amount.toLocaleString()} ${currency}`; return line;
  }

  private renderDetail(): void {
    const item = this.selectedId ? storeItemById(this.selectedId) : undefined;
    this.detail.hidden = !item || this.loading || !!this.error;
    this.content.classList.toggle('has-detail', !this.detail.hidden);
    if (!item || this.detail.hidden) { this.detail.replaceChildren(); return; }
    this.detail.replaceChildren();
    const close = document.createElement('button'); close.type = 'button'; close.className = 'store-detail-close'; close.setAttribute('aria-label', 'Close item details'); close.textContent = '×'; close.addEventListener('click', () => this.select(undefined));
    this.detail.append(close, artwork(item));
    const eyebrow = document.createElement('small'); eyebrow.className = 'store-eyebrow'; eyebrow.textContent = item.subtitle;
    const title = document.createElement('h2'); title.textContent = item.name;
    const state = document.createElement('p'); state.className = 'store-detail-state';
    state.textContent = this.profile ? stateLabel(item, storeItemState(item, this.profile)) : item.aircraftType === 'trainer' && item.kind === 'aircraft' ? 'FREE' : 'SIGN IN TO SEE OWNERSHIP';
    if (['OWNED', 'EQUIPPED', 'INCLUDED'].includes(state.textContent ?? '')) state.dataset.tone = 'success';
    this.detail.append(eyebrow, title, state);
    const actions = document.createElement('div'); actions.className = 'store-detail-actions';
    this.detail.append(actions);
    const viewGarage = this.button(item.kind === 'paint' ? 'VIEW / EQUIP IN AIRCRAFTS' : 'VIEW IN AIRCRAFTS', () => this.handlers.viewGarage(item), 'store-secondary');
    const message = document.createElement('p'); message.className = 'store-detail-message'; message.setAttribute('role', 'status');
    message.textContent = this.notice.textContent ?? '';
    this.detail.append(message);
    if (!this.profile) {
      if (item.creditPrice) actions.append(this.button(`UNLOCK · 🪙 ${item.creditPrice.toLocaleString()} CREDITS`, this.handlers.login));
      if (item.creditPrice && item.tokenPrice) { const or = document.createElement('span'); or.className = 'store-purchase-or'; or.textContent = 'OR'; actions.append(or); }
      if (item.tokenPrice) actions.append(this.button(`UNLOCK · 💎 ${item.tokenPrice.toLocaleString()} SKY TOKENS`, this.handlers.login));
      if (item.kind === 'aircraft' && item.aircraftType === 'fighter') actions.append(this.button('START 5-MINUTE TRIAL', this.handlers.login, 'store-secondary store-trial'));
      actions.append(viewGarage); return;
    }
    const itemState = storeItemState(item, this.profile);
    if (itemState === 'REQUIRES AIRCRAFT') {
      const required = document.createElement('p'); required.className = 'store-requirement'; required.textContent = `REQUIRES ${storeAircraft.find(aircraft => aircraft.aircraftType === item.aircraftType)?.name ?? 'AIRCRAFT'}`;
      actions.append(required, this.button(`VIEW ${storeAircraft.find(aircraft => aircraft.aircraftType === item.aircraftType)?.name ?? 'AIRCRAFT'}`, () => {
        this.category = 'AIRCRAFT'; this.select(item.aircraftType);
      }), viewGarage);
      return;
    }
    if (itemState === 'LOCKED') {
      if (item.creditPrice) this.purchaseOption(actions, item, 'CREDITS', item.creditPrice);
      if (item.creditPrice && item.tokenPrice) { const or = document.createElement('span'); or.className = 'store-purchase-or'; or.textContent = 'OR'; actions.append(or); }
      if (item.tokenPrice) this.purchaseOption(actions, item, 'SKY_TOKENS', item.tokenPrice);
      if (item.aircraftType === 'fighter' && item.kind === 'aircraft' && this.profile.fighterTrial?.status === 'available') {
        actions.append(this.button('START 5-MINUTE TRIAL', () => void this.performTrial(), 'store-secondary store-trial'));
      }
    }
    actions.append(viewGarage);
  }

  private purchaseOption(actions: HTMLElement, item: StoreItem, currency: Currency, price: number): void {
    const balance = currency === 'CREDITS' ? this.profile!.credits : this.profile!.skyTokens ?? 0;
    const missing = Math.max(0, price - balance);
    const label = `${currency === 'CREDITS' ? '🪙' : '💎'} ${price.toLocaleString()} ${currency === 'CREDITS' ? 'CREDITS' : 'SKY TOKENS'}`;
    const button = this.button(`UNLOCK · ${label}`, () => void this.performUnlock(item, currency));
    button.disabled = this.busy || (this.authenticated && !!missing && currency === 'CREDITS');
    actions.append(button);
    if (missing && this.authenticated) {
      const hint = document.createElement('p'); hint.className = 'store-shortage';
      hint.textContent = `YOU NEED ${missing.toLocaleString()} MORE ${currency === 'CREDITS' ? 'CREDITS' : 'SKY TOKENS'}`;
      actions.append(hint);
      if (currency === 'SKY_TOKENS') actions.append(this.button('GET SKY TOKENS', () => this.handlers.getTokens(missing), 'store-secondary'));
    }
  }

  private button(label: string, action: () => void, className = 'store-primary'): HTMLButtonElement {
    const button = document.createElement('button'); button.type = 'button'; button.className = className; button.textContent = label;
    button.addEventListener('click', action); return button;
  }

  private async performUnlock(item: StoreItem, currency: Currency): Promise<void> {
    if (this.busy) return;
    if (!this.authenticated) { this.handlers.login(); return; }
    const price = currency === 'CREDITS' ? item.creditPrice : item.tokenPrice;
    if (!price) return;
    const missing = Math.max(0, price - (currency === 'CREDITS' ? this.profile?.credits ?? 0 : this.profile?.skyTokens ?? 0));
    if (missing) { if (currency === 'SKY_TOKENS') this.handlers.getTokens(missing); return; }
    this.busy = true; this.renderDetail();
    recordProductIntent('store_unlock_started', { itemId: item.id, itemType: item.kind, category: this.category.toLowerCase(), currency: currency.toLowerCase() });
    try {
      const result = await this.handlers.unlock(item, currency);
      this.setNotice(result.message);
    } catch { this.setNotice('UNLOCK FAILED — PLEASE TRY AGAIN'); }
    finally { this.busy = false; this.render(); }
  }

  private async performTrial(): Promise<void> {
    if (this.busy) return;
    if (!this.authenticated) { this.handlers.login(); return; }
    this.busy = true; this.renderDetail();
    try { const result = await this.handlers.trial(); this.setNotice(result.message); }
    catch { this.setNotice('TRIAL UNAVAILABLE — PLEASE TRY AGAIN'); }
    finally { this.busy = false; this.render(); }
  }
}
