export type WeatherZoneType = 'clear' | 'windy' | 'storm' | 'fog' | 'dusk_signal' | 'turbulence';
export type WeatherZone = Readonly<{ id:string; cityId:'dallas'|'milwaukee'; type:WeatherZoneType; name:string; center:Readonly<{x:number;z:number}>; radius:number; altitudeMin?:number; altitudeMax?:number; intensity:number; eventId?:string; airportId?:string; sponsorSlotId?:string; visualProfile:string; gameplayProfile:string }>;
export declare const weatherZoneTypes: readonly WeatherZoneType[];
export declare const cityWeatherZones: Readonly<Record<'dallas'|'milwaukee', readonly WeatherZone[]>>;
export declare function weatherZonesForCity(cityId:string): readonly WeatherZone[];
export declare function weatherZoneAt(zones:readonly WeatherZone[],position:{x:number;y:number;z:number},enabledIds?:ReadonlySet<string>):WeatherZone|undefined;
