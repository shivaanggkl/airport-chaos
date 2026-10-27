import assert from 'node:assert/strict';
import test from 'node:test';
import { CrashSequence } from '../../client/src/crash-sequence.ts';

for (const surface of ['transport', 'ground', 'obstacle', 'runway']) {
  test(`${surface} crash blasts immediately, once, before the result`, () => {
    const sequence = new CrashSequence('attempt-1', surface);
    const impact = sequence.update(0);
    assert.equal(impact.blast, true);
    assert.equal(impact.complete, false);
    assert.ok(impact.flash > 0);
    assert.equal(sequence.update(.1).blast, false);
    assert.equal(sequence.update(.96).complete, true);
  });
}
