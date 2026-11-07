import * as THREE from 'three';
import * as world from './dallas-world';
import type { CityWorldModule } from './cities';
import { DALLAS_WORLD_SCALE, scaleDallasBounds, scaleDallasPoint } from '../../shared/dallas-world-scale.mjs';

const scale = DALLAS_WORLD_SCALE;
const streamPosition = new THREE.Vector3();
const streamVelocity = new THREE.Vector3();

const airports = world.airports.map(airport => ({
  ...scaleDallasPoint(airport), runwayWidth: airport.runwayWidth * scale,
  runwayLength: airport.runwayLength * scale, spawnOffset: airport.spawnOffset * scale,
}));

const scaleObstacle = (obstacle: world.ObstacleBounds): world.ObstacleBounds => ({
  ...scaleDallasPoint(obstacle), halfX: obstacle.halfX * scale, halfZ: obstacle.halfZ * scale,
  height: obstacle.height * scale, baseY: obstacle.baseY * scale,
  polygon: obstacle.polygon.map(([x, z]) => [x * scale, z * scale] as const),
});

export const scaledDallasWorld: CityWorldModule = {
  ...world,
  WORLD_SIZE: world.WORLD_SIZE * scale,
  airports,
  centralAirport: airports[0]!,
  getTerrainHeight: (x, z) => world.getTerrainHeight(x / scale, z / scale) * scale,
  createWorld: (scene, depthOffsetDirection) => {
    const result = world.createWorld(scene, depthOffsetDirection);
    scene.scale.setScalar(scale);
    return {
      obstacleBounds: result.obstacleBounds.map(scaleObstacle),
      mountainBounds: result.mountainBounds.map(mountain => ({ ...scaleDallasPoint(mountain), radius: mountain.radius * scale,
        height: mountain.height * scale, baseY: mountain.baseY === undefined ? undefined : mountain.baseY * scale })),
      waterBounds: result.waterBounds.map(water => ({ ...scaleDallasBounds(water), surfaceY: water.surfaceY * scale,
        polygon: water.polygon.map(([x, z]) => [x * scale, z * scale] as const) })),
    };
  },
  regionBounds: world.regionBounds.map(scaleDallasBounds),
  navigationDestinations: world.navigationDestinations.map(scaleDallasPoint),
  discoveries: world.discoveries,
  stuntZones: world.stuntZones.map(zone => ({ ...scaleDallasPoint(zone), radius: zone.radius * scale,
    minAltitude: zone.minAltitude * scale, maxAltitude: zone.maxAltitude * scale })),
  ambientTrafficConfig: { ...world.ambientTrafficConfig,
    routes: world.ambientTrafficConfig.routes.map(route => ({ ...route,
      points: route.points.map(point => ({ ...scaleDallasPoint(point), altitude: point.altitude * scale })) })) },
  skyChallenges: world.skyChallenges.map(challenge => ({ ...challenge, timeLimit: challenge.timeLimit * scale,
    gates: ['dfw-speed', 'downtown-precision', 'white-rock-low', 'addison-climb', 'las-colinas-flyby'].includes(challenge.id)
      ? challenge.gates : challenge.gates.map(gate => ({ ...scaleDallasPoint(gate), altitude: gate.altitude * scale, radius: gate.radius * scale })) })),
  visualQaPresets: world.visualQaPresets.map(preset => ({ ...scaleDallasPoint(preset), altitude: preset.altitude * scale })),
  adPlacements: world.adPlacements.map(ad => ({ ...ad,
    visibilityScale: ad.type === 'AIRCRAFT_LIVERY' ? undefined : scale,
    position: { x: ad.position.x * scale, y: ad.position.y * scale, z: ad.position.z * scale },
    size: ad.type === 'AIRCRAFT_LIVERY' ? ad.size : { x: ad.size.x * scale, y: ad.size.y * scale, z: ad.size.z * scale },
    supportBaseY: ad.supportBaseY === undefined ? undefined : ad.supportBaseY * scale,
    blimpOrbit: ad.blimpOrbit === undefined ? undefined : { ...ad.blimpOrbit,
      radiusX: ad.blimpOrbit.radiusX * scale, radiusZ: ad.blimpOrbit.radiusZ * scale },
  })),
  mapLayer: { ...world.mapLayer, sourceScale: scale, bounds: scaleDallasBounds(world.mapLayer.bounds),
    landmarks: world.mapLayer.landmarks?.map(scaleDallasPoint) },
  updateWorldStreaming: (position, velocity) => world.updateWorldStreaming(
    streamPosition.copy(position).divideScalar(scale),
    velocity ? streamVelocity.copy(velocity).divideScalar(scale) : undefined,
  ),
  hasWorldBuildingDetailAt: (x, z) => world.hasWorldBuildingDetailAt(x / scale, z / scale),
  getWorldStreamingVisualDebug: (position, camera) => world.getWorldStreamingVisualDebug(streamPosition.copy(position).divideScalar(scale), camera),
  updateWorldVisuals: (delta, position) => world.updateWorldVisuals(delta,
    position ? streamPosition.copy(position).divideScalar(scale) : undefined),
};
