import assert from 'node:assert/strict';
import test from 'node:test';
import { MobileInputControls } from '../../client/src/mobile-input.ts';
import { mobileThrottleStops } from '../../shared/mobile-input-rules.mjs';

class ControlElement {
  dataset: Record<string,string> = {};
  textContent = '';
  handlers = new Map<string, ((event: any) => void)[]>();
  captures = new Set<number>();
  classes = new Set<string>();
  classList = {
    add: (...names: string[]) => names.forEach(name => this.classes.add(name)),
    remove: (...names: string[]) => names.forEach(name => this.classes.delete(name)),
    toggle: (name: string, active: boolean) => active ? this.classes.add(name) : this.classes.delete(name),
  };
  style = { setProperty() {}, removeProperty() {} };
  addEventListener(type: string, handler: (event: any) => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }
  setAttribute() {}
  setPointerCapture(id: number) { this.captures.add(id); }
  hasPointerCapture(id: number) { return this.captures.has(id); }
  releasePointerCapture(id: number) { this.captures.delete(id); }
  getBoundingClientRect() { return {top:100,height:120}; }
  closest() { return null; }
  fire(type: string, values = {}) {
    const event = {pointerId:1,clientY:140,target:this,preventDefault() {},...values};
    for (const handler of this.handlers.get(type) ?? []) handler(event);
  }
}

function fixture(t: any) {
  const previousWindow = globalThis.window;
  const windowEvents = new ControlElement();
  Object.defineProperty(globalThis, 'window', {configurable:true,value:windowEvents});
  t.after(() => Object.defineProperty(globalThis, 'window', {configurable:true,value:previousWindow}));
  const lever = new ControlElement(), boost = new ControlElement();
  const actions: [string,boolean][] = [], selections: number[] = [];
  // Exercise the production event handlers without starting unrelated flight/render systems.
  const controls = Object.create(MobileInputControls.prototype) as any;
  Object.assign(controls, {
    root: {hidden:false,querySelector:(selector: string) => selector==='[data-touch-throttle]' ? lever : null,
      querySelectorAll:() => [boost]},
    aimTarget:new ControlElement(),boostButton:boost,active:new Set(),steeringInput:{x:0,y:0},
    throttleTarget:mobileThrottleStops[2],setAction:(action: string,active: boolean) => actions.push([action,active]),
    onThrottleInput:(value: number) => selections.push(value),
  });
  controls.renderThrottle(controls.throttleTarget);
  controls.bindThrottle(lever); controls.bindBoost(boost);
  return {controls,lever,boost,actions,selections,windowEvents};
}

test('grabbing the handle preserves speed, dragging selects a stop, and release holds it', t => {
  const f=fixture(t);
  f.lever.fire('pointerdown',{clientY:145});
  assert.deepEqual(f.selections,[]);
  f.lever.fire('pointermove',{clientY:146});
  assert.equal(f.controls.getThrottleTarget(),mobileThrottleStops[2]);
  f.lever.fire('pointermove',{clientY:105});
  assert.equal(f.controls.getThrottleTarget(),1);
  f.windowEvents.fire('pointerup');
  assert.equal(f.controls.getThrottleTarget(),1);
  assert.equal(f.controls.throttlePointer,undefined);
  assert.deepEqual(f.actions,[],'the speed track never activates Boost');
});

test('Boost preserves the selected setting on release, depletion and cancellation', t => {
  const f=fixture(t), selected=f.controls.getThrottleTarget();
  f.boost.fire('pointerdown',{pointerId:2});
  assert.deepEqual(f.actions.at(-1),['boost',true]);
  assert.equal(f.controls.getThrottleTarget(),selected);
  f.boost.fire('pointerup',{pointerId:3});
  assert.equal(f.controls.active.has('boost'),true,'a second finger cannot release the held button');
  f.controls.syncFlightState(selected,0,false);
  assert.equal(f.controls.active.has('boost'),false);
  assert.equal(f.controls.getThrottleTarget(),selected);
  f.controls.syncFlightState(selected,20,false);
  assert.equal(f.controls.active.has('boost'),false,'recharging cannot restart a depleted held burst');
  f.windowEvents.fire('pointerup',{pointerId:2});
  f.boost.fire('pointerdown',{pointerId:4});
  assert.equal(f.controls.active.has('boost'),true);
  f.boost.fire('pointercancel',{pointerId:4});
  assert.equal(f.controls.active.has('boost'),false);
  assert.equal(f.controls.getThrottleTarget(),selected);
  assert.deepEqual(f.selections,[],'Boost never submits a different throttle target');
});

test('lever and Boost support independent fingers and reset clears a held burst', t => {
  const f=fixture(t);
  f.boost.fire('pointerdown',{pointerId:2});
  f.lever.fire('pointerdown',{pointerId:1,clientY:220});
  assert.equal(f.controls.getThrottleTarget(),0);
  assert.equal(f.controls.active.has('boost'),true);
  f.lever.fire('pointerup',{pointerId:1});
  assert.equal(f.controls.active.has('boost'),true);
  f.controls.reset();
  assert.equal(f.controls.active.has('boost'),false);
  assert.equal(f.controls.boostPointer,undefined);
  assert.equal(f.boost.captures.size,0);
  assert.equal(f.controls.getThrottleTarget(),0,'pause/reset preserves the selected speed setting');
});
