import './style.css';
import { CITY_QUERY_PARAM, activeCityFromUrl, cities, type CityDefinition } from './cities';
import { AircraftGarage, type GarageProfile } from './garage';
import type { AircraftType } from './aircraft';
import { flightTutorial } from './tutorial';

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
// The landing page has its own small, explicit modal router.  Keeping NONE
// distinct from CITIES prevents an in-flight profile request from reopening a
// start-screen overlay after the player has entered a city.
type StartModalState = 'NONE' | 'CITIES' | 'GARAGE';
let startModalState: StartModalState = 'CITIES';
let garageOpenRequest = 0;
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
  garageProfile = normalizeGarageProfile(profile);
  return garageProfile;
}
function normalizeGarageProfile(profile: GarageProfile): GarageProfile {
  const aircraftTypes: AircraftType[] = ['trainer', 'privateJet', 'cargo', 'fighter'];
  const selectedAircraft = aircraftTypes.includes(profile.selectedAircraft) ? profile.selectedAircraft : 'trainer';
  const unlockedAircraft = Array.isArray(profile.unlockedAircraft)
    ? [...new Set(profile.unlockedAircraft.filter((type): type is AircraftType => aircraftTypes.includes(type)))]
    : [];
  if (!unlockedAircraft.includes('trainer')) unlockedAircraft.unshift('trainer');
  return {
    credits: Number.isFinite(profile.credits) ? Math.max(0, profile.credits) : 0,
    selectedAircraft,
    unlockedAircraft,
    economyVersion: profile.economyVersion,
    aircraftEntitlements: profile.aircraftEntitlements,
    testerCodeEnabled: profile.testerCodeEnabled === true,
  };
}
const garage = new AircraftGarage(garageOverlay, async (selectedAircraft) => {
  const url = new URL('/api/profile', profileOrigin);
  url.searchParams.set('pilotId', garageIdentity.pilotId); url.searchParams.set('pilotName', garageIdentity.displayName);
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ equipAircraft: selectedAircraft }) });
  if (!response.ok) return;
  garageProfile = normalizeGarageProfile(await response.json() as GarageProfile);
  try { localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(PLAYER_STORAGE_KEY) ?? '{}'), version: 1, pilotId: garageIdentity.pilotId, displayName: garageIdentity.displayName, credits: garageProfile.credits, selectedAircraft: garageProfile.selectedAircraft })); } catch { /* server profile remains authoritative */ }
  if (garage.isOpen()) garage.open(garageProfile);
}, undefined, () => {
  if (startModalState === 'GARAGE') startModalState = 'CITIES';
  garageOpenRequest += 1;
}, async (aircraftType) => {
  try {
    const url = new URL('/api/profile', profileOrigin);
    url.searchParams.set('pilotId', garageIdentity.pilotId); url.searchParams.set('pilotName', garageIdentity.displayName);
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purchaseAircraft: aircraftType }) });
    const result = await response.json() as GarageProfile & { error?: string };
    if (!response.ok) { garage.showActionResult(result.error ?? 'PURCHASE FAILED'); return; }
    garageProfile = normalizeGarageProfile(result); garage.updateProfile(garageProfile);
  } catch { garage.showActionResult('SERVER UNAVAILABLE — PURCHASE NOT CHANGED'); }
}, async (code) => {
  try {
    const url = new URL('/api/profile', profileOrigin);
    url.searchParams.set('pilotId', garageIdentity.pilotId); url.searchParams.set('pilotName', garageIdentity.displayName);
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testerCode: code }) });
    const result = await response.json() as GarageProfile & { error?: string };
    if (!response.ok) { garage.showActionResult(result.error ?? 'CODE REJECTED'); return; }
    garageProfile = normalizeGarageProfile(result); garage.updateProfile(garageProfile); garage.showActionResult('Redspear Fighter Unlocked');
  } catch { garage.showActionResult('SERVER UNAVAILABLE — CODE NOT REDEEMED'); }
});
garageEntry.addEventListener('click', async () => {
  if (startModalState === 'GARAGE') return;
  startModalState = 'GARAGE';
  const request = ++garageOpenRequest;
  // Browsing is always available at the start screen. Render the complete
  // cached catalog immediately, then replace only profile state when ready.
  garage.open(garageProfile, true);
  try {
    const profile = await loadGarageProfile();
    if (startModalState !== 'GARAGE' || request !== garageOpenRequest) return;
    garage.open(profile);
  } catch {
    if (startModalState !== 'GARAGE' || request !== garageOpenRequest) return;
    garage.open(garageProfile);
    citySelectionError.textContent = 'Garage profile unavailable. Start the server and try again.';
    citySelectionError.hidden = false;
  }
});

function showSelector(message = ''): void {
  startModalState = 'CITIES';
  garage.close();
  gameRoot.hidden = true;
  citySelector.hidden = false;
  citySelectionError.textContent = message;
  citySelectionError.hidden = !message;
}

async function enterCity(city: CityDefinition): Promise<void> {
  if (city.status !== 'available' || !city.loadWorld) return;

  startModalState = 'NONE';
  garage.close();
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

async function start(): Promise<void> {
  await flightTutorial.firstVisit(garageIdentity.pilotId);
  const requestedCity = activeCityFromUrl();
  if (requestedCity?.status === 'available') await enterCity(requestedCity);
  else showSelector(requestedCity ? `${requestedCity.displayName} is coming soon.` : '');
}
void start().catch(() => showSelector('Unable to load this city.'));
