export function createMenuCarouselCard(cardClass: string, artClass: string, copyClass: string, tag: 'article' | 'button' = 'article'): { card: HTMLElement; art: HTMLElement; copy: HTMLElement } {
  const card = document.createElement(tag);
  card.className = `game-card-frame menu-selection-card menu-card-carousel-card ${cardClass}`;
  const art = document.createElement('div');
  art.className = `menu-selection-card-art menu-card-carousel-art ${artClass}`;
  art.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('div');
  copy.className = `menu-selection-card-copy menu-card-carousel-copy ${copyClass}`;
  card.append(art, copy);
  return { card, art, copy };
}

export function positionMenuCarouselCard(card: HTMLElement, offset: number): void {
  card.classList.toggle('is-selected', offset === 0);
  card.classList.toggle('is-previous', offset === -1);
  card.classList.toggle('is-next', offset === 1);
  card.classList.toggle('is-before', offset < -1);
  card.classList.toggle('is-after', offset > 1);
  card.classList.toggle('is-hidden', Math.abs(offset) > 1);
  card.setAttribute('aria-hidden', Math.abs(offset) > 1 ? 'true' : 'false');
}

export function installMenuCarouselSwipe(container: HTMLElement, onGestureEnd: (direction: -1 | 0 | 1) => void): void {
  let pointer: { id: number; x: number; y: number; dragging: boolean } | undefined;
  container.onpointerdown = event => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('.city-journey-arrow')) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
  };
  container.onpointermove = event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (!pointer.dragging && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { pointer = undefined; return; }
    if (!pointer.dragging && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      pointer.dragging = true;
      container.classList.add('is-dragging');
      container.setPointerCapture(event.pointerId);
    }
    if (!pointer.dragging) return;
    event.preventDefault();
    const limit = Math.max(70, container.clientWidth * .28);
    const bounded = Math.max(-limit, Math.min(limit, dx));
    container.style.setProperty('--journey-drag-x', `${bounded}px`);
    container.style.setProperty('--journey-side-drag-x', `${bounded * .55}px`);
  };
  const finish = (event: PointerEvent, cancelled: boolean): void => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    const wasDragging = pointer.dragging;
    pointer = undefined;
    if (!wasDragging) return;
    container.classList.remove('is-dragging');
    void container.offsetWidth;
    container.style.removeProperty('--journey-drag-x');
    container.style.removeProperty('--journey-side-drag-x');
    onGestureEnd(!cancelled && Math.abs(dx) >= 42 && Math.abs(dx) > Math.abs(dy) ? dx < 0 ? 1 : -1 : 0);
  };
  container.onpointerup = event => finish(event, false);
  container.onpointercancel = event => finish(event, true);
}

