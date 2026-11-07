export declare const DALLAS_WORLD_SCALE: 3;
export declare function scaleDallasPoint<T extends { x: number; z: number }>(point: T): T;
export declare function scaleDallasBounds<T extends { minX: number; maxX: number; minZ: number; maxZ: number }>(bounds: T): T;
