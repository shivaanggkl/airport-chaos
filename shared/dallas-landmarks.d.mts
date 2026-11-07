export type DallasLandmark = Readonly<{kind:'reunion'|'faceted'|'stepped'|'signature';x:number;z:number;width:number;depth:number;height:number;material?:number;rotation?:number;style?:number}>;
export type LandmarkBounds = {x:number;z:number;halfX:number;halfZ:number;height:number;baseY:number;polygon:Array<readonly [number,number]>};
export declare const dallasLandmarks:ReadonlyArray<DallasLandmark>;
export declare function landmarkBounds(b:DallasLandmark,heightAt:(x:number,z:number)=>number):LandmarkBounds[];
