import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');
const menu = readFileSync(new URL('../../client/src/pilot-menu.ts', import.meta.url), 'utf8');

test('readability tokens centralize body, display, size, and line-height choices', () => {
  for (const declaration of [
    '--font-display: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    '--font-body: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    '--text-primary: #f4f8ff',
    '--text-secondary: #c8d8e6',
    '--text-muted: #bfd5e5',
    '--font-body-size: 15px',
    '--font-meta-size: 13px',
    '--font-control-size: 14px',
    '--line-height-body: 1.5',
  ]) assert.ok(css.includes(declaration), `missing ${declaration}`);
  assert.match(css, /html,\s*body\s*\{[^}]+font:\s*500 var\(--font-body-size\)\/var\(--line-height-body\) var\(--font-body\)/s);
});

test('long-form UI copy uses the body stack while headings and actions keep display identity', () => {
  assert.match(css, /\.pilot-menu-section p\s*\{[^}]+var\(--font-body-size\)[^}]+var\(--font-body\)/s);
  assert.match(css, /\.map-intelligence\s*\{[^}]+var\(--font-meta-size\)[^}]+var\(--font-body\)/s);
  assert.match(css, /\.garage-details p\s*\{[^}]+var\(--font-body-size\)[^}]+var\(--font-body\)/s);
  assert.match(css, /\.tutorial-content p\s*\{[^}]+500 16px\/var\(--line-height-body\) var\(--font-body\)/s);
  assert.match(css, /\.pilot-menu-card button\s*\{[^}]+var\(--font-control-size\)[^}]+var\(--font-display\)/s);
  assert.match(css, /\.pilot-menu-section h2\s*\{[^}]+700 14px var\(--font-display\)/s);
});

test('mobile reading surfaces no longer use tiny body or touch-label sizes', () => {
  assert.match(css, /\.pilot-menu-section p\{[^}]+font-size:16px;[^}]*line-height:1\.45\}/);
  assert.match(css, /\.map-intelligence\{[^}]+font-size:13px\}/);
  assert.match(css, /\.touch-controls button\{[^}]+var\(--font-control-size\) var\(--font-display\)/);
  assert.match(css, /\.active-mission-overlay \{[^}]+font-size: 13px;/);
  assert.doesNotMatch(css, /\.unified-flight-hud small\{font-size:6px\}/);
});

test('territory detail copy uses readable units and plain-language guidance', () => {
  assert.match(menu, /territory\.distance >= 1000/);
  assert.match(menu, /km away/);
  assert.match(menu, /Contested • Capture paused •/);
  assert.match(menu, /Keep flying inside this territory to claim it\. Parking does not count\./);
  assert.doesNotMatch(menu, /Keep flying here to claim it/);
});
