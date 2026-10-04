import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

type EscapeEvent = { code: string; key: string; repeat: boolean; preventDefault: () => void; stopImmediatePropagation: () => void };
type BackLayer = { id: string; priority: number; isActive: () => boolean; close: () => void; containsTarget?: (target: EventTarget | null) => boolean };
const navigation = await import(new URL('../../client/src/ui-back-navigation.ts', import.meta.url).href) as {
  closeTopUiLayer: () => boolean;
  handleUiClickAway: (event: { target: EventTarget | null; cancelable: boolean; preventDefault: () => void; stopImmediatePropagation: () => void }) => boolean;
  handleUiEscape: (event: EscapeEvent) => boolean;
  registerUiBackLayer: (layer: BackLayer) => () => void;
  uiBackPriority: { surface: number; menu: number; modal: number };
};
const { closeTopUiLayer, handleUiClickAway, handleUiEscape, registerUiBackLayer, uiBackPriority } = navigation;

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

test('click-away closes and consumes only an outside pointer', () => {
  const inside = new EventTarget();
  const outside = new EventTarget();
  let active = true;
  let prevented = 0;
  let stopped = 0;
  const unregister = registerUiBackLayer({
    id: 'test-click-away', priority: uiBackPriority.menu, isActive: () => active,
    containsTarget: (target) => target === inside,
    close: () => { active = false; },
  });
  const event = (target: EventTarget) => ({ target, cancelable: true,
    preventDefault: () => { prevented += 1; }, stopImmediatePropagation: () => { stopped += 1; } });
  try {
    assert.equal(handleUiClickAway(event(inside)), false);
    assert.equal(active, true);
    assert.equal(handleUiClickAway(event(outside)), true);
    assert.equal(active, false);
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
  assert.match(main, /id: 'training-session'[\s\S]*priority: uiBackPriority\.surface - 1/);
  assert.match(tutorial, /id: 'flight-tutorial'[\s\S]*priority: uiBackPriority\.blockingModal/);
  assert.doesNotMatch(tutorial, /event\.key === 'Escape'\)[^{]*\{[^}]*this\.close/);
  assert.match(bootstrap, /id: 'city-selection'[\s\S]*close: returnFromCitySelection/);
  assert.doesNotMatch(bootstrap, /cityHome|cityClose/);
  assert.match(bootstrap, /cityBack\.addEventListener\('click', \(\) => showSelector\(\)\)/);
});

test('canonical closable panels expose their real content boundary to shared click-away', () => {
  const bootstrap = read('client/src/bootstrap.ts');
  const main = read('client/src/main.ts');
  for (const id of ['city-selection']) {
    assert.match(bootstrap, new RegExp(`id: '${id}'[\\s\\S]*?containsTarget:`));
  }
  for (const id of ['flight-recap', 'practice-city-suggestion', 'training-intro', 'contextual-hint', 'mission-reminder']) {
    assert.match(main, new RegExp(`id: '${id}'[\\s\\S]*?containsTarget:`));
  }
  const dialog = read('client/src/flight-dialog.ts');
  assert.match(dialog, /id: 'flight-decision'[\s\S]*?containsTarget:/);
});
