import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');
const menu = readFileSync(new URL('../../client/src/pilot-menu.ts', import.meta.url), 'utf8');

test('Blue Gold Aurora exposes the approved centralized product palette', () => {
  for (const declaration of [
    '--ui-glass-main: rgb(24 52 74 / 78%)',
    '--ui-glass-main-strong: rgb(24 52 74 / 82%)',
    '--ui-glass-blue: rgb(23 117 223 / 16%)',
    '--ui-glass-cyan: rgb(57 169 249 / 14%)',
    '--ui-ocean-ink: #18344a',
    '--ui-text: #f4f8ff',
    '--ui-text-muted: #bfd5e5',
    '--ui-royal: #1775df',
    '--ui-cyan: #39a9f9',
    '--ui-gold: #F9B00A',
    '--ui-gold-light: #ffd05a',
    '--ui-crimson: #d0012d',
    '--ui-gradient-primary: linear-gradient(90deg, #f9b00a, #ffd05a)',
  ]) assert.ok(css.includes(declaration), `missing ${declaration}`);
});

test('Ocean Aurora and Sunset Glass palette remnants are removed', () => {
  for (const obsolete of [
    '--ui-glass-mist', '--ui-glass-aqua', '--ui-glass-sky', '--ui-glass-indigo',
    '--ui-teal', '--ui-indigo', '--ui-coral', '#2bb7a9', '#6672e8',
    'rgb(241 251 252', 'rgb(221 247 244', 'rgb(223 243 255',
    '--ui-glass-lavender', '--ui-glass-rose', '--ui-violet', '--ui-rose',
    '#7c6cf2', '#e66a9f', 'rgb(240 236 255', 'rgb(255 232 242',
  ]) assert.ok(!css.includes(obsolete), `obsolete theme token remains: ${obsolete}`);
});

test('major desktop and shared mobile surfaces use dark blue translucent glass', () => {
  for (const selector of ['.city-select-card', '.pilot-menu-card', '.garage-card', '.world-map-card']) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rule = css.match(new RegExp(`${escaped}\\s*\\{[^}]+\\}`))?.[0] ?? '';
    assert.match(rule, /background:\s*var\(--ui-bg-(?:strong|soft)\)/, selector);
    assert.match(rule, /color:\s*var\(--ui-text\)/, selector);
  }
  assert.match(css, /\.unified-flight-hud\s*\{[^}]+rgb\(24 52 74 \/ 72%\)[^}]+rgb\(23 117 223 \/ 18%\)/s);
  assert.match(css, /\.touch-stick\{[^}]+rgb\(24 52 74 \/ 22%\)/);
  assert.match(css, /#real-players\.expanded, #city-territories\.expanded\s*\{[^}]+rgb\(24 52 74 \/ 58%\)/s);
});

test('screen overlays preserve vivid game and launch backgrounds', () => {
  assert.match(css, /\.launch-background::after\s*\{[^}]+rgb\(24 52 74 \/ 10%\)/s);
  assert.match(css, /\.garage-overlay\s*\{[^}]+background:\s*transparent;/s);
  assert.match(css, /\.pilot-menu-overlay\s*\{[^}]+background:\s*transparent;/s);
  assert.match(css, /\.world-map-overlay\s*\{[^}]+background:\s*transparent;/s);
});

test('gold actions, blue selections, and crimson destructive actions stay distinct', () => {
  assert.match(css, /button\.pilot-menu-primary[^}]+var\(--ui-gradient-primary\)/s);
  assert.match(css, /\.pilot-menu-navigation button\.active[^}]+var\(--ui-gradient-selected\)/s);
  assert.match(css, /button\.pilot-menu-danger[^}]+rgb\(208 1 45 \/ 24%\)/s);
  assert.match(css, /\.touch-fire\.is-active[^}]+rgb\(208 1 45 \/ 78%\)/s);
  assert.match(menu, /intent:\s*'primary'/);
  assert.match(menu, /intent:\s*'danger'/);
});

test('decorative blue-cyan typography uses Tower Gold without recoloring blue chrome', () => {
  for (const selector of [
    '.pilot-menu-section h2',
    '.pilot-menu-navigation button.active',
    '.garage-aircraft.selected',
    '.world-map-card header strong',
    '.radar-title',
    '.active-mission-overlay strong',
    '.help-control-groups h2',
  ]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rule = css.match(new RegExp(`${escaped}\\s*\\{[^}]+\\}`))?.[0] ?? '';
    assert.match(rule, /color:\s*var\(--ui-gold\)/, selector);
  }
  assert.doesNotMatch(css, /(?:^|[;{])\s*color:\s*var\(--ui-cyan\)/m);
  assert.match(css, /\.pilot-menu-navigation button\.active[^}]+background:\s*var\(--ui-gradient-selected\)/s);
  assert.match(css, /\.garage-aircraft\.selected[^}]+border-color:\s*var\(--ui-cyan\)/s);
  assert.match(css, /\.airport-key\s*\{[^}]+color:\s*#73d8ed/s);
  assert.match(css, /\.city-territory-row\.you > strong\s*\{[^}]+color:\s*#82e9ff/s);
});
