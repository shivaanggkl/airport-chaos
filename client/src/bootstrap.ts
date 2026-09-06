import './style.css';
import { CITY_QUERY_PARAM, activeCityFromUrl, cities, type CityDefinition } from './cities';

const gameRoot = document.querySelector<HTMLElement>('#game-root')!;
const citySelector = document.querySelector<HTMLElement>('#city-selector')!;
const cityOptions = document.querySelector<HTMLElement>('#city-options')!;
const citySelectionError = document.querySelector<HTMLElement>('#city-selection-error')!;

function showSelector(message = ''): void {
  gameRoot.hidden = true;
  citySelector.hidden = false;
  citySelectionError.textContent = message;
  citySelectionError.hidden = !message;
}

async function enterCity(city: CityDefinition): Promise<void> {
  if (city.status !== 'available' || !city.loadWorld) return;

  citySelector.hidden = true;
  citySelectionError.hidden = true;
  const url = new URL(window.location.href);
  url.searchParams.set(CITY_QUERY_PARAM, city.id);
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);

  await city.loadWorld();
  await import('./main');
  gameRoot.hidden = false;
}

for (const city of cities) {
  const option = document.createElement('article');
  option.className = 'city-option';
  option.innerHTML = `<div><strong>${city.displayName}</strong><span>${city.status === 'available' ? 'AVAILABLE NOW' : 'COMING SOON'}</span></div>`;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = city.status === 'available' ? 'Play' : 'Coming soon';
  button.disabled = city.status !== 'available';
  button.addEventListener('click', () => void enterCity(city));
  option.append(button);
  cityOptions.append(option);
}

const requestedCity = activeCityFromUrl();
if (requestedCity?.status === 'available') {
  void enterCity(requestedCity).catch(() => showSelector('Unable to load this city.'));
} else {
  showSelector(requestedCity ? `${requestedCity.displayName} is coming soon.` : '');
}
