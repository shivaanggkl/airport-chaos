import { isEditableControl, shouldIgnoreGameplayKeyboardEvent } from '../../shared/editable-keyboard.mjs';

export { isEditableControl, shouldIgnoreGameplayKeyboardEvent };

export function shouldToggleDesktopControlsHelp(
  code: string,
  touchLayout: boolean,
  target: EventTarget | null,
): boolean {
  return code === 'KeyH' && !touchLayout && !isEditableControl(target);
}
