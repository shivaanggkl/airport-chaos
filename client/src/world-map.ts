import { visualLanguage, identityText, territoryOwnershipColors } from './visual-language';
import { registerUiBackLayer, uiBackPriority } from './ui-back-navigation';
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
  sourceScale?: number;
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

const giantMapOutline = [[-.18,-.25],[-1,.1],[-1,.3],[-.18,.18],[-.18,.65],[-.5,.9],[-.5,1],[0,.8],[.5,1],[.5,.9],[.18,.65],[.18,.18],[1,.3],[1,.1],[.18,-.25]] as const;

export type MapPlayer = { id: string; label?:string; heading?:number; x: number; z: number; king?: boolean; heatLevel?: number; isBot?: boolean; ownershipAccent?: string; missionTarget?: boolean };
type MapTarget = { x: number; z: number; label?: string };
export type MapMissionSummary = { name: string; objective: string; progress: string; compactProgress: string; credits: number; score: number };
export type MapRosterEntry = { id: string; name: string; status: string; isLocal?: boolean };
export type MapChallenge = { id: string; x: number; z: number; label: string; active: boolean };
export type MapEvent = { id: string; x: number; z: number; label: string; mostWanted?: boolean; missionTarget?: boolean; lifecycle: 'available' | 'active' | 'completed' | 'failed' | 'cooldown' };
export type MapDiscovery = { id: string; label: string; x: number; z: number; discovered: boolean; secret: boolean };
export type MapDiscoveryProgress = { cityName: string; discovered: number; total: number; percent: number };
export type MapRepair = { id: string; x: number; z: number; kind?: string; cooldownUntil?: number };
export type MapTerritory = {
  id: string;
  label: string;
  bounds: WorldMapBounds;
  color?: string;
  missionTarget?: boolean;
  controllerName?: string;
  status: string;
  captureProgress: number;
  contested: boolean;
};
export type MapObjective = {id:string;kind:'target'|'giant'|'monster'|'gate'|'coins'|'airport'|'health';label:string;x:number;z:number;heading?:number};
type StaticMapData = { roads?: number[]; water?: number[][]; land?: number[][] };

export type WorldMapState = {
  position: { x: number; z: number };
  forward: { x: number; z: number };
  king?: boolean;
  players: readonly MapPlayer[];
  objectives?:readonly MapObjective[];
  roster: readonly MapRosterEntry[];
  mission?: MapMissionSummary;
  waypoint: MapTarget | null;
  contractTarget: MapTarget | null;
  challenges?: readonly MapChallenge[];
  events?: readonly MapEvent[];
  discoveries?: readonly MapDiscovery[];
  discoveryProgress?: MapDiscoveryProgress;
  territories?: readonly MapTerritory[];
  repairs?: readonly MapRepair[];
};

// Map-only colors keep the light cartography readable without changing the gameplay HUD.
export const worldMapIdentity = {
  ...visualLanguage,
  you: {...visualLanguage.you,color:'#087fc4'},
  player: {...visualLanguage.player,icon:'▲',color:'#cf3548'},
  ai: {...visualLanguage.ai,icon:'▲',color:'#1489b6'},
  airport: {...visualLanguage.airport,color:'#1375b9'},
  territory: {...visualLanguage.territory,color:'#5798c8'},
  waypoint: {...visualLanguage.waypoint,color:'#15994f'},
  mission: {...visualLanguage.mission,color:'#ce233d'},
  event: {...visualLanguage.event,color:'#ac760e'},
  challenge: {...visualLanguage.challenge,color:'#087fa4'},
  discovery: {...visualLanguage.discovery,color:'#18796c'},
  repair: {...visualLanguage.repair,color:'#1b8e67'},
  target:{icon:'🎯',color:'#ce233d'}, giant:{icon:'✈',color:'#b62e48'}, monster:{icon:'👹',color:'#9b3268'},
  gate:{icon:'◎',color:'#a87b08'}, coins:{icon:'🪙',color:'#a87b08'},

};

const mapLegend = [
  {kind:'you',label:'You'}, {kind:'player',label:'Player'}, {kind:'ai',label:'AI pilot'},
  {kind:'mission',label:'Mission'}, {kind:'target',label:'Target'}, {kind:'giant',label:'Giant'},
  {kind:'monster',label:'Monster'}, {kind:'gate',label:'Ring / gate'}, {kind:'coins',label:'Coins'}, {kind:'airport',label:'Airport'}, {kind:'territory',label:'Territory'},
  {kind:'event',label:'Event'}, {kind:'waypoint',label:'Waypoint'}, {kind:'repairHeart',label:'Health'},
  {kind:'repair',label:'Repair spot'}, {kind:'challenge',label:'Challenge'}, {kind:'discovery',label:'Discovery'},
  {kind:'heat',label:'Danger'}, {kind:'credits',label:'Top pilot',icon:'♛'},
] as const;

const CLICK_DISTANCE = 18;
const MIN_SCALE = 0.01;
const MAX_SCALE = 0.11;

export class WorldMap {
  private readonly context: CanvasRenderingContext2D;
  private readonly card: HTMLElement;
  private readonly standaloneParent: HTMLElement;
  private readonly staticCanvas = document.createElement('canvas');
  private readonly staticContext: CanvasRenderingContext2D;
  private readonly geographyCanvas = document.createElement('canvas');
  private readonly geographyContext: CanvasRenderingContext2D;
  private centerX: number;
  private centerZ: number;
  private scale: number;
  private moved = false;
  private readonly pointers = new Map<number,{x:number;y:number}>();
  private gesture?: {x:number;y:number;distance:number};
  private pressX = 0;
  private pressY = 0;
  private state: WorldMapState | undefined;
  private staticData: StaticMapData = {};
  private openState = false;
  private openedBefore = false;
  private staticLoading = false;
  private staticLoaded = false;
  private embeddedHost: HTMLElement | undefined;
  private readonly legendElement:HTMLElement;
  private legendSignature='';
  private readonly roadPaths = new Map<number, Path2D>();
  private labelCount = 0;
  private readonly labels: Array<{ x: number; y: number; w: number; h: number }> = [];


  constructor(
    private readonly element: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly recenterButton: HTMLButtonElement,
    private layer: WorldMapLayer,
    private airports: readonly MapAirport[],
    private readonly onWaypoint: (position: MapTarget | null) => void,
    private readonly onChallenge?: (challengeId: string) => void,
  ) {
    registerUiBackLayer({
      id: 'world-map',
      priority: uiBackPriority.surface,
      isActive: () => this.isOpen(),
      close: () => this.setOpen(false),
    });
    this.context = canvas.getContext('2d')!;
    this.card = element.querySelector<HTMLElement>('.world-map-card')!;
    this.standaloneParent = this.card.parentElement!;
    this.legendElement=element.querySelector('.map-symbol-key')!;
    this.renderLegend();
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

  setCity(layer:WorldMapLayer,airports:readonly MapAirport[]):void {
    this.resetGesture();
    this.layer=layer;this.airports=airports;this.staticData={};this.roadPaths.clear();
    this.staticLoading=false;this.staticLoaded=false;this.openedBefore=false;
    this.geographyCanvas.width=this.geographyCanvas.height=0;
    this.centerX=(layer.bounds.minX+layer.bounds.maxX)/2;this.centerZ=(layer.bounds.minZ+layer.bounds.maxZ)/2;
    this.scale=this.defaultScale();this.state=undefined;this.drawStatic();
  }
  isOpen(): boolean {
    return this.openState;
  }

  toggle(): void {
    this.setOpen(!this.openState);
  }

  setOpen(open: boolean): void {
    if (open) this.unmountEmbedded();
    if(!open)this.resetGesture();
    this.openState = open;
    this.element.classList.toggle('hidden', !open);
    if (open) this.present();
  }

  mountEmbedded(host: HTMLElement): void {
    if (this.embeddedHost === host && this.card.parentElement === host) return;
    this.setOpen(false);
    this.embeddedHost = host;
    this.card.classList.add('world-map-card-embedded');
    host.append(this.card);
    this.present();
    requestAnimationFrame(() => {
      if (this.embeddedHost !== host || !host.isConnected) return;
      this.resizeCanvas();
      this.clampCenter();
      this.drawStatic();
      this.draw();
    });
  }

  unmountEmbedded(): void {
    if (!this.embeddedHost) return;
    this.resetGesture();
    this.embeddedHost = undefined;
    this.card.classList.remove('world-map-card-embedded');
    this.standaloneParent.append(this.card);
  }

  private present(): void {
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
    this.renderLegend();
    if (this.layer.staticUrl && !this.staticLoading && !this.staticLoaded) void this.loadStaticLayer(this.layer.staticUrl);
  }

  update(state: WorldMapState): void {
    this.state = state;
    if (this.openState || this.embeddedHost) {
      this.draw();
      this.renderLegend();
    }
  }

  resize(): void {
    this.resetGesture();
    this.resizeCanvas();
    this.drawStatic();
    if (this.openState || this.embeddedHost) this.draw();
  }

  private defaultScale(): number {
    const width = this.layer.bounds.maxX - this.layer.bounds.minX;
    const height = this.layer.bounds.maxZ - this.layer.bounds.minZ;
    return Math.min(MAX_SCALE, Math.max(this.minimumScale(), Math.min((this.canvas.clientWidth || 960) / width, (this.canvas.clientHeight || 640) / height) * 0.92));
  }

  private minimumScale(): number {
    const width = this.layer.bounds.maxX - this.layer.bounds.minX;
    const height = this.layer.bounds.maxZ - this.layer.bounds.minZ;
    return Math.min(MIN_SCALE, Math.min((this.canvas.clientWidth || 960) / width, (this.canvas.clientHeight || 640) / height) * 0.92);
  }

  private async loadStaticLayer(url: string): Promise<void> {
    this.staticLoading = true;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Map layer failed: ${response.status}`);
      const data=await response.json() as StaticMapData;
      if(this.layer.staticUrl!==url)return;
      this.staticData=data;
    } catch {
      this.staticData = {};
    }
    this.staticLoading = false;
    this.staticLoaded = true;
    this.buildGeographyCache();
    this.drawStatic();
    if (this.openState || this.embeddedHost) this.draw();
  }

  private renderLegend(): void {
    const state=this.state,kinds=new Set<string>(['you','airport']);
    if(state){
      if(state.players.some(p=>p.isBot))kinds.add('ai');
      if(state.players.some(p=>!p.isBot))kinds.add('player');
      if(state.players.some(p=>p.missionTarget))kinds.add('mission');
      if(state.territories?.length)kinds.add('territory');
      if(state.waypoint)kinds.add('waypoint');
      if(state.challenges?.length)kinds.add('challenge');
      if(state.events?.some(e=>e.lifecycle==='available'||e.lifecycle==='active'))kinds.add('event');
      if(state.events?.some(e=>e.missionTarget))kinds.add('mission');
      if(state.discoveries?.length)kinds.add('discovery');
      if(state.repairs?.some(r=>r.kind==='heart'))kinds.add('repairHeart');
      if(state.repairs?.some(r=>r.kind!=='heart'))kinds.add('repair');
      if(state.players.some(p=>(p.heatLevel??0)>=4)||state.events?.some(e=>e.mostWanted))kinds.add('heat');
      if(state.king||state.players.some(p=>p.king))kinds.add('credits');
      for(const objective of state.objectives??[])kinds.add(objective.kind==='health'?'repairHeart':objective.kind);
    }
    const entries=mapLegend.filter(entry=>kinds.has(entry.kind)),signature=entries.map(entry=>entry.kind).join(',');
    if(signature===this.legendSignature)return;
    this.legendSignature=signature;
    this.legendElement.replaceChildren(...entries.map(entry=>{
      const item=document.createElement('span'),icon=document.createElement('b');
      item.setAttribute('role','listitem');icon.setAttribute('aria-hidden','true');
      icon.textContent='icon' in entry?entry.icon:worldMapIdentity[entry.kind].icon;
      icon.style.color=worldMapIdentity[entry.kind].color;
      item.append(icon,document.createTextNode(entry.label));return item;
    }));
  }

  private pointerGesture(): {x:number;y:number;distance:number} | undefined {
    const points=this.pointers.values(),a=points.next().value,b=points.next().value;
    if(!a)return undefined;
    return b?{x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.hypot(b.x-a.x,b.y-a.y)}:{...a,distance:0};
  }

  private resetGesture(): void {
    for(const id of this.pointers.keys())if(this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);
    this.pointers.clear();this.gesture=undefined;this.moved=false;
  }

  private transformView(from:{x:number;y:number},to:{x:number;y:number},factor=1): void {
    const before=this.screenToWorld(from.x,from.y);
    this.scale=Math.min(MAX_SCALE,Math.max(this.minimumScale(),this.scale*factor));
    const after=this.screenToWorld(to.x,to.y);
    this.centerX+=before.x-after.x;this.centerZ+=before.z-after.z;
    this.clampCenter();this.drawStatic();this.draw();
  }

  private bindEvents(): void {
    this.recenterButton.addEventListener('click', () => this.recenter());
    for(const button of this.card.querySelectorAll<HTMLButtonElement>('[data-map-zoom]'))button.addEventListener('click',()=>{
      const center={x:this.canvas.width/2,y:this.canvas.height/2};
      this.transformView(center,center,button.dataset.mapZoom==='in'?1.5:1/1.5);
    });
    this.canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const point=this.eventToCanvas(event);
      if(!this.pointers.size){this.moved=false;this.pressX=point.x;this.pressY=point.y;}
      this.pointers.set(event.pointerId,point);
      if(this.pointers.size>1)this.moved=true;
      this.gesture=this.pointerGesture();
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if(!this.pointers.has(event.pointerId)||!this.gesture)return;
      event.preventDefault();
      const before=this.gesture;
      this.pointers.set(event.pointerId,this.eventToCanvas(event));
      const next=this.pointerGesture()!;
      if(this.pointers.size>1||Math.hypot(next.x-this.pressX,next.y-this.pressY)>5)this.moved=true;
      this.transformView(before,next,before.distance>0&&next.distance>0?next.distance/before.distance:1);
      this.gesture=next;
    });
    const finish=(event:PointerEvent,cancelled=false):void=>{
      if(!this.pointers.has(event.pointerId))return;
      event.preventDefault();
      this.pointers.delete(event.pointerId);this.gesture=this.pointerGesture();
      if(cancelled)this.moved=true;
      if(this.canvas.hasPointerCapture(event.pointerId))this.canvas.releasePointerCapture(event.pointerId);
      if(!this.pointers.size&&!cancelled&&!this.moved)this.click(event);
    };
    this.canvas.addEventListener('pointerup',event=>finish(event));
    this.canvas.addEventListener('pointercancel',event=>finish(event,true));
    this.canvas.addEventListener('lostpointercapture',event=>finish(event,true));
    this.canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const pointer=this.eventToCanvas(event);
      this.transformView(pointer,pointer,Math.exp(-event.deltaY*0.0015));
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
    for (const repair of this.state?.repairs ?? []) {
      if (repair.kind !== 'heart') continue;
      const marker = this.worldToScreen(repair.x, repair.z);
      if (Math.hypot(click.x - marker.x, click.y - marker.y) <= CLICK_DISTANCE) {
        this.onWaypoint({ x: repair.x, z: repair.z, label: '♥ REPAIR' });
        return;
      }
    }
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
    // Allow the city edges to reach the center of the view. Requiring the
    // entire viewport to stay inside the data bounds traps wide mobile maps
    // near edge airports and can snap a recentered view on its first drag.
    const { minX, maxX, minZ, maxZ } = this.layer.bounds;
    this.centerX = Math.min(maxX, Math.max(minX, this.centerX));
    this.centerZ = Math.min(maxZ, Math.max(minZ, this.centerZ));
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
    const sourceScale = this.layer.sourceScale ?? 1;
    const toCache = (x: number, z: number) => ({
      x: (x * sourceScale - this.layer.bounds.minX) / worldWidth * this.geographyCanvas.width,
      y: (z * sourceScale - this.layer.bounds.minZ) / worldHeight * this.geographyCanvas.height,
    });
    for (const polygon of this.staticData.land ?? []) {
      context.fillStyle = polygon[0] === 1 ? '#e5f0e9' : '#edf4ee';
      context.beginPath();
      for (let i = 1; i < polygon.length; i += 2) {
        const p = toCache(polygon[i], polygon[i + 1]);
        if (i === 1) context.moveTo(p.x, p.y); else context.lineTo(p.x, p.y);
      }
      context.closePath(); context.fill();
    }
    context.fillStyle = '#a9d9ef';
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
      path.moveTo(roads[index + 1] * sourceScale, roads[index + 2] * sourceScale);
      path.lineTo(roads[index + 3] * sourceScale, roads[index + 4] * sourceScale);
    }
  }

  private drawStatic(): void {
    this.resizeCanvas();
    const context = this.staticContext;
    const { width, height } = this.canvas;
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#f7fafc';
    context.fillRect(0, 0, width, height);
    const gridMeters = this.scale > 0.035 ? 2_000 : this.scale > 0.014 ? 5_000 : 10_000;
    context.strokeStyle = 'rgba(132, 163, 180, 0.045)';
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
      context.strokeStyle = classification === 4 ? '#f1ca58' : classification === 3 ? '#eadb9d' : '#ffffff';
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
    context.strokeStyle = worldMapIdentity.airport.color;
    context.lineWidth = Math.max(2, airport.runwayWidth * this.scale);
    context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
    const center = this.worldToScreen(airport.x, airport.z);
    context.fillStyle = worldMapIdentity.airport.color; context.font = '700 10px ui-monospace, monospace'; context.textAlign = 'center';
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
    context.fillStyle = 'rgba(255,255,255,0.96)'; context.strokeStyle = color; context.lineWidth = 1;
    context.beginPath();context.roundRect(x-width/2,y-12,width,17,4);context.fill();context.stroke();
    context.textAlign = 'center'; context.fillStyle = '#14334f'; context.fillText(text, x, y);
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
    for(const objective of this.state.objectives??[])this.drawObjective(objective);
    // Legacy contracts are not a second player-facing journey beside Missions.
    if (this.state.waypoint) this.drawTarget(this.state.waypoint, worldMapIdentity.waypoint.color, 'WAYPOINT');
    for (const challenge of this.state.challenges ?? []) this.drawChallenge(challenge);
    for (const event of this.state.events ?? []) this.drawEvent(event);
    for (const airport of this.airports) {
      const p = this.worldToScreen(airport.x, airport.z);
      this.label(`${worldMapIdentity.airport.icon} ${airport.name}`, p.x, p.y - 12, worldMapIdentity.airport.color, 12);
    }
    for (const landmark of this.layer.landmarks ?? []) {
      const p = this.worldToScreen(landmark.x, landmark.z);
      this.label(landmark.label, p.x, p.y - 7, '#84a6bb', 12);
    }
    for (const repair of this.state.repairs ?? []) this.drawRepair(repair);
    if (this.scale >= 0.035) for (const discovery of this.state.discoveries ?? []) this.drawDiscovery(discovery);
    for (const player of this.state.players) {
      const point = this.worldToScreen(player.x, player.z);
      const color=player.missionTarget?worldMapIdentity.mission.color:worldMapIdentity[player.isBot?'ai':'player'].color;
      this.drawAircraft(point.x,point.y,-(player.heading??0),color);
      if(player.missionTarget){
        this.context.strokeStyle=worldMapIdentity.mission.color;this.context.lineWidth=1.5;
        this.context.beginPath();this.context.arc(point.x,point.y,13,0,Math.PI*2);this.context.stroke();
      }
      if(player.label)this.label(player.label,point.x,point.y-18,color);
      if (player.ownershipAccent) {
        this.context.strokeStyle = '#081722'; this.context.lineWidth = 5;
        this.context.beginPath(); this.context.arc(point.x, point.y, 10.5, 0, Math.PI * 2); this.context.stroke();
        this.context.strokeStyle = player.ownershipAccent; this.context.lineWidth = 3; this.context.stroke();
      }
      if ((player.heatLevel ?? 0) >= 4) {
        this.context.fillStyle = worldMapIdentity.heat.color; this.context.font = '11px sans-serif'; this.context.fillText(worldMapIdentity.heat.icon, point.x + 7, point.y);
      }
      if (player.king) { this.context.fillStyle = '#ffd96d'; this.context.font = '700 11px ui-monospace, monospace'; this.context.textAlign = 'center'; this.context.fillText('♛', point.x, point.y - 7); }
    }
    const rotation = Math.atan2(this.state.forward.x, -this.state.forward.z);
    const pulse = 0.42 + Math.sin(performance.now() * 0.006) * 0.18;
    this.context.save();
    this.context.strokeStyle = worldMapIdentity.you.color; this.context.globalAlpha = pulse; this.context.lineWidth = 2;
    this.context.beginPath(); this.context.arc(point.x, point.y, 17, 0, Math.PI * 2); this.context.stroke();
    this.context.translate(point.x, point.y); this.context.rotate(rotation);
    this.context.globalAlpha = 1;
    this.context.fillStyle = 'rgba(236, 251, 255, 0.2)'; this.context.beginPath(); this.context.moveTo(0, -31); this.context.lineTo(-11, -4); this.context.lineTo(11, -4); this.context.closePath(); this.context.fill();
    this.drawAircraft(0,0,0,worldMapIdentity.you.color,13);
    this.context.restore();
    this.context.fillStyle = '#07121c'; this.context.fillRect(point.x - 20, point.y + 18, 40, 17);
    this.context.fillStyle = '#ffffff'; this.context.font = '900 12px ui-sans-serif, system-ui, sans-serif'; this.context.textAlign = 'center'; this.context.fillText('YOU', point.x, point.y + 31);
    if (this.state.king) { this.context.fillStyle = '#ffd96d'; this.context.font = '700 11px ui-monospace, monospace'; this.context.textAlign = 'center'; this.context.fillText('♛', point.x, point.y - 21); }
    if (this.state.discoveryProgress) this.drawDiscoveryProgress(this.state.discoveryProgress);
  }

  private drawAircraft(x:number,y:number,rotation:number,color:string,size=10,giant=false):void {
    const c=this.context;c.save();c.translate(x,y);c.rotate(rotation);
    c.fillStyle='#ffffff';c.strokeStyle=color;c.lineWidth=2;c.beginPath();
    c.moveTo(0,-size);
    if(giant){
      for(const [dx,dy]of giantMapOutline)c.lineTo(dx*size,dy*size);
    }else{c.lineTo(-size*8/13,size*9/13);c.lineTo(0,size*5/13);c.lineTo(size*8/13,size*9/13);}
    c.closePath();c.fill();c.stroke();c.restore();
  }

  private drawObjective(objective:MapObjective):void {
    const point=this.worldToScreen(objective.x,objective.z),c=this.context;
    const key=objective.kind==='health'?'repairHeart':objective.kind,color=worldMapIdentity[key].color;
    c.save();c.strokeStyle=color;c.fillStyle='#fff';c.lineWidth=2;
    if(objective.kind==='giant')this.drawAircraft(point.x,point.y,-(objective.heading??0),color,16,true);
    else if(objective.kind==='monster'||objective.kind==='health'||objective.kind==='coins'){
      c.fillStyle=color;c.font='22px sans-serif';c.textAlign='center';c.fillText(worldMapIdentity[key].icon,point.x,point.y+7);
    }else if(objective.kind==='target'){
      for(const radius of [9,6,2]){c.beginPath();c.arc(point.x,point.y,radius,0,Math.PI*2);c.fillStyle=radius===6?'#fff':color;c.fill();}
    }else{
      c.beginPath();c.arc(point.x,point.y,9,0,Math.PI*2);c.fill();c.stroke();
      if(objective.kind==='airport'){c.fillStyle=color;c.font='bold 13px sans-serif';c.textAlign='center';c.fillText('✈',point.x,point.y+4);}
    }
    c.restore();this.label(objective.label,point.x,point.y-(objective.kind==='giant'?24:18),color,11);
  }

  private drawTerritory(territory: MapTerritory): void {
    const a = this.worldToScreen(territory.bounds.minX, territory.bounds.minZ);
    const b = this.worldToScreen(territory.bounds.maxX, territory.bounds.maxZ);
    const width = b.x - a.x;
    const height = b.y - a.y;
    const color = !territory.color || territory.color===territoryOwnershipColors.neutral ? worldMapIdentity.territory.color : territory.color;
    this.context.save();
    this.context.fillStyle = `${color}${territory.missionTarget ? '24' : '14'}`;
    this.context.fillRect(a.x, a.y, width, height);
    this.context.strokeStyle = color;
    this.context.lineWidth = territory.missionTarget ? 3 : territory.contested ? 2.5 : 2;
    this.context.strokeRect(a.x, a.y, width, height);
    const centerX = a.x + width / 2;
    const centerY = a.y + height / 2;
    if (territory.missionTarget) {
      this.context.strokeStyle = worldMapIdentity.mission.color;
      this.context.lineWidth = 2;
      this.context.strokeRect(a.x - 4, a.y - 4, width + 8, height + 8);
    }
    this.context.fillStyle = territory.contested ? territoryOwnershipColors.contested : '#254c68';
    this.context.font = '700 9px ui-monospace, monospace';
    this.context.textAlign = 'center';
    this.label(`${territory.missionTarget ? worldMapIdentity.mission.icon + ' ' : ''}${territory.label}`, centerX, centerY - 12, territory.missionTarget ? worldMapIdentity.mission.color : color);
    if (territory.contested) {
      this.context.setLineDash([6, 4]);
      this.context.strokeStyle = territoryOwnershipColors.contested;
      this.context.lineWidth = 1.5;
      this.context.strokeRect(a.x + 3, a.y + 3, width - 6, height - 6);
      this.context.setLineDash([]);
      if (this.scale > 0.035) this.label('CONTESTED', centerX, centerY + 12, territoryOwnershipColors.contested);
    } else if (territory.controllerName) {
      this.context.font = '600 8px ui-monospace, monospace';
      if (this.scale > 0.035) this.label(`Owned by ${territory.controllerName}`, centerX, centerY + 12, '#577d96');
    } else if (territory.captureProgress > 0) {
      this.context.font = '600 8px ui-monospace, monospace';
      this.context.fillText(`CAPTURE ${Math.round(territory.captureProgress)}%`, centerX, centerY + 12);
    } else if (this.scale > 0.05) {
      this.label('NEUTRAL', centerX, centerY + 12, color);
    }
    this.context.restore();
  }

  private drawDiscoveryProgress(progress: MapDiscoveryProgress): void {
    const label = `${progress.cityName.toUpperCase()} DISCOVERY: ${progress.discovered} / ${progress.total} — ${progress.percent}%`;
    this.context.fillStyle = 'rgba(255, 255, 255, 0.92)';
    this.context.fillRect(10, this.canvas.height - 28, Math.min(this.canvas.width - 20, 250), 18);
    this.context.fillStyle = '#315571';
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
    this.label(discovery.label, point.x, point.y - 8, worldMapIdentity.discovery.color);
  }

  private drawTarget(target: MapTarget, color: string, label: string): void {
    const point = this.worldToScreen(target.x, target.z);
    this.context.strokeStyle = color; this.context.lineWidth = 2;
    this.context.beginPath(); this.context.arc(point.x, point.y, 8, 0, Math.PI * 2); this.context.stroke();
    this.context.fillStyle = color; this.context.font = '700 10px ui-monospace, monospace'; this.context.textAlign = 'center';
    this.label(`${label === 'WAYPOINT' ? worldMapIdentity.waypoint.icon + ' ' : ''}${target.label ?? label}`, point.x, point.y - 14, color, 12);
  }

  private drawChallenge(challenge: MapChallenge): void {
    const point = this.worldToScreen(challenge.x, challenge.z);
    const color = worldMapIdentity.challenge.color;
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
    const color = event.missionTarget ? worldMapIdentity.mission.color : worldMapIdentity[event.mostWanted ? 'wanted' : 'event'].color;
    this.context.strokeStyle = color;
    this.context.lineWidth = 2;
    this.context.beginPath(); this.context.arc(point.x, point.y, 8, 0, Math.PI * 2); this.context.stroke();
    this.context.fillStyle = color;
    this.context.font = '700 9px ui-monospace, monospace';
    this.context.textAlign = 'center';
    this.label(`${event.missionTarget ? worldMapIdentity.mission.icon : worldMapIdentity[event.mostWanted ? 'wanted' : 'event'].icon} ${event.label}`, point.x, point.y - 12, color);
  }

  private drawRepair(repair: MapRepair): void {
    const point = this.worldToScreen(repair.x, repair.z);
    if (repair.kind === 'heart') {
      const remaining = Math.max(0, (repair.cooldownUntil ?? 0) - Date.now());
      const waypointed = this.state?.waypoint?.x === repair.x && this.state?.waypoint?.z === repair.z;
      if (remaining > 0 && !waypointed) return;
      const color = remaining > 0 ? '#a88b92' : worldMapIdentity.repairHeart.color;
      this.context.fillStyle = color;
      this.context.font = 'bold 19px sans-serif';
      this.context.textAlign = 'center';
      this.context.fillText('♥', point.x, point.y + 6);
      const seconds = Math.ceil(remaining / 1000);
      if (this.scale > 0.04 || waypointed) this.label(remaining > 0 ? `♥ REPAIR · Available in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '♥ REPAIR', point.x, point.y - 13, color);
      return;
    }
    this.context.save();
    this.context.translate(point.x, point.y);
    this.context.rotate(Math.PI / 4);
    this.context.strokeStyle = worldMapIdentity.repair.color;
    this.context.lineWidth = 2;
    this.context.strokeRect(-4, -4, 8, 8);
    this.context.restore();
    this.context.fillStyle = worldMapIdentity.repair.color;
    this.context.font = '700 8px ui-monospace, monospace';
    this.context.textAlign = 'center';
    if (this.scale > 0.04) this.label(identityText('repair'), point.x, point.y - 8, worldMapIdentity.repair.color);
  }
}
