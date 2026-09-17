export const weatherZoneTypes = Object.freeze(['clear', 'windy', 'storm', 'fog', 'dusk_signal', 'turbulence']);

export const cityWeatherZones = Object.freeze({
  dallas: Object.freeze([
    Object.freeze({ id: 'dfw-crosswind', cityId: 'dallas', type: 'windy', name: 'DFW CROSSWIND', center: Object.freeze({ x: -22_800, z: -13_600 }), radius: 1_650, intensity: 0.22, airportId: 'dfw', visualProfile: 'wind-streaks', gameplayProfile: 'light-drift' }),
    Object.freeze({ id: 'white-rock-storm', cityId: 'dallas', type: 'storm', name: 'WHITE ROCK STORM', center: Object.freeze({ x: 6_400, z: -8_900 }), radius: 1_050, altitudeMax: 3_800, intensity: 0.42, visualProfile: 'cool-storm', gameplayProfile: 'storm-drift' }),
    Object.freeze({ id: 'love-storm', cityId: 'dallas', type: 'storm', name: 'METRO CENTRAL STORM', center: Object.freeze({ x: -5_140, z: -7_780 }), radius: 1_450, altitudeMax: 2_200, intensity: 0.38, airportId: 'love', eventId: 'stormLanding', visualProfile: 'cool-storm', gameplayProfile: 'storm-drift' }),
    Object.freeze({ id: 'love-fog', cityId: 'dallas', type: 'fog', name: 'METRO CENTRAL FOG', center: Object.freeze({ x: -5_140, z: -7_780 }), radius: 1_350, altitudeMax: 850, intensity: 0.46, airportId: 'love', visualProfile: 'approach-fog', gameplayProfile: 'visibility-only' }),
    Object.freeze({ id: 'trinity-turbulence', cityId: 'dallas', type: 'turbulence', name: 'TRINITY TURBULENCE', center: Object.freeze({ x: -2_400, z: 1_100 }), radius: 720, intensity: 0.18, visualProfile: 'wind-streaks', gameplayProfile: 'light-turbulence' }),
    Object.freeze({ id: 'midnight-signal', cityId: 'dallas', type: 'dusk_signal', name: 'MIDNIGHT SIGNAL', center: Object.freeze({ x: 4_900, z: -15_800 }), radius: 900, altitudeMin: 120, altitudeMax: 2_400, intensity: 0.3, visualProfile: 'signal-glow', gameplayProfile: 'none' }),
  ]),
  milwaukee: Object.freeze([
    Object.freeze({ id:'coast-fog',cityId:'milwaukee',type:'fog',name:'LAKE COAST FOG',center:Object.freeze({x:5100,z:3550}),radius:1100,altitudeMax:850,intensity:.4,airportId:'coast',visualProfile:'approach-fog',gameplayProfile:'visibility-only' }),
    Object.freeze({ id:'mountain-wind',cityId:'milwaukee',type:'windy',name:'MOUNTAIN RIDGE WIND',center:Object.freeze({x:-2300,z:-5000}),radius:1250,intensity:.25,airportId:'mountain',visualProfile:'wind-streaks',gameplayProfile:'light-drift' }),
    Object.freeze({ id:'coast-storm',cityId:'milwaukee',type:'storm',name:'LAKE COAST STORM',center:Object.freeze({x:3500,z:0}),radius:1050,altitudeMax:2600,intensity:.38,airportId:'coast',visualProfile:'cool-storm',gameplayProfile:'storm-drift' }),
  ]),
});

export function weatherZonesForCity(cityId) {
  return cityWeatherZones[cityId] ?? [];
}

export function weatherZoneAt(zones, position, enabledIds) {
  let match;
  let matchDistance = Infinity;
  for (const zone of zones) {
    if (enabledIds && !enabledIds.has(zone.id)) continue;
    if (zone.altitudeMin !== undefined && position.y < zone.altitudeMin) continue;
    if (zone.altitudeMax !== undefined && position.y > zone.altitudeMax) continue;
    const distance = Math.hypot(position.x - zone.center.x, position.z - zone.center.z);
    if (distance <= zone.radius && distance < matchDistance) { match = zone; matchDistance = distance; }
  }
  return match;
}
