type Point={x:number;y:number;z:number};
export type CoinHuntState={mask:string;collected:number;altitude:number};
export const dallasCoinTrail:ReadonlyArray<Readonly<{x:number;z:number}>>;
export const emptyCoinMask:string;
export function coinCollected(mask:string,index:number):boolean;
export function collectTrail(coins:ReadonlyArray<{x:number;z:number}>,altitude:number,mask:string,start:Point,end:Point,radius:number,limit:number):{mask:string;count:number};
