import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

type EscapeEvent = { code: string; key: string; repeat: boolean; preventDefault: () => void; stopImmediatePropagation: () => void };
type BackLayer = { id: string; priority: number; isActive: () => boolean; close: () => void };
const navigation = await import(new URL('../../client/src/ui-back-navigation.ts', import.meta.url).href) as {
  closeTopUiLayer: () => boolean;
  handleUiEscape: (event: EscapeEvent) => boolean;
  registerUiBackLayer: (layer: BackLayer) => () => void;
  uiBackPriority: { surface: number; menu: number; modal: number };
};
const { closeTopUiLayer, handleUiEscape, registerUiBackLayer, uiBackPriority } = navigation;

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('universal UI back closes only the highest-priority active layer', () => {
  const active = { surface: true, menu: true, modal: true };
  const closed: string[] = [];
  const unregister = [
    registerUiBackLayer({ id: 'test-surface', priority: uiBackPriority.surface, isActive: () => active.surface, close: () => { active.surface = false; closed.push('surface'); } }),
    registerUiBackLayer({ id: 'test-menu', priority: uiBackPriority.menu, isActive: () => active.menu, close: () => { active.menu = false; closed.push('menu'); } }),
    registerUiBackLayer({ id: 'test-modal', priority: uiBackPriority.modal, isActive: () => active.modal, close: () => { active.modal = false; closed.push('modal'); } }),
  ];
  try {
    assert.equal(closeTopUiLayer(), true);
    assert.deepEqual(closed, ['modal']);
    assert.equal(closeTopUiLayer(), true);
    assert.deepEqual(closed, ['modal', 'menu']);
    assert.equal(closeTopUiLayer(), true);
    assert.deepEqual(closed, ['modal', 'menu', 'surface']);
    assert.equal(closeTopUiLayer(), false);
  } finally { unregister.reverse().forEach(remove => remove()); }
});

test('Escape ignores key repeat and consumes one layer per fresh keydown', () => {
  let active = true;
  let prevented = 0;
  let stopped = 0;
  const unregister = registerUiBackLayer({ id: 'test-repeat', priority: uiBackPriority.menu, isActive: () => active, close: () => { active = false; } });
  const event = (repeat: boolean) => ({ code: 'Escape', key: 'Escape', repeat,
    preventDefault: () => { prevented += 1; }, stopImmediatePropagation: () => { stopped += 1; } });
  try {
    assert.equal(handleUiEscape(event(true)), false);
    assert.equal(active, true);
    assert.equal(handleUiEscape(event(false)), true);
    assert.equal(active, false);
    assert.equal(handleUiEscape(event(false)), false);
    assert.equal(prevented, 1);
    assert.equal(stopped, 1);
  } finally { unregister(); }
});

test('screens register with the shared back stack and old Escape close branches are removed', () => {
  const entry = read('client/src/entry.ts');
  const main = read('client/src/main.ts');
  const menu = read('client/src/pilot-menu.ts');
  const garage = read('client/src/garage.ts');
  const map = read('client/src/world-map.ts');
  const tutorial = read('client/src/tutorial.ts');
  const bootstrap = read('client/src/bootstrap.ts');
  assert.match(entry, /installUniversalEscapeHandler\(\)/);
  assert.doesNotMatch(main, /event\.code === 'Escape'/);
  assert.match(menu, /sectionHistory\.push\(this\.activeSection\)/);
  assert.match(menu, /close: \(\) => this\.backOrClose\(\)/);
  assert.match(garage, /registerUiBackLayer[\s\S]*close: \(\) => this\.close\(\)/);
  assert.match(map, /id: 'world-map'[\s\S]*close: \(\) => this\.setOpen\(false\)/);
  assert.match(tutorial, /id: 'flight-tutorial'[\s\S]*priority: uiBackPriority\.blockingModal/);
  assert.doesNotMatch(tutorial, /event\.key === 'Escape'\)[^{]*\{[^}]*this\.close/);
  assert.match(bootstrap, /id: 'city-selection'[\s\S]*close: returnFromCitySelection/);
  assert.match(bootstrap, /cityHome\.addEventListener\('click', closeTopUiLayer\)/);
  assert.match(bootstrap, /cityClose\.addEventListener\('click', closeTopUiLayer\)/);
});
