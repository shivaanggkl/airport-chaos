import './style.css';
import { CITY_QUERY_PARAM, activeCityFromUrl, cities, type CityDefinition } from './cities';
import { AircraftGarage, type GarageProfile } from './garage';
import type { AircraftType } from './aircraft';

const gameRoot = document.querySelector<HTMLElement>('#game-root')!;
const citySelector = document.querySelector<HTMLElement>('#city-selector')!;
const cityOptions = document.querySelector<HTMLElement>('#city-options')!;
const citySelectionError = document.querySelector<HTMLElement>('#city-selection-error')!;
const garageEntry = document.querySelector<HTMLButtonElement>('#garage-entry')!;
const garageOverlay = document.querySelector<HTMLElement>('#garage-overlay')!;
const PLAYER_STORAGE_KEY = 'airport-chaos-player-v1';

type GarageIdentity = { pilotId: string; displayName: string; credits: number; selectedAircraft: AircraftType };
function identity(): GarageIdentity {
  let value: Partial<GarageIdentity> = {};
  try { value = JSON.parse(localStorage.getItem(PLAYER_STORAGE_KEY) ?? '{}') as Partial<GarageIdentity>; } catch { /* use defaults */ }
  const pilotId = typeof value.pilotId === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(value.pilotId)
    ? value.pilotId : (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `pilot-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const displayName = typeof value.displayName === 'string' && value.displayName.trim() ? value.displayName.slice(0, 20) : `Pilot-${Math.floor(100 + Math.random() * 900)}`;
  const result: GarageIdentity = { pilotId, displayName, credits: typeof value.credits === 'number' ? value.credits : 0, selectedAircraft: value.selectedAircraft ?? 'trainer' };
  try { localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify({ ...value, version: 1, ...result })); } catch { /* profile fetch will still work for this session */ }
  return result;
}
const garageIdentity = identity();
const profileOrigin = import.meta.env.DEV ? 'http://localhost:8091' : window.location.origin;
let garageProfile: GarageProfile = { credits: garageIdentity.credits, selectedAircraft: garageIdentity.selectedAircraft, unlockedAircraft: ['trainer'] };
async function loadGarageProfile(): Promise<GarageProfile> {
  const url = new URL('/api/profile', profileOrigin);
  url.searchParams.set('pilotId', garageIdentity.pilotId); url.searchParams.set('pilotName', garageIdentity.displayName);
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Profile unavailable');
  let profile = await response.json() as GarageProfile & { legacyImportPending?: boolean };
  if (profile.legacyImportPending) {
    const imported = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ legacy: { credits: garageIdentity.credits, selectedAircraft: garageIdentity.selectedAircraft, pilotName: garageIdentity.displayName } }) });
    if (!imported.ok) throw new Error('Profile migration unavailable');
    profile = await imported.json() as GarageProfile;
  }
  garageProfile = profile;
  return profile;
}
const garage = new AircraftGarage(garageOverlay, async (selectedAircraft) => {
  const url = new URL('/api/profile', profileOrigin);
  url.searchParams.set('pilotId', garageIdentity.pilotId); url.searchParams.set('pilotName', garageIdentity.displayName);
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ progress: { selectedAircraft } }) });
  if (!response.ok) return;
  garageProfile = await response.json() as GarageProfile;
  try { localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(PLAYER_STORAGE_KEY) ?? '{}'), version: 1, pilotId: garageIdentity.pilotId, displayName: garageIdentity.displayName, credits: garageProfile.credits, selectedAircraft: garageProfile.selectedAircraft })); } catch { /* server profile remains authoritative */ }
  garage.open(garageProfile);
});
garageEntry.addEventListener('click', async () => {
  try { garage.open(await loadGarageProfile()); } catch { citySelectionError.textContent = 'Garage profile unavailable. Start the server and try again.'; citySelectionError.hidden = false; }
});

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
