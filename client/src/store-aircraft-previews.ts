import * as THREE from 'three';
import { aircraftDefinitions } from './aircraft';
import { attachAircraftAsset } from './assets';
import type { StoreItem } from './store-catalog';

type Preview = { scene: THREE.Scene; aircraft: THREE.Group; size: THREE.Vector3 };
type Card = { art: HTMLElement; item: StoreItem };

const cameraPitch = 0.2;
const detailCameraPitch = 0.07;
const frameRadius = Math.max(...Object.values(aircraftDefinitions).map(definition =>
  Math.hypot(definition.wingSpan, definition.bodyLength + definition.noseLength) * 0.5));

function appearanceId(item: StoreItem): string {
  if (item.kind === 'paint') return item.id;
  return item.aircraftType === 'fighter' ? 'firehawk-inferno'
    : item.aircraftType === 'cargo' ? 'mammoth-sand'
      : item.aircraftType === 'privateJet' ? 'nightowl-forest' : 'bluejay-skybolt';
}

export class StoreAircraftPreviews {
  private readonly renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  private readonly previews = new Map<string, Preview>();
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private cards: Card[] = [];
  private detail?: Card;
  private frameId = 0;
  private lastFrame = 0;
  private width = 0;
  private height = 0;

  constructor(private readonly rail: HTMLElement, private readonly grid: HTMLElement) {
    this.camera.position.set(0, Math.sin(cameraPitch) * 30, Math.cos(cameraPitch) * 30);
    this.camera.lookAt(0, 0, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setClearColor(0xffffff, 0);
    this.renderer.autoClear = false;
    this.renderer.domElement.className = 'store-preview-canvas';
    this.rail.prepend(this.renderer.domElement);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop();
      else this.start();
    });
  }

  setCards(cards: ReadonlyArray<{ art: HTMLElement; item: StoreItem }>): void {
    this.cards = [...cards];
    if (!cards.length && !this.detail) {
      this.stop();
      this.renderer.setScissorTest(false);
      this.renderer.clear();
      this.renderer.domElement.remove();
      return;
    }
    if (!this.detail && !this.renderer.domElement.isConnected) this.rail.prepend(this.renderer.domElement);
    this.start();
  }

  showDetail(art: HTMLElement, item: StoreItem): void {
    this.detail = { art, item };
    art.prepend(this.renderer.domElement);
    this.camera.position.set(0, Math.sin(detailCameraPitch) * 30, Math.cos(detailCameraPitch) * 30);
    this.camera.lookAt(0, 0, 0);
    this.start();
  }

  hideDetail(): void {
    if (!this.detail) return;
    this.stop();
    this.detail = undefined;
    this.camera.position.set(0, Math.sin(cameraPitch) * 30, Math.cos(cameraPitch) * 30);
    this.camera.lookAt(0, 0, 0);
    if (this.cards.length) this.rail.prepend(this.renderer.domElement);
    else this.renderer.domElement.remove();
    this.start();
  }

  stop(): void {
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
  }

  private getPreview(item: StoreItem): Preview {
    const cached = this.previews.get(item.id);
    if (cached) return cached;
    const definition = aircraftDefinitions[item.aircraftType];
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xa6bfd3, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 3);
    key.position.set(-7, 9, 8);
    const rim = new THREE.DirectionalLight(0x8bcaff, 1.4);
    rim.position.set(7, 3, -6);
    scene.add(key, rim);
    const aircraft = new THREE.Group();
    const fallback = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(definition.bodyRadius, definition.bodyRadius, definition.bodyLength, 12),
      new THREE.MeshStandardMaterial({ color: item.colors[0] }),
    );
    body.rotation.x = Math.PI / 2;
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(definition.wingSpan, 0.12, definition.bodyLength * 0.23),
      new THREE.MeshStandardMaterial({ color: item.colors[1] }),
    );
    fallback.add(body, wing);
    aircraft.add(fallback);
    aircraft.userData.equippedCosmetics = { [`livery:${item.aircraftType}`]: appearanceId(item) };
    scene.add(aircraft);
    const preview = { scene, aircraft, size: new THREE.Vector3(definition.wingSpan, definition.bodyRadius * 2, definition.bodyLength + definition.noseLength) };
    this.previews.set(item.id, preview);
    void attachAircraftAsset(aircraft, fallback, item.aircraftType, definition.bodyLength + definition.noseLength, definition.wingSpan, () => {
      const bounds = new THREE.Box3().setFromObject(aircraft);
      bounds.getSize(preview.size);
      aircraft.position.copy(bounds.getCenter(new THREE.Vector3())).multiplyScalar(-1);
      this.start();
    });
    return preview;
  }

  private start(): void {
    const host = this.detail?.art ?? this.rail;
    if (this.frameId || (!this.detail && !this.cards.length) || document.hidden || !host.getClientRects().length) return;
    this.frameId = requestAnimationFrame(this.draw);
  }

  private readonly draw = (now: number): void => {
    this.frameId = 0;
    const host = this.detail?.art ?? this.rail;
    if (document.hidden || !host.getClientRects().length) return;
    if (now - this.lastFrame < 33 && !this.reducedMotion.matches) { this.start(); return; }
    this.lastFrame = now;
    const railRect = host.getBoundingClientRect();
    const gridRect = (this.detail?.art ?? this.grid).getBoundingClientRect();
    const width = Math.round(railRect.width);
    const height = Math.round(railRect.height);
    if (width < 1 || height < 1) return;
    if (width !== this.width || height !== this.height) {
      this.width = width; this.height = height;
      this.renderer.setSize(width, height, false);
    }
    this.renderer.setScissorTest(false);
    this.renderer.clear();
    this.renderer.setScissorTest(true);
    for (const { art, item } of this.detail ? [this.detail] : this.cards) {
      const rect = art.getBoundingClientRect();
      const left = Math.max(rect.left, gridRect.left, railRect.left);
      const right = Math.min(rect.right, gridRect.right, railRect.right);
      const top = Math.max(rect.top, gridRect.top, railRect.top);
      const bottom = Math.min(rect.bottom, gridRect.bottom, railRect.bottom);
      if (right <= left || bottom <= top) continue;
      const preview = this.getPreview(item);
      this.renderer.setViewport(rect.left - railRect.left, railRect.bottom - rect.bottom, rect.width, rect.height);
      this.renderer.setScissor(left - railRect.left, railRect.bottom - bottom, right - left, bottom - top);
      const aspect = rect.width / rect.height;
      const aircraftRadius = Math.hypot(preview.size.x, preview.size.z) * 0.5;
      const sharedScaleRadius = Math.sqrt(aircraftRadius * frameRadius);
      const pitch = this.detail ? detailCameraPitch : cameraPitch;
      const verticalRadius = preview.size.y * 0.5 * Math.cos(pitch) + aircraftRadius * Math.sin(pitch);
      const halfHeight = Math.max(sharedScaleRadius / aspect, verticalRadius) / 0.88;
      this.camera.left = -halfHeight * aspect;
      this.camera.right = halfHeight * aspect;
      this.camera.top = halfHeight;
      this.camera.bottom = -halfHeight;
      this.camera.updateProjectionMatrix();
      preview.aircraft.rotation.y = this.reducedMotion.matches ? 0.75 : 0.75 - now * 0.00028;
      this.renderer.render(preview.scene, this.camera);
    }
    this.renderer.setScissorTest(false);
    if (!this.reducedMotion.matches) this.start();
  };
}
