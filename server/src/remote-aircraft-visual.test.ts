import assert from 'node:assert/strict';
import test from 'node:test';
import { remoteProxyPixelWidth } from '../../shared/remote-aircraft-visual-rules.mjs';

test('remote readability proxy transitions continuously through former scale thresholds', () => {
  assert.equal(remoteProxyPixelWidth(25), 20);
  assert.equal(remoteProxyPixelWidth(350), 20);
  assert.equal(remoteProxyPixelWidth(550), 16);
  assert.equal(remoteProxyPixelWidth(900), 16);
  assert.equal(remoteProxyPixelWidth(1_300), 12);
  assert.equal(remoteProxyPixelWidth(12_000), 12);

  for (const threshold of [450, 1_100]) {
    assert.ok(Math.abs(remoteProxyPixelWidth(threshold - 0.01) - remoteProxyPixelWidth(threshold + 0.01)) < 0.001);
  }
});

test('remote readability proxy never grows as distance increases', () => {
  let previous = remoteProxyPixelWidth(0);
  for (let distance = 1; distance <= 12_000; distance += 1) {
    const current = remoteProxyPixelWidth(distance);
    assert.ok(current <= previous, `proxy grew at ${distance}m`);
    assert.ok(current >= 12 && current <= 20);
    previous = current;
  }
});
