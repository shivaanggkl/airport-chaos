import {createHash} from 'node:crypto';

export type Building = {minX:number;maxX:number;minZ:number;maxZ:number;top:number};
export type BuildingSource = readonly Building[] | CollisionBuildings | CollisionBuildingView;
export const COLLISION_VERSION=1;
export const COLLISION_CELL_SIZE=256;
const HEADER=128,STRIDE=5;
const fields=['minX','maxX','minZ','maxZ','top'] as const;
const align4=(n:number)=>(n+3)&~3;

/** CSR grid: one numeric offset per cell, integer references into shared Float64 rows. */
export function buildCollisionBuffer(buildings:readonly Building[],masks?:readonly number[]):Buffer {
  const values=new Float64Array(buildings.length*STRIDE),bits=new Uint32Array(values.buffer);
  const flags=new Uint8Array(buildings.length);
  // Exact bitwise deduplication, including signed zero. Build-only bounded numeric hash table.
  let slots=1;while(slots<buildings.length*2)slots*=2;
  const table=new Uint32Array(slots);let count=0;
  for(let row=0;row<buildings.length;row++){
    const b=buildings[row]!;
    if(!fields.every(k=>Number.isFinite(b[k]))||b.minX>b.maxX||b.minZ>b.maxZ)throw Error(`Invalid collision building ${row}`);
    for(let f=0;f<STRIDE;f++)values[count*STRIDE+f]=b[fields[f]!]!;
    let hash=2166136261;for(let f=0;f<10;f++)hash=Math.imul(hash^bits[count*10+f]!,16777619);
    let slot=hash&(slots-1),duplicate=-1;
    while(table[slot]){
      const id=table[slot]!-1;let equal=true;
      for(let f=0;f<10;f++)if(bits[id*10+f]!==bits[count*10+f]){equal=false;break;}
      if(equal){duplicate=id;break;}slot=(slot+1)&(slots-1);
    }
    if(duplicate>=0){flags[duplicate]!|=masks?.[row]??255;continue;}
    table[slot]=count+1;flags[count]=masks?.[row]??255;count++;
  }
  let minX=0,maxX=0,minZ=0,maxZ=0;
  if(count){minX=Infinity;maxX=-Infinity;minZ=Infinity;maxZ=-Infinity;}
  for(let id=0;id<count;id++){
    const i=id*STRIDE;minX=Math.min(minX,Math.floor(values[i]!/COLLISION_CELL_SIZE));maxX=Math.max(maxX,Math.floor(values[i+1]!/COLLISION_CELL_SIZE));
    minZ=Math.min(minZ,Math.floor(values[i+2]!/COLLISION_CELL_SIZE));maxZ=Math.max(maxZ,Math.floor(values[i+3]!/COLLISION_CELL_SIZE));
  }
  const width=maxX-minX+1,depth=maxZ-minZ+1,cells=width*depth;
  if(!Number.isSafeInteger(cells)||cells>16_000_000)throw Error('Collision grid bounds exceed supported size');
  const offsets=new Uint32Array(cells+1);
  const eachCell=(id:number,visit:(cell:number)=>void)=>{
    const i=id*STRIDE;
    for(let x=Math.floor(values[i]!/COLLISION_CELL_SIZE);x<=Math.floor(values[i+1]!/COLLISION_CELL_SIZE);x++)
      for(let z=Math.floor(values[i+2]!/COLLISION_CELL_SIZE);z<=Math.floor(values[i+3]!/COLLISION_CELL_SIZE);z++)visit((x-minX)*depth+z-minZ);
  };
  for(let id=0;id<count;id++)eachCell(id,cell=>{offsets[cell+1]!++;});
  for(let i=1;i<offsets.length;i++)offsets[i]!+=offsets[i-1]!;
  const refs=new Uint32Array(offsets[cells]!),cursor=offsets.slice(0,cells);
  for(let id=0;id<count;id++)eachCell(id,cell=>{refs[cursor[cell]++]=id;});
  const gridStart=align4(HEADER+count*40+count),size=gridStart+offsets.byteLength+refs.byteLength;
  const buffer=Buffer.alloc(size);buffer.write('ACCOLL01');buffer.writeUInt32LE(COLLISION_VERSION,8);buffer.writeUInt32LE(count,12);
  buffer.writeInt32LE(minX,16);buffer.writeInt32LE(minZ,20);buffer.writeUInt32LE(width,24);buffer.writeUInt32LE(depth,28);
  buffer.writeUInt32LE(COLLISION_CELL_SIZE,32);buffer.writeUInt32LE(refs.length,36);
  Buffer.from(values.buffer,0,count*40).copy(buffer,HEADER);Buffer.from(flags.buffer,0,count).copy(buffer,HEADER+count*40);
  Buffer.from(offsets.buffer).copy(buffer,gridStart);Buffer.from(refs.buffer).copy(buffer,gridStart+offsets.byteLength);
  createHash('sha256').update(buffer.subarray(0,64)).update(buffer.subarray(96)).digest().copy(buffer,64);
  return buffer;
}

/** Immutable shared geometry/index; only the bounded query-stamp array is mutable. */
export class CollisionBuildings implements Iterable<Building> {
  readonly length:number;
  private readonly values:Float64Array;
  private readonly masks:Uint8Array;
  private readonly offsets:Uint32Array;
  private readonly refs:Uint32Array;
  private readonly marks:Uint32Array;
  private stamp=0;
  private readonly minX:number;private readonly minZ:number;private readonly width:number;private readonly depth:number;
  constructor(buffer:Buffer){
    if(new Uint8Array(new Uint32Array([1]).buffer)[0]!==1)throw Error('Collision package requires little-endian storage');
    if(buffer.length<HEADER||buffer.toString('utf8',0,8)!=='ACCOLL01'||buffer.readUInt32LE(8)!==COLLISION_VERSION||buffer.readUInt32LE(32)!==COLLISION_CELL_SIZE)throw Error('Invalid collision package version');
    this.length=buffer.readUInt32LE(12);this.minX=buffer.readInt32LE(16);this.minZ=buffer.readInt32LE(20);this.width=buffer.readUInt32LE(24);this.depth=buffer.readUInt32LE(28);
    const cells=this.width*this.depth,refCount=buffer.readUInt32LE(36),gridStart=align4(HEADER+this.length*40+this.length);
    if(!cells||cells>16_000_000||gridStart+(cells+1+refCount)*4!==buffer.length)throw Error('Invalid collision package length');
    if(!createHash('sha256').update(buffer.subarray(0,64)).update(buffer.subarray(96)).digest().equals(buffer.subarray(64,96)))throw Error('Collision package checksum mismatch');
    // readFileSync owns an aligned backing allocation for the generated city package.
    if(buffer.byteOffset%8)throw Error('Unaligned collision package');
    this.values=new Float64Array(buffer.buffer,buffer.byteOffset+HEADER,this.length*STRIDE);
    this.masks=new Uint8Array(buffer.buffer,buffer.byteOffset+HEADER+this.length*40,this.length);
    this.offsets=new Uint32Array(buffer.buffer,buffer.byteOffset+gridStart,cells+1);
    this.refs=new Uint32Array(buffer.buffer,buffer.byteOffset+gridStart+(cells+1)*4,refCount);
    if(this.offsets[0]!==0||this.offsets[cells]!==refCount)throw Error('Invalid collision cell offsets');
    for(let i=1;i<this.offsets.length;i++)if(this.offsets[i]!<this.offsets[i-1]!)throw Error('Invalid collision cell order');
    for(const id of this.refs)if(id>=this.length)throw Error('Invalid collision building reference');
    for(const n of this.values)if(!Number.isFinite(n))throw Error('Invalid collision coordinate');
    this.marks=new Uint32Array(this.length);
  }
  hasMask(id:number,mask:number):boolean{return Boolean(this.masks[id]!&mask);}
  read(id:number,out:Building):Building{
    const i=id*STRIDE;out.minX=this.values[i]!;out.maxX=this.values[i+1]!;out.minZ=this.values[i+2]!;out.maxZ=this.values[i+3]!;out.top=this.values[i+4]!;return out;
  }
  /** Callback borrows one row cursor; retain integer IDs or explicitly copy bounded results. */
  forEach(visit:(b:Building,id:number)=>void,mask=255):void{
    const b={minX:0,maxX:0,minZ:0,maxZ:0,top:0};
    for(let id=0;id<this.length;id++)if(this.masks[id]!&mask)visit(this.read(id,b),id);
  }
  *[Symbol.iterator]():IterableIterator<Building>{
    for(let id=0;id<this.length;id++)yield this.read(id,{minX:0,maxX:0,minZ:0,maxZ:0,top:0});
  }
  query(minX:number,maxX:number,minZ:number,maxZ:number,visit:(b:Building,id:number)=>boolean):boolean{
    const x0=Math.max(this.minX,Math.floor(minX/COLLISION_CELL_SIZE)),x1=Math.min(this.minX+this.width-1,Math.floor(maxX/COLLISION_CELL_SIZE));
    const z0=Math.max(this.minZ,Math.floor(minZ/COLLISION_CELL_SIZE)),z1=Math.min(this.minZ+this.depth-1,Math.floor(maxZ/COLLISION_CELL_SIZE));
    this.stamp=(this.stamp+1)>>>0;
    if(!this.stamp){this.marks.fill(0);this.stamp=1;}
    const stamp=this.stamp;
    const b={minX:0,maxX:0,minZ:0,maxZ:0,top:0};
    for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
      const cell=(x-this.minX)*this.depth+z-this.minZ;
      for(let at=this.offsets[cell]!;at<this.offsets[cell+1]!;at++){
        const id=this.refs[at]!;if(this.marks[id]===stamp)continue;this.marks[id]=stamp;
        if(visit(this.read(id,b),id))return true;
      }
    }
    return false;
  }
}
export class CollisionBuildingView implements Iterable<Building> {
  readonly length:number;
  constructor(readonly source:CollisionBuildings,private readonly include:(b:Building,id:number)=>boolean){
    let count=0;source.forEach((b,id)=>{if(include(b,id))count++;});this.length=count;
  }
  forEach(visit:(b:Building,id:number)=>void):void{this.source.forEach((b,id)=>{if(this.include(b,id))visit(b,id);});}
  query(minX:number,maxX:number,minZ:number,maxZ:number,visit:(b:Building,id:number)=>boolean):boolean{
    return this.source.query(minX,maxX,minZ,maxZ,(b,id)=>this.include(b,id)&&visit(b,id));
  }
  *[Symbol.iterator]():IterableIterator<Building>{for(let id=0;id<this.source.length;id++){
    const b=this.source.read(id,{minX:0,maxX:0,minZ:0,maxZ:0,top:0});if(this.include(b,id))yield b;
  }}
}
const packed=(b:BuildingSource):b is CollisionBuildings|CollisionBuildingView=>b instanceof CollisionBuildings||b instanceof CollisionBuildingView;
const indexes=new WeakMap<readonly Building[],CollisionBuildings>();
export function hasBuildingIndex(buildings:BuildingSource):boolean{return packed(buildings)||indexes.has(buildings);}
export function indexBuildings(buildings:BuildingSource):void{
  if(!packed(buildings)&&!indexes.has(buildings))indexes.set(buildings,new CollisionBuildings(buildCollisionBuffer(buildings)));
}
export function queryBuildings(buildings:BuildingSource,minX:number,maxX:number,minZ:number,maxZ:number,visit:(b:Building,id:number)=>boolean):boolean{
  const index=packed(buildings)?buildings:indexes.get(buildings);
  if(index)return index.query(minX,maxX,minZ,maxZ,visit);
  return (buildings as readonly Building[]).some(visit);
}
export function forEachBuilding(buildings:BuildingSource,visit:(b:Building,id:number)=>void):void{
  buildings.forEach(visit);
}
