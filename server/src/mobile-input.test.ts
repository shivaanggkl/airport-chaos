import assert from'node:assert/strict';import{readFileSync}from'node:fs';import test from'node:test';
import{joystickInput,mobileIdleBrakeRequested,normalizeGraphicsQuality,normalizeTouchMode,pinchZoomFactor,resolvedGraphicsQuality,throttleLeverState}from'../../shared/mobile-input-rules.mjs';
import{MOBILE_BANK_CAP,MOBILE_BANK_STRONG_TARGET,MOBILE_STICK_X_SMOOTH_SECONDS,MOBILE_STICK_Y_SMOOTH_SECONDS,mobileBankTarget,smoothMobileSteering,stepMobileBank,throttleSpeedTarget,throttleTargetDeceleration}from'../../shared/flight-control-rules.mjs';
import{aircraftFlightEnvelope}from'../../shared/aircraft-flight-envelope.mjs';
import{AIM_ENVELOPE,stepAim}from'../../shared/protocol.mjs';
test('touch joystick uses a gentler 2.3 horizontal curve without weakening pitch or amplifying diagonals',()=>{assert.deepEqual(joystickInput(0,0),{x:0,y:0});assert.deepEqual(joystickInput(.1,-.1),{x:0,y:0});assert.deepEqual(joystickInput(.18,0),{x:0,y:0});const gentle=joystickInput(.3,0);const medium=joystickInput(.6,0);assert.ok(gentle.x>0&&gentle.x<medium.x&&medium.x<1);assert.ok(gentle.x<.08);assert.equal(joystickInput(1,0).x,1);const diagonal=joystickInput(1,-1);assert.ok(diagonal.x>0&&diagonal.y<0);assert.ok(diagonal.x<joystickInput(1,0).x*.65);assert.ok(Math.abs(diagonal.y)>.7);assert.ok(Math.hypot(diagonal.x,diagonal.y)<=1);});
test('mobile steering smooths horizontal input over 275ms while pitch remains at 200ms',()=>{assert.equal(MOBILE_STICK_X_SMOOTH_SECONDS,.275);assert.equal(MOBILE_STICK_Y_SMOOTH_SECONDS,.2);let current={x:0,y:0};current=smoothMobileSteering(current,{x:1,y:-1},.025);assert.ok(Math.abs(current.x-1/11)<1e-12&&Math.abs(current.y+.125)<1e-12);for(let index=0;index<7;index+=1)current=smoothMobileSteering(current,{x:1,y:-1},.025);assert.equal(current.y,-1);assert.ok(current.x<1);for(let index=0;index<3;index+=1)current=smoothMobileSteering(current,{x:1,y:-1},.025);assert.equal(current.x,1);});
test('mobile turn intent uses a 48-degree normal target, settles at the 70-degree cap, and levels on release',()=>{for(const type of ['trainer','privateJet','cargo','fighter']as const){const envelope=aircraftFlightEnvelope[type];let bank=0;for(let index=0;index<600;index+=1){bank=stepMobileBank(bank,1,1/60,envelope);assert.ok(Math.abs(bank)<=MOBILE_BANK_CAP+1e-12);}assert.ok(Math.abs(bank-MOBILE_BANK_CAP)<1e-6);const turnAuthority=Math.sin(bank)*envelope.bankTurn;assert.ok(turnAuthority>0);for(let index=0;index<600;index+=1)bank=stepMobileBank(bank,0,1/60,envelope);assert.ok(Math.abs(bank)<1e-6);}assert.ok(Math.abs(mobileBankTarget(.9)-MOBILE_BANK_STRONG_TARGET)<1e-12);assert.ok(Math.abs(MOBILE_BANK_STRONG_TARGET-48*Math.PI/180)<1e-12);});
test('aircraft retain distinct mobile bank response',()=>{const bankAfter=(type:'trainer'|'cargo'|'fighter')=>{let bank=0;for(let index=0;index<30;index+=1)bank=stepMobileBank(bank,1,1/60,aircraftFlightEnvelope[type]);return bank;};assert.ok(bankAfter('fighter')>bankAfter('trainer'));assert.ok(bankAfter('trainer')>bankAfter('cargo'));});
test('continuous throttle targets make medium and slow meaningful without an instant clamp',()=>{for(const type of ['trainer','privateJet','cargo','fighter']as const){const envelope=aircraftFlightEnvelope[type];const idle=throttleSpeedTarget(0,envelope),slow=throttleSpeedTarget(.2,envelope),medium=throttleSpeedTarget(.5,envelope),fast=throttleSpeedTarget(.8,envelope),maximum=throttleSpeedTarget(1,envelope);assert.ok(idle<slow&&slow<medium&&medium<fast&&fast<maximum);assert.ok(slow<=envelope.safeLandingSpeed*1.051);const start=envelope.maxSpeed*.9;const mediumDeceleration=throttleTargetDeceleration(start,.5,envelope);const slowDeceleration=throttleTargetDeceleration(start,.2,envelope);assert.ok(mediumDeceleration>0);assert.ok(slowDeceleration>mediumDeceleration);const oneFrame=start-mediumDeceleration/60;assert.ok(oneFrame<start&&oneFrame>throttleSpeedTarget(.5,envelope));}});
test('FAST to MEDIUM produces measurable deceleration within 250ms for every aircraft',()=>{for(const type of ['trainer','privateJet','cargo','fighter']as const){const envelope=aircraftFlightEnvelope[type];const start=envelope.maxSpeed*.9;let speed=start;let elapsed=0;while(elapsed<.25&&speed>start-envelope.maxSpeed*.01){speed-=throttleTargetDeceleration(speed,.5,envelope)/60;elapsed+=1/60;}assert.ok(speed<=start-envelope.maxSpeed*.01,`${type} did not slow perceptibly in ${elapsed}s`);assert.ok(speed>throttleSpeedTarget(.5,envelope));}});
test('Mammoth decelerates more heavily than Bluejay while Firehawk remains quickest',()=>{const ratio=.9;const medium=(type:'trainer'|'cargo'|'fighter')=>{const envelope=aircraftFlightEnvelope[type];return throttleTargetDeceleration(envelope.maxSpeed*ratio,.5,envelope)/envelope.maxSpeed;};assert.ok(medium('fighter')>medium('trainer'));assert.ok(medium('trainer')>medium('cargo'));});
test('persistent throttle lever maps idle through normal maximum and a separate boost zone',()=>{assert.deepEqual(throttleLeverState(100,0,100),{throttle:0,boost:false,handlePercent:100});assert.deepEqual(throttleLeverState(59,0,100),{throttle:.5,boost:false,handlePercent:59});assert.deepEqual(throttleLeverState(18,0,100),{throttle:1,boost:false,handlePercent:18});assert.deepEqual(throttleLeverState(8,0,100),{throttle:1,boost:true,handlePercent:8});});
test('landing throttle range is continuous and the handle exactly follows each requested value',()=>{const samples=Array.from({length:83},(_,index)=>throttleLeverState(18+index,0,100));assert.equal(new Set(samples.map(sample=>sample.throttle)).size,samples.length);for(let index=1;index<samples.length;index+=1){assert.ok(samples[index]!.throttle<samples[index-1]!.throttle);assert.ok(Math.abs(samples[index]!.handlePercent-(18+index))<1e-9);}const slow=throttleLeverState(72,0,100);const nearIdle=throttleLeverState(90,0,100);assert.ok(slow.throttle>.3&&slow.throttle<.35);assert.ok(nearIdle.throttle>.1&&nearIdle.throttle<.13);});
test('mobile IDLE requests the existing airborne brake without affecting SLOW',()=>{assert.equal(mobileIdleBrakeRequested(undefined),false);assert.equal(mobileIdleBrakeRequested(.25),false);assert.equal(mobileIdleBrakeRequested(.081),false);assert.equal(mobileIdleBrakeRequested(.08),true);assert.equal(mobileIdleBrakeRequested(0),true);});
test('mobile markup contains one throttle lever and no obsolete speed or altitude buttons',()=>{const html=readFileSync(new URL('../../client/index.html',import.meta.url),'utf8');assert.equal(html.match(/data-touch-throttle/g)?.length,1);assert.match(html,/data-touch-control="throttle"/);assert.doesNotMatch(html,/data-hold="(?:throttleUp|throttleDown)"|data-touch-control="altitude"/);});
test('short-screen throttle labels use five separated ticks and cannot be covered by the handle',()=>{const html=readFileSync(new URL('../../client/index.html',import.meta.url),'utf8');const css=readFileSync(new URL('../../client/src/style.css',import.meta.url),'utf8');assert.match(html,/touch-boost-zone">BOOST<[\s\S]*touch-throttle-fast">FAST<[\s\S]*touch-throttle-medium">MED<[\s\S]*touch-throttle-slow">SLOW<[\s\S]*touch-throttle-idle">IDLE</);for(const [selector,position]of[['touch-boost-zone',10],['touch-throttle-fast',30],['touch-throttle-medium',50],['touch-throttle-slow',70],['touch-throttle-idle',90]]as const)assert.match(css,new RegExp(`\\.${selector}\\{top:${position}%`));assert.match(css,/\.touch-throttle-track > span\{[^}]*left:41px;right:4px/);assert.match(css,/\.touch-throttle-handle\{[^}]*left:21px;width:30px;height:12px/);});
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
  assert.match(css,/\.touch-stick\{[^}]*clip-path:polygon\(29\.3% 0,70\.7% 0,100% 29\.3%,100% 70\.7%,70\.7% 100%,29\.3% 100%,0 70\.7%,0 29\.3%\)/);
  assert.match(css,/\.touch-stick::before\{[^}]*clip-path:polygon\(29\.3% 0,70\.7% 0,100% 29\.3%,100% 70\.7%,70\.7% 100%,29\.3% 100%,0 70\.7%,0 29\.3%\)/);
  assert.match(css,/\.touch-stick::after\{[^}]*clip-path:polygon\(29\.3% 0,70\.7% 0,100% 29\.3%,100% 70\.7%,70\.7% 100%,29\.3% 100%,0 70\.7%,0 29\.3%\)/);
  assert.match(css,/\.touch-stick i\{[^}]*border-radius:50%/);
  assert.match(css,/\.touch-fire\{width:116px;height:116px!important/);
  assert.match(css,/@media\(max-width:700px\)[^{]*\{[^}]*[\s\S]*?\.touch-stick,\.touch-fire\{width:104px;height:104px!important\}/);
});

test('mobile joystick renders all eight octagon directions without changing its circular knob',()=>{
  const html=readFileSync(new URL('../../client/index.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../../client/src/style.css',import.meta.url),'utf8');
  for(const direction of['up','up-right','right','down-right','down','down-left','left','up-left']){
    assert.match(html,new RegExp(`class="touch-stick-${direction}"`));
    assert.match(css,new RegExp(`\\.touch-stick-${direction}\\{`));
  }
  assert.equal((css.match(/clip-path:polygon\(29\.3% 0,70\.7% 0,100% 29\.3%,100% 70\.7%,70\.7% 100%,29\.3% 100%,0 70\.7%,0 29\.3%\)/g)??[]).length,3);
  assert.match(css,/\.touch-stick i\{[^}]*width:44px;height:44px;[^}]*border-radius:50%/);
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
