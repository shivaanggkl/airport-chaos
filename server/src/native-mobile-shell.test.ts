import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readProjectFile = (path: string): string =>
  readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('native shell uses the shared bundled web build with edge-to-edge system bars', () => {
  const config = readProjectFile('capacitor.config.ts');
  const html = readProjectFile('client/index.html');

  assert.match(config, /webDir: 'client\/dist'/);
  assert.match(config, /insetsHandling: 'native'/);
  assert.match(config, /initialViewportFitValueHint: 'cover'/);
  assert.match(config, /hidden: true/);
  assert.match(html, /viewport-fit=cover/);
});

test('iOS supports only the two landscape orientations and restores landscape on activation', () => {
  const plist = readProjectFile('ios/App/App/Info.plist');
  const sceneDelegate = readProjectFile('ios/App/App/SceneDelegate.swift');

  assert.match(plist, /<key>UIRequiresFullScreen<\/key>\s*<true\/>/);
  assert.equal(plist.match(/UIInterfaceOrientationLandscapeLeft/g)?.length, 2);
  assert.equal(plist.match(/UIInterfaceOrientationLandscapeRight/g)?.length, 2);
  assert.doesNotMatch(plist, /UIInterfaceOrientationPortrait/);
  assert.match(sceneDelegate, /requestGeometryUpdate\(\.iOS\(interfaceOrientations: \.landscape\)\)/);
  assert.match(sceneDelegate, /sceneDidBecomeActive/);
});

test('Android uses sensor landscape, edge-to-edge, and an action-bar-free launch theme', () => {
  const manifest = readProjectFile('android/app/src/main/AndroidManifest.xml');
  const activity = readProjectFile('android/app/src/main/java/com/vadensoftware/airportchaos/MainActivity.java');
  const styles = readProjectFile('android/app/src/main/res/values/styles.xml');

  assert.match(manifest, /android:screenOrientation="sensorLandscape"/);
  assert.match(activity, /EdgeToEdge\.enable\(this\);\s*super\.onCreate\(savedInstanceState\);/);
  assert.match(styles, /name="AppTheme\.NoActionBarLaunch" parent="AppTheme\.NoActionBar"/);
});

test('interrupted mobile pointers are released and native gesture blocking exempts form controls', () => {
  const entry = readProjectFile('client/src/entry.ts');
  const mobileInput = readProjectFile('client/src/mobile-input.ts');
  const main = readProjectFile('client/src/main.ts');

  assert.match(entry, /input, textarea, select, \[contenteditable="true"\], a/);
  assert.match(mobileInput, /lostpointercapture/);
  assert.match(mobileInput, /releasePointerCapture/);
  assert.match(mobileInput, /window\.addEventListener\('pageshow'/);
  assert.match(main, /window\.addEventListener\('blur', resetCameraPointers\)/);
  assert.match(main, /window\.addEventListener\('pagehide', resetCameraPointers\)/);
});

test('local stability diagnostics expose frame, scene, streaming, and realtime costs without a production telemetry path', () => {
  const main = readProjectFile('client/src/main.ts');

  assert.match(main, /const stabilityQaTiming = stabilityQaMode \?/);
  assert.match(main, /frame ms avg\/max/);
  assert.match(main, /scene objects .* meshes/);
  assert.match(main, /sockets created\/open\/close\/reconnect/);
  assert.match(main, /if \(cityWorld\.updateWorldStreaming\) cityWorld\.updateWorldStreaming/);
  assert.doesNotMatch(main, /updateOsmCityChunks\(airplane\.position\);\s*cityWorld\.updateWorldStreaming/);
});
