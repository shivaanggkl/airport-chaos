import './style.css';
import { CITY_QUERY_PARAM, activeCityFromUrl, cities, type CityDefinition } from './cities';
import { AircraftGarage, type GarageProfile } from './garage';
import { aircraftDefinitions, aircraftDisplayName, type AircraftType } from './aircraft';
import { HomeHangar, type HomeHangarData } from './home-hangar';
import { AppShellHeader, type AppShellActive } from './app-shell';
import { PilotMenu, type PilotMenuData, type PilotMenuSection } from './pilot-menu';
import { BrandLoadingScreen } from './startup-loading';
import { loadAirportChaosLogo, mountCompactBrandFooter } from './brand';
import { aircraftDisplayOrder } from '../../shared/aircraft-economy.mjs';
import { cityCapabilities, cityDefinition } from '../../shared/city-registry.mjs';
import { beginFirehawkCheckout, restoreFirehawkPurchase, verifyCheckoutReturn } from './firehawk-checkout';
import { apiFetch, apiUrl } from './transport';
import { loadNativeFirehawkOffer, nativePurchaseProvider, purchaseNativeFirehawk, restoreNativeFirehawk } from './native-purchases';
import { missionsForCity } from '../../shared/city-missions.mjs';
import { territoriesForCity } from '../../shared/city-territories.mjs';
import { acquireNativeCredential, availableNativeProviders, clearNativeProviderState, nativeAuthPlatform, type NativeAuthChallenge } from './native-auth';
import { registerUiBackLayer, uiBackPriority } from './ui-back-navigation';
import { audioManager, type AudioLevels } from './audio-manager';
import { showFlightDialog } from './flight-dialog';
import { persistPitchInverted, preferredPitchInverted } from './mobile-input';
import milwaukeeJourneyImage from './help-assets/runway.avif';

audioManager.install();
audioManager.setMenuMusicDesired(true);

const gameRoot = document.querySelector<HTMLElement>('#game-root')!;
const brandLoadingElement = document.querySelector<HTMLElement>('#brand-loading')!;
const homeHangarElement = document.querySelector<HTMLElement>('#home-hangar')!;
const citySelector = document.querySelector<HTMLElement>('#city-selector')!;
const cityOptions = document.querySelector<HTMLElement>('#city-options')!;
const cityJourneyTrack = cityOptions.querySelector<HTMLElement>('[data-city-journey-track]')!;
const cityJourneyDots = cityOptions.querySelector<HTMLElement>('[data-city-journey-dots]')!;
const cityJourneyHint = cityOptions.querySelector<HTMLElement>('[data-city-journey-hint]')!;
const timeOptions = document.querySelector<HTMLElement>('#time-options')!;
const cityBack = document.querySelector<HTMLButtonElement>('#city-back')!;
const citySelectTitle = document.querySelector<HTMLElement>('#city-select-title')!;
const citySelectDescription = document.querySelector<HTMLElement>('#city-select-description')!;
const citySelectionError = document.querySelector<HTMLElement>('#city-selection-error')!;
const garageOverlay = document.querySelector<HTMLElement>('#garage-overlay')!;
const pilotMenuOverlay = document.querySelector<HTMLElement>('#pilot-menu-overlay')!;
const startupLoading = new BrandLoadingScreen(brandLoadingElement);
mountCompactBrandFooter(document.querySelector<HTMLElement>('#start-brand-signature')!);
const PLAYER_STORAGE_KEY = 'airport-chaos-player-v1';

type GarageIdentity = {
  pilotId: string; displayName: string; credits: number; bestScore: number; selectedAircraft: AircraftType;
  totalDistance: number; successfulLandings: number; discoveries: Record<string, string[]>;
};
type RemoteGarageProfile = GarageProfile & {
  pilotId?: string; pilotName?: string; score?: number;
  totalDistance?: number; successfulLandings?: number;
  discoveries?: Record<string, string[]>;
  legacyImportPending?: boolean;
  tutorial?: { version: 'tutorial_v1'; status: 'new' | 'started' | 'completed' | 'skipped'; completedAt?: number };
  kills?: number; deaths?: number;
  pilotProgress?: { xp: number; level: number; title: string; nextLevelXp: number };
  missions?: Partial<Record<string, { active?: { missionId: string; attemptId?: string; progress: number }; completions: Record<string, { count: number; lastCompletedAt: number }> }>>;
  objectives?: Partial<Record<string, {
    dailyId?: string; weeklyId?: string;
    daily?: Array<{ label: string; progress: number; target: number; completed: boolean; reward: number }>;
    weekly?: Array<{ label: string; progress: number; target: number; completed: boolean; reward: number }>;
  }>>;
  mastery?: Partial<Record<string, { xp: number; level: number; unlockedRewards: string[] }>>;
  dailyStreak?: { current: number; longest: number; cycleDay: number; nextReward: number };
  personalRecords?: Record<string, { value: number; cityId?: string; achievedAt: number }>;
  weeklyReward?: { weekId: string; rank: number; category: string; credits: number; badge: string; badgeExpiresAt: number };
  referral?: { code: string; status: string; rewardedCount: number };
};
type HubAccountStatus = Pick<PilotMenuData['account'], 'state' | 'email' | 'providers'> & { avatarUrl?: string };
function identity(): GarageIdentity {
  let value: Partial<GarageIdentity> = {};
  try { value = JSON.parse(localStorage.getItem(PLAYER_STORAGE_KEY) ?? '{}') as Partial<GarageIdentity>; } catch { /* use defaults */ }
  const pilotId = typeof value.pilotId === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(value.pilotId)
    ? value.pilotId : (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `pilot-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const displayName = typeof value.displayName === 'string' && value.displayName.trim() ? value.displayName.slice(0, 20) : 'Pilot';
  const result: GarageIdentity = {
    pilotId, displayName,
    credits: typeof value.credits === 'number' ? value.credits : 0,
    bestScore: typeof value.bestScore === 'number' ? value.bestScore : 0,
    selectedAircraft: value.selectedAircraft ?? 'trainer',
    totalDistance: typeof value.totalDistance === 'number' ? value.totalDistance : 0,
    successfulLandings: typeof value.successfulLandings === 'number' ? value.successfulLandings : 0,
    discoveries: value.discoveries && typeof value.discoveries === 'object' ? value.discoveries : {},
  };
  try { localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify({ ...value, version: 1, ...result })); } catch { /* profile fetch will still work for this session */ }
  return result;
}
const garageIdentity = identity();
function recordGarageBusinessEvent(event: 'fighter_modal_viewed' | 'fighter_purchase_clicked'): void {
  const url = apiUrl('/api/profile'); url.searchParams.set('pilotId', garageIdentity.pilotId); url.searchParams.set('pilotName', garageIdentity.displayName);
  void apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ analyticsEvent: event }) }).catch(() => undefined);
}
let garageProfile: GarageProfile = { credits: garageIdentity.credits, selectedAircraft: garageIdentity.selectedAircraft, unlockedAircraft: ['trainer'] };
let authoritativeHomeProfile: RemoteGarageProfile | undefined;
let hubAccount: HubAccountStatus = { state: 'guest', providers: { password: false, google: false, apple: false } };
const appHeader = new AppShellHeader(document.querySelector<HTMLElement>('#app-shell-header')!, {
  home: () => { void showHome(); },
  garage: () => { void openStartGarage('HANGAR'); },
  profile: () => { void openHubPilotMenu('PROFILE'); },
});
function showAppHeader(active: AppShellActive): void {
  appHeader.show({
    active,
    pilotName: authoritativeHomeProfile?.pilotName ?? garageIdentity.displayName,
    credits: garageProfile.credits,
    avatarUrl: hubAccount.avatarUrl,
  });
}
function refreshAppHeaderIdentity(): void {
  appHeader.updateIdentity(authoritativeHomeProfile?.pilotName ?? garageIdentity.displayName, garageProfile.credits, hubAccount.avatarUrl);
}
function cacheAuthoritativeProfile(profile: RemoteGarageProfile): void {
  try {
    const cached = JSON.parse(localStorage.getItem(PLAYER_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify({
      ...cached,
      version: 1,
      pilotId: profile.pilotId ?? garageIdentity.pilotId,
      displayName: profile.pilotName ?? garageIdentity.displayName,
      credits: Number.isFinite(profile.credits) ? profile.credits : 0,
      bestScore: Number.isFinite(profile.score) ? profile.score : 0,
      selectedAircraft: profile.selectedAircraft,
      discoveries: profile.discoveries && typeof profile.discoveries === 'object' ? profile.discoveries : {},
      totalDistance: Number.isFinite(profile.totalDistance) ? profile.totalDistance : 0,
      successfulLandings: Number.isFinite(profile.successfulLandings) ? profile.successfulLandings : 0,
    }));
  } catch { /* secure server session remains authoritative */ }
}
// Phase 1 entry flow. Future phases can replace CITY_SELECTION without
// coupling Home Hangar to any one city or world implementation.
type EntryState = 'STARTUP' | 'HANGAR' | 'CITY_SELECTION' | 'AIRCRAFT' | 'MISSIONS' | 'PROFILE' | 'SETTINGS' | 'TUTORIAL' | 'FLIGHT';
let entryState: EntryState = 'STARTUP';
let garageReturnState: 'HANGAR' | 'CITY_SELECTION' = 'HANGAR';
let hubPilotMenuReturnState: 'HANGAR' | 'CITY_SELECTION' = 'HANGAR';
let hubMissionPreferredCity: CityDefinition['id'] | undefined;
let garageOpenRequest = 0;
function applyAuthoritativeHomeProfile(profile: RemoteGarageProfile): void {
  authoritativeHomeProfile = profile;
  garageProfile = normalizeGarageProfile(profile);
  garageIdentity.pilotId = profile.pilotId ?? garageIdentity.pilotId;
  garageIdentity.displayName = profile.pilotName ?? garageIdentity.displayName;
  cacheAuthoritativeProfile(profile);
  refreshAppHeaderIdentity();
}
async function loadGarageProfile(): Promise<GarageProfile> {
  const url = apiUrl('/api/profile');
  url.searchParams.set('pilotId', garageIdentity.pilotId); url.searchParams.set('pilotName', garageIdentity.displayName);
  const response = await apiFetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Profile unavailable');
  let profile = await response.json() as RemoteGarageProfile;
  if (profile.legacyImportPending) {
    const imported = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ legacy: {
      credits: garageIdentity.credits, score: garageIdentity.bestScore,
      selectedAircraft: garageIdentity.selectedAircraft, pilotName: garageIdentity.displayName,
      totalDistance: garageIdentity.totalDistance, successfulLandings: garageIdentity.successfulLandings,
      discoveries: garageIdentity.discoveries,
    } }) });
    if (!imported.ok) throw new Error('Profile migration unavailable');
    profile = await imported.json() as RemoteGarageProfile;
  }
  applyAuthoritativeHomeProfile(profile);
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
    cosmetics: profile.cosmetics,
    fighterTrial: profile.fighterTrial ?? { status: 'available' },
  };
}

function homeHangarData(): HomeHangarData {
  const profile = authoritativeHomeProfile;
  return {
    pilotName: profile?.pilotName ?? garageIdentity.displayName,
    credits: garageProfile.credits,
    aircraftName: aircraftDisplayName(garageProfile.selectedAircraft),
  };
}

type CityJourneyId = CityDefinition['id'] | 'california' | 'new-york';
type CityJourneyEntry = Readonly<{
  id: CityJourneyId;
  title: string;
  subtitle: string;
  artImage: string;
  artPosition: string;
  cityId?: CityDefinition['id'];
}>;
const CITY_JOURNEY_SELECTION_KEY = 'airport-chaos-city-journey-selection-v1';
const cityJourneyEntries: readonly CityJourneyEntry[] = Object.freeze([
  { id: 'milwaukee', title: 'MILWAUKEE', subtitle: 'TRAINING CITY', artImage: milwaukeeJourneyImage, artPosition: 'center 46%', cityId: 'milwaukee' },
  { id: 'dallas', title: 'DALLAS', subtitle: 'CITY 01', artImage: '/media/launch/airport-chaos-launch-poster.jpg', artPosition: 'center 68%', cityId: 'dallas' },
  { id: 'california', title: 'CALIFORNIA', subtitle: 'COMING SOON', artImage: '/media/cities/california-coming-soon.svg', artPosition: 'center' },
  { id: 'new-york', title: 'NEW YORK', subtitle: 'COMING SOON', artImage: '/media/cities/new-york-coming-soon.svg', artPosition: 'center' },
]);
let cityJourneyIndex = 0;
let cityJourneyPointer: { id: number; x: number; y: number; dragging: boolean } | undefined;
let cityJourneyClickBlockedUntil = 0;
let cityJourneyWheelAt = Number.NEGATIVE_INFINITY;
type CityJourneyView = { card: HTMLElement; status: HTMLElement; cta: HTMLButtonElement; dot: HTMLButtonElement };
const cityJourneyViews: CityJourneyView[] = [];

function journeyCity(entry: CityJourneyEntry): CityDefinition | undefined {
  return entry.cityId ? cities.find(city => city.id === entry.cityId && city.status === 'available' && Boolean(city.loadWorld)) : undefined;
}

function cityJourneyState(entry: CityJourneyEntry): { status: string; cta: string; city?: CityDefinition; training?: boolean; disabled?: boolean } {
  const city = journeyCity(entry);
  if (!city) {
    const label = entry.cityId ? 'LOCKED' : 'COMING SOON';
    return { status: '', cta: label, disabled: true };
  }
  if (entry.id === 'milwaukee') {
    const completed = authoritativeHomeProfile?.tutorial?.status === 'completed';
    return { city, status: completed ? '✓ TRAINING COMPLETED' : 'TRAINING AVAILABLE', cta: completed ? 'PRACTICE AGAIN' : 'START TRAINING', training: !completed };
  }
  return { city, status: '✓ UNLOCKED', cta: 'FLY NOW' };
}

function preferredCityJourneyIndex(preferDallas = false): number {
  const dallasIndex = cityJourneyEntries.findIndex(entry => entry.id === 'dallas');
  if (preferDallas && dallasIndex >= 0 && journeyCity(cityJourneyEntries[dallasIndex]!)) return dallasIndex;
  try {
    const stored = localStorage.getItem(CITY_JOURNEY_SELECTION_KEY);
    const storedIndex = cityJourneyEntries.findIndex(entry => entry.id === stored);
    if (storedIndex >= 0) return storedIndex;
  } catch { /* use the current authoritative city availability */ }
  if (dallasIndex >= 0 && journeyCity(cityJourneyEntries[dallasIndex]!)) return dallasIndex;
  return Math.max(0, cityJourneyEntries.findIndex(entry => entry.id === 'milwaukee'));
}

function dismissCityJourneyHint(): void {
  cityJourneyHint.classList.add('is-dismissed');
}

function createCityJourneyCards(): void {
  if (cityJourneyViews.length) return;
  cityJourneyTrack.replaceChildren();
  cityJourneyDots.replaceChildren();
  cityJourneyEntries.forEach((entry, index) => {
    const card = document.createElement('article');
    card.className = 'city-journey-card';
    card.classList.add(`city-journey-${entry.id}`);
    card.dataset.cityJourneyId = entry.id;
    card.setAttribute('role', 'option');

    const art = document.createElement('div');
    art.className = 'city-journey-art';
    art.setAttribute('aria-hidden', 'true');
    card.style.setProperty('--journey-art-image', `url("${entry.artImage}")`);
    card.style.setProperty('--journey-art-position', entry.artPosition);
    const copy = document.createElement('div');
    copy.className = 'city-journey-copy';
    const subtitle = document.createElement('small');
    subtitle.textContent = entry.subtitle;
    const title = document.createElement('h2');
    title.textContent = entry.title;
    const status = document.createElement('strong');
    status.className = 'city-journey-status';
    copy.append(subtitle, title, status);
    card.append(art, copy);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'entry-button entry-button-primary city-journey-cta';
    button.addEventListener('click', event => {
      event.stopPropagation();
      const state = cityJourneyState(entry);
      if (performance.now() < cityJourneyClickBlockedUntil || index !== cityJourneyIndex || state.disabled || !state.city) return;
      if (state.training) void startTrainingFromHub();
      else chooseCity(state.city);
    });
    card.append(button);

    card.addEventListener('click', () => {
      if (performance.now() < cityJourneyClickBlockedUntil || index === cityJourneyIndex || Math.abs(index - cityJourneyIndex) !== 1) return;
      setCityJourneyIndex(index);
    });
    cityJourneyTrack.append(card);

    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'city-journey-dot';
    dot.setAttribute('aria-label', `Show ${entry.title}`);
    dot.addEventListener('click', () => setCityJourneyIndex(index));
    cityJourneyDots.append(dot);
    cityJourneyViews.push({ card, status, cta: button, dot });
  });
}

function renderCityJourney(): void {
  createCityJourneyCards();
  cityJourneyViews.forEach((view, index) => {
    const offset = index - cityJourneyIndex;
    const state = cityJourneyState(cityJourneyEntries[index]!);
    view.card.setAttribute('aria-selected', offset === 0 ? 'true' : 'false');
    view.card.setAttribute('aria-hidden', Math.abs(offset) > 1 ? 'true' : 'false');
    view.card.classList.toggle('is-selected', offset === 0);
    view.card.classList.toggle('is-previous', offset === -1);
    view.card.classList.toggle('is-next', offset === 1);
    view.card.classList.toggle('is-before', offset < -1);
    view.card.classList.toggle('is-after', offset > 1);
    view.status.textContent = state.status;
    view.cta.textContent = state.cta;
    view.cta.disabled = state.disabled === true;
    view.cta.setAttribute('aria-disabled', state.disabled === true ? 'true' : 'false');
    view.cta.tabIndex = offset === 0 ? 0 : -1;
    view.dot.classList.toggle('is-selected', offset === 0);
    view.dot.setAttribute('aria-current', offset === 0 ? 'true' : 'false');
    view.dot.textContent = offset === 0 ? '●' : '○';
  });
}

function setCityJourneyIndex(index: number, remember = true): void {
  const next = Math.max(0, Math.min(cityJourneyEntries.length - 1, index));
  if (next === cityJourneyIndex && cityJourneyTrack.childElementCount) return;
  cityJourneyIndex = next;
  if (remember) try { localStorage.setItem(CITY_JOURNEY_SELECTION_KEY, cityJourneyEntries[next]!.id); } catch { /* session selection still works */ }
  dismissCityJourneyHint();
  renderCityJourney();
}

function stepCityJourney(direction: -1 | 1): void {
  setCityJourneyIndex(cityJourneyIndex + direction);
}

cityOptions.addEventListener('keydown', event => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  stepCityJourney(event.key === 'ArrowLeft' ? -1 : 1);
});
cityOptions.addEventListener('wheel', event => {
  if (Math.abs(event.deltaX) < 18 || Math.abs(event.deltaX) <= Math.abs(event.deltaY) || performance.now() - cityJourneyWheelAt < 360) return;
  event.preventDefault();
  cityJourneyWheelAt = performance.now();
  stepCityJourney(event.deltaX > 0 ? 1 : -1);
}, { passive: false });
function setCityJourneyDrag(dx: number): void {
  const limit = Math.max(70, cityOptions.clientWidth * .28);
  const bounded = Math.max(-limit, Math.min(limit, dx));
  cityOptions.style.setProperty('--journey-drag-x', `${bounded}px`);
  cityOptions.style.setProperty('--journey-side-drag-x', `${bounded * .55}px`);
}
function clearCityJourneyDrag(): void {
  cityOptions.classList.remove('is-dragging');
  void cityJourneyTrack.offsetWidth;
  cityOptions.style.removeProperty('--journey-drag-x');
  cityOptions.style.removeProperty('--journey-side-drag-x');
}
cityOptions.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  cityJourneyPointer = { id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
});
cityOptions.addEventListener('pointermove', event => {
  if (!cityJourneyPointer || cityJourneyPointer.id !== event.pointerId) return;
  const dx = event.clientX - cityJourneyPointer.x;
  const dy = event.clientY - cityJourneyPointer.y;
  if (!cityJourneyPointer.dragging && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
    cityJourneyPointer = undefined;
    return;
  }
  if (!cityJourneyPointer.dragging && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
    cityJourneyPointer.dragging = true;
    cityOptions.classList.add('is-dragging');
    cityOptions.setPointerCapture(event.pointerId);
  }
  if (!cityJourneyPointer.dragging) return;
  event.preventDefault();
  setCityJourneyDrag(dx);
});
function finishCityJourneyPointer(event: PointerEvent): void {
  if (!cityJourneyPointer || cityJourneyPointer.id !== event.pointerId) return;
  const dx = event.clientX - cityJourneyPointer.x;
  const dy = event.clientY - cityJourneyPointer.y;
  const wasDragging = cityJourneyPointer.dragging;
  const passedThreshold = wasDragging && Math.abs(dx) >= 42 && Math.abs(dx) > Math.abs(dy);
  cityJourneyPointer = undefined;
  if (!wasDragging) return;
  cityJourneyClickBlockedUntil = performance.now() + 350;
  clearCityJourneyDrag();
  if (passedThreshold) stepCityJourney(dx < 0 ? 1 : -1);
}
cityOptions.addEventListener('pointerup', finishCityJourneyPointer);
cityOptions.addEventListener('pointercancel', event => {
  if (cityJourneyPointer?.id !== event.pointerId) return;
  const wasDragging = cityJourneyPointer.dragging;
  cityJourneyPointer = undefined;
  if (wasDragging) {
    cityJourneyClickBlockedUntil = performance.now() + 350;
    clearCityJourneyDrag();
  }
});

const homeHangar = new HomeHangar(homeHangarElement, {
  fly: () => showSelector(),
}, homeHangarData());

let hubStoredPreferences: Record<string, unknown> = {};
try { hubStoredPreferences = JSON.parse(localStorage.getItem(PLAYER_STORAGE_KEY) ?? '{}') as Record<string, unknown>; } catch { /* use defaults */ }
let hubHintsEnabled = typeof hubStoredPreferences.hintsEnabled === 'boolean' ? hubStoredPreferences.hintsEnabled : true;
let hubNavigationEnabled = typeof hubStoredPreferences.navigationMarkersEnabled === 'boolean' ? hubStoredPreferences.navigationMarkersEnabled : true;
let hubAudioMuted = typeof hubStoredPreferences.muted === 'boolean' ? hubStoredPreferences.muted : false;
audioManager.setMuted(hubAudioMuted);
let hubGraphicsQuality: PilotMenuData['preferences']['graphicsQuality'] = 'auto';
let hubPitchInverted=preferredPitchInverted();
try {
  const quality = localStorage.getItem('airport-chaos-graphics-quality-v1');
  if (quality === 'high' || quality === 'balanced' || quality === 'low') hubGraphicsQuality = quality;
} catch { /* use automatic quality */ }
let hubAudioLevels: AudioLevels = audioManager.getLevels();
const hubMobileLayout = {
  stick: { x: 14, y: 72, scale: 1 },
  throttle: { x: 75, y: 40, scale: 0.95 },
  fire: { x: 75, y: 78, scale: 1 },
};
function saveHubPlayerPreferences(): void {
  try {
    hubStoredPreferences = { ...JSON.parse(localStorage.getItem(PLAYER_STORAGE_KEY) ?? '{}') as Record<string, unknown>,
      muted: hubAudioMuted, hintsEnabled: hubHintsEnabled, navigationMarkersEnabled: hubNavigationEnabled };
    localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(hubStoredPreferences));
  } catch { /* preferences remain active for this session */ }
}

const hubPilotMenu = new PilotMenu(pilotMenuOverlay, (section) => {
  entryState = section === 'PROFILE' ? 'PROFILE' : section === 'SETTINGS' ? 'SETTINGS' : 'MISSIONS';
  showAppHeader(section === 'PROFILE' ? 'PROFILE' : section === 'SETTINGS' ? 'SETTINGS' : undefined);
}, {
  sections: ['MISSIONS', 'PROGRESS', 'PROFILE', 'SETTINGS'],
  title: 'PILOT HUB',
  closeLabel: () => hubPilotMenuReturnState === 'CITY_SELECTION' ? 'BACK TO CITY SELECTION' : 'BACK TO PILOT HUB',
  showFlightActions: false,
  appShell: true,
  onClose: () => {
    if (hubPilotMenuReturnState === 'CITY_SELECTION') {
      showSelector();
      return;
    }
    entryState = 'HANGAR';
    homeHangar.update(homeHangarData());
  },
});

function hubMissionContext(): { city: CityDefinition; activeCity?: string; active?: { missionId: string; attemptId?: string; progress: number } } {
  const profile = authoritativeHomeProfile;
  const activeEntry = Object.entries(profile?.missions ?? {}).find(([, state]) => Boolean(state?.active));
  const preferred = activeEntry?.[0] ?? hubMissionPreferredCity ?? activeCityFromUrl()?.id;
  const city = cities.find(item => item.id === preferred)
    ?? cities.find(item => item.status === 'available' && cityCapabilities(item.id)?.practiceMode !== true)
    ?? cities.find(item => item.status === 'available')!;
  return { city, activeCity: activeEntry?.[0], active: activeEntry?.[1]?.active };
}

function hubPilotMenuData(): PilotMenuData {
  const profile = authoritativeHomeProfile;
  const { city, activeCity, active } = hubMissionContext();
  const missionState = profile?.missions?.[city.id];
  const objectiveCycle = profile?.objectives?.[city.id];
  const mastery = profile?.mastery?.[city.id] ?? { xp: 0, level: 1, unlockedRewards: [] };
  const masteryStep = Math.max(0, Math.min(25, mastery.level) - 1);
  const levelStartXp = masteryStep * 100 + masteryStep * masteryStep * 25;
  const nextStep = Math.max(0, Math.min(25, mastery.level + 1) - 1);
  const nextXp = nextStep * 100 + nextStep * nextStep * 25;
  const territoryDefinitions = territoriesForCity(city.id);
  const territories = territoryDefinitions.map((territory) => ({
    id: territory.id,
    name: territory.displayName,
    controller: 'NEUTRAL',
    contested: false,
    color: territory.fixedColor,
    fixedColor: territory.fixedColor,
    progress: 0,
    distance: 0,
    ownedByYou: false,
    setWaypoint: () => showSelector(),
  }));
  const objectives = (items: Array<{ label: string; progress: number; target: number; completed: boolean; reward: number }> | undefined) => (items ?? []).map(item => ({
    label: item.label, progress: item.progress, target: item.target, completed: item.completed, reward: item.reward,
  }));
  const missions = missionsForCity(city.id).map((definition) => {
    const completion = missionState?.completions[definition.id];
    const requirements = definition.requirements as { territoryIds?: string[]; requiredTerritoryIds?: string[]; allCityTerritories?: boolean };
    return {
      id: definition.id,
      name: definition.displayName,
      detail: definition.retired ? 'This retired mission is no longer available. Choose another mission.' : definition.description,
      difficulty: definition.difficulty,
      credits: definition.creditReward,
      score: definition.scoreReward,
      completions: completion?.count ?? 0,
      cooldownUntil: (completion?.lastCompletedAt ?? 0) + definition.replayCooldownMs,
      territoryIds: requirements.allCityTerritories
        ? territoryDefinitions.map(territory => territory.id)
        : requirements.requiredTerritoryIds ?? requirements.territoryIds ?? [],
      retired: definition.retired,
      unavailableReason: definition.id === active?.missionId ? undefined : `Choose ${city.displayName} with FLY to accept this mission.`,
      progress: definition.id === active?.missionId ? active.progress : undefined,
      progressText: definition.id === active?.missionId ? `${active.progress.toLocaleString()} progress` : undefined,
    };
  });
  const pilotProgress = profile?.pilotProgress ?? { xp: 0, level: 1, title: 'ROOKIE', nextLevelXp: 100 };
  const dailyStreak = profile?.dailyStreak ?? { current: 0, longest: 0, cycleDay: 0, nextReward: 0 };
  const referral = profile?.referral ?? { code: 'FLY', status: 'available', rewardedCount: 0 };
  const accountResult = (path: 'signup' | 'login' | 'logout' | 'pilot-name', payload: Record<string, string> = {}) => hubAccountRequest(path, payload);
  return {
    nativeWebPromotion: nativePurchaseProvider !== undefined,
    account: {
      state: hubAccount.state,
      email: hubAccount.email,
      providers: hubAccount.providers,
      availableProviders: availableNativeProviders,
      pilotName: profile?.pilotName ?? garageIdentity.displayName,
      level: pilotProgress.level,
      xp: pilotProgress.xp,
      credits: garageProfile.credits,
      score: profile?.score ?? 0,
      ownedAircraft: garageProfile.unlockedAircraft.length,
      badges: 0,
      signUp: (email, password) => accountResult('signup', { email, password }),
      signIn: (email, password) => accountResult('login', { email, password }),
      logOut: () => accountResult('logout'),
      changeName: (pilotName) => accountResult('pilot-name', { pilotName }),
      providerAuth: hubProviderAccountRequest,
    },
    city: { name: city.displayName, timePreset: 'PRE-FLIGHT', changeCity: showSelector },
    intercity: { routes: [] },
    progression: {
      enabled: cityCapabilities(city.id)?.progressionEnabled === true,
      credits: garageProfile.credits,
      score: profile?.score ?? 0,
      pilotProgress,
      dailyStreak,
      personalRecords: profile?.personalRecords ?? {},
      weeklyReward: profile?.weeklyReward,
      referral,
      aircraft: aircraftDisplayOrder.map(type => ({
        name: aircraftDefinitions[type].callsign,
        owned: garageProfile.unlockedAircraft.includes(type),
        premium: aircraftDefinitions[type].access === 'premium',
        price: aircraftDefinitions[type].creditsRequired,
        neededCredits: Math.max(0, aircraftDefinitions[type].creditsRequired - garageProfile.credits),
      })),
    },
    missions: {
      practice: cityCapabilities(city.id)?.practiceMode === true,
      activeId: active?.missionId,
      activeCity,
      entries: missions,
      accept: () => showSelector(),
      abandon: () => { void abandonHubMission(activeCity, active?.attemptId); },
    },
    players: { city: city.displayName, entries: [] },
    territories: { enabled: territoryDefinitions.length > 0, city: city.displayName, entries: territories,
      legend: territoryDefinitions.map(territory => ({ name: territory.displayName, color: territory.fixedColor, colorName: territory.colorName })), neutralColor: '#eaf8ff' },
    objectives: { daily: objectives(objectiveCycle?.daily), weekly: objectives(objectiveCycle?.weekly), dailyId: objectiveCycle?.dailyId, weeklyId: objectiveCycle?.weeklyId },
    mastery: { city: city.displayName, level: mastery.level, xp: mastery.xp, levelStartXp, nextXp, rewards: mastery.unlockedRewards },
    leaderboards: [], activities: [], stunts: [],
    map: { mount: () => undefined, unmount: () => undefined },
    garage: {
      available: true,
      open: () => { hubPilotMenu.close(false); void openStartGarage('HANGAR'); },
      setAirportWaypoint: showSelector,
    },
    hints: { enabled: hubHintsEnabled, toggle: () => { hubHintsEnabled = !hubHintsEnabled; saveHubPlayerPreferences(); hubPilotMenu.refresh(hubPilotMenuData()); } },
    navigation: { enabled: hubNavigationEnabled, toggle: () => { hubNavigationEnabled = !hubNavigationEnabled; saveHubPlayerPreferences(); hubPilotMenu.refresh(hubPilotMenuData()); } },
    preferences: {
      touchMode: 'auto', touchLayout: false,
      setTouchMode: () => undefined,
      graphicsQuality: hubGraphicsQuality,
      setGraphicsQuality: (quality) => { hubGraphicsQuality = quality; try { localStorage.setItem('airport-chaos-graphics-quality-v1', quality); } catch { /* optional */ } },
      mobileLayout: hubMobileLayout,
      setMobileControl: (control, placement) => { Object.assign(hubMobileLayout[control], placement); hubPilotMenu.refresh(hubPilotMenuData()); },
      resetMobileLayout: () => hubMobileLayout,
    },
    flightPitch:{inverted:hubPitchInverted,touch:false,setInverted:(inverted)=>{hubPitchInverted=inverted;persistPitchInverted(inverted);hubPilotMenu.refresh(hubPilotMenuData());}},
    restart: () => undefined,
    audio: {
      muted: hubAudioMuted,
      toggle: () => { hubAudioMuted = audioManager.toggleMuted(); saveHubPlayerPreferences(); hubPilotMenu.refresh(hubPilotMenuData()); },
      levels: hubAudioLevels,
      setLevel: (category, value) => {
        hubAudioLevels = { ...hubAudioLevels, [category]: Math.max(0, Math.min(100, Math.round(value))) };
        audioManager.setLevel(category, value);
      },
    },
    guide: { enabled: false, open: () => undefined, replay: () => undefined },
  };
}

async function hubAccountRequest(path: 'signup' | 'login' | 'logout' | 'pilot-name', payload: Record<string, string> = {}): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await apiFetch(apiUrl(`/api/auth/${path}`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json() as { error?: string; message?: string; account?: HubAccountStatus; profile?: RemoteGarageProfile };
    if (!response.ok) return { ok: false, message: result.error ?? 'ACCOUNT REQUEST FAILED' };
    if (result.account) {
      hubAccount = result.account;
      refreshAppHeaderIdentity();
    }
    if (result.profile) applyAuthoritativeHomeProfile(result.profile);
    if (path === 'logout') await clearNativeProviderState();
    hubPilotMenu.refresh(hubPilotMenuData());
    return { ok: true, message: result.message ?? 'ACCOUNT UPDATED' };
  } catch { return { ok: false, message: 'ACCOUNT SERVICE UNAVAILABLE' }; }
}

async function hubProviderAccountRequest(provider: 'google' | 'apple', action: 'login' | 'link'): Promise<{ ok: boolean; message: string }> {
  try {
    if (nativeAuthPlatform) {
      const start = await apiFetch(apiUrl('/api/auth/native/start'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, action }) });
      const challenge = await start.json() as Partial<NativeAuthChallenge> & { error?: string };
      if (!start.ok || challenge.provider !== provider || challenge.platform !== nativeAuthPlatform || !challenge.state || !challenge.nonce) return { ok: false, message: challenge.error ?? 'PROVIDER SIGN-IN UNAVAILABLE' };
      const credential = await acquireNativeCredential(challenge as NativeAuthChallenge);
      if (credential.cancelled) return { ok: true, message: 'SIGN-IN CANCELLED' };
      const body = JSON.stringify({ provider, state: challenge.state, idToken: credential.idToken, ...(credential.displayName ? { displayName: credential.displayName } : {}) });
      credential.idToken = '';
      const complete = await apiFetch(apiUrl('/api/auth/native/complete'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      const result = await complete.json() as { error?: string; message?: string; account?: HubAccountStatus; profile?: RemoteGarageProfile };
      if (!complete.ok || !result.account || !result.profile) return { ok: false, message: result.error ?? 'PROVIDER SIGN-IN FAILED' };
      hubAccount = result.account; applyAuthoritativeHomeProfile(result.profile); hubPilotMenu.refresh(hubPilotMenuData());
      return { ok: true, message: result.message ?? 'ACCOUNT LOADED' };
    }
    const returnUrl = new URL(window.location.href);
    const response = await apiFetch(apiUrl('/api/auth/oauth/start'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, action, returnTo: returnUrl.toString() }) });
    const result = await response.json() as { authorizationUrl?: string; error?: string };
    if (!response.ok || !result.authorizationUrl) return { ok: false, message: result.error ?? 'PROVIDER SIGN-IN UNAVAILABLE' };
    window.location.assign(result.authorizationUrl);
    return { ok: true, message: `OPENING ${provider.toUpperCase()}…` };
  } catch { return { ok: false, message: 'ACCOUNT SERVICE UNAVAILABLE' }; }
}

async function abandonHubMission(cityId: string | undefined, attemptId: string | undefined): Promise<void> {
  if (!cityId || !attemptId) return;
  const url = apiUrl('/api/profile'); url.searchParams.set('pilotId', garageIdentity.pilotId); url.searchParams.set('pilotName', garageIdentity.displayName);
  const response = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ abandonMission: { cityId, expectedAttemptId: attemptId } }) });
  const result = await response.json() as RemoteGarageProfile & { error?: string };
  if (!response.ok) return;
  applyAuthoritativeHomeProfile(result);
  hubPilotMenu.refresh(hubPilotMenuData());
}

async function refreshHubPilotData(): Promise<void> {
  try {
    const response = await apiFetch(apiUrl('/api/auth/status'), { cache: 'no-store' });
    const result = await response.json() as { account?: HubAccountStatus; profile?: RemoteGarageProfile };
    if (!response.ok) return;
    if (result.account) {
      hubAccount = result.account;
      refreshAppHeaderIdentity();
    }
    if (result.profile) applyAuthoritativeHomeProfile(result.profile);
    if (hubPilotMenu.isOpen()) hubPilotMenu.refresh(hubPilotMenuData());
  } catch { /* cached authoritative profile keeps navigation usable */ }
}

async function openHubPilotMenu(section: Extract<PilotMenuSection, 'MISSIONS' | 'PROFILE' | 'SETTINGS'>): Promise<void> {
  hubPilotMenuReturnState = entryState === 'CITY_SELECTION' ? 'CITY_SELECTION' : 'HANGAR';
  entryState = section;
  if (garage.isOpen()) garage.close();
  homeHangar.hide();
  garage.hideShowcase();
  citySelector.hidden = true;
  showAppHeader(section === 'PROFILE' ? 'PROFILE' : section === 'SETTINGS' ? 'SETTINGS' : undefined);
  hubPilotMenu.open(hubPilotMenuData(), section);
  await refreshHubPilotData();
}

const garage = new AircraftGarage(garageOverlay, async (selectedAircraft) => {
  const url = apiUrl('/api/profile');
  url.searchParams.set('pilotId', garageIdentity.pilotId); url.searchParams.set('pilotName', garageIdentity.displayName);
  const response = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ equipAircraft: selectedAircraft }) });
  if (!response.ok) return;
  const profile = await response.json() as RemoteGarageProfile;
  applyAuthoritativeHomeProfile(profile);
  try { localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(PLAYER_STORAGE_KEY) ?? '{}'), version: 1, pilotId: garageIdentity.pilotId, displayName: garageIdentity.displayName, credits: garageProfile.credits, selectedAircraft: garageProfile.selectedAircraft })); } catch { /* server profile remains authoritative */ }
  if (garage.isOpen()) garage.open(garageProfile);
}, undefined, () => {
  if (entryState === 'AIRCRAFT') {
    if (garageReturnState === 'CITY_SELECTION') showSelector();
    else void showHome();
  }
  garageOpenRequest += 1;
}, async (aircraftType) => {
  try {
    const url = apiUrl('/api/profile');
    url.searchParams.set('pilotId', garageIdentity.pilotId); url.searchParams.set('pilotName', garageIdentity.displayName);
    const response = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purchaseAircraft: aircraftType }) });
    const result = await response.json() as GarageProfile & { error?: string };
    if (!response.ok) { garage.showActionResult(result.error ?? 'PURCHASE FAILED'); return; }
    garageProfile = normalizeGarageProfile(result); garage.updateProfile(garageProfile); refreshAppHeaderIdentity();
    audioManager.playPurchaseSuccess();
  } catch { garage.showActionResult('SERVER UNAVAILABLE — PURCHASE NOT CHANGED'); }
}, async (code) => {
  try {
    const url = apiUrl('/api/profile');
    url.searchParams.set('pilotId', garageIdentity.pilotId); url.searchParams.set('pilotName', garageIdentity.displayName);
    const response = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testerCode: code }) });
    const result = await response.json() as GarageProfile & { error?: string };
    if (!response.ok) { garage.showActionResult(result.error ?? 'CODE REJECTED'); return; }
    garageProfile = normalizeGarageProfile(result); garage.updateProfile(garageProfile); refreshAppHeaderIdentity(); garage.showActionResult('Redspear Fighter Unlocked');
    audioManager.playReward();
  } catch { garage.showActionResult('SERVER UNAVAILABLE — CODE NOT REDEEMED'); }
}, async () => {
  try {
    const url = apiUrl('/api/profile'); url.searchParams.set('pilotId', garageIdentity.pilotId); url.searchParams.set('pilotName', garageIdentity.displayName);
    const response = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startFighterTrial: true }) });
    const result = await response.json() as GarageProfile & { error?: string };
    if (!response.ok) { garage.showActionResult(result.error ?? 'TEST FLIGHT UNAVAILABLE'); return; }
    garageProfile = normalizeGarageProfile(result); garage.updateProfile(garageProfile); refreshAppHeaderIdentity(); garage.showActionResult('TEST FLIGHT READY — ENTER A CITY TO BEGIN');
  } catch { garage.showActionResult('SERVER UNAVAILABLE — TEST FLIGHT NOT STARTED'); }
}, async () => {
  recordGarageBusinessEvent('fighter_purchase_clicked');
  if (nativePurchaseProvider) {
    try {
      const result = await purchaseNativeFirehawk();
      if (result.state === 'cancelled') { garage.showActionResult('PURCHASE CANCELLED'); return; }
      if (result.state === 'pending') { garage.showActionResult('PURCHASE PENDING'); return; }
      garageProfile = normalizeGarageProfile(result.profile as GarageProfile); garage.updateProfile(garageProfile); refreshAppHeaderIdentity();
      garage.showActionResult('FIREHAWK UNLOCKED · PURCHASE CONFIRMED');
      audioManager.playPurchaseSuccess();
    } catch (error) { garage.showActionResult(error instanceof Error ? error.message.toUpperCase() : 'UNABLE TO VERIFY PURCHASE. TRY AGAIN.'); }
    return;
  }
  void beginFirehawkCheckout({ pilotId: garageIdentity.pilotId, pilotName: garageIdentity.displayName })
    .catch((error: unknown) => garage.showActionResult(error instanceof Error ? error.message.toUpperCase() : 'CHECKOUT UNAVAILABLE'));
}, () => recordGarageBusinessEvent('fighter_modal_viewed'), async (code) => {
  try {
    if (nativePurchaseProvider) {
      const result = await restoreNativeFirehawk();
      if (result.state === 'notFound') { garage.showActionResult('NO FIREHAWK PURCHASE FOUND'); return; }
      garageProfile = normalizeGarageProfile(result.profile as GarageProfile); garage.updateProfile(garageProfile); refreshAppHeaderIdentity();
      garage.showActionResult('FIREHAWK RESTORED'); audioManager.playReward(); return;
    }
    if (!code) { garage.showActionResult('PURCHASE RESTORE FAILED'); return; }
    const result = await restoreFirehawkPurchase(code);
    garageProfile = normalizeGarageProfile(result.profile as GarageProfile); garage.updateProfile(garageProfile); refreshAppHeaderIdentity();
    garage.showActionResult(`FIREHAWK RESTORED · NEW RECOVERY CODE: ${result.recoveryCode ?? 'CONTACT SUPPORT'}`);
  } catch (error) { garage.showActionResult(error instanceof Error ? error.message.toUpperCase() : 'PURCHASE RESTORE FAILED'); }
}, id => { void changeGarageCosmetic('purchaseCosmetic', id); }, id => { void changeGarageCosmetic('equipCosmetic', id); });

if (nativePurchaseProvider) {
  garage.setNativeStorePrice();
  void loadNativeFirehawkOffer().then(offer => garage.setNativeStorePrice(offer?.localizedPrice)).catch(() => undefined);
}

async function changeGarageCosmetic(action: 'purchaseCosmetic' | 'equipCosmetic', id: string): Promise<void> {
  try {
    const url = apiUrl('/api/profile');
    url.searchParams.set('pilotId', garageIdentity.pilotId);
    const response = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [action]: id }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'COSMETIC UPDATE FAILED');
    garageProfile = normalizeGarageProfile(result); garage.updateProfile(garageProfile); refreshAppHeaderIdentity();
    garage.showActionResult(action === 'equipCosmetic' ? 'COSMETIC EQUIPPED' : 'COSMETIC OWNED — SELECT TO EQUIP');
    if (action === 'purchaseCosmetic') audioManager.playPurchaseSuccess();
  } catch (error) { garage.showActionResult(error instanceof Error ? error.message : 'SERVER UNAVAILABLE'); }
}

void verifyCheckoutReturn({ pilotId: garageIdentity.pilotId, pilotName: garageIdentity.displayName }).then(async result => {
  if (result.state === 'none') return;
  entryState = 'AIRCRAFT';
  garageReturnState = 'HANGAR';
  if (hubPilotMenu.isOpen()) hubPilotMenu.close(false);
  homeHangar.hide();
  garage.hideShowcase();
  citySelector.hidden = true;
  showAppHeader('GARAGE');
  garage.open(garageProfile, true);
  if (result.state === 'cancelled') garage.showActionResult('CHECKOUT CANCELLED — FIREHAWK REMAINS LOCKED');
  else if (result.state === 'completed') {
    const profile = await loadGarageProfile(); garage.updateProfile(profile);
    garage.showActionResult(`FIREHAWK UNLOCKED · PURCHASE CONFIRMED · REF ${result.reference ?? 'AVAILABLE'}${result.recoveryCode ? ` · SAVE RECOVERY CODE: ${result.recoveryCode}` : ''}`);
    audioManager.playPurchaseSuccess();
  } else garage.showActionResult('PAYMENT RECEIVED — VERIFYING · YOUR UNLOCK WILL APPEAR SHORTLY');
  const clean = new URL(window.location.href); clean.searchParams.delete('checkout'); clean.searchParams.delete('session_id');
  window.history.replaceState(null, '', `${clean.pathname}${clean.search}${clean.hash}`);
}).catch(() => garage.showActionResult('PURCHASE VERIFICATION UNAVAILABLE'));

async function openStartGarage(returnState: 'HANGAR' | 'CITY_SELECTION'): Promise<void> {
  if (entryState === 'AIRCRAFT') return;
  entryState = 'AIRCRAFT';
  garageReturnState = returnState;
  if (hubPilotMenu.isOpen()) hubPilotMenu.close(false);
  homeHangar.hide();
  garage.hideShowcase();
  citySelector.hidden = true;
  showAppHeader('GARAGE');
  const request = ++garageOpenRequest;
  garage.open(garageProfile, true);
  try {
    const profile = await loadGarageProfile();
    if (entryState !== 'AIRCRAFT' || request !== garageOpenRequest) return;
    garage.open(profile);
  } catch {
    if (entryState !== 'AIRCRAFT' || request !== garageOpenRequest) return;
    garage.open(garageProfile);
    garage.showActionResult('PROFILE UNAVAILABLE — SHOWING CACHED AIRCRAFT');
  }
}

function showHome(): Promise<void> {
  audioManager.setMenuMusicDesired(true);
  entryState = 'HANGAR';
  garageReturnState = 'HANGAR';
  garageOpenRequest += 1;
  if (hubPilotMenu.isOpen()) hubPilotMenu.close(false);
  if (garage.isOpen()) garage.close();
  citySelector.hidden = true;
  homeHangar.show(homeHangarData());
  showAppHeader(undefined);
  return garage.showcase(homeHangar.stage, garageProfile);
}

function showSelector(message = '', options: { preferDallas?: boolean } = {}): void {
  audioManager.setMenuMusicDesired(true);
  entryState = 'CITY_SELECTION';
  if (hubPilotMenu.isOpen()) hubPilotMenu.close(false);
  homeHangar.hide();
  garage.hideShowcase();
  citySelector.dataset.view = 'cities';
  garage.close();
  citySelector.hidden = false;
  showAppHeader(undefined);
  cityOptions.hidden = false;
  timeOptions.hidden = true;
  cityBack.hidden = true;
  citySelectTitle.textContent = 'CITY JOURNEY';
  citySelectDescription.textContent = 'Choose your city.';
  cityJourneyHint.classList.remove('is-dismissed');
  cityJourneyIndex = preferredCityJourneyIndex(options.preferDallas === true);
  renderCityJourney();
  citySelectionError.textContent = message;
  citySelectionError.hidden = !message;
}

function returnFromCitySelection(): void {
  if (gameRoot.hidden) {
    void showHome();
    return;
  }
  // A running city owns long-lived render/network resources. Reloading the
  // entry route tears those down cleanly before returning to the Pilot Hub.
  const url = new URL(window.location.href);
  url.searchParams.delete(CITY_QUERY_PARAM);
  url.searchParams.delete('time');
  window.location.assign(`${url.pathname}${url.search}${url.hash}`);
}

registerUiBackLayer({
  id: 'city-selection',
  priority: uiBackPriority.surface,
  isActive: () => !citySelector.hidden,
  close: returnFromCitySelection,
  containsTarget: (target) => target instanceof Node && Boolean(citySelector.querySelector('.city-select-card')?.contains(target)),
});

async function startTrainingFromHub(): Promise<void> {
  if (entryState === 'TUTORIAL' || entryState === 'FLIGHT') return;
  const city = cities.find((candidate) => candidate.id === 'milwaukee' && candidate.status === 'available');
  if (!city || !cityCapabilities(city.id)?.tutorialEnabled) return;
  entryState = 'TUTORIAL';
  if (hubPilotMenu.isOpen()) hubPilotMenu.close(false);
  if (garage.isOpen()) garage.close();
  showAppHeader(undefined);
  const url = apiUrl('/api/profile');
  url.searchParams.set('pilotId', garageIdentity.pilotId);
  url.searchParams.set('pilotName', garageIdentity.displayName);
  try {
    const response = await apiFetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tutorialState: { version: 'tutorial_v1', status: 'started', freshRun: true } }),
    });
    if (!response.ok) throw new Error('Training session unavailable');
    const profile = await response.json() as RemoteGarageProfile;
    applyAuthoritativeHomeProfile(profile);
    // An intentional Tutorial launch is always a clean run. The server owns
    // lesson state for the active session; old local tutorial caches are not resumed.
    try {
      localStorage.removeItem(`airport-chaos-training-progress-v3:${garageIdentity.pilotId}`);
      localStorage.removeItem(`airport-chaos-training-progress-v5:${garageIdentity.pilotId}`);
    } catch { /* Optional legacy cache cleanup. */ }
    await enterCity(city, 'day', true);
  } catch (error) {
    console.error('[tutorial-entry] Unable to create training session.', error);
    await showHome();
  }
}

function maybeBriefCityBeforeEntry(city: CityDefinition): Promise<boolean> {
  const briefing = cityDefinition(city.id)?.briefing;
  if (!briefing) return Promise.resolve(true);
  const pilotId = authoritativeHomeProfile?.pilotId ?? garageIdentity.pilotId;
  const key = `airport-chaos-city-guide-v1:${pilotId}:${city.id}`;
  try { if (localStorage.getItem(key) === 'seen') return Promise.resolve(true); } catch { /* show on this visit */ }
  return new Promise((resolve) => {
    const markSeen = (): void => { try { localStorage.setItem(key, 'seen'); } catch { /* session-only */ } };
    showFlightDialog(briefing.title, briefing.summary, [
      { label: 'START FLYING', run: () => { markSeen(); resolve(true); } },
      { label: 'CITY MISSIONS', secondary: true, run: () => {
        markSeen();
        hubMissionPreferredCity = city.id;
        void openHubPilotMenu('MISSIONS');
        resolve(false);
      } },
    ], () => resolve(false));
  });
}

async function enterCity(city: CityDefinition, timePreset: 'day' | 'dusk' = 'day', trainingSession = false): Promise<void> {
  if (city.status !== 'available' || !city.loadWorld) return;
  if (!trainingSession && !await maybeBriefCityBeforeEntry(city)) return;
  appHeader.hide();

  if (!gameRoot.hidden) {
    if (activeCityFromUrl()?.id !== city.id) {
      window.dispatchEvent(new CustomEvent('airport-chaos-city-exit', { detail: { cityId: city.id, timePreset } }));
      return;
    }
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('time', timePreset);
    window.history.replaceState(null, '', `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
    citySelector.hidden = true;
    entryState = 'FLIGHT';
    audioManager.setMenuMusicDesired(false);
    window.dispatchEvent(new CustomEvent('airport-chaos-time-change', { detail: timePreset }));
    return;
  }

  entryState = 'FLIGHT';
  audioManager.setMenuMusicDesired(false);
  garage.close();
  garage.hideShowcase();
  homeHangar.hide();
  citySelector.hidden = true;
  citySelectionError.hidden = true;
  const url = new URL(window.location.href);
  url.searchParams.set(CITY_QUERY_PARAM, city.id);
  url.searchParams.set('time', city.timePresets.includes(timePreset) ? timePreset : 'day');
  if (trainingSession) url.searchParams.set('training', '1');
  else url.searchParams.delete('training');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);

  await city.loadWorld();
  await import('./main');
  gameRoot.hidden = false;
}

function chooseCity(city: CityDefinition): void {
  if (city.status !== 'available') return;
  if (city.timePresets.length === 1) {
    const preset = city.timePresets[0]!;
    try { localStorage.setItem(`airport-chaos-time-${city.id}`, preset); } catch { /* launch with the configured time */ }
    void enterCity(city, preset).catch((error: unknown) => {
      console.error('[city-entry] Unable to initialize gameplay.', error);
      showSelector('Unable to load this city.');
    });
    return;
  }
  citySelector.dataset.view = 'time';
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
    option.className = 'city-option city-time-option';
    option.classList.add(`city-${city.id}`);
    const copy = document.createElement('div');
    copy.className = 'city-option-copy';
    const label = document.createElement('strong');
    label.textContent = preset.toUpperCase();
    const description = document.createElement('span');
    description.textContent = preset === 'day' ? 'Bright daytime flying' : 'Evening city atmosphere';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'entry-button entry-button-primary';
    button.textContent = preset === preferred ? 'Play (preferred)' : 'Play';
    button.addEventListener('click', () => {
      try { localStorage.setItem(`airport-chaos-time-${city.id}`, preset); } catch { /* no persistence available */ }
      void enterCity(city, preset).catch((error: unknown) => {
        console.error('[city-entry] Unable to initialize gameplay.', error);
        showSelector('Unable to load this city.');
      });
    });
    copy.append(label, description);
    option.append(copy, button);
    timeOptions.append(option);
  }
}
cityBack.addEventListener('click', () => showSelector());
window.addEventListener('airport-chaos-open-city-selector', () => showSelector());

async function start(): Promise<void> {
  startupLoading.update(0.12);
  let brandReady = false;
  let profileReady = false;
  const reportStartupProgress = (): void => {
    startupLoading.update(0.12 + (brandReady ? 0.16 : 0) + (profileReady ? 0.42 : 0));
  };
  const brandTask = loadAirportChaosLogo().finally(() => {
    brandReady = true;
    reportStartupProgress();
  });
  const profileTask = loadGarageProfile().catch(() => {
    // Cached local identity keeps the hub usable; all later mutations still
    // require the authoritative server endpoints.
  }).finally(() => {
    profileReady = true;
    reportStartupProgress();
  });
  await Promise.all([brandTask, profileTask]);
  homeHangar.update(homeHangarData());
  if (new URLSearchParams(window.location.search).get('entry') === 'city') {
    const url = new URL(window.location.href); url.searchParams.delete('entry');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    showSelector('', { preferDallas: authoritativeHomeProfile?.tutorial?.status === 'completed' });
  } else await showHome();
  startupLoading.update(1);
  await startupLoading.finish();
  try {
    if (sessionStorage.getItem('airport-chaos-open-firehawk-garage') === '1') {
      sessionStorage.removeItem('airport-chaos-open-firehawk-garage');
      await openStartGarage('HANGAR');
      garage.focusAircraft('fighter');
    }
  } catch { /* the Pilot Hub remains usable if session storage is unavailable */ }
}
void start();
