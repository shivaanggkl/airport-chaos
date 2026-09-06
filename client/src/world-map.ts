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

type MapPlayer = { id: string; x: number; z: number };
type MapTarget = { x: number; z: number; label?: string };
type StaticMapData = { roads?: number[]; water?: number[][] };

export type WorldMapState = {
  position: { x: number; z: number };
  forward: { x: number; z: number };
  players: readonly MapPlayer[];
  waypoint: MapTarget | null;
  contractTarget: MapTarget | null;
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
  private staticLoading = false;
  private staticLoaded = false;

  constructor(
    private readonly element: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly recenterButton: HTMLButtonElement,
    private readonly layer: WorldMapLayer,
    private readonly airports: readonly MapAirport[],
    private readonly onWaypoint: (position: MapTarget | null) => void,
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
    // Start close enough that the city can be panned immediately instead of fitting
    // an oversized viewport across the entire bounds.
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.max(960 / width, 680 / height) * 1.45));
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
    this.clampCenter();
    this.drawStatic();
    this.draw();
  }

  private click(event: PointerEvent): void {
    const click = this.eventToCanvas(event);
    if (this.state?.waypoint) {
      const waypoint = this.worldToScreen(this.state.waypoint.x, this.state.waypoint.z);
      if (Math.hypot(click.x - waypoint.x, click.y - waypoint.y) <= CLICK_DISTANCE) {
        this.onWaypoint(null);
        return;
      }
    }
    const position = this.screenToWorld(click.x, click.y);
    this.onWaypoint({ ...position, label: 'WAYPOINT' });
  }

  private resizeCanvas(): void {
    const width = Math.max(560, Math.floor(this.canvas.clientWidth || 960));
    const height = Math.max(360, Math.floor(this.canvas.clientHeight || 640));
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
    context.fillStyle = '#164a65';
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
    for (let index = 0; index < roads.length; index += 5) {
      const roadClass = roads[index];
      const a = toCache(roads[index + 1], roads[index + 2]);
      const b = toCache(roads[index + 3], roads[index + 4]);
      context.strokeStyle = roadClass >= 4 ? '#b9a977' : roadClass >= 3 ? '#7a7d78' : '#4e5555';
      context.lineWidth = roadClass >= 4 ? 3 : roadClass >= 3 ? 2 : 1;
      context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
    }
  }

  private drawStatic(): void {
    this.resizeCanvas();
    const context = this.staticContext;
    const { width, height } = this.canvas;
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#07121a';
    context.fillRect(0, 0, width, height);
    const gridMeters = this.scale > 0.035 ? 2_000 : this.scale > 0.014 ? 5_000 : 10_000;
    context.strokeStyle = 'rgba(131, 177, 187, 0.11)';
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
    for (const airport of this.airports) this.drawAirport(context, airport);
    context.font = '600 11px ui-monospace, monospace';
    context.textAlign = 'center';
    context.fillStyle = '#8db8c6';
    for (const landmark of this.layer.landmarks ?? []) {
      const point = this.worldToScreen(landmark.x, landmark.z);
      context.fillText(landmark.label, point.x, point.y - 7);
    }
  }

  private drawAirport(context: CanvasRenderingContext2D, airport: MapAirport): void {
    const c = Math.cos(airport.heading);
    const s = Math.sin(airport.heading);
    const halfLength = airport.runwayLength / 2;
    const a = this.worldToScreen(airport.x - s * halfLength, airport.z + c * halfLength);
    const b = this.worldToScreen(airport.x + s * halfLength, airport.z - c * halfLength);
    context.strokeStyle = '#8dd1df';
    context.lineWidth = Math.max(2, airport.runwayWidth * this.scale);
    context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
    const center = this.worldToScreen(airport.x, airport.z);
    context.fillStyle = '#d1e5e7'; context.font = '700 10px ui-monospace, monospace'; context.textAlign = 'center';
    context.fillText(airport.name.toUpperCase(), center.x, center.y - 9);
  }

  private draw(): void {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.drawImage(this.staticCanvas, 0, 0);
    if (!this.state) return;
    if (this.state.contractTarget) this.drawTarget(this.state.contractTarget, '#b57cff', 'CONTRACT');
    if (this.state.waypoint) this.drawTarget(this.state.waypoint, '#ffd865', 'WAYPOINT');
    for (const player of this.state.players) {
      const point = this.worldToScreen(player.x, player.z);
      this.context.fillStyle = '#ff6d70'; this.context.beginPath(); this.context.arc(point.x, point.y, 4, 0, Math.PI * 2); this.context.fill();
    }
    const point = this.worldToScreen(this.state.position.x, this.state.position.z);
    const rotation = Math.atan2(this.state.forward.x, -this.state.forward.z);
    this.context.save(); this.context.translate(point.x, point.y); this.context.rotate(rotation);
    this.context.fillStyle = '#ecfbff'; this.context.beginPath(); this.context.moveTo(0, -8); this.context.lineTo(-5, 6); this.context.lineTo(5, 6); this.context.closePath(); this.context.fill(); this.context.restore();
  }

  private drawTarget(target: MapTarget, color: string, label: string): void {
    const point = this.worldToScreen(target.x, target.z);
    this.context.strokeStyle = color; this.context.lineWidth = 2;
    this.context.beginPath(); this.context.arc(point.x, point.y, 8, 0, Math.PI * 2); this.context.stroke();
    this.context.fillStyle = color; this.context.font = '700 10px ui-monospace, monospace'; this.context.textAlign = 'center';
    this.context.fillText(target.label ?? label, point.x, point.y - 12);
  }
}
