/** One lock symbol for unavailable choices; callers size it with CSS. */
export function createLockIcon(): SVGSVGElement {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.classList.add('ui-lock-icon');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = '<path d="M6.5 10V7.5a5.5 5.5 0 0 1 11 0V10" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><rect x="4" y="10" width="16" height="12" rx="3" fill="#f2b943" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="16" r="1.6" fill="#fff7df"/>';
  return icon;
}
