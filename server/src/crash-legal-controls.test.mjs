import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { policyPage } from './legal-pages.ts';
import { legalConfig } from '../../shared/legal-config.mjs';

const html = readFileSync(new URL('../../client/index.html', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../../client/src/entry.ts', import.meta.url), 'utf8');
const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('../../client/src/bootstrap.ts', import.meta.url), 'utf8');
const brand = readFileSync(new URL('../../client/src/brand.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');
const viteConfig = readFileSync(new URL('../../client/vite.config.ts', import.meta.url), 'utf8');

test('crash dialog exposes one shared restart and tutorial recovery only through city capability', () => {
  assert.match(html, /data-crash-restart>RESTART FLIGHT/);
  assert.match(main, /\[data-crash-restart\][^\n]+restartGame\(\)/);
  assert.match(main, /cityRules\.tutorialEnabled && guidedTutorialActive/);
  assert.match(html, /data-tutorial-retry>RETRY TUTORIAL/);
  assert.match(html, /data-tutorial-free>CONTINUE FREE PRACTICE/);
  assert.doesNotMatch(html, /crash-brand-signature|Press R to Restart/);
  assert.doesNotMatch(bootstrap, /crash-brand-signature|mountGameBrandSignature/);
});

test('all public legal and support routes render standalone pages', () => {
  assert.deepEqual(legalConfig.policyRoutes, { terms: '/terms', privacy: '/privacy', refund: '/refund', support: '/support' });
  for (const [route, title] of [
    ['/terms', 'Terms of Use'],
    ['/privacy', 'Privacy Notice'],
    ['/refund', 'Digital Purchase & Refund Policy'],
    ['/support', 'Support'],
  ]) {
    const page = policyPage(route);
    assert.ok(page, `${route} did not render`);
    assert.match(page, new RegExp(`<h1>${title.replace('&', '&amp;')}</h1>`));
    assert.doesNotMatch(page, /CHOOSE A CITY/);
  }
  assert.match(viteConfig, /const page = policyPage\(pathname\)/);
  assert.match(viteConfig, /configureServer[^\n]+publicPageMiddleware/);
  assert.match(viteConfig, /configurePreviewServer[^\n]+publicPageMiddleware/);
  assert.match(html, /src="\/src\/entry\.ts"/);
  assert.doesNotMatch(html, /src="\/src\/bootstrap\.ts"/);
  assert.match(entry, /policyPage\(window\.location\.pathname\)/);
  assert.match(entry, /if \(standalonePage\)[\s\S]+document\.write\(standalonePage\)[\s\S]+else \{\s*void import\('\.\/bootstrap'\)/);
  assert.match(brand, /\['Support', legalConfig\.policyRoutes\.support\]/);
  assert.match(policyPage('/terms'), /h2\{[^}]+color:#F9B00A/);
  assert.match(policyPage('/terms'), /a\{color:#F9B00A\}/);
});

test('desktop controls bar is centered, single-line, gold, and still hidden for touch layouts', () => {
  const bar = css.match(/\.desktop-controls-help\s*\{[^}]+\}/s)?.[0] ?? '';
  assert.match(bar, /left:\s*50%/);
  assert.match(bar, /transform:\s*translateX\(-50%\)/);
  assert.match(bar, /color:\s*var\(--ui-gold\)/);
  assert.match(css, /\.desktop-controls-help-items\s*\{[^}]+flex-wrap:\s*nowrap/s);
  assert.match(css, /\.desktop-controls-help-items span\s*\{[^}]+white-space:\s*nowrap/s);
  assert.match(css, /\.desktop-controls-help button\s*\{[^}]+color:\s*var\(--ui-gold\)/s);
  assert.match(css, /\.desktop-controls-help kbd\s*\{[^}]+color:\s*var\(--ui-gold\)/s);
  assert.match(css, /\.touch-controls-active \.desktop-controls-help\{display:none!important\}/);
  assert.doesNotMatch(css, /desktop-controls-help:not\(\.is-collapsed\)\{right:/);
});
