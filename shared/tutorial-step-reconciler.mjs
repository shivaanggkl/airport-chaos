import { tutorialSteps } from './tutorial-flight-rules.mjs';

/**
 * Serializes authoritative completions that can arrive while the previous
 * lesson's success card is still being shown. Each completion is delivered
 * once, in lesson order, and only after every earlier lesson is resolved.
 */
export class TutorialStepReconciler {
  #queued = new Set();
  #delivered = new Set();

  reset() {
    this.#queued.clear();
    this.#delivered.clear();
  }

  ingest(step, status, states) {
    if (status !== 'completed' || states[step] !== 'completed' || this.#delivered.has(step)) return;
    this.#queued.add(step);
  }

  takeReady(states) {
    for (const step of tutorialSteps) {
      if (!this.#queued.has(step)) continue;
      if (states[step] !== 'completed') {
        this.#queued.delete(step);
        continue;
      }
      const index = tutorialSteps.indexOf(step);
      if (tutorialSteps.slice(0, index).some((candidate) => states[candidate] === 'pending')) continue;
      this.#queued.delete(step);
      this.#delivered.add(step);
      return step;
    }
    return undefined;
  }
}
