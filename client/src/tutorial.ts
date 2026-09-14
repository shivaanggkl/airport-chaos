import { actionKeyLabel, controlGroups, controlKeyLabel, menuKeyLabel, type FlightAction } from './flight-input';
import { aircraftRoles, targetBracketMarkup, identityMarkup, visualLanguage, type VisualIdentity } from './visual-language';
import { aircraftDefinitions, aircraftDisplayName, type AircraftType } from './aircraft';
import { dallasDisplayNames as place } from '../../shared/dallas-display-names.mjs';
import runwayImage from './help-assets/runway.avif';
import mapImage from './help-assets/map.avif';
import garageImage from './help-assets/garage.avif';
import { mountAirportChaosLogo } from './brand';
import { companyContact, contactLinks, sponsorLocations } from './company-contact';

const key = (label: string, ...actions: FlightAction[]) => `<span class="tutorial-key"><kbd>${actions.map(actionKeyLabel).join(' / ')}</kbd><span>${label}</span></span>`;
const navigationKeys = () => `<span class="tutorial-key"><kbd>${menuKeyLabel('map')}</kbd><span>World Map</span></span><span class="tutorial-key"><kbd>${menuKeyLabel('menu')}</kbd><span>Pilot Menu / Help</span></span>`;
const callout = (label: string, x: number, y: number) => `<span class="help-callout" style="left:${x}%;top:${y}%">${label}</span>`;
const shot = (src: string, alt: string, callouts = '') => `<figure class="help-shot"><img src="${src}" alt="${alt}" decoding="async"/>${callouts}</figure>`;
const legend = (kinds: VisualIdentity[]) => `<div class="help-legend">${kinds.map(kind => identityMarkup(kind)).join('')}</div>`;
const tile = (kind: VisualIdentity, action: string) => `<div class="tutorial-tile" style="--tile-color:${visualLanguage[kind].color}">${identityMarkup(kind)}<small>${action}</small></div>`;
const flightKeys = controlGroups[0].rows.map(row => key(row.label, ...row.actions)).join('');
const groupedControls = () => `<div class="help-control-groups">${controlGroups.map(group => `<section><h2>${group.label}</h2>${group.rows.map(row => `<div><kbd>${controlKeyLabel(row.actions)}</kbd><span>${row.label}</span></div>`).join('')}</section>`).join('')}<section><h2>NAVIGATION</h2><div><kbd>${menuKeyLabel('map')}</kbd><span>World Map</span></div><div><kbd>${menuKeyLabel('menu')}</kbd><span>Pilot Menu</span></div><div><kbd>${menuKeyLabel('restart')}</kbd><span>Restart after crash</span></div><div><kbd>DRAG</kbd><span>Orbit camera</span></div><div><kbd>WHEEL</kbd><span>Camera / map zoom</span></div></section></div>`;
// Labels point to observed symbols in the actual map capture, not invented map entities.
const mapNote = (kind: VisualIdentity, x: number, y: number, targetX: number, targetY: number) => {
  const identity = visualLanguage[kind];
  const width = identity.label.length * 7.5 + 18;
  return `<g stroke="${identity.color}"><path d="M${x} ${y}L${targetX} ${targetY}" fill="none" stroke-width="1.5"/><circle cx="${targetX}" cy="${targetY}" r="7" fill="none"/><rect x="${x - width / 2}" y="${y - 12}" width="${width}" height="24" rx="4" fill="#07121c"/><text x="${x}" y="${y + 4}" fill="${identity.color}" stroke="none" text-anchor="middle">${identity.label.toUpperCase()}</text></g>`;
};
// The compact map capture predates the fictional display names. Re-label its
// five visible landmarks in the same overlay used by the live-identity notes.
const mapPlaceLabel = (label: string, x: number, y: number, width: number) => `<g><rect x="${x}" y="${y - 13}" width="${width}" height="19" rx="3" fill="#07121c"/><text x="${x + 5}" y="${y}" fill="#c8e9f1" font-size="11" font-weight="700">${label}</text></g>`;
const mapPlaces = mapPlaceLabel(place.dfw, 20, 135, 195) + mapPlaceLabel(place.addison, 263, 40, 170) + mapPlaceLabel(`${place.lasColinas} · CONTESTED`, 108, 198, 225) + mapPlaceLabel(place.downtown, 317, 302, 165) + mapPlaceLabel(place.executive, 221, 438, 197);
const mapNotes = `<svg class="help-map-notes" viewBox="0 0 700 520" aria-hidden="true">${mapPlaces}${mapNote('you', 48, 210, 76, 161)}${mapNote('airport', 98, 91, 76, 126)}${mapNote('event', 83, 255, 106, 188)}${mapNote('ai', 183, 285, 210, 237)}${mapNote('player', 377, 379, 274, 250)}${mapNote('repair', 372, 171, 306, 228)}${mapNote('waypoint', 448, 282, 335, 294)}</svg>`;

const pages: Array<{ nav: string; icon: VisualIdentity; title: string; description: string; visual: string; controls: string }> = [
  {
    nav: 'Fly', icon: 'you', title: 'TAKE OFF AND FLY.',
    description: `${actionKeyLabel('throttleUp')} = Faster. ${actionKeyLabel('throttleDown')} = Slow. Use the arrows and A/D to steer.`,
    visual: shot(runwayImage, 'Skyrift Scout on the Metroplex International runway, looking forward over its wings', callout(`${actionKeyLabel('pitchUp')} NOSE UP`, 50, 18) + callout('YOUR AIRCRAFT', 50, 82)),
    controls: flightKeys,
  },
  {
    nav: 'Fight', icon: 'player', title: 'GET A PLANE IN YOUR AIM AREA.',
    description: `${actionKeyLabel('fire')} = Shoot. PLANE LIFE is how much damage you can take.`,
    visual: `<div class="help-combat-scene">${shot(runwayImage, 'Chase view and runway behind the live-style combat indicators')}<div class="help-combat-example"><span class="help-example-label">FIGHT</span><div class="acquisition-circle locked"></div><span class="help-enemy-brackets">${targetBracketMarkup()}<i>◆</i></span><strong class="help-locked">LOCKED</strong><span class="help-pilot-label"><span style="color:${visualLanguage.player.color}">${visualLanguage.player.icon} Pilot · ${aircraftDefinitions.trainer.name}</span><br/><span style="color:${visualLanguage.ai.color}">${visualLanguage.ai.icon} Raven · AI Pilot</span></span></div></div><div class="help-hull health-row"><span>PLANE LIFE</span><span class="hull-meter"><i style="width:75%"></i></span><strong>75/100</strong></div>` + legend(['player', 'ai']),
    controls: key('Shoot', 'fire') + key('Aim Left / Right', 'aimLeft', 'aimRight') + key('Aim Up / Down', 'aimUp', 'aimDown'),
  },
  {
    nav: 'Map', icon: 'waypoint', title: 'FIND WHERE TO GO',
    description: `Press ${menuKeyLabel('map')}. Pick a place and set a waypoint.`,
    visual: `<div class="help-map-shot">${shot(mapImage, 'Actual city map with YOU, airports, waypoint, event, repairs and pilot identities', mapNotes)}</div>` + legend(['you', 'airport', 'waypoint', 'mission', 'event', 'repair', 'ai', 'player']),
    controls: '',
  },
  {
    nav: 'Land', icon: 'airport', title: 'RED? SLOW DOWN.',
    description: `Hold ${actionKeyLabel('throttleDown')} until SPEED is not red. Come down gently.`,
    visual: shot(runwayImage, 'Metroplex International runway: fly along the white line', callout('KEEP STRAIGHT ↓', 50, 28)) +
      `<div class="help-landing-example"><div class="flight-tape"><span>SPEED</span><strong class="landing-risk">TOO FAST</strong></div><div class="flight-tape"><span>COMING DOWN</span><strong class="landing-risk">TOO FAST</strong></div><div class="landing-speed-cue">TOO FAST — HOLD S</div></div>`,
    controls: key('Slow Down', 'throttleDown'),
  },
  {
    nav: 'Repair', icon: 'repair', title: 'HEAL YOUR PLANE.',
    description: 'Fly through a green Repair marker. Stop safely at an airport for full PLANE LIFE.',
    visual: shot(mapImage, 'Real city map showing the green Repair marker', mapNotes) + legend(['repair', 'airport']),
    controls: '',
  },
  {
    nav: 'Danger', icon: 'heat', title: 'DANGER = TROUBLE LEVEL.',
    description: 'Cause trouble and Danger rises. More Danger means more enemies and better rewards.',
    visual: `<div class="help-heat-scene"><div class="heat-row" data-level="4">${identityMarkup('heat')} <strong>4</strong></div><div class="help-heat-scale">${[0,1,2,3,4,5].map(level => `<span class="${level >= 4 ? 'hot' : ''}">${level}</span>`).join('')}</div><div class="help-heat-path"><span>FLY CALMLY<br/><small>Danger falls</small></span><span>TAKE RISKS<br/><small>Danger rises</small></span><span>${identityMarkup('wanted')}<br/><small>Survive — or be hunted</small></span></div></div>`,
    controls: '',
  },
  {
    nav: 'Missions', icon: 'mission', title: 'CHOOSE ONE MISSION.',
    description: `Press ${menuKeyLabel('menu')} → MISSIONS. Finish it for the full reward.`,
    visual: `<div class="tutorial-tiles">${tile('mission', 'Choose one')}${tile('territory', 'Capture a place')}${tile('challenge', 'Fly through gates')}${tile('event', 'Join an event')}</div>`,
    controls: navigationKeys(),
  },
  {
    nav: 'Territories', icon: 'territory', title: 'CAPTURE THE CITY.',
    description: 'Fly inside a colored area to claim it. Check CITY TERRITORIES to see who owns each one.',
    visual: `<div class="help-map-shot">${shot(mapImage, 'Real city map showing territory areas and ownership colors', mapNotes)}</div>` + legend(['territory', 'you']),
    controls: '',
  },
  {
    nav: 'Progress', icon: 'credits', title: 'PLAY. EARN. UNLOCK PLANES.',
    description: 'Credits unlock planes. Score is for rankings. City Level shows long-term progress.',
    visual: shot(garageImage, 'Aircraft Garage with comparison stats and four aircraft choices') +
      `<div class="help-aircraft-roles">${(Object.entries(aircraftRoles) as Array<[AircraftType, string]>).map(([type,role]) => `<span><b>${aircraftDisplayName(type)}</b><small>${role}</small></span>`).join('')}</div>` + legend(['credits', 'score', 'mastery']),
    controls: `<span class="tutorial-key"><kbd>${menuKeyLabel('menu')}</kbd><span>Garage / Progress</span></span>`,
  },
  {
    nav: 'Controls', icon: 'you', title: 'PICK A KEY. TRY IT.',
    description: 'Use CORE keys first. ADVANCED keys help with aim and flying tricks.',
    visual: groupedControls(), controls: '',
  },
  {
    nav: 'Contact', icon: 'contact', title: 'CONTACT & ADVERTISE.',
    description: 'Need help? Want to advertise in Airport Chaos?',
    visual: `<div class="help-contact-card"><strong>${companyContact.companyName}</strong><span>Advertise on ${sponsorLocations.toLowerCase()}.</span>${contactLinks()}</div>`,
    controls: '',
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
    this.content.innerHTML = `<h1 id="tutorial-title">${page.title}</h1><div class="tutorial-visual">${page.visual}</div><p>${page.description}</p><div class="tutorial-keys">${page.controls}</div>`;
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
