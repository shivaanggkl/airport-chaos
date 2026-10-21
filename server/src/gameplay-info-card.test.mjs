import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

class FakeElement {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => this.classes.add(name)),
      contains: name => this.classes.has(name),
      toggle: (name, force) => {
        const enabled = force ?? !this.classes.has(name);
        if (enabled) this.classes.add(name); else this.classes.delete(name);
        return enabled;
      },
    };
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this._text = '';
  }
  set className(value) { this.classes = new Set(value.split(/\s+/).filter(Boolean)); }
  get className() { return [...this.classes].join(' '); }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => typeof child === 'string' ? child : child.textContent).join(''); }
  append(...children) { this.children.push(...children); }
  insertBefore(child, before) { this.children.splice(this.children.indexOf(before), 0, child); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name); }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  dispatch(name, key) { this.listeners.get(name)?.({ key, preventDefault() {}, stopPropagation() {} }); }
  focus() { this.focused = true; }
}

globalThis.document = { createElement: tag => new FakeElement(tag) };
const { GameplayInfoCard } = await import('../../client/src/gameplay-info-card.ts');
const { PlayersPanel, CityTerritoriesPanel } = await import('../../client/src/players-panel.ts');

test('one card swaps mission content for one multiplayer tab, then resets between sessions', () => {
  const root = new FakeElement('div');
  const mission = new FakeElement('strong');
  mission.textContent = 'M1: Rookie Rush';
  root.append(mission);
  const card = new GameplayInfoCard(root);
  card.setMode('mission');
  assert.equal(root.classList.contains('hidden'), false);
  assert.equal(root.classList.contains('is-multiplayer'), false);
  assert.equal(root.children[1].hidden, true);
  card.setMode('multiplayer');
  assert.equal(root.classList.contains('is-multiplayer'), true);
  assert.equal(root.children[1].hidden, false);
  const [playersTab, territoriesTab] = root.children[1].children[0].children;
  assert.equal(playersTab.getAttribute('aria-selected'), 'true');
  territoriesTab.dispatch('click');
  assert.equal(territoriesTab.getAttribute('aria-selected'), 'true');
  assert.equal(card.playersRoot.hidden, true);
  assert.equal(card.territoriesRoot.hidden, false);
  territoriesTab.dispatch('keydown', 'ArrowLeft');
  assert.equal(playersTab.getAttribute('aria-selected'), 'true');
  assert.equal(playersTab.focused, true);
  root.children[2].dispatch('click');
  assert.equal(root.classList.contains('is-collapsed'), true);
  assert.equal(root.children[2].getAttribute('aria-expanded'), 'false');
  card.setCount('players', 3);
  card.reset();
  assert.equal(root.classList.contains('is-collapsed'), false);
  assert.equal(card.activeTab, 'players');
  assert.equal(playersTab.children[1].textContent, '0');
  card.setMode('none');
  assert.equal(root.classList.contains('hidden'), true);
});

test('training mounts inside the shared flight card and uses its control lane', () => {
  const root = new FakeElement('div');
  const tutorial = new FakeElement('section');
  const card = new GameplayInfoCard(root);
  card.attachTutorial(tutorial);
  card.setMode('tutorial');
  assert.equal(root.children.at(-1), tutorial);
  assert.equal(root.classList.contains('is-tutorial'), true);
  assert.equal(root.classList.contains('hidden'), false);
  assert.equal(root.children[0].hidden, true);
  card.setMode('multiplayer');
  assert.equal(root.classList.contains('is-tutorial'), false);
  assert.equal(root.children[0].hidden, false);
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /gameplayInfoCard\.attachTutorial\(tutorialPanel\)/);
  assert.match(main, /const showInfoCard=panelStage\|\|guidedTutorialActive/);
});

test('server roster and territory updates fill scroll lists without a row cap or stale rows', () => {
  const root = new FakeElement('div');
  const card = new GameplayInfoCard(root);
  card.setMode('multiplayer');
  const players = new PlayersPanel(card.playersRoot, count => card.setCount('players', count));
  const territories = new CityTerritoriesPanel(card.territoriesRoot, count => card.setCount('territories', count));
  const roster = Array.from({ length: 12 }, (_, index) => ({
    playerId: `pilot-${index}`, displayName: `Pilot ${index}`, score: index * 10,
    masteryLevel: 2, status: 'flying', altitudeMeters: 2129 + index * 100,
  }));
  players.update(roster, 'pilot-0');
  assert.equal(card.playersRoot.children.filter(row => row.classList.contains('human-player-row') && !row.hidden).length, 12);
  assert.equal(card.playersRoot.children[0].children[1].textContent, '110 PTS');
  assert.equal(root.children[0].children[0].children[0].children[1].textContent, '12');
  roster[0].score = 999;
  players.update(roster.slice(0, 2), 'pilot-0');
  assert.equal(card.playersRoot.children.filter(row => row.classList.contains('human-player-row') && !row.hidden).length, 2);
  assert.match(card.playersRoot.children[0].textContent, /6,985 FT999 PTS/);
  assert.match(card.playersRoot.children[0].getAttribute('aria-label'), /YOU, FLYING, altitude 6,985 FT, current flight score 999/);
  roster[1].altitudeMeters = 3000;
  players.update(roster.slice(0, 2), 'pilot-0');
  assert.match(card.playersRoot.children[1].textContent, /9,843 FT10 PTS/);
  delete roster[1].altitudeMeters;
  players.update(roster.slice(0, 2), 'pilot-0');
  assert.doesNotMatch(card.playersRoot.children[1].textContent, /FT/);
  const areas = Array.from({ length: 9 }, (_, index) => ({
    name: `Area ${index}`, color: '#59cbef', controllerId: index < 2 ? `pilot-${index}` : undefined,
    contested: false, captureProgress: index === 2 ? 60 : 0,
  }));
  territories.update(areas, 'pilot-0');
  assert.equal(card.territoriesRoot.children.filter(row => row.classList.contains('city-territory-row') && !row.hidden).length, 9);
  assert.equal(root.children[0].children[0].children[1].children[1].textContent, '2');
  assert.match(card.territoriesRoot.children[2].textContent, /60%/);
  territories.update([], null, false);
  assert.equal(card.territoriesRoot.children.filter(row => row.classList.contains('city-territory-row') && !row.hidden).length, 0);
});

test('card keeps shared responsive placement and internal touch scrolling', () => {
  const css = readFileSync(new URL('../../client/src/style.css', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../../client/index.html', import.meta.url), 'utf8');
  assert.match(css, /#game-root \.mission-status-layer\.journey-status-layer\s*\{[^}]*width: min\(clamp\(210px, 28vw, 260px\)/);
  assert.match(css, /#game-root \.gameplay-info-card\.is-multiplayer\s*\{[^}]*height: clamp\(104px, 24dvh, 124px\)/);
  assert.match(css, /#game-root \.gameplay-info-list\s*\{[^}]*overflow: hidden auto;[^}]*touch-action: pan-y;/);
  assert.match(css, /#game-root \.gameplay-info-card\.is-multiplayer \.gameplay-info-multiplayer\s*\{[^}]*grid-template-rows: 34px minmax\(0, 1fr\);/);
  assert.match(css, /#game-root \.gameplay-info-card\.is-tutorial\s*\{[^}]*height: auto;[^}]*overflow: visible;/);
  assert.match(css, /#game-root \.gameplay-info-card\.is-tutorial \.guided-tutorial-panel\s*\{[^}]*height: auto;[^}]*overflow: visible;/);
  assert.match(css, /#game-root:has\(\.journey-status-layer\) \[data-touch-control="stick"\]\.uses-default-placement/);
  assert.match(css, /#game-root:has\(\.gameplay-info-card\.is-tutorial\) \[data-touch-control="stick"\]\s*\{[^}]*top: max\(var\(--touch-top\), 73\.5dvh/);
  assert.match(css, /#game-root \.gameplay-info-tabs button\s*\{[^}]*min-height: 34px;[^}]*pointer-events: auto;/);
  assert.match(css, /#game-root\.noncombat-journey[^}]*\[data-touch-control="fire"\][^}]*\[data-desktop-control="fire"\]/);
  assert.doesNotMatch(html, /id="right-hud-stack"/);
});
