import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const manager = read('client/src/audio-manager.ts');
const main = read('client/src/main.ts');
const bootstrap = read('client/src/bootstrap.ts');
const menu = read('client/src/pilot-menu.ts');
const styles = read('client/src/style.css');

test('one AudioManager owns Web Audio categories, lifecycle, and a single menu loop', () => {
  assert.match(manager, /type AudioCategory = 'music' \| 'ui' \| 'engine' \| 'weapons' \| 'impacts'/);
  assert.match(manager, /private musicTimer: number \| null = null/);
  assert.match(manager, /if \(!context \|\| context\.state !== 'running' \|\| !this\.musicMix \|\| this\.musicTimer !== null/);
  assert.match(manager, /document\.addEventListener\('visibilitychange'/);
  assert.match(manager, /void context\.suspend\(\)/);
  assert.doesNotMatch(main, /new AudioContext\(/);
  assert.match(main, /audioManager\.updateEngine/);
});

test('iOS foreground recovery coalesces lifecycle signals and rebuilds stale continuous sources', () => {
  const sceneDelegate = read('ios/App/App/SceneDelegate.swift');
  assert.match(manager, /type ExtendedAudioContextState = AudioContextState \| 'interrupted'/);
  assert.match(manager, /const FOREGROUND_RESUME_DELAYS_MS = \[0, 90, 220\] as const/);
  assert.match(manager, /window\.addEventListener\('airport-chaos-native-app-state'/);
  assert.match(manager, /if \(this\.lifecycleResume \|\| this\.lifecycleRecoveryTimer !== null\) return/);
  assert.match(manager, /await context\.resume\(\)/);
  assert.match(manager, /if \(this\.contextState\(context\) === 'running'\) return true/);
  assert.match(manager, /context = this\.rebuildContext\(/);
  assert.match(manager, /void previous\.close\(\)/);
  assert.match(manager, /this\.restoreLogicalAudioState\(\)/);
  assert.match(manager, /if \(this\.menuMusicDesired\)[\s\S]*this\.startMenuMusic\(\)/);
  assert.match(manager, /this\.enginePresentation[\s\S]*this\.applyEnginePresentation/);
  assert.match(sceneDelegate, /sceneDidBecomeActive[\s\S]*emitAudioLifecycle\("active"\)/);
  assert.match(sceneDelegate, /sceneDidEnterBackground[\s\S]*emitAudioLifecycle\("background"\)/);
  assert.match(sceneDelegate, /webView\.url != nil,[\s\S]*!webView\.isLoading/);
  assert.match(sceneDelegate, /triggerJSEvent\([\s\S]*airport-chaos-native-app-state/);
});

test('existing engine and gunfire synthesis remain on their established call paths', () => {
  assert.match(main, /function playFireSound\(\): void \{[\s\S]*150, 0\.075, 'sawtooth'[\s\S]*360, 0\.045, 'square'/);
  assert.match(main, /function updateEngineAudio\(\): void \{[\s\S]*currentSpeed \/ currentAircraft\.maxSpeed/);
  assert.match(main, /audioManager\.updateEngine\([\s\S]*profile\.base \+ engineAmount \* profile\.range/);
});

test('menu audio is continuous across entry screens and fades for flight', () => {
  assert.match(bootstrap, /audioManager\.setMenuMusicDesired\(true\)/);
  assert.match(bootstrap, /function showHome[\s\S]*audioManager\.setMenuMusicDesired\(true\)/);
  assert.match(bootstrap, /function showSelector[\s\S]*audioManager\.setMenuMusicDesired\(true\)/);
  assert.match(bootstrap, /entryState = 'FLIGHT';\s*audioManager\.setMenuMusicDesired\(false\)/);
  assert.match(manager, /exponentialRampToValueAtTime\(desired \? 1 : 0\.0001/);
});

test('combat-ready menu revision uses a 100 BPM long-form lift and clean loop transition', () => {
  assert.match(manager, /const stepDuration = 60 \/ 100 \/ 4/);
  assert.match(manager, /this\.musicStep = \(this\.musicStep \+ 1\) % 128/);
  assert.match(manager, /const intro = step < 16/);
  assert.match(manager, /scheduleMusicPulse/);
  assert.match(manager, /scheduleMusicImpact/);
  assert.match(manager, /\[12, 60, 124\]\.includes\(step\).*scheduleMusicRiser/);
  assert.match(
    manager,
    /\['sine', 'triangle', 'sawtooth'\][\s\S]*const harmonic = index === 0 \? 1 : index === 1 \? 2 : 4/,
  );
});

test('FLY confirmation is layered, music-ducked, and guarded against stacking', () => {
  assert.match(manager, /if \(now < this\.confirmActiveUntil\) return/);
  assert.match(manager, /linearRampToValueAtTime\(0\.72, now \+ 0\.055\)/);
  assert.match(manager, /linearRampToValueAtTime\(1, now \+ 1\.05\)/);
  assert.match(manager, /scheduleConfirmMechanicalLock\(now\)/);
  assert.match(manager, /scheduleConfirmPowerRise\(now \+ 0\.105\)/);
  assert.match(manager, /scheduleConfirmHeroicSting\(now \+ 0\.54\)/);
});

test('non-targeted back, destroy, engine, and weapon sounds retain their synthesis paths', () => {
  assert.match(manager, /playBack\(\)[\s\S]*playPitchDrop\('ui', 185, 88, 0\.11, 0\.085/);
  assert.match(manager, /playDestroyConfirm\(\)[\s\S]*playPitchDrop\('impacts', 82, 29, 0\.52, 0\.42/);
  assert.match(main, /function playFireSound\(\): void \{[\s\S]*150, 0\.075, 'sawtooth'[\s\S]*360, 0\.045, 'square'/);
  assert.match(main, /audioManager\.updateEngine/);
});

test('final music mix reduces sub weight and raises controlled percussion and heroic harmonics', () => {
  assert.match(manager, /envelope\.gain\.setValueAtTime\(0\.102 \* strength/);
  assert.match(manager, /\['sine', 'triangle', 'sawtooth'\]/);
  assert.match(manager, /filter\.frequency\.value = 5_900/);
  assert.match(manager, /filter\.frequency\.linearRampToValueAtTime\(2_450/);
  assert.match(manager, /oscillator\.frequency\.value = detune < 0 \? frequency : frequency \* 2/);
  assert.match(manager, /40: \[196, 246\.94, 329\.63\]/);
  assert.match(manager, /56: \[174\.61, 261\.63, 349\.23\]/);
});

test('canonical final cue family covers hit, reward, and purchase without retrigger spam', () => {
  assert.match(manager, /playHitConfirm\(\)[\s\S]*if \(now < this\.hitActiveUntil\) return/);
  assert.match(manager, /playReward\(\)[\s\S]*scheduleRewardRise\(now\)/);
  assert.match(manager, /playPurchaseSuccess\(\)[\s\S]*schedulePurchaseFinish/);
  assert.doesNotMatch(main, /function playHitSound/);
  assert.match(main, /audioManager\.playHitConfirm\(\)/);
  assert.match(main, /message\.killerId === localPlayerId[\s\S]*audioManager\.playDestroyConfirm\(\)/);
});

test('shared UI delegation and authoritative kill-confirm routing are present', () => {
  assert.match(manager, /document\.addEventListener\('click'/);
  assert.match(manager, /\bback\|close\|cancel\|return\b/);
  assert.match(manager, /\\b\(fly\|play\|launch\)\\b\/i/);
  assert.match(main, /message\.killerId === localPlayerId[\s\S]*audioManager\.playDestroyConfirm\(\)/);
});

test('temporary development audio presentation and trim plumbing are completely removed', () => {
  const removedTokens = [
    ['VITE', 'AUDIO', 'QA'].join('_'),
    ['audio', 'test'].join('-'),
    ['install', 'Dev', 'Panel'].join(''),
    ['dev', 'Music', 'Trim'].join(''),
    ['dev', 'Sfx', 'Trim'].join(''),
  ];
  for (const token of removedTokens) {
    assert.equal(manager.includes(token), false);
    assert.equal(styles.includes(token), false);
  }
});

test('settings expose music and preserve established engine combat and UI controls', () => {
  assert.match(menu, /\['master', 'music', 'engine', 'combat', 'ui'\]/);
  assert.match(bootstrap, /audioManager\.setLevel\(category, value\)/);
});
