export type HomeHangarData = {
  pilotName: string;
  credits: number;
  aircraftName: string;
};

type HomeHangarHandlers = {
  fly: () => void;
  aircraft: () => void;
  missions: () => void;
  profile: () => void;
  settings: () => void;
};

export class HomeHangar {
  readonly stage: HTMLElement;
  private readonly credits: HTMLElement;
  private readonly pilot: HTMLElement;
  private readonly aircraft: HTMLElement;
  private data: HomeHangarData;

  constructor(private readonly element: HTMLElement, handlers: HomeHangarHandlers, initialData: HomeHangarData) {
    this.data = initialData;
    this.stage = element.querySelector<HTMLElement>('[data-home-hangar-stage]')!;
    this.credits = element.querySelector<HTMLElement>('[data-home-credits]')!;
    this.pilot = element.querySelector<HTMLElement>('[data-home-pilot]')!;
    this.aircraft = element.querySelector<HTMLElement>('[data-home-aircraft-name]')!;
    element.querySelector('[data-home-fly]')!.addEventListener('click', handlers.fly);
    element.querySelector('[data-home-aircraft]')!.addEventListener('click', handlers.aircraft);
    element.querySelector('[data-home-missions]')!.addEventListener('click', handlers.missions);
    element.querySelector('[data-home-profile]')!.addEventListener('click', handlers.profile);
    element.querySelector('[data-home-profile-entry]')!.addEventListener('click', handlers.profile);
    element.querySelector('[data-home-settings]')!.addEventListener('click', handlers.settings);
    const syncVisibility = (): void => { element.classList.toggle('is-backgrounded', document.hidden); };
    document.addEventListener('visibilitychange', syncVisibility);
    syncVisibility();
    this.renderIdentity();
  }

  isVisible(): boolean { return !this.element.hidden; }

  show(data: HomeHangarData): void {
    this.data = data;
    this.renderIdentity();
    this.element.hidden = false;
  }

  hide(): void { this.element.hidden = true; }

  update(data: HomeHangarData): void {
    this.data = data;
    this.renderIdentity();
  }

  private renderIdentity(): void {
    this.credits.textContent = this.data.credits.toLocaleString();
    this.pilot.textContent = this.data.pilotName;
    this.aircraft.textContent = this.data.aircraftName;
  }
}
