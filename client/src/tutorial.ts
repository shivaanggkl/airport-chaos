import { actionKeyLabel, menuKeyLabel } from './flight-input';
import { targetBracketMarkup, identityMarkup, visualLanguage, type VisualIdentity } from './visual-language';
import { dallasDisplayNames as place } from '../../shared/dallas-display-names.mjs';
import runwayImage from './help-assets/runway.avif';
import { mountAirportChaosLogo } from './brand';

const callout = (label: string, x: number, y: number) => `<span class="help-callout" style="left:${x}%;top:${y}%">${label}</span>`;
const shot = (src: string, alt: string, callouts = '') => `<figure class="help-shot"><img src="${src}" alt="${alt}" decoding="async"/>${callouts}</figure>`;
const legend = (kinds: VisualIdentity[]) => `<div class="help-legend">${kinds.map(kind => identityMarkup(kind)).join('')}</div>`;
const steps = (...items: string[]) => `<ol class="tutorial-steps">${items.map(item => `<li>${item}</li>`).join('')}</ol>`;
const cleanMap = `<div class="help-simple-map"><svg viewBox="0 0 640 300" role="img" aria-label="Simple city map showing your plane, an airport, a waypoint and a Repair Heart"><path class="water" d="M0 230Q130 180 245 226T480 214T640 235V300H0Z"/><path class="road major" d="M20 75L610 240M82 270L565 42"/><path class="road" d="M35 170L585 140M210 25L290 282"/><g transform="translate(130 185)" class="map-you"><path d="M0-16L11 13L0 8L-11 13Z"/><text x="18" y="5">YOU</text></g><g transform="translate(500 82)" class="map-airport"><path d="M0-10L10 0L0 10L-10 0Z"/><text x="16" y="5">${place.dfw}</text></g><g transform="translate(356 115)" class="map-waypoint"><circle r="11"/><path d="M-17 0H17M0-17V17"/><text x="18" y="5">WAYPOINT</text></g><g transform="translate(225 228)" class="map-repair"><text x="0" y="7" text-anchor="middle">♥</text><text x="18" y="5">REPAIR</text></g></svg></div>`;
const pages: Array<{ nav: string; icon: VisualIdentity; title: string; visual: string; instructions: string; controls?: string }> = [
  {
    nav: 'Take Off', icon: 'airport', title: 'TAKE OFF',
    visual: shot(runwayImage, 'Plane lined up on a runway for takeoff', callout('KEEP STRAIGHT', 50, 24) + callout(`${actionKeyLabel('pitchUp')} WHEN FAST`, 50, 72)),
    instructions: steps(`Hold <kbd>${actionKeyLabel('throttleUp')}</kbd> to speed up`, 'Keep the plane straight', `Press <kbd>${actionKeyLabel('pitchUp')}</kbd> when fast enough`),
  },
  {
    nav: 'Fly', icon: 'you', title: 'FLY',
    visual: `<div class="help-flight-visual"><span class="plane-icon">✈</span><span class="flight-path"></span></div>`,
    instructions: steps(`<kbd>${actionKeyLabel('pitchUp')} / ${actionKeyLabel('pitchDown')}</kbd> Go Up / Down`, `<kbd>${actionKeyLabel('throttleUp')} / ${actionKeyLabel('throttleDown')}</kbd> Faster / Slower`, `<kbd>${actionKeyLabel('boost')}</kbd> Boost`),
  },
  {
    nav: 'Turn', icon: 'you', title: 'TURN',
    visual: `<div class="help-turn-visual"><span>←</span><b>✈</b><span>→</span></div>`,
    instructions: steps(`<kbd>${actionKeyLabel('yawLeft')} / ${actionKeyLabel('yawRight')}</kbd> Turn`, `<kbd>${actionKeyLabel('rollLeft')} / ${actionKeyLabel('rollRight')}</kbd> Tilt Plane`),
  },
  {
    nav: 'Land', icon: 'airport', title: 'LAND',
    visual: shot(runwayImage, 'Plane lined up with a clear runway', callout('LINE UP', 50, 25) + callout('COME DOWN GENTLY', 50, 72)),
    instructions: steps('Line up with the runway', `Hold <kbd>${actionKeyLabel('throttleDown')}</kbd> to slow down`, 'Come down gently'),
  },
  {
    nav: 'Map', icon: 'waypoint', title: 'MAP',
    visual: cleanMap + legend(['you', 'airport', 'waypoint', 'repairHeart']),
    instructions: steps(`Press <kbd>${menuKeyLabel('map')}</kbd>`, 'Pick where you want to go', 'Set a waypoint'),
  },
  {
    nav: 'Fight', icon: 'player', title: 'FIGHT',
    visual: `<div class="help-combat-scene">${shot(runwayImage, 'Target near the aiming circle')}<div class="help-combat-example"><div class="acquisition-circle locked"></div><span class="help-enemy-brackets">${targetBracketMarkup()}<i>◆</i></span><strong class="help-locked">LOCKED</strong></div></div>` + legend(['player', 'ai']),
    instructions: steps('Put the target near the aiming circle', 'GET CLOSER means it is out of range', `Press <kbd>${actionKeyLabel('fire')}</kbd> to shoot`),
  },
  {
    nav: 'Repair', icon: 'repairHeart', title: 'REPAIR YOUR PLANE',
    visual: `<div class="help-repair-visual"><span>♥</span><b>PLANE LIFE</b><i><em></em></i><strong>100%</strong></div>`,
    instructions: steps('Fly through a Repair Heart → Plane Life 100%', 'Or land and stop at an airport → Full Repair'),
  },
  {
    nav: 'Missions', icon: 'mission', title: 'MISSIONS',
    visual: `<div class="help-mission-visual"><b>MISSION</b><strong>FIRST FLIGHT</strong><span>Stay in the air</span><i>15 Credits</i></div>`,
    instructions: steps(`Open <kbd>${menuKeyLabel('menu')}</kbd> → Missions`, 'Pick one mission', 'Follow the objective and earn Credits', 'SESSION SCORE: Earned during this play session. It resets when the session ends.'),
  },
];

class FlightTutorial {
  private readonly root = document.createElement('div');
  private page = 0;
  private home = false;
  private pilotId = '';
  private resolveVisit?: () => void;
  private returnFocus: HTMLElement | null = null;
  private visibilityHandler?: (open: boolean) => void;
  private helpAction?: () => void;
  private readonly sessionCompleted = new Set<string>();
  private readonly content: HTMLElement;
  private readonly back: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private readonly skip: HTMLButtonElement;
  private readonly dots: HTMLElement;
  private readonly backgrounds: Array<{ element: HTMLElement; inert: boolean }> = [];

  constructor() {
    this.root.className = 'flight-tutorial';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'tutorial-title');
    this.root.innerHTML = '<section class="tutorial-card"><header><span>AIRPORT CHAOS</span><span>PILOT GUIDE</span><button type="button" data-home>ALL TOPICS</button><button type="button" data-skip>SKIP</button></header><div class="tutorial-content"></div><footer><button type="button" data-back>BACK</button><div class="tutorial-dots"></div><button type="button" data-next>NEXT</button></footer></section>';
    document.body.append(this.root);
    void mountAirportChaosLogo(this.root.querySelector<HTMLElement>('.tutorial-card header > span')!, 'brand-logo-help');
    document.querySelector<HTMLButtonElement>('#tutorial-help')!.onclick = () => this.helpAction ? this.helpAction() : this.open();
    this.content = this.root.querySelector('.tutorial-content')!;
    this.back = this.root.querySelector('[data-back]')!;
    this.next = this.root.querySelector('[data-next]')!;
    this.skip = this.root.querySelector('[data-skip]')!;
    this.dots = this.root.querySelector('.tutorial-dots')!;
    this.root.querySelector<HTMLButtonElement>('[data-home]')!.onclick = () => { this.home = true; this.render(); };
    this.back.onclick = () => { if (this.page > 0) this.page--; else this.home = true; this.render(); };
    this.next.onclick = () => { if (this.home) { this.home = false; this.page = 0; this.render(); return; } if (this.page === pages.length - 1) this.close('completed'); else { this.page++; this.render(); } };
    this.skip.onclick = () => this.close('skipped');
    this.root.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-topic]');
      if (!button) return;
      this.page = Number(button.dataset.topic); this.home = false; this.render();
    });
    // Native scrolling stays inside Help; never reaches camera/map wheel handlers.
    this.root.addEventListener('wheel', event => event.stopPropagation(), { passive: true });
    this.root.addEventListener('pointerdown', event => event.stopPropagation());
    window.addEventListener('keydown', (event) => {
      if (!this.isOpen()) return;
      event.stopImmediatePropagation();
      if (event.key === 'Escape') { event.preventDefault(); this.close('skipped'); }
      else if (event.repeat) event.preventDefault();
      else if (event.key === 'Tab') {
        event.preventDefault();
        const buttons = [...this.root.querySelectorAll<HTMLButtonElement>('button')].filter(button => !button.disabled && !button.hidden);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus({ preventScroll: true });
      } else if (event.key !== 'Enter' && event.key !== ' ') event.preventDefault();
    }, true);
  }
  isOpen(): boolean { return !this.root.hidden; }
  setVisibilityHandler(handler: (open: boolean) => void): void { this.visibilityHandler = handler; }
  setHelpAction(handler: () => void): void { this.helpAction = handler; }
  async firstVisit(pilotId: string): Promise<void> {
    this.pilotId = pilotId;
    let done = this.sessionCompleted.has(pilotId);
    try { done ||= ['completed', 'skipped'].includes(localStorage.getItem(this.storageKey()) ?? ''); } catch { /* session fallback */ }
    if (done) return;
    return new Promise((resolve) => { this.resolveVisit = resolve; this.open(); });
  }
  open(): void {
    if (this.isOpen()) return;
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.page = 0;
    this.home = !this.resolveVisit;
    this.render();
    this.backgrounds.length = 0;
    for (const id of ['game-root', 'city-selector', 'garage-overlay']) {
      const element = document.getElementById(id);
      if (element) { this.backgrounds.push({ element, inert: element.inert }); element.inert = true; }
    }
    this.root.hidden = false;
    document.body.classList.add('tutorial-open');
    this.visibilityHandler?.(true);
    this.next.focus({ preventScroll: true });
  }
  private storageKey(): string { return `airport-chaos-tutorial-v1:${this.pilotId}`; }
  private close(result: 'completed' | 'skipped'): void {
    this.sessionCompleted.add(this.pilotId);
    try {
      if (localStorage.getItem(this.storageKey()) !== 'completed') localStorage.setItem(this.storageKey(), result);
    } catch { /* no progression data is changed */ }
    this.root.hidden = true;
    document.body.classList.remove('tutorial-open');
    for (const { element, inert } of this.backgrounds) element.inert = inert;
    this.backgrounds.length = 0;
    this.visibilityHandler?.(false);
    this.returnFocus?.focus({ preventScroll: true });
    const resolve = this.resolveVisit; this.resolveVisit = undefined; resolve?.();
  }
  private render(): void {
    if (this.home) {
      this.content.innerHTML = `<h1 id="tutorial-title">FLY. EXPLORE. COMPETE.</h1><p>Pick a topic. Get back to flying.</p><div class="help-home">${pages.map((page,index) => `<button type="button" data-topic="${index}"><span style="color:${visualLanguage[page.icon].color}">${visualLanguage[page.icon].icon}</span><strong>${page.nav}</strong><small>${page.title}</small></button>`).join('')}</div>`;
      this.back.disabled = true; this.next.textContent = 'START GUIDE'; this.skip.textContent = this.resolveVisit ? 'SKIP' : 'CLOSE';
      this.dots.innerHTML = ''; this.content.scrollTop = 0; return;
    }
    const page = pages[this.page];
    this.content.innerHTML = `<h1 id="tutorial-title">${page.title}</h1><div class="tutorial-visual">${page.visual}</div>${page.instructions}<div class="tutorial-keys">${page.controls ?? ''}</div>`;
    this.back.disabled = false;
    this.back.textContent = this.page === 0 ? 'HOME' : 'BACK';
    this.next.textContent = this.page === pages.length - 1 ? 'PLAY NOW' : 'NEXT';
    this.skip.textContent = this.resolveVisit ? 'SKIP' : 'CLOSE';
    this.dots.setAttribute('aria-label', `Page ${this.page + 1} of ${pages.length}`);
    this.dots.innerHTML = pages.map((page, index) => `<button type="button" data-topic="${index}" class="${index === this.page ? 'filled' : ''}" aria-label="${page.nav}" aria-current="${index === this.page ? 'step' : 'false'}"></button>`).join('');
    this.content.scrollTop = 0;
  }
}

export const flightTutorial = new FlightTutorial();
