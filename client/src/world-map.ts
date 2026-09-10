import { visualLanguage, identityText } from './visual-language';
export type WorldMapBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

export type WorldMapLandmark = {
  id: string;
  label: string;
  x: number;
  z: number;
};

export type WorldMapLayer = {
  bounds: WorldMapBounds;
  staticUrl?: string;
  landmarks?: readonly WorldMapLandmark[];
};

type MapAirport = {
  id: string;
  name: string;
  x: number;
  z: number;
  heading: number;
  runwayWidth: number;
  runwayLength: number;
};

type MapPlayer = { id: string; x: number; z: number; king?: boolean; heatLevel?: number; isBot?: boolean };
type MapTarget = { x: number; z: number; label?: string };
export type MapChallenge = { id: string; x: number; z: number; label: string; active: boolean };
export type MapEvent = { id: string; x: number; z: number; label: string; mostWanted?: boolean; lifecycle: 'available' | 'active' | 'completed' | 'failed' | 'cooldown' };
export type MapDiscovery = { id: string; label: string; x: number; z: number; discovered: boolean; secret: boolean };
export type MapDiscoveryProgress = { cityName: string; discovered: number; total: number; percent: number };
export type MapRepair = { id: string; x: number; z: number };
export type MapTerritory = {
  id: string;
  label: string;
  bounds: WorldMapBounds;
  color?: string;
  controllerName?: string;
  captureProgress: number;
  contested: boolean;
};
type StaticMapData = { roads?: number[]; water?: number[][]; land?: number[][] };

export type WorldMapState = {
  position: { x: number; z: number };
  forward: { x: number; z: number };
  king?: boolean;
  players: readonly MapPlayer[];
  waypoint: MapTarget | null;
  contractTarget: MapTarget | null;
  challenges?: readonly MapChallenge[];
  events?: readonly MapEvent[];
  discoveries?: readonly MapDiscovery[];
  discoveryProgress?: MapDiscoveryProgress;
  territories?: readonly MapTerritory[];
  repairs?: readonly MapRepair[];
};

const CLICK_DISTANCE = 18;
const MIN_SCALE = 0.01;
const MAX_SCALE = 0.11;

export class WorldMap {
  private readonly context: CanvasRenderingContext2D;
  private readonly staticCanvas = document.createElement('canvas');
  private readonly staticContext: CanvasRenderingContext2D;
  private readonly geographyCanvas = document.createElement('canvas');
  private readonly geographyContext: CanvasRenderingContext2D;
  private centerX: number;
  private centerZ: number;
  private scale: number;
  private dragging = false;
  private moved = false;
  private dragX = 0;
  private dragY = 0;
  private state: WorldMapState | undefined;
  private staticData: StaticMapData = {};
  private openState = false;
  private openedBefore = false;
  private staticLoading = false;
  private staticLoaded = false;
  private readonly roadPaths = new Map<number, Path2D>();
  private labelCount = 0;
  private readonly labels: Array<{ x: number; y: number; w: number; h: number }> = [];

  constructor(
    private readonly element: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly recenterButton: HTMLButtonElement,
    private readonly layer: WorldMapLayer,
    private readonly airports: readonly MapAirport[],
    private readonly onWaypoint: (position: MapTarget | null) => void,
    private readonly onChallenge?: (challengeId: string) => void,
  ) {
    this.context = canvas.getContext('2d')!;
    this.staticContext = this.staticCanvas.getContext('2d')!;
    this.geographyContext = this.geographyCanvas.getContext('2d')!;
    this.geographyCanvas.width = 0;
    this.geographyCanvas.height = 0;
    this.centerX = (layer.bounds.minX + layer.bounds.maxX) / 2;
    this.centerZ = (layer.bounds.minZ + layer.bounds.maxZ) / 2;
    this.scale = this.defaultScale();
    this.resizeCanvas();
    this.bindEvents();
    this.drawStatic();
  }

  isOpen(): boolean {
    return this.openState;
  }

  toggle(): void {
    this.setOpen(!this.openState);
  }

  setOpen(open: boolean): void {
    this.openState = open;
    this.element.classList.toggle('hidden', !open);
    if (open) {
      this.resizeCanvas();
      if (!this.openedBefore) this.scale = this.defaultScale();
      this.openedBefore = true;
      if (this.state) {
        const you = this.worldToScreen(this.state.position.x, this.state.position.z);
        if (you.x < 35 || you.x > this.canvas.width - 35 || you.y < 35 || you.y > this.canvas.height - 45) {
          this.centerX = this.state.position.x;
          this.centerZ = this.state.position.z;
        }
      }
      this.clampCenter();
      this.drawStatic();
      this.draw();
      if (this.layer.staticUrl && !this.staticLoading && !this.staticLoaded) void this.loadStaticLayer(this.layer.staticUrl);
    }
  }

  update(state: WorldMapState): void {
    this.state = state;
    if (this.openState) this.draw();
  }

  resize(): void {
    this.resizeCanvas();
    this.drawStatic();
    if (this.openState) this.draw();
  }

  private defaultScale(): number {
    const width = this.layer.bounds.maxX - this.layer.bounds.minX;
    const height = this.layer.bounds.maxZ - this.layer.bounds.minZ;
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min((this.canvas.clientWidth || 960) / width, (this.canvas.clientHeight || 640) / height) * 0.92));
  }

  private async loadStaticLayer(url: string): Promise<void> {
    this.staticLoading = true;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Map layer failed: ${response.status}`);
      this.staticData = await response.json() as StaticMapData;
    } catch {
      this.staticData = {};
    }
    this.staticLoading = false;
    this.staticLoaded = true;
    this.buildGeographyCache();
    this.drawStatic();
    if (this.openState) this.draw();
  }

  private bindEvents(): void {
    this.recenterButton.addEventListener('click', () => this.recenter());
    this.canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      this.dragging = true;
      this.moved = false;
      this.dragX = event.clientX;
      this.dragY = event.clientY;
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.dragging) return;
      event.preventDefault();
      const dx = event.clientX - this.dragX;
      const dy = event.clientY - this.dragY;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.moved = true;
      this.centerX -= dx / this.scale;
      this.centerZ -= dy / this.scale;
      this.dragX = event.clientX;
      this.dragY = event.clientY;
      this.clampCenter();
      this.drawStatic();
      this.draw();
    });
    this.canvas.addEventListener('pointerup', (event) => {
      if (!this.dragging) return;
      event.preventDefault();
      this.dragging = false;
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
      if (!this.moved) this.click(event);
    });
    this.canvas.addEventListener('pointercancel', () => { this.dragging = false; });
    this.canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const pointer = this.eventToCanvas(event);
      const before = this.screenToWorld(pointer.x, pointer.y);
      this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * Math.exp(-event.deltaY * 0.0015)));
      const after = this.screenToWorld(pointer.x, pointer.y);
      this.centerX += before.x - after.x;
      this.centerZ += before.z - after.z;
      this.clampCenter();
      this.drawStatic();
      this.draw();
    }, { passive: false });
  }

  private recenter(): void {
    if (!this.state) return;
    this.centerX = this.state.position.x;
    this.centerZ = this.state.position.z;
    // Airport spawns near a city edge must still be centered, even when some
    // neutral map background lies beyond the data boundary.
    this.drawStatic();
    this.draw();
  }

  private click(event: PointerEvent): void {
    const click = this.eventToCanvas(event);
    for (const challenge of this.state?.challenges ?? []) {
      const marker = this.worldToScreen(challenge.x, challenge.z);
      if (Math.hypot(click.x - marker.x, click.y - marker.y) <= CLICK_DISTANCE) {
        this.onChallenge?.(challenge.id);
        return;
      }
    }
    if (this.state?.waypoint) {
      const waypoint = this.worldToScreen(this.state.waypoint.x, this.state.waypoint.z);
      if (Math.hypot(click.x - waypoint.x, click.y - waypoint.y) <= CLICK_DISTANCE) {
        this.onWaypoint(null);
        return;
      }
    }
    const position = this.screenToWorld(click.x, click.y);
    for (const destination of this.airports) {
      const marker = this.worldToScreen(destination.x, destination.z);
      if (Math.hypot(click.x - marker.x, click.y - marker.y) <= CLICK_DISTANCE) {
        this.onWaypoint({ x: destination.x, z: destination.z, label: destination.name });
        return;
      }
    }
    for (const destination of this.layer.landmarks ?? []) {
      const marker = this.worldToScreen(destination.x, destination.z);
      if (Math.hypot(click.x - marker.x, click.y - marker.y) <= CLICK_DISTANCE) {
        this.onWaypoint({ x: destination.x, z: destination.z, label: destination.label });
        return;
      }
    }
    this.onWaypoint({ ...position, label: 'WAYPOINT' });
  }

  private resizeCanvas(): void {
    const width = Math.max(240, Math.floor(this.canvas.clientWidth || 960));
    const height = Math.max(240, Math.floor(this.canvas.clientHeight || 640));
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.staticCanvas.width = width;
    this.staticCanvas.height = height;
  }

  private eventToCanvas(event: MouseEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * this.canvas.width / rect.width,
      y: (event.clientY - rect.top) * this.canvas.height / rect.height,
    };
  }

  private clampCenter(): void {
    const halfWidth = this.canvas.width / this.scale / 2;
    const halfHeight = this.canvas.height / this.scale / 2;
    const minCenterX = this.layer.bounds.minX + halfWidth;
    const maxCenterX = this.layer.bounds.maxX - halfWidth;
    const minCenterZ = this.layer.bounds.minZ + halfHeight;
    const maxCenterZ = this.layer.bounds.maxZ - halfHeight;
    this.centerX = minCenterX <= maxCenterX
      ? Math.min(maxCenterX, Math.max(minCenterX, this.centerX))
      : (this.layer.bounds.minX + this.layer.bounds.maxX) / 2;
    this.centerZ = minCenterZ <= maxCenterZ
      ? Math.min(maxCenterZ, Math.max(minCenterZ, this.centerZ))
      : (this.layer.bounds.minZ + this.layer.bounds.maxZ) / 2;
  }

  private worldToScreen(x: number, z: number): { x: number; y: number } {
    return {
      x: this.canvas.width / 2 + (x - this.centerX) * this.scale,
      y: this.canvas.height / 2 + (z - this.centerZ) * this.scale,
    };
  }

  private screenToWorld(x: number, y: number): { x: number; z: number } {
    return {
      x: this.centerX + (x - this.canvas.width / 2) / this.scale,
      z: this.centerZ + (y - this.canvas.height / 2) / this.scale,
    };
  }

  private buildGeographyCache(): void {
    const worldWidth = this.layer.bounds.maxX - this.layer.bounds.minX;
    const worldHeight = this.layer.bounds.maxZ - this.layer.bounds.minZ;
    const maxDimension = 2048;
    this.geographyCanvas.width = Math.round(maxDimension * worldWidth / Math.max(worldWidth, worldHeight));
    this.geographyCanvas.height = Math.round(maxDimension * worldHeight / Math.max(worldWidth, worldHeight));
    const context = this.geographyContext;
    context.clearRect(0, 0, this.geographyCanvas.width, this.geographyCanvas.height);
    const toCache = (x: number, z: number) => ({
      x: (x - this.layer.bounds.minX) / worldWidth * this.geographyCanvas.width,
      y: (z - this.layer.bounds.minZ) / worldHeight * this.geographyCanvas.height,
    });
    for (const polygon of this.staticData.land ?? []) {
      context.fillStyle = polygon[0] === 1 ? '#17372e' : '#203c32';
      context.beginPath();
      for (let i = 1; i < polygon.length; i += 2) {
        const p = toCache(polygon[i], polygon[i + 1]);
        if (i === 1) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y);
      }
      context.closePath(); context.fill();
    }
    context.fillStyle = '#176185';
    for (const polygon of this.staticData.water ?? []) {
      if (polygon.length < 6) continue;
      context.beginPath();
      for (let index = 0; index < polygon.length; index += 2) {
        const point = toCache(polygon[index], polygon[index + 1]);
        if (index === 0) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y);
      }
      context.closePath();
      context.fill();
    }
    const roads = this.staticData.roads ?? [];
    this.roadPaths.clear();
    for (let index = 0; index < roads.length; index += 5) {
      const roadClass = roads[index];
      let path = this.roadPaths.get(roadClass);
      if (!path) { path = new Path2D(); this.roadPaths.set(roadClass, path); }
      path.moveTo(roads[index + 1], roads[index + 2]); path.lineTo(roads[index + 3], roads[index + 4]);
    }
  }

  private drawStatic(): void {
    this.resizeCanvas();
    const context = this.staticContext;
    const { width, height } = this.canvas;
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#101e29';
    context.fillRect(0, 0, width, height);
    const gridMeters = this.scale > 0.035 ? 2_000 : this.scale > 0.014 ? 5_000 : 10_000;
    context.strokeStyle = 'rgba(131, 177, 187, 0.045)';
    context.lineWidth = 1;
    const min = this.screenToWorld(0, 0);
    const max = this.screenToWorld(width, height);
    for (let x = Math.floor(min.x / gridMeters) * gridMeters; x <= max.x; x += gridMeters) {
      const screen = this.worldToScreen(x, 0); context.beginPath(); context.moveTo(screen.x, 0); context.lineTo(screen.x, height); context.stroke();
    }
    for (let z = Math.floor(min.z / gridMeters) * gridMeters; z <= max.z; z += gridMeters) {
      const screen = this.worldToScreen(0, z); context.beginPath(); context.moveTo(0, screen.y); context.lineTo(width, screen.y); context.stroke();
    }
    if (this.geographyCanvas.width > 0) {
      const worldWidth = this.layer.bounds.maxX - this.layer.bounds.minX;
      const worldHeight = this.layer.bounds.maxZ - this.layer.bounds.minZ;
      const viewWidth = width / this.scale;
      const viewHeight = height / this.scale;
      const viewMinX = this.centerX - viewWidth / 2;
      const viewMinZ = this.centerZ - viewHeight / 2;
      const sourceX = (viewMinX - this.layer.bounds.minX) / worldWidth * this.geographyCanvas.width;
      const sourceY = (viewMinZ - this.layer.bounds.minZ) / worldHeight * this.geographyCanvas.height;
      const sourceWidth = viewWidth / worldWidth * this.geographyCanvas.width;
      const sourceHeight = viewHeight / worldHeight * this.geographyCanvas.height;
      context.drawImage(this.geographyCanvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
    }
    context.save();
    context.translate(width / 2 - this.centerX * this.scale, height / 2 - this.centerZ * this.scale);
    context.scale(this.scale, this.scale);
    // Class 5 is railway, not a larger highway. Draw detail only as zoom allows.
    for (const classification of [0, 1, 2, 3, 5, 4]) {
      if (classification < 2 && this.scale < 0.08 || classification === 2 && this.scale < 0.045 || classification === 3 && this.scale < 0.02 || classification === 5 && this.scale < 0.065) continue;
      const path = this.roadPaths.get(classification);
      if (!path) continue;
      context.strokeStyle = classification === 4 ? '#b8ad86' : classification === 3 ? '#6f8692' : '#344d5d';
      context.lineWidth = (classification === 4 ? 1.7 : classification === 3 ? 1.1 : 0.7) / this.scale;
      context.stroke(path);
    }
    context.restore();
    for (const airport of this.airports) this.drawAirport(context, airport);
  }

  private drawAirport(context: CanvasRenderingContext2D, airport: MapAirport): void {
    const c = Math.cos(airport.heading);
    const s = Math.sin(airport.heading);
    const halfLength = airport.runwayLength / 2;
    const a = this.worldToScreen(airport.x - s * halfLength, airport.z + c * halfLength);
    const b = this.worldToScreen(airport.x + s * halfLength, airport.z - c * halfLength);
    context.strokeStyle = visualLanguage.airport.color;
    context.lineWidth = Math.max(2, airport.runwayWidth * this.scale);
    context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
    const center = this.worldToScreen(airport.x, airport.z);
    context.fillStyle = visualLanguage.airport.color; context.font = '700 10px ui-monospace, monospace'; context.textAlign = 'center';
    context.fillStyle = '#dff9ff';
    context.fillRect(center.x - 2, center.y - 2, 4, 4);
  }

  private label(text: string, x: number, y: number, color: string, size = 10): void {
    const context = this.context;
    context.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`;
    const width = context.measureText(text).width + 10;
    if (x < width / 2 || x + width / 2 > this.canvas.width || y < 16 || y > this.canvas.height - 30 || this.labelCount >= 96) return;
    for (let i = 0; i < this.labelCount; i++) {
      const r = this.labels[i];
      if (Math.abs(x - r.x) < (width + r.w) / 2 && Math.abs(y - r.y) < (17 + r.h) / 2) return;
    }
    const rect = this.labels[this.labelCount] ?? (this.labels[this.labelCount] = { x: 0, y: 0, w: 0, h: 17 });
    rect.x = x; rect.y = y; rect.w = width; rect.h = 17; this.labelCount++;
    context.fillStyle = 'rgba(7,18,28,0.85)'; context.fillRect(x - width / 2, y - 12, width, 17);
    context.textAlign = 'center'; context.fillStyle = color; context.fillText(text, x, y);
  }

  private draw(): void {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.drawImage(this.staticCanvas, 0, 0);
    if (!this.state) return;
    const point = this.worldToScreen(this.state.position.x, this.state.position.z);
    // Reserve the player arrow/name before placing lower-priority labels.
    const reserved = this.labels[0] ?? (this.labels[0] = { x: 0, y: 0, w: 58, h: 60 });
    reserved.x = point.x; reserved.y = point.y + 12; reserved.w = 58; reserved.h = 60;
    this.labelCount = 1;
    for (const territory of this.state.territories ?? []) this.drawTerritory(territory);
    if (this.state.contractTarget) this.drawTarget(this.state.contractTarget, '#b57cff', 'CONTRACT');
    if (this.state.waypoint) this.drawTarget(this.state.waypoint, visualLanguage.waypoint.color, 'WAYPOINT');
    for (const challenge of this.state.challenges ?? []) this.drawChallenge(challenge);
    for (const event of this.state.events ?? []) this.drawEvent(event);
    for (const airport of this.airports) {
      const p = this.worldToScreen(airport.x, airport.z);
      this.label(`${visualLanguage.airport.icon} ${airport.name}`, p.x, p.y - 12, visualLanguage.airport.color, 12);
    }
    for (const landmark of this.layer.landmarks ?? []) {
      const p = this.worldToScreen(landmark.x, landmark.z);
      this.label(landmark.label, p.x, p.y - 7, '#c7d8df', 12);
    }
    for (const repair of this.state.repairs ?? []) this.drawRepair(repair);
    if (this.scale >= 0.035) for (const discovery of this.state.discoveries ?? []) this.drawDiscovery(discovery);
    for (const player of this.state.players) {
      const point = this.worldToScreen(player.x, player.z);
      this.context.fillStyle = visualLanguage[player.isBot ? 'ai' : 'player'].color;
      this.context.beginPath();
      if (player.isBot) {
        this.context.moveTo(point.x, point.y - 4); this.context.lineTo(point.x + 4, point.y); this.context.lineTo(point.x, point.y + 4); this.context.lineTo(point.x - 4, point.y);
      } else {
        this.context.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
      }
      this.context.fill();
      if ((player.heatLevel ?? 0) >= 4) {
        this.context.fillStyle = visualLanguage.heat.color; this.context.font = '11px sans-serif'; this.context.fillText(visualLanguage.heat.icon, point.x + 7, point.y);
      }
      if (player.king) { this.context.fillStyle = '#ffd96d'; this.context.font = '700 11px ui-monospace, monospace'; this.context.textAlign = 'center'; this.context.fillText('♛', point.x, point.y - 7); }
    }
    const rotation = Math.atan2(this.state.forward.x, -this.state.forward.z);
    const pulse = 0.42 + Math.sin(performance.now() * 0.006) * 0.18;
    this.context.save();
    this.context.strokeStyle = `rgba(142, 236, 255, ${pulse})`; this.context.lineWidth = 2;
    this.context.beginPath(); this.context.arc(point.x, point.y, 17, 0, Math.PI * 2); this.context.stroke();
    this.context.translate(point.x, point.y); this.context.rotate(rotation);
    this.context.fillStyle = 'rgba(112, 222, 244, 0.2)'; this.context.beginPath(); this.context.moveTo(0, -31); this.context.lineTo(-11, -4); this.context.lineTo(11, -4); this.context.closePath(); this.context.fill();
    this.context.fillStyle = '#f5fdff'; this.context.strokeStyle = '#17697d'; this.context.lineWidth = 1.5;
    this.context.beginPath(); this.context.moveTo(0, -13); this.context.lineTo(-8, 9); this.context.lineTo(0, 5); this.context.lineTo(8, 9); this.context.closePath(); this.context.fill(); this.context.stroke();
    this.context.restore();
    this.context.fillStyle = '#07121c'; this.context.fillRect(point.x - 20, point.y + 18, 40, 17);
    this.context.fillStyle = visualLanguage.you.color; this.context.font = '900 12px ui-sans-serif, system-ui, sans-serif'; this.context.textAlign = 'center'; this.context.fillText('YOU', point.x, point.y + 31);
    if (this.state.king) { this.context.fillStyle = '#ffd96d'; this.context.font = '700 11px ui-monospace, monospace'; this.context.textAlign = 'center'; this.context.fillText('♛', point.x, point.y - 21); }
    if (this.state.discoveryProgress) this.drawDiscoveryProgress(this.state.discoveryProgress);
  }

  private drawTerritory(territory: MapTerritory): void {
    const a = this.worldToScreen(territory.bounds.minX, territory.bounds.minZ);
    const b = this.worldToScreen(territory.bounds.maxX, territory.bounds.maxZ);
    const width = b.x - a.x;
    const height = b.y - a.y;
    const color = territory.contested ? '#ffb34f' : territory.color ?? '#75a9bd';
    this.context.save();
    this.context.fillStyle = territory.contested ? 'rgba(255, 179, 79, 0.09)' : `${color}09`;
    this.context.fillRect(a.x, a.y, width, height);
    this.context.strokeStyle = territory.contested ? '#ffbd66' : `${color}55`;
    this.context.lineWidth = territory.contested ? 2 : 1;
    this.context.strokeRect(a.x, a.y, width, height);
    const centerX = a.x + width / 2;
    const centerY = a.y + height / 2;
    this.context.fillStyle = territory.contested ? '#ffd08b' : '#c5e4eb';
    this.context.font = '700 9px ui-monospace, monospace';
    this.context.textAlign = 'center';
    if (territory.contested) this.label(`${territory.label} · CONTESTED`, centerX, centerY - 2, '#ffd08b');
    if (territory.controllerName) {
      this.context.font = '600 8px ui-monospace, monospace';
      if (this.scale > 0.05) this.label(`Held by ${territory.controllerName}`, centerX, centerY + 9, '#c5e4eb');
    } else if (territory.captureProgress > 0) {
      this.context.font = '600 8px ui-monospace, monospace';
      this.context.fillText(`CAPTURE ${Math.round(territory.captureProgress)}%`, centerX, centerY + 9);
    }
    this.context.restore();
  }

  private drawDiscoveryProgress(progress: MapDiscoveryProgress): void {
    const label = `${progress.cityName.toUpperCase()} DISCOVERY: ${progress.discovered} / ${progress.total} — ${progress.percent}%`;
    this.context.fillStyle = 'rgba(4, 14, 21, 0.76)';
    this.context.fillRect(10, this.canvas.height - 28, Math.min(this.canvas.width - 20, 250), 18);
    this.context.fillStyle = '#b9e5df';
    this.context.font = '700 10px ui-monospace, monospace';
    this.context.textAlign = 'left';
    this.context.fillText(label, 16, this.canvas.height - 15);
  }

  private drawDiscovery(discovery: MapDiscovery): void {
    const point = this.worldToScreen(discovery.x, discovery.z);
    if (!discovery.discovered) {
      this.context.strokeStyle = 'rgba(184, 209, 219, 0.68)';
      this.context.lineWidth = 1.5;
      this.context.beginPath();
      this.context.arc(point.x, point.y, 6, 0, Math.PI * 2);
      this.context.stroke();
      this.context.fillStyle = '#d3e2e7';
      this.context.font = '700 10px ui-monospace, monospace';
      this.context.textAlign = 'center';
      this.context.fillText('?', point.x, point.y + 3.5);
      return;
    }
    this.context.save();
    this.context.translate(point.x, point.y);
    this.context.rotate(Math.PI / 4);
    this.context.fillStyle = discovery.secret ? '#d9a4ff' : '#77d8d2';
    this.context.fillRect(-3.5, -3.5, 7, 7);
    this.context.restore();
    this.context.fillStyle = discovery.secret ? '#ebcfff' : '#a9f1e9';
    this.context.font = '700 9px ui-monospace, monospace';
    this.context.textAlign = 'center';
    this.label(discovery.label, point.x, point.y - 8, visualLanguage.discovery.color);
  }

  private drawTarget(target: MapTarget, color: string, label: string): void {
    const point = this.worldToScreen(target.x, target.z);
    this.context.strokeStyle = color; this.context.lineWidth = 2;
    this.context.beginPath(); this.context.arc(point.x, point.y, 8, 0, Math.PI * 2); this.context.stroke();
    this.context.fillStyle = color; this.context.font = '700 10px ui-monospace, monospace'; this.context.textAlign = 'center';
    this.label(`${label === 'WAYPOINT' ? visualLanguage.waypoint.icon + ' ' : ''}${target.label ?? label}`, point.x, point.y - 14, color, 12);
  }

  private drawChallenge(challenge: MapChallenge): void {
    const point = this.worldToScreen(challenge.x, challenge.z);
    const color = visualLanguage.challenge.color;
    this.context.strokeStyle = color;
    this.context.lineWidth = challenge.active ? 2.5 : 1.5;
    this.context.beginPath();
    this.context.moveTo(point.x, point.y - 7); this.context.lineTo(point.x + 6, point.y + 5);
    this.context.lineTo(point.x - 6, point.y + 5); this.context.closePath(); this.context.stroke();
    this.context.fillStyle = color;
    this.context.font = '700 9px ui-monospace, monospace';
    this.context.textAlign = 'center';
    if (challenge.active || this.scale > 0.04) this.label(challenge.label, point.x, point.y - 11, color);
  }

  private drawEvent(event: MapEvent): void {
    if (event.lifecycle !== 'available' && event.lifecycle !== 'active') return;
    const point = this.worldToScreen(event.x, event.z);
    const color = visualLanguage[event.mostWanted ? 'wanted' : 'event'].color;
    this.context.strokeStyle = color;
    this.context.lineWidth = 2;
    this.context.beginPath(); this.context.arc(point.x, point.y, 8, 0, Math.PI * 2); this.context.stroke();
    this.context.fillStyle = color;
    this.context.font = '700 9px ui-monospace, monospace';
    this.context.textAlign = 'center';
    this.label(`${visualLanguage[event.mostWanted ? 'wanted' : 'event'].icon} ${event.label}`, point.x, point.y - 12, color);
  }

  private drawRepair(repair: MapRepair): void {
    const point = this.worldToScreen(repair.x, repair.z);
    this.context.save();
    this.context.translate(point.x, point.y);
    this.context.rotate(Math.PI / 4);
    this.context.strokeStyle = visualLanguage.repair.color;
    this.context.lineWidth = 2;
    this.context.strokeRect(-4, -4, 8, 8);
    this.context.restore();
    this.context.fillStyle = visualLanguage.repair.color;
    this.context.font = '700 8px ui-monospace, monospace';
    this.context.textAlign = 'center';
    if (this.scale > 0.04) this.label(identityText('repair'), point.x, point.y - 8, visualLanguage.repair.color);
  }
}
