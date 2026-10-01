import { Capacitor, SystemBars } from '@capacitor/core';
import { policyPage } from '../../server/src/legal-pages';
import { installEditableViewportRecovery } from './mobile-viewport';
import { installUniversalEscapeHandler } from './ui-back-navigation';

const nativeShell = Capacitor.isNativePlatform();
const editableTargetSelector = 'input, textarea, select, [contenteditable="true"]';

installUniversalEscapeHandler();

const gameplayGestureTarget = (event: Event): Element | null => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest('#game-root') || target.closest('#pilot-menu-overlay')) return null;
  return target.closest(editableTargetSelector) ? null : target;
};

const mobileGameplayGesturesEnabled = (): boolean =>
  nativeShell || document.documentElement.classList.contains('touch-controls-enabled');

const gameplayControlTarget = (event: Event): Element | null => {
  const target = event.target instanceof Element ? event.target : null;
  return target?.closest('#touch-controls [data-touch-control], .touch-aim-enabled') ?? null;
};

installEditableViewportRecovery(nativeShell || matchMedia('(pointer: coarse)').matches);

if (nativeShell) {
  document.documentElement.classList.add('native-shell');
  const hideSystemBars = () => { void SystemBars.hide({ animation: 'NONE' }).catch(() => undefined); };
  hideSystemBars();
  window.addEventListener('pageshow', hideSystemBars);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) hideSystemBars(); });
}

document.addEventListener('contextmenu', (event) => {
  if (!nativeShell && !document.documentElement.classList.contains('touch-controls-enabled')) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest('#game-root, #city-selector, #garage-overlay')) return;
  if (target.closest('input, textarea, select, [contenteditable="true"], a[href]')) return;
  event.preventDefault();
});

const preventNativeGameplayZoom = (event: Event) => {
  if (!mobileGameplayGesturesEnabled() || !gameplayGestureTarget(event) || !event.cancelable) return;
  event.preventDefault();
};

// Safari/WKWebView can begin its native magnification gesture before the
// canvas receives both pointers. Blocking that browser gesture here leaves
// the game's pointer-driven camera pinch path intact.
document.addEventListener('gesturestart', preventNativeGameplayZoom, { passive: false, capture: true });
document.addEventListener('gesturechange', preventNativeGameplayZoom, { passive: false, capture: true });
document.addEventListener('gestureend', preventNativeGameplayZoom, { passive: false, capture: true });
document.addEventListener('touchmove', (event) => {
  if (event.touches.length > 1) preventNativeGameplayZoom(event);
}, { passive: false, capture: true });

// `touch-action: none` is the primary gesture contract. This scoped touch-end
// guard covers older Safari/WKWebView double-tap recognition without changing
// form controls or the two-pointer camera path on the flight canvas.
document.addEventListener('touchend', (event) => {
  if (mobileGameplayGesturesEnabled() && gameplayControlTarget(event) && event.cancelable) event.preventDefault();
}, { passive: false, capture: true });
document.addEventListener('dblclick', (event) => {
  if (mobileGameplayGesturesEnabled() && gameplayGestureTarget(event) && event.cancelable) event.preventDefault();
}, { capture: true });

document.addEventListener('selectstart', (event) => {
  if (mobileGameplayGesturesEnabled() && gameplayGestureTarget(event) && event.cancelable) event.preventDefault();
});
document.addEventListener('pointerdown', (event) => {
  if (!mobileGameplayGesturesEnabled() || !gameplayGestureTarget(event)) return;
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed) selection.removeAllRanges();
}, { capture: true });

const standalonePage = policyPage(window.location.pathname);

if (standalonePage) {
  document.open();
  document.write(standalonePage);
  document.close();
} else {
  void import('./bootstrap');
}
