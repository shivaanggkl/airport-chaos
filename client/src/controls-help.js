export function isEditableControl(target) {
    if (!target || typeof target !== 'object')
        return false;
    const element = target;
    if (element.isContentEditable)
        return true;
    const tagName = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : '';
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT')
        return true;
    return typeof element.closest === 'function'
        && Boolean(element.closest('[contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="searchbox"], [role="combobox"]'));
}
export function shouldIgnoreGameplayKeyboardEvent(event, activeTarget = typeof document === 'undefined' ? null : document.activeElement) {
    if (event.code === 'Escape' || event.key === 'Escape')
        return false;
    return isEditableControl(event.target) || isEditableControl(activeTarget);
}
export function shouldToggleDesktopControlsHelp(code, touchLayout, target) {
    return code === 'KeyH' && !touchLayout && !isEditableControl(target);
}
