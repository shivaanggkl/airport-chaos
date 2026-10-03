import type { TutorialLessonStep, TutorialStepStatus } from './tutorial-flight-rules.mjs';

export type TutorialStepStates = Record<TutorialLessonStep, TutorialStepStatus>;

export declare class TutorialStepReconciler {
  reset(): void;
  ingest(step: TutorialLessonStep, status: TutorialStepStatus, states: TutorialStepStates): void;
  takeReady(states: TutorialStepStates): TutorialLessonStep | undefined;
}
