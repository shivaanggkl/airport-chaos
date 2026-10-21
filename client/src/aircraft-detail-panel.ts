import './aircraft-detail-panel.css';
import { aircraftDefinitions, aircraftDisplayName, aircraftSpeedCapsMph, garageStats, type AircraftType } from './aircraft';
import { aircraftRoles } from './visual-language';

export function createAircraftDetailPanel(): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'store-detail-panel';
  panel.innerHTML = '<div class="store-detail-preview"></div><div class="store-detail-specs"><h2 class="store-detail-title"></h2><p class="store-detail-role"></p><p class="store-detail-speed"></p><div class="store-detail-stats"></div></div>';
  return panel;
}

export function renderAircraftDetailPanel(panel: HTMLElement, type: AircraftType): void {
  panel.querySelector<HTMLElement>('.store-detail-title')!.textContent = aircraftDisplayName(type);
  panel.querySelector<HTMLElement>('.store-detail-role')!.textContent = aircraftRoles[type];
  const speed = aircraftSpeedCapsMph(aircraftDefinitions[type]);
  panel.querySelector<HTMLElement>('.store-detail-speed')!.textContent = `NORMAL ${speed.normal.toLocaleString()} MPH · BOOST ${speed.boost.toLocaleString()} MPH`;
  const stats = garageStats(aircraftDefinitions[type]).map(({ label, value }) => {
    const row = document.createElement('div');
    const name = document.createElement('span'); name.textContent = label;
    const bars = document.createElement('b'); bars.setAttribute('aria-label', `${value} of 5`);
    for (let index = 0; index < 5; index += 1) {
      const block = document.createElement('i'); block.classList.toggle('active', index < value); bars.append(block);
    }
    row.append(name, bars); return row;
  });
  panel.querySelector('.store-detail-stats')!.replaceChildren(...stats);
}
