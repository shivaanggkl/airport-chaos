import { sponsorshipApi, type PublicSponsor } from './sponsorship-catalog';
import { flushSponsorMeasurements, recordSponsorMeasurement, SponsorExposureEpisode } from './sponsorship-measurement';

export type HomeHangarData = {
  pilotName: string;
  credits: number;
  aircraftName: string;
  rewardsAvailable: boolean;
  rewardsAvailableInMs?: number;
};

type HomeHangarHandlers = {
  missions: () => void;
  freeFly: () => void;
  store: () => void;
  sponsor: (trigger: HTMLButtonElement) => void;
  settings: () => void;
};

export class HomeHangar {
  readonly stage: HTMLElement;
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
    element.querySelector('[data-home-missions]')!.addEventListener('click', handlers.missions);
    element.querySelector('[data-home-free-fly]')!.addEventListener('click', handlers.freeFly);
    element.querySelector('[data-home-store]')!.addEventListener('click', handlers.store);
    this.sponsor = element.querySelector<HTMLButtonElement>('[data-home-sponsor]')!;
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
