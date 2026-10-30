type Position = { x: number; y: number; z: number };
type Located = { cityId: string; position: Position };
/** Conservative broad phase only. The existing swept impact test remains authoritative. */
export class CombatSpatialIndex<T extends Located> {
  private readonly cities = new Map<string, Map<string, T[]>>();
  constructor(private readonly cellSize = 512) {}
  rebuild(values: Iterable<T>): void {
    this.cities.clear();
    for (const value of values) {
      let cells = this.cities.get(value.cityId);
      if (!cells) { cells = new Map(); this.cities.set(value.cityId, cells); }
      const p = value.position;
      const key = `${Math.floor(p.x/this.cellSize)},${Math.floor(p.y/this.cellSize)},${Math.floor(p.z/this.cellSize)}`;
      const bucket = cells.get(key);
      if (bucket) bucket.push(value); else cells.set(key,[value]);
    }
  }
  query(city: string, start: Position, end: Position, padding: number, out: T[]): void {
    out.length = 0;
    const cells = this.cities.get(city); if (!cells) return;
    const minX=Math.floor((Math.min(start.x,end.x)-padding)/this.cellSize),maxX=Math.floor((Math.max(start.x,end.x)+padding)/this.cellSize);
    const minY=Math.floor((Math.min(start.y,end.y)-padding)/this.cellSize),maxY=Math.floor((Math.max(start.y,end.y)+padding)/this.cellSize);
    const minZ=Math.floor((Math.min(start.z,end.z)-padding)/this.cellSize),maxZ=Math.floor((Math.max(start.z,end.z)+padding)/this.cellSize);
    for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++)for(let z=minZ;z<=maxZ;z++) {
      const bucket=cells.get(`${x},${y},${z}`);if(bucket)for(const value of bucket)out.push(value);
    }
  }
}
