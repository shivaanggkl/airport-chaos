import { tutorialSteps } from './tutorial-flight-rules.mjs';

// Lock acquisition is automatic in the screenplay; the pilot learns it while firing.
export const trainingSlideIds = Object.freeze(tutorialSteps.filter((step) => step !== 'targetLock'));
