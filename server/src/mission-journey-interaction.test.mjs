import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { journeyDisplayGroups, journeySpecialPursuits } from '../../shared/journey-categories.mjs';
import { missionJourneyStages, missionJourneyStatuses, journeyCompletionSummary } from '../../client/src/mission-journey-model.js';
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
  const context = vm.createContext({document, ResizeObserver:class { observe() {} }, window:{setTimeout,clearTimeout}, matchMedia:() => ({matches:true}),
    bonusRibbonMarkup: '<span class="bonus-badge">BONUS</span>', journeyDisplayGroups, journeySpecialPursuits, missionJourneyStages, missionJourneyStatuses, journeyCompletionSummary, missionJourneyDetails,
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
  assert.equal(f.root.querySelectorAll('.mission-journey-node').length, 34);
  assert.equal(f.root.querySelectorAll('.mission-journey-category').filter(group => !group.hidden).length, 6);
  const groups = f.root.querySelectorAll('.mission-journey-category');
  const rings = groups.find(group => group.dataset.category === 'golden-rings');
  const ringNodes = rings.querySelectorAll('.mission-journey-node');
  assert.equal(ringNodes.length, 6);
  assert.equal(ringNodes[5].dataset.missionId, 'journey-dallas-coin-hunt-01');
  assert.ok(ringNodes[5].classList.contains('is-bonus'));
  const targets = groups.find(group => group.dataset.category === 'shooting-targets');
  const targetBonus = targets.querySelectorAll('.mission-journey-node')[5];
  assert.ok(targetBonus.classList.contains('is-bonus'));
  assert.equal(targetBonus.querySelector('.mission-journey-credit-coin').getAttribute('src'), '/media/missions/credit-coin.webp');
  targetBonus.emit('click');
  assert.equal(f.root.querySelector('[data-mission-index]').textContent, 'BONUS ROUND');
  assert.equal(f.root.querySelector('[data-mission-title]').textContent, 'COLLECT COINS');
  assert.equal(targetBonus.dataset.missionId, 'journey-dallas-coin-hunt-02');

  assert.equal(ringNodes[5].querySelector('.mission-journey-credit-coin').getAttribute('src'), '/media/missions/credit-coin.webp');

  assert.ok(!groups.some(group=>group.dataset.category==='bonus-2'));
  const bosses = groups.find(group => group.dataset.category === 'dr-boss');
  assert.equal(bosses.querySelector('.mission-journey-category-route'), null);
  const bossButtons = bosses.querySelectorAll('.mission-journey-node');
  assert.deepEqual(bossButtons.map(button => button.querySelector('.mission-journey-number').textContent), ['1', '2']);
  assert.equal(bossButtons[0].style.top, bossButtons[1].style.top);

  for (const stage of missionJourneyStages.filter(stage => stage.implementation === 'playable')) {
    f.journey.setProgress({[stage.missionId]:{eligible:true}});
    f.button(stage.id).emit('click');
    const card = missionJourneyDetails.find(card => card.id === stage.missionId);
    assert.equal(f.root.querySelector('[data-mission-bonus]').hidden, stage.kind !== 'bonus');
    assert.equal(f.journey.selectedMissionId, stage.id);
    assert.equal(f.root.querySelector('[data-mission-index]').textContent, stage.kind === 'bonus' ? 'BONUS ROUND' : `MISSION ${String(stage.categoryNumber).padStart(2, '0')}`);
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
  assert.equal(f.root.querySelector('[data-extra-pursuits]'), null);
  const battles = f.root.querySelectorAll('.mission-journey-category').find(group => group.dataset.category === 'plane-battles');
  assert.equal(battles.querySelector('.mission-journey-category-label').querySelector('strong').textContent, 'PLANE BATTLES');
  f.journey.showSpecial(true);
  assert.equal(f.journey.selectedMissionId, 'journey-dallas-15');
  assert.equal(f.root.querySelectorAll('.mission-journey-category').filter(group => !group.hidden).length, 1);
  f.button('journey-dallas-15').emit('keydown', {key:'ArrowRight'});
  assert.equal(f.journey.selectedMissionId, 'journey-dallas-ace-intercept-01');
  assert.equal(f.play.disabled, true);
  f.root.querySelector('[data-journey-back]').emit('click');
  assert.equal(f.journey.selectedMissionId, 'journey-dallas-twin-hunters-01');
  assert.equal(viewport.scrollLeft, 920);
  assert.equal(f.root.querySelector('.mission-journey-detail'), detail);
  const category = f.root.querySelector('.mission-journey-category');
  assert.equal(category.children[0].className, 'mission-journey-category-label');
  viewport.emit('keydown', {key:'End'}); assert.equal(f.journey.selectedMissionId, 'journey-dallas-19');
  viewport.scrollWidth = 3000;
  const scroll = f.root.querySelector('.mission-journey-scroll-position');
  scroll.value = '500'; scroll.emit('input');
  assert.equal(viewport.scrollLeft, (3000 - viewport.clientWidth) / 2);
  viewport.emit('scroll'); assert.equal(scroll.value, '500');
  const before = viewport.scrollLeft; viewport.emit('wheel', {deltaY:100,deltaX:0,deltaMode:0}); assert.equal(viewport.scrollLeft, before + 100);
  assert.equal(f.root.querySelector('[data-journey-progress]'), null);
  assert.equal(f.journey.headerContent.textContent, 'DALLAS·MISSION');
});

test('the shared header keeps the Dallas mission title when progress changes', () => {
  const f = fixture();
  const header = new Element('header'); header.append(f.journey.headerContent);
  assert.equal(header.querySelector('[data-journey-progress]'), null);
  assert.equal(f.journey.headerContent.textContent, 'DALLAS·MISSION');
  f.journey.setProgress({'journey-dallas-01':{completed:true}, 'journey-dallas-coin-hunt-01':{completed:true}});
  assert.equal(f.journey.headerContent.textContent, 'DALLAS·MISSION');
  assert.equal(header.querySelector('[data-journey-progress]'), null);
});

test('all four bonus entries share details, progress and the authoritative coin-hunt launch', async () => {
  const bonuses = missionJourneyStages.filter(stage => stage.kind === 'bonus' && stage.implementation === 'playable');
  assert.equal(bonuses.length, 4);
  assert.equal(new Set(bonuses.map(stage => stage.id)).size, 4);
  assert.ok(bonuses.every(stage => stage.implementation === 'playable' && stage.missionId === 'journey-dallas-coin-hunt-01'));
  const f = fixture();
  f.journey.setProgress({'journey-dallas-coin-hunt-01':{eligible:true,completed:true,coinsCollected:25}});
  for (const stage of bonuses) {
    f.button(stage.id).emit('click');
    assert.equal(f.play.disabled, false);
    assert.equal(f.root.querySelector('[data-mission-title]').textContent, 'COLLECT COINS');
  }
  assert.deepEqual(journeyCompletionSummary({'journey-dallas-coin-hunt-01':{completed:true}}),{completed:1,total:34});
  const source = readFileSync(new URL('../../client/src/bootstrap.ts',import.meta.url),'utf8');
  const ast = ts.createSourceFile('bootstrap.ts',source,ts.ScriptTarget.Latest,true);
  const launch = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'playJourneyMission').getText(ast);
  const compiled = ts.transpileModule(launch,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  for (const stage of bonuses) {
    const requests=[];
    const context=vm.createContext({journeyLaunchPending:false,dallasUnlocked:()=>true,missionJourneyStages,
      missionJourney:{selectedMissionId:stage.id},pendingAircraftSelection:undefined,journeyAttemptMission:'mission-01',
      apiUrl:path=>path,apiFetch:async path=>{requests.push(path);return {ok:true,json:async()=>({attempt:{attemptId:'same-bonus'}})};},
      cities:[{id:'dallas',status:'available'}],citySelector:{hidden:false},enterCity:async()=>{},
      journeyMissionSlot:id=>{assert.equal(id,'journey-dallas-coin-hunt-01');return {};},missionTimePreset:()=> 'Day',
    });
    vm.runInContext(compiled,context);await context.playJourneyMission();
    assert.deepEqual(requests,['/api/journey/dallas/mission-coin-hunt-01/launch']);
    assert.equal(context.journeyAttemptMission,'mission-coin-hunt-01');
  }
});

test('Plane Battles and every bonus intro share the target-style bottom summary',()=>{
  const source=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
  const styles=readFileSync(new URL('../../client/src/style.css',import.meta.url),'utf8');
  const ast=ts.createSourceFile('main.ts',source,ts.ScriptTarget.Latest,true);
  const render=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='renderMissionIntroSummary');
  const title=new Element();
  const context=vm.createContext({journeyAttempt:null,journeyCategorySlot:id=>missionJourneyStages.find(stage=>stage.id===id),
    missionJourneyDetails,flightLaunchTitle:title,document:{createElement:tag=>new Element(tag)}});
  vm.runInContext(ts.transpileModule(render.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
  const battles=missionJourneyStages.filter(stage=>stage.categoryId==='plane-battles'&&stage.kind==='main');
  assert.equal(battles.length,5);
  for(const stage of battles){
    context.journeyAttempt={missionId:stage.missionId};context.renderMissionIntroSummary();
    const detail=missionJourneyDetails.find(mission=>mission.id===stage.missionId);
    assert.ok(title.classList.contains('is-mission-intro-summary'));
    assert.equal(title.children[0].tag,'strong');assert.equal(title.children[0].textContent,detail.title);
    assert.deepEqual(title.children.slice(1).map(line=>line.textContent),detail.description.split('\n'));
  }
  for(const missionId of ['journey-dallas-sharpshooter-01']){
    title.textContent='original intro';context.journeyAttempt={missionId};context.renderMissionIntroSummary();
    assert.equal(title.textContent,'original intro');assert.ok(!title.classList.contains('is-mission-intro-summary'));
  }
  const bonuses=missionJourneyStages.filter(stage=>stage.kind==='bonus');
  assert.equal(bonuses.length,4);
  let expected;
  for(const stage of bonuses){
    context.journeyAttempt={missionId:stage.id};context.renderMissionIntroSummary();
    assert.ok(title.classList.contains('is-mission-intro-summary'));
    const rendered=title.children.map(node=>[node.tag,node.textContent]);
    assert.equal(rendered[0][1],'COLLECT COINS');
    assert.equal(rendered[1][1],'Collect as many COINS as possible before time ends');
    if(expected)assert.deepEqual(rendered,expected);else expected=rendered;
    assert.equal(stage.missionId,'journey-dallas-coin-hunt-01');
  }
  const coinFrame=source.slice(source.indexOf('  if(missionCoinHuntIntro && journeyAttempt?.coinHunt){'),source.indexOf('  if (missionSharpshooterIntro) {',source.indexOf('  if(missionCoinHuntIntro && journeyAttempt?.coinHunt){')));
  assert.doesNotMatch(coinFrame,/replaceChildren|textContent/,'bonus frames cannot replace the shared heading with legacy text');
  assert.match(styles,/\.sharpshooter-overview-heading,\s*#game-root \.flight-launch-title\.is-mission-intro-summary\s*\{/);
  assert.match(source,/missionNumber === 15 && !flightLaunchTitle.classList.contains\('is-mission-intro-summary'\)/);
});
