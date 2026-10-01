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
  assert.match(entry, /gesturestart[\s\S]*gesturechange[\s\S]*gestureend/);
  assert.match(entry, /event\.touches\.length > 1[\s\S]*preventNativeGameplayZoom/);
  assert.match(entry, /touchend[\s\S]*gameplayControlTarget\(event\)[\s\S]*event\.preventDefault/);
  assert.match(entry, /dblclick[\s\S]*gameplayGestureTarget\(event\)[\s\S]*event\.preventDefault/);
  assert.match(entry, /selectstart[\s\S]*event\.preventDefault/);
  assert.match(entry, /window\.getSelection\(\)[\s\S]*selection\.removeAllRanges\(\)/);
  assert.match(mobileInput, /lostpointercapture/);
  assert.match(mobileInput, /releasePointerCapture/);
  assert.match(mobileInput, /window\.addEventListener\('resize', \(\) => \{\s*this\.reset\(\);\s*this\.refresh\(\)/);
  assert.match(mobileInput, /window\.addEventListener\('orientationchange',[\s\S]*this\.reset\(\);[\s\S]*this\.refresh\(\)/);
  assert.match(mobileInput, /window\.addEventListener\('pageshow'/);
  assert.match(main, /window\.addEventListener\('blur', resetCameraPointers\)/);
  assert.match(main, /window\.addEventListener\('pagehide', resetCameraPointers\)/);
});

test('gameplay surfaces block native zoom and selection without changing the viewport or profile forms', () => {
  const entry = readProjectFile('client/src/entry.ts');
  const css = readProjectFile('client/src/style.css');
  const html = readProjectFile('client/index.html');

  assert.match(html, /width=device-width, initial-scale=1\.0, viewport-fit=cover/);
  assert.doesNotMatch(html, /maximum-scale|user-scalable/);
  assert.match(css, /#game-root > :not\(#pilot-menu-overlay\)[\s\S]*-webkit-touch-callout:\s*none;[\s\S]*-webkit-user-select:\s*none;[\s\S]*user-select:\s*none;/);
  assert.match(css, /:is\(\.native-shell, \.touch-controls-enabled\) #game-root > :not\(#pilot-menu-overlay\):not\(\.world-map-overlay\)[\s\S]*touch-action:\s*none;/);
  assert.match(entry, /target\.closest\('#pilot-menu-overlay'\)/);
  assert.match(css, /\.pilot-menu-content[^}]*touch-action:\s*pan-y/);
});

test('profile keyboard recovery tracks VisualViewport and restores the normal layout after dismissal', () => {
  const entry = readProjectFile('client/src/entry.ts');
  const viewport = readProjectFile('client/src/mobile-viewport.ts');
  const css = readProjectFile('client/src/style.css');
  const html = readProjectFile('client/index.html');

  assert.match(viewport, /scale <= 1\.01 && height >= baselineHeight - 2/);
  assert.match(entry, /installEditableViewportRecovery\(nativeShell \|\| matchMedia\('\(pointer: coarse\)'\)\.matches\)/);
  assert.match(viewport, /window\.visualViewport/);
  assert.match(viewport, /focusin[\s\S]*#pilot-menu-overlay[\s\S]*focusout/);
  assert.match(viewport, /viewport\.addEventListener\('resize'[\s\S]*viewport\.addEventListener\('scroll'/);
  assert.match(viewport, /clearTemporaryLayout[\s\S]*classList\.remove\('editable-keyboard-open'\)/);
  assert.match(viewport, /restoreScrollOrigin[\s\S]*window\.scrollTo\(\{ left: 0, top: 0, behavior: 'instant' \}\)/);
  assert.match(viewport, /awaitingRecovery[\s\S]*editableViewportRecovered[\s\S]*finishViewportRecovery/);
  assert.match(viewport, /finishViewportRecovery[\s\S]*window\.dispatchEvent\(new Event\('resize'\)\)/);
  assert.match(css, /\.native-shell\.editable-keyboard-open \.pilot-menu-overlay\s*\{[^}]*top: var\(--editable-viewport-top\)[^}]*width: var\(--editable-viewport-width\)[^}]*height: var\(--editable-viewport-height\)/);
  assert.match(css, /:is\(\.native-shell, \.touch-controls-enabled\)[^{]*input:not\(\[type='range'\]\)[^{]*\{[^}]*font-size:\s*16px/);
  assert.doesNotMatch(html, /maximum-scale|user-scalable/);
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
