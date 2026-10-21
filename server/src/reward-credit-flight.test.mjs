import assert from 'node:assert/strict';
import test from 'node:test';
import { AppShellHeader } from '../../client/src/app-shell.ts';

test('earned credits reach the header before its balance counts up', () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const frames = new Map();
  const coins = [];
  let nextFrame = 0;
  globalThis.document = {
    hidden: false,
    body: { append: coin => { coins.push(coin); } },
    createElement: () => ({ style: {}, remove() { this.removed = true; }, setAttribute() {} }),
  };
  globalThis.window = {
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: id => { frames.delete(id); },
  };

  try {
    const classes = new Set();
    const header = Object.create(AppShellHeader.prototype);
    header.element = { hidden: false };
    header.credits = { textContent: '100' };
    header.creditParticles = [];
    header.creditMark = {
      getBoundingClientRect: () => ({ left: 900, top: 20, width: 46, height: 46 }),
      classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
    };
    let start;
    const tick = elapsed => {
      const [id, frame] = frames.entries().next().value;
      frames.delete(id);
      frame(start + elapsed);
    };

    header.animateCreditsEarned({ left: 100, top: 350, width: 160, height: 60 }, 100, 125);
    start = performance.now();
    assert.equal(header.credits.textContent, '100');
    assert.equal(coins.length, 5);
    tick(600);
    assert.equal(header.credits.textContent, '100');
    tick(900);
    assert.ok(classes.has('is-credit-landing'));
    tick(1_000);
    assert.ok(Number(header.credits.textContent) > 100);
    tick(1_400);
    assert.equal(header.credits.textContent, '125');
    assert.ok(coins.every(coin => coin.removed));

    header.animateCreditsEarned({ left: 100, top: 350, width: 160, height: 60 }, 125, 175);
    header.hide();
    assert.equal(header.credits.textContent, '175');
    assert.equal(frames.size, 0);
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});
