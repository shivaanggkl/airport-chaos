export function isEditableControl(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const element = target as HTMLElement;
  if (element.isContentEditable) return true;
  const tagName = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : '';
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  return typeof element.closest === 'function'
    && Boolean(element.closest('[contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="searchbox"], [role="combobox"]'));
}

export function shouldToggleDesktopControlsHelp(
  code: string,
  touchLayout: boolean,
  target: EventTarget | null,
): boolean {
  return code === 'KeyH' && !touchLayout && !isEditableControl(target);
}
