import './context-page-shell.css';
import './game-store.css';
import type { GarageProfile } from './garage';
import { registerUiBackLayer, uiBackPriority } from './ui-back-navigation';
import { recordProductIntent } from './product-analytics';
import { hapticsManager } from './haptics-manager';
import { HorizontalRail } from './horizontal-rail';
import type { PublicStoreCatalogItem } from '../../shared/store-catalog.mjs';
import { ownsStoreAircraft, storeAircraft, storeFeatured, storeItemById, storeItemState, storePaints, type StoreCategory, type StoreItem } from './store-catalog';

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
function isOwned(item: StoreItem, profile: GarageProfile | undefined): boolean {
  if (!profile) return false;
  return ['OWNED', 'EQUIPPED', 'INCLUDED', 'FREE'].includes(storeItemState(item, profile));
}
function stateLabel(item: StoreItem, state: ReturnType<typeof storeItemState>): string {
  if (['OWNED', 'EQUIPPED', 'INCLUDED', 'FREE'].includes(state)) return 'OWNED';
  if (state === 'LOCKED') return 'AVAILABLE TO UNLOCK';
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
  private readonly productRail: HorizontalRail;
  private readonly categoryRail: HorizontalRail;
  private profile?: GarageProfile;
  private catalog?: Map<string, PublicStoreCatalogItem>;
  private profilePending = false;
  private authenticated = false;
  private loading = false;
  private error = '';
  private busy = false;
  private category: StoreCategory = 'FEATURED';
  private selectedId?: string;

  constructor(private readonly element: HTMLElement, private readonly handlers: StoreHandlers) {
    element.innerHTML = `<div class="store-frame"><header class="store-heading"><button class="context-back page-back store-back" type="button" data-store-back>BACK TO HUB</button><h1 class="context-winged-title">STORE</h1></header><div class="store-category-rail"><nav class="store-tabs" aria-label="Store categories"></nav></div><div class="store-content"><div class="store-rail"><div class="store-grid" tabindex="0" role="region" aria-label="Products, scroll horizontally" aria-live="polite"></div><button class="store-rail-arrow store-rail-prev" type="button" aria-label="Previous products" hidden></button><button class="store-rail-arrow store-rail-next" type="button" aria-label="Next products" hidden></button><div class="store-rail-progress" role="progressbar" aria-label="Product scroll position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="store-rail-thumb"></span></div></div><aside class="store-detail" aria-label="Store item details" hidden></aside></div><p class="store-notice" role="status" aria-live="polite"></p></div>`;
    this.tabs = element.querySelector('.store-tabs')!;
    this.grid = element.querySelector('.store-grid')!;
    this.detail = element.querySelector('.store-detail')!;
    this.notice = element.querySelector('.store-notice')!;
    this.content = element.querySelector('.store-content')!;
    element.querySelector('[data-store-back]')!.addEventListener('click', () => handlers.close());
    for (const category of categories) {
      const tab = document.createElement('button'); tab.type = 'button'; tab.className = 'store-tab';
      tab.dataset.category = category;
      const icon = document.createElement('span'); icon.className = 'store-tab-icon'; icon.textContent = categoryIcons[category]; icon.setAttribute('aria-hidden', 'true');
      tab.append(icon, document.createTextNode(category));
      tab.addEventListener('click', () => this.setCategory(category)); this.tabs.append(tab);
    }
    const categoryRoot = element.querySelector<HTMLElement>('.store-category-rail')!;
    this.categoryRail = new HorizontalRail(categoryRoot, this.tabs, {
      itemSelector: '.store-tab',
      onResize: () => {
        const selected = this.tabs.querySelector<HTMLElement>('.store-tab.is-active');
        if (selected) this.categoryRail.reveal(selected);
      },
    });
    this.productRail = new HorizontalRail(element.querySelector<HTMLElement>('.store-rail')!, this.grid, {
      itemSelector: '.store-item-card',
      previous: element.querySelector<HTMLButtonElement>('.store-rail-prev')!,
      next: element.querySelector<HTMLButtonElement>('.store-rail-next')!,
      progress: element.querySelector<HTMLElement>('.store-rail-progress')!,
      thumb: element.querySelector<HTMLElement>('.store-rail-thumb')!,
      draggable: true, wheel: true, keyboard: true,
    });
    registerUiBackLayer({ id: 'game-store-detail', priority: uiBackPriority.modal,
      isActive: () => this.isOpen() && !!this.selectedId, close: () => this.select(undefined) });
    registerUiBackLayer({ id: 'game-store', priority: uiBackPriority.surface,
      isActive: () => this.isOpen(), close: () => handlers.close() });
  }

  isOpen(): boolean { return !this.element.hidden; }
  setBackLabel(label: string): void { this.element.querySelector<HTMLButtonElement>('[data-store-back]')!.textContent = label; }
  getContext(): { category: StoreCategory; itemId?: string } { return { category: this.category, itemId: this.selectedId }; }
  restoreContext(category: StoreCategory, itemId?: string): void {
    if (categories.includes(category)) this.category = category;
    this.selectedId = itemId && storeItemById(itemId) ? itemId : undefined;
    this.render();
  }
  open(profile: GarageProfile | undefined, authenticated: boolean, loading = false): void {
    const wasClosed = this.element.hidden;
    this.profile = profile; this.authenticated = authenticated; this.profilePending = loading;
    this.catalog = undefined; this.loading = true; this.error = '';
    this.element.hidden = false; this.render();
    if (wasClosed) recordProductIntent('store_opened');
  }
  close(): void { this.element.hidden = true; this.selectedId = undefined; this.category = 'FEATURED'; }
  hide(): void { this.element.hidden = true; }
  update(profile: GarageProfile | undefined, authenticated: boolean): void {
    this.profile = profile; this.authenticated = authenticated; this.profilePending = false;
    this.loading = !this.catalog; this.error = ''; this.render();
  }
  setCatalog(items: PublicStoreCatalogItem[]): void {
    const valid = items.filter(item => {
      const known = storeItemById(item.id);
      return known?.kind === item.kind;
    });
    if (!valid.length) throw new Error('Catalog unavailable');
    this.catalog = new Map(valid.map(item => [item.id, item]));
    this.loading = this.profilePending; this.error = ''; this.render();
  }
  fail(message: string): void { this.loading = false; this.error = message; this.render(); }
  setNotice(message: string): void {
    this.notice.textContent = message;
    const detailMessage = this.detail.querySelector<HTMLElement>('.store-detail-message');
    if (detailMessage) detailMessage.textContent = message;
  }
  setCategory(category: StoreCategory): void {
    if (category === this.category) return;
    hapticsManager.emit('selection');
    this.category = category; this.selectedId = undefined;
    recordProductIntent('store_category_viewed', { category: category.toLowerCase() });
    this.render();
    this.productRail.reset();
    const selected = this.tabs.querySelector<HTMLElement>(`[data-category="${category}"]`);
    if (selected) this.categoryRail.reveal(selected);
  }
  select(id?: string): void {
    if (id === this.selectedId) return;
    if (!id && this.selectedId && window.history.state?.airportChaosStoreView === 'DETAIL') { window.history.back(); return; }
    if (id && !this.selectedId && this.isOpen()) window.history.pushState({ airportChaosStoreView: 'DETAIL' }, '', window.location.href);
    this.selectedId = id && storeItemById(id) ? id : undefined;
    if (this.selectedId) hapticsManager.emit('selection');
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
      tab.setAttribute('aria-pressed', String(active));
    }
    this.grid.replaceChildren();
    if (this.loading) {
      this.grid.setAttribute('aria-busy', 'true');
      const status = document.createElement('p'); status.className = 'store-loading-status'; status.textContent = 'LOADING STORE…';
      this.grid.append(status);
      for (let index = 0; index < 3; index += 1) { const skeleton = document.createElement('div'); skeleton.className = 'store-skeleton'; skeleton.setAttribute('aria-hidden', 'true'); this.grid.append(skeleton); }
    } else if (this.error) {
      this.grid.removeAttribute('aria-busy');
      const retry = document.createElement('div'); retry.className = 'store-empty store-empty-error';
      retry.innerHTML = '<span>CONNECTION INTERRUPTED</span><h2>Unable to load the Store</h2><p>Check your connection and try again.</p>';
      const button = document.createElement('button'); button.type = 'button'; button.textContent = 'TRY AGAIN'; button.addEventListener('click', this.handlers.retry); retry.append(button); this.grid.append(retry);
    } else if (this.category === 'EFFECTS' || this.category === 'CITIES') {
      this.grid.removeAttribute('aria-busy');
      const empty = document.createElement('div'); empty.className = `store-empty store-empty-${this.category.toLowerCase()}`;
      empty.innerHTML = '<h2>NO ITEMS AVAILABLE YET</h2>';
      this.grid.append(empty);
    } else {
      this.grid.removeAttribute('aria-busy');
      const items = (this.category === 'FEATURED' ? storeFeatured : this.category === 'AIRCRAFT' ? storeAircraft : storePaints)
        .filter(item => this.catalog?.has(item.id));
      if (items.length) for (const item of items) this.grid.append(this.card(item));
      else {
        const empty = document.createElement('div'); empty.className = 'store-empty';
        empty.innerHTML = '<h2>NO ITEMS AVAILABLE YET</h2>'; this.grid.append(empty);
      }
    }
    this.renderDetail();
    this.productRail.refresh();
    this.categoryRail.refresh();
  }

  private price(item: StoreItem, currency: Currency): number | undefined {
    const offer = this.catalog?.get(item.id);
    if (!offer) return undefined;
    const firstAppearance = item.kind === 'paint' && !(this.profile && ownsStoreAircraft(this.profile, item.aircraftType));
    const amount = currency === 'CREDITS'
      ? (firstAppearance ? offer.firstCredits : offer.credits)
      : (firstAppearance ? offer.firstTokens : offer.tokens);
    return typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0 ? amount : undefined;
  }

  private card(item: StoreItem): HTMLElement {
    const card = document.createElement('article'); card.className = 'game-card-frame store-item-card';
    card.classList.toggle('is-premium', item.kind === 'aircraft' && item.aircraftType === 'fighter');
    card.classList.toggle('is-selected', this.selectedId === item.id);
    const art = artwork(item);
    if (isOwned(item, this.profile)) art.append(this.statusBadge('OWNED'));
    card.append(art);
    const copy = document.createElement('div'); copy.className = 'store-card-copy';
    const subtitle = document.createElement('small'); subtitle.textContent = item.subtitle;
    const name = document.createElement('strong'); name.textContent = item.name;
    copy.append(subtitle, name);
    const price = document.createElement('div'); price.className = 'store-card-price';
    if (!isOwned(item, this.profile)) {
      if (item.kind === 'aircraft' && item.aircraftType === 'fighter') price.textContent = this.catalog?.get(item.id)?.usdDisplayPrice ?? 'PRICE UNAVAILABLE';
      else if (item.kind === 'aircraft' && (item.aircraftType === 'cargo' || item.aircraftType === 'privateJet')) {
        const starting = this.catalog?.get(item.id)?.fromCredits;
        if (starting !== undefined) price.append(this.priceLine(starting, 'CREDITS', true));
      } else {
        const creditPrice = this.price(item, 'CREDITS');
        const tokenPrice = this.price(item, 'SKY_TOKENS');
        if (creditPrice) price.append(this.priceLine(creditPrice, 'CREDITS'));
        else if (tokenPrice) price.append(this.priceLine(tokenPrice, 'SKY_TOKENS'));
        else {
          price.textContent = item.included ? 'INCLUDED WITH FIREHAWK' : 'FREE';
          if (item.included) price.classList.add('store-card-included');
        }
      }
    }
    const view = this.button('VIEW', () => this.select(item.id), item.kind === 'aircraft' && item.aircraftType === 'fighter' ? 'store-view store-view-premium' : 'store-view');
    view.setAttribute('aria-label', `View ${item.name} details, ${isOwned(item, this.profile) ? 'owned' : price.textContent?.trim() || 'price in details'}`);
    const footer = document.createElement('div'); footer.className = 'store-card-footer'; footer.append(price, view);
    card.append(copy, footer);
    return card;
  }

  private statusBadge(label: string): HTMLElement {
    const badge = document.createElement('span'); badge.className = 'store-status-badge'; badge.textContent = label; return badge;
  }

  private priceLine(amount: number, currency: Currency, from = false): HTMLElement {
    const line = document.createElement('span'); line.className = 'store-currency-amount';
    if (from) { const prefix = document.createElement('small'); prefix.textContent = 'FROM '; line.append(prefix); }
    const icon = document.createElement('img');
    icon.src = currency === 'CREDITS' ? '/media/hub/credits.avif' : '/media/hub/sky-tokens.avif';
    icon.alt = ''; icon.loading = 'lazy';
    const value = document.createElement('strong'); value.textContent = amount.toLocaleString();
    const unit = document.createElement('small'); unit.textContent = currency === 'CREDITS' ? ' CREDITS' : ' SKY TOKENS';
    line.append(icon, value, unit); return line;
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
    state.textContent = this.profile ? stateLabel(item, storeItemState(item, this.profile)) : 'SIGN IN TO SEE OWNERSHIP';
    if (state.textContent === 'OWNED') state.dataset.tone = 'success';
    this.detail.append(eyebrow, title, state);
    const actions = document.createElement('div'); actions.className = 'store-detail-actions';
    this.detail.append(actions);
    const viewGarage = this.button(item.kind === 'paint' ? 'VIEW / EQUIP IN AIRCRAFTS' : 'VIEW IN AIRCRAFTS', () => this.handlers.viewGarage(item), 'store-secondary');
    const message = document.createElement('p'); message.className = 'store-detail-message'; message.setAttribute('role', 'status');
    message.textContent = this.notice.textContent ?? '';
    this.detail.append(message);
    if (item.kind === 'aircraft' && (item.aircraftType === 'cargo' || item.aircraftType === 'privateJet')) {
      actions.append(this.button(this.profile && storeItemState(item, this.profile) !== 'LOCKED' ? 'VIEW IN AIRCRAFTS' : 'CHOOSE AN APPEARANCE', () => this.handlers.viewGarage(item)));
      return;
    }
    const creditPrice = this.price(item, 'CREDITS');
    const tokenPrice = this.price(item, 'SKY_TOKENS');
    if (item.kind === 'aircraft' && item.aircraftType === 'fighter' && !isOwned(item, this.profile)) {
      const displayPrice = this.catalog?.get(item.id)?.usdDisplayPrice;
      const price = document.createElement('p'); price.className = 'store-detail-price'; price.textContent = displayPrice ?? 'PRICE UNAVAILABLE';
      const purchaseView = this.button('VIEW PURCHASE OPTIONS', () => this.handlers.viewGarage(item));
      purchaseView.disabled = !displayPrice;
      actions.append(price, purchaseView);
    }
    if (!this.profile) {
      if (creditPrice) actions.append(this.purchaseButton(creditPrice, 'CREDITS', this.handlers.login));
      if (creditPrice && tokenPrice) { const or = document.createElement('span'); or.className = 'store-purchase-or'; or.textContent = 'OR'; actions.append(or); }
      if (tokenPrice) actions.append(this.purchaseButton(tokenPrice, 'SKY_TOKENS', this.handlers.login));
      if (item.kind === 'aircraft' && item.aircraftType === 'fighter') actions.append(this.button('START 5-MINUTE TRIAL', this.handlers.login, 'store-secondary store-trial'));
      if (item.aircraftType !== 'fighter' || item.kind !== 'aircraft') actions.append(viewGarage);
      return;
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
      if (creditPrice) this.purchaseOption(actions, item, 'CREDITS', creditPrice);
      if (creditPrice && tokenPrice) { const or = document.createElement('span'); or.className = 'store-purchase-or'; or.textContent = 'OR'; actions.append(or); }
      if (tokenPrice) this.purchaseOption(actions, item, 'SKY_TOKENS', tokenPrice);
      if (item.aircraftType === 'fighter' && item.kind === 'aircraft' && this.profile.fighterTrial?.status === 'available') {
        actions.append(this.button('START 5-MINUTE TRIAL', () => void this.performTrial(), 'store-secondary store-trial'));
      }
    }
    if (item.aircraftType !== 'fighter' || item.kind !== 'aircraft' || isOwned(item, this.profile)) actions.append(viewGarage);
  }

  private purchaseOption(actions: HTMLElement, item: StoreItem, currency: Currency, price: number): void {
    const balance = currency === 'CREDITS' ? this.profile!.credits : this.profile!.skyTokens ?? 0;
    const missing = Math.max(0, price - balance);
    const button = this.purchaseButton(price, currency, () => void this.performUnlock(item, currency));
    button.disabled = this.busy || (this.authenticated && !!missing && currency === 'CREDITS');
    actions.append(button);
    if (missing && this.authenticated) {
      const hint = document.createElement('p'); hint.className = 'store-shortage';
      hint.textContent = `YOU NEED ${missing.toLocaleString()} MORE ${currency === 'CREDITS' ? 'CREDITS' : 'SKY TOKENS'}`;
      actions.append(hint);
      if (currency === 'SKY_TOKENS') actions.append(this.button('GET SKY TOKENS', () => this.handlers.getTokens(missing), 'store-secondary'));
    }
  }

  private purchaseButton(price: number, currency: Currency, action: () => void): HTMLButtonElement {
    const button = this.button('', action);
    button.append(document.createTextNode('UNLOCK · '), this.priceLine(price, currency));
    button.setAttribute('aria-label', `Unlock for ${price.toLocaleString()} ${currency === 'CREDITS' ? 'Credits' : 'Sky Tokens'}`);
    return button;
  }

  private button(label: string, action: () => void, className = 'store-primary'): HTMLButtonElement {
    const button = document.createElement('button'); button.type = 'button'; button.className = className; button.textContent = label;
    button.addEventListener('click', action); return button;
  }

  private async performUnlock(item: StoreItem, currency: Currency): Promise<void> {
    if (this.busy) return;
    if (!this.authenticated) { this.handlers.login(); return; }
    const price = this.price(item, currency);
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
