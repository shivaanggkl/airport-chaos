export type FeedbackIntensity = 'small' | 'medium' | 'major';
export type FeedbackEvent = { type: string; primaryText: string; secondaryText?: string; intensity: FeedbackIntensity };

const priority: Record<FeedbackIntensity, number> = { small: 1, medium: 2, major: 3 };

export class GameplayFeedbackSystem {
  private pending: FeedbackEvent[] = [];
  private activeUntil = 0;
  private timer = 0;

  constructor(private readonly element: HTMLElement) {}

  push(event: FeedbackEvent): void {
    const duplicate = this.pending.find(item => item.type === event.type && item.primaryText === event.primaryText);
    if (duplicate) duplicate.secondaryText = event.secondaryText ?? duplicate.secondaryText;
    else this.pending.push(event);
    this.pending.sort((a, b) => priority[b.intensity] - priority[a.intensity]);
    if (performance.now() >= this.activeUntil) this.showNext();
  }

  clear(): void {
    this.pending.length = 0; window.clearTimeout(this.timer); this.element.hidden = true;
  }

  private showNext(): void {
    const event = this.pending.shift();
    if (!event) { this.element.hidden = true; return; }
    this.element.className = `gameplay-feedback ${event.intensity}`;
    this.element.replaceChildren(Object.assign(document.createElement('strong'), { textContent: event.primaryText }),
      Object.assign(document.createElement('span'), { textContent: event.secondaryText ?? '' }));
    this.element.hidden = false;
    this.activeUntil = performance.now() + (event.intensity === 'major' ? 2600 : event.intensity === 'medium' ? 1900 : 1300);
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => { this.element.hidden = true; window.setTimeout(() => this.showNext(), 120); }, this.activeUntil - performance.now());
  }
}
