// One circle follows the acquired aircraft; without a target it shows the firing guide.
// Only a fresh server-confirmed lock changes the circle colour.
export const aimingReticleMarkup = `<svg class="aiming-reticle-svg" viewBox="0 0 200 140" aria-hidden="true" focusable="false">
  <circle class="aiming-reticle-outline" cx="100" cy="70" r="50"/>
  <path class="aiming-reticle-outline" d="M50 10H30V130H50 M150 10H170V130H150"/>
  <circle class="aiming-reticle-ring" cx="100" cy="70" r="50"/>
  <path class="aiming-reticle-brackets" d="M50 10H30V130H50 M150 10H170V130H150"/>
</svg>`;
