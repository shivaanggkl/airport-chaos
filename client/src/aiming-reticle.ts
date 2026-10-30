// A compact firing crosshair; the projected host follows the actual gun ray.
export const aimingReticleMarkup = `<svg class="aiming-reticle-svg" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
  <circle class="aiming-reticle-outline" cx="20" cy="20" r="9"/>
  <path class="aiming-reticle-outline" d="M20 4V12 M20 28V36 M4 20H12 M28 20H36"/>
  <circle class="aiming-reticle-ring" cx="20" cy="20" r="9"/>
  <path class="aiming-reticle-brackets" d="M20 4V12 M20 28V36 M4 20H12 M28 20H36"/>
  <circle class="aiming-reticle-center" cx="20" cy="20" r="1.5"/>
</svg>`;
