import { applyAircraftCosmetics } from './aircraft-cosmetics';
import { aircraftRoles, identityText } from './visual-language';
import * as THREE from 'three';
import { aircraftDefinitions, aircraftDisplayName, aircraftPitch, garageStats, type AircraftType } from './aircraft';
import { attachAircraftAsset } from './assets';
import { firehawkProduct, aircraftDisplayOrder } from '../../shared/aircraft-economy.mjs';
import { legalConfig } from '../../shared/legal-config.mjs';
import { cosmeticCatalog, defaultCosmeticIds, fallbackLiveryIds, includedCosmeticIds } from '../../shared/cosmetics.mjs';

export type GarageProfile = {
  credits: number;
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
  private readonly preview = new THREE.Group();
  private readonly previewContent = new THREE.Group();
  private readonly cards = new Map<AircraftType, HTMLButtonElement>();
  private profile: GarageProfile = { credits: 0, selectedAircraft: 'trainer', unlockedAircraft: ['trainer'] };
  private selected: AircraftType = 'trainer';
  private previewCosmetic?: string;
  private pendingTimer = 0;
  private dragging = false;
  private pointerX = 0;
  private pointerY = 0;
  private distance = 14;
  private targetDistance = 14;
  private defaultDistance = 14;
  private orbitYaw = 0.58;
  private targetOrbitYaw = 0.58;
  private orbitPitch = 0.2;
  private targetOrbitPitch = 0.2;
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
  private previewWidth = 0;
  private previewHeight = 0;
  private lastTrialSecond = -1;

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
    private readonly onRestorePurchase?: (code: string) => void,
    private readonly onPurchaseCosmetic?: (id: string) => void,
    private readonly onEquipCosmetic?: (id: string) => void,
  ) {
    element.innerHTML = `<section class="garage-card"><header><div><span>HANGAR</span><h1>AIRCRAFT GARAGE</h1></div><div class="garage-balance"><b data-garage-credits>0 Credits</b><button type="button" data-garage-close>Close</button></div></header><div class="garage-layout"><div class="garage-preview"><canvas></canvas><div class="garage-preview-hint">DRAG ROTATE · WHEEL ZOOM</div></div><div class="garage-details" data-garage-details><div data-garage-status></div><h2 data-garage-name></h2><p data-garage-pitch></p><div data-garage-stats class="garage-stats"></div><div class="garage-premium" data-garage-premium hidden><div class="garage-trial-row"><p class="garage-trial-summary" data-garage-trial-summary>Trial: 5 minutes</p><button type="button" data-garage-restore>RESTORE PURCHASE</button></div><button type="button" data-garage-trial>START FREE TRIAL</button><button type="button" data-garage-premium-buy>UNLOCK FOREVER — ${firehawkProduct.displayPrice}</button><p class="garage-purchase-disclosure">Sold by ${legalConfig.legalEntityName} · By purchasing, you agree to <a href="${legalConfig.policyRoutes.terms}" target="_blank" rel="noopener noreferrer">Terms</a> · <a href="${legalConfig.policyRoutes.refund}" target="_blank" rel="noopener noreferrer">Refund Policy</a> · <a href="${legalConfig.policyRoutes.privacy}" target="_blank" rel="noopener noreferrer">Privacy Notice</a></p></div><button type="button" data-garage-equip></button><button type="button" data-garage-redeem-open hidden>Redeem Access Code</button><div class="garage-tester" data-garage-tester hidden><input type="password" autocomplete="off" maxlength="96" placeholder="Access Code" aria-label="Access Code"><button type="button">Redeem</button></div><small data-garage-message></small></div></div><div class="garage-list"></div></section>`;
    const cosmetics = document.createElement('section'); cosmetics.className = 'garage-cosmetics'; cosmetics.dataset.garageCosmetics = '';
    element.querySelector('.garage-card')!.append(cosmetics);
    const canvas = element.querySelector<HTMLCanvasElement>('canvas')!;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.preview.add(this.previewContent);
    this.scene.add(new THREE.HemisphereLight(0xc9edff, 0x14222b, 2.2), this.preview);
    const key = new THREE.DirectionalLight(0xffffff, 2.8); key.position.set(5, 8, 7); this.scene.add(key);
    this.camera.position.set(0, 2.2, this.distance); this.camera.lookAt(0, 0, 0);
    for (const type of aircraftDisplayOrder) {
      const card = document.createElement('button'); card.type = 'button'; card.className = 'garage-aircraft';
      card.addEventListener('click', () => { this.selected = type; this.previewCosmetic = undefined; this.testerOpen = false; this.actionMessage = ''; this.renderDetails(); this.loadPreview(); if (type === 'fighter' && !this.profile.unlockedAircraft.includes('fighter')) this.onFighterModalViewed?.(); });
      this.cards.set(type, card); element.querySelector('.garage-list')!.append(card);
    }
    element.querySelector('[data-garage-close]')!.addEventListener('click', () => this.close());
    element.querySelector('[data-garage-equip]')!.addEventListener('click', () => {
      if (this.actionPending) return;
      if (this.profile.unlockedAircraft.includes(this.selected)) this.onEquip(this.selected);
      else if (aircraftDefinitions[this.selected].access === 'credits') {
        this.actionPending = true; this.actionMessage = 'PURCHASE PENDING…'; this.renderDetails(); this.onPurchase?.(this.selected);
      }
    });
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
    element.querySelector('[data-garage-premium-buy]')!.addEventListener('click', () => { this.onPremiumPurchase?.(); this.showActionResult('PURCHASE COMING SOON'); });
    element.querySelector('[data-garage-restore]')!.addEventListener('click', () => {
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
    const release = () => { this.dragging = false; }; canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.userAdjustedZoom = true;
      this.targetDistance = THREE.MathUtils.clamp(this.targetDistance + event.deltaY * 0.012, this.defaultDistance * 0.38, this.defaultDistance * 2.5);
    }, { passive: false });
    window.addEventListener('resize', () => this.resize());
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
  }

  open(profile: GarageProfile, loadingProfile = false): void {
    // Profile hydration may reopen the already-visible Garage. Keep exactly
    // one preview loop so a late profile response cannot create competing
    // render callbacks or make the first open appear unreliable.
    cancelAnimationFrame(this.raf);
    this.profile = this.normalizeProfile(profile);
    this.loadingProfile = loadingProfile;
    this.actionPending = false;
    this.actionMessage = '';
    this.testerOpen = false;
    this.selected = this.profile.selectedAircraft;
    this.previewCosmetic = undefined;
    this.element.hidden = false;
    this.resize();
    this.renderDetails();
    this.loadPreview();
    this.animate();
  }
  close(): void {
    if (this.element.hidden) return;
    this.element.hidden = true;
    cancelAnimationFrame(this.raf);
    this.onClose?.();
  }
  isOpen(): boolean { return !this.element.hidden; }

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

  private loadPreview(): void {
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
    attachAircraftAsset(plane, fallback, this.selected, definition.bodyLength + definition.noseLength, definition.wingSpan, () => {
      // A cached GLB can resolve after the player chose another card.  Only
      // reframe if this plane is still the active preview.
      if (this.previewContent.children.includes(plane)) this.framePreview(false);
    });
    this.decoratePreview?.(plane, this.selected);
    this.paintPreview();
  }

  private renderDetails(): void {
    const definition = aircraftDefinitions[this.selected];
    const owned = this.isPermanentlyOwned(this.selected);
    const trialUsable = this.selected === 'fighter' && this.isTrialUsable();
    const price = definition.access === 'credits' ? definition.creditsRequired : undefined;
    const ownership = this.loadingProfile
      ? 'SYNCING PROFILE…'
      : trialUsable ? this.trialStatusText()
      : owned ? (this.selected === this.profile.selectedAircraft ? 'OWNED · SELECTED' : 'OWNED')
      : this.selected === this.profile.selectedAircraft ? 'SELECTED' : definition.access === 'premium' ? `Premium Aircraft · ${firehawkProduct.displayPrice}` : `${price!.toLocaleString()} ${identityText('credits')}`;
    const equippedAppearance = cosmeticCatalog.find(item => item.id === this.profile.cosmetics?.equipped?.[`livery:${this.selected}`] && item.aircraftRestriction === this.selected)?.displayName ?? definition.livery.name;
    const compactPremiumIdentity = this.selected === 'fighter' && !owned && !trialUsable;
    this.element.querySelector('[data-garage-status]')!.textContent = compactPremiumIdentity
      ? `Premium Fighter • ${firehawkProduct.displayPrice}`
      : `${ownership} · ${equippedAppearance}`;
    this.element.querySelector('[data-garage-details]')!.classList.toggle('is-firehawk', this.selected === 'fighter');
    this.element.querySelector('.garage-card')!.classList.toggle('is-firehawk', this.selected === 'fighter');
    this.element.querySelector('[data-garage-credits]')!.textContent = `${this.profile.credits.toLocaleString()} ${identityText('credits')}`;
    this.element.querySelector('[data-garage-name]')!.textContent = aircraftDisplayName(this.selected);
    this.element.querySelector('[data-garage-pitch]')!.textContent = this.selected === 'fighter'
      ? 'Fastest and most agile combat aircraft in Airport Chaos.'
      : this.selected === 'cargo'
      ? `${aircraftRoles[this.selected]} · ${aircraftPitch(definition)} · MAMMOTH CARGO BONUS: +40% Credits on eligible cargo missions`
      : `${aircraftRoles[this.selected]} · ${aircraftPitch(definition)}`;
    this.element.querySelector('[data-garage-stats]')!.replaceChildren(...garageStats(definition).map(({ label, value }) => {
      const row = document.createElement('div'); row.innerHTML = `<span>${label}</span><b>${'■'.repeat(value)}${'□'.repeat(5 - value)}</b>`; return row;
    }));
    const equip = this.element.querySelector<HTMLButtonElement>('[data-garage-equip]')!;
    const insufficient = price !== undefined && this.profile.credits < price;
    equip.disabled = this.loadingProfile || this.actionPending || this.selected === this.profile.selectedAircraft || (!owned && (definition.access === 'premium' || insufficient));
    equip.textContent = this.selected === this.profile.selectedAircraft ? 'EQUIPPED' : owned ? (this.selected === 'fighter' ? 'SELECT AIRCRAFT' : 'EQUIP AIRCRAFT') : definition.access === 'premium' ? 'Purchase Coming Soon' : insufficient ? `NEED ${(price! - this.profile.credits).toLocaleString()} MORE CREDITS` : `BUY · ${price!.toLocaleString()} CREDITS`;
    equip.hidden = definition.access === 'premium' && !owned;
    this.element.querySelector('[data-garage-message]')!.textContent = this.actionMessage;
    const tester = this.element.querySelector<HTMLElement>('[data-garage-tester]')!;
    const premium = this.element.querySelector<HTMLElement>('[data-garage-premium]')!;
    premium.hidden = this.selected !== 'fighter' || owned;
    const trialState = this.profile.fighterTrial?.status ?? 'available';
    const remaining = this.trialRemainingSeconds();
    this.element.querySelector<HTMLElement>('[data-garage-trial-summary]')!.textContent = trialState === 'available'
      ? 'Trial: 5 minutes'
      : trialState === 'pending'
        ? 'Trial: ready on next flight'
        : trialState === 'active'
          ? `Trial: ${String(Math.floor(Math.max(0, remaining) / 60)).padStart(2, '0')}:${String(Math.max(0, remaining) % 60).padStart(2, '0')} remaining`
          : 'Trial: already used';
    this.element.querySelector<HTMLElement>('[data-garage-trial]')!.hidden = this.profile.fighterTrial?.status !== 'available';
    const canRedeem = this.selected === 'fighter' && !owned && this.profile.testerCodeEnabled === true;
    this.element.querySelector<HTMLElement>('[data-garage-redeem-open]')!.hidden = !canRedeem || this.testerOpen;
    tester.hidden = !canRedeem || !this.testerOpen;
    for (const [type, card] of this.cards) {
      const data = aircraftDefinitions[type]; const typeOwned = this.isPermanentlyOwned(type);
      const access = type === 'fighter' && this.isTrialUsable() ? this.trialStatusText() : typeOwned ? 'OWNED' : data.access === 'premium' ? `Premium · ${firehawkProduct.displayPrice}` : data.access === 'free' ? 'FREE' : `${data.creditsRequired.toLocaleString()} ${identityText('credits')}`;
      card.classList.toggle('selected', type === this.selected); card.textContent = `${aircraftDisplayName(type)} · ${access}`;
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
    root.replaceChildren();
    const heading = document.createElement('h2'); heading.textContent = 'AIRCRAFT COSMETICS';
    const help = document.createElement('p'); help.textContent = 'Select an appearance to preview it.';
    const list = document.createElement('div'); list.className = 'garage-cosmetic-list';
    root.append(heading, help, list);
    const owned = new Set(this.profile.cosmetics?.ownedIds ?? []);
    const ownsAircraft = this.isPermanentlyOwned(this.selected);
    for (const item of cosmeticCatalog.filter(entry => entry.aircraftRestriction === this.selected)) {
      const slot = `livery:${this.selected}`;
      const equipped = this.profile.cosmetics?.equipped?.[slot] === item.id;
      const selected = this.previewCosmetic === item.id;
      const access = item.unlockType === 'included' ? (equipped ? 'INCLUDED · EQUIPPED' : 'INCLUDED WITH FIREHAWK')
        : equipped ? 'EQUIPPED' : owned.has(item.id) ? 'OWNED'
        : !ownsAircraft && this.selected !== 'trainer' ? `OWN AIRCRAFT · UNLOCK — ${item.creditPrice.toLocaleString()} CREDITS`
        : `UNLOCK — ${item.creditPrice.toLocaleString()} CREDITS`;
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
      button.onclick = () => { this.previewCosmetic = item.id; this.paintPreview(); this.renderCosmetics(); };
      card.append(button);
      if (selected && !equipped && item.unlockType !== 'included') {
        const action = document.createElement('button'); action.type = 'button'; action.className = 'garage-cosmetic-action';
        action.textContent = owned.has(item.id) ? 'EQUIP' : `UNLOCK — ${item.creditPrice.toLocaleString()} CREDITS`;
        action.disabled = this.loadingProfile || this.actionPending || (!ownsAircraft && this.selected !== 'trainer') || (!owned.has(item.id) && this.profile.credits < item.creditPrice);
        action.onclick = () => {
          this.actionPending = true; this.actionMessage = 'WAITING FOR SERVER…'; this.renderDetails();
          window.clearTimeout(this.pendingTimer);
          this.pendingTimer = window.setTimeout(() => this.showActionResult('SERVER DID NOT RESPOND — REOPEN GARAGE TO SYNC'), 8000);
          if (owned.has(item.id)) this.onEquipCosmetic?.(item.id); else this.onPurchaseCosmetic?.(item.id);
        };
        card.append(action);
      }
      list.append(card);
    }
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
      else if ((type === 'trainer' || permanentlyOwned(type)) && ownedIds.has(fallbackLiveryIds[type])) equipped[slot] = fallbackLiveryIds[type];
    }
    return {
      credits: Number.isFinite(profile.credits) ? Math.max(0, profile.credits) : 0,
      selectedAircraft,
      unlockedAircraft,
      economyVersion: profile.economyVersion,
      aircraftEntitlements: Array.isArray(profile.aircraftEntitlements) ? profile.aircraftEntitlements.filter((value): value is string => typeof value === 'string') : [],
      testerCodeEnabled: profile.testerCodeEnabled === true,
      fighterTrial: profile.fighterTrial ?? { status: 'available' },
      cosmetics: { ownedIds: [...ownedIds], equipped },
    };
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

  private framePreview(resetView: boolean): void {
    if (resetView) {
      this.targetOrbitYaw = 0.58;
      this.targetOrbitPitch = 0.2;
      this.orbitYaw = this.targetOrbitYaw;
      this.orbitPitch = this.targetOrbitPitch;
    }
    // Center inconsistent asset origins inside the Garage wrapper only. The
    // shared gameplay model and its transforms remain untouched.
    this.previewContent.position.set(0, 0, 0);
    this.previewContent.updateMatrixWorld(true);
    if (!this.measureVisualBounds()) return;
    this.previewBounds.getCenter(this.previewCenter);
    this.previewContent.position.copy(this.previewCenter).multiplyScalar(-1);
    this.previewContent.updateMatrixWorld(true);
    if (!this.measureVisualBounds()) return;
    this.previewBounds.getSize(this.previewSize);
    this.previewFocus.set(0, 0, 0);

    const yaw = this.targetOrbitYaw;
    const pitch = this.targetOrbitPitch;
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
    this.defaultDistance = Math.max(1, framedDistance * (this.selected === 'fighter' ? 0.9 : 1));
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
    this.camera.far = Math.max(100, this.defaultDistance * 4);
    this.camera.updateProjectionMatrix();
    if (resetView || !this.userAdjustedZoom) this.targetDistance = this.defaultDistance;
    else this.targetDistance = THREE.MathUtils.clamp(this.targetDistance, this.defaultDistance * 0.38, this.defaultDistance * 2.5);
    if (resetView) {
      this.distance = this.targetDistance;
    }
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
    if (!this.element.hidden) this.framePreview(false);
  }

  private animate = (): void => {
    if (this.element.hidden) return;
    const trialSecond = this.trialRemainingSeconds();
    if (trialSecond !== this.lastTrialSecond) this.renderDetails();
    if (!this.dragging) this.targetOrbitYaw += 0.002;
    this.orbitYaw = THREE.MathUtils.lerp(this.orbitYaw, this.targetOrbitYaw, 0.12);
    this.orbitPitch = THREE.MathUtils.lerp(this.orbitPitch, this.targetOrbitPitch, 0.14);
    this.distance = THREE.MathUtils.lerp(this.distance, this.targetDistance, 0.14);
    const horizontal = this.distance * Math.cos(this.orbitPitch);
    this.camera.position.set(
      this.previewFocus.x + Math.sin(this.orbitYaw) * horizontal,
      this.previewFocus.y + Math.sin(this.orbitPitch) * this.distance,
      this.previewFocus.z + Math.cos(this.orbitYaw) * horizontal,
    );
    this.camera.lookAt(this.previewFocus);
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.animate);
  };
}
