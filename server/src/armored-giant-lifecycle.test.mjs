import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as missions from '../../shared/journey-mission.mjs';

const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const start = server.indexOf('    const armoredGiantDestroyed =');
assert(start >= 0);
const transition = server.slice(start, server.indexOf('    sendJourneyState(ownerId, result);', start));
const active = { missionId: missions.journeyDallas12.id, status: 'RACING', deadlineAt: 99999,
  monsterHealth: 0, fortressLeftHealth: 0, fortressRightHealth: 0, rearGuardKills: 1 };

for (const last of ['monsterHealth','fortressLeftHealth','fortressRightHealth']) {
  test(`M18 giant destruction begins when ${last} is the final component, with an escort still alive`, () => {
    const messages = [];
    const ctx = vm.createContext({ ...missions, a: { ...active, [last]: 25 }, result: active,
      ownerId: 'pilot', e: { attemptId: 'attempt' }, now: 1234, sendToPlayer: (id, message) => messages.push({id,...message}) });
    vm.runInContext(transition, ctx);
    assert.deepEqual(messages, [{id:'pilot',type:'transportFinal',attemptId:'attempt',kind:'defeat',at:1234}]);
    assert.equal(ctx.result.status, 'RACING', 'escort battle continues');
  });
}

test('partial armored damage never starts a blast, and mission completion keeps its existing final path', () => {
  for (const remaining of ['monsterHealth','fortressLeftHealth','fortressRightHealth','completed']) {
    const messages = [];
    const result = remaining === 'completed' ? {...active,status:'COMPLETED'} : {...active,[remaining]:25};
    vm.runInNewContext(transition, {...missions,a:{...active,monsterHealth:25},result,ownerId:'pilot',e:{attemptId:'attempt'},now:1234,sendToPlayer:message=>messages.push(message)});
    assert.deepEqual(messages, []);
  }
});

const tickStart = server.indexOf('function updateTransportEncounters(');
const tick = server.slice(tickStart, server.indexOf('        const previousTickAt=',tickStart)) + ' stepped.push(e);\n}}';
test('server no longer simulates or collides with a destroyed M18 giant while living components remain active', () => {
  for (const remaining of [null,'monsterHealth','fortressLeftHealth','fortressRightHealth']) {
    const stepped = [], attempt = remaining ? {...active,[remaining]:25} : active;
    const ctx = vm.createContext({...missions,pausedJourneyAttempts:new Set(),transportEncounters:new Map([['attempt',{attemptId:'attempt',playerId:'pilot'}]]),
      players:new Map([['pilot',{pilotId:'pilot'}]]),journeyStore:{get:()=>attempt},stepped});
    vm.runInContext(ts.transpileModule(tick,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+'\nupdateTransportEncounters(1234);',ctx);
    assert.equal(stepped.length, remaining ? 1 : 0);
  }
});

const ast=ts.createSourceFile('main.ts',client,ts.ScriptTarget.Latest,true);
let restore;
function visit(node){
  if(ts.isIfStatement(node)&&node.expression.getText(ast).startsWith("message.attempt.missionId===journeyDallas12.id && message.attempt.status==='RACING'"))restore=node.getText(ast);
  ts.forEachChild(node,visit);
}
visit(ast);assert(restore);
test('authoritative M18 state starts or restores only the fully destroyed giant presentation',()=>{
  for(const remaining of [null,'monsterHealth','fortressLeftHealth','fortressRightHealth']){
    const calls=[];
    vm.runInNewContext(restore,{...missions,message:{attempt:remaining?{...active,[remaining]:25}:active},transportView:{finish:kind=>calls.push(kind)}});
    assert.deepEqual(calls,remaining?[]:['defeat']);
  }
});
