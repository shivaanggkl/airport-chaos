export type KeyboardInputEvent = {
  code: string;
  key: string;
  target: unknown;
};

export function isEditableControl(target: unknown): boolean;
export function shouldIgnoreGameplayKeyboardEvent(event: KeyboardInputEvent, activeTarget?: unknown): boolean;
