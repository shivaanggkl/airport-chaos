/** Focused local collision benchmark. Does not contact deployed environments. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';
const root=new URL('../',import.meta.url),mode=process.argv[2],output=process.argv[3]??'/tmp/airport-chaos-memory-p0';
if(!mode){
  mkdirSync(output,{recursive:true});
  const {loadDallasCombatBuildings}=await import('../server/src/dallas-collision-source.js');
  const {monsterBuildingCoverage}=await import('../server/src/monster-arrival.js');
  const {transportBuildingCoverage}=await import('../server/src/giant-incoming.js');
  const source=loadDallasCombatBuildings([monsterBuildingCoverage(),transportBuildingCoverage()]);
  let state=9981;const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
  const queries=[];
  for(let i=0;i<4000;i++){
    const b=source[Math.floor(random()*source.length)]!,x=(b.minX+b.maxX)/2,z=(b.minZ+b.maxZ)/2,angle=random()*Math.PI*2,distance=i%3===0?6000:random()*6000;
    queries.push([{x,y:b.top+random()*500,z},{x:x+Math.cos(angle)*distance,y:b.top-50,z:z+Math.sin(angle)*distance},i%7===0?24:0]);
  }
  writeFileSync(`${output}/queries.json`,JSON.stringify(queries));
  const original=readFileSync(new URL('../server/src/fixtures/collision-reference.ts.txt',import.meta.url),'utf8');
  const compiled=ts.transpileModule(original,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  writeFileSync(`${output}/reference.mjs`,compiled);
  for(const m of ['before','after']){
    const child=spawnSync(process.execPath,['--expose-gc','--import','tsx',import.meta.filename,m,output],{cwd:root,encoding:'utf8',timeout:60000});
    if(child.status!==0)throw Error(child.stderr||child.stdout);console.log(child.stdout.trim());
  }
  if(!readFileSync(`${output}/before-decisions.json`).equals(readFileSync(`${output}/after-decisions.json`)))throw Error('Collision decisions changed');
}else{
  const queries=JSON.parse(readFileSync(`${output}/queries.json`,'utf8'));
  let data:any,segment:any;const start=performance.now();
  if(mode==='before'){
    const {loadDallasCombatBuildings}=await import('../server/src/dallas-collision-source.js');
    const {monsterBuildingCoverage}=await import('../server/src/monster-arrival.js');
    const {transportBuildingCoverage}=await import('../server/src/giant-incoming.js');
    const old=await import(pathToFileURL(`${output}/reference.mjs`).href);
    data=loadDallasCombatBuildings([monsterBuildingCoverage(),transportBuildingCoverage()]);old.indexBuildingsForOcclusion(data);segment=old.segmentBlockedByBuildings;
  }else{
    const {loadDallasCombatBuildings}=await import('../server/src/dallas-building-occlusion.js');
    const {segmentBlockedByBuildings}=await import('../server/src/monster-arrival.js');
    data=loadDallasCombatBuildings();segment=segmentBlockedByBuildings;
  }
  const startupMs=performance.now()-start;
  for(const q of queries)segment(q[0],q[1],data,q[2]);
  const times:number[]=[],decisions:boolean[]=[];
  for(const q of queries){const now=performance.now();decisions.push(segment(q[0],q[1],data,q[2]));times.push(performance.now()-now);}
  times.sort((a,b)=>a-b);global.gc?.();const m=process.memoryUsage();
  const result={mode,queries:times.length,p50Ms:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)],maxMs:times.at(-1),heapMiB:m.heapUsed/1048576,rssMiB:m.rss/1048576,peakRssMiB:process.resourceUsage().maxRSS/1024,startupMs};
  writeFileSync(`${output}/${mode}-collision.json`,JSON.stringify(result));writeFileSync(`${output}/${mode}-decisions.json`,JSON.stringify(decisions));console.log(JSON.stringify(result));
}
