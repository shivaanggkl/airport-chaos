import './style.css';
import { CITY_QUERY_PARAM, activeCityFromUrl, cities, type CityDefinition } from './cities';
import { AircraftGarage, type GarageProfile } from './garage';
import { aircraftDefinitions, aircraftDisplayName, type AircraftType } from './aircraft';
import { HomeHangar, type HomeHangarData } from './home-hangar';
import { PilotMenu, type PilotMenuData, type PilotMenuSection } from './pilot-menu';
import { BrandLoadingScreen } from './startup-loading';
import { flightTutorial } from './tutorial';
import { loadAirportChaosLogo, mountAirportChaosLogo, mountCompactBrandFooter } from './brand';
import { aircraftDisplayOrder } from '../../shared/aircraft-economy.mjs';
import { cityAirports } from '../../shared/city-airports.mjs';
import { cityCapabilities } from '../../shared/city-registry.mjs';
import { beginFirehawkCheckout, restoreFirehawkPurchase, verifyCheckoutReturn } from './firehawk-checkout';
import { setupLaunchBackground } from './launch-background';
import { apiFetch, apiUrl } from './transport';
import { loadNativeFirehawkOffer, nativePurchaseProvider, purchaseNativeFirehawk, restoreNativeFirehawk } from './native-purchases';
import { missionsForCity } from '../../shared/city-missions.mjs';
import { territoriesForCity } from '../../shared/city-territories.mjs';
import { acquireNativeCredential, availableNativeProviders, clearNativeProviderState, nativeAuthPlatform, type NativeAuthChallenge } from './native-auth';
import { closeTopUiLayer, registerUiBackLayer, uiBackPriority } from './ui-back-navigation';

const gameRoot = document.querySelector<HTMLElement>('#game-root')!;
const brandLoadingElement = document.querySelector<HTMLElement>('#brand-loading')!;
const homeHangarElement = document.querySelector<HTMLElement>('#home-hangar')!;
const citySelector = document.querySelector<HTMLElement>('#city-selector')!;
const cityOptions = document.querySelector<HTMLElement>('#city-options')!;
const timeOptions = document.querySelector<HTMLElement>('#time-options')!;
const cityBack = document.querySelector<HTMLButtonElement>('#city-back')!;
const cityHome = document.querySelector<HTMLButtonElement>('#city-home')!;
const cityClose = document.querySelector<HTMLButtonElement>('#city-close')!;
const citySelectTitle = document.querySelector<HTMLElement>('#city-select-title')!;
const citySelectDescription = document.querySelector<HTMLElement>('#city-select-description')!;
const citySelectionError = document.querySelector<HTMLElement>('#city-selection-error')!;
const garageEntry = document.querySelector<HTMLButtonElement>('#garage-entry')!;
const garageOverlay = document.querySelector<HTMLElement>('#garage-overlay')!;
const pilotMenuOverlay = document.querySelector<HTMLElement>('#pilot-menu-overlay')!;
const cityPilot = document.querySelector<HTMLElement>('[data-city-pilot]')!;
const cityCredits = document.querySelector<HTMLElement>('[data-city-credits]')!;
const cityProfileEntry = document.querySelector<HTMLButtonElement>('[data-city-profile-entry]')!;
const citySettings = document.querySelector<HTMLButtonElement>('[data-city-settings]')!;
const launchBackground = setupLaunchBackground(document.querySelector<HTMLElement>('#launch-background')!);
const startupLoading = new BrandLoadingScreen(brandLoadingElement);
const hubBrandReady = mountAirportChaosLogo(document.querySelector<HTMLElement>('.home-hangar-brand')!, 'brand-logo-entry');
const cityBrandReady = mountAirportChaosLogo(document.querySelector<HTMLElement>('.city-select-brand')!, 'brand-logo-entry');
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
type HubAccountStatus = Pick<PilotMenuData['account'], 'state' | 'email' | 'providers'>;
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
let remoteTutorial:{version:'tutorial_v1';status:'new'|'started'|'completed'|'skipped';completedAt?:number}={version:'tutorial_v1',status:'new'};
let establishedProfile=false;
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
let garageOpenRequest = 0;
function applyAuthoritativeHomeProfile(profile: RemoteGarageProfile): void {
  remoteTutorial = profile.tutorial ?? remoteTutorial;
  establishedProfile = (profile.totalDistance ?? 0) > 500 || (profile.successfulLandings ?? 0) > 0 || (profile.kills ?? 0) > 0 || (profile.deaths ?? 0) > 0;
  authoritativeHomeProfile = profile;
  garageProfile = normalizeGarageProfile(profile);
  garageIdentity.pilotId = profile.pilotId ?? garageIdentity.pilotId;
  garageIdentity.displayName = profile.pilotName ?? garageIdentity.displayName;
  cacheAuthoritativeProfile(profile);
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

function renderCityHeader(): void {
  cityPilot.textContent = authoritativeHomeProfile?.pilotName ?? garageIdentity.displayName;
  cityCredits.textContent = garageProfile.credits.toLocaleString();
}

const homeHangar = new HomeHangar(homeHangarElement, {
  fly: () => showSelector(),
  aircraft: () => { void openStartGarage('HANGAR'); },
  missions: () => { void openHubPilotMenu('MISSIONS'); },
  profile: () => { void openHubPilotMenu('PROFILE'); },
  settings: () => { void openHubPilotMenu('SETTINGS'); },
}, homeHangarData());

let hubStoredPreferences: Record<string, unknown> = {};
try { hubStoredPreferences = JSON.parse(localStorage.getItem(PLAYER_STORAGE_KEY) ?? '{}') as Record<string, unknown>; } catch { /* use defaults */ }
let hubHintsEnabled = typeof hubStoredPreferences.hintsEnabled === 'boolean' ? hubStoredPreferences.hintsEnabled : true;
let hubNavigationEnabled = typeof hubStoredPreferences.navigationMarkersEnabled === 'boolean' ? hubStoredPreferences.navigationMarkersEnabled : true;
let hubAudioMuted = typeof hubStoredPreferences.muted === 'boolean' ? hubStoredPreferences.muted : false;
let hubGraphicsQuality: PilotMenuData['preferences']['graphicsQuality'] = 'auto';
try {
  const quality = localStorage.getItem('airport-chaos-graphics-quality-v1');
  if (quality === 'high' || quality === 'balanced' || quality === 'low') hubGraphicsQuality = quality;
} catch { /* use automatic quality */ }
let hubAudioLevels = { master: 80, engine: 72, combat: 82, ui: 76 };
try {
  const stored = JSON.parse(localStorage.getItem('airport-chaos-audio-levels-v1') ?? '{}') as Partial<typeof hubAudioLevels>;
  for (const key of Object.keys(hubAudioLevels) as Array<keyof typeof hubAudioLevels>) if (Number.isFinite(stored[key])) hubAudioLevels[key] = Math.max(0, Math.min(100, Math.round(stored[key]!)));
} catch { /* use balanced defaults */ }
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
}, {
  sections: ['MISSIONS', 'PROGRESS', 'PROFILE', 'SETTINGS'],
  title: 'PILOT HUB',
  closeLabel: 'BACK TO PILOT HUB',
  showFlightActions: false,
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
  const preferred = activeEntry?.[0] ?? activeCityFromUrl()?.id;
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
    restart: () => undefined,
    audio: {
      muted: hubAudioMuted,
      toggle: () => { hubAudioMuted = !hubAudioMuted; saveHubPlayerPreferences(); hubPilotMenu.refresh(hubPilotMenuData()); },
      levels: hubAudioLevels,
      setLevel: (category, value) => {
        hubAudioLevels = { ...hubAudioLevels, [category]: Math.max(0, Math.min(100, Math.round(value))) };
        try { localStorage.setItem('airport-chaos-audio-levels-v1', JSON.stringify(hubAudioLevels)); } catch { /* optional */ }
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
    if (result.account) hubAccount = result.account;
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
    if (result.account) hubAccount = result.account;
    if (result.profile) applyAuthoritativeHomeProfile(result.profile);
    if (hubPilotMenu.isOpen()) hubPilotMenu.refresh(hubPilotMenuData());
  } catch { /* cached authoritative profile keeps navigation usable */ }
}

async function openHubPilotMenu(section: Extract<PilotMenuSection, 'MISSIONS' | 'PROFILE' | 'SETTINGS'>): Promise<void> {
  hubPilotMenuReturnState = entryState === 'CITY_SELECTION' ? 'CITY_SELECTION' : 'HANGAR';
  entryState = section;
  citySelector.hidden = true;
  launchBackground.setActive(false);
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
    garageProfile = normalizeGarageProfile(result); garage.updateProfile(garageProfile);
  } catch { garage.showActionResult('SERVER UNAVAILABLE — PURCHASE NOT CHANGED'); }
}, async (code) => {
  try {
    const url = apiUrl('/api/profile');
    url.searchParams.set('pilotId', garageIdentity.pilotId); url.searchParams.set('pilotName', garageIdentity.displayName);
    const response = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testerCode: code }) });
    const result = await response.json() as GarageProfile & { error?: string };
    if (!response.ok) { garage.showActionResult(result.error ?? 'CODE REJECTED'); return; }
    garageProfile = normalizeGarageProfile(result); garage.updateProfile(garageProfile); garage.showActionResult('Redspear Fighter Unlocked');
  } catch { garage.showActionResult('SERVER UNAVAILABLE — CODE NOT REDEEMED'); }
}, async () => {
  try {
    const url = apiUrl('/api/profile'); url.searchParams.set('pilotId', garageIdentity.pilotId); url.searchParams.set('pilotName', garageIdentity.displayName);
    const response = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startFighterTrial: true }) });
    const result = await response.json() as GarageProfile & { error?: string };
    if (!response.ok) { garage.showActionResult(result.error ?? 'TEST FLIGHT UNAVAILABLE'); return; }
    garageProfile = normalizeGarageProfile(result); garage.updateProfile(garageProfile); garage.showActionResult('TEST FLIGHT READY — ENTER A CITY TO BEGIN');
  } catch { garage.showActionResult('SERVER UNAVAILABLE — TEST FLIGHT NOT STARTED'); }
}, async () => {
  recordGarageBusinessEvent('fighter_purchase_clicked');
  if (nativePurchaseProvider) {
    try {
      const result = await purchaseNativeFirehawk();
      if (result.state === 'cancelled') { garage.showActionResult('PURCHASE CANCELLED'); return; }
      if (result.state === 'pending') { garage.showActionResult('PURCHASE PENDING'); return; }
      garageProfile = normalizeGarageProfile(result.profile as GarageProfile); garage.updateProfile(garageProfile);
      garage.showActionResult('FIREHAWK UNLOCKED · PURCHASE CONFIRMED');
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
      garageProfile = normalizeGarageProfile(result.profile as GarageProfile); garage.updateProfile(garageProfile);
      garage.showActionResult('FIREHAWK RESTORED'); return;
    }
    if (!code) { garage.showActionResult('PURCHASE RESTORE FAILED'); return; }
    const result = await restoreFirehawkPurchase(code);
    garageProfile = normalizeGarageProfile(result.profile as GarageProfile); garage.updateProfile(garageProfile);
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
    garageProfile = normalizeGarageProfile(result); garage.updateProfile(garageProfile);
    garage.showActionResult(action === 'equipCosmetic' ? 'COSMETIC EQUIPPED' : 'COSMETIC OWNED — SELECT TO EQUIP');
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
  launchBackground.setActive(false);
  garage.open(garageProfile, true);
  if (result.state === 'cancelled') garage.showActionResult('CHECKOUT CANCELLED — FIREHAWK REMAINS LOCKED');
  else if (result.state === 'completed') {
    const profile = await loadGarageProfile(); garage.updateProfile(profile);
    garage.showActionResult(`FIREHAWK UNLOCKED · PURCHASE CONFIRMED · REF ${result.reference ?? 'AVAILABLE'}${result.recoveryCode ? ` · SAVE RECOVERY CODE: ${result.recoveryCode}` : ''}`);
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
  launchBackground.setActive(false);
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

garageEntry.addEventListener('click', () => { void openStartGarage('CITY_SELECTION'); });

function showHome(): Promise<void> {
  entryState = 'HANGAR';
  garageReturnState = 'HANGAR';
  garageOpenRequest += 1;
  if (hubPilotMenu.isOpen()) hubPilotMenu.close(false);
  if (garage.isOpen()) garage.close();
  citySelector.hidden = true;
  launchBackground.setActive(false);
  homeHangar.show(homeHangarData());
  return garage.showcase(homeHangar.stage, garageProfile);
}

function showSelector(message = ''): void {
  entryState = 'CITY_SELECTION';
  if (hubPilotMenu.isOpen()) hubPilotMenu.close(false);
  homeHangar.hide();
  garage.hideShowcase();
  citySelector.dataset.view = 'cities';
  renderCityHeader();
  garage.close();
  cityClose.hidden = gameRoot.hidden;
  cityHome.hidden = !gameRoot.hidden;
  citySelector.hidden = false;
  launchBackground.setActive(true);
  cityOptions.hidden = false;
  timeOptions.hidden = true;
  cityBack.hidden = true;
  citySelectTitle.textContent = 'CHOOSE A CITY';
  citySelectDescription.textContent = 'Pick your city and start flying.';
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
});

async function offerCityTutorial(city: CityDefinition): Promise<'started'|'skipped'|undefined> {
  if (!cityCapabilities(city.id)?.tutorialEnabled) return;
  const tutorialChoice = await flightTutorial.firstVisit(garageIdentity.pilotId, remoteTutorial.status, establishedProfile);
  if (!tutorialChoice) return;
  try { localStorage.setItem(`airport-chaos-guided-tutorial-v1:${garageIdentity.pilotId}`, tutorialChoice === 'started' ? 'active' : 'skipped'); }
  catch { /* server remains the durable fallback */ }
  const url = apiUrl('/api/profile');
  url.searchParams.set('pilotId', garageIdentity.pilotId);
  url.searchParams.set('pilotName', garageIdentity.displayName);
  await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tutorialState: { version: 'tutorial_v1', status: tutorialChoice } }) }).catch(() => undefined);
  remoteTutorial = { version: 'tutorial_v1', status: tutorialChoice };
  return tutorialChoice;
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
    launchBackground.setActive(false);
    entryState = 'FLIGHT';
    window.dispatchEvent(new CustomEvent('airport-chaos-time-change', { detail: timePreset }));
    return;
  }

  const tutorialChoice = await offerCityTutorial(city);
  entryState = 'FLIGHT';
  garage.close();
  garage.hideShowcase();
  homeHangar.hide();
  citySelector.hidden = true;
  launchBackground.setActive(false);
  citySelectionError.hidden = true;
  const url = new URL(window.location.href);
  url.searchParams.set(CITY_QUERY_PARAM, city.id);
  url.searchParams.set('time', city.timePresets.includes(timePreset) ? timePreset : 'day');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);

  await city.loadWorld();
  await import('./main');
  gameRoot.hidden = false;
  if (tutorialChoice === 'started') window.dispatchEvent(new Event('airport-chaos-start-tutorial'));
}

function chooseCity(city: CityDefinition): void {
  if (city.status !== 'available') return;
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
cityHome.addEventListener('click', closeTopUiLayer);
cityClose.addEventListener('click', closeTopUiLayer);
cityProfileEntry.addEventListener('click', () => { void openHubPilotMenu('PROFILE'); });
citySettings.addEventListener('click', () => { void openHubPilotMenu('SETTINGS'); });
window.addEventListener('airport-chaos-open-city-selector', () => showSelector());

for (const city of cities) {
  const option = document.createElement('article');
  option.className = 'city-option';
  const airportCount = cityAirports[city.id].length;
  const cityRole = cityCapabilities(city.id)?.practiceMode ? 'Practice / training city' : 'Real gameplay city';
  option.innerHTML = `<div class="city-option-copy"><strong>${city.displayName}</strong><span>${cityRole} • ${airportCount} airports</span><div class="city-time-list">${city.timePresets.map(preset => `<i>${preset.toUpperCase()}</i>`).join('')}</div></div>`;
  option.classList.add(`city-${city.id}`);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'entry-button entry-button-primary';
  button.textContent = city.status === 'available' ? 'PLAY →' : 'COMING SOON';
  button.disabled = city.status !== 'available';
  button.addEventListener('click', () => chooseCity(city));
  option.append(button);
  cityOptions.append(option);
}

async function start(): Promise<void> {
  startupLoading.update(0.12);
  let brandReady = false;
  let profileReady = false;
  const reportStartupProgress = (): void => {
    startupLoading.update(0.12 + (brandReady ? 0.16 : 0) + (profileReady ? 0.42 : 0));
  };
  const brandTask = Promise.all([loadAirportChaosLogo(), hubBrandReady, cityBrandReady]).finally(() => {
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
  await showHome();
  startupLoading.update(1);
  await startupLoading.finish();
}
void start();
