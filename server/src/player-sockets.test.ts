import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerSockets } from './player-sockets.js';

test('authorized socket replacement, stale close, city transitions and cleanup keep indexes consistent', () => {
  const cities = new Map([['a', 'dallas'], ['b', 'milwaukee']]);
  const sockets = new PlayerSockets<object>(id => cities.get(id));
  const first = {}, replacement = {}, second = {};
  sockets.set(first, 'a').set(second, 'b');
  assert.deepEqual([...sockets.inCity('dallas')], [[first, 'a']]);
  sockets.set(replacement, 'a');
  assert.equal(sockets.delete(first), false);
  assert.equal(sockets.socketFor('a'), replacement);
  assert.equal(sockets.size, 2);
  cities.set('a', 'milwaukee'); sockets.refreshCity('a');
  assert.equal([...sockets.inCity('dallas')].length, 0);
  assert.deepEqual([...sockets.inCity('milwaukee')], [[second, 'b'], [replacement, 'a']]);
  cities.set('a', 'dallas'); sockets.refreshCity('a');
  assert.deepEqual([...sockets.inCity('dallas')], [[replacement, 'a']]);
  sockets.set(replacement, 'b');
  assert.equal(sockets.socketFor('a'), undefined);
  assert.equal(sockets.has(second), false);
  assert.deepEqual([...sockets.inCity('milwaukee')], [[replacement, 'b']]);
  sockets.clear();
  assert.equal(sockets.size, 0);
  assert.equal(sockets.socketFor('b'), undefined);
  assert.equal([...sockets.inCity('milwaukee')].length, 0);
});
