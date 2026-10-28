import * as THREE from 'three';
import { aircraftDefinitions, aircraftPresentationDimensions } from './aircraft';
import { attachAircraftAsset } from './assets';
import type { StoreItem } from './store-catalog';
import { aircraftPresentationScale } from '../../shared/aircraft-presentation-scale.mjs';

type Preview = { scene: THREE.Scene; aircraft: THREE.Group; size: THREE.Vector3 };
type Card = { art: HTMLElement; item: StoreItem };

const cameraPitch = 0.3;
const detailCameraPitch = 0.18;
const heroYaw = 0.75;
// The models use gameplay dimensions. Blend each card's framing with the
// largest aircraft so compact planes stay legible without looking equally big.
const frameRadius = Math.max(...Object.values(aircraftPresentationDimensions).map(size => Math.hypot(size.span, size.length) * 0.5));

function appearanceId(item: StoreItem): string {
  if (item.kind === 'paint') return item.id;
  return item.aircraftType === 'fighter' ? 'firehawk-inferno'
    : item.aircraftType === 'cargo' ? 'mammoth-sand'
      : item.aircraftType === 'privateJet' ? 'nightowl-sky-blue' : 'bluejay-skybolt';
}

export class StoreAircraftPreviews {
  private readonly renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  private readonly previews = new Map<string, Preview>();
  private cards: Card[] = [];
  private detail?: Card;
  private detailYaw = heroYaw;
  private drag?: { pointerId: number; x: number };
  private frameId = 0;
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
    this.grid.addEventListener('scroll', () => this.start(), { passive: true });
    window.addEventListener('resize', () => this.start());
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
    this.detailYaw = heroYaw;
    art.addEventListener('pointerdown', this.onDetailPointerDown);
    art.addEventListener('pointermove', this.onDetailPointerMove);
    art.addEventListener('pointerup', this.onDetailPointerEnd);
    art.addEventListener('pointercancel', this.onDetailPointerEnd);
    art.prepend(this.renderer.domElement);
    this.camera.position.set(0, Math.sin(detailCameraPitch) * 30, Math.cos(detailCameraPitch) * 30);
    this.camera.lookAt(0, 0, 0);
    this.start();
  }

  hideDetail(): void {
    if (!this.detail) return;
    this.stop();
    const { art } = this.detail;
    art.removeEventListener('pointerdown', this.onDetailPointerDown);
    art.removeEventListener('pointermove', this.onDetailPointerMove);
    art.removeEventListener('pointerup', this.onDetailPointerEnd);
    art.removeEventListener('pointercancel', this.onDetailPointerEnd);
    if (this.drag && art.hasPointerCapture(this.drag.pointerId)) art.releasePointerCapture(this.drag.pointerId);
    this.drag = undefined;
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

  private readonly onDetailPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    this.drag = { pointerId: event.pointerId, x: event.clientX };
    this.detail?.art.setPointerCapture(event.pointerId);
  };

  private readonly onDetailPointerMove = (event: PointerEvent): void => {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const width = this.detail?.art.clientWidth ?? 1;
    this.detailYaw += (event.clientX - this.drag.x) / width * Math.PI;
    this.drag.x = event.clientX;
    this.start();
    event.preventDefault();
  };

  private readonly onDetailPointerEnd = (event: PointerEvent): void => {
    if (event.pointerId !== this.drag?.pointerId) return;
    if (this.detail?.art.hasPointerCapture(event.pointerId)) this.detail.art.releasePointerCapture(event.pointerId);
    this.drag = undefined;
  };

  private getPreview(item: StoreItem): Preview {
    const cached = this.previews.get(item.id);
    if (cached) return cached;
    const definition = aircraftDefinitions[item.aircraftType];
    const dimensions = aircraftPresentationDimensions[item.aircraftType];
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334c70, 1.25));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(-7, 9, 8);
    const rim = new THREE.DirectionalLight(0x8bcaff, 0.9);
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
    fallback.scale.setScalar(aircraftPresentationScale[item.aircraftType]);
    aircraft.add(fallback);
    aircraft.userData.equippedCosmetics = { [`livery:${item.aircraftType}`]: appearanceId(item) };
    scene.add(aircraft);
    const preview = { scene, aircraft, size: new THREE.Box3().setFromObject(aircraft).getSize(new THREE.Vector3()) };
    this.previews.set(item.id, preview);
    void attachAircraftAsset(aircraft, fallback, item.aircraftType, dimensions.length, dimensions.span, () => {
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

  private readonly draw = (): void => {
    this.frameId = 0;
    const host = this.detail?.art ?? this.rail;
    if (document.hidden || !host.getClientRects().length) return;
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
      const pitch = this.detail ? detailCameraPitch : cameraPitch;
      const aircraftRadius = Math.hypot(preview.size.x, preview.size.z) * 0.5;
      const framingRadius = Math.sqrt(aircraftRadius * frameRadius);
      const verticalRadius = preview.size.y * 0.5 * Math.cos(pitch) + aircraftRadius * Math.sin(pitch);
      const halfHeight = Math.max(framingRadius / aspect, verticalRadius) / 0.92;
      this.camera.left = -halfHeight * aspect;
      this.camera.right = halfHeight * aspect;
      this.camera.top = halfHeight;
      this.camera.bottom = -halfHeight;
      this.camera.updateProjectionMatrix();
      preview.aircraft.rotation.y = this.detail ? this.detailYaw : heroYaw;
      this.renderer.render(preview.scene, this.camera);
    }
    this.renderer.setScissorTest(false);
  };
}
