type HorizontalRailOptions = {
  itemSelector: string;
  previous?: HTMLButtonElement;
  next?: HTMLButtonElement;
  progress?: HTMLElement;
  thumb?: HTMLElement;
  draggable?: boolean;
  wheel?: boolean;
  keyboard?: boolean;
  onResize?: () => void;
};

/** Native horizontal scrolling with shared edge and progress state. */
export class HorizontalRail {
  private readonly observer: ResizeObserver;
  private dragStart?: { x: number; scrollLeft: number; pointerId: number };

  constructor(private readonly root: HTMLElement, private readonly viewport: HTMLElement, private readonly options: HorizontalRailOptions) {
    viewport.addEventListener('scroll', () => this.refresh(), { passive: true });
    options.previous?.addEventListener('click', () => this.move(-1));
    options.next?.addEventListener('click', () => this.move(1));
    if (options.draggable) this.enableMouseDrag();
    if (options.wheel) this.enableWheel();
    if (options.keyboard) this.enableKeyboard();
    this.observer = new ResizeObserver(() => { options.onResize?.(); this.refresh(); });
    this.observer.observe(viewport);
  }

  refresh(): void {
    const max = Math.max(0, this.viewport.scrollWidth - this.viewport.clientWidth);
    const position = Math.min(max, Math.max(0, this.viewport.scrollLeft));
    const hasOverflow = max > 2;
    this.root.classList.toggle('has-overflow', hasOverflow);
    this.root.classList.toggle('has-more-left', hasOverflow && position > 2);
    this.root.classList.toggle('has-more-right', hasOverflow && position < max - 2);
    if (this.options.previous) this.options.previous.hidden = !hasOverflow || position <= 2;
    if (this.options.next) this.options.next.hidden = !hasOverflow || position >= max - 2;
    if (this.options.progress && this.options.thumb) {
      const fraction = hasOverflow ? this.viewport.clientWidth / this.viewport.scrollWidth : 1;
      this.options.progress.setAttribute('aria-hidden', String(!hasOverflow));
      this.options.thumb.style.width = `${fraction * 100}%`;
      this.options.thumb.style.left = `${max ? position / max * (1 - fraction) * 100 : 0}%`;
      this.options.progress.setAttribute('aria-valuenow', String(max ? Math.round(position / max * 100) : 0));
    }
  }

  reset(): void { this.viewport.scrollLeft = 0; this.refresh(); }

  reveal(element: HTMLElement): void {
    const left = element.offsetLeft;
    const right = left + element.offsetWidth;
    if (left < this.viewport.scrollLeft) this.viewport.scrollLeft = left;
    else if (right > this.viewport.scrollLeft + this.viewport.clientWidth) this.viewport.scrollLeft = right - this.viewport.clientWidth;
    this.refresh();
  }

  private positions(): number[] {
    return [...this.viewport.querySelectorAll<HTMLElement>(this.options.itemSelector)].map(item => item.offsetLeft);
  }

  private move(direction: -1 | 1): void {
    const current = this.viewport.scrollLeft;
    const positions = this.positions();
    const target = direction > 0
      ? positions.find(position => position > current + 2)
      : positions.filter(position => position < current - 2).pop();
    if (target === undefined) return;
    this.viewport.scrollTo({ left: target, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  private enableMouseDrag(): void {
    this.viewport.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || (event.target as Element).closest('button, a, input')) return;
      this.dragStart = { x: event.clientX, scrollLeft: this.viewport.scrollLeft, pointerId: event.pointerId };
    });
    this.viewport.addEventListener('pointermove', event => {
      const start = this.dragStart;
      if (!start || event.pointerId !== start.pointerId) return;
      if (!this.root.classList.contains('is-dragging') && Math.abs(event.clientX - start.x) < 5) return;
      if (!this.root.classList.contains('is-dragging')) {
        this.root.classList.add('is-dragging');
        this.viewport.setPointerCapture(event.pointerId);
      }
      this.viewport.scrollLeft = start.scrollLeft + start.x - event.clientX;
      event.preventDefault();
    });
    const end = (event: PointerEvent) => {
      if (event.pointerId !== this.dragStart?.pointerId) return;
      this.dragStart = undefined;
      if (!this.root.classList.contains('is-dragging')) return;
      this.root.classList.remove('is-dragging');
      if (this.viewport.hasPointerCapture(event.pointerId)) this.viewport.releasePointerCapture(event.pointerId);
      const nearest = this.positions().reduce((closest, position) => Math.abs(position - this.viewport.scrollLeft) < Math.abs(closest - this.viewport.scrollLeft) ? position : closest, 0);
      this.viewport.scrollTo({ left: nearest, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    };
    this.viewport.addEventListener('pointerup', end);
    this.viewport.addEventListener('pointercancel', end);
  }

  private enableWheel(): void {
    this.viewport.addEventListener('wheel', event => {
      if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const max = this.viewport.scrollWidth - this.viewport.clientWidth;
      if (max <= 2 || (event.deltaY < 0 && this.viewport.scrollLeft <= 0) || (event.deltaY > 0 && this.viewport.scrollLeft >= max)) return;
      event.preventDefault();
      this.viewport.scrollLeft += event.deltaY;
    }, { passive: false });
  }

  private enableKeyboard(): void {
    this.viewport.addEventListener('keydown', event => {
      if (event.target !== this.viewport) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault(); this.move(event.key === 'ArrowRight' ? 1 : -1);
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        this.viewport.scrollTo({ left: event.key === 'Home' ? 0 : this.viewport.scrollWidth, behavior: 'auto' });
      }
    });
  }
}
