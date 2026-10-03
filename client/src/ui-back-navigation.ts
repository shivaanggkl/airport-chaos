export type UiBackLayer = {
  id: string;
  priority: number;
  isActive: () => boolean;
  close: () => void;
  containsTarget?: (target: EventTarget | null) => boolean;
};

type RegisteredUiBackLayer = UiBackLayer & { order: number };

const layers: RegisteredUiBackLayer[] = [];
let registrationOrder = 0;
let listenerInstalled = false;
let clickAwayListenerInstalled = false;

export const uiBackPriority = {
  transient: 100,
  surface: 200,
  menu: 300,
  modal: 400,
  blockingModal: 500,
} as const;

export function registerUiBackLayer(layer: UiBackLayer): () => void {
  const registered = { ...layer, order: ++registrationOrder };
  layers.push(registered);
  return () => {
    const index = layers.indexOf(registered);
    if (index >= 0) layers.splice(index, 1);
  };
}

export function closeTopUiLayer(): boolean {
  let top: RegisteredUiBackLayer | undefined;
  for (const layer of layers) {
    if (!layer.isActive()) continue;
    if (!top || layer.priority > top.priority || (layer.priority === top.priority && layer.order > top.order)) top = layer;
  }
  if (!top) return false;
  top.close();
  return true;
}

function topClickAwayLayer(): RegisteredUiBackLayer | undefined {
  let top: RegisteredUiBackLayer | undefined;
  for (const layer of layers) {
    if (!layer.isActive() || !layer.containsTarget) continue;
    if (!top || layer.priority > top.priority || (layer.priority === top.priority && layer.order > top.order)) top = layer;
  }
  return top;
}

export function handleUiClickAway(event: Pick<PointerEvent, 'target' | 'cancelable' | 'preventDefault' | 'stopImmediatePropagation'>): boolean {
  const top = topClickAwayLayer();
  if (!top || top.containsTarget?.(event.target)) return false;
  if (event.cancelable) event.preventDefault();
  event.stopImmediatePropagation();
  top.close();
  return true;
}

export function handleUiEscape(event: Pick<KeyboardEvent, 'code' | 'key' | 'repeat' | 'preventDefault' | 'stopImmediatePropagation'>): boolean {
  if ((event.code !== 'Escape' && event.key !== 'Escape') || event.repeat) return false;
  if (!closeTopUiLayer()) return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('airport-chaos-ui-back'));
  return true;
}

export function installUniversalEscapeHandler(): void {
  if (listenerInstalled) return;
  listenerInstalled = true;
  window.addEventListener('keydown', handleUiEscape, true);
  if (!clickAwayListenerInstalled) {
    clickAwayListenerInstalled = true;
    window.addEventListener('pointerdown', handleUiClickAway, true);
  }
}
