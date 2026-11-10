import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as missions from '../../shared/journey-mission.mjs';

const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
const start = server.indexOf('    const armored = result.missionId');
assert(start >= 0);
const transition = server.slice(start, server.indexOf('    sendJourneyState(ownerId, result);', start));
const pose = { x: 50, y: 500, z: -250, yaw: .2, roll: .1, velocity: { x: 0, y: 0, z: -100 } };
const hit = { x: 55, y: 510, z: -230 };
const startPoint = { x: 55, y: 510, z: 100 };
const shotContext = { projectile: undefined, start: startPoint, hit, hitShotId: 'fatal', afterPose: pose,
  owner: { velocity: pose.velocity }, assistedTracerSpeed: () => 600 };
const active = { missionId: missions.journeyDallas12.id, status: 'RACING', deadlineAt: 99999,
  monsterHealth: 0, fortressLeftHealth: 0, fortressRightHealth: 0, rearGuardKills: 1 };

for (const last of ['monsterHealth','fortressLeftHealth','fortressRightHealth']) {
  test(`M18 giant destruction begins when ${last} is the final component, with an escort still alive`, () => {
    const messages = [];
    const ctx = vm.createContext({ ...missions, ...shotContext, a: { ...active, [last]: 25 }, result: active,
      ownerId: 'pilot', e: { attemptId: 'attempt' }, now: 1234, sendToPlayer: (id, message) => messages.push({id,...message}) });
    vm.runInContext(transition, ctx);
    assert.deepEqual(JSON.parse(JSON.stringify(messages)), [{id:'pilot',type:'transportFinal',attemptId:'attempt',kind:'defeat',at:1234,
      finishingShot:{id:'fatal',origin:startPoint,impact:hit,pose,speed:600}}]);
    assert.equal(ctx.result.status, 'RACING', 'escort battle continues');
  });
}

test('only the giant plane’s fatal hit sends a finishing shot in M13–M18', () => {
  for (const mission of [missions.journeyDallas07, missions.journeyDallas08, missions.journeyDallas09,
    missions.journeyDallas10, missions.journeyDallas11, missions.journeyDallas12]) {
    for (const health of [25, 0]) {
      const messages = [];
      const before = {...active, missionId: mission.id, monsterHealth: 50};
      const result = {...before, monsterHealth: health, status: health ? 'RACING' : 'COMPLETED'};
      const end = {x: 55, y: 510, z: -240};
      vm.runInNewContext(transition, {...missions, ...shotContext, end,
        projectile:{direction:{x:0,y:0,z:-1},traveled:340,speed:950},
        a:before,result,ownerId:'pilot',e:{attemptId:'attempt'},now:1234,
        sendToPlayer:(_id,message)=>messages.push(message)});
      assert.equal(messages.length, health ? 0 : 1, mission.name);
      if (!health) {
        assert.deepEqual(JSON.parse(JSON.stringify(messages[0].finishingShot.origin)), startPoint);
        assert.equal(messages[0].finishingShot.speed, 950);
      }
    }
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
