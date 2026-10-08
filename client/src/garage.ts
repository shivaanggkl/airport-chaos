import { applyAircraftCosmetics } from './aircraft-cosmetics';
import { aircraftRoles, identityText } from './visual-language';
import * as THREE from 'three';
import { closeTopUiLayer, registerUiBackLayer, uiBackPriority } from './ui-back-navigation';
import { aircraftDefinitions, aircraftDisplayName, garageStats, type AircraftType } from './aircraft';
import { attachAircraftAsset } from './assets';
import { firehawkProduct, aircraftDisplayOrder } from '../../shared/aircraft-economy.mjs';
import { aircraftSkyTokenPrice } from '../../shared/sky-token-economy.mjs';
import { legalConfig } from '../../shared/legal-config.mjs';
import { recordProductIntent } from './product-analytics';
import { cosmeticCatalog, defaultCosmeticIds, fallbackLiveryIds, includedCosmeticIds } from '../../shared/cosmetics.mjs';

export type GarageProfile = {
  credits: number;
  skyTokens?: number;
  selectedAircraft: AircraftType;
  unlockedAircraft: AircraftType[];
  economyVersion?: number;
  aircraftEntitlements?: string[];
  testerCodeEnabled?: boolean;
  fighterTrial?: { status: 'available' | 'pending' | 'active' | 'consumed'; startedAt?: number; expiresAt?: number; completedReportedAt?: number };
  cosmetics?: { ownedIds: string[]; equipped: Record<string, string> };
};

export class AircraftGarage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  private readonly aircraftPresentation = new THREE.Group();
  private readonly preview = new THREE.Group();
  private readonly previewContent = new THREE.Group();
  private readonly ambientLight = new THREE.HemisphereLight(0xffe5c2, 0x23313a, 2.35);
  private readonly keyLight = new THREE.DirectionalLight(0xffd6a0, 3.05);
  private readonly rimLight = new THREE.DirectionalLight(0x8ddfff, 1.15);
  private readonly showcaseWarmLight = new THREE.DirectionalLight(0xffb347, 1.05);
  private readonly showcaseShadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.MeshBasicMaterial({ color: 0x0b2235, transparent: true, opacity: 0.48, depthWrite: false }),
  );
  private readonly showcaseShadowMid = new THREE.Mesh(
    new THREE.CircleGeometry(1, 40),
    new THREE.MeshBasicMaterial({ color: 0x0b2235, transparent: true, opacity: 0.17, depthWrite: false }),
  );
  private readonly showcaseShadowOuter = new THREE.Mesh(
    new THREE.CircleGeometry(1, 40),
    new THREE.MeshBasicMaterial({ color: 0x0b2235, transparent: true, opacity: 0.09, depthWrite: false }),
  );
  private readonly showcaseSet = new THREE.Group();
  private readonly backgroundAircraftSet = new THREE.Group();
  private readonly garageGuideMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, toneMapped: false });
  private readonly showcaseCameraDistance = 18;
  private readonly showcaseCameraYaw = Math.PI / 2;
  private readonly showcaseCameraPitch = THREE.MathUtils.degToRad(4);
  private readonly showcaseAircraftYawOffset = THREE.MathUtils.degToRad(35);
  private readonly showcaseCameraFocus = new THREE.Vector3(0, 1.5, 0);
  // Display order is Bluejay, Mammoth, Nightowl, Firehawk: the outer pair
  // sits forward at showroom scale while the inner pair recedes to the wall.
  private readonly showroomAircraftPlacements = [
    { x: -2.0, z: 11.0, yaw: 0, scale: 1.18 },
    { x: -13.2, z: 8.8, yaw: 0.25, scale: 0.96 },
    { x: -13.2, z: -8.8, yaw: Math.PI - 0.25, scale: 0.96 },
    { x: -2.0, z: -11.0, yaw: Math.PI, scale: 1.18 },
  ] as const;
  private readonly garagePreviewHost: HTMLElement;
  private showcaseHost: HTMLElement | undefined;
  private backgroundAircraftHero?: AircraftType;
  private backgroundAircraftGeneration = 0;
  private readonly cards = new Map<AircraftType, HTMLButtonElement>();
  private profile: GarageProfile = { credits: 0, selectedAircraft: 'trainer', unlockedAircraft: ['trainer'] };
  private selected: AircraftType = 'trainer';
  private previewCosmetic?: string;
  private readonly viewedCosmetics = new Set<string>();
  private pendingTimer = 0;
  private dragging = false;
  private pointerX = 0;
  private pointerY = 0;
  private distance = 14;
  private targetDistance = 14;
  private defaultDistance = 14;
  private orbitYaw = 1.98;
  private targetOrbitYaw = 1.98;
  private orbitPitch = -0.01;
  private targetOrbitPitch = -0.01;
  private idleOrbitAnchor = 1.98;
  private idleOrbitStartedAt = performance.now();
  private windowBlurred = false;
  private userAdjustedZoom = false;
  private raf = 0;
  private loadingProfile = false;
  private actionPending = false;
  private actionMessage = '';
  private testerOpen = false;
  private readonly previewBounds = new THREE.Box3();
  private readonly previewSize = new THREE.Vector3();
  private readonly previewCenter = new THREE.Vector3();
  private readonly previewFocus = new THREE.Vector3();
  private readonly viewDirection = new THREE.Vector3();
  private readonly viewRight = new THREE.Vector3();
  private readonly viewUp = new THREE.Vector3();
  private readonly previewCorner = new THREE.Vector3();
  private readonly showcaseVisualCorners: THREE.Vector3[] = [];
  private previewWidth = 0;
  private previewHeight = 0;
  private lastTrialSecond = -1;
  private nativeStore = false;
  private nativeStorePrice?: string;
  private tokenCommerceReady = false;
  private tokenCommerceEnabled = false;
  private tokenCommercePreview = false;
  private tokenStoreUnavailable = false;

  constructor(
    private readonly element: HTMLElement,
    private readonly onEquip: (type: AircraftType) => void,
    private readonly decoratePreview?: (plane: THREE.Group, type: AircraftType) => void,
    private readonly onClose?: () => void,
    private readonly onPurchase?: (type: AircraftType) => void,
    private readonly onRedeemTesterCode?: (code: string) => void,
    private readonly onStartFighterTrial?: () => void,
    private readonly onPremiumPurchase?: () => void,
    private readonly onFighterModalViewed?: () => void,
    private readonly onRestorePurchase?: (code?: string) => void,
    private readonly onPurchaseCosmetic?: (id: string, currency: 'CREDITS' | 'SKY_TOKENS') => void,
    private readonly onEquipCosmetic?: (id: string) => void,
    private readonly onTokenPurchase?: (type: AircraftType) => void,
    private readonly onGetTokens?: (missing: number) => void,
  ) {
    registerUiBackLayer({
      id: `aircraft-garage-${++AircraftGarage.instanceCount}`,
      priority: uiBackPriority.menu,
      isActive: () => this.isOpen(),
      close: () => this.close(),
      containsTarget: (target) => target instanceof Node && Boolean(this.element.querySelector('.garage-card')?.contains(target)),
    });
    element.innerHTML = `<section class="garage-card app-shell-panel"><header><div><span>HANGAR</span><h1>AIRCRAFTS</h1><p>Choose, compare and equip aircraft.</p></div><div class="garage-balance"><button type="button" data-garage-close>Close</button></div></header><div class="garage-layout"><div class="garage-preview"><canvas></canvas><div class="garage-preview-hint">DRAG ROTATE · WHEEL ZOOM</div></div><div class="garage-details" data-garage-details><div class="garage-statuses" data-garage-status aria-label="Aircraft status"></div><h2 data-garage-name></h2><p data-garage-pitch></p><div data-garage-stats class="garage-stats"></div><div class="garage-actions"><div class="garage-premium" data-garage-premium hidden><div class="garage-trial-row"><p class="garage-trial-summary" data-garage-trial-summary>Trial: 5 minutes</p><button type="button" data-garage-restore>RESTORE PURCHASE</button></div><button type="button" data-garage-trial>START FREE TRIAL</button><button type="button" data-garage-premium-buy>UNLOCK FOREVER — ${firehawkProduct.displayPrice}</button><p class="garage-purchase-disclosure">Sold by ${legalConfig.legalEntityName} · By purchasing, you agree to <a href="${legalConfig.policyRoutes.terms}" target="_blank" rel="noopener noreferrer">Terms</a> · <a href="${legalConfig.policyRoutes.refund}" target="_blank" rel="noopener noreferrer">Refund Policy</a> · <a href="${legalConfig.policyRoutes.privacy}" target="_blank" rel="noopener noreferrer">Privacy Notice</a></p></div><button type="button" data-garage-equip></button><div class="garage-token-choice" data-garage-token-choice hidden><span>OR</span><button type="button" data-garage-token-buy></button></div><p class="garage-action-note" data-garage-action-note></p><button type="button" data-garage-redeem-open hidden>Redeem Access Code</button><div class="garage-tester" data-garage-tester hidden><input type="password" autocomplete="off" maxlength="96" placeholder="Access Code" aria-label="Access Code"><button type="button">Redeem</button></div><small data-garage-message></small></div></div></div><section class="garage-selector-section" aria-labelledby="garage-aircraft-heading"><h2 id="garage-aircraft-heading">AIRCRAFT</h2><div class="garage-list"></div></section></section>`;
    const cosmetics = document.createElement('section'); cosmetics.className = 'garage-cosmetics'; cosmetics.dataset.garageCosmetics = '';
    element.querySelector('.garage-card')!.append(cosmetics);
    const canvas = element.querySelector<HTMLCanvasElement>('canvas')!;
    this.garagePreviewHost = canvas.parentElement!;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.preview.add(this.previewContent);
    this.aircraftPresentation.add(this.preview, this.showcaseShadowOuter, this.showcaseShadowMid, this.showcaseShadow);
    this.showcaseShadow.rotation.x = -Math.PI / 2;
    this.showcaseShadowMid.rotation.x = -Math.PI / 2;
    this.showcaseShadowOuter.rotation.x = -Math.PI / 2;
    this.showcaseShadow.visible = false;
    this.showcaseShadowMid.visible = false;
    this.showcaseShadowOuter.visible = false;
    this.showcaseSet.visible = false;
    this.buildShowcaseSet();
    this.keyLight.position.set(-7, 8, 6);
    this.rimLight.position.set(7, 3, -5);
    this.showcaseWarmLight.position.set(-4, 4, -6);
    this.showcaseWarmLight.visible = false;
    this.scene.add(this.ambientLight, this.keyLight, this.rimLight, this.showcaseWarmLight, this.showcaseSet, this.aircraftPresentation);
    this.camera.position.set(0, 2.2, this.distance); this.camera.lookAt(0, 0, 0);
    for (const type of aircraftDisplayOrder) {
      const card = document.createElement('button'); card.type = 'button'; card.className = 'garage-aircraft';
      card.addEventListener('click', () => { if (this.selected !== type) { recordProductIntent('aircraft_selected', { aircraftType: type }); recordProductIntent('aircraft_viewed', { aircraftType: type }); } this.selected = type; this.previewCosmetic = undefined; this.testerOpen = false; this.actionMessage = ''; this.renderDetails(); this.loadPreview(); if (type === 'fighter' && !this.profile.unlockedAircraft.includes('fighter')) this.onFighterModalViewed?.(); });
      this.cards.set(type, card); element.querySelector('.garage-list')!.append(card);
    }
    element.querySelector('[data-garage-close]')!.addEventListener('click', closeTopUiLayer);
    element.querySelector('[data-garage-equip]')!.addEventListener('click', () => {
      if (this.actionPending) return;
      if (this.profile.unlockedAircraft.includes(this.selected)) this.onEquip(this.selected);
      else if (aircraftDefinitions[this.selected].access === 'credits') {
        this.actionPending = true; this.actionMessage = 'PURCHASE PENDING…'; this.renderDetails(); this.onPurchase?.(this.selected);
      }
    });
    element.querySelector('[data-garage-token-buy]')!.addEventListener('click', () => this.requestTokenUnlock());
    const tester = element.querySelector<HTMLElement>('[data-garage-tester]')!;
    const testerInput = tester.querySelector<HTMLInputElement>('input')!;
    element.querySelector('[data-garage-redeem-open]')!.addEventListener('click', () => {
      this.testerOpen = true; this.renderDetails(); testerInput.focus();
    });
    tester.querySelector('button')!.addEventListener('click', () => {
      const code = testerInput.value.trim(); if (!code || this.actionPending) return;
      this.actionPending = true; this.actionMessage = 'CHECKING CODE…'; this.renderDetails(); this.onRedeemTesterCode?.(code); testerInput.value = '';
    });
    element.querySelector('[data-garage-trial]')!.addEventListener('click', () => { if (!this.actionPending) { this.actionPending = true; this.actionMessage = 'STARTING TEST FLIGHT…'; this.renderDetails(); this.onStartFighterTrial?.(); } });
    element.querySelector('[data-garage-premium-buy]')!.addEventListener('click', () => {
      if (this.actionPending || this.tokenCommercePreview) return;
      if (this.tokenCommerceEnabled) { this.requestTokenUnlock(); return; }
      this.actionPending = true; this.actionMessage = 'OPENING SECURE CHECKOUT…'; this.renderDetails(); this.onPremiumPurchase?.();
    });
    element.querySelector('[data-garage-restore]')!.addEventListener('click', () => {
      if (this.nativeStore) { this.onRestorePurchase?.(); return; }
      const code = window.prompt('Enter your Firehawk purchase recovery code');
      if (code?.trim()) this.onRestorePurchase?.(code.trim());
    });
    canvas.addEventListener('pointerdown', (event) => { this.dragging = true; this.pointerX = event.clientX; this.pointerY = event.clientY; canvas.setPointerCapture(event.pointerId); });
    canvas.addEventListener('pointermove', (event) => {
      if (!this.dragging) return;
      this.targetOrbitYaw -= (event.clientX - this.pointerX) * 0.012;
      this.targetOrbitPitch = THREE.MathUtils.clamp(this.targetOrbitPitch + (event.clientY - this.pointerY) * 0.009, -1.22, 1.22);
      this.pointerX = event.clientX;
      this.pointerY = event.clientY;
    });
    const release = () => {
      this.dragging = false;
      this.idleOrbitAnchor = this.targetOrbitYaw;
      this.idleOrbitStartedAt = performance.now();
    };
    canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.userAdjustedZoom = true;
      this.targetDistance = THREE.MathUtils.clamp(this.targetDistance + event.deltaY * 0.012, this.defaultDistance * 0.38, this.defaultDistance * 2.5);
    }, { passive: false });
    window.addEventListener('resize', () => this.resize());
    new ResizeObserver(() => this.resize()).observe(canvas);
    const pause = (): void => { cancelAnimationFrame(this.raf); this.raf = 0; };
    const resume = (): void => {
      if (document.hidden || this.windowBlurred || !this.isPreviewActive()) return;
      if (this.showcaseHost) {
        this.idleOrbitAnchor = this.orbitYaw;
        this.targetOrbitYaw = this.orbitYaw;
        this.idleOrbitStartedAt = performance.now();
      }
      this.startAnimation();
    };
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else resume(); });
    window.addEventListener('blur', () => { this.windowBlurred = true; pause(); });
    window.addEventListener('focus', () => { this.windowBlurred = false; resume(); });
  }

  private static instanceCount = 0;

  open(profile: GarageProfile, loadingProfile = false): void {
    // Profile hydration may reopen the already-visible Garage. Keep exactly
    // one preview loop so a late profile response cannot create competing
    // render callbacks or make the first open appear unreliable.
    this.hideShowcase();
    this.garagePreviewHost.prepend(this.renderer.domElement);
    this.profile = this.normalizeProfile(profile);
    this.loadingProfile = loadingProfile;
    this.actionPending = false;
    this.actionMessage = '';
    this.testerOpen = false;
    this.selected = this.profile.selectedAircraft;
    this.previewCosmetic = undefined;
    this.viewedCosmetics.clear();
    this.element.hidden = false;
    this.resize();
    this.renderDetails();
    this.loadPreview();
    this.startAnimation();
  }
  close(): void {
    if (this.element.hidden) return;
    this.element.hidden = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.onClose?.();
  }
  isOpen(): boolean { return !this.element.hidden; }

  focusAircraft(type: AircraftType): void {
    if (!this.isOpen() || !this.cards.has(type)) return;
    this.selected = type;
    this.previewCosmetic = undefined;
    this.testerOpen = false;
    this.actionMessage = '';
    this.renderDetails();
    void this.loadPreview();
    if (type === 'fighter' && !this.profile.unlockedAircraft.includes('fighter')) this.onFighterModalViewed?.();
  }

  focusCosmetic(id: string): void {
    const item = cosmeticCatalog.find(entry => entry.id === id);
    if (!item || !this.isOpen()) return;
    this.focusAircraft(item.aircraftRestriction as AircraftType);
    this.previewCosmetic = id;
    this.paintPreview();
    this.renderCosmetics();
  }

  showcase(host: HTMLElement, profile: GarageProfile): Promise<void> {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.element.hidden = true;
    this.showcaseHost = host;
    host.prepend(this.renderer.domElement);
    this.profile = this.normalizeProfile(profile);
    this.selected = this.profile.selectedAircraft;
    this.previewCosmetic = undefined;
    this.setShowcaseLighting(true);
    this.showcaseSet.visible = true;
    this.showcaseShadow.visible = true;
    this.showcaseShadowMid.visible = true;
    this.showcaseShadowOuter.visible = true;
    this.loadBackgroundAircraft();
    const previewReady = this.loadPreview();
    this.resize();
    this.startAnimation();
    return previewReady;
  }

  hideShowcase(): void {
    if (!this.showcaseHost) return;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.showcaseHost = undefined;
    this.setShowcaseLighting(false);
    this.showcaseSet.visible = false;
    this.showcaseShadow.visible = false;
    this.showcaseShadowMid.visible = false;
    this.showcaseShadowOuter.visible = false;
    this.aircraftPresentation.position.set(0, 0, 0);
    this.aircraftPresentation.scale.setScalar(1);
    this.preview.rotation.set(0, 0, 0);
    this.garagePreviewHost.prepend(this.renderer.domElement);
  }

  updateProfile(profile: GarageProfile): void {
    this.profile = this.normalizeProfile(profile);
    this.paintPreview();
    this.loadingProfile = false;
    window.clearTimeout(this.pendingTimer);
    this.actionPending = false;
    this.actionMessage = '';
    this.renderDetails();
  }

  showActionResult(message: string): void {
    window.clearTimeout(this.pendingTimer);
    this.actionPending = false;
    this.actionMessage = message;
    this.renderDetails();
  }

  setNativeStorePrice(localizedPrice?: string): void {
    this.nativeStore = true;
    this.nativeStorePrice = localizedPrice?.trim() || undefined;
    if (this.isOpen()) this.renderDetails();
  }

  setTokenCommerce(enabled: boolean, previewOnly = false): void {
    this.tokenCommerceReady = true;
    this.tokenCommerceEnabled = enabled;
    this.tokenCommercePreview = previewOnly;
    this.tokenStoreUnavailable = false;
    if (this.isOpen()) this.renderDetails();
  }

  setTokenStoreUnavailable(): void {
    this.tokenCommerceReady = false;
    this.tokenStoreUnavailable = true;
    if (this.isOpen()) this.renderDetails();
  }

  private requestTokenUnlock(): void {
    if (this.actionPending || !this.tokenCommerceEnabled || this.tokenCommercePreview) return;
    const price = aircraftSkyTokenPrice(this.selected);
    if (!price) return;
    const missing = Math.max(0, price - (this.profile.skyTokens ?? 0));
    if (missing) { this.onGetTokens?.(missing); return; }
    this.actionPending = true; this.actionMessage = 'UNLOCKING AIRCRAFT…'; this.renderDetails();
    this.onTokenPurchase?.(this.selected);
  }

  private premiumPrice(): string { return this.nativeStore ? this.nativeStorePrice ?? 'STORE PRICE' : firehawkProduct.displayPrice; }

  private loadPreview(): Promise<void> {
    this.previewContent.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object.userData.cosmeticMaterialsCloned || !object.userData.sharedAsset) {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
      }
      if (!object.userData.sharedAsset) object.geometry.dispose();
    });
    this.previewContent.clear();
    this.previewContent.position.set(0, 0, 0);
    this.userAdjustedZoom = false;
    const definition = aircraftDefinitions[this.selected];
    const plane = new THREE.Group();
    const fallback = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(definition.bodyRadius, definition.bodyRadius, definition.bodyLength, 12), new THREE.MeshStandardMaterial({ color: definition.bodyColor, roughness: 0.45 }));
    body.material.name = 'AC_LIVERY_BASE';
    body.rotation.x = Math.PI / 2; fallback.add(body); plane.add(fallback); this.previewContent.add(plane);
    this.framePreview(true);
    const assetReady = attachAircraftAsset(plane, fallback, this.selected, definition.bodyLength + definition.noseLength, definition.wingSpan, () => {
      // A cached GLB can resolve after the player chose another card.  Only
      // reframe if this plane is still the active preview.
      if (this.previewContent.children.includes(plane)) this.framePreview(false);
    });
    this.decoratePreview?.(plane, this.selected);
    this.paintPreview();
    return assetReady.then(() => undefined);
  }

  private renderDetails(): void {
    const definition = aircraftDefinitions[this.selected];
    const owned = this.isPermanentlyOwned(this.selected);
    const trialUsable = this.selected === 'fighter' && this.isTrialUsable();
    const price = definition.access === 'credits' ? definition.creditsRequired : undefined;
    const equipped = this.selected === this.profile.selectedAircraft;
    const statusRoot = this.element.querySelector<HTMLElement>('[data-garage-status]')!;
    const statuses: Array<{ label: string; kind: string }> = [];
    if (this.loadingProfile) statuses.push({ label: 'SYNCING PROFILE…', kind: 'syncing' });
    else {
      if (owned) statuses.push({ label: 'OWNED', kind: 'owned' });
      if (equipped) statuses.push({ label: 'EQUIPPED', kind: 'equipped' });
      if (!owned && definition.access === 'credits') statuses.push({ label: 'LOCKED', kind: 'locked' });
      if (!owned && definition.access === 'premium') statuses.push({ label: 'PREMIUM', kind: 'premium' });
      if (trialUsable) statuses.push({ label: this.trialStatusText(), kind: 'trial' });
      else if (!owned && this.selected === 'fighter' && this.profile.fighterTrial?.status === 'available') statuses.push({ label: 'TRIAL AVAILABLE', kind: 'trial' });
    }
    statusRoot.replaceChildren(...statuses.map(({ label, kind }) => {
      const chip = document.createElement('span'); chip.className = `garage-status garage-status-${kind}`; chip.textContent = label; return chip;
    }));
    this.element.querySelector('[data-garage-details]')!.classList.toggle('is-firehawk', this.selected === 'fighter');
    this.element.querySelector('.garage-card')!.classList.toggle('is-firehawk', this.selected === 'fighter');
    this.element.querySelector('[data-garage-name]')!.textContent = aircraftDisplayName(this.selected);
    this.element.querySelector('[data-garage-pitch]')!.textContent = aircraftRoles[this.selected];
    this.element.querySelector('[data-garage-stats]')!.replaceChildren(...garageStats(definition).map(({ label, value }) => {
      const row = document.createElement('div');
      const name = document.createElement('span'); name.textContent = label;
      const bars = document.createElement('b'); bars.setAttribute('aria-label', `${value} of 5`);
      for (let index = 0; index < 5; index += 1) { const block = document.createElement('i'); block.classList.toggle('active', index < value); bars.append(block); }
      row.append(name, bars); return row;
    }));
    const equip = this.element.querySelector<HTMLButtonElement>('[data-garage-equip]')!;
    const insufficient = price !== undefined && this.profile.credits < price;
    equip.dataset.state = equipped ? 'equipped' : insufficient ? 'unaffordable' : owned ? 'equip' : 'unlock';
    equip.disabled = this.loadingProfile || this.actionPending || this.selected === this.profile.selectedAircraft || (!owned && (definition.access === 'premium' || insufficient));
    equip.textContent = this.selected === this.profile.selectedAircraft ? 'EQUIPPED' : owned ? 'EQUIP' : definition.access === 'premium' ? 'UNLOCK FIREHAWK' : `UNLOCK — ${price!.toLocaleString()} CREDITS`;
    equip.hidden = definition.access === 'premium' && !owned;
    const tokenPrice = aircraftSkyTokenPrice(this.selected);
    const tokenChoice = this.element.querySelector<HTMLElement>('[data-garage-token-choice]')!;
    tokenChoice.hidden = !(this.tokenCommerceEnabled || this.tokenCommercePreview) || owned || definition.access !== 'credits';
    const tokenBuy = this.element.querySelector<HTMLButtonElement>('[data-garage-token-buy]')!;
    const tokenMissing = Math.max(0, (tokenPrice ?? 0) - (this.profile.skyTokens ?? 0));
    tokenBuy.textContent = tokenMissing ? `GET SKY TOKENS · ${tokenPrice?.toLocaleString()} TO UNLOCK` : `UNLOCK — ${tokenPrice?.toLocaleString()} SKY TOKENS`;
    tokenBuy.disabled = this.loadingProfile || this.actionPending || this.tokenCommercePreview;
    this.element.querySelector<HTMLElement>('[data-garage-action-note]')!.textContent = insufficient ? `Need ${(price! - this.profile.credits).toLocaleString()} more Credits` : '';
    this.element.querySelector('[data-garage-message]')!.textContent = this.actionMessage;
    const tester = this.element.querySelector<HTMLElement>('[data-garage-tester]')!;
    const premium = this.element.querySelector<HTMLElement>('[data-garage-premium]')!;
    premium.hidden = this.selected !== 'fighter' || (owned && !this.nativeStore);
    const buy = this.element.querySelector<HTMLButtonElement>('[data-garage-premium-buy]')!;
    buy.textContent = !this.tokenCommerceReady ? this.tokenStoreUnavailable ? 'STORE UNAVAILABLE' : 'CHECKING STORE…' : this.tokenCommerceEnabled || this.tokenCommercePreview
      ? tokenMissing ? `GET SKY TOKENS · NEED ${tokenMissing.toLocaleString()} MORE` : `UNLOCK — ${tokenPrice?.toLocaleString()} SKY TOKENS`
      : this.nativeStore
        ? this.nativeStorePrice ? `UNLOCK FOREVER — ${this.nativeStorePrice}` : 'STORE UNAVAILABLE'
        : `${firehawkProduct.displayPrice} — PERMANENT UNLOCK`;
    buy.disabled = !this.tokenCommerceReady || this.loadingProfile || this.actionPending || this.tokenCommercePreview || (!this.tokenCommerceEnabled && this.nativeStore && !this.nativeStorePrice);
    buy.hidden = owned;
    const restore = this.element.querySelector<HTMLButtonElement>('[data-garage-restore]')!;
    restore.textContent = this.nativeStore ? 'RESTORE PURCHASES' : 'RESTORE PURCHASE';
    this.element.querySelector<HTMLElement>('.garage-purchase-disclosure')!.hidden = this.nativeStore || this.tokenCommerceEnabled || this.tokenCommercePreview;
    const trialState = this.profile.fighterTrial?.status ?? 'available';
    const remaining = this.trialRemainingSeconds();
    const trialSummary = this.element.querySelector<HTMLElement>('[data-garage-trial-summary]')!;
    trialSummary.hidden = owned;
    trialSummary.textContent = trialState === 'available'
      ? 'Trial: 5 minutes'
      : trialState === 'pending'
        ? 'Trial: ready on next flight'
        : trialState === 'active'
          ? `Trial: ${String(Math.floor(Math.max(0, remaining) / 60)).padStart(2, '0')}:${String(Math.max(0, remaining) % 60).padStart(2, '0')} remaining`
          : 'Trial: already used';
    this.element.querySelector<HTMLElement>('[data-garage-trial]')!.hidden = owned || this.profile.fighterTrial?.status !== 'available';
    const canRedeem = this.selected === 'fighter' && !owned && this.profile.testerCodeEnabled === true;
    this.element.querySelector<HTMLElement>('[data-garage-redeem-open]')!.hidden = !canRedeem || this.testerOpen;
    tester.hidden = !canRedeem || !this.testerOpen;
    for (const [type, card] of this.cards) {
      const data = aircraftDefinitions[type]; const typeOwned = this.isPermanentlyOwned(type);
      const access = type === this.profile.selectedAircraft ? 'EQUIPPED'
        : type === 'fighter' && this.isTrialUsable() ? this.trialStatusText()
        : typeOwned ? 'OWNED'
        : data.access === 'premium' ? this.tokenCommerceEnabled || this.tokenCommercePreview ? `${aircraftSkyTokenPrice(type)!.toLocaleString()} SKY TOKENS` : 'PREMIUM'
        : data.access === 'free' ? 'FREE' : `${data.creditsRequired.toLocaleString()} ${identityText('credits')}`;
      const name = document.createElement('strong'); name.textContent = data.callsign;
      const state = document.createElement('small'); state.textContent = access;
      card.replaceChildren(name, state);
      card.classList.toggle('selected', type === this.selected);
      card.setAttribute('aria-label', `${aircraftDisplayName(type)} — ${access}`);
      card.setAttribute('aria-pressed', String(type === this.selected));
    }
    this.lastTrialSecond = this.trialRemainingSeconds();
    this.renderCosmetics();
  }

  private paintPreview(): void {
    const equipped = { ...this.profile.cosmetics?.equipped };
    const item = cosmeticCatalog.find(entry => entry.id === this.previewCosmetic);
    if (item?.aircraftRestriction === this.selected) equipped[`livery:${this.selected}`] = item.id;
    for (const plane of this.previewContent.children) applyAircraftCosmetics(plane, this.selected, equipped);
  }

  private renderCosmetics(): void {
    const root = this.element.querySelector<HTMLElement>('[data-garage-cosmetics]')!;
    const previousScroll = root.querySelector<HTMLElement>('.garage-cosmetic-list')?.scrollLeft ?? 0;
    root.replaceChildren();
    const heading = document.createElement('h2'); heading.textContent = 'APPEARANCE';
    const help = document.createElement('p'); help.textContent = 'Select a finish to preview it.';
    const list = document.createElement('div'); list.className = 'garage-cosmetic-list';
    root.append(heading, help, list);
    const owned = new Set(this.profile.cosmetics?.ownedIds ?? []);
    const ownsAircraft = this.isPermanentlyOwned(this.selected);
    for (const item of cosmeticCatalog.filter(entry => entry.aircraftRestriction === this.selected)) {
      const slot = `livery:${this.selected}`;
      const equipped = this.profile.cosmetics?.equipped?.[slot] === item.id;
      const selected = this.previewCosmetic ? this.previewCosmetic === item.id : equipped;
      if (selected && !this.viewedCosmetics.has(item.id)) {
        this.viewedCosmetics.add(item.id);
        recordProductIntent('cosmetic_viewed', { cosmeticId: item.id, aircraftType: this.selected });
      }
      const access = item.unlockType === 'included' ? (equipped ? 'EQUIPPED' : 'INCLUDED WITH FIREHAWK')
        : equipped ? 'EQUIPPED' : owned.has(item.id) ? 'OWNED'
        : !ownsAircraft && this.selected !== 'trainer' ? 'AIRCRAFT REQUIRED'
        : `${item.creditPrice.toLocaleString()} CREDITS · ${item.skyTokenPrice.toLocaleString()} SKY TOKENS`;
      const card = document.createElement('article'); card.className = 'garage-cosmetic-card';
      const button = document.createElement('button'); button.type = 'button'; button.className = 'garage-cosmetic';
      const name = document.createElement('strong'); name.textContent = item.displayName;
      const swatches = document.createElement('span'); swatches.className = 'garage-cosmetic-swatches'; swatches.setAttribute('aria-hidden', 'true');
      for (const color of [item.visualConfig.base, item.visualConfig.primary, item.visualConfig.accent]) {
        const swatch = document.createElement('i'); swatch.style.backgroundColor = `#${color.toString(16).padStart(6, '0')}`; swatches.append(swatch);
      }
      const state = document.createElement('small'); state.textContent = access;
      button.append(name, swatches, state);
      button.setAttribute('aria-pressed', String(selected));
      button.onclick = () => {
        if (this.previewCosmetic !== item.id) recordProductIntent('cosmetic_previewed', { cosmeticId: item.id, aircraftType: this.selected });
        this.previewCosmetic = item.id; this.paintPreview(); this.renderCosmetics();
        root.querySelector<HTMLElement>('.garage-cosmetic[aria-pressed=true]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
      };
      card.append(button);
      if (selected && !equipped && item.unlockType !== 'included') {
        const beginAction = (currency?: 'CREDITS' | 'SKY_TOKENS'): void => {
          if (currency) recordProductIntent('cosmetic_unlock_started', { cosmeticId: item.id, aircraftType: this.selected, currency: currency === 'CREDITS' ? 'credits' : 'sky_tokens' });
          this.actionPending = true; this.actionMessage = 'WAITING FOR SERVER…'; this.renderDetails();
          window.clearTimeout(this.pendingTimer);
          this.pendingTimer = window.setTimeout(() => this.showActionResult('SERVER DID NOT RESPOND — REOPEN AIRCRAFTS TO SYNC'), 8000);
          if (currency) this.onPurchaseCosmetic?.(item.id, currency);
          else this.onEquipCosmetic?.(item.id);
        };
        if (owned.has(item.id)) {
          const action = document.createElement('button'); action.type = 'button'; action.className = 'garage-cosmetic-action';
          action.textContent = 'EQUIP'; action.disabled = this.loadingProfile || this.actionPending || !ownsAircraft;
          action.onclick = () => beginAction(); card.append(action);
        } else if (item.unlockType === 'credits') {
          const options = document.createElement('div'); options.className = 'garage-cosmetic-options';
          const credits = document.createElement('button'); credits.type = 'button'; credits.className = 'garage-cosmetic-action';
          credits.textContent = `UNLOCK · ${item.creditPrice.toLocaleString()} CREDITS`;
          credits.disabled = this.loadingProfile || this.actionPending || !ownsAircraft || this.profile.credits < item.creditPrice;
          credits.onclick = () => beginAction('CREDITS');
          options.append(credits);
          if (ownsAircraft && this.profile.credits < item.creditPrice) {
            const need = document.createElement('small'); need.className = 'garage-cosmetic-note';
            need.textContent = `Have ${this.profile.credits.toLocaleString()} · Need ${(item.creditPrice - this.profile.credits).toLocaleString()} more Credits`;
            options.append(need);
          }
          const or = document.createElement('span'); or.className = 'garage-cosmetic-or'; or.textContent = 'OR'; options.append(or);
          const tokens = document.createElement('button'); tokens.type = 'button'; tokens.className = 'garage-cosmetic-action garage-cosmetic-token-action';
          const missing = Math.max(0, item.skyTokenPrice - (this.profile.skyTokens ?? 0));
          tokens.textContent = missing && (this.tokenCommerceEnabled || this.tokenCommercePreview) ? `GET SKY TOKENS · ${item.skyTokenPrice}` : `UNLOCK · ${item.skyTokenPrice} SKY TOKENS`;
          tokens.disabled = this.loadingProfile || this.actionPending || this.tokenCommercePreview || !ownsAircraft || (missing > 0 && !this.tokenCommerceEnabled);
          tokens.onclick = () => { if (!this.tokenCommercePreview) { if (missing) this.onGetTokens?.(missing); else beginAction('SKY_TOKENS'); } };
          options.append(tokens);
          if (ownsAircraft && missing) {
            const need = document.createElement('small'); need.className = 'garage-cosmetic-note';
            need.textContent = `Have ${(this.profile.skyTokens ?? 0).toLocaleString()} · Need ${missing.toLocaleString()} more Sky Tokens`;
            options.append(need);
          }
          card.append(options);
        }
      }
      list.append(card);
    }
    list.scrollLeft = previousScroll;
  }

  private isPermanentlyOwned(type: AircraftType): boolean {
    return type === 'fighter'
      ? this.profile.aircraftEntitlements?.includes(firehawkProduct.entitlement) === true
      : this.profile.unlockedAircraft.includes(type);
  }

  private isTrialUsable(): boolean {
    return this.profile.fighterTrial?.status === 'pending' || this.profile.fighterTrial?.status === 'active';
  }

  private trialRemainingSeconds(): number {
    const trial = this.profile.fighterTrial;
    return trial?.status === 'active' && typeof trial.expiresAt === 'number' ? Math.max(0, Math.ceil((trial.expiresAt - Date.now()) / 1000)) : -1;
  }

  private trialStatusText(): string {
    const remaining = this.trialRemainingSeconds();
    if (remaining < 0) return 'TEST FLIGHT READY';
    if (remaining === 0) return 'TRIAL COMPLETE';
    return `TRIAL ACTIVE — ${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  }

  private normalizeProfile(profile: GarageProfile): GarageProfile {
    const types = aircraftDisplayOrder;
    const selectedAircraft = types.includes(profile.selectedAircraft) ? profile.selectedAircraft : 'trainer';
    const unlockedAircraft = Array.isArray(profile.unlockedAircraft)
      ? [...new Set(profile.unlockedAircraft.filter((type): type is AircraftType => types.includes(type)))]
      : [];
    if (!unlockedAircraft.includes('trainer')) unlockedAircraft.unshift('trainer');
    const permanentlyOwned = (type: AircraftType) => type === 'fighter'
      ? profile.aircraftEntitlements?.includes(firehawkProduct.entitlement) === true
      : unlockedAircraft.includes(type);
    const ownedIds = new Set((profile.cosmetics?.ownedIds ?? []).filter(id => cosmeticCatalog.some(item => item.id === id)));
    for (const id of defaultCosmeticIds) ownedIds.add(id);
    if (permanentlyOwned('fighter')) ownedIds.add(includedCosmeticIds.fighter); else ownedIds.delete(includedCosmeticIds.fighter);
    const equipped: Record<string, string> = {};
    for (const type of aircraftDisplayOrder) {
      const slot = `livery:${type}`;
      const current = profile.cosmetics?.equipped?.[slot];
      const valid = cosmeticCatalog.some(item => item.id === current && item.aircraftRestriction === type) && current !== undefined && ownedIds.has(current);
      if (valid && (type === 'trainer' || permanentlyOwned(type))) equipped[slot] = current;
      else if ((type === 'trainer' || permanentlyOwned(type)) && fallbackLiveryIds[type] && ownedIds.has(fallbackLiveryIds[type])) equipped[slot] = fallbackLiveryIds[type];
    }
    return {
      credits: Number.isFinite(profile.credits) ? Math.max(0, profile.credits) : 0,
      skyTokens: Number.isSafeInteger(profile.skyTokens) ? Math.max(0, profile.skyTokens!) : 0,
      selectedAircraft,
      unlockedAircraft,
      economyVersion: profile.economyVersion,
      aircraftEntitlements: Array.isArray(profile.aircraftEntitlements) ? profile.aircraftEntitlements.filter((value): value is string => typeof value === 'string') : [],
      testerCodeEnabled: profile.testerCodeEnabled === true,
      fighterTrial: profile.fighterTrial ?? { status: 'available' },
      cosmetics: { ownedIds: [...ownedIds], equipped },
    };
  }

  private buildShowcaseSet(): void {
    const graphiteBlue = 0x163458;
    const steel = 0x1e4d7a;
    const lightSteel = 0x28547d;
    const cyan = 0x35d6ff;
    const coolWhite = 0xf6fbff;
    const gold = 0xffb347;
    const violet = 0x8e63ff;
    const panelGeometry = new THREE.BoxGeometry(1, 1, 1);
    const transform = new THREE.Object3D();
    const finishInstances = (mesh: THREE.InstancedMesh) => {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.showcaseSet.add(mesh);
    };

    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x5186b9, roughness: 0.27, metalness: 0.3, emissive: steel, emissiveIntensity: 0.28 });
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x356a9a, roughness: 0.47, metalness: 0.36, emissive: steel, emissiveIntensity: 0.43 });
    const ceilingMaterial = new THREE.MeshStandardMaterial({ color: steel, roughness: 0.4, metalness: 0.55, emissive: graphiteBlue, emissiveIntensity: 0.42 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(32, 0.18, 32), floorMaterial);
    floor.position.set(-0.1, -0.09, 0);
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(0.34, 7.3, 32), wallMaterial);
    backWall.position.set(-15.84, 3.65, 0);
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(32, 7.3, 0.34), wallMaterial);
    leftWall.position.set(-0.1, 3.65, -15.84);
    const rightWall = leftWall.clone(); rightWall.position.z = 15.84;
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(32, 0.34, 32), ceilingMaterial);
    ceiling.position.set(-0.1, 7.14, 0);
    this.showcaseSet.add(floor, backWall, leftWall, rightWall, ceiling);

    // Baked color on the floor gives the command deck its reflected-light look
    // without a reflection pass or additional work during the orbit.
    const reflectionCanvas = document.createElement('canvas');
    reflectionCanvas.width = reflectionCanvas.height = 512;
    const reflectionContext = reflectionCanvas.getContext('2d');
    if (reflectionContext) {
      const reflectedGlow = (x: number, y: number, radius: number, color: string) => {
        const glow = reflectionContext.createRadialGradient(x, y, 0, x, y, radius);
        glow.addColorStop(0, color); glow.addColorStop(1, 'transparent');
        reflectionContext.fillStyle = glow;
        reflectionContext.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      };
      const floorSheen = reflectionContext.createLinearGradient(80, 0, 512, 0);
      floorSheen.addColorStop(0, 'transparent');
      floorSheen.addColorStop(0.5, 'rgba(53, 214, 255, 0.12)');
      floorSheen.addColorStop(0.78, 'rgba(171, 225, 255, 0.29)');
      floorSheen.addColorStop(1, 'rgba(142, 99, 255, 0.15)');
      reflectionContext.fillStyle = floorSheen; reflectionContext.fillRect(0, 0, 512, 512);
      reflectedGlow(250, 255, 182, 'rgba(53, 214, 255, 0.42)');
      reflectedGlow(212, 258, 94, 'rgba(246, 196, 69, 0.43)');
      reflectedGlow(332, 120, 102, 'rgba(142, 99, 255, 0.34)');
      reflectedGlow(332, 392, 102, 'rgba(142, 99, 255, 0.34)');
      reflectedGlow(410, 255, 180, 'rgba(111, 230, 255, 0.16)');
      for (const side of [-1, 1]) {
        const y = 256 + side * 176;
        const streak = reflectionContext.createLinearGradient(0, y - 18, 0, y + 18);
        streak.addColorStop(0, 'transparent'); streak.addColorStop(0.5, 'rgba(111, 230, 255, 0.28)'); streak.addColorStop(1, 'transparent');
        reflectionContext.fillStyle = streak;
        reflectionContext.fillRect(54, y - 18, 390, 36);
        const lightPool = reflectionContext.createRadialGradient(225, y, 0, 225, y, 82);
        lightPool.addColorStop(0, side < 0 ? 'rgba(255, 179, 71, 0.52)' : 'rgba(53, 214, 255, 0.48)');
        lightPool.addColorStop(1, 'transparent');
        reflectionContext.fillStyle = lightPool;
        reflectionContext.fillRect(143, y - 82, 164, 164);
        for (const [x, width, alpha] of [[295, 76, 0.42], [385, 58, 0.28]] as const) {
          const reflectedStrip = reflectionContext.createLinearGradient(0, y - 18, 0, y + 18);
          reflectedStrip.addColorStop(0, 'transparent');
          reflectedStrip.addColorStop(0.5, `rgba(171, 225, 255, ${alpha})`);
          reflectedStrip.addColorStop(1, 'transparent');
          reflectionContext.fillStyle = reflectedStrip;
          reflectionContext.fillRect(x, y - 18, width, 36);
        }
      }
      const reflectionTexture = new THREE.CanvasTexture(reflectionCanvas);
      reflectionTexture.colorSpace = THREE.SRGBColorSpace; reflectionTexture.generateMipmaps = false;
      const floorReflections = new THREE.Mesh(
        new THREE.PlaneGeometry(31.6, 31.6),
        new THREE.MeshBasicMaterial({ map: reflectionTexture, transparent: true, depthWrite: false, toneMapped: false }),
      );
      floorReflections.rotation.x = -Math.PI / 2; floorReflections.position.set(-0.1, 0.009, 0);
      this.showcaseSet.add(floorReflections);
    }

    // The side bays retain the same walls and frames, with a painted sunset
    // visible through their rear openings as in the approved reference.
    const vistaCanvas = document.createElement('canvas');
    vistaCanvas.width = vistaCanvas.height = 512;
    const vistaContext = vistaCanvas.getContext('2d');
    if (vistaContext) {
      const sky = vistaContext.createLinearGradient(0, 0, 0, 512);
      sky.addColorStop(0, '#7856C8'); sky.addColorStop(0.45, '#D98BB3');
      sky.addColorStop(0.69, '#FFBC72'); sky.addColorStop(1, '#37558C');
      vistaContext.fillStyle = sky; vistaContext.fillRect(0, 0, 512, 512);
      for (const [x, y, radius] of [[90, 292, 96], [364, 310, 140]] as const) {
        const haze = vistaContext.createRadialGradient(x, y, 0, x, y, radius);
        haze.addColorStop(0, 'rgba(255, 221, 156, 0.56)'); haze.addColorStop(1, 'transparent');
        vistaContext.fillStyle = haze; vistaContext.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
      vistaContext.fillStyle = '#2F4674';
      vistaContext.fillRect(0, 399, 512, 113);
      for (const [x, width, height] of [[18, 53, 40], [89, 82, 23], [214, 74, 34], [322, 92, 48], [442, 70, 28]] as const) {
        vistaContext.fillRect(x, 399 - height, width, height);
      }
      vistaContext.fillRect(168, 270, 17, 130);
      vistaContext.fillRect(146, 274, 61, 9);
      vistaContext.beginPath(); vistaContext.moveTo(176, 210); vistaContext.lineTo(164, 270); vistaContext.lineTo(188, 270); vistaContext.fill();
      vistaContext.strokeStyle = '#FFCE8D'; vistaContext.lineWidth = 8; vistaContext.strokeRect(8, 8, 496, 496);
      const vistaTexture = new THREE.CanvasTexture(vistaCanvas);
      vistaTexture.colorSpace = THREE.SRGBColorSpace; vistaTexture.generateMipmaps = false;
      for (const side of [-1, 1]) {
        for (const [x, width] of [[-13.75, 3.64], [0.7, 8.4]] as const) {
          const vista = new THREE.Mesh(
            new THREE.PlaneGeometry(width, 5.6),
            new THREE.MeshBasicMaterial({ map: vistaTexture, side: THREE.DoubleSide, toneMapped: false }),
          );
          vista.position.set(x, 3.55, side * 15.44);
          vista.rotation.y = side === -1 ? 0 : Math.PI;
          this.showcaseSet.add(vista);
        }
      }
    }

    const heroPad = new THREE.Mesh(
      new THREE.CylinderGeometry(5.15, 5.3, 0.12, 64),
      new THREE.MeshStandardMaterial({ color: graphiteBlue, roughness: 0.28, metalness: 0.72, emissive: steel, emissiveIntensity: 0.17 }),
    );
    heroPad.position.y = 0.06;
    const padInset = new THREE.Mesh(
      new THREE.CircleGeometry(4.72, 64),
      new THREE.MeshStandardMaterial({ color: steel, roughness: 0.42, metalness: 0.6, transparent: true, opacity: 0.82 }),
    );
    padInset.rotation.x = -Math.PI / 2; padInset.position.y = 0.126;
    const padRingMaterial = new THREE.MeshBasicMaterial({ color: 0x6fe6ff, transparent: true, opacity: 0.98, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    const padOuterRing = new THREE.Mesh(new THREE.RingGeometry(4.7, 4.83, 72), padRingMaterial);
    padOuterRing.rotation.x = -Math.PI / 2; padOuterRing.position.y = 0.132;
    const padInnerRing = new THREE.Mesh(new THREE.RingGeometry(3.72, 3.78, 72), new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    padInnerRing.rotation.x = -Math.PI / 2; padInnerRing.position.y = 0.134;
    const padHalo = new THREE.Mesh(
      new THREE.RingGeometry(4.48, 5.06, 72),
      new THREE.MeshBasicMaterial({ color: cyan, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
    );
    padHalo.rotation.x = -Math.PI / 2; padHalo.position.y = 0.13;
    this.showcaseSet.add(heroPad, padInset, padOuterRing, padInnerRing, padHalo);

    const floorGuides = new THREE.InstancedMesh(panelGeometry, this.garageGuideMaterial, 8);
    for (let index = 0; index < 4; index += 1) {
      const side = index < 2 ? -1 : 1;
      const lane = index % 2 === 0 ? 6.2 : 11.6;
      transform.position.set(-1.0, 0.018, side * lane); transform.rotation.set(0, 0, 0); transform.scale.set(22, 0.025, 0.055); transform.updateMatrix();
      floorGuides.setMatrixAt(index, transform.matrix);
      floorGuides.setColorAt(index, new THREE.Color(index % 2 === 0 ? cyan : gold));
      transform.position.set(-8.9 + (index % 2) * 2.3, 0.022, side * lane); transform.scale.set(0.07, 0.025, 2.9); transform.updateMatrix();
      floorGuides.setMatrixAt(index + 4, transform.matrix);
      floorGuides.setColorAt(index + 4, new THREE.Color(index % 2 === 0 ? cyan : violet));
    }
    finishInstances(floorGuides);

    const backPanelFrames = new THREE.InstancedMesh(
      panelGeometry,
      new THREE.MeshStandardMaterial({ color: 0x31679a, roughness: 0.42, metalness: 0.56, emissive: cyan, emissiveIntensity: 0.05 }),
      9,
    );
    const backPanelInsets = new THREE.InstancedMesh(
      panelGeometry,
      new THREE.MeshStandardMaterial({ color: 0x21436e, roughness: 0.58, metalness: 0.32, emissive: violet, emissiveIntensity: 0.08 }),
      9,
    );
    const backPanelSeams = new THREE.InstancedMesh(panelGeometry, this.garageGuideMaterial, 9);
    for (let index = 0; index < 9; index += 1) {
      const z = -13.7 + index * 3.425;
      transform.position.set(-15.62, 3.25, z); transform.rotation.set(0, 0, 0); transform.scale.set(0.18, 6.15, 3.12); transform.updateMatrix();
      backPanelFrames.setMatrixAt(index, transform.matrix);
      transform.position.x = -15.49; transform.scale.set(0.08, 5.52, 2.76); transform.updateMatrix(); backPanelInsets.setMatrixAt(index, transform.matrix);
      transform.position.set(-15.42, 0.68, z); transform.scale.set(0.035, 0.035, 2.42); transform.updateMatrix(); backPanelSeams.setMatrixAt(index, transform.matrix);
      backPanelSeams.setColorAt(index, new THREE.Color(index % 3 === 1 ? violet : cyan));
    }
    finishInstances(backPanelFrames); finishInstances(backPanelInsets); finishInstances(backPanelSeams);

    const wallGlowCanvas = document.createElement('canvas');
    wallGlowCanvas.width = 512; wallGlowCanvas.height = 128;
    const wallGlowContext = wallGlowCanvas.getContext('2d');
    if (wallGlowContext) {
      for (const [x, color] of [[94, 'rgba(142, 99, 255, 0.36)'], [255, 'rgba(53, 214, 255, 0.23)'], [420, 'rgba(142, 99, 255, 0.36)']] as const) {
        const glow = wallGlowContext.createRadialGradient(x, 58, 0, x, 58, 100);
        glow.addColorStop(0, color); glow.addColorStop(1, 'transparent');
        wallGlowContext.fillStyle = glow; wallGlowContext.fillRect(x - 100, 0, 200, 128);
      }
      const wallGlowTexture = new THREE.CanvasTexture(wallGlowCanvas);
      wallGlowTexture.colorSpace = THREE.SRGBColorSpace; wallGlowTexture.generateMipmaps = false;
      const wallGlow = new THREE.Mesh(
        new THREE.PlaneGeometry(29, 5.8),
        new THREE.MeshBasicMaterial({ map: wallGlowTexture, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
      );
      wallGlow.rotation.y = Math.PI / 2; wallGlow.position.set(-15.33, 3.7, 0);
      this.showcaseSet.add(wallGlow);
    }

    const showroomPads = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(2.45, 2.58, 0.18, 40),
      new THREE.MeshStandardMaterial({ color: graphiteBlue, roughness: 0.4, metalness: 0.66 }),
      this.showroomAircraftPlacements.length,
    );
    const showroomRings = new THREE.InstancedMesh(
      new THREE.RingGeometry(2.22, 2.31, 48),
      new THREE.MeshBasicMaterial({ color: cyan, transparent: true, opacity: 0.52, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
      this.showroomAircraftPlacements.length,
    );
    this.showroomAircraftPlacements.forEach((placement, index) => {
      transform.position.set(placement.x, 0.09, placement.z); transform.rotation.set(0, 0, 0); transform.scale.set(1, 1, 1); transform.updateMatrix();
      showroomPads.setMatrixAt(index, transform.matrix);
      transform.position.y = 0.188; transform.rotation.x = -Math.PI / 2; transform.updateMatrix();
      showroomRings.setMatrixAt(index, transform.matrix);
    });
    finishInstances(showroomPads); finishInstances(showroomRings);

    const sideFrames = new THREE.InstancedMesh(
      panelGeometry,
      new THREE.MeshStandardMaterial({ color: steel, roughness: 0.4, metalness: 0.65 }),
      8,
    );
    let sideFrameIndex = 0;
    for (const side of [-1, 1]) {
      for (const x of [-11.8, -5.0]) {
        transform.position.set(x, 3.4, side * 15.58); transform.rotation.set(0, 0, 0); transform.scale.set(0.28, 5.8, 0.28); transform.updateMatrix();
        sideFrames.setMatrixAt(sideFrameIndex++, transform.matrix);
      }
      for (const y of [0.62, 6.18]) {
        transform.position.set(-8.4, y, side * 15.58); transform.scale.set(7.08, 0.28, 0.28); transform.updateMatrix();
        sideFrames.setMatrixAt(sideFrameIndex++, transform.matrix);
      }
    }
    finishInstances(sideFrames);

    const verticalServiceLights = new THREE.InstancedMesh(
      panelGeometry,
      new THREE.MeshBasicMaterial({ color: coolWhite, toneMapped: false }),
      8,
    );
    let verticalLightIndex = 0;
    for (const side of [-1, 1]) {
      for (const x of [-13.4, -9.4, -5.4, -1.4]) {
        transform.position.set(x, 3.55, side * 15.48); transform.rotation.set(0, 0, 0); transform.scale.set(0.18, 2.7, 0.07); transform.updateMatrix();
        verticalServiceLights.setMatrixAt(verticalLightIndex++, transform.matrix);
        verticalServiceLights.setColorAt(verticalLightIndex - 1, new THREE.Color(x === -9.4 ? gold : x === -5.4 ? violet : cyan));
      }
    }
    finishInstances(verticalServiceLights);
    const serviceLightHalos = new THREE.InstancedMesh(
      panelGeometry,
      new THREE.MeshBasicMaterial({ color: coolWhite, transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false }),
      8,
    );
    verticalLightIndex = 0;
    for (const side of [-1, 1]) {
      for (const x of [-13.4, -9.4, -5.4, -1.4]) {
        transform.position.set(x, 3.55, side * 15.45); transform.rotation.set(0, 0, 0); transform.scale.set(0.62, 3.15, 0.035); transform.updateMatrix();
        serviceLightHalos.setMatrixAt(verticalLightIndex, transform.matrix);
        serviceLightHalos.setColorAt(verticalLightIndex++, new THREE.Color(x === -9.4 ? gold : x === -5.4 ? violet : cyan));
      }
    }
    finishInstances(serviceLightHalos);
    const rearServiceLights = new THREE.InstancedMesh(
      panelGeometry,
      new THREE.MeshBasicMaterial({ color: coolWhite, toneMapped: false }),
      6,
    );
    [-14.2, -9.15, -4.65, 4.65, 9.15, 14.2].forEach((z, index) => {
      transform.position.set(-15.37, 3.45, z); transform.rotation.set(0, 0, 0); transform.scale.set(0.065, 2.75, 0.09); transform.updateMatrix();
      rearServiceLights.setMatrixAt(index, transform.matrix);
      rearServiceLights.setColorAt(index, new THREE.Color(index % 3 === 0 ? gold : cyan));
    });
    finishInstances(rearServiceLights);

    const lampCanvas = document.createElement('canvas');
    lampCanvas.width = lampCanvas.height = 128;
    const lampContext = lampCanvas.getContext('2d');
    if (lampContext) {
      const lampGlow = lampContext.createRadialGradient(64, 64, 2, 64, 64, 63);
      lampGlow.addColorStop(0, 'rgba(255, 248, 214, 0.95)');
      lampGlow.addColorStop(0.16, 'rgba(255, 179, 71, 0.75)');
      lampGlow.addColorStop(1, 'transparent');
      lampContext.fillStyle = lampGlow; lampContext.fillRect(0, 0, 128, 128);
      const lampTexture = new THREE.CanvasTexture(lampCanvas);
      lampTexture.colorSpace = THREE.SRGBColorSpace; lampTexture.generateMipmaps = false;
      const wallLamps = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(1.5, 1.5),
        new THREE.MeshBasicMaterial({ map: lampTexture, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
        8,
      );
      [-13.4, -9.4, -5.4, -1.4, 1.4, 5.4, 9.4, 13.4].forEach((z, index) => {
        transform.position.set(-15.29, 5.95, z); transform.rotation.set(0, Math.PI / 2, 0); transform.scale.set(1, 1, 1); transform.updateMatrix();
        wallLamps.setMatrixAt(index, transform.matrix);
      });
      finishInstances(wallLamps);
    }

    const ceilingRibs = new THREE.InstancedMesh(
      panelGeometry,
      new THREE.MeshStandardMaterial({ color: steel, roughness: 0.4, metalness: 0.66 }),
      7,
    );
    const ceilingEdges = new THREE.InstancedMesh(panelGeometry, this.garageGuideMaterial, 7);
    for (let index = 0; index < 7; index += 1) {
      const z = -13.5 + index * 4.5;
      transform.position.set(-0.1, 6.93, z); transform.rotation.set(0, 0, 0); transform.scale.set(30.5, 0.24, 0.32); transform.updateMatrix();
      ceilingRibs.setMatrixAt(index, transform.matrix);
      transform.position.y = 6.79; transform.scale.set(26.5, 0.025, 0.055); transform.updateMatrix(); ceilingEdges.setMatrixAt(index, transform.matrix);
      ceilingEdges.setColorAt(index, new THREE.Color(index === 2 || index === 4 ? violet : cyan));
    }
    finishInstances(ceilingRibs); finishInstances(ceilingEdges);
    const ceilingLights = new THREE.InstancedMesh(
      panelGeometry,
      new THREE.MeshBasicMaterial({ color: coolWhite, toneMapped: false }),
      4,
    );
    [-11.2, -7.4, 7.4, 11.2].forEach((z, index) => {
      transform.position.set(-2.2, 6.76, z); transform.rotation.set(0, 0, 0); transform.scale.set(13.8, 0.09, 0.72); transform.updateMatrix(); ceilingLights.setMatrixAt(index, transform.matrix);
      ceilingLights.setColorAt(index, new THREE.Color(index % 2 === 0 ? cyan : gold));
    });
    finishInstances(ceilingLights);
    const ceilingLightCores = new THREE.InstancedMesh(
      panelGeometry,
      new THREE.MeshBasicMaterial({ color: coolWhite, transparent: true, opacity: 0.44, depthWrite: false, toneMapped: false }),
      4,
    );
    [-11.2, -7.4, 7.4, 11.2].forEach((z, index) => {
      transform.position.set(-2.2, 6.735, z); transform.rotation.set(0, 0, 0); transform.scale.set(13.4, 0.025, 0.32); transform.updateMatrix();
      ceilingLightCores.setMatrixAt(index, transform.matrix);
    });
    finishInstances(ceilingLightCores);
    const ceilingLightHalos = new THREE.InstancedMesh(
      panelGeometry,
      new THREE.MeshBasicMaterial({ color: coolWhite, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false }),
      4,
    );
    [-11.2, -7.4, 7.4, 11.2].forEach((z, index) => {
      transform.position.set(-2.2, 6.68, z); transform.rotation.set(0, 0, 0); transform.scale.set(14.4, 0.025, 1.45); transform.updateMatrix();
      ceilingLightHalos.setMatrixAt(index, transform.matrix);
      ceilingLightHalos.setColorAt(index, new THREE.Color(index % 2 === 0 ? cyan : gold));
    });
    finishInstances(ceilingLightHalos);

    const ceilingRingHousing = new THREE.Mesh(
      new THREE.TorusGeometry(5.25, 0.34, 10, 72),
      new THREE.MeshStandardMaterial({ color: steel, roughness: 0.3, metalness: 0.78 }),
    );
    ceilingRingHousing.rotation.x = Math.PI / 2; ceilingRingHousing.position.set(-0.9, 6.45, 0);
    const ceilingRing = new THREE.Mesh(
      new THREE.TorusGeometry(5.25, 0.11, 8, 72),
      new THREE.MeshBasicMaterial({ color: 0x6fe6ff, transparent: true, opacity: 1, toneMapped: false }),
    );
    ceilingRing.rotation.x = Math.PI / 2; ceilingRing.position.set(-0.75, 6.12, 0);
    const ceilingInnerRing = new THREE.Mesh(
      new THREE.TorusGeometry(3.45, 0.09, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0xf6c445, transparent: true, opacity: 1, toneMapped: false }),
    );
    ceilingInnerRing.rotation.x = Math.PI / 2; ceilingInnerRing.position.set(-0.65, 6.08, 0);
    const ringHalo = new THREE.Mesh(
      new THREE.TorusGeometry(5.25, 0.38, 8, 72),
      new THREE.MeshBasicMaterial({ color: cyan, transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false }),
    );
    ringHalo.rotation.x = Math.PI / 2; ringHalo.position.copy(ceilingRing.position); ringHalo.position.y -= 0.03;
    const innerRingHalo = new THREE.Mesh(
      new THREE.TorusGeometry(3.45, 0.32, 8, 64),
      new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false }),
    );
    innerRingHalo.rotation.x = Math.PI / 2; innerRingHalo.position.copy(ceilingInnerRing.position); innerRingHalo.position.y -= 0.03;
    this.showcaseSet.add(ceilingRingHousing, ceilingRing, ceilingInnerRing, ringHalo, innerRingHalo);

    const displayCanvas = document.createElement('canvas');
    displayCanvas.width = 384; displayCanvas.height = 160;
    const displayContext = displayCanvas.getContext('2d');
    if (displayContext) {
      const screen = displayContext.createLinearGradient(0, 0, 384, 160);
      screen.addColorStop(0, '#102B52'); screen.addColorStop(0.58, '#174A7B'); screen.addColorStop(1, '#102B52');
      displayContext.fillStyle = screen; displayContext.fillRect(0, 0, 384, 160);
      displayContext.strokeStyle = '#35D6FF'; displayContext.lineWidth = 3; displayContext.strokeRect(6, 6, 372, 148);
      displayContext.strokeStyle = 'rgba(111, 230, 255, 0.22)'; displayContext.lineWidth = 1;
      for (const y of [32, 80, 128]) { displayContext.beginPath(); displayContext.moveTo(26, y); displayContext.lineTo(358, y); displayContext.stroke(); }
      displayContext.beginPath(); displayContext.ellipse(192, 80, 98, 62, 0, 0, Math.PI * 2); displayContext.stroke();
      displayContext.save(); displayContext.translate(192, 80);
      displayContext.shadowColor = '#35D6FF'; displayContext.shadowBlur = 18;
      displayContext.strokeStyle = '#6FE6FF'; displayContext.lineWidth = 4;
      displayContext.beginPath();
      displayContext.moveTo(0, -55); displayContext.lineTo(10, -13); displayContext.lineTo(75, 10);
      displayContext.lineTo(75, 22); displayContext.lineTo(11, 12); displayContext.lineTo(12, 55);
      displayContext.lineTo(1, 47); displayContext.lineTo(0, 31); displayContext.lineTo(-1, 47);
      displayContext.lineTo(-12, 55); displayContext.lineTo(-11, 12); displayContext.lineTo(-75, 22);
      displayContext.lineTo(-75, 10); displayContext.lineTo(-10, -13); displayContext.closePath(); displayContext.stroke();
      displayContext.restore();
      displayContext.strokeStyle = '#FFB347'; displayContext.lineWidth = 3;
      displayContext.beginPath(); displayContext.moveTo(15, 21); displayContext.lineTo(15, 47);
      displayContext.moveTo(15, 21); displayContext.lineTo(42, 21); displayContext.stroke();
      const displayTexture = new THREE.CanvasTexture(displayCanvas);
      displayTexture.colorSpace = THREE.SRGBColorSpace; displayTexture.generateMipmaps = false;
      const techDisplays = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(4.7, 2.05),
        new THREE.MeshBasicMaterial({ map: displayTexture, transparent: true, opacity: 0.9, side: THREE.DoubleSide, toneMapped: false }),
        4,
      );
      [-10.7, 10.7].forEach((z, index) => {
        transform.position.set(-15.35, 4.7, z); transform.rotation.set(0, Math.PI / 2, 0); transform.scale.set(1, 1, 1); transform.updateMatrix(); techDisplays.setMatrixAt(index, transform.matrix);
      });
      [-1, 1].forEach((side, offset) => {
        transform.position.set(-7.9, 4.35, side * 15.62); transform.rotation.set(0, side === -1 ? 0 : Math.PI, 0); transform.scale.set(1, 1, 1); transform.updateMatrix(); techDisplays.setMatrixAt(offset + 2, transform.matrix);
      });
      finishInstances(techDisplays);
    }

    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512; signCanvas.height = 128;
    const context = signCanvas.getContext('2d');
    if (context) {
      const signGradient = context.createLinearGradient(0, 0, 512, 128);
      signGradient.addColorStop(0, '#0F2746'); signGradient.addColorStop(0.5, '#1E4D7A'); signGradient.addColorStop(1, '#0F2746');
      context.fillStyle = signGradient; context.fillRect(0, 0, 512, 128);
      context.shadowColor = '#35D6FF'; context.shadowBlur = 14;
      context.strokeStyle = '#35D6FF'; context.lineWidth = 5; context.strokeRect(7, 7, 498, 114);
      context.shadowBlur = 0;
      context.fillStyle = '#F6FBFF'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.font = '700 46px Arial, sans-serif'; context.fillText('AIRPORT CHAOS', 256, 64);
      const signTexture = new THREE.CanvasTexture(signCanvas);
      signTexture.colorSpace = THREE.SRGBColorSpace; signTexture.generateMipmaps = false;
      const signBacking = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 1.38, 9.6),
        new THREE.MeshStandardMaterial({ color: steel, roughness: 0.38, metalness: 0.68, emissive: cyan, emissiveIntensity: 0.05 }),
      );
      signBacking.position.set(-15.34, 6.35, 0);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(9.15, 1.12),
        new THREE.MeshBasicMaterial({ map: signTexture, side: THREE.DoubleSide, toneMapped: false }),
      );
      sign.rotation.y = Math.PI / 2; sign.position.set(-15.23, 6.35, 0);
      this.showcaseSet.add(signBacking, sign);
    }

    const goldAccents = new THREE.InstancedMesh(
      panelGeometry,
      new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.55, toneMapped: false }),
      4,
    );
    this.showroomAircraftPlacements.forEach((placement, index) => {
      transform.position.set(placement.x - 1.8, 0.22, placement.z); transform.rotation.set(0, 0, 0); transform.scale.set(0.055, 0.035, 0.7); transform.updateMatrix();
      goldAccents.setMatrixAt(index, transform.matrix);
    });
    finishInstances(goldAccents);
    this.showcaseSet.add(this.backgroundAircraftSet);
  }

  private loadBackgroundAircraft(): void {
    if (this.backgroundAircraftHero === this.selected && this.backgroundAircraftSet.children.length === 4) return;
    this.backgroundAircraftHero = this.selected;
    const generation = ++this.backgroundAircraftGeneration;
    this.backgroundAircraftSet.clear();
    const backgroundTypes = aircraftDisplayOrder.filter((type): type is AircraftType => aircraftDefinitions[type] !== undefined);
    backgroundTypes.forEach((type, index) => {
      const definition = aircraftDefinitions[type];
      const placement = this.showroomAircraftPlacements[index];
      const mount = new THREE.Group();
      const plane = new THREE.Group();
      const fallback = new THREE.Group();
      mount.name = `garage-background-aircraft-${type}`;
      mount.position.set(placement.x, 0, placement.z);
      mount.rotation.y = placement.yaw;
      mount.scale.setScalar(placement.scale);
      mount.visible = false;
      const alternative = cosmeticCatalog.find(item => item.aircraftRestriction === type && item.id !== this.profile.cosmetics?.equipped?.[`livery:${type}`]);
      plane.userData.equippedCosmetics = { [`livery:${type}`]: alternative?.id ?? fallbackLiveryIds[type] };
      plane.add(fallback); mount.add(plane); this.backgroundAircraftSet.add(mount);
      void attachAircraftAsset(
        plane,
        fallback,
        type,
        definition.bodyLength + definition.noseLength,
        definition.wingSpan,
        (model) => {
          if (generation !== this.backgroundAircraftGeneration || !this.backgroundAircraftSet.children.includes(mount)) return;
          model.traverse(object => { object.frustumCulled = true; });
          mount.visible = true;
          mount.updateMatrixWorld(true);
          const bounds = new THREE.Box3().setFromObject(mount);
          mount.position.y += 0.2 - bounds.min.y;
          mount.updateMatrixWorld(true);
        },
      );
    });
  }

  private setShowcaseLighting(active: boolean): void {
    this.showcaseWarmLight.visible = active;
    if (active) {
      this.ambientLight.color.setHex(0xd9edff);
      this.ambientLight.groundColor.setHex(0x1e4d7a);
      this.ambientLight.intensity = 2.05;
      this.keyLight.color.setHex(0xfff1da);
      this.keyLight.intensity = 3.45;
      this.keyLight.position.set(5, 9, 3);
      this.rimLight.color.setHex(0x6fe6ff);
      this.rimLight.intensity = 1.18;
      this.rimLight.position.set(-5, 2.8, 7);
      return;
    }
    this.ambientLight.color.setHex(0xffe5c2);
    this.ambientLight.groundColor.setHex(0x23313a);
    this.ambientLight.intensity = 2.35;
    this.keyLight.color.setHex(0xffd6a0);
    this.keyLight.intensity = 3.05;
    this.keyLight.position.set(-7, 8, 6);
    this.rimLight.color.setHex(0x8ddfff);
    this.rimLight.intensity = 1.15;
    this.rimLight.position.set(7, 3, -5);
  }

  private setShowcaseCamera(): void {
    const horizontal = this.showcaseCameraDistance * Math.cos(this.showcaseCameraPitch);
    this.camera.position.set(
      this.showcaseCameraFocus.x + Math.sin(this.showcaseCameraYaw) * horizontal,
      this.showcaseCameraFocus.y + Math.sin(this.showcaseCameraPitch) * this.showcaseCameraDistance,
      this.showcaseCameraFocus.z + Math.cos(this.showcaseCameraYaw) * horizontal,
    );
    this.camera.lookAt(this.showcaseCameraFocus);
  }

  private forEachVisualCorner(visitor: (corner: THREE.Vector3) => void): void {
    this.previewContent.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      let current: THREE.Object3D | null = object;
      while (current && current !== this.previewContent) {
        if (!current.visible) return;
        current = current.parent;
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (!materials.some(material => material.visible && material.opacity > 0)) return;
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      const bounds = object.geometry.boundingBox;
      if (!bounds || bounds.isEmpty()) return;
      for (let index = 0; index < 8; index += 1) {
        this.previewCorner.set(
          index & 1 ? bounds.max.x : bounds.min.x,
          index & 2 ? bounds.max.y : bounds.min.y,
          index & 4 ? bounds.max.z : bounds.min.z,
        ).applyMatrix4(object.matrixWorld);
        visitor(this.previewCorner);
      }
    });
  }

  private measureVisualBounds(): boolean {
    this.previewBounds.makeEmpty();
    this.forEachVisualCorner(corner => this.previewBounds.expandByPoint(corner));
    return !this.previewBounds.isEmpty();
  }

  private showcaseFitDistance(rotation: number, tilt: number): number {
    if (this.showcaseVisualCorners.length === 0) return this.defaultDistance;
    // Mesh corners are cached when the model is framed; project them as the Hub aircraft orbits.
    const verticalTan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) * 0.5) * 0.97;
    const horizontalTan = verticalTan * this.camera.aspect;
    const cosine = Math.cos(rotation), sine = Math.sin(rotation);
    const tiltCosine = Math.cos(tilt), tiltSine = Math.sin(tilt);
    // The showroom camera stays fixed while the aircraft scales, so include its focus offset.
    const focusDepth = 1 + this.showcaseCameraFocus.dot(this.viewDirection) / this.showcaseCameraDistance;
    const focusRight = this.showcaseCameraFocus.dot(this.viewRight) / this.showcaseCameraDistance;
    const focusUp = this.showcaseCameraFocus.dot(this.viewUp) / this.showcaseCameraDistance;
    let distance = 1;
    for (const corner of this.showcaseVisualCorners) {
      const tiltedX = corner.x * tiltCosine - corner.y * tiltSine;
      const tiltedY = corner.x * tiltSine + corner.y * tiltCosine;
      const rotatedX = tiltedX * cosine + corner.z * sine;
      const rotatedZ = corner.z * cosine - tiltedX * sine;
      const towardCamera = rotatedX * this.viewDirection.x + tiltedY * this.viewDirection.y + rotatedZ * this.viewDirection.z;
      const right = rotatedX * this.viewRight.x + tiltedY * this.viewRight.y + rotatedZ * this.viewRight.z;
      const up = rotatedX * this.viewUp.x + tiltedY * this.viewUp.y + rotatedZ * this.viewUp.z;
      distance = Math.max(distance,
        (right + horizontalTan * towardCamera) / (horizontalTan * focusDepth + focusRight),
        (-right + horizontalTan * towardCamera) / (horizontalTan * focusDepth - focusRight),
        (up + verticalTan * towardCamera) / (verticalTan * focusDepth + focusUp),
        (-up + verticalTan * towardCamera) / (verticalTan * focusDepth - focusUp),
      );
    }
    return distance;
  }

  private framePreview(resetView: boolean): void {
    this.showcaseVisualCorners.length = 0;
    if (resetView) {
      this.targetOrbitYaw = this.showcaseHost ? this.showcaseCameraYaw + this.showcaseAircraftYawOffset : 1.98;
      this.targetOrbitPitch = -0.01;
      this.idleOrbitAnchor = this.targetOrbitYaw;
      this.idleOrbitStartedAt = performance.now();
      this.orbitYaw = this.targetOrbitYaw;
      this.orbitPitch = this.targetOrbitPitch;
    }
    // Normalize only the preview wrapper. Shared gameplay models and their
    // authoritative transforms remain untouched.
    this.aircraftPresentation.position.set(0, 0, 0);
    this.aircraftPresentation.scale.setScalar(1);
    this.preview.rotation.set(0, 0, 0);
    this.previewContent.position.set(0, 0, 0);
    this.aircraftPresentation.updateMatrixWorld(true);
    this.previewContent.updateMatrixWorld(true);
    if (!this.measureVisualBounds()) return;
    this.previewBounds.getCenter(this.previewCenter);
    if (this.showcaseHost) {
      this.previewContent.position.set(-this.previewCenter.x, -this.previewBounds.min.y + 0.035, -this.previewCenter.z);
    } else this.previewContent.position.copy(this.previewCenter).multiplyScalar(-1);
    this.previewContent.updateMatrixWorld(true);
    if (!this.measureVisualBounds()) return;
    if (this.showcaseHost) this.forEachVisualCorner(corner => this.showcaseVisualCorners.push(corner.clone()));
    this.previewBounds.getSize(this.previewSize);
    this.showcaseSet.position.set(0, 0, 0);
    this.showcaseShadow.position.y = 0.032;
    this.showcaseShadowMid.position.y = 0.029;
    this.showcaseShadowOuter.position.y = 0.026;
    this.showcaseShadow.scale.set(Math.max(1.2, this.previewSize.x * 0.42), Math.max(1.4, this.previewSize.z * 0.36), 1);
    this.showcaseShadowMid.scale.copy(this.showcaseShadow.scale).multiplyScalar(1.16);
    this.showcaseShadowOuter.scale.copy(this.showcaseShadow.scale).multiplyScalar(1.34);
    this.previewFocus.set(0, 0, 0);

    const yaw = this.showcaseHost ? this.showcaseCameraYaw : this.targetOrbitYaw;
    const pitch = this.showcaseHost ? this.showcaseCameraPitch : this.targetOrbitPitch;
    const cosPitch = Math.cos(pitch);
    this.viewDirection.set(Math.sin(yaw) * cosPitch, Math.sin(pitch), Math.cos(yaw) * cosPitch).normalize();
    this.viewRight.set(Math.cos(yaw), 0, -Math.sin(yaw)).normalize();
    this.viewUp.crossVectors(this.viewDirection, this.viewRight).normalize();
    const verticalTan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) * 0.5);
    const horizontalTan = verticalTan * this.camera.aspect;
    // Mesh bounds include depth that is not all silhouette at once; 90% of
    // the mathematical frame leaves roughly 10–15% visible-model breathing room.
    const usableFrame = 0.94;
    let framedDistance = 0;
    this.forEachVisualCorner(corner => {
      const towardCamera = corner.dot(this.viewDirection);
      framedDistance = Math.max(
        framedDistance,
        towardCamera + Math.abs(corner.dot(this.viewRight)) / Math.max(0.001, horizontalTan * usableFrame),
        towardCamera + Math.abs(corner.dot(this.viewUp)) / Math.max(0.001, verticalTan * usableFrame),
      );
    });
    const wideShowcase = this.showcaseHost && this.camera.aspect > 2.55;
    const showcaseDistanceScale = this.showcaseHost ? (wideShowcase ? 0.6 : 0.88) : 1;
    this.defaultDistance = Math.max(1, framedDistance * (this.selected === 'fighter' ? 0.9 : 1) * showcaseDistanceScale);
    if (this.showcaseHost) {
      // Fit the full orbit once so the Hub aircraft never changes size as it turns.
      for (const tilt of [-0.28, 0, 0.28]) {
        for (let step = 0; step < 72; step += 1) {
          this.defaultDistance = Math.max(this.defaultDistance, this.showcaseFitDistance(step * Math.PI / 36, tilt));
        }
      }
      // Keep the fixed-orbit framing while using the extra width on landscape screens.
      this.defaultDistance *= this.camera.aspect > 2.55 ? 0.68 : this.camera.aspect > 1.3 ? 0.8 : 0.86;
    }
    if (resetView || !this.userAdjustedZoom) this.targetDistance = this.defaultDistance;
    else this.targetDistance = THREE.MathUtils.clamp(this.targetDistance, this.defaultDistance * 0.38, this.defaultDistance * 2.5);
    if (resetView) this.distance = this.targetDistance;
    if (this.showcaseHost) {
      this.distance = this.targetDistance;
      this.camera.far = 120;
      this.camera.updateProjectionMatrix();
      this.setShowcaseCamera();
      return;
    }

    let minProjectedX = Infinity, maxProjectedX = -Infinity, minProjectedY = Infinity, maxProjectedY = -Infinity;
    this.forEachVisualCorner(corner => {
      const depth = Math.max(0.001, this.defaultDistance - corner.dot(this.viewDirection));
      const projectedX = corner.dot(this.viewRight) / (depth * horizontalTan);
      const projectedY = corner.dot(this.viewUp) / (depth * verticalTan);
      minProjectedX = Math.min(minProjectedX, projectedX); maxProjectedX = Math.max(maxProjectedX, projectedX);
      minProjectedY = Math.min(minProjectedY, projectedY); maxProjectedY = Math.max(maxProjectedY, projectedY);
    });
    // Correct the small perspective shift from long noses/tails so the visual
    // silhouette—not merely its world-space origin—is centered in the canvas.
    this.previewFocus.copy(this.viewRight).multiplyScalar((minProjectedX + maxProjectedX) * 0.5 * this.defaultDistance * horizontalTan)
      .addScaledVector(this.viewUp, (minProjectedY + maxProjectedY) * 0.5 * this.defaultDistance * verticalTan);
    this.camera.far = Math.max(140, this.defaultDistance * 6);
    this.camera.updateProjectionMatrix();
  }

  private resize(): void {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth || 520;
    const height = canvas.clientHeight || 340;
    if (width === this.previewWidth && height === this.previewHeight) return;
    this.previewWidth = width;
    this.previewHeight = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.isPreviewActive()) this.framePreview(false);
  }

  private animate = (): void => {
    if (!this.isPreviewActive() || document.hidden || this.windowBlurred) { this.raf = 0; return; }
    const trialSecond = this.trialRemainingSeconds();
    if (!this.showcaseHost && trialSecond !== this.lastTrialSecond) this.renderDetails();
    if (!this.dragging) {
      if (this.showcaseHost) this.targetOrbitYaw = this.idleOrbitAnchor + (performance.now() - this.idleOrbitStartedAt) * 0.00022;
      else this.targetOrbitYaw += 0.002;
    }
    if (this.showcaseHost) {
      const pulse = Math.sin((performance.now() - this.idleOrbitStartedAt) * 0.0011);
      this.garageGuideMaterial.opacity = 0.32 + pulse * 0.025;
    }
    this.orbitYaw = THREE.MathUtils.lerp(this.orbitYaw, this.targetOrbitYaw, 0.12);
    this.orbitPitch = THREE.MathUtils.lerp(this.orbitPitch, this.targetOrbitPitch, 0.14);
    this.distance = THREE.MathUtils.lerp(this.distance, this.targetDistance, 0.14);
    if (this.showcaseHost) {
      const presentationScale = this.showcaseCameraDistance / Math.max(0.001, this.distance);
      this.aircraftPresentation.scale.setScalar(presentationScale);
      this.preview.rotation.y = this.showcaseCameraYaw - this.orbitYaw;
      this.preview.rotation.z = THREE.MathUtils.clamp((this.orbitPitch - this.showcaseCameraPitch) * 0.35, -0.28, 0.28);
    } else {
      this.aircraftPresentation.scale.setScalar(1);
      this.preview.rotation.set(0, 0, 0);
      const horizontal = this.distance * Math.cos(this.orbitPitch);
      this.camera.position.set(
        this.previewFocus.x + Math.sin(this.orbitYaw) * horizontal,
        this.previewFocus.y + Math.sin(this.orbitPitch) * this.distance,
        this.previewFocus.z + Math.cos(this.orbitYaw) * horizontal,
      );
      this.camera.lookAt(this.previewFocus);
    }
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.animate);
  };

  private isPreviewActive(): boolean { return !this.element.hidden || this.showcaseHost !== undefined; }

  private startAnimation(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (!document.hidden && !this.windowBlurred && this.isPreviewActive()) this.animate();
  }
}
