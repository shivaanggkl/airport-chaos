import './aircraft-detail-panel.css';
import { aircraftDefinitions, aircraftSpeedCapsMph, type AircraftType } from './aircraft';
import { FIRE_RATE_PER_SECOND } from '../../shared/protocol.mjs';
import { maxHealthForAircraft } from '../../shared/aircraft-health.mjs';

export function createAircraftDetailPanel(onClose?: () => void): HTMLElement {
  const panel = document.createElement('section');
  panel.className = 'store-detail-panel';
  panel.innerHTML = '<div class="store-detail-preview"><span class="store-detail-rotate-hint">⟳  DRAG TO ROTATE</span></div><div class="store-detail-specs"><h2 class="store-detail-title"></h2><div class="store-detail-stats"></div></div>';
  if (onClose) {
    const close = document.createElement('button');
    close.type = 'button'; close.className = 'store-detail-close';
    close.setAttribute('aria-label', 'Close aircraft details'); close.textContent = '×';
    close.addEventListener('click', onClose);
    panel.prepend(close);
  }
  return panel;
}

export function renderAircraftDetailPanel(panel: HTMLElement, type: AircraftType): void {
  panel.querySelector<HTMLElement>('.store-detail-title')!.textContent = aircraftDefinitions[type].callsign;
  const speed = aircraftSpeedCapsMph(aircraftDefinitions[type]);
  const stats = [
    ['MAX SPEED', `${speed.normal.toLocaleString('en-US')} MPH`],
    ['BOOST SPEED', `${speed.boost.toLocaleString('en-US')} MPH`],
    ['FIRE RATE', `${FIRE_RATE_PER_SECOND[type]} shots/sec`],
    ['HEALTH', `${maxHealthForAircraft(type)} HP`],
  ].map(([label, value]) => {
    const row = document.createElement('div');
    const name = document.createElement('span'); name.textContent = label;
    const amount = document.createElement('strong'); amount.textContent = value;
    row.append(name, amount); return row;
  });
  panel.querySelector('.store-detail-stats')!.replaceChildren(...stats);
}
