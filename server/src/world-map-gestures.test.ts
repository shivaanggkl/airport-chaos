import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync('client/src/world-map.ts','utf8'),ast=ts.createSourceFile('world-map.ts',source,ts.ScriptTarget.Latest,true);
const declaration=ast.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text==='WorldMap')!;
const context=vm.createContext({MIN_SCALE:.01,MAX_SCALE:.11});
vm.runInContext(ts.transpileModule(declaration.getText(ast).replace(/^export /,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+'\nglobalThis.MapClass=WorldMap;',context);
function fixture(){
 const handlers=new Map<string,(event:any)=>void>(),captures=new Set<number>(),clicks:any[]=[];
 const button=(direction:string)=>({dataset:{mapZoom:direction},click:()=>{},addEventListener(_type:string,fn:()=>void){this.click=fn;}});
 const buttons=[button('in'),button('out')],map=Object.create(context.MapClass.prototype);
 Object.assign(map,{pointers:new Map(),moved:false,scale:.02,centerX:0,centerZ:0,pressX:0,pressY:0,
  layer:{bounds:{minX:-1000000,maxX:1000000,minZ:-1000000,maxZ:1000000}},
  canvas:{width:1000,height:500,clientWidth:1000,clientHeight:500,getBoundingClientRect:()=>({left:0,top:0,width:1000,height:500}),
   addEventListener:(name:string,fn:(e:any)=>void)=>handlers.set(name,fn),setPointerCapture:(id:number)=>captures.add(id),hasPointerCapture:(id:number)=>captures.has(id),releasePointerCapture:(id:number)=>captures.delete(id)},
  recenterButton:{addEventListener(){}},card:{querySelectorAll:()=>buttons},drawStatic(){},draw(){},click:(e:any)=>clicks.push(e)});
 map.bindEvents();
 const send=(type:string,id:number,x=500,y=250,extra={})=>handlers.get(type)!({pointerId:id,clientX:x,clientY:y,button:0,preventDefault(){},...extra});
 return {map,buttons,captures,clicks,send};
}
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('two-finger pinch zooms both ways around its midpoint without moving the world anchor',()=>{
 const {map,send}=fixture();send('pointerdown',1,400);send('pointerdown',2,600);
 send('pointermove',1,300);send('pointermove',2,700);near(map.scale,.04);near(map.screenToWorld(500,250).x,0);
 send('pointermove',1,450);send('pointermove',2,550);near(map.scale,.01);near(map.screenToWorld(500,250).x,0);
});
test('two fingers can pan together and transition smoothly to one-finger drag',()=>{
 const {map,send,clicks}=fixture();send('pointerdown',1,300);send('pointerdown',2,500);
 send('pointermove',1,400);send('pointermove',2,600);near(map.scale,.02);near(map.centerX,-5000);
 send('pointerup',1,400);send('pointermove',2,650);near(map.centerX,-7500);
 send('pointerup',2,650);assert.equal(clicks.length,0);assert.equal(map.pointers.size,0);
 send('pointerdown',3,500);send('pointerup',3,500);assert.equal(clicks.length,1,'a later deliberate tap still selects a waypoint');
});
test('slow drags and cancelled gestures cannot accidentally select a waypoint',()=>{
 const {map,send,clicks}=fixture();send('pointerdown',1,400);
 for(let x=401;x<=410;x++)send('pointermove',1,x);send('pointerup',1,410);near(map.centerX,-500);assert.equal(clicks.length,0);
 send('pointerdown',2,500);send('pointercancel',2);assert.equal(clicks.length,0);
 send('pointerdown',3,500);send('lostpointercapture',3);assert.equal(clicks.length,0);
});
test('wheel zoom anchors at the cursor and plus/minus buttons share the same safe limits',()=>{
 const {map,send,buttons}=fixture(),anchor=map.screenToWorld(600,300);
 send('wheel',0,600,300,{deltaY:-200});assert.ok(map.scale>.02);near(map.screenToWorld(600,300).x,anchor.x);near(map.screenToWorld(600,300).z,anchor.z);
 const before=map.scale;buttons[1]!.click();assert.ok(map.scale<before);
 for(let i=0;i<100;i++)buttons[0]!.click();near(map.scale,.11);
 for(let i=0;i<100;i++)buttons[1]!.click();near(map.scale,map.minimumScale());
});
test('closing or switching the map clears captured touches and right clicks never start a gesture',()=>{
 const {map,send,captures}=fixture();send('pointerdown',1,400);send('pointerdown',2,600);map.resetGesture();
 assert.equal(map.pointers.size,0);assert.equal(captures.size,0);assert.equal(map.gesture,undefined);
 send('pointerdown',3,500,250,{button:2});assert.equal(map.pointers.size,0);
});

test('landscape map can drag Dallas edge airports inward without snapping away from a recentered player',()=>{
 const {map,send}=fixture();map.layer.bounds={minX:-75000,maxX:75000,minZ:-75000,maxZ:75000};
 map.scale=.01;map.centerX=-68400;map.centerZ=-40800;
 send('pointerdown',1,500,250);send('pointermove',1,550,250);
 near(map.centerX,-73400);near(map.centerZ,-40800);
 send('pointermove',1,600,250);near(map.centerX,-75000);
 send('pointermove',1,550,250);near(map.centerX,-70000);
 send('pointerup',1,550,250);
 // The same room is available in every direction and zooming out cannot
 // force the center back to the middle just because the viewport is wider.
 map.centerX=100000;map.centerZ=-100000;map.clampCenter();near(map.centerX,75000);near(map.centerZ,-75000);
 map.centerZ=100000;map.clampCenter();near(map.centerZ,75000);
 map.scale=map.minimumScale();map.clampCenter();near(map.centerX,75000);near(map.centerZ,75000);
});
