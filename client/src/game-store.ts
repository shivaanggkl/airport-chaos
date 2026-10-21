import { createContextBackButton, createContextPageTitle } from './context-page-shell';
import './game-store.css';
import type { GarageProfile } from './garage';
import { registerUiBackLayer, uiBackPriority } from './ui-back-navigation';
import { recordProductIntent } from './product-analytics';
import { hapticsManager } from './haptics-manager';
import { HorizontalRail } from './horizontal-rail';
import { confirmCatalogPurchase } from './purchase-confirmation';
import { StoreAircraftPreviews } from './store-aircraft-previews';
import { createAircraftDetailPanel, renderAircraftDetailPanel } from './aircraft-detail-panel';
import type { PublicStoreCatalogItem } from '../../shared/store-catalog.mjs';
import { storeAircraft, storeFeatured, storeItemById, storeItemState, storePaints, storePurchaseTarget, type StoreCategory, type StoreItem } from './store-catalog';

type Currency = 'CREDITS' | 'SKY_TOKENS';
type ActionResult = { ok: boolean; message: string };
type StoreHandlers = {
  close: () => void;
  unlock: (item: StoreItem, currency: Currency) => Promise<ActionResult>;
  trial: () => Promise<ActionResult>;
  getTokens: (missing: number) => void;
  viewGarage: (item: StoreItem) => void;
  equip: (item: StoreItem) => Promise<ActionResult>;
  login: () => void;
  retry: () => void;
};

const categories: readonly StoreCategory[] = ['FEATURED', 'AIRCRAFT', 'EFFECTS', 'CITIES'];
const categoryIcons: Record<StoreCategory, string> = { FEATURED: '★', AIRCRAFT: '✈', EFFECTS: '✦', CITIES: '⌖' };

function color(value: number): string { return `#${value.toString(16).padStart(6, '0')}`; }
function isOwned(item: StoreItem, profile: GarageProfile | undefined): boolean {
  if (!profile) return false;
  return ['OWNED', 'EQUIPPED', 'INCLUDED', 'FREE'].includes(storeItemState(item, profile));
}
function artwork(item: StoreItem): HTMLElement {
  const art = document.createElement('div'); art.className = `store-art store-art-${item.aircraftType}`;
  art.dataset.storePreviewId = item.id;
  art.tabIndex = 0;
  art.setAttribute('role', 'button');
  art.setAttribute('aria-label', `View ${item.name} aircraft details`);
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
  private readonly notice: HTMLElement;
  private readonly detailOverlay: HTMLElement;
  private readonly frame: HTMLElement;
  private readonly productRail: HorizontalRail;
  private readonly categoryRail: HorizontalRail;
  private previews?: StoreAircraftPreviews;
  private detailTrigger?: HTMLElement;
  private profile?: GarageProfile;
  private catalog?: Map<string, PublicStoreCatalogItem>;
  private profilePending = false;
  private authenticated = false;
  private loading = false;
  private error = '';
  private busy = false;
  private noticeTimer?: number;
  private tokenSpendingAvailable = false;
  private purchaseAvailable = true;
  private category: StoreCategory = 'FEATURED';

  constructor(private readonly element: HTMLElement, private readonly handlers: StoreHandlers) {
    element.innerHTML = `<div class="store-frame"><header class="store-heading context-page-heading"></header><div class="store-category-rail"><nav class="store-tabs" aria-label="Store categories"></nav></div><div class="store-content"><div class="store-rail"><div class="store-grid" tabindex="0" role="region" aria-label="Products, scroll horizontally" aria-live="polite"></div><button class="store-rail-arrow store-rail-prev" type="button" aria-label="Previous products" hidden></button><button class="store-rail-arrow store-rail-next" type="button" aria-label="Next products" hidden></button><div class="store-rail-progress" role="progressbar" aria-label="Product scroll position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="store-rail-thumb"></span></div></div></div><p class="store-notice" role="status" aria-live="polite"></p></div><div class="store-detail-overlay" hidden></div>`;
    this.frame = element.querySelector('.store-frame')!;
    this.detailOverlay = element.querySelector('.store-detail-overlay')!;
    const detailPanel = createAircraftDetailPanel();
    detailPanel.setAttribute('role', 'dialog');
    detailPanel.setAttribute('aria-modal', 'true');
    detailPanel.setAttribute('aria-labelledby', 'store-detail-title');
    detailPanel.querySelector('.store-detail-title')!.id = 'store-detail-title';
    const closeDetail = document.createElement('button');
    closeDetail.type = 'button'; closeDetail.className = 'store-detail-close';
    closeDetail.setAttribute('aria-label', 'Close aircraft details'); closeDetail.textContent = '×';
    detailPanel.prepend(closeDetail);
    this.detailOverlay.append(detailPanel);
    element.querySelector('.store-detail-close')!.addEventListener('click', () => this.closeDetail());
    this.detailOverlay.addEventListener('keydown', event => {
      if (event.key === 'Tab') { event.preventDefault(); this.element.querySelector<HTMLButtonElement>('.store-detail-close')!.focus(); }
    });
    this.tabs = element.querySelector('.store-tabs')!;
    this.grid = element.querySelector('.store-grid')!;
    this.notice = element.querySelector('.store-notice')!;
    const storeBack = createContextBackButton('BACK TO HUB', () => handlers.close());
    storeBack.classList.add('store-back');
    storeBack.dataset.storeBack = '';
    element.querySelector('.store-heading')!.append(storeBack, createContextPageTitle('STORE'));
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
    registerUiBackLayer({ id: 'game-store', priority: uiBackPriority.surface,
      isActive: () => this.isOpen(), close: () => handlers.close() });
    registerUiBackLayer({ id: 'game-store-detail', priority: uiBackPriority.modal,
      isActive: () => this.isOpen() && !this.detailOverlay.hidden, close: () => this.closeDetail() });
  }

  isOpen(): boolean { return !this.element.hidden; }
  setTokenSpendingAvailable(available: boolean): void { this.tokenSpendingAvailable = available; if (this.isOpen()) this.render(); }
  setPurchaseAvailable(available: boolean): void { this.purchaseAvailable = available; if (this.isOpen()) this.render(); }
  setBackLabel(label: string): void { this.element.querySelector<HTMLButtonElement>('[data-store-back]')!.textContent = label; }
  getContext(): { category: StoreCategory; itemId?: string } { return { category: this.category }; }
  restoreContext(category: StoreCategory, _itemId?: string): void {
    if (categories.includes(category)) this.category = category;
    this.render();
  }
  open(profile: GarageProfile | undefined, authenticated: boolean, loading = false): void {
    const wasClosed = this.element.hidden;
    this.profile = profile; this.authenticated = authenticated; this.profilePending = loading;
    this.catalog = undefined; this.loading = true; this.error = ''; this.purchaseAvailable = true; this.setNotice('');
    this.element.hidden = false; this.render();
    if (wasClosed) recordProductIntent('store_opened');
  }
  close(): void { this.closeDetail(false); this.element.hidden = true; this.previews?.stop(); this.category = 'FEATURED'; }
  hide(): void { this.closeDetail(false); this.element.hidden = true; this.previews?.stop(); }
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
    if (this.noticeTimer !== undefined) window.clearTimeout(this.noticeTimer);
    this.noticeTimer = undefined;
    this.notice.textContent = message;
    this.notice.classList.remove('is-temporary');
  }
  setCategory(category: StoreCategory): void {
    if (category === this.category) return;
    hapticsManager.emit('selection');
    this.category = category;
    recordProductIntent('store_category_viewed', { category: category.toLowerCase() });
    this.render();
    this.productRail.reset();
    const selected = this.tabs.querySelector<HTMLElement>(`[data-category="${category}"]`);
    if (selected) this.categoryRail.reveal(selected);
  }
  private render(): void {
    if (!this.isOpen()) return;
    if (!this.purchaseAvailable) this.notice.textContent = 'QA SERVER UPDATE REQUIRED — PRICES FOR PREVIEW ONLY; PURCHASES UNAVAILABLE';
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
      if (this.error === 'QA BACKEND UPDATE REQUIRED') {
        retry.querySelector('span')!.textContent = 'QA SERVER UPDATE REQUIRED';
        retry.querySelector('h2')!.textContent = 'Store purchases are unavailable';
        retry.querySelector('p')!.textContent = 'This QA app needs the matching server prices before purchases can be tested.';
      }
      const button = document.createElement('button'); button.type = 'button'; button.textContent = 'TRY AGAIN'; button.addEventListener('click', this.handlers.retry); retry.append(button); this.grid.append(retry);
    } else if (this.category === 'EFFECTS' || this.category === 'CITIES') {
      this.grid.removeAttribute('aria-busy');
      const empty = document.createElement('div'); empty.className = `store-empty store-empty-${this.category.toLowerCase()}`;
      empty.innerHTML = '<h2>NO ITEMS AVAILABLE YET</h2>';
      this.grid.append(empty);
    } else {
      this.grid.removeAttribute('aria-busy');
      const items = (this.category === 'FEATURED' ? storeFeatured : storePaints)
        .filter(item => this.catalog?.has(item.id));
      if (items.length) for (const item of items) this.grid.append(this.card(item));
      else {
        const empty = document.createElement('div'); empty.className = 'store-empty';
        empty.innerHTML = '<h2>NO ITEMS AVAILABLE YET</h2>'; this.grid.append(empty);
      }
    }
    this.productRail.refresh();
    this.categoryRail.refresh();
    const art = [...this.grid.querySelectorAll<HTMLElement>('[data-store-preview-id]')];
    if (art.length) {
      this.previews ??= new StoreAircraftPreviews(this.element.querySelector<HTMLElement>('.store-rail')!, this.grid);
      this.previews.setCards(art.map(element => ({ art: element, item: storeItemById(element.dataset.storePreviewId!)! })));
    } else this.previews?.setCards([]);
  }

  private price(item: StoreItem, currency: Currency): number | undefined {
    const offer = this.catalog?.get(item.id);
    if (!offer) return undefined;
    const amount = currency === 'CREDITS' ? offer.credits : offer.tokens;
    return typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0 ? amount : undefined;
  }

  private card(item: StoreItem): HTMLElement {
    const card = document.createElement('article'); card.className = 'game-card-frame store-item-card';
    card.dataset.storeItemId = item.id;
    const owned = isOwned(item, this.profile);
    card.classList.toggle('is-premium', item.aircraftType === 'fighter');
    const purchaseItem = storePurchaseTarget(item);
    const state = this.profile ? storeItemState(item, this.profile) : undefined;
    const art = artwork(item);
    art.addEventListener('click', () => this.openDetail(item, art));
    art.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault(); this.openDetail(item, art);
    });
    const subtitle = document.createElement('small'); subtitle.className = 'store-art-subtitle'; subtitle.textContent = item.subtitle;
    art.append(subtitle);
    if (owned) art.append(this.statusBadge('OWNED'));
    card.append(art);
    const copy = document.createElement('div'); copy.className = 'store-card-copy';
    const aircraft = storeAircraft.find(candidate => candidate.aircraftType === item.aircraftType);
    const aircraftDetail = document.createElement('div'); aircraftDetail.className = 'store-card-detail';
    const aircraftLabel = document.createElement('span'); aircraftLabel.textContent = 'AIRCRAFT:';
    const name = document.createElement('strong'); name.textContent = item.kind === 'aircraft' ? item.name : aircraft?.name ?? item.name;
    aircraftDetail.append(aircraftLabel, name); copy.append(aircraftDetail);
    const appearance = item.kind === 'paint' ? item
      : item.aircraftType === 'fighter' ? storePaints.find(paint => paint.id === 'firehawk-inferno')
        : purchaseItem !== item ? purchaseItem : undefined;
    if (appearance) {
      const included = document.createElement('div'); included.className = 'store-card-detail store-card-detail--appearance';
      const appearanceName = appearance.name.startsWith(`${aircraft?.name} `)
        ? appearance.name.slice((aircraft?.name.length ?? 0) + 1) : appearance.name;
      const appearanceLabel = document.createElement('span'); appearanceLabel.textContent = 'APPEARANCE:';
      const appearanceValue = document.createElement('strong'); appearanceValue.textContent = appearanceName;
      included.append(appearanceLabel, appearanceValue); copy.append(included);
    }
    const footer = document.createElement('div'); footer.className = 'store-card-footer';
    if (state === 'REQUIRES AIRCRAFT' || (item.included && !this.profile)) {
      const required = storeAircraft.find(aircraft => aircraft.aircraftType === item.aircraftType);
      const note = document.createElement('span'); note.className = 'store-card-includes';
      note.textContent = `OWN ${required?.name ?? 'AIRCRAFT'} FIRST`; copy.append(note);
      footer.append(this.button(item.aircraftType === 'trainer' ? 'OPEN IN HANGAR' : 'VIEW AIRCRAFT OPTIONS',
        () => item.aircraftType === 'trainer' ? this.handlers.viewGarage(item) : this.showAircraftCard(item),
        'context-action context-action--gold store-card-action'));
    } else if (owned || item.included || (item.kind === 'aircraft' && item.aircraftType === 'trainer')) {
      const equipped = this.profile?.selectedAircraft === item.aircraftType
        && (item.kind === 'aircraft' || this.profile.cosmetics?.equipped?.[`livery:${item.aircraftType}`] === item.id);
      const actionLabel = equipped ? 'EQUIPPED'
        : item.kind === 'paint' && this.profile?.selectedAircraft === item.aircraftType ? 'USE APPEARANCE' : 'EQUIP AIRCRAFT';
      const equip = this.button(actionLabel, () => void this.performEquip(item), 'context-action store-card-action store-card-owned');
      equip.disabled = this.busy || equipped;
      equip.setAttribute('aria-label', equipped ? `${item.name} equipped` : `Equip ${item.name}`);
      footer.append(equip);
    } else {
      const creditPrice = this.price(purchaseItem, 'CREDITS');
      const tokenPrice = this.price(purchaseItem, 'SKY_TOKENS');
      if (creditPrice) footer.append(this.cardPurchaseRow(item, purchaseItem, 'CREDITS', creditPrice));
      if (tokenPrice) footer.append(this.cardPurchaseRow(item, purchaseItem, 'SKY_TOKENS', tokenPrice));
      if (!creditPrice && !tokenPrice) {
        const unavailable = document.createElement('span'); unavailable.className = 'store-card-includes';
        unavailable.textContent = 'UNAVAILABLE'; footer.append(unavailable);
      }
      if (item.aircraftType === 'fighter' && (!this.profile || this.profile.fighterTrial?.status === 'available')) {
        const trial = this.button('TRY 5 MINUTES', () => void this.performTrial(), 'context-action store-card-action store-card-trial');
        trial.disabled = this.busy; footer.append(trial);
      }
    }
    card.append(copy, footer);
    return card;
  }

  private openDetail(item: StoreItem, trigger: HTMLElement): void {
    if (!this.previews) return;
    this.detailTrigger = trigger;
    renderAircraftDetailPanel(this.detailOverlay.querySelector<HTMLElement>('.store-detail-panel')!, item.aircraftType);
    this.detailOverlay.hidden = false;
    this.frame.inert = true;
    this.previews.showDetail(this.element.querySelector<HTMLElement>('.store-detail-preview')!, item);
    this.element.querySelector<HTMLButtonElement>('.store-detail-close')!.focus();
  }

  private closeDetail(restoreFocus = true): void {
    if (this.detailOverlay.hidden) return;
    this.previews?.hideDetail();
    this.detailOverlay.hidden = true;
    this.frame.inert = false;
    if (restoreFocus) {
      const target = this.detailTrigger?.isConnected ? this.detailTrigger
        : this.tabs.querySelector<HTMLElement>('.store-tab.is-active');
      target?.focus();
    }
    this.detailTrigger = undefined;
  }

  private cardPurchaseRow(item: StoreItem, purchaseItem: StoreItem, currency: Currency, price: number): HTMLElement {
    const row = document.createElement('div'); row.className = 'store-card-purchase';
    const cost = document.createElement('div'); cost.className = 'store-card-price';
    const balance = currency === 'CREDITS' ? this.profile?.credits ?? 0 : this.profile?.skyTokens ?? 0;
    const missing = this.profile ? Math.max(0, price - balance) : 0;
    const tokenUnavailable = currency === 'SKY_TOKENS' && this.authenticated && !this.tokenSpendingAvailable;
    if (this.purchaseAvailable && missing && !tokenUnavailable) {
      const hint = document.createElement('small'); hint.className = 'store-card-shortage';
      hint.textContent = `NEED ${missing.toLocaleString()} MORE`;
      cost.append(hint);
    }
    const getTokens = !!missing && currency === 'SKY_TOKENS' && !tokenUnavailable;
    const buy = this.button(getTokens ? 'GET TOKENS' : 'BUY',
      () => void this.performUnlock(purchaseItem, currency), 'context-action context-action--gold store-buy');
    buy.classList.toggle('is-unavailable', tokenUnavailable);
    buy.replaceChildren(this.priceLine(price, currency));
    buy.setAttribute('aria-label', getTokens ? `Get Sky Tokens to buy ${item.name}`
      : `Buy ${item.name}${purchaseItem !== item ? ` with ${purchaseItem.name}` : ''} for ${price.toLocaleString()} ${currency === 'CREDITS' ? 'Credits' : 'Sky Tokens'}`);
    buy.disabled = !this.purchaseAvailable || this.busy || (currency === 'CREDITS' && !!missing);
    row.append(cost, buy); return row;
  }

  private showAircraftCard(item: StoreItem): void {
    this.setCategory('AIRCRAFT');
    const offer = storePaints.find(candidate => candidate.aircraftType === item.aircraftType && !candidate.included && this.catalog?.has(candidate.id));
    const card = [...this.grid.querySelectorAll<HTMLElement>('.store-item-card')]
      .find(candidate => candidate.dataset.storeItemId === offer?.id);
    if (card) { this.productRail.reveal(card); card.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }); }
  }

  private statusBadge(label: string): HTMLElement {
    const badge = document.createElement('span'); badge.className = 'store-status-badge'; badge.textContent = label; return badge;
  }

  private priceLine(amount: number, currency: Currency): HTMLElement {
    const line = document.createElement('span'); line.className = 'store-currency-amount';
    const icon = document.createElement('img');
    icon.src = currency === 'CREDITS' ? '/media/hub/credits.avif' : '/media/hub/sky-tokens.avif';
    icon.alt = ''; icon.loading = 'lazy';
    const value = document.createElement('strong'); value.textContent = amount.toLocaleString();
    line.append(icon, value); return line;
  }

  private button(label: string, action: () => void, className = 'context-action context-action--gold'): HTMLButtonElement {
    const button = document.createElement('button'); button.type = 'button'; button.className = className; button.textContent = label;
    button.addEventListener('click', action); return button;
  }

  private async performUnlock(item: StoreItem, currency: Currency): Promise<void> {
    if (this.busy || !this.purchaseAvailable) return;
    if (currency === 'SKY_TOKENS' && !this.authenticated) { this.handlers.login(); return; }
    if (currency === 'SKY_TOKENS' && !this.tokenSpendingAvailable) {
      this.setNotice('SKY TOKEN PURCHASES ARE UNAVAILABLE HERE');
      this.notice.classList.add('is-temporary');
      this.noticeTimer = window.setTimeout(() => {
        this.notice.textContent = ''; this.notice.classList.remove('is-temporary'); this.noticeTimer = undefined;
      }, 3500);
      return;
    }
    const price = this.price(item, currency);
    if (!price) return;
    const missing = Math.max(0, price - (currency === 'CREDITS' ? this.profile?.credits ?? 0 : this.profile?.skyTokens ?? 0));
    if (missing) { if (currency === 'SKY_TOKENS') this.handlers.getTokens(missing); return; }
    if (!this.profile || (currency === 'SKY_TOKENS' && !this.tokenSpendingAvailable)) return;
    const balance = currency === 'CREDITS' ? this.profile.credits : this.profile.skyTokens ?? 0;
    const name = item.aircraftType === 'fighter' ? 'FIREHAWK + INFERNO'
      : item.kind === 'paint' && item.aircraftType !== 'trainer'
        ? `${storeAircraft.find(aircraft => aircraft.aircraftType === item.aircraftType)?.name} + ${item.name}` : item.name;
    confirmCatalogPurchase(name, currency, price, balance, () => { void this.submitUnlock(item, currency); });
  }

  private async submitUnlock(item: StoreItem, currency: Currency): Promise<void> {
    if (this.busy || !this.purchaseAvailable || !this.profile || isOwned(item, this.profile)) return;
    this.busy = true; this.render();
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
    this.busy = true; this.render();
    try { const result = await this.handlers.trial(); this.setNotice(result.message); }
    catch { this.setNotice('TRIAL UNAVAILABLE — PLEASE TRY AGAIN'); }
    finally { this.busy = false; this.render(); }
  }

  private async performEquip(item: StoreItem): Promise<void> {
    if (this.busy || !this.profile) return;
    this.busy = true;
    this.render();
    try {
      const result = await this.handlers.equip(item);
      this.setNotice(result.message);
    } catch { this.setNotice('UNABLE TO EQUIP AIRCRAFT — PLEASE TRY AGAIN'); }
    finally { this.busy = false; this.render(); }
  }
}
