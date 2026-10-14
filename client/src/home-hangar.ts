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
  settings: () => void;
};

export class HomeHangar {
  readonly stage: HTMLElement;
  private readonly aircraft: HTMLElement;
  private data: HomeHangarData;

  constructor(private readonly element: HTMLElement, handlers: HomeHangarHandlers, initialData: HomeHangarData) {
    this.data = initialData;
    this.stage = element.querySelector<HTMLElement>('[data-home-hangar-stage]')!;
    this.aircraft = element.querySelector<HTMLElement>('[data-home-aircraft-name]')!;
    element.querySelector('[data-home-missions]')!.addEventListener('click', handlers.missions);
    element.querySelector('[data-home-free-fly]')!.addEventListener('click', handlers.freeFly);
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
    this.aircraft.textContent = this.data.aircraftName;
  }
}
