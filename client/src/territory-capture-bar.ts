export const territoryCaptureCelebrationMs = 2_800;

/** Reuses the existing capture HUD element; values come from Journey server state. */
export class TerritoryCaptureBar {
  private readonly content = document.createElement('div');
  private readonly label: HTMLElement;
  private readonly progress: HTMLProgressElement;
  private readonly percent: HTMLElement;
  private readonly hint = document.createElement('small');
  private signature = '';
  private celebrationOverlay?: HTMLElement;
  private celebrationAnimations: Animation[] = [];

  constructor(private readonly root: HTMLElement) {
    this.hint.className = 'territory-capture-hint';
    this.hint.textContent = 'Defeat the owner to finish capturing.';
    this.hint.hidden = true;
    this.content.className = 'live-territory-status';
    this.content.innerHTML = '<span class="live-territory-icon" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2"><circle cx="16" cy="16" r="10"/><circle cx="16" cy="16" r="4"/><path d="M16 1v8m0 14v8M1 16h8m14 0h8"/></svg><span>✓</span></span><span class="live-territory-label"></span><progress class="live-territory-progress" max="100" aria-label="Territory capture progress"></progress><strong class="live-territory-percent"></strong>';
    this.label = this.content.querySelector('.live-territory-label')!;
    this.progress = this.content.querySelector('progress')!;
    this.percent = this.content.querySelector('.live-territory-percent')!;
  }

  show(name: string, progress: number, captured: boolean, blockedByOwner = false): void {
    const percent = captured ? 100 : Math.floor(Math.max(0, Math.min(100, progress)));
    const signature = `${name}:${percent}:${captured}:${blockedByOwner}`;
    if (this.root.firstElementChild !== this.content) this.root.replaceChildren(this.content, this.hint);
    this.root.classList.add('is-mission-capture');
    this.root.classList.remove('hidden', 'is-holding');
    if (signature === this.signature) return;
    this.signature = signature;
    this.hint.hidden = captured || !blockedByOwner;
    this.root.classList.toggle('is-captured', captured);
    this.progress.value = percent;
    this.progress.hidden = captured;
    this.percent.textContent = `${percent}%`;
    if (captured) {
      this.label.textContent = 'TERRITORY CAPTURED!';
    } else {
      const caption = document.createElement('small');
      caption.textContent = 'CAPTURING:';
      const territory = document.createElement('strong');
      territory.textContent = name;
      this.label.replaceChildren(caption, territory);
    }
  }

  showHold(name: string, elapsed: string, duration: string): void {
    this.hint.hidden = true;
    const signature = `hold:${name}:${elapsed}:${duration}`;
    if (this.root.firstElementChild !== this.content) this.root.replaceChildren(this.content, this.hint);
    this.root.classList.add('is-mission-capture', 'is-holding');
    this.root.classList.remove('hidden', 'is-captured');
    if (signature === this.signature) return;
    this.signature = signature;
    this.progress.hidden = true;
    this.percent.textContent = `${elapsed} / ${duration}`;
    const caption = document.createElement('small');
    caption.textContent = 'HOLD:';
    const territory = document.createElement('strong');
    territory.textContent = name;
    this.label.replaceChildren(caption, territory);
  }

  /** A short, cosmetic handoff; completion and Credits remain server-authoritative. */
  celebrate(target: HTMLElement): void {
    this.stopCelebration();
    const source = this.root.getBoundingClientRect();
    const destination = (target.querySelector('.territory-color-dot') ?? target).getBoundingClientRect();
    if (!source.width || !destination.width) return;
    const start = { x: source.left + source.width / 2, y: source.top + source.height / 2 };
    const end = { x: destination.left + destination.width / 2, y: destination.top + destination.height / 2 };
    const control = { x: (start.x + end.x) / 2, y: start.y - 10 };
    const overlay = document.createElement('div');
    overlay.className = 'territory-capture-transfer';
    overlay.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
    const trail = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    trail.setAttribute('d', `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`);
    svg.append(trail);
    const badge = document.createElement('span');
    badge.className = 'territory-capture-transfer-badge';
    badge.textContent = '✓ 100%';
    overlay.append(svg, badge);
    document.body.append(overlay);
    this.celebrationOverlay = overlay;
    const length = trail.getTotalLength();
    trail.style.strokeDasharray = `${length} ${length}`;
    const motion: Keyframe[] = [];
    for (let step = 0; step <= 24; step++) {
      const t = step / 24, u = 1 - t;
      const x = u * u * start.x + 2 * u * t * control.x + t * t * end.x;
      const y = u * u * start.y + 2 * u * t * control.y + t * t * end.y;
      motion.push({ offset: t, transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${1 - .3 * t})`, opacity: step === 0 || step === 24 ? 0 : 1 });
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduced) {
      this.celebrationAnimations.push(badge.animate(motion, { delay: 700, duration: 1_100, fill: 'both' }));
      this.celebrationAnimations.push(trail.animate([
        { strokeDashoffset: length, opacity: 0 },
        { offset: .12, opacity: 1 },
        { offset: .8, opacity: 1 },
        { strokeDashoffset: 0, opacity: 0 },
      ], { delay: 700, duration: 1_150, fill: 'both' }));
    }
    this.celebrationAnimations.push(target.animate([
      { boxShadow: '0 0 0 transparent' }, { boxShadow: '0 0 18px #adff4dcc, inset 0 0 8px #79ec4c66' }, { boxShadow: '0 0 0 transparent' },
    ], { delay: reduced ? 700 : 1_750, duration: 750 }));
  }

  stopCelebration(): void {
    for (const animation of this.celebrationAnimations) animation.cancel();
    this.celebrationAnimations.length = 0;
    this.celebrationOverlay?.remove();
    this.celebrationOverlay = undefined;
  }

  hide(): void {
    this.hint.hidden = true;
    this.stopCelebration();
    this.root.classList.remove('is-mission-capture', 'is-captured', 'is-holding');
    this.root.classList.add('hidden');
    this.signature = '';
  }
}
