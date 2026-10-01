const editableSelector = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="searchbox"], [role="combobox"]';
export function editableViewportRecovered(height, baselineHeight, scale) {
    return scale <= 1.01 && height >= baselineHeight - 2;
}
export function installEditableViewportRecovery(enabled) {
    const viewport = window.visualViewport;
    if (!enabled || !viewport)
        return;
    const root = document.documentElement;
    let editing = false;
    let awaitingRecovery = false;
    let baselineHeight = viewport.height;
    let syncFrame = 0;
    const activeEditable = () => {
        const active = document.activeElement;
        const editable = active instanceof Element ? active.closest(editableSelector) : null;
        return editable?.closest('#pilot-menu-overlay') ? editable : null;
    };
    const applyVisibleViewport = () => {
        root.style.setProperty('--editable-viewport-top', `${viewport.offsetTop}px`);
        root.style.setProperty('--editable-viewport-left', `${viewport.offsetLeft}px`);
        root.style.setProperty('--editable-viewport-width', `${viewport.width}px`);
        root.style.setProperty('--editable-viewport-height', `${viewport.height}px`);
    };
    const clearTemporaryLayout = () => {
        root.classList.remove('editable-keyboard-open');
        for (const property of ['--editable-viewport-top', '--editable-viewport-left', '--editable-viewport-width', '--editable-viewport-height']) {
            root.style.removeProperty(property);
        }
    };
    const restoreScrollOrigin = () => {
        window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
        document.scrollingElement?.scrollTo({ left: 0, top: 0, behavior: 'instant' });
    };
    const finishViewportRecovery = () => {
        if (!awaitingRecovery)
            return;
        awaitingRecovery = false;
        baselineHeight = viewport.height;
        restoreScrollOrigin();
        // WebKit does not consistently emit a layout-viewport resize after the
        // visual viewport expands. Re-run the app's existing resize paths once,
        // after recovery, so renderers, safe areas, and touch bounds use the
        // restored landscape dimensions.
        window.dispatchEvent(new Event('resize'));
    };
    const restoreLayoutViewport = () => {
        editing = false;
        awaitingRecovery = true;
        clearTemporaryLayout();
        restoreScrollOrigin();
        if (editableViewportRecovered(viewport.height, baselineHeight, viewport.scale))
            finishViewportRecovery();
    };
    const sync = () => {
        syncFrame = 0;
        if (activeEditable()) {
            editing = true;
            awaitingRecovery = false;
            if (!editableViewportRecovered(viewport.height, baselineHeight, viewport.scale) || viewport.offsetTop > 0 || viewport.offsetLeft > 0) {
                root.classList.add('editable-keyboard-open');
                applyVisibleViewport();
            }
            else {
                clearTemporaryLayout();
            }
            return;
        }
        if (editing)
            restoreLayoutViewport();
        else if (awaitingRecovery && editableViewportRecovered(viewport.height, baselineHeight, viewport.scale))
            finishViewportRecovery();
        else if (!awaitingRecovery)
            baselineHeight = viewport.height;
    };
    const scheduleSync = () => {
        if (!syncFrame)
            syncFrame = requestAnimationFrame(sync);
    };
    document.addEventListener('focusin', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target?.closest(editableSelector)?.closest('#pilot-menu-overlay'))
            return;
        baselineHeight = viewport.height;
        editing = true;
        awaitingRecovery = false;
        scheduleSync();
    });
    document.addEventListener('focusout', scheduleSync);
    viewport.addEventListener('resize', scheduleSync);
    viewport.addEventListener('scroll', scheduleSync);
    window.addEventListener('resize', scheduleSync);
    window.addEventListener('orientationchange', () => {
        clearTemporaryLayout();
        restoreScrollOrigin();
        baselineHeight = viewport.height;
        scheduleSync();
    });
    window.addEventListener('pageshow', () => {
        if (!activeEditable())
            restoreLayoutViewport();
    });
}
