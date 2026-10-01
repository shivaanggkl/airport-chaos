export class BrandLoadingScreen {
  private static readonly minimumVisibleMs = 2_000;
  private readonly progress: HTMLProgressElement;
  private readonly progressText: HTMLElement;
  private readonly shownAt = performance.now();
  private value = 0;

  constructor(private readonly element: HTMLElement) {
    this.progress = element.querySelector<HTMLProgressElement>('[data-startup-progress]')!;
    this.progressText = element.querySelector<HTMLElement>('[data-startup-progress-text]')!;
  }

  update(value: number): void {
    this.value = Math.max(this.value, Math.min(1, value));
    this.progress.value = this.value;
    this.progressText.textContent = `${Math.round(this.value * 100)}%`;
  }

  async finish(): Promise<void> {
    this.update(1);
    this.element.classList.add('is-complete');
    const remainingMinimum = BrandLoadingScreen.minimumVisibleMs - (performance.now() - this.shownAt);
    if (remainingMinimum > 0) await new Promise<void>(resolve => window.setTimeout(resolve, remainingMinimum));
    // Let the browser paint the genuinely completed bar before beginning the
    // requested transition. Slow initialization is never delayed further.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    this.element.classList.add('is-leaving');
    await new Promise<void>((resolve) => {
      const fallback = window.setTimeout(resolve, 340);
      this.element.addEventListener('transitionend', () => {
        window.clearTimeout(fallback);
        resolve();
      }, { once: true });
    });
    this.element.hidden = true;
  }
}
