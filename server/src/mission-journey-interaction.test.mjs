import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { journeyDisplayGroups, journeySpecialPursuits } from '../../shared/journey-categories.mjs';
import { missionJourneyStages, missionJourneyStatuses, journeyMainCompleted } from '../../client/src/mission-journey-model.js';
import { missionJourneyDetails } from '../../client/src/mission-journey-content.js';

// Minimal DOM adapter: execute the real component and its handlers without browser automation.
class Element {
  children = []; attributes = new Map(); listeners = new Map(); dataset = {}; style = {setProperty() {}};
  hidden = false; disabled = false; scrollLeft = 0; clientWidth = 850; text = '';
  constructor(tag = 'div') { this.tag = tag; }
  get className() { return this.attributes.get('class') ?? ''; }
  set className(value) { this.attributes.set('class', value); }
  classList = {
    contains: name => this.className.split(' ').includes(name),
    add: name => this.classList.toggle(name, true),
    remove: name => this.classList.toggle(name, false),
    toggle: (name, enabled) => {
      const names = new Set(this.className.split(' ').filter(Boolean));
      const add = enabled ?? !names.has(name);
      if (add) names.add(name); else names.delete(name);
      this.className = [...names].join(' '); return add;
    },
  };
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.text = ''; this.append(...nodes); }
  set textContent(value) { this.replaceChildren(); this.text = value; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
  setAttribute(key, value) { this.attributes.set(key, value); if (key === 'hidden') this.hidden = true; if (key === 'disabled') this.disabled = true; }
  getAttribute(key) { return this.attributes.get(key); }
  matches(selector) {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector.startsWith('[')) return this.attributes.has(selector.slice(1, -1));
    return this.tag === selector;
  }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector); }
  set innerHTML(html) {
    this.replaceChildren(); const stack = [this];
    for (const token of html.match(/<[^>]*>|[^<]+/g) ?? []) {
      if (token.startsWith('</')) { stack.pop(); continue; }
      if (token.startsWith('<')) {
        const tag = token.match(/^<([\w-]+)/)[1]; const node = new Element(tag);
        for (const attr of token.slice(tag.length + 1).matchAll(/([\w-]+)(?:="([^"]*)")?/g)) node.setAttribute(attr[1], attr[2] ?? '');
        stack.at(-1).append(node);
        if (!token.endsWith('/>') && !['img', 'br', 'input'].includes(tag)) stack.push(node);
      } else stack.at(-1).text += token;
    }
  }
  addEventListener(type, handler) { const handlers = this.listeners.get(type) ?? []; handlers.push(handler); this.listeners.set(type, handlers); }
  emit(type, values = {}) { const event = {target:this, preventDefault() {}, stopPropagation() {}, ...values}; for (const handler of this.listeners.get(type) ?? []) handler(event); return event; }
  focus() { this.focused = true; }
  scrollTo({left}) { this.scrollLeft = Math.max(0, left); }
  setPointerCapture() {}
  getBoundingClientRect() { return {left:0, top:0, width:40, height:40}; }
}
const source = readFileSync(new URL('../../client/src/mission-journey.ts', import.meta.url), 'utf8');
const tree = ts.createSourceFile('mission-journey.ts', source, ts.ScriptTarget.Latest, true);
const runtime = tree.statements.filter(node => !ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)).map(node => node.getText(tree).replace(/^export /, '')).join('\n');
const code = ts.transpileModule(runtime, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function fixture() {
  const document = {createElement:tag => new Element(tag), createElementNS:(_, tag) => new Element(tag)};
  const root = new Element(); let launches = 0; let panelOpens = 0;
  const context = vm.createContext({document, window:{setTimeout,clearTimeout}, matchMedia:() => ({matches:true}),
    journeyDisplayGroups, journeySpecialPursuits, missionJourneyStages, missionJourneyStatuses, journeyMainCompleted, missionJourneyDetails,
    observeMissionCopyFit() {}, hapticsManager:{emit() {}}, createLockIcon:() => new Element('svg')});
  vm.runInContext(`${code}\nglobalThis.Component = MissionJourney;`, context);
  const journey = new context.Component(root, () => launches++, () => panelOpens++, () => {});
  const button = id => root.querySelectorAll('button').find(button => button.dataset.missionId === id);
  const play = root.querySelector('[data-mission-play]');
  return {root, journey, button, play, get launches() { return launches; }, get panelOpens() { return panelOpens; }};
}

test('actual category rendering, node selection and launch guards use live stable identities', () => {
  const f = fixture();
  f.journey.show(); assert.equal(f.panelOpens, 0, 'show does not add an obsolete detail-panel history entry');
  assert.equal(f.root.querySelectorAll('.mission-journey-node').length, 42);
  assert.equal(f.root.querySelectorAll('.mission-journey-category').filter(group => !group.hidden).length, 9);
  for (const stage of missionJourneyStages.filter(stage => stage.implementation === 'playable')) {
    f.journey.setProgress({[stage.id]:{eligible:true}});
    f.button(stage.id).emit('click');
    const card = missionJourneyDetails.find(card => card.id === stage.id);
    assert.equal(f.journey.selectedMissionId, stage.id);
    assert.equal(f.root.querySelector('[data-mission-title]').textContent, card.title);
    assert.equal(f.root.querySelector('[data-mission-time-value]').textContent, card.timeLimit);
    assert.equal(f.root.querySelector('[data-mission-reward-amount]').textContent, card.rewardCredits.toLocaleString());
    assert.equal(f.play.disabled, false);
  }
  f.play.emit('click'); assert.equal(f.launches, 1);
  f.button('placeholder-dallas-27').emit('click');
  assert.equal(f.play.disabled, true);
  assert.equal(f.root.querySelector('[data-mission-title]').textContent, 'COMING SOON');
  assert.match(f.root.querySelector('[data-mission-objective]').textContent, /Hold them together for 1 minute/);
  assert.equal(f.root.querySelector('[data-mission-time-value]').textContent, '—');
  f.play.emit('click'); assert.equal(f.launches, 1);
  f.journey.setCityLocked(true); f.button('journey-dallas-01').emit('click');
  assert.equal(f.play.disabled, true);
});

test('extra pursuits reuse the detail box; Back restores selection and scroll; keyboard and wheel work', () => {
  const f = fixture(); f.journey.show();
  f.journey.setProgress({'journey-dallas-15':{eligible:true}});
  f.button('journey-dallas-twin-hunters-01').emit('click');
  const detail = f.root.querySelector('.mission-journey-detail');
  const viewport = f.root.querySelector('.mission-journey-viewport'); viewport.scrollLeft = 920;
  const extra = f.root.querySelector('[data-extra-pursuits]'); assert.equal(extra.hidden, false);
  extra.emit('click');
  assert.equal(f.journey.selectedMissionId, 'journey-dallas-15');
  assert.equal(f.root.querySelectorAll('.mission-journey-category').filter(group => !group.hidden).length, 1);
  f.button('journey-dallas-15').emit('keydown', {key:'ArrowRight'});
  assert.equal(f.journey.selectedMissionId, 'journey-dallas-ace-intercept-01');
  assert.equal(f.play.disabled, true);
  f.root.querySelector('[data-journey-back]').emit('click');
  assert.equal(f.journey.selectedMissionId, 'journey-dallas-twin-hunters-01');
  assert.equal(viewport.scrollLeft, 920);
  assert.equal(f.root.querySelector('.mission-journey-detail'), detail);
  viewport.emit('keydown', {key:'End'}); assert.equal(f.journey.selectedMissionId, 'journey-dallas-19');
  const before = viewport.scrollLeft; viewport.emit('wheel', {deltaY:100,deltaX:0,deltaMode:0}); assert.equal(viewport.scrollLeft, before + 100);
  assert.equal(f.root.querySelector('[data-journey-progress]').textContent, '0 OF 36 COMPLETED');
});
