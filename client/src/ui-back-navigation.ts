export type UiBackLayer = {
  id: string;
  priority: number;
  isActive: () => boolean;
  close: () => void;
};

type RegisteredUiBackLayer = UiBackLayer & { order: number };

const layers: RegisteredUiBackLayer[] = [];
let registrationOrder = 0;
let listenerInstalled = false;

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

export function handleUiEscape(event: Pick<KeyboardEvent, 'code' | 'key' | 'repeat' | 'preventDefault' | 'stopImmediatePropagation'>): boolean {
  if ((event.code !== 'Escape' && event.key !== 'Escape') || event.repeat) return false;
  if (!closeTopUiLayer()) return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  return true;
}

export function installUniversalEscapeHandler(): void {
  if (listenerInstalled) return;
  listenerInstalled = true;
  window.addEventListener('keydown', handleUiEscape, true);
}
