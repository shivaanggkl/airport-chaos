import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { aircraftHitRadii, remoteAircraftCollisionRadius, remoteAircraftContactRadius, remoteAircraftNearMissRadius, remoteAircraftScale, remoteAircraftVisualScale, remoteInterpolationDuration, remotePredictionSeconds, remoteProxyPixelWidth } from '../../shared/remote-aircraft-visual-rules.mjs';

test('5 Hz Hunter snapshots keep visual motion continuous across ordinary packet jitter', () => {
  const packetTimes = [0, 0.2, 0.41, 0.61, 0.84, 1.04, 1.25];
  let prior = 0;
  let target = 0;
  let rendered = 0;
  let elapsed = 0.24;
  let duration = 0.24;
  let nextPacket = 1;
  let stationaryFrames = 0;
  for (let frame = 1; frame <= 75; frame += 1) {
    const now = frame / 60;
    if (nextPacket < packetTimes.length && now >= packetTimes[nextPacket]) {
      prior = rendered;
      target = packetTimes[nextPacket] * 100;
      duration = remoteInterpolationDuration(duration, packetTimes[nextPacket] - packetTimes[nextPacket - 1], true);
      elapsed = 0;
      nextPacket += 1;
    }
    const before = rendered;
    elapsed = Math.min(duration, elapsed + 1 / 60);
    rendered = prior + (target - prior) * elapsed / duration;
    if (now > 0.25 && now < 1.24 && rendered - before < 0.001) stationaryFrames += 1;
  }
  assert.equal(stationaryFrames, 0, 'Hunter must not pause between normal 200–230 ms snapshots');
  assert.ok(Math.abs(rendered - target) < 25, 'visual lag stays below one 5 Hz movement step');
  assert.equal(remoteInterpolationDuration(0.1, 0.1, false), 0.1028, '10 Hz human blend remains unchanged');
});

test('remote interpolation uses elapsed wall time when rendering frames are slow', () => {
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /const realDelta = clock\.getDelta\(\);[\s\S]*?updateRemotePlayers\(realDelta\)/);
});

test('late transforms keep remote aircraft moving briefly without unbounded drift', () => {
  assert.equal(remotePredictionSeconds(0.1, 0.1, false), 0);
  assert.ok(remotePredictionSeconds(0.3, 0.1, false) > 0.13,
    'a 300 ms human update gap should not leave the plane stationary');
  assert.ok(remotePredictionSeconds(0.5, 0.24, true) > 0.18,
    'a 500 ms bot update gap should not leave the plane stationary');
  assert.ok(remotePredictionSeconds(3, 0.1, false) < 0.18,
    'a disconnected player must never drift indefinitely');
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /remote\.plane\.position\.addScaledVector\(remote\.velocity,[\s\S]*?remotePredictionSeconds\(/);
  assert.match(main, /definition\.maxSpeed \* FLIGHT_UNITS_PER_METER \* \(definition\.boostMaxSpeed/);
  assert.match(main, /if \(combatOffset\.lengthSq\(\) > plausibleSpeed \* plausibleSpeed\) remote\.velocity\.set\(0, 0, 0\)/);
});

test('remote aircraft-contact marker stays readable close and compact far away', () => {
  assert.equal(remoteProxyPixelWidth(25), 20);
  assert.equal(remoteProxyPixelWidth(350), 20);
  assert.equal(remoteProxyPixelWidth(550), 16);
  assert.equal(remoteProxyPixelWidth(900), 16);
  assert.equal(remoteProxyPixelWidth(1_300), 12);
  assert.equal(remoteProxyPixelWidth(12_000), 12);

  for (const threshold of [350, 550, 900, 1_300]) {
    assert.ok(Math.abs(remoteProxyPixelWidth(threshold - 0.01) - remoteProxyPixelWidth(threshold + 0.01)) < 0.001);
  }
});

test('remote aircraft-contact marker never grows as distance increases', () => {
  let previous = remoteProxyPixelWidth(0);
  for (let distance = 1; distance <= 12_000; distance += 1) {
    const current = remoteProxyPixelWidth(distance);
    assert.ok(current <= previous, `marker grew at ${distance}m`);
    assert.ok(current >= 12 && current <= 20);
    previous = current;
  }
});

test('remote aircraft match Rear Guard size at range and physical size nearby, including hit areas', () => {
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  assert.equal(remoteAircraftScale, 16);
  assert.equal(remoteAircraftVisualScale(20), 1);
  assert.equal(remoteAircraftVisualScale(900), 16);
  assert.equal(remoteAircraftVisualScale(9_000), 16);
  assert.ok(remoteAircraftVisualScale(200) < remoteAircraftVisualScale(500));
  for (let distance = 1; distance <= 1_000; distance += 1) {
    const growth = remoteAircraftVisualScale(distance) - remoteAircraftVisualScale(distance - 1);
    assert.ok(growth >= 0 && growth <= 0.018, `abrupt scale change at ${distance}m`);
  }
  assert.match(main, /remoteAircraftVisualScale\(distance\)/);
  const traffic = readFileSync(new URL('../../client/src/ambient-traffic.ts', import.meta.url), 'utf8');
  assert.match(traffic, /remoteAircraftVisualScale\(distance\)/);
  assert.match(main, /remoteAircraftCollisionRadius\(remote\.aircraftType, distance\)/);
  assert.match(server, /remoteAircraftCollisionRadius\(second\.aircraftType, distance\)/);
  assert.match(server, /remoteAircraftContactRadius\(event\.eventAircraftType, distance\)/);
  assert.match(server, /player\.bot\?\.journeyRearGuardEscort \? remoteAircraftScale : remoteAircraftVisualScale\(distance\)/);
  for (const type of ['trainer', 'privateJet', 'cargo', 'fighter'] as const) {
    for (const distance of [20, 200, 900]) {
      const contact = remoteAircraftContactRadius(type, distance);
      assert.ok(contact > 0);
      assert.equal(remoteAircraftCollisionRadius(type, distance), contact + 2.5);
      assert.equal(remoteAircraftNearMissRadius(type, distance), contact + 12);
    }
  }
  assert.ok(remoteAircraftContactRadius('cargo', 500) > remoteAircraftContactRadius('trainer', 500));
  assert.ok(Math.abs(remoteAircraftContactRadius('fighter', 500) / remoteAircraftContactRadius('trainer', 500) - aircraftHitRadii.fighter / aircraftHitRadii.trainer) < 1e-12);
});

test('red/blue billboard markers track remote aircraft with authoritative name and altitude', () => {
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const update = main.slice(main.indexOf('function updateRemotePlayers('), main.indexOf('function updateLockCircle('));
  assert.match(main, /const plane = createAirplane\(player\.aircraftType, true\)/);
  assert.doesNotMatch(update, /remote\.plane\.scale|remote\.plane\.children\[[^\]]+\]\.scale/);
  assert.match(main, /new THREE\.Sprite\(material\)/, 'contact marker is camera-facing');
  assert.match(main, /context\.moveTo\(48, 3\)[\s\S]*context\.lineTo\(37, 25\)/, 'aircraft icon restored');
  assert.doesNotMatch(main.slice(main.indexOf('function createRemotePlayerProxy('), main.indexOf('function disposeRemotePlayerProxy(')),
    /context\.moveTo\(48, 15\)/, 'diamond icon removed');
  assert.match(main, /color: visualLanguage\[isBot \? 'ai' : 'player'\]\.color/);
  assert.match(update, /const contactHeight = Math\.max\(renderedScale \* 1\.2, worldPerPixel \* 12\)/);
  assert.match(update, /remote\.playerProxy\.position\.copy\(remote\.plane\.position\)\.addScaledVector\(cameraWorldUp, contactHeight\)/);
  assert.match(update, /remote\.identityTag\.position\.copy\(remote\.plane\.position\)\.addScaledVector\(cameraWorldUp,[\s\S]*contactHeight \+ worldPerPixel/);
  assert.match(main, /remote\.playerProxy\.scale\.set\(width, width \* \(2 \/ 3\), 1\)/);
  assert.match(update, /labelY >= 96 \+ halfLabelHeight/, 'name tag stays clear of the flight header');
  assert.match(main, /formatPilotAltitude\(altitudeMeters\)/);
  assert.match(update, /remote\.altitudeMeters \?\? humanRadarTracks\.get\(remote\.playerId\)\?\.altitudeMeters/);
  assert.match(main, /'ai'[\s\S]*formatRelativeAltitude\(remote\.altitudeMeters - altitudeAboveTerrain\(\)\)/,
    'bot radar retains relative altitude and uses the blue AI identity');
  assert.match(update, /remote\.identityTag\.scale\.set\(worldPerPixel/);
  assert.match(main, /remote\.plane\.visible = remote\.lifeState === 'alive'/);
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 20_000);
  const left = new THREE.Vector3();
  const right = new THREE.Vector3();
  let priorWidth = Infinity;
  for (const distance of [25, 100, 500, 1_500, 7_000]) {
    left.set(-5, 0, -distance).project(camera);
    right.set(5, 0, -distance).project(camera);
    const width = right.x - left.x;
    assert.ok(width > 0 && width < priorWidth, `perspective width at ${distance}m`);
    priorWidth = width;
  }
});

test('distant aircraft contacts keep their bearing and readable size beyond scenery range', async () => {
  const { default: vm } = await import('node:vm');
  const { default: ts } = await import('typescript');
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const start = main.indexOf('    const proxyMaterial = remote.playerProxy.material as THREE.SpriteMaterial;', main.indexOf('function updateRemotePlayers('));
  const end = main.indexOf('\n  }\n}', start);
  const code = ts.transpileModule(main.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, .1, 22000);
  camera.position.set(200, 1000, 500);
  camera.updateMatrixWorld(true);
  for (const distance of [13000, 60000, 220000]) {
    for (const identityVisible of [true, false]) {
      const plane = new THREE.Group();
      plane.position.copy(camera.position).add(new THREE.Vector3(distance * .2, 0, -distance));
      const before = plane.position.clone();
      const playerProxy = new THREE.Sprite(new THREE.SpriteMaterial());
      const context = vm.createContext({ remote: { plane, playerProxy }, identityVisible, distance,
        camera, cameraWorldUp: new THREE.Vector3(0,1,0), contactHeight: 100, worldPerPixel: distance * 2 * Math.tan(Math.PI / 6) / 1080,
        remoteProxyPixelWidth, selectedCombatTarget: null, COMBAT_RANGE: 6000 });
      vm.runInContext(code, context);
      assert.equal(playerProxy.visible, identityVisible);
      assert.deepEqual(plane.position, before, 'marker never moves the aircraft');
      if (!identityVisible) continue;
      const actual = playerProxy.position.clone().project(camera);
      const expected = plane.position.clone().add(new THREE.Vector3(0,100,0)).project(camera);
      assert.ok(Math.abs(actual.x - expected.x) < 1e-10 && Math.abs(actual.y - expected.y) < 1e-10, 'marker stays on the real aircraft bearing');
      assert.ok(actual.z > -1 && actual.z < 1, 'marker remains inside the camera clip range');
      const right = playerProxy.position.clone().add(new THREE.Vector3(playerProxy.scale.x / 2,0,0)).project(camera);
      assert.ok(Math.abs((right.x - actual.x) * 1920 - remoteProxyPixelWidth(distance)) < .001, 'pixel width stays constant');
    }
  }
});

test('aircraft contacts use blue AI and red human identity without fog hiding the marker', () => {
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const marker = main.slice(main.indexOf('function createRemotePlayerProxy('), main.indexOf('function disposeRemotePlayerProxy('));
  assert.match(marker, /color: visualLanguage\[isBot \? 'ai' : 'player'\]\.color/);
  assert.match(marker, /fog: false/);
  assert.match(marker, /depthTest: false/);
  assert.doesNotMatch(marker, /airAssaultMode/);
  assert.match(main, /\.color\.set\(visualLanguage\[remote\.isBot \? 'ai' : 'player'\]\.color\)/);
});
