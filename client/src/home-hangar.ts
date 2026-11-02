import { createMenuCarouselCard, positionMenuCarouselCard, installMenuCarouselSwipe } from './menu-card-carousel';
import { sponsorshipApi, type PublicSponsor } from './sponsorship-catalog';
import { flushSponsorMeasurements, recordSponsorMeasurement, SponsorExposureEpisode } from './sponsorship-measurement';

export type HomeHangarData = {
  pilotName: string;
  credits: number;
  aircraftName: string;
  rewardsAvailable: boolean;
  rewardsAvailableInMs?: number;
};

export const homeMultiplayerModes = [
  { id: 'sky', title: 'SKY DUEL', artwork: 'sky-duel', playable: true },
  { id: 'squad', title: 'SQUAD BATTLE', artwork: 'squad-battle', playable: false },
  { id: 'fleet', title: 'FLEET WAR', artwork: 'fleet-war', playable: false },
  { id: 'city', title: 'CITY CONTROL', artwork: 'city-control', playable: false },
  { id: 'assault', title: 'AIR ASSAULT', artwork: 'air-assault', playable: true },
] as const;
export type HomeMultiplayerMode = typeof homeMultiplayerModes[number]['id'];

type HomeHangarHandlers = {
  missions: () => void;
  multiplayer: (mode: HomeMultiplayerMode) => void;
  store: () => void;
  sponsor: (trigger: HTMLButtonElement) => void;
  settings: () => void;
};

export class HomeHangar {
  readonly stage: HTMLElement;
  private modeIndex = 0;
  private modeClickBlockedUntil = 0;
  private readonly refreshModes: () => void;
  private readonly aircraft: HTMLElement;
  private readonly sponsor: HTMLButtonElement;
  private readonly houseSponsor: Node[];
  private readonly sponsorEpisode = new SponsorExposureEpisode();
  private sponsorObserver: IntersectionObserver;
  private sponsorVisible = false;
  private sponsorImageLoaded = false;
  private measuredSponsor: PublicSponsor | null = null;
  private measurementAllowed = false;
  private measureTimer: ReturnType<typeof setTimeout> | undefined;
  private data: HomeHangarData;

  constructor(private readonly element: HTMLElement, handlers: HomeHangarHandlers, initialData: HomeHangarData) {
    this.data = initialData;
    this.stage = element.querySelector<HTMLElement>('[data-home-hangar-stage]')!;
    this.aircraft = element.querySelector<HTMLElement>('[data-home-aircraft-name]')!;
    const modes = element.querySelector<HTMLElement>('[data-home-modes]')!;
    const carousel = element.querySelector<HTMLElement>('.home-hangar-contextual')!;
    carousel.classList.add('menu-card-carousel');
    carousel.tabIndex = 0;
    modes.classList.add('menu-card-carousel-track');
    const cards: HTMLElement[] = [];
    const addMode = (label: string, image: string, run: () => void, multiplayer = false): void => {
      const {card,art,copy} = createMenuCarouselCard('home-hangar-mode', '', '', 'button');
      (card as HTMLButtonElement).type = 'button';
      art.remove();copy.remove();
      const index=cards.length;cards.push(card);
      card.setAttribute('aria-label', multiplayer ? `${label}, Multiplayer` : label);
      const artwork = document.createElement('img'); artwork.className = 'home-hangar-card-image';
      artwork.src = image; artwork.alt = ''; artwork.setAttribute('aria-hidden', 'true');
      const flag = document.createElement('span'); flag.className = 'home-mode-flag';
      flag.textContent = multiplayer ? 'MULTIPLAYER' : 'SINGLE PLAYER'; flag.setAttribute('aria-hidden', 'true');
      card.append(artwork);
      card.append(flag);
      card.addEventListener('click', () => {
        if(performance.now()<this.modeClickBlockedUntil)return;
        if(index!==this.modeIndex){this.modeIndex=index;this.refreshModes();return;}
        run();
      }); modes.append(card);
    };
    addMode('Single Player', '/media/hub/missions-card.jpg', handlers.missions);
    for (const mode of homeMultiplayerModes) addMode(
      `${mode.title}${mode.id === 'assault' ? ', Single Player, 30 AI' : mode.playable ? ', 1 versus 1' : ', coming soon'}`,
      `/media/multiplayer/${mode.artwork}-card.${mode.id === 'assault' ? 'jpg' : 'png'}`,
      () => handlers.multiplayer(mode.id), mode.id !== 'assault',
    );
    const previous=element.querySelector<HTMLButtonElement>('[data-home-mode-previous]')!;
    const next=element.querySelector<HTMLButtonElement>('[data-home-mode-next]')!;
    this.refreshModes=()=>{
      cards.forEach((card,index)=>{positionMenuCarouselCard(card,index-this.modeIndex);card.tabIndex=Math.abs(index-this.modeIndex)<=1?0:-1;});
      previous.hidden=this.modeIndex===0;next.hidden=this.modeIndex===cards.length-1;
    };
    const move=(direction:number)=>{this.modeIndex=Math.max(0,Math.min(cards.length-1,this.modeIndex+direction));this.refreshModes();};
    previous.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));
    installMenuCarouselSwipe(carousel,direction=>{this.modeClickBlockedUntil=performance.now()+250;move(direction);});
    carousel.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();move(event.key==='ArrowLeft'?-1:1);}});
    carousel.addEventListener('wheel',event=>{if(Math.abs(event.deltaX)<15&&Math.abs(event.deltaY)<15)return;event.preventDefault();if(performance.now()<this.modeClickBlockedUntil)return;this.modeClickBlockedUntil=performance.now()+250;move((Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY)>0?1:-1);},{passive:false});
    this.refreshModes();
    element.querySelector('[data-home-store]')!.addEventListener('click', handlers.store);
    this.sponsor = element.querySelector<HTMLButtonElement>('[data-home-sponsor]')!;
    carousel.append(this.sponsor);
    this.houseSponsor = Array.from(this.sponsor.childNodes, node => node.cloneNode(true));
    this.sponsor.addEventListener('click', () => handlers.sponsor(this.sponsor));
    element.querySelector('[data-home-settings]')!.addEventListener('click', handlers.settings);
    this.sponsorObserver = new IntersectionObserver(entries => {
      this.sponsorVisible = (entries[0]?.intersectionRatio ?? 0) >= 0.5;
      this.measureSponsor();
    }, { threshold: [0, 0.5, 1] });
    this.sponsorObserver.observe(this.sponsor);
    const syncVisibility = (): void => { element.classList.toggle('is-backgrounded', document.hidden); this.measureSponsor(); };
    document.addEventListener('visibilitychange', syncVisibility);
    syncVisibility();
    this.renderIdentity();
  }

  isVisible(): boolean { return !this.element.hidden; }

  show(data: HomeHangarData): void {
    this.data = data;
    this.renderIdentity();
    this.element.hidden = false;
    this.refreshModes();
    this.measureSponsor();
  }

  hide(): void { this.element.hidden = true; this.measureSponsor(); void flushSponsorMeasurements(); }

  setSponsor(value: PublicSponsor | null, measurementAllowed = false): void {
    this.measuredSponsor = value;
    this.measurementAllowed = measurementAllowed;
    this.sponsorImageLoaded = false;
    this.measureSponsor();
    if (!value) {
      this.sponsor.replaceChildren(...this.houseSponsor.map(node => node.cloneNode(true)));
      this.sponsor.setAttribute('aria-label', 'Advertise in Airport Chaos');
      this.sponsor.classList.remove('is-sponsored');
      return;
    }
    const image = document.createElement('img');
    image.src = sponsorshipApi(value.logoUrl);
    image.alt = '';
    image.onload = () => { if (this.measuredSponsor === value) { this.sponsorImageLoaded = true; this.measureSponsor(); } };
    image.onerror = () => this.setSponsor(null);
    const copy = document.createElement('span');
    const label = document.createElement('small'); label.textContent = 'SPONSORED';
    const name = document.createElement('strong'); name.textContent = value.name;
    copy.append(label, name);
    if (value.tagline) { const tagline = document.createElement('em'); tagline.textContent = value.tagline; copy.append(tagline); }
    this.sponsor.replaceChildren(image, copy);
    this.sponsor.setAttribute('aria-label', `View sponsor details for ${value.name}`);
    this.sponsor.classList.add('is-sponsored');
  }

  update(data: HomeHangarData): void {
    this.data = data;
    this.renderIdentity();
  }

  private renderIdentity(): void {
    this.aircraft.textContent = this.data.aircraftName;
  }

  private measureSponsor(): void {
    if (this.measureTimer) clearTimeout(this.measureTimer);
    this.measureTimer = undefined;
    const sponsor = this.measuredSponsor;
    const qualifies = Boolean(sponsor && this.measurementAllowed && this.sponsorImageLoaded && this.sponsorVisible &&
      !document.hidden && !this.element.hidden);
    if (this.sponsorEpisode.update(qualifies) && sponsor) recordSponsorMeasurement({
      type: 'HUB_ESTIMATED_EXPOSURE', campaignId: sponsor.campaignId, creativeId: sponsor.creativeId,
      placementId: 'global-hub-spotlight', cityId: 'global',
    });
    if (qualifies) this.measureTimer = setTimeout(() => this.measureSponsor(), 1100);
  }
}
