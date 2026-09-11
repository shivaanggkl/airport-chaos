import { aircraftRoles, identityText } from './visual-language';
import * as THREE from 'three';
import { aircraftDefinitions, aircraftPitch, garageStats, type AircraftType } from './aircraft';
import { attachAircraftAsset } from './assets';
import { REDSPEAR_PRICE_USD } from '../../shared/aircraft-economy.mjs';

export type GarageProfile = {
  credits: number;
  selectedAircraft: AircraftType;
  unlockedAircraft: AircraftType[];
  economyVersion?: number;
  aircraftEntitlements?: string[];
  testerCodeEnabled?: boolean;
};

export class AircraftGarage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  private readonly preview = new THREE.Group();
  private readonly cards = new Map<AircraftType, HTMLButtonElement>();
  private profile: GarageProfile = { credits: 0, selectedAircraft: 'trainer', unlockedAircraft: ['trainer'] };
  private selected: AircraftType = 'trainer';
  private dragging = false;
  private pointerX = 0;
  private pointerY = 0;
  private distance = 14;
  private targetDistance = 14;
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

  constructor(
    private readonly element: HTMLElement,
    private readonly onEquip: (type: AircraftType) => void,
    private readonly decoratePreview?: (plane: THREE.Group, type: AircraftType) => void,
    private readonly onClose?: () => void,
    private readonly onPurchase?: (type: AircraftType) => void,
    private readonly onRedeemTesterCode?: (code: string) => void,
  ) {
    element.innerHTML = `<section class="garage-card"><header><div><span>HANGAR</span><h1>AIRCRAFT GARAGE</h1></div><div class="garage-balance"><b data-garage-credits>0 Credits</b><button type="button" data-garage-close>Close</button></div></header><div class="garage-layout"><div class="garage-preview"><canvas></canvas><div class="garage-preview-hint">DRAG ROTATE · WHEEL ZOOM</div></div><div class="garage-details"><div data-garage-status></div><h2 data-garage-name></h2><p data-garage-pitch></p><div data-garage-stats class="garage-stats"></div><button type="button" data-garage-equip></button><button type="button" data-garage-redeem-open hidden>Redeem Access Code</button><div class="garage-tester" data-garage-tester hidden><input type="password" autocomplete="off" maxlength="96" placeholder="Access Code" aria-label="Access Code"><button type="button">Redeem</button></div><small data-garage-message></small></div></div><div class="garage-list"></div></section>`;
    const canvas = element.querySelector<HTMLCanvasElement>('canvas')!;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.add(new THREE.HemisphereLight(0xc9edff, 0x14222b, 2.2), this.preview);
    const key = new THREE.DirectionalLight(0xffffff, 2.8); key.position.set(5, 8, 7); this.scene.add(key);
    this.camera.position.set(0, 2.2, this.distance); this.camera.lookAt(0, 0, 0);
    for (const type of Object.keys(aircraftDefinitions) as AircraftType[]) {
      const card = document.createElement('button'); card.type = 'button'; card.className = 'garage-aircraft';
      card.addEventListener('click', () => { this.selected = type; this.testerOpen = false; this.actionMessage = ''; this.renderDetails(); this.loadPreview(); });
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
    canvas.addEventListener('pointerdown', (event) => { this.dragging = true; this.pointerX = event.clientX; this.pointerY = event.clientY; canvas.setPointerCapture(event.pointerId); });
    canvas.addEventListener('pointermove', (event) => {
      if (!this.dragging) return;
      this.targetOrbitYaw -= (event.clientX - this.pointerX) * 0.012;
      this.targetOrbitPitch = THREE.MathUtils.clamp(this.targetOrbitPitch + (event.clientY - this.pointerY) * 0.009, -1.22, 1.22);
      this.pointerX = event.clientX;
      this.pointerY = event.clientY;
    });
    const release = () => { this.dragging = false; }; canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('wheel', (event) => { event.preventDefault(); this.userAdjustedZoom = true; this.targetDistance = THREE.MathUtils.clamp(this.targetDistance + event.deltaY * 0.012, 4, 34); }, { passive: false });
    window.addEventListener('resize', () => this.resize());
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
    this.loadingProfile = false;
    this.actionPending = false;
    this.actionMessage = '';
    this.renderDetails();
  }

  showActionResult(message: string): void {
    this.actionPending = false;
    this.actionMessage = message;
    this.renderDetails();
  }

  private loadPreview(): void {
    this.preview.clear();
    this.userAdjustedZoom = false;
    const definition = aircraftDefinitions[this.selected];
    const plane = new THREE.Group();
    const fallback = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(definition.bodyRadius, definition.bodyRadius, definition.bodyLength, 12), new THREE.MeshStandardMaterial({ color: definition.bodyColor, roughness: 0.45 }));
    body.rotation.x = Math.PI / 2; fallback.add(body); plane.add(fallback); this.preview.add(plane);
    this.framePreview(true);
    attachAircraftAsset(plane, fallback, this.selected, definition.bodyLength + definition.noseLength, definition.wingSpan, () => {
      // A cached GLB can resolve after the player chose another card.  Only
      // reframe if this plane is still the active preview.
      if (this.preview.children.includes(plane)) this.framePreview(false);
    });
    this.decoratePreview?.(plane, this.selected);
  }

  private renderDetails(): void {
    const definition = aircraftDefinitions[this.selected];
    const owned = this.profile.unlockedAircraft.includes(this.selected);
    const price = definition.access === 'credits' ? definition.creditsRequired : undefined;
    const ownership = this.loadingProfile
      ? 'SYNCING PROFILE…'
      : this.selected === this.profile.selectedAircraft ? 'SELECTED' : owned ? 'OWNED' : definition.access === 'premium' ? `Premium Aircraft · ${REDSPEAR_PRICE_USD}` : `${price!.toLocaleString()} ${identityText('credits')}`;
    this.element.querySelector('[data-garage-status]')!.textContent = `${ownership} · ${definition.livery.name}`;
    this.element.querySelector('[data-garage-credits]')!.textContent = `${this.profile.credits.toLocaleString()} ${identityText('credits')}`;
    this.element.querySelector('[data-garage-name]')!.textContent = definition.name;
    this.element.querySelector('[data-garage-pitch]')!.textContent = `${aircraftRoles[this.selected]} · ${aircraftPitch(definition)}`;
    this.element.querySelector('[data-garage-stats]')!.replaceChildren(...garageStats(definition).map(({ label, value }) => {
      const row = document.createElement('div'); row.innerHTML = `<span>${label}</span><b>${'■'.repeat(value)}${'□'.repeat(5 - value)}</b>`; return row;
    }));
    const equip = this.element.querySelector<HTMLButtonElement>('[data-garage-equip]')!;
    const insufficient = price !== undefined && this.profile.credits < price;
    equip.disabled = this.loadingProfile || this.actionPending || this.selected === this.profile.selectedAircraft || (!owned && (definition.access === 'premium' || insufficient));
    equip.textContent = this.selected === this.profile.selectedAircraft ? 'EQUIPPED' : owned ? 'EQUIP AIRCRAFT' : definition.access === 'premium' ? 'Purchase Coming Soon' : insufficient ? `NEED ${(price! - this.profile.credits).toLocaleString()} MORE CREDITS` : `BUY · ${price!.toLocaleString()} CREDITS`;
    this.element.querySelector('[data-garage-message]')!.textContent = this.actionMessage;
    const tester = this.element.querySelector<HTMLElement>('[data-garage-tester]')!;
    const canRedeem = this.selected === 'fighter' && !owned && this.profile.testerCodeEnabled === true;
    this.element.querySelector<HTMLElement>('[data-garage-redeem-open]')!.hidden = !canRedeem || this.testerOpen;
    tester.hidden = !canRedeem || !this.testerOpen;
    for (const [type, card] of this.cards) {
      const data = aircraftDefinitions[type]; const typeOwned = this.profile.unlockedAircraft.includes(type);
      const access = typeOwned ? 'OWNED' : data.access === 'premium' ? `Premium · ${REDSPEAR_PRICE_USD}` : data.access === 'free' ? 'FREE' : `${data.creditsRequired.toLocaleString()} ${identityText('credits')}`;
      card.classList.toggle('selected', type === this.selected); card.textContent = `${data.name} · ${access}`;
    }
  }

  private normalizeProfile(profile: GarageProfile): GarageProfile {
    const types = Object.keys(aircraftDefinitions) as AircraftType[];
    const selectedAircraft = types.includes(profile.selectedAircraft) ? profile.selectedAircraft : 'trainer';
    const unlockedAircraft = Array.isArray(profile.unlockedAircraft)
      ? [...new Set(profile.unlockedAircraft.filter((type): type is AircraftType => types.includes(type)))]
      : [];
    if (!unlockedAircraft.includes('trainer')) unlockedAircraft.unshift('trainer');
    return {
      credits: Number.isFinite(profile.credits) ? Math.max(0, profile.credits) : 0,
      selectedAircraft,
      unlockedAircraft,
      economyVersion: profile.economyVersion,
      aircraftEntitlements: Array.isArray(profile.aircraftEntitlements) ? profile.aircraftEntitlements.filter((value): value is string => typeof value === 'string') : [],
      testerCodeEnabled: profile.testerCodeEnabled === true,
    };
  }

  private framePreview(resetView: boolean): void {
    this.preview.updateMatrixWorld(true);
    this.previewBounds.setFromObject(this.preview);
    if (this.previewBounds.isEmpty()) return;
    this.previewBounds.getSize(this.previewSize);
    this.previewBounds.getCenter(this.previewCenter);
    this.previewFocus.copy(this.previewCenter);
    const horizontalHalfFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov) * 0.5) * this.camera.aspect);
    const widthDistance = this.previewSize.x / Math.max(0.001, 2 * Math.tan(horizontalHalfFov) * 0.72);
    const heightDistance = this.previewSize.y / Math.max(0.001, 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) * 0.5) * 0.78);
    const framedDistance = THREE.MathUtils.clamp(Math.max(widthDistance, heightDistance, this.previewSize.z * 0.72), 4.5, 30);
    if (resetView || !this.userAdjustedZoom) this.targetDistance = framedDistance;
    if (resetView) {
      this.targetOrbitYaw = 0.58;
      this.targetOrbitPitch = 0.2;
      this.orbitYaw = this.targetOrbitYaw;
      this.orbitPitch = this.targetOrbitPitch;
      this.distance = this.targetDistance;
    }
  }

  private resize(): void {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth || 520;
    const height = canvas.clientHeight || 340;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (!this.element.hidden) this.framePreview(false);
  }

  private animate = (): void => {
    if (this.element.hidden) return;
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
