import * as THREE from 'three';
import { aircraftDefinitions, aircraftPitch, garageStats, type AircraftType } from './aircraft';
import { attachAircraftAsset } from './assets';

export type GarageProfile = { credits: number; selectedAircraft: AircraftType; unlockedAircraft: AircraftType[] };

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
  private distance = 18;
  private raf = 0;

  constructor(
    private readonly element: HTMLElement,
    private readonly onEquip: (type: AircraftType) => void,
    private readonly decoratePreview?: (plane: THREE.Group, type: AircraftType) => void,
  ) {
    element.innerHTML = `<section class="garage-card"><header><div><span>HANGAR</span><h1>AIRCRAFT GARAGE</h1></div><button type="button" data-garage-close>Close</button></header><div class="garage-layout"><div class="garage-preview"><canvas></canvas><div class="garage-preview-hint">DRAG ROTATE · WHEEL ZOOM</div></div><div class="garage-details"><div data-garage-status></div><h2 data-garage-name></h2><p data-garage-pitch></p><div data-garage-stats class="garage-stats"></div><button type="button" data-garage-equip></button></div></div><div class="garage-list"></div></section>`;
    const canvas = element.querySelector<HTMLCanvasElement>('canvas')!;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.add(new THREE.HemisphereLight(0xc9edff, 0x14222b, 2.2), this.preview);
    const key = new THREE.DirectionalLight(0xffffff, 2.8); key.position.set(5, 8, 7); this.scene.add(key);
    this.camera.position.set(0, 2.2, this.distance); this.camera.lookAt(0, 0, 0);
    for (const type of Object.keys(aircraftDefinitions) as AircraftType[]) {
      const card = document.createElement('button'); card.type = 'button'; card.className = 'garage-aircraft';
      card.addEventListener('click', () => { this.selected = type; this.renderDetails(); this.loadPreview(); });
      this.cards.set(type, card); element.querySelector('.garage-list')!.append(card);
    }
    element.querySelector('[data-garage-close]')!.addEventListener('click', () => this.close());
    element.querySelector('[data-garage-equip]')!.addEventListener('click', () => {
      if (!this.profile.unlockedAircraft.includes(this.selected)) return;
      this.onEquip(this.selected);
    });
    canvas.addEventListener('pointerdown', (event) => { this.dragging = true; this.pointerX = event.clientX; canvas.setPointerCapture(event.pointerId); });
    canvas.addEventListener('pointermove', (event) => { if (!this.dragging) return; this.preview.rotation.y += (event.clientX - this.pointerX) * 0.012; this.pointerX = event.clientX; });
    const release = () => { this.dragging = false; }; canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('wheel', (event) => { event.preventDefault(); this.distance = THREE.MathUtils.clamp(this.distance + event.deltaY * 0.012, 9, 30); }, { passive: false });
    window.addEventListener('resize', () => this.resize());
  }

  open(profile: GarageProfile): void { this.profile = profile; this.selected = profile.selectedAircraft; this.element.hidden = false; this.renderDetails(); this.loadPreview(); this.resize(); this.animate(); }
  close(): void { this.element.hidden = true; cancelAnimationFrame(this.raf); }
  isOpen(): boolean { return !this.element.hidden; }

  private loadPreview(): void {
    this.preview.clear();
    const definition = aircraftDefinitions[this.selected];
    const plane = new THREE.Group();
    const fallback = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(definition.bodyRadius, definition.bodyRadius, definition.bodyLength, 12), new THREE.MeshStandardMaterial({ color: definition.bodyColor, roughness: 0.45 }));
    body.rotation.x = Math.PI / 2; fallback.add(body); plane.add(fallback); this.preview.add(plane);
    attachAircraftAsset(plane, fallback, this.selected, definition.bodyLength + definition.noseLength, definition.wingSpan);
    this.decoratePreview?.(plane, this.selected);
  }

  private renderDetails(): void {
    const definition = aircraftDefinitions[this.selected];
    const owned = this.profile.unlockedAircraft.includes(this.selected);
    this.element.querySelector('[data-garage-status]')!.textContent = this.selected === this.profile.selectedAircraft ? 'SELECTED' : owned ? 'OWNED' : `LOCKED · ${definition.creditsRequired.toLocaleString()} CREDITS`;
    this.element.querySelector('[data-garage-name]')!.textContent = definition.name;
    this.element.querySelector('[data-garage-pitch]')!.textContent = aircraftPitch(definition);
    this.element.querySelector('[data-garage-stats]')!.replaceChildren(...garageStats(definition).map(({ label, value }) => {
      const row = document.createElement('div'); row.innerHTML = `<span>${label}</span><b>${'■'.repeat(value)}${'□'.repeat(5 - value)}</b>`; return row;
    }));
    const equip = this.element.querySelector<HTMLButtonElement>('[data-garage-equip]')!;
    equip.disabled = !owned || this.selected === this.profile.selectedAircraft;
    equip.textContent = this.selected === this.profile.selectedAircraft ? 'EQUIPPED' : owned ? 'EQUIP AIRCRAFT' : `NEED ${Math.max(0, definition.creditsRequired - this.profile.credits)} CREDITS`;
    for (const [type, card] of this.cards) { const data = aircraftDefinitions[type]; card.classList.toggle('selected', type === this.selected); card.textContent = `${data.name} · ${this.profile.unlockedAircraft.includes(type) ? 'OWNED' : `${data.creditsRequired} CR`}`; }
  }

  private resize(): void { const canvas = this.renderer.domElement; const width = canvas.clientWidth || 520; const height = canvas.clientHeight || 340; this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); }
  private animate = (): void => { if (this.element.hidden) return; if (!this.dragging) this.preview.rotation.y += 0.004; this.camera.position.set(0, 2.2, this.distance); this.camera.lookAt(0, 0, 0); this.renderer.render(this.scene, this.camera); this.raf = requestAnimationFrame(this.animate); };
}
