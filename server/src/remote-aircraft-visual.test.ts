import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { remoteProxyPixelWidth } from '../../shared/remote-aircraft-visual-rules.mjs';

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

test('red/blue billboard markers track true-scale aircraft with authoritative name and altitude', () => {
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const update = main.slice(main.indexOf('function updateRemotePlayers('), main.indexOf('function updateLockCircle('));
  assert.match(main, /const plane = createAirplane\(player\.aircraftType, true\)/);
  assert.doesNotMatch(update, /remote\.plane\.scale|remote\.plane\.children\[[^\]]+\]\.scale/);
  assert.match(main, /new THREE\.Sprite\(material\)/, 'contact marker is camera-facing');
  assert.match(main, /context\.moveTo\(48, 3\)[\s\S]*context\.lineTo\(37, 25\)/, 'aircraft icon restored');
  assert.doesNotMatch(main.slice(main.indexOf('function createRemotePlayerProxy('), main.indexOf('function disposeRemotePlayerProxy(')),
    /context\.moveTo\(48, 15\)/, 'diamond icon removed');
  assert.match(main, /color: visualLanguage\[isBot \? 'ai' : 'player'\]\.color/);
  assert.match(main, /remote\.playerProxy\.position\.copy\(remote\.plane\.position\)\.addScaledVector\(cameraWorldUp, Math\.max\(5\.5,/);
  assert.match(main, /remote\.playerProxy\.scale\.set\(width, width \* \(2 \/ 3\), 1\)/);
  assert.match(update, /labelY >= 50 \+ halfLabelHeight/, 'name tag stays clear of the flight header');
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
