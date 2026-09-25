import assert from'node:assert/strict';import{readFileSync}from'node:fs';import test from'node:test';
import{joystickInput,mobileIdleBrakeRequested,normalizeGraphicsQuality,normalizeTouchMode,pinchZoomFactor,resolvedGraphicsQuality,throttleLeverState}from'../../shared/mobile-input-rules.mjs';
import{AIM_ENVELOPE,stepAim}from'../../shared/protocol.mjs';
test('touch joystick has a deadzone, progressive response, full authority, and working diagonals',()=>{assert.deepEqual(joystickInput(0,0),{x:0,y:0});assert.deepEqual(joystickInput(.1,-.1),{x:0,y:0});const gentle=joystickInput(.3,-.3);const medium=joystickInput(.6,-.6);assert.ok(gentle.x>0&&gentle.x<medium.x&&medium.x<1);assert.ok(gentle.y<0&&gentle.y>medium.y&&medium.y>-1);assert.deepEqual(joystickInput(1,-1),{x:1,y:-1});assert.deepEqual(joystickInput(-1,1),{x:-1,y:1});});
test('persistent throttle lever maps idle through normal maximum and a separate boost zone',()=>{assert.deepEqual(throttleLeverState(100,0,100),{throttle:0,boost:false,handlePercent:100});assert.deepEqual(throttleLeverState(59,0,100),{throttle:.5,boost:false,handlePercent:59});assert.deepEqual(throttleLeverState(18,0,100),{throttle:1,boost:false,handlePercent:18});assert.deepEqual(throttleLeverState(8,0,100),{throttle:1,boost:true,handlePercent:8});});
test('landing throttle range is continuous and the handle exactly follows each requested value',()=>{const samples=Array.from({length:83},(_,index)=>throttleLeverState(18+index,0,100));assert.equal(new Set(samples.map(sample=>sample.throttle)).size,samples.length);for(let index=1;index<samples.length;index+=1){assert.ok(samples[index]!.throttle<samples[index-1]!.throttle);assert.ok(Math.abs(samples[index]!.handlePercent-(18+index))<1e-9);}const slow=throttleLeverState(72,0,100);const nearIdle=throttleLeverState(90,0,100);assert.ok(slow.throttle>.3&&slow.throttle<.35);assert.ok(nearIdle.throttle>.1&&nearIdle.throttle<.13);});
test('mobile IDLE requests the existing airborne brake without affecting SLOW',()=>{assert.equal(mobileIdleBrakeRequested(undefined),false);assert.equal(mobileIdleBrakeRequested(.25),false);assert.equal(mobileIdleBrakeRequested(.081),false);assert.equal(mobileIdleBrakeRequested(.08),true);assert.equal(mobileIdleBrakeRequested(0),true);});
test('mobile markup contains one throttle lever and no obsolete speed or altitude buttons',()=>{const html=readFileSync(new URL('../../client/index.html',import.meta.url),'utf8');assert.equal(html.match(/data-touch-throttle/g)?.length,1);assert.match(html,/data-touch-control="throttle"/);assert.doesNotMatch(html,/data-hold="(?:throttleUp|throttleDown)"|data-touch-control="altitude"/);});
test('touch aim continues to use the existing bounded aim step',()=>{const aim={x:0,y:0};for(let index=0;index<100;index+=1)stepAim(aim,{x:10,y:-10},1,AIM_ENVELOPE);assert.ok(Math.hypot(aim.x,aim.y)<=Math.tan(AIM_ENVELOPE)+Number.EPSILON);assert.ok(aim.x>0);assert.ok(aim.y<0);});
test('pinch zoom follows finger distance and clamps each update',()=>{assert.equal(pinchZoomFactor(100,0),1);assert.equal(pinchZoomFactor(100,200),.84);assert.equal(pinchZoomFactor(200,100),1.16);assert.equal(pinchZoomFactor(100,110),100/110);assert.equal(pinchZoomFactor(100,80),1.16);});
test('touch and quality settings reject unknown persisted values safely',()=>{assert.equal(normalizeTouchMode('on'),'on');assert.equal(normalizeTouchMode('bad'),'auto');assert.equal(normalizeGraphicsQuality('low'),'low');assert.equal(normalizeGraphicsQuality('bad'),'auto');});
test('auto quality is balanced on coarse or narrow screens and high on desktop',()=>{assert.equal(resolvedGraphicsQuality('auto',false,false),'high');assert.equal(resolvedGraphicsQuality('auto',true,false),'balanced');assert.equal(resolvedGraphicsQuality('auto',false,true),'balanced');assert.equal(resolvedGraphicsQuality('low',false,false),'low');});

test('mobile radar stays available and shares the existing map action',()=>{
  const html=readFileSync(new URL('../../client/index.html',import.meta.url),'utf8');
  const main=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
  const css=readFileSync(new URL('../../client/src/style.css',import.meta.url),'utf8');
  assert.match(html,/id="radar-panel" role="button" tabindex="0"/);
  assert.match(main,/flightMapButtonElement\.addEventListener\('click', toggleWorldMapFromHud\);/);
  assert.match(main,/radarPanelElement\.addEventListener\('click', toggleWorldMapFromHud\);/);
  assert.doesNotMatch(css,/\.touch-controls-active :is\([^)]*#radar-panel/);
  assert.match(css,/\.touch-controls-active #right-flight-stack\{[^}]*top:[^;}]+;right:max\(8px,env\(safe-area-inset-right\)\);width:124px;/);
  assert.match(css,/\.touch-controls-active #radar-panel\{[^}]*width:88px;/);
});

test('default mobile controls keep throttle left of radar and Fire joystick-sized',()=>{
  const input=readFileSync(new URL('../../client/src/mobile-input.ts',import.meta.url),'utf8');
  const css=readFileSync(new URL('../../client/src/style.css',import.meta.url),'utf8');
  assert.match(input,/throttle: \{ x: 75, y: 40, scale: 0\.95 \}/);
  assert.match(input,/fire: \{ x: 72, y: 82, scale: 1 \}/);
  assert.match(input,/classList\.toggle\('uses-default-placement'/);
  assert.match(css,/\[data-touch-control="throttle"\]\.uses-default-placement\{left:calc\(100% - 174px\)\}/);
  assert.match(css,/\.touch-stick\{width:116px;height:116px/);
  assert.match(css,/\.touch-fire\{width:116px;height:116px!important/);
  assert.match(css,/@media\(max-width:700px\)[^{]*\{[^}]*[\s\S]*?\.touch-stick,\.touch-fire\{width:104px;height:104px!important\}/);
});

test('mobile pilot menu protects active taps and uses a vertical content layout',()=>{
  const menu=readFileSync(new URL('../../client/src/pilot-menu.ts',import.meta.url),'utf8');
  const main=readFileSync(new URL('../../client/src/main.ts',import.meta.url),'utf8');
  const css=readFileSync(new URL('../../client/src/style.css',import.meta.url),'utf8');
  assert.match(menu,/this\.pointerActive = true;[\s\S]*window\.addEventListener\('pointerup', releasePointer/);
  assert.match(menu,/!this\.openState \|\| this\.pointerActive \|\| this\.isActivelyScrolling\(\)/);
  assert.match(main,/message\.ok && pilotMenu\.isOpen\(\)\) pilotMenu\.close\(\)/);
  assert.match(css,/\.pilot-menu-navigation\{grid-area:navigation;display:flex;flex-direction:column;/);
});
