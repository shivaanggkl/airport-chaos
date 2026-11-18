type PanelBounds = Pick<DOMRectReadOnly, 'top' | 'left' | 'right'>;

/** Leave a direction cue and gaps between the status stack and steering area. */
export function missionPanelHeight(viewportHeight: number, panel: PanelBounds,
  stick?: Pick<DOMRectReadOnly, 'top' | 'left' | 'right'>, directionSpace = 62): number {
  const overlapsStick = stick && stick.right > panel.left && stick.left < panel.right;
  const bottom = Math.min(viewportHeight - 16, overlapsStick ? stick.top : viewportHeight * .78);
  return Math.max(0, Math.floor(bottom - panel.top - directionSpace));
}

/** Measure only on layout changes; never read layout in the flight loop. */
export function bindMissionPanelLayout(layer: HTMLElement, stick: HTMLElement): void {
  let frame = 0;
  const update = () => {
    frame = 0;
    if (!layer.getClientRects().length) return;
    const viewport = window.visualViewport;
    const height = viewport ? viewport.height + viewport.offsetTop : window.innerHeight;
    const bounds = layer.getBoundingClientRect();
    const stickBounds = stick.getClientRects().length ? stick.getBoundingClientRect() : undefined;
    const value = `${missionPanelHeight(height, bounds, stickBounds, layer.querySelector('.mission-objective-docked:not([hidden])') ? 62 : 14)}px`;
    if (layer.style.getPropertyValue('--mission-panels-max-height') !== value)
      layer.style.setProperty('--mission-panels-max-height', value);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  const resize = new ResizeObserver(schedule);
  resize.observe(layer);
  resize.observe(stick);
  // Custom control placement changes position without necessarily changing size.
  let lastPlacement = '';
  const placement = new MutationObserver(() => {
    const value = [layer.className, Boolean(layer.querySelector('.mission-objective-docked:not([hidden])')), stick.classList.contains('uses-default-placement'),
      ...['--touch-left', '--touch-top', '--touch-scale'].map(name => stick.style.getPropertyValue(name))].join('|');
    if (value === lastPlacement) return;
    lastPlacement = value;
    schedule();
  });
  placement.observe(stick, { attributes: true, attributeFilter: ['style', 'class'] });
  placement.observe(layer, { attributes: true, attributeFilter: ['class'], childList:true });
  window.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  schedule();
}
