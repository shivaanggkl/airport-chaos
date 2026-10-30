// One circle follows the acquired aircraft; without a target it shows the firing guide.
// Only a fresh server-confirmed lock changes the circle colour.
export const aimingReticleMarkup = `<svg class="aiming-reticle-svg" viewBox="0 0 200 140" aria-hidden="true" focusable="false">
  <circle class="aiming-reticle-outline" cx="100" cy="70" r="50"/>
  <circle class="aiming-reticle-ring" cx="100" cy="70" r="50"/>
</svg>`;
