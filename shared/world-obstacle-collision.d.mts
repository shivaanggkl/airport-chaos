type Point = Readonly<{x:number;y:number;z:number}>;
type Obstacle = Readonly<{x:number;z:number;halfX:number;halfZ:number;height:number;baseY?:number;polygon?:ReadonlyArray<readonly [number,number]>}>;
export declare function segmentHitsWorldObstacle(start:Point,end:Point,obstacle:Obstacle,padding?:number):boolean;
