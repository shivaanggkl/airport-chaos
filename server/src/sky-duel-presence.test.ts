import test from 'node:test';
import assert from 'node:assert/strict';
import {skyDuelOnlineCount} from './sky-duel-presence.js';

test('online counts unique connected humans in Sky Duel queues and all live session phases only',()=>{
  const players=new Map([
    ['waiting',{pilotId:'a',skyDuelMode:true}],['playing',{pilotId:'b',skyDuelMode:true}],
    ['duplicate',{pilotId:'a',skyDuelMode:true}],['bot',{pilotId:'ai',isBot:true,skyDuelMode:true}],
    ['disconnected',{pilotId:'c',skyDuelMode:true}],['free-fly',{pilotId:'d',skyDuelMode:false}],
    ['mission',{pilotId:'e'}],['idle',{pilotId:'f',skyDuelMode:true}],
  ]);
  const queue=['waiting','duplicate','disconnected','free-fly','mission','missing'].map(playerId=>({playerId}));
  const sessions=[{playerA:'waiting',playerB:'playing'},{playerA:'playing',playerB:'bot'}];
  assert.equal(skyDuelOnlineCount(queue,sessions,players,id=>id!=='disconnected'),2);
  assert.equal(skyDuelOnlineCount([],[],players,()=>true),0);
  assert.equal(skyDuelOnlineCount(queue,sessions,players,()=>false),0);
});
