import { Capacitor, SystemBars } from '@capacitor/core';
import { policyPage } from '../../server/src/legal-pages';

const nativeShell = Capacitor.isNativePlatform();

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

const standalonePage = policyPage(window.location.pathname);

if (standalonePage) {
  document.open();
  document.write(standalonePage);
  document.close();
} else {
  void import('./bootstrap');
}
