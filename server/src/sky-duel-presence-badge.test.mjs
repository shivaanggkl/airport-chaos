import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../../client/src/sky-duel-presence.ts',import.meta.url),'utf8').replace(/^import.*$/gm,'');
function fixture(){
 const requests=[],timers=new Map();let id=0;
 class Element{children=[];attributes={};classList={add(){},remove(){}};append(...items){this.children.push(...items);}setAttribute(k,v){this.attributes[k]=v;}}
 const ctx=vm.createContext({exports:{},document:{createElement:()=>new Element()},AbortController,apiUrl:path=>path,
  apiFetch:(path,init)=>new Promise(resolve=>requests.push({path,init,resolve})),window:{setTimeout(fn,ms){timers.set(++id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)}});
 vm.runInContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,ctx);
 return {badge:new ctx.exports.SkyDuelPresenceBadge(),requests,timers};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('badge displays real zero and positive counts, handles errors honestly, and retries on one timer',async()=>{
 const f=fixture();assert.equal(f.requests.length,0);f.badge.setVisible(true);f.badge.setVisible(true);assert.equal(f.requests.length,1);
 assert.equal(f.requests[0].path,'/api/sky-duel/presence');f.requests[0].resolve({ok:true,json:async()=>({online:0})});await flush();
 assert.equal(f.badge.element.children[1].textContent,'0 PLAYERS ONLINE');assert.equal([...f.timers.values()][0].ms,30_000);
 const [id,timer]=[...f.timers][0];f.timers.delete(id);timer.fn();f.requests[1].resolve({ok:true,json:async()=>({online:27})});await flush();
 assert.equal(f.badge.element.children[1].textContent,'27 PLAYERS ONLINE');
 const [id2,timer2]=[...f.timers][0];f.timers.delete(id2);timer2.fn();f.requests[2].resolve({ok:false});await flush();
 assert.equal(f.badge.element.children[1].textContent,'— PLAYERS ONLINE');assert.equal(f.timers.size,1);f.badge.setVisible(false);assert.equal(f.timers.size,0);
});
test('hidden cards abort pending requests and ignore stale or invalid responses',async()=>{
 const f=fixture();f.badge.setVisible(true);f.badge.setVisible(false);assert.equal(f.requests[0].init.signal.aborted,true);
 f.requests[0].resolve({ok:true,json:async()=>({online:99})});await flush();assert.equal(f.badge.element.children[1].textContent,'— PLAYERS ONLINE');assert.equal(f.timers.size,0);
 f.badge.setVisible(true);f.requests[1].resolve({ok:true,json:async()=>({online:-1})});await flush();assert.equal(f.badge.element.children[1].textContent,'— PLAYERS ONLINE');f.badge.setVisible(false);
});
