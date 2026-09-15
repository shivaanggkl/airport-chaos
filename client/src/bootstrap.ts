import './style.css';
import { CITY_QUERY_PARAM, activeCityFromUrl, cities, type CityDefinition } from './cities';
import { AircraftGarage, type GarageProfile } from './garage';
import type { AircraftType } from './aircraft';
import { flightTutorial } from './tutorial';
import { mountAirportChaosLogo, mountGameBrandSignature } from './brand';
import { aircraftDisplayOrder } from '../../shared/aircraft-economy.mjs';
import { beginFirehawkCheckout, restoreFirehawkPurchase, verifyCheckoutReturn } from './firehawk-checkout';

const gameRoot = document.querySelector<HTMLElement>('#game-root')!;
const citySelector = document.querySelector<HTMLElement>('#city-selector')!;
const cityOptions = document.querySelector<HTMLElement>('#city-options')!;
const timeOptions = document.querySelector<HTMLElement>('#time-options')!;
const cityBack = document.querySelector<HTMLButtonElement>('#city-back')!;
const cityClose = document.querySelector<HTMLButtonElement>('#city-close')!;
const citySelectTitle = document.querySelector<HTMLElement>('#city-select-title')!;
const citySelectDescription = document.querySelector<HTMLElement>('#city-select-description')!;
const citySelectionError = document.querySelector<HTMLElement>('#city-selection-error')!;
const garageEntry = document.querySelector<HTMLButtonElement>('#garage-entry')!;
const garageOverlay = document.querySelector<HTMLElement>('#garage-overlay')!;
void mountAirportChaosLogo(document.querySelector<HTMLElement>('.city-select-kicker')!, 'brand-logo-home');
mountGameBrandSignature(document.querySelector<HTMLElement>('#start-brand-signature')!, 'game-brand-signature-start');
mountGameBrandSignature(document.querySelector<HTMLElement>('#crash-brand-signature')!, 'game-brand-signature-crash');
const PLAYER_STORAGE_KEY = 'airport-chaos-player-v1';

type GarageIdentity = { pilotId: string; displayName: string; credits: number; selectedAircraft: AircraftType };
function identity(): GarageIdentity {
  let value: Partial<GarageIdentity> = {};
  try { value = JSON.parse(localStorage.getItem(PLAYER_STORAGE_KEY) ?? '{}') as Partial<GarageIdentity>; } catch { /* use defaults */ }
  const pilotId = typeof value.pilotId === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(value.pilotId)
    ? value.pilotId : (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `pilot-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const displayName = typeof value.displayName === 'string' && value.displayName.trim() ? value.displayName.slice(0, 20) : 'Pilot';
  const result: GarageIdentity = { pilotId, displayName, credits: typeof value.credits === 'number' ? value.credits : 0, selectedAircraft: value.selectedAircraft ?? 'trainer' };
  try { localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify({ ...value, version: 1, ...result })); } catch { /* profile fetch will still work for this session */ }
  return result;
}
const garageIdentity = identity();
const profileOrigin = import.meta.env.DEV ? 'http://localhost:8091' : window.location.origin;
function recordGarageBusinessEvent(event: 'fighter_modal_viewed' | 'fighter_purchase_clicked'): void {
  const url = new URL('/api/profile', profileOrigin); url.searchParams.set('pilotId', garageIdentity.pilotId); url.searchParams.set('pilotName', garageIdentity.displayName);
  void fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ analyticsEvent: event }) }).catch(() => undefined);
}
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
  const response = await fetch(url, { cache: 'no-store', credentials: 'include' });
  if (!response.ok) throw new Error('Profile unavailable');
  let profile = await response.json() as GarageProfile & { legacyImportPending?: boolean };
  if (profile.legacyImportPending) {
    const imported = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ legacy: { credits: garageIdentity.credits, selectedAircraft: garageIdentity.selectedAircraft, pilotName: garageIdentity.displayName } }) });
    if (!imported.ok) throw new Error('Profile migration unavailable');
    profile = await imported.json() as GarageProfile;
  }
  garageProfile = normalizeGarageProfile(profile);
  garageIdentity.pilotId = (profile as GarageProfile & { pilotId?: string }).pilotId ?? garageIdentity.pilotId;
  garageIdentity.displayName = (profile as GarageProfile & { pilotName?: string }).pilotName ?? garageIdentity.displayName;
  try { localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(PLAYER_STORAGE_KEY) ?? '{}'), version: 1, pilotId: garageIdentity.pilotId, displayName: garageIdentity.displayName, credits: garageProfile.credits, selectedAircraft: garageProfile.selectedAircraft })); } catch { /* secure session remains authoritative */ }
  return garageProfile;
}
function normalizeGarageProfile(profile: GarageProfile): GarageProfile {
  const aircraftTypes = aircraftDisplayOrder;
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
    fighterTrial: profile.fighterTrial ?? { status: 'available' },
  };
}
const garage = new AircraftGarage(garageOverlay, async (selectedAircraft) => {
  const url = new URL('/api/profile', profileOrigin);
  url.searchParams.set('pilotId', garageIdentity.pilotId); url.searchParams.set('pilotName', garageIdentity.displayName);
  const response = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ equipAircraft: selectedAircraft }) });
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
    const response = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purchaseAircraft: aircraftType }) });
    const result = await response.json() as GarageProfile & { error?: string };
    if (!response.ok) { garage.showActionResult(result.error ?? 'PURCHASE FAILED'); return; }
    garageProfile = normalizeGarageProfile(result); garage.updateProfile(garageProfile);
  } catch { garage.showActionResult('SERVER UNAVAILABLE — PURCHASE NOT CHANGED'); }
}, async (code) => {
  try {
    const url = new URL('/api/profile', profileOrigin);
    url.searchParams.set('pilotId', garageIdentity.pilotId); url.searchParams.set('pilotName', garageIdentity.displayName);
    const response = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testerCode: code }) });
    const result = await response.json() as GarageProfile & { error?: string };
    if (!response.ok) { garage.showActionResult(result.error ?? 'CODE REJECTED'); return; }
    garageProfile = normalizeGarageProfile(result); garage.updateProfile(garageProfile); garage.showActionResult('Redspear Fighter Unlocked');
  } catch { garage.showActionResult('SERVER UNAVAILABLE — CODE NOT REDEEMED'); }
}, async () => {
  try {
    const url = new URL('/api/profile', profileOrigin); url.searchParams.set('pilotId', garageIdentity.pilotId); url.searchParams.set('pilotName', garageIdentity.displayName);
    const response = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startFighterTrial: true }) });
    const result = await response.json() as GarageProfile & { error?: string };
    if (!response.ok) { garage.showActionResult(result.error ?? 'TEST FLIGHT UNAVAILABLE'); return; }
    garageProfile = normalizeGarageProfile(result); garage.updateProfile(garageProfile); garage.showActionResult('TEST FLIGHT READY — ENTER A CITY TO BEGIN');
  } catch { garage.showActionResult('SERVER UNAVAILABLE — TEST FLIGHT NOT STARTED'); }
}, () => {
  recordGarageBusinessEvent('fighter_purchase_clicked');
  void beginFirehawkCheckout({ pilotId: garageIdentity.pilotId, pilotName: garageIdentity.displayName })
    .catch((error: unknown) => garage.showActionResult(error instanceof Error ? error.message.toUpperCase() : 'CHECKOUT UNAVAILABLE'));
}, () => recordGarageBusinessEvent('fighter_modal_viewed'), async (code) => {
  try {
    const result = await restoreFirehawkPurchase(code);
    garageProfile = normalizeGarageProfile(result.profile as GarageProfile); garage.updateProfile(garageProfile);
    garage.showActionResult(`FIREHAWK RESTORED · NEW RECOVERY CODE: ${result.recoveryCode ?? 'CONTACT SUPPORT'}`);
  } catch (error) { garage.showActionResult(error instanceof Error ? error.message.toUpperCase() : 'PURCHASE RESTORE FAILED'); }
});

void verifyCheckoutReturn({ pilotId: garageIdentity.pilotId, pilotName: garageIdentity.displayName }).then(async result => {
  if (result.state === 'none') return;
  garage.open(garageProfile, true);
  if (result.state === 'cancelled') garage.showActionResult('CHECKOUT CANCELLED — FIREHAWK REMAINS LOCKED');
  else if (result.state === 'completed') {
    const profile = await loadGarageProfile(); garage.updateProfile(profile);
    garage.showActionResult(`FIREHAWK UNLOCKED · PURCHASE CONFIRMED · REF ${result.reference ?? 'AVAILABLE'}${result.recoveryCode ? ` · SAVE RECOVERY CODE: ${result.recoveryCode}` : ''}`);
  } else garage.showActionResult('PAYMENT RECEIVED — VERIFYING · YOUR UNLOCK WILL APPEAR SHORTLY');
  const clean = new URL(window.location.href); clean.searchParams.delete('checkout'); clean.searchParams.delete('session_id');
  window.history.replaceState(null, '', `${clean.pathname}${clean.search}${clean.hash}`);
}).catch(() => garage.showActionResult('PURCHASE VERIFICATION UNAVAILABLE'));
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
  cityClose.hidden = gameRoot.hidden;
  citySelector.hidden = false;
  cityOptions.hidden = false;
  timeOptions.hidden = true;
  cityBack.hidden = true;
  citySelectTitle.textContent = 'Choose a city';
  citySelectDescription.textContent = 'Choose where to fly, fight, and complete missions.';
  citySelectionError.textContent = message;
  citySelectionError.hidden = !message;
}

async function enterCity(city: CityDefinition, timePreset: 'day' | 'dusk' = 'day'): Promise<void> {
  if (city.status !== 'available' || !city.loadWorld) return;

  if (!gameRoot.hidden) {
    if (activeCityFromUrl()?.id !== city.id) {
      window.dispatchEvent(new CustomEvent('airport-chaos-city-exit', { detail: { cityId: city.id, timePreset } }));
      return;
    }
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('time', timePreset);
    window.history.replaceState(null, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
    citySelector.hidden = true;
    startModalState = 'NONE';
    window.dispatchEvent(new CustomEvent('airport-chaos-time-change', { detail: timePreset }));
    return;
  }

  startModalState = 'NONE';
  garage.close();
  citySelector.hidden = true;
  citySelectionError.hidden = true;
  const url = new URL(window.location.href);
  url.searchParams.set(CITY_QUERY_PARAM, city.id);
  url.searchParams.set('time', city.timePresets.includes(timePreset) ? timePreset : 'day');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);

  await city.loadWorld();
  await import('./main');
  gameRoot.hidden = false;
}

function chooseCity(city: CityDefinition): void {
  if (city.status !== 'available') return;
  cityOptions.hidden = true;
  timeOptions.replaceChildren();
  timeOptions.hidden = false;
  cityBack.hidden = false;
  citySelectTitle.textContent = 'Choose time';
  citySelectDescription.textContent = `${city.displayName} · Day and Dusk share the same pilots and city.`;
  let preferred = 'day';
  try { preferred = localStorage.getItem(`airport-chaos-time-${city.id}`) ?? 'day'; } catch { /* default day */ }
  for (const preset of city.timePresets) {
    const option = document.createElement('article');
    option.className = 'city-option';
    option.classList.add(`city-${city.id}`);
    const label = document.createElement('strong');
    label.textContent = preset.toUpperCase();
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = preset === preferred ? 'Play (preferred)' : 'Play';
    button.addEventListener('click', () => {
      try { localStorage.setItem(`airport-chaos-time-${city.id}`, preset); } catch { /* no persistence available */ }
      void enterCity(city, preset);
    });
    option.append(label, button);
    timeOptions.append(option);
  }
}
cityBack.addEventListener('click', () => showSelector());
cityClose.addEventListener('click', () => { citySelector.hidden = true; startModalState = 'NONE'; });
window.addEventListener('airport-chaos-open-city-selector', () => showSelector());

for (const city of cities) {
  const option = document.createElement('article');
  option.className = 'city-option';
  option.innerHTML = `<div><strong>${city.displayName}</strong><span>${city.status === 'available' ? 'AVAILABLE NOW' : 'COMING SOON'}</span></div>`;
  option.classList.add(`city-${city.id}`);
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = city.status === 'available' ? 'Play' : 'Coming soon';
  button.disabled = city.status !== 'available';
  button.addEventListener('click', () => chooseCity(city));
  option.append(button);
  cityOptions.append(option);
}

async function start(): Promise<void> {
  await loadGarageProfile();
  await flightTutorial.firstVisit(garageIdentity.pilotId);
  const requestedCity = activeCityFromUrl();
  if (requestedCity?.status === 'available') {
    const requestedTime = new URLSearchParams(window.location.search).get('time');
    await enterCity(requestedCity, requestedTime === 'dusk' ? 'dusk' : 'day');
  }
  else showSelector(requestedCity ? `${requestedCity.displayName} is coming soon.` : '');
}
void start().catch(() => showSelector('Unable to load this city.'));
