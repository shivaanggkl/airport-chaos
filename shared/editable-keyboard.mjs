export function isEditableControl(target) {
  if (!target || typeof target !== 'object') return false;
  if (target.isContentEditable) return true;
  const tagName = typeof target.tagName === 'string' ? target.tagName.toUpperCase() : '';
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  return typeof target.closest === 'function'
    && Boolean(target.closest('[contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="searchbox"], [role="combobox"]'));
}

export function shouldIgnoreGameplayKeyboardEvent(event, activeTarget = globalThis.document?.activeElement ?? null) {
  if (event.code === 'Escape' || event.key === 'Escape') return false;
  return isEditableControl(event.target) || isEditableControl(activeTarget);
}
