import './style.css';
import { CITY_QUERY_PARAM, activeCityFromUrl, cities, type CityDefinition } from './cities';
import { AircraftGarage, type GarageProfile } from './garage';
import { aircraftDefinitions, aircraftDisplayName, type AircraftType } from './aircraft';
import { HomeHangar, type HomeHangarData } from './home-hangar';
import { AppShellHeader, type AppShellActive } from './app-shell';
import { GameStore } from './game-store';
import { MissionJourney } from './mission-journey';
import type { StoreItem, StoreCategory } from './store-catalog';
import { PilotMenu, type PilotMenuData, type PilotMenuSection } from './pilot-menu';
import { BrandLoadingScreen } from './startup-loading';
import { loadAirportChaosLogo, mountCompactBrandFooter } from './brand';
import { aircraftDisplayOrder } from '../../shared/aircraft-economy.mjs';
import { skyTokenPacks, type SkyTokenPackId } from '../../shared/sky-token-economy.mjs';
import { SkyTokenStore, type SkyTokenOffer } from './sky-token-store';
import { PLAYER_STORAGE_KEY } from './player-storage';
import { cityCapabilities } from '../../shared/city-registry.mjs';
import { beginFirehawkCheckout, restoreFirehawkPurchase, verifyCheckoutReturn } from './firehawk-checkout';
import { apiFetch, apiOrigin, apiUrl } from './transport';
import { loadNativeFirehawkOffer, loadNativeSkyTokenOffers, nativePurchaseProvider, purchaseNativeFirehawk, purchaseNativeSkyTokenPack, recoverNativeSkyTokenPurchases, restoreNativeFirehawk } from './native-purchases';
import { missionsForCity } from '../../shared/city-missions.mjs';
import { territoriesForCity } from '../../shared/city-territories.mjs';
import { acquireNativeCredential, availableNativeProviders, clearNativeProviderState, nativeAuthPlatform, type NativeAuthChallenge } from './native-auth';
import { registerUiBackLayer, uiBackPriority } from './ui-back-navigation';
import { audioManager, type AudioLevels } from './audio-manager';
import { hapticsManager } from './haptics-manager';
import { rewardedAdProvider, type RewardedAdAttempt } from './rewarded-ads';
import { Share } from '@capacitor/share';
import { recordProductIntent } from './product-analytics';
import { persistMobileControlPlacement, persistPitchInverted, persistTouchMode, preferredGraphicsQuality, preferredMobileControlLayout, preferredPitchInverted, preferredTouchMode, resetPreferredMobileControlLayout } from './mobile-input';
import milwaukeeJourneyImage from './help-assets/runway.avif';

audioManager.install();
audioManager.setMenuMusicDesired(true);

const gameRoot = document.querySelector<HTMLElement>('#game-root')!;
const brandLoadingElement = document.querySelector<HTMLElement>('#brand-loading')!;
const homeHangarElement = document.querySelector<HTMLElement>('#home-hangar')!;
const gameStoreElement = document.querySelector<HTMLElement>('#game-store')!;
const missionJourneyElement = document.querySelector<HTMLElement>('#mission-journey')!;
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
mountCompactBrandFooter(document.querySelector<HTMLElement>('#home-brand-signature')!);
const missionJourney = new MissionJourney(missionJourneyElement, leaveMissionJourney, openMissionFreeFlight, playJourneyMission, openMissionDetails, closeMissionDetails);
let journeyAttemptId: string | undefined;
let journeyAttemptMission: 'mission-01' | 'mission-02' | 'mission-03' = 'mission-01';

function abandonPendingJourneyLaunch(): void {
  const attemptId = journeyAttemptId;
  journeyAttemptId = undefined;
  if (!attemptId) return;
  void apiFetch(apiUrl(`/api/journey/dallas/${journeyAttemptMission}/abandon`), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attemptId }),
  }).catch(() => undefined);
}

async function refreshJourneyProgress(): Promise<{ completed: boolean; firstAttemptId?: string; mission02?: { completed: boolean; firstAttemptId?: string }; mission03?: { completed: boolean; firstAttemptId?: string } } | undefined> {
  try {
    const response = await apiFetch(apiUrl('/api/journey/dallas'), { cache: 'no-store' });
    if (!response.ok) { missionJourney.setStageOneProgress(false, false); missionJourney.setStageTwoProgress(false, false); missionJourney.setStageThreeProgress(false, false); return undefined; }
    const progress = await response.json() as { eligible?: boolean; completed?: boolean; firstAttemptId?: string; mission02?: { eligible?: boolean; completed?: boolean; firstAttemptId?: string }; mission03?: { eligible?: boolean; completed?: boolean; firstAttemptId?: string } };
    missionJourney.setStageOneProgress(progress.eligible === true, progress.completed === true);
    missionJourney.setStageTwoProgress(progress.mission02?.eligible === true, progress.mission02?.completed === true);
    missionJourney.setStageThreeProgress(progress.mission03?.eligible === true, progress.mission03?.completed === true);
    return { completed: progress.completed === true, firstAttemptId: progress.firstAttemptId,
      mission02: { completed: progress.mission02?.completed === true, firstAttemptId: progress.mission02?.firstAttemptId },
      mission03: { completed: progress.mission03?.completed === true, firstAttemptId: progress.mission03?.firstAttemptId } };
  } catch {
    missionJourney.setStageOneProgress(false, false);
    missionJourney.setStageTwoProgress(false, false);
    missionJourney.setStageThreeProgress(false, false);
    return undefined;
  }
}

async function playJourneyMission(): Promise<void> {
  const mission = missionJourney.selectedMissionNumber === 3 ? 'mission-03' : missionJourney.selectedMissionNumber === 2 ? 'mission-02' : 'mission-01';
  try {
    const response = await apiFetch(apiUrl(`/api/journey/dallas/${mission}/launch`), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!response.ok) throw new Error('Mission launch was not authorized');
    const result = await response.json() as { attempt?: { attemptId?: string } };
    if (!result.attempt?.attemptId) throw new Error('Mission attempt was missing');
    journeyAttemptId = result.attempt.attemptId;
    journeyAttemptMission = mission;
    const dallas = cities.find(city => city.id === 'dallas' && city.status === 'available');
    if (!dallas) throw new Error('Dallas is unavailable');
    missionJourney.hide();
    citySelector.hidden = false;
    showTimeSelection(dallas, 'MISSION_JOURNEY');
  } catch (error) {
    console.error('[journey] Mission launch failed', error);
    await refreshJourneyProgress();
  }
}
const PENDING_FLY_STORAGE_KEY = 'airport-chaos-pending-fly-v1';
const PENDING_STORE_STORAGE_KEY = 'airport-chaos-pending-store-v1';
const PENDING_REFERRAL_STORAGE_KEY = 'airport-chaos-pending-referral-v1';
const referralCodePattern = /^(?:[A-Z0-9]{4}-[A-Z0-9]{4}|[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5})$/i;
let activeReferralCode: string | undefined;
function pendingReferralCode(): string | undefined {
  try {
    const code = sessionStorage.getItem(PENDING_REFERRAL_STORAGE_KEY);
    return code && referralCodePattern.test(code) ? code.toUpperCase() : activeReferralCode;
  } catch { return activeReferralCode; }
}
function setPendingReferralCode(code?: string): void {
  activeReferralCode = code;
  try {
    if (code) sessionStorage.setItem(PENDING_REFERRAL_STORAGE_KEY, code.toUpperCase());
    else sessionStorage.removeItem(PENDING_REFERRAL_STORAGE_KEY);
  } catch { /* the current invite URL still works in this page session */ }
}
function referralUrl(code: string): string { return `https://fly.vadensoftware.com/invite/${encodeURIComponent(code)}`; }

async function copyReferralInvite(code: string): Promise<{ ok: boolean; message: string }> {
  const url = referralUrl(code);
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
    else {
      const field = document.createElement('textarea');
      field.value = url; field.style.position = 'fixed'; field.style.opacity = '0';
      document.body.append(field); field.select();
      const copied = document.execCommand('copy'); field.remove();
      if (!copied) throw new Error('Clipboard unavailable');
    }
    return { ok: true, message: 'Invite link copied' };
  } catch { return { ok: false, message: 'Unable to copy link. Select the link above to share it.' }; }
}

async function shareReferralInvite(code: string): Promise<{ ok: boolean; message: string }> {
  const url = referralUrl(code);
  const title = 'Fly Airport Chaos with me';
  const text = 'Create a new pilot account with my invite and earn 500 Credits after your first real flight.';
  try {
    if (nativeAuthPlatform) await Share.share({ title, text, url, dialogTitle: 'Invite a pilot' });
    else if (navigator.share) await navigator.share({ title, text, url });
    else return copyReferralInvite(code);
    return { ok: true, message: 'Invite ready to share' };
  } catch (error) {
    if (error instanceof Error && /cancel|abort/i.test(error.message)) return { ok: false, message: 'Sharing cancelled' };
    return copyReferralInvite(code);
  }
}

type GarageIdentity = {
  pilotId: string; displayName: string; credits: number; bestScore: number; selectedAircraft: AircraftType;
  totalDistance: number; successfulLandings: number; discoveries: Record<string, string[]>;
};
type RemoteGarageProfile = GarageProfile & {
  pilotId?: string; pilotName?: string; score?: number; skyTokens?: number;
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
  dailyReward?: { schedule: number[]; nextDay: number; nextAmount: number; claimable: boolean; claimedDays: number[]; claimCount: number; lastClaimedAt?: number; nextEligibleAt: number };
  personalRecords?: Record<string, { value: number; cityId?: string; achievedAt: number }>;
  weeklyReward?: { weekId: string; rank: number; category: string; credits: number; badge: string; badgeExpiresAt: number };
  referral?: {
    code: string; status: string; joinedCount: number; qualifiedCount: number; rewardedCount: number; earnedCredits: number;
    inviterRewardsInWindow: number; inviterRewardsRemaining: number; nextInviterRewardAt?: number;
  };
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
let garageProfile: GarageProfile = { credits: garageIdentity.credits, skyTokens: 0, selectedAircraft: garageIdentity.selectedAircraft, unlockedAircraft: ['trainer'] };
let skyTokenCommerceEnabled = false;
let skyTokenOffers: SkyTokenOffer[] = [];
const stagingTokenStorePreview = nativePurchaseProvider === 'apple' && apiOrigin === 'https://airport-chaos-staging.onrender.com' && import.meta.env.VITE_STAGING_TOKEN_STORE_PREVIEW === 'true';
let skyTokenCatalogPilotId: string | undefined;
let nativeSkyTokenRecoveryPilotId: string | undefined;
let nativeSkyTokenPurchasePending = false;
let nativeSkyTokenRecoveryInFlight = false;
let authoritativeHomeProfile: RemoteGarageProfile | undefined;
let hubAccount: HubAccountStatus = { state: 'guest', providers: { password: false, google: false, apple: false } };
let hubAccountNotice: PilotMenuData['account']['notice'];
let hubRewardNotice: string | undefined;
let hubServerNow = Date.now();
type RewardedAdAttemptStatus = 'CREATED' | 'AD_STARTED' | 'PENDING_VERIFICATION' | 'REWARDED' | 'CLOSED_WITHOUT_REWARD' | 'FAILED' | 'EXPIRED';
type RewardedAdStatus = {
  supported: boolean; provider?: 'ADMOB'; platform?: 'ios' | 'android'; rewardCredits: number; maxRewards: number; remaining: number;
  windowStartedAt?: number; windowEndsAt?: number;
  activeAttempt?: { attemptId: string; status: RewardedAdAttemptStatus; expiresAt: number };
  serverNow: number;
};
let hubRewardedAdStatus: RewardedAdStatus | undefined;
let hubRewardedAdNotice: string | undefined;
let hubRewardedAdPhase: 'idle' | 'loading' | 'playing' | 'verifying' = 'idle';
let rewardedAdPollGeneration = 0;
let hubFlyIntent = false;
let hubFlyGateActive = false;
const appHeader = new AppShellHeader(document.querySelector<HTMLElement>('#app-shell-header')!, {
  home: () => { void showHome(); },
  store: () => { hapticsManager.emit('selection'); void openGameStore(); },
  garage: () => { hapticsManager.emit('selection'); void openStartGarage(entryState === 'STORE' || (entryState === 'PILOT_MENU' && hubPilotMenuReturnState === 'STORE') ? 'STORE' : missionJourneyReturnPending ? 'MISSION_JOURNEY' : 'HANGAR'); },
  rewards: () => { hapticsManager.emit('selection'); void openHubRewards(); },
  profile: () => { hapticsManager.emit('selection'); void openHubPilotMenu('PROFILE', true, !missionJourneyReturnPending); },
  skyTokens: () => { hapticsManager.emit('selection'); void openSkyTokenStore(); },
});
const skyTokenStore = new SkyTokenStore(async packId => {
  try {
    if (nativePurchaseProvider) {
      const result = await purchaseNativeSkyTokenPack(packId);
      if (result.state === 'cancelled') { skyTokenStore.setMessage('Purchase cancelled.'); return; }
      if (result.state === 'pending') { nativeSkyTokenPurchasePending = true; skyTokenStore.setMessage('Purchase pending. Sky Tokens will arrive after verification.'); return; }
      applyAuthoritativeHomeProfile(result.profile as RemoteGarageProfile);
      garage.updateProfile(garageProfile);
      if (gameStore.isOpen()) gameStore.update(garageProfile, true);
      skyTokenStore.updateBalance(garageProfile.skyTokens ?? 0);
      skyTokenStore.setMessage(result.applied
        ? `+${skyTokenPacks[packId].tokens.toLocaleString()} SKY TOKENS · REF ${result.reference ?? 'AVAILABLE'}`
        : `Purchase already verified · REF ${result.reference ?? 'AVAILABLE'}`);
      if (result.applied) { audioManager.playPurchaseSuccess(); hapticsManager.emit('rewardSuccess', result.reference ? `tokens:${result.reference}` : undefined); }
      return;
    }
    const response = await apiFetch(apiUrl('/api/sky-tokens/checkout'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packId }) });
    const result = await response.json() as { url?: string; error?: string };
    if (!response.ok || !result.url) throw new Error(result.error ?? 'Checkout unavailable.');
    const checkout = new URL(result.url);
    if (checkout.protocol !== 'https:' || !checkout.hostname.endsWith('stripe.com')) throw new Error('Invalid checkout destination.');
    if (entryState === 'STORE') {
      try { sessionStorage.setItem(PENDING_STORE_STORAGE_KEY, JSON.stringify(gameStore.getContext())); } catch { /* Checkout still works without return context. */ }
    }
    window.location.assign(checkout.href);
  } catch (error) { skyTokenStore.setMessage(error instanceof Error ? error.message : 'Unable to start purchase. Please try again.'); }
});

async function refreshSkyTokenCatalog(): Promise<void> {
  if (hubAccount.state !== 'account') {
    skyTokenCommerceEnabled = false; skyTokenOffers = []; skyTokenCatalogPilotId = undefined;
    garage.setTokenCommerce(false); return;
  }
  if (skyTokenCatalogPilotId === garageIdentity.pilotId) return;
  const response = await apiFetch(apiUrl('/api/sky-tokens/catalog'), { cache: 'no-store' });
  if (!response.ok) throw new Error('Store configuration unavailable');
  const result = await response.json() as { enabled?: boolean; packs?: Array<{ id: string; tokens: number; usdCents: number }> };
  skyTokenCommerceEnabled = result.enabled === true;
  const nativeOffers = skyTokenCommerceEnabled && nativePurchaseProvider ? await loadNativeSkyTokenOffers() : {};
  skyTokenOffers = skyTokenCommerceEnabled || stagingTokenStorePreview ? (result.packs ?? []).flatMap(pack => {
    const id = pack.id as SkyTokenPackId;
    if (!Object.hasOwn(skyTokenPacks, id) || pack.tokens !== skyTokenPacks[id].tokens || pack.usdCents !== skyTokenPacks[id].usdCents) return [];
    const price = nativePurchaseProvider && skyTokenCommerceEnabled ? nativeOffers[id]?.localizedPrice : `$${(pack.usdCents / 100).toFixed(2)}`;
    return price ? [{ id, tokens: pack.tokens, price }] : [];
  }) : [];
  const completeCatalog = skyTokenOffers.length === Object.keys(skyTokenPacks).length;
  skyTokenCatalogPilotId = (!skyTokenCommerceEnabled && !stagingTokenStorePreview) || completeCatalog ? garageIdentity.pilotId : undefined;
  if (skyTokenCommerceEnabled && !completeCatalog) garage.setTokenStoreUnavailable();
  else garage.setTokenCommerce(skyTokenCommerceEnabled, stagingTokenStorePreview && !skyTokenCommerceEnabled && completeCatalog);
  showAppHeader(entryState === 'AIRCRAFT' ? 'GARAGE' : entryState === 'STORE' ? 'STORE' : undefined);
  if (skyTokenCommerceEnabled && nativePurchaseProvider && nativeSkyTokenRecoveryPilotId !== garageIdentity.pilotId) {
    nativeSkyTokenRecoveryPilotId = garageIdentity.pilotId;
    void recoverPendingNativeSkyTokens();
  }
}

async function recoverPendingNativeSkyTokens(): Promise<void> {
  if (!nativePurchaseProvider || !skyTokenCommerceEnabled || hubAccount.state !== 'account' || nativeSkyTokenRecoveryInFlight) return;
  const pilotId = garageIdentity.pilotId;
  nativeSkyTokenRecoveryInFlight = true;
  try {
    const profile = await recoverNativeSkyTokenPurchases();
    if (profile && hubAccount.state === 'account' && garageIdentity.pilotId === pilotId) {
      applyAuthoritativeHomeProfile(profile as RemoteGarageProfile);
      garage.updateProfile(garageProfile);
      skyTokenStore.updateBalance(garageProfile.skyTokens ?? 0);
      nativeSkyTokenPurchasePending = false;
    }
  } catch { /* An unfinished store purchase remains recoverable on the next resume. */ }
  finally { nativeSkyTokenRecoveryInFlight = false; }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && nativeSkyTokenPurchasePending) void recoverPendingNativeSkyTokens();
});

async function openSkyTokenStore(missing = 0): Promise<void> {
  if ((!skyTokenCommerceEnabled && !stagingTokenStorePreview) || hubAccount.state !== 'account') {
    if (entryState === 'STORE') gameStore.setNotice('SKY TOKEN PURCHASES ARE NOT AVAILABLE HERE YET');
    return;
  }
  if (skyTokenOffers.length !== Object.keys(skyTokenPacks).length) {
    if (entryState === 'STORE') gameStore.setNotice('SKY TOKEN PURCHASES ARE UNAVAILABLE — TRY AGAIN LATER');
    else garage.showActionResult('STORE UNAVAILABLE — PLEASE TRY AGAIN LATER');
    return;
  }
  recordProductIntent('sky_token_store_viewed');
  skyTokenStore.open(garageProfile.skyTokens ?? 0, skyTokenOffers, missing, !skyTokenCommerceEnabled);
  if (nativeSkyTokenPurchasePending) void recoverPendingNativeSkyTokens();
}
function showAppHeader(active: AppShellActive): void {
  if (entryState === 'CITY_SELECTION' || entryState === 'MISSION_JOURNEY') {
    appHeader.hide();
    return;
  }
  const homeData = homeHangarData();
  appHeader.show({
    active,
    hubActions: entryState === 'HANGAR' || entryState === 'PILOT_MENU' || entryState === 'STORE' || entryState === 'AIRCRAFT',
    pilotName: authoritativeHomeProfile?.pilotName ?? garageIdentity.displayName,
    credits: garageProfile.credits,
    skyTokens: Math.max(0, authoritativeHomeProfile?.skyTokens ?? 0),
    tokenStoreAvailable: hubAccount.state === 'account' && (skyTokenCommerceEnabled || stagingTokenStorePreview) && skyTokenOffers.length === Object.keys(skyTokenPacks).length,
    rewardsAvailable: homeData.rewardsAvailable,
    rewardsAvailableInMs: homeData.rewardsAvailableInMs,
    avatarUrl: hubAccount.avatarUrl,
  });
}
function refreshAppHeaderIdentity(): void {
  appHeader.updateIdentity(
    authoritativeHomeProfile?.pilotName ?? garageIdentity.displayName,
    garageProfile.credits,
    Math.max(0, authoritativeHomeProfile?.skyTokens ?? 0),
    hubAccount.avatarUrl,
  );
  const homeData = homeHangarData();
  appHeader.updateRewards(homeData.rewardsAvailable, homeData.rewardsAvailableInMs);
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
type EntryState = 'STARTUP' | 'HANGAR' | 'CITY_SELECTION' | 'MISSION_JOURNEY' | 'AIRCRAFT' | 'STORE' | 'PILOT_MENU' | 'TUTORIAL' | 'FLIGHT';
let entryState: EntryState = 'STARTUP';
let garageReturnState: 'HANGAR' | 'CITY_SELECTION' | 'MISSION_JOURNEY' | 'STORE' = 'HANGAR';
let hubPilotMenuReturnState: 'HANGAR' | 'CITY_SELECTION' | 'MISSION_JOURNEY' | 'STORE' = 'HANGAR';
let missionJourneyReturnPending = false;
let timeSelectionReturnState: 'CITY_SELECTION' | 'MISSION_JOURNEY' = 'CITY_SELECTION';
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
    skyTokens: Number.isSafeInteger(profile.skyTokens) ? Math.max(0, profile.skyTokens!) : 0,
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
  const reward = profile?.dailyReward;
  const rewardsAvailableInMs = reward ? Math.max(0, reward.nextEligibleAt - hubServerNow - Math.max(0, Date.now() - hubServerNow)) : undefined;
  return {
    pilotName: profile?.pilotName ?? garageIdentity.displayName,
    credits: garageProfile.credits,
    aircraftName: aircraftDisplayName(garageProfile.selectedAircraft),
    rewardsAvailable: hubAccount.state === 'account' && Boolean(reward && (reward.claimable || rewardsAvailableInMs === 0)),
    rewardsAvailableInMs: hubAccount.state === 'account' && reward && !reward.claimable ? rewardsAvailableInMs : undefined,
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
  { id: 'dallas', title: 'DALLAS', subtitle: 'CITY 01', artImage: '/media/city-journey/dallas.jpg', artPosition: 'center', cityId: 'dallas' },
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
      hapticsManager.emit('selection');
      if (state.training) void startTrainingFromHub();
      else chooseCity(state.city);
    });
    card.append(button);

    card.addEventListener('click', () => {
      if (performance.now() < cityJourneyClickBlockedUntil || index === cityJourneyIndex || Math.abs(index - cityJourneyIndex) !== 1) return;
      hapticsManager.emit('selection');
      setCityJourneyIndex(index);
    });
    cityJourneyTrack.append(card);

    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'city-journey-dot';
    dot.setAttribute('aria-label', `Show ${entry.title}`);
    dot.addEventListener('click', () => { if (index !== cityJourneyIndex) hapticsManager.emit('selection'); setCityJourneyIndex(index); });
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
  fly: () => { hapticsManager.emit('selection'); recordProductIntent('fly_clicked'); void requestHubFly(); },
}, homeHangarData());

let hubStoredPreferences: Record<string, unknown> = {};
try { hubStoredPreferences = JSON.parse(localStorage.getItem(PLAYER_STORAGE_KEY) ?? '{}') as Record<string, unknown>; } catch { /* use defaults */ }
let hubHintsEnabled = typeof hubStoredPreferences.hintsEnabled === 'boolean' ? hubStoredPreferences.hintsEnabled : true;
let hubNavigationEnabled = typeof hubStoredPreferences.navigationMarkersEnabled === 'boolean' ? hubStoredPreferences.navigationMarkersEnabled : true;
let hubAudioMuted = typeof hubStoredPreferences.muted === 'boolean' ? hubStoredPreferences.muted : false;
audioManager.setMuted(hubAudioMuted);
let hubGraphicsQuality: PilotMenuData['preferences']['graphicsQuality'] = preferredGraphicsQuality();
let hubPitchInverted=preferredPitchInverted();
let hubTouchMode=preferredTouchMode();
let hubAudioLevels: AudioLevels = audioManager.getLevels();
let hubMobileLayout = preferredMobileControlLayout();
function saveHubPlayerPreferences(): void {
  try {
    hubStoredPreferences = { ...JSON.parse(localStorage.getItem(PLAYER_STORAGE_KEY) ?? '{}') as Record<string, unknown>,
      muted: hubAudioMuted, hintsEnabled: hubHintsEnabled, navigationMarkersEnabled: hubNavigationEnabled };
    localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(hubStoredPreferences));
  } catch { /* preferences remain active for this session */ }
}

function syncHubMenuPreferences(): void {
  try {
    hubStoredPreferences = JSON.parse(localStorage.getItem(PLAYER_STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    hubHintsEnabled = typeof hubStoredPreferences.hintsEnabled === 'boolean' ? hubStoredPreferences.hintsEnabled : true;
    hubNavigationEnabled = typeof hubStoredPreferences.navigationMarkersEnabled === 'boolean' ? hubStoredPreferences.navigationMarkersEnabled : true;
  } catch { /* retain the current session values */ }
  hubAudioMuted = audioManager.isMuted();
  hubAudioLevels = audioManager.getLevels();
  hubGraphicsQuality = preferredGraphicsQuality();
  hubPitchInverted = preferredPitchInverted();
  hubTouchMode = preferredTouchMode();
  hubMobileLayout = preferredMobileControlLayout();
}

function notifySharedMenuPreferences(): void {
  window.dispatchEvent(new Event('airport-chaos-menu-preferences-changed'));
}

const hubPilotMenu = new PilotMenu(pilotMenuOverlay, (section) => {
  entryState = 'PILOT_MENU';
  showAppHeader(section === 'REWARDS' ? 'REWARDS' : section === 'PROFILE' ? 'PROFILE' : undefined);
  if (section === 'REWARDS') recordProductIntent('rewards_viewed');
  if (section !== 'REWARDS') rewardedAdPollGeneration += 1;
}, {
  sections: ['PROFILE', 'REWARDS', 'PROGRESS', 'GARAGE', 'CONTROLS', 'AUDIO', 'HELP', 'WORLD / CITIES', 'LEGAL / SUPPORT', 'DATA LICENSES'],
  title: 'PILOT MENU',
  appShell: true,
  closeLabel: () => hubPilotMenuReturnState === 'CITY_SELECTION' ? 'BACK TO CITY SELECTION' : hubPilotMenuReturnState === 'MISSION_JOURNEY' ? 'BACK TO MISSIONS' : hubPilotMenuReturnState === 'STORE' ? 'BACK TO STORE' : 'BACK TO PILOT HUB',
  showFlightActions: false,
  showContextStatus: false,
  onClose: () => {
    rewardedAdPollGeneration += 1;
    if (hasPendingHubFly()) clearPendingHubFly();
    hubAccountNotice = undefined;
    if (hubPilotMenuReturnState === 'CITY_SELECTION') {
      showSelector();
      return;
    }
    if (hubPilotMenuReturnState === 'MISSION_JOURNEY') {
      if (window.history.state?.airportChaosEntryView === 'PILOT_MENU') window.history.back();
      else showMissionJourney(false);
      return;
    }
    if (hubPilotMenuReturnState === 'STORE') {
      if (missionJourneyReturnPending && window.history.state?.airportChaosEntryView === 'PILOT_MENU') window.history.back();
      else void openGameStore(false);
      return;
    }
    void showHome();
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
    setWaypoint: () => { void requestHubFly(); },
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
  const referral = profile?.referral;
  const accountResult = (path: 'logout' | 'pilot-name', payload: Record<string, string> = {}) => hubAccountRequest(path, payload);
  return {
    nativeWebPromotion: nativePurchaseProvider !== undefined,
    account: {
      state: hubAccount.state,
      email: hubAccount.email,
      notice: hubAccountNotice,
      providers: hubAccount.providers,
      availableProviders: availableNativeProviders,
      pilotName: profile?.pilotName ?? garageIdentity.displayName,
      level: pilotProgress.level,
      xp: pilotProgress.xp,
      credits: garageProfile.credits,
      score: profile?.score ?? 0,
      ownedAircraft: garageProfile.unlockedAircraft.length,
      badges: 0,
      continueAsGuest: continueHubAsGuest,
      logOut: () => accountResult('logout'),
      changeName: (pilotName) => accountResult('pilot-name', { pilotName }),
      providerAuth: hubProviderAccountRequest,
    },
    city: { name: city.displayName, timePreset: 'PRE-FLIGHT', changeCity: () => { void requestHubFly(); } },
    intercity: { routes: [] },
    progression: {
      enabled: cityCapabilities(city.id)?.progressionEnabled === true,
      credits: garageProfile.credits,
      score: profile?.score ?? 0,
      pilotProgress,
      dailyStreak,
      personalRecords: profile?.personalRecords ?? {},
      weeklyReward: profile?.weeklyReward,
      referral: referral ?? { code: '', status: 'none', joinedCount: 0, qualifiedCount: 0, rewardedCount: 0, earnedCredits: 0, inviterRewardsInWindow: 0, inviterRewardsRemaining: 10 },
      aircraft: aircraftDisplayOrder.map(type => ({
        name: aircraftDefinitions[type].callsign,
        owned: garageProfile.unlockedAircraft.includes(type),
        premium: aircraftDefinitions[type].access === 'premium',
        price: aircraftDefinitions[type].creditsRequired,
        neededCredits: Math.max(0, aircraftDefinitions[type].creditsRequired - garageProfile.credits),
      })),
    },
    rewards: {
      authenticated: hubAccount.state === 'account',
      notice: hubRewardNotice,
      state: profile?.dailyReward
        ? { ...profile.dailyReward, serverNow: hubServerNow }
        : { schedule: [], nextDay: 1, nextAmount: 0, claimable: false, claimedDays: [], claimCount: 0, nextEligibleAt: Number.MAX_SAFE_INTEGER, serverNow: hubServerNow },
      claim: claimDailyReward,
      watchAndEarn: hubRewardedAdStatus?.supported && rewardedAdProvider ? {
        state: hubRewardedAdStatus,
        phase: hubRewardedAdPhase,
        notice: hubRewardedAdNotice,
        watch: watchRewardedAd,
      } : undefined,
      invite: hubAccount.state === 'account' && referral?.code ? {
        ...referral,
        url: referralUrl(referral.code),
        share: () => shareReferralInvite(referral.code),
        copy: () => copyReferralInvite(referral.code),
      } : undefined,
    },
    missions: {
      practice: cityCapabilities(city.id)?.practiceMode === true,
      activeId: active?.missionId,
      activeCity,
      entries: missions,
      accept: () => { void requestHubFly(); },
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
      setAirportWaypoint: () => { void requestHubFly(); },
    },
    hints: { enabled: hubHintsEnabled, toggle: () => { hubHintsEnabled = !hubHintsEnabled; saveHubPlayerPreferences(); notifySharedMenuPreferences(); hubPilotMenu.refresh(hubPilotMenuData(), true); } },
    navigation: { enabled: hubNavigationEnabled, toggle: () => { hubNavigationEnabled = !hubNavigationEnabled; saveHubPlayerPreferences(); notifySharedMenuPreferences(); hubPilotMenu.refresh(hubPilotMenuData(), true); } },
    preferences: {
      touchMode: hubTouchMode, touchLayout: matchMedia('(pointer: coarse)').matches || innerWidth <= 900,
      setTouchMode: (mode) => { hubTouchMode = persistTouchMode(mode); notifySharedMenuPreferences(); hubPilotMenu.refresh(hubPilotMenuData(), true); },
      graphicsQuality: hubGraphicsQuality,
      setGraphicsQuality: (quality) => { hubGraphicsQuality = quality; try { localStorage.setItem('airport-chaos-graphics-quality-v1', quality); } catch { /* optional */ } notifySharedMenuPreferences(); },
      mobileLayout: hubMobileLayout,
      setMobileControl: (control, placement) => { hubMobileLayout = persistMobileControlPlacement(control, hubMobileLayout, placement); notifySharedMenuPreferences(); },
      resetMobileLayout: () => { hubMobileLayout = resetPreferredMobileControlLayout(); notifySharedMenuPreferences(); return hubMobileLayout; },
    },
    flightPitch:{inverted:hubPitchInverted,touch:matchMedia('(pointer: coarse)').matches || innerWidth <= 900,setInverted:(inverted)=>{hubPitchInverted=inverted;persistPitchInverted(inverted);notifySharedMenuPreferences();hubPilotMenu.refresh(hubPilotMenuData(),true);}},
    restart: () => undefined,
    audio: {
      muted: hubAudioMuted,
      toggle: () => { hubAudioMuted = audioManager.toggleMuted(); saveHubPlayerPreferences(); notifySharedMenuPreferences(); hubPilotMenu.refresh(hubPilotMenuData(), true); },
      levels: hubAudioLevels,
      setLevel: (category, value) => {
        hubAudioLevels = { ...hubAudioLevels, [category]: Math.max(0, Math.min(100, Math.round(value))) };
        audioManager.setLevel(category, value);
        notifySharedMenuPreferences();
      },
    },
    haptics: { available: hapticsManager.isAvailable(), enabled: hapticsManager.isEnabled(), toggle: () => {
      hapticsManager.setEnabled(!hapticsManager.isEnabled());
      if (hapticsManager.isEnabled()) hapticsManager.emit('selection');
      hubPilotMenu.refresh(hubPilotMenuData(), true);
    } },
    guide: { enabled: false, open: () => undefined, replay: () => undefined },
  };
}

async function hubAccountRequest(path: 'logout' | 'pilot-name', payload: Record<string, string> = {}): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await apiFetch(apiUrl(`/api/auth/${path}`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json() as { error?: string; message?: string; account?: HubAccountStatus; profile?: RemoteGarageProfile };
    if (!response.ok) return { ok: false, message: result.error ?? 'ACCOUNT REQUEST FAILED' };
    if (result.account) {
      hubAccount = result.account;
      refreshAppHeaderIdentity();
    }
    if (result.profile) applyAuthoritativeHomeProfile(result.profile);
    if (path === 'logout') {
      skyTokenCatalogPilotId = undefined; nativeSkyTokenRecoveryPilotId = undefined; nativeSkyTokenPurchasePending = false;
      skyTokenCommerceEnabled = false; skyTokenOffers = [];
      garage.setTokenCommerce(false); skyTokenStore.close();
      clearPendingHubFly();
      hubAccountNotice = undefined;
      hubRewardedAdStatus = undefined;
      hubRewardedAdNotice = undefined;
      hubRewardedAdPhase = 'idle';
      rewardedAdPollGeneration += 1;
      await clearNativeProviderState();
    }
    hubPilotMenu.refresh(hubPilotMenuData(), true);
    return { ok: true, message: result.message ?? 'ACCOUNT UPDATED' };
  } catch { return { ok: false, message: 'ACCOUNT SERVICE UNAVAILABLE' }; }
}

async function hubProviderAccountRequest(provider: 'google' | 'apple', action: 'login'): Promise<{ ok: boolean; message: string }> {
  if (hubAccount.state === 'account') {
    return { ok: false, message: "You're already signed in. Log out first to use another account." };
  }
  try {
    if (nativeAuthPlatform) {
      const start = await apiFetch(apiUrl('/api/auth/native/start'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, action, referralCode: pendingReferralCode() }) });
      const challenge = await start.json() as Partial<NativeAuthChallenge> & { error?: string };
      if (!start.ok || challenge.provider !== provider || challenge.platform !== nativeAuthPlatform || !challenge.state || !challenge.nonce) return { ok: false, message: challenge.error ?? 'PROVIDER SIGN-IN UNAVAILABLE' };
      const credential = await acquireNativeCredential(challenge as NativeAuthChallenge);
      if (credential.cancelled) {
        if (hasPendingHubFly()) {
          clearPendingHubFly();
          hubPilotMenu.close(false);
          void showHome();
        }
        return { ok: true, message: 'SIGN-IN CANCELLED' };
      }
      const body = JSON.stringify({ provider, state: challenge.state, idToken: credential.idToken, ...(credential.displayName ? { displayName: credential.displayName } : {}) });
      credential.idToken = '';
      const complete = await apiFetch(apiUrl('/api/auth/native/complete'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      const result = await complete.json() as { error?: string; message?: string; account?: HubAccountStatus; profile?: RemoteGarageProfile };
      if (!complete.ok || !result.account || !result.profile) return { ok: false, message: result.error ?? 'PROVIDER SIGN-IN FAILED' };
      hubAccount = result.account; setPendingReferralCode(); applyAuthoritativeHomeProfile(result.profile);
      try { await refreshSkyTokenCatalog(); } catch { garage.setTokenStoreUnavailable(); }
      showAppHeader(entryState === 'AIRCRAFT' ? 'GARAGE' : undefined);
      hubPilotMenu.refresh(hubPilotMenuData(), true);
      resumePendingHubFly();
      const storeContext = pendingStoreContext();
      if (storeContext) {
        clearPendingStoreContext();
        gameStore.restoreContext(storeContext.category, storeContext.itemId);
        void openGameStore();
      }
      return { ok: true, message: result.message ?? 'ACCOUNT LOADED' };
    }
    const returnUrl = new URL(window.location.href);
    const response = await apiFetch(apiUrl('/api/auth/oauth/start'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, action, returnTo: returnUrl.toString(), referralCode: pendingReferralCode() }) });
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
    const result = await response.json() as { account?: HubAccountStatus; profile?: RemoteGarageProfile; serverNow?: number };
    if (!response.ok) return;
    if (result.account) {
      hubAccount = result.account;
      refreshAppHeaderIdentity();
    }
    if (result.profile) applyAuthoritativeHomeProfile(result.profile);
    if (Number.isFinite(result.serverNow)) hubServerNow = result.serverNow!;
    try { await refreshSkyTokenCatalog(); } catch { garage.setTokenStoreUnavailable(); }
    refreshAppHeaderIdentity();
    await refreshRewardedAdStatus();
    homeHangar.update(homeHangarData());
    if (hubPilotMenu.isOpen()) hubPilotMenu.refresh(hubPilotMenuData());
  } catch { /* cached authoritative profile keeps navigation usable */ }
}

async function refreshRewardedAdStatus(): Promise<void> {
  if (hubAccount.state !== 'account' || !rewardedAdProvider) {
    hubRewardedAdStatus = undefined;
    return;
  }
  try {
    const response = await apiFetch(apiUrl('/api/rewarded-ads/status'), { cache: 'no-store' });
    const result = await response.json() as { rewardedAds?: RewardedAdStatus };
    hubRewardedAdStatus = response.ok && result.rewardedAds?.supported ? result.rewardedAds : undefined;
  } catch { hubRewardedAdStatus = undefined; }
}

async function recordRewardedAdEvent(attemptId: string, event: 'started' | 'qualified' | 'closed' | 'failed'): Promise<void> {
  const response = await apiFetch(apiUrl('/api/rewarded-ads/event'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attemptId, event }),
  });
  const result = await response.json() as { rewardedAds?: RewardedAdStatus };
  if (result.rewardedAds) hubRewardedAdStatus = result.rewardedAds;
}

async function waitForRewardedAdVerification(attemptId: string): Promise<void> {
  const generation = ++rewardedAdPollGeneration;
  for (let check = 0; check < 15; check += 1) {
    if (generation !== rewardedAdPollGeneration || !hubPilotMenu.isSectionOpen('REWARDS')) return;
    if (check > 0) await new Promise(resolve => window.setTimeout(resolve, 2_000));
    const url = apiUrl('/api/rewarded-ads/attempt-status'); url.searchParams.set('attemptId', attemptId);
    try {
      const response = await apiFetch(url, { cache: 'no-store' });
      const result = await response.json() as { attemptStatus?: RewardedAdAttemptStatus; status?: RewardedAdStatus; profile?: RemoteGarageProfile };
      if (!response.ok || !result.attemptStatus || !result.status) continue;
      hubRewardedAdStatus = result.status;
      if (result.attemptStatus === 'REWARDED') {
        if (result.profile) applyAuthoritativeHomeProfile(result.profile);
        hubRewardedAdPhase = 'idle';
        hubRewardedAdNotice = `+${result.status.rewardCredits.toLocaleString()} CREDITS`;
        audioManager.playReward();
        hapticsManager.emit('rewardSuccess', `ad:${attemptId}`);
        homeHangar.update(homeHangarData());
        hubPilotMenu.refresh(hubPilotMenuData(), true);
        return;
      }
      if (['FAILED', 'EXPIRED', 'CLOSED_WITHOUT_REWARD'].includes(result.attemptStatus)) {
        hubRewardedAdPhase = 'idle';
        hubRewardedAdNotice = result.attemptStatus === 'CLOSED_WITHOUT_REWARD' ? 'Finish the video to earn Credits.' : 'Unable to verify reward. Please try again.';
        hubPilotMenu.refresh(hubPilotMenuData(), true);
        return;
      }
    } catch { /* keep this bounded verification check recoverable */ }
  }
  if (generation === rewardedAdPollGeneration) {
    hubRewardedAdPhase = 'idle';
    hubRewardedAdNotice = "We're still verifying your reward. Your Credits will update after verification.";
    hubPilotMenu.refresh(hubPilotMenuData(), true);
  }
}

async function watchRewardedAd(): Promise<void> {
  if (!rewardedAdProvider || hubAccount.state !== 'account' || hubRewardedAdPhase !== 'idle') return;
  let attempt: RewardedAdAttempt | undefined;
  hubRewardedAdPhase = 'loading'; hubRewardedAdNotice = undefined;
  hubPilotMenu.refresh(hubPilotMenuData(), true);
  try {
    const response = await apiFetch(apiUrl('/api/rewarded-ads/attempt'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    const result = await response.json() as { error?: string; attempt?: RewardedAdAttempt; rewardedAds?: RewardedAdStatus };
    if (result.rewardedAds) hubRewardedAdStatus = result.rewardedAds;
    if (!response.ok || !result.attempt) throw new Error(result.error ?? 'Unable to start video. Please try again.');
    attempt = result.attempt;
    await rewardedAdProvider.load(attempt);
    await recordRewardedAdEvent(attempt.attemptId, 'started');
    hubRewardedAdPhase = 'playing';
    audioManager.setMenuMusicDesired(false);
    const shown = await rewardedAdProvider.show();
    audioManager.setMenuMusicDesired(true);
    if (shown.state === 'qualified') {
      await recordRewardedAdEvent(attempt.attemptId, 'qualified');
      hubRewardedAdPhase = 'verifying'; hubRewardedAdNotice = "We're verifying your reward.";
      hubPilotMenu.refresh(hubPilotMenuData(), true);
      await waitForRewardedAdVerification(attempt.attemptId);
      return;
    }
    await recordRewardedAdEvent(attempt.attemptId, shown.state === 'closed' ? 'closed' : 'failed');
    hubRewardedAdPhase = 'idle';
    hubRewardedAdNotice = shown.state === 'closed' ? 'Finish the video to earn Credits.' : 'Unable to start video. Please try again.';
  } catch (error) {
    audioManager.setMenuMusicDesired(true);
    if (attempt) await recordRewardedAdEvent(attempt.attemptId, 'failed').catch(() => undefined);
    hubRewardedAdPhase = 'idle';
    if (error instanceof Error && error.message.includes('No video')) recordProductIntent('rewarded_ad_no_fill');
    hubRewardedAdNotice = error instanceof Error && error.message.includes('No video')
      ? 'No video available right now. Try again later.' : error instanceof Error ? error.message : 'Unable to start video. Please try again.';
  }
  hubPilotMenu.refresh(hubPilotMenuData(), true);
}

async function openHubRewards(): Promise<void> {
  if (hubAccount.state !== 'account') {
    hubAccountNotice = { ok: true, message: 'SIGN IN TO CLAIM DAILY REWARDS' };
    await openHubPilotMenu('PROFILE', true, !missionJourneyReturnPending);
    return;
  }
  recordProductIntent('rewards_viewed');
  await openHubPilotMenu('REWARDS', true, !missionJourneyReturnPending);
  if (hubRewardedAdStatus?.supported) recordProductIntent('rewarded_ad_offer_viewed');
}

async function claimDailyReward(): Promise<{ ok: boolean; message: string }> {
  if (hubAccount.state !== 'account') return { ok: false, message: 'Sign in to claim Daily Rewards.' };
  try {
    const response = await apiFetch(apiUrl('/api/daily-reward'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    const result = await response.json() as { error?: string; credits?: number; profile?: RemoteGarageProfile; dailyReward?: RemoteGarageProfile['dailyReward']; serverNow?: number };
    if (Number.isFinite(result.serverNow)) hubServerNow = result.serverNow!;
    if (!response.ok) {
      if (result.dailyReward && authoritativeHomeProfile) authoritativeHomeProfile = { ...authoritativeHomeProfile, dailyReward: result.dailyReward };
      hubRewardNotice = result.error ?? 'Unable to claim reward. Please try again.';
      hubPilotMenu.refresh(hubPilotMenuData(), true);
      homeHangar.update(homeHangarData());
      refreshAppHeaderIdentity();
      return { ok: false, message: hubRewardNotice };
    }
    if (!result.profile || !Number.isFinite(result.credits)) return { ok: false, message: 'Unable to claim reward. Please try again.' };
    applyAuthoritativeHomeProfile(result.profile);
    hubRewardNotice = `+${result.credits!.toLocaleString()} CREDITS`;
    hapticsManager.emit('rewardSuccess', `daily:${result.profile.dailyReward?.lastClaimedAt ?? result.serverNow ?? hubServerNow}`);
    homeHangar.update(homeHangarData());
    hubPilotMenu.refresh(hubPilotMenuData(), true);
    return { ok: true, message: hubRewardNotice };
  } catch {
    return { ok: false, message: 'Unable to claim reward. Please try again.' };
  }
}

function hasPendingHubFly(): boolean {
  if (hubFlyIntent) return true;
  try { return sessionStorage.getItem(PENDING_FLY_STORAGE_KEY) === '1'; }
  catch { return false; }
}

function rememberPendingHubFly(): void {
  hubFlyIntent = true;
  try { sessionStorage.setItem(PENDING_FLY_STORAGE_KEY, '1'); } catch { /* in-memory intent still works */ }
}

function clearPendingHubFly(): void {
  hubFlyIntent = false;
  try { sessionStorage.removeItem(PENDING_FLY_STORAGE_KEY); } catch { /* in-memory intent is already cleared */ }
}

function resumePendingHubFly(): boolean {
  if (hubAccount.state !== 'account' || !hasPendingHubFly()) return false;
  clearPendingHubFly();
  hubAccountNotice = undefined;
  hubPilotMenu.close(false);
  showSelector('', { preferDallas: authoritativeHomeProfile?.tutorial?.status === 'completed' });
  return true;
}

function continueHubAsGuest(): void {
  hubAccountNotice = undefined;
  if (!hasPendingHubFly()) {
    hubPilotMenu.close();
    return;
  }
  clearPendingHubFly();
  hubPilotMenu.close(false);
  showSelector('', { preferDallas: authoritativeHomeProfile?.tutorial?.status === 'completed' });
}

async function requestHubFly(): Promise<void> {
  if (hubFlyGateActive || (hasPendingHubFly() && hubPilotMenu.isOpen())) return;
  hubFlyGateActive = true;
  try {
    await refreshHubPilotData();
    if (hubAccount.state === 'account') {
      clearPendingHubFly();
      showSelector('', { preferDallas: authoritativeHomeProfile?.tutorial?.status === 'completed' });
      return;
    }
    rememberPendingHubFly();
    hubAccountNotice = { ok: true, message: 'CHOOSE HOW TO PLAY' };
    await openHubPilotMenu('PROFILE', false);
  } finally {
    hubFlyGateActive = false;
  }
}

async function openHubPilotMenu(section: PilotMenuSection, refresh = true, returnToHub = false): Promise<void> {
  const hubSection = section === 'MISSIONS' ? 'PROFILE' : section;
  if (returnToHub) hubPilotMenuReturnState = 'HANGAR';
  else if (!hubPilotMenu.isOpen()) hubPilotMenuReturnState = entryState === 'CITY_SELECTION' ? 'CITY_SELECTION' : entryState === 'MISSION_JOURNEY' ? 'MISSION_JOURNEY' : entryState === 'STORE' ? 'STORE' : entryState === 'AIRCRAFT' && missionJourneyReturnPending ? garageReturnState === 'STORE' ? 'STORE' : 'MISSION_JOURNEY' : 'HANGAR';
  if (entryState === 'MISSION_JOURNEY' || (missionJourneyReturnPending && entryState === 'STORE')) window.history.pushState({ airportChaosEntryView: 'PILOT_MENU' }, '', window.location.href);
  else if (entryState === 'AIRCRAFT' && missionJourneyReturnPending) window.history.replaceState({ airportChaosEntryView: 'PILOT_MENU' }, '', window.location.href);
  entryState = 'PILOT_MENU';
  syncHubMenuPreferences();
  if (garage.isOpen()) garage.close();
  homeHangar.hide();
  gameStore.hide();
  garage.hideShowcase();
  citySelector.hidden = true;
  missionJourney.hide();
  showAppHeader(hubSection === 'REWARDS' ? 'REWARDS' : hubSection === 'PROFILE' ? 'PROFILE' : undefined);
  hubPilotMenu.open(hubPilotMenuData(), hubSection);
  if (refresh) await refreshHubPilotData();
}

const garage = new AircraftGarage(garageOverlay, async (selectedAircraft) => {
  const previouslySelected = garageProfile.selectedAircraft;
  const url = apiUrl('/api/profile');
  url.searchParams.set('pilotId', garageIdentity.pilotId); url.searchParams.set('pilotName', garageIdentity.displayName);
  const response = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ equipAircraft: selectedAircraft }) });
  if (!response.ok) return;
  const profile = await response.json() as RemoteGarageProfile;
  applyAuthoritativeHomeProfile(profile);
  if (profile.selectedAircraft !== previouslySelected) hapticsManager.emit('confirmation');
  try { localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(PLAYER_STORAGE_KEY) ?? '{}'), version: 1, pilotId: garageIdentity.pilotId, displayName: garageIdentity.displayName, credits: garageProfile.credits, selectedAircraft: garageProfile.selectedAircraft })); } catch { /* server profile remains authoritative */ }
  if (garage.isOpen()) garage.open(garageProfile);
}, undefined, () => {
  if (entryState === 'AIRCRAFT') {
    if (garageReturnState === 'CITY_SELECTION') showSelector();
    else if (garageReturnState === 'MISSION_JOURNEY') {
      if (window.history.state?.airportChaosEntryView === 'AIRCRAFT') window.history.back();
      else showMissionJourney(false);
    }
    else if (garageReturnState === 'STORE') {
      if (window.history.state?.airportChaosStoreView === 'GARAGE') window.history.back();
      else void openGameStore(false);
    }
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
    hapticsManager.emit('rewardSuccess', `aircraft:${aircraftType}`);
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
    hapticsManager.emit('rewardSuccess', 'aircraft:fighter');
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
  recordProductIntent('firehawk_purchase_clicked');
  if (nativePurchaseProvider) {
    try {
      const result = await purchaseNativeFirehawk();
      if (result.state === 'cancelled') { garage.showActionResult('PURCHASE CANCELLED'); return; }
      if (result.state === 'pending') { garage.showActionResult('PURCHASE PENDING'); return; }
      garageProfile = normalizeGarageProfile(result.profile as GarageProfile); garage.updateProfile(garageProfile); refreshAppHeaderIdentity();
      garage.showActionResult('FIREHAWK UNLOCKED · PURCHASE CONFIRMED');
      audioManager.playPurchaseSuccess();
      hapticsManager.emit('rewardSuccess', 'aircraft:fighter');
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
}, (id, currency) => { void changeGarageCosmetic('purchaseCosmetic', id, currency); }, id => { void changeGarageCosmetic('equipCosmetic', id); }, async type => {
  try {
    const response = await apiFetch(apiUrl('/api/profile'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purchaseAircraftWithSkyTokens: type }) });
    const result = await response.json() as RemoteGarageProfile & { error?: string };
    if (!response.ok) { garage.showActionResult(result.error ?? 'UNLOCK FAILED'); return; }
    applyAuthoritativeHomeProfile(result); garage.updateProfile(garageProfile);
    garage.showActionResult(`${aircraftDisplayName(type)} UNLOCKED`); audioManager.playPurchaseSuccess(); hapticsManager.emit('rewardSuccess', `aircraft:${type}`);
  } catch { garage.showActionResult('SERVER UNAVAILABLE — SKY TOKENS NOT SPENT'); }
}, missing => { void openSkyTokenStore(missing); });

if (nativePurchaseProvider) {
  garage.setNativeStorePrice();
  void loadNativeFirehawkOffer().then(offer => garage.setNativeStorePrice(offer?.localizedPrice)).catch(() => undefined);
}

const gameStore = new GameStore(gameStoreElement, {
  close: closeGameStore,
  unlock: unlockStoreItem,
  trial: startStoreFirehawkTrial,
  getTokens: missing => { recordProductIntent('store_get_tokens_opened'); void openSkyTokenStore(missing); },
  viewGarage: item => { recordProductIntent('store_view_in_garage', { itemId: item.id, itemType: item.kind }); void openStoreItemInGarage(item); },
  login: () => { requestStoreLogin(); },
  retry: () => { void openGameStore(false); },
});

garageOverlay.addEventListener('click', event => {
  if (event.target === garageOverlay && entryState === 'AIRCRAFT') {
    if (garageReturnState === 'MISSION_JOURNEY' || garageReturnState === 'STORE') garage.close();
    else void showHome();
  }
});
pilotMenuOverlay.addEventListener('click', event => {
  if (event.target === pilotMenuOverlay && entryState === 'PILOT_MENU') {
    if (hubPilotMenuReturnState === 'MISSION_JOURNEY' || hubPilotMenuReturnState === 'STORE') hubPilotMenu.close();
    else void showHome();
  }
});
gameStoreElement.addEventListener('click', event => {
  if (entryState !== 'STORE' || !(event.target instanceof Element)) return;
  if (event.target.matches('.game-store, .store-frame, .store-content, .store-grid')) closeGameStore();
});

function closeGameStore(): void {
  if (missionJourneyReturnPending) {
    const storeView = window.history.state?.airportChaosStoreView;
    gameStore.close();
    if (storeView === 'DETAIL') window.history.go(-2);
    else if (storeView === 'STORE') window.history.back();
    else showMissionJourney(false);
    return;
  }
  if (window.history.state?.airportChaosStoreView) window.history.replaceState(null, '', window.location.href);
  gameStore.close(); void showHome();
}

async function openGameStore(recordOpen = true): Promise<void> {
  if (entryState === 'FLIGHT' || entryState === 'TUTORIAL') return;
  if (recordOpen && entryState === 'STORE' && gameStore.isOpen()) return;
  const fromState = entryState;
  const wasOpen = gameStore.isOpen();
  entryState = 'STORE';
  if (recordOpen && fromState !== 'STORE') {
    if (window.history.state?.airportChaosStoreView || (missionJourneyReturnPending && fromState !== 'MISSION_JOURNEY' && window.history.state?.airportChaosEntryView)) window.history.replaceState({ airportChaosStoreView: 'STORE' }, '', window.location.href);
    else window.history.pushState({ airportChaosStoreView: 'STORE' }, '', window.location.href);
  }
  if (hubPilotMenu.isOpen()) hubPilotMenu.close(false);
  if (garage.isOpen()) garage.close();
  homeHangar.hide(); garage.hideShowcase(); citySelector.hidden = true; missionJourney.hide();
  showAppHeader('STORE');
  gameStore.setBackLabel(missionJourneyReturnPending ? 'BACK TO MISSIONS' : 'BACK TO HUB');
  if (recordOpen || !wasOpen) gameStore.open(hubAccount.state === 'account' ? authoritativeHomeProfile ? garageProfile : undefined : undefined, hubAccount.state === 'account', hubAccount.state === 'account');
  try {
    if (hubAccount.state === 'account') {
      const profile = await loadGarageProfile();
      if (entryState === 'STORE') gameStore.update(profile, true);
    } else gameStore.update(undefined, false);
  } catch { if (entryState === 'STORE') gameStore.fail('PROFILE UNAVAILABLE'); }
}

async function openStoreItemInGarage(item: StoreItem): Promise<void> {
  window.history.pushState({ airportChaosStoreView: 'GARAGE' }, '', window.location.href);
  gameStore.hide();
  await openStartGarage('STORE');
  if (entryState !== 'AIRCRAFT') return;
  if (item.kind === 'paint') garage.focusCosmetic(item.id);
  else garage.focusAircraft(item.aircraftType);
}

window.addEventListener('popstate', () => {
  if (entryState === 'CITY_SELECTION' && citySelector.dataset.view === 'time') {
    if (window.history.state?.airportChaosEntryView === 'MISSION_JOURNEY') showMissionJourney(false);
    else showSelector();
    return;
  }
  if (entryState === 'CITY_SELECTION' && citySelector.dataset.view === 'cities' && window.history.state?.airportChaosEntryView !== 'CITY_SELECTION') {
    void showHome();
    return;
  }
  if (entryState === 'MISSION_JOURNEY' && missionJourney.isPanelOpen && window.history.state?.airportChaosEntryView === 'MISSION_JOURNEY' && !window.history.state?.missionDetailsOpen) {
    missionJourney.closePanel();
    return;
  }
  if (missionJourneyReturnPending && window.history.state?.airportChaosEntryView === 'MISSION_JOURNEY') {
    showMissionJourney(false);
    return;
  }
  if (entryState === 'MISSION_JOURNEY' && (window.history.state?.airportChaosEntryView === 'CITY_SELECTION' || !window.history.state?.airportChaosEntryView)) {
    showSelector();
    return;
  }
  if (entryState === 'PILOT_MENU' && hubPilotMenuReturnState === 'STORE' && window.history.state?.airportChaosStoreView === 'STORE') {
    hubPilotMenu.close(false);
    void openGameStore(false);
    return;
  }
  if (entryState === 'AIRCRAFT' && garageReturnState === 'STORE') {
    if (garage.isOpen()) garage.close();
    else void openGameStore(false);
  } else if (entryState === 'STORE') {
    if (window.history.state?.airportChaosStoreView === 'STORE') gameStore.dismissDetailFromHistory();
    else if (!window.history.state?.airportChaosStoreView) { gameStore.close(); if (missionJourneyReturnPending) showMissionJourney(false); else void showHome(); }
  }
});

function requestStoreLogin(): void {
  try { sessionStorage.setItem(PENDING_STORE_STORAGE_KEY, JSON.stringify(gameStore.getContext())); } catch { /* Native sign-in still returns within this page. */ }
  void openHubPilotMenu('PROFILE');
}

function pendingStoreContext(): { category: StoreCategory; itemId?: string } | undefined {
  try {
    const raw = sessionStorage.getItem(PENDING_STORE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { category?: StoreCategory; itemId?: string };
    if (parsed.category && ['FEATURED', 'AIRCRAFT', 'PAINTS', 'EFFECTS', 'CITIES'].includes(parsed.category)) return { category: parsed.category, itemId: parsed.itemId };
  } catch { /* Optional return context. */ }
}

function clearPendingStoreContext(): void { try { sessionStorage.removeItem(PENDING_STORE_STORAGE_KEY); } catch { /* Optional. */ } }

async function unlockStoreItem(item: StoreItem, currency: 'CREDITS' | 'SKY_TOKENS'): Promise<{ ok: boolean; message: string }> {
  if (hubAccount.state !== 'account') return { ok: false, message: 'SIGN IN TO UNLOCK' };
  const payload = item.kind === 'paint'
    ? { purchaseCosmetic: item.id, cosmeticCurrency: currency }
    : currency === 'CREDITS' ? { purchaseAircraft: item.aircraftType } : { purchaseAircraftWithSkyTokens: item.aircraftType };
  try {
    const response = await apiFetch(apiUrl('/api/profile'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, storeSource: true }) });
    const result = await response.json() as RemoteGarageProfile & { error?: string };
    if (!response.ok) return { ok: false, message: result.error ?? 'UNLOCK FAILED' };
    applyAuthoritativeHomeProfile(result);
    garage.updateProfile(garageProfile);
    gameStore.update(garageProfile, true);
    audioManager.playPurchaseSuccess();
    hapticsManager.emit('rewardSuccess', `store:${item.id}`);
    return { ok: true, message: `${item.name} UNLOCKED · OPEN AIRCRAFTS TO EQUIP` };
  } catch { return { ok: false, message: 'SERVER UNAVAILABLE — NO CURRENCY SPENT' }; }
}

async function startStoreFirehawkTrial(): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await apiFetch(apiUrl('/api/profile'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startFighterTrial: true }) });
    const result = await response.json() as RemoteGarageProfile & { error?: string };
    if (!response.ok) return { ok: false, message: result.error ?? 'TEST FLIGHT UNAVAILABLE' };
    applyAuthoritativeHomeProfile(result); garage.updateProfile(garageProfile); gameStore.update(garageProfile, true);
    return { ok: true, message: 'FIREHAWK TEST FLIGHT READY · ENTER A CITY TO BEGIN' };
  } catch { return { ok: false, message: 'SERVER UNAVAILABLE — TEST FLIGHT NOT STARTED' }; }
}

async function changeGarageCosmetic(action: 'purchaseCosmetic' | 'equipCosmetic', id: string, currency: 'CREDITS' | 'SKY_TOKENS' = 'CREDITS'): Promise<void> {
  try {
    const url = apiUrl('/api/profile');
    url.searchParams.set('pilotId', garageIdentity.pilotId);
    const response = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [action]: id, ...(action === 'purchaseCosmetic' ? { cosmeticCurrency: currency } : {}) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'COSMETIC UPDATE FAILED');
    applyAuthoritativeHomeProfile(result as RemoteGarageProfile); garage.updateProfile(garageProfile);
    garage.showActionResult(action === 'equipCosmetic' ? 'COSMETIC EQUIPPED' : 'COSMETIC OWNED — SELECT TO EQUIP');
    if (action === 'purchaseCosmetic') { audioManager.playPurchaseSuccess(); hapticsManager.emit('rewardSuccess', `cosmetic:${id}`); }
    else hapticsManager.emit('confirmation');
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
    hapticsManager.emit('rewardSuccess', `checkout:${result.reference ?? 'firehawk'}`);
  } else garage.showActionResult('PAYMENT RECEIVED — VERIFYING · YOUR UNLOCK WILL APPEAR SHORTLY');
  const clean = new URL(window.location.href); clean.searchParams.delete('checkout'); clean.searchParams.delete('session_id');
  window.history.replaceState(null, '', `${clean.pathname}${clean.search}${clean.hash}`);
}).catch(() => garage.showActionResult('PURCHASE VERIFICATION UNAVAILABLE'));

async function openStartGarage(returnState: 'HANGAR' | 'CITY_SELECTION' | 'MISSION_JOURNEY' | 'STORE'): Promise<void> {
  if (entryState === 'AIRCRAFT') return;
  if (returnState === 'MISSION_JOURNEY') {
    if (entryState === 'MISSION_JOURNEY') window.history.pushState({ airportChaosEntryView: 'AIRCRAFT' }, '', window.location.href);
    else if (window.history.state?.airportChaosEntryView === 'PILOT_MENU') window.history.replaceState({ airportChaosEntryView: 'AIRCRAFT' }, '', window.location.href);
  } else if (returnState === 'STORE' && window.history.state?.airportChaosStoreView === 'STORE') {
    window.history.pushState({ airportChaosStoreView: 'GARAGE' }, '', window.location.href);
  } else if (returnState === 'STORE' && window.history.state?.airportChaosEntryView === 'PILOT_MENU') {
    window.history.replaceState({ airportChaosStoreView: 'GARAGE' }, '', window.location.href);
  }
  recordProductIntent('garage_opened');
  recordProductIntent('aircraft_viewed', { aircraftType: garageProfile.selectedAircraft });
  entryState = 'AIRCRAFT';
  garageReturnState = returnState;
  garageOverlay.classList.toggle('return-to-store', returnState === 'STORE');
  if (hubPilotMenu.isOpen()) hubPilotMenu.close(false);
  homeHangar.hide();
  gameStore.hide();
  garage.hideShowcase();
  citySelector.hidden = true;
  missionJourney.hide();
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

let hubViewRecorded = false;
function showHome(): Promise<void> {
  if (!hubViewRecorded || entryState !== 'HANGAR') { recordProductIntent('hub_viewed'); hubViewRecorded = true; }
  if (window.history.state?.airportChaosStoreView || window.history.state?.airportChaosEntryView) window.history.replaceState(null, '', window.location.href);
  audioManager.setMenuMusicDesired(true);
  entryState = 'HANGAR';
  missionJourneyReturnPending = false;
  garageReturnState = 'HANGAR';
  garageOpenRequest += 1;
  if (hubPilotMenu.isOpen()) hubPilotMenu.close(false);
  if (garage.isOpen()) garage.close();
  gameStore.close();
  citySelector.hidden = true;
  missionJourney.hide();
  homeHangar.show(homeHangarData());
  showAppHeader(undefined);
  return garage.showcase(homeHangar.stage, garageProfile);
}

function showSelector(message = '', options: { preferDallas?: boolean } = {}): void {
  if (entryState === 'HANGAR' && window.history.state?.airportChaosEntryView !== 'CITY_SELECTION') {
    window.history.pushState({ airportChaosEntryView: 'CITY_SELECTION' }, '', window.location.href);
  }
  if (window.history.state?.airportChaosEntryView === 'MISSION_JOURNEY') window.history.replaceState(null, '', window.location.href);
  audioManager.setMenuMusicDesired(true);
  entryState = 'CITY_SELECTION';
  missionJourneyReturnPending = false;
  if (hubPilotMenu.isOpen()) hubPilotMenu.close(false);
  homeHangar.hide();
  gameStore.hide();
  garage.hideShowcase();
  missionJourney.hide();
  citySelector.dataset.view = 'cities';
  garage.close();
  citySelector.hidden = false;
  showAppHeader(undefined);
  cityOptions.hidden = false;
  timeOptions.hidden = true;
  cityBack.textContent = 'BACK TO PILOT HUB';
  citySelectTitle.textContent = 'CITY JOURNEY';
  citySelectDescription.textContent = 'Choose your city.';
  cityJourneyHint.classList.remove('is-dismissed');
  cityJourneyIndex = preferredCityJourneyIndex(options.preferDallas === true);
  renderCityJourney();
  citySelectionError.textContent = message;
  citySelectionError.hidden = !message;
}

function showMissionJourney(pushHistory = true, refreshProgress = true): void {
  abandonPendingJourneyLaunch();
  if (pushHistory && window.history.state?.airportChaosEntryView !== 'MISSION_JOURNEY') {
    window.history.pushState({ airportChaosEntryView: 'MISSION_JOURNEY' }, '', window.location.href);
  }
  audioManager.setMenuMusicDesired(true);
  entryState = 'MISSION_JOURNEY';
  missionJourneyReturnPending = true;
  if (hubPilotMenu.isOpen()) hubPilotMenu.close(false);
  if (garage.isOpen()) garage.close();
  gameStore.close();
  homeHangar.hide();
  garage.hideShowcase();
  citySelector.hidden = true;
  missionJourney.show(window.history.state?.missionDetailsOpen === true);
  if (refreshProgress) void refreshJourneyProgress();
  showAppHeader(undefined);
}

function leaveMissionJourney(): void {
  if (missionJourney.isPanelOpen && window.history.state?.missionDetailsOpen) {
    window.history.go(-2);
    return;
  }
  if (window.history.state?.airportChaosEntryView === 'MISSION_JOURNEY') window.history.back();
  else showSelector();
}

function openMissionDetails(): void {
  if (entryState === 'MISSION_JOURNEY') window.history.pushState({ airportChaosEntryView: 'MISSION_JOURNEY', missionDetailsOpen: true }, '', window.location.href);
}

function closeMissionDetails(): void {
  if (window.history.state?.missionDetailsOpen) window.history.back();
  else missionJourney.closePanel();
}

function openMissionFreeFlight(): void {
  abandonPendingJourneyLaunch();
  const dallas = cities.find(city => city.id === 'dallas' && city.status === 'available');
  if (!dallas) return;
  missionJourneyReturnPending = false;
  missionJourney.hide();
  entryState = 'CITY_SELECTION';
  citySelector.hidden = false;
  showTimeSelection(dallas, 'MISSION_JOURNEY');
  showAppHeader(undefined);
}

registerUiBackLayer({
  id: 'mission-journey-details',
  priority: uiBackPriority.menu,
  isActive: () => missionJourney.isOpen && missionJourney.isPanelOpen,
  close: closeMissionDetails,
});

registerUiBackLayer({
  id: 'mission-journey',
  priority: uiBackPriority.surface,
  isActive: () => missionJourney.isOpen,
  close: leaveMissionJourney,
});

function returnFromCitySelection(): void {
  if (citySelector.dataset.view === 'time') {
    returnFromTimeSelection();
    return;
  }
  if (gameRoot.hidden) {
    if (window.history.state?.airportChaosEntryView === 'CITY_SELECTION') window.history.back();
    else void showHome();
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
  containsTarget: (target) => target instanceof Node && (Boolean(citySelector.querySelector('.city-select-card')?.contains(target)) || cityBack.contains(target)),
});

async function startTrainingFromHub(): Promise<void> {
  if (entryState === 'TUTORIAL' || entryState === 'FLIGHT') return;
  const city = cities.find((candidate) => candidate.id === 'milwaukee' && candidate.status === 'available');
  if (!city || !cityCapabilities(city.id)?.tutorialEnabled) return;
  recordProductIntent('city_selected', { cityId: city.id });
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

async function enterCity(city: CityDefinition, timePreset: 'day' | 'dusk' = 'day', trainingSession = false): Promise<void> {
  if (city.status !== 'available' || !city.loadWorld) return;
  missionJourneyReturnPending = false;
  missionJourney.hide();
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
  citySelectionError.hidden = true;
  const url = new URL(window.location.href);
  url.searchParams.set(CITY_QUERY_PARAM, city.id);
  url.searchParams.set('time', city.timePresets.includes(timePreset) ? timePreset : 'day');
  if (trainingSession) url.searchParams.set('training', '1');
  else url.searchParams.delete('training');
  if (city.id === 'dallas' && journeyAttemptId) url.searchParams.set('journeyAttempt', journeyAttemptId);
  else url.searchParams.delete('journeyAttempt');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);

  await city.loadWorld();
  await import('./main');
  notifySharedMenuPreferences();
  gameRoot.hidden = false;
  citySelector.hidden = true;
}

function chooseCity(city: CityDefinition): void {
  if (city.status !== 'available') return;
  recordProductIntent('city_selected', { cityId: city.id });
  if (city.id === 'dallas') {
    showMissionJourney();
    return;
  }
  if (city.timePresets.length === 1) {
    const preset = city.timePresets[0]!;
    try { localStorage.setItem(`airport-chaos-time-${city.id}`, preset); } catch { /* launch with the configured time */ }
    void enterCity(city, preset).catch((error: unknown) => {
      console.error('[city-entry] Unable to initialize gameplay.', error);
      showSelector('Unable to load this city.');
    });
    return;
  }
  showTimeSelection(city);
}

function showTimeSelection(city: CityDefinition, returnTo: 'CITY_SELECTION' | 'MISSION_JOURNEY' = 'CITY_SELECTION'): void {
  timeSelectionReturnState = returnTo;
  if (window.history.state?.airportChaosEntryView !== 'TIME_SELECTION') {
    window.history.pushState({ airportChaosEntryView: 'TIME_SELECTION' }, '', window.location.href);
  }
  citySelector.dataset.view = 'time';
  cityOptions.hidden = true;
  timeOptions.replaceChildren();
  timeOptions.hidden = false;
  cityBack.textContent = returnTo === 'MISSION_JOURNEY' ? 'BACK TO MISSIONS' : 'BACK TO CITIES';
  citySelectTitle.textContent = 'CHOOSE TIME';
  citySelectDescription.textContent = `${city.displayName} · Day and Dusk share the same pilots and city.`;
  let preferred = 'dusk';
  try { preferred = localStorage.getItem(`airport-chaos-time-${city.id}`) ?? 'dusk'; } catch { /* default dusk */ }
  for (const preset of city.timePresets) {
    const option = document.createElement('article');
    option.className = 'city-option city-time-option';
    option.classList.add(`city-${city.id}`);
    option.classList.add(`city-time-${preset}`);
    if (preset === preferred) option.classList.add('is-preferred');
    const art = document.createElement('div');
    art.className = 'city-time-art';
    art.setAttribute('aria-hidden', 'true');
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
      hapticsManager.emit('selection');
      try { localStorage.setItem(`airport-chaos-time-${city.id}`, preset); } catch { /* no persistence available */ }
      void enterCity(city, preset).catch((error: unknown) => {
        console.error('[city-entry] Unable to initialize gameplay.', error);
        showSelector('Unable to load this city.');
      });
    });
    copy.append(label, description);
    option.append(art, copy, button);
    timeOptions.append(option);
  }
}
function returnFromTimeSelection(): void {
  if (window.history.state?.airportChaosEntryView === 'TIME_SELECTION') window.history.back();
  else if (timeSelectionReturnState === 'MISSION_JOURNEY') showMissionJourney(false);
  else showSelector();
}
cityBack.addEventListener('click', returnFromCitySelection);
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
  }).then(() => refreshHubPilotData()).finally(() => {
    profileReady = true;
    reportStartupProgress();
  });
  await Promise.all([brandTask, profileTask]);
  homeHangar.update(homeHangarData());
  const url = new URL(window.location.href);
  const authResult = url.searchParams.get('auth');
  const invitePathCode = /^\/invite\/([^/]+)\/?$/.exec(url.pathname)?.[1];
  const incomingInviteCode = invitePathCode ?? url.searchParams.get('ref');
  let inviteLanding = false;
  if (authResult === 'success' || hubAccount.state === 'account') setPendingReferralCode();
  else if (incomingInviteCode) {
    inviteLanding = true;
    if (referralCodePattern.test(incomingInviteCode)) {
      try {
        const lookup = await apiFetch(apiUrl(`/api/referrals/validate?code=${encodeURIComponent(incomingInviteCode)}`));
        const result = await lookup.json() as { valid?: boolean };
        if (lookup.ok && result.valid) {
          setPendingReferralCode(incomingInviteCode.toUpperCase());
          hubAccountNotice = { ok: true, message: 'Create a new pilot account to use this invite.' };
        } else {
          setPendingReferralCode();
          hubAccountNotice = { ok: false, message: 'This invite is no longer valid.' };
        }
      } catch { hubAccountNotice = { ok: false, message: 'Unable to load invite. Please try again.' }; }
    } else {
      setPendingReferralCode();
      hubAccountNotice = { ok: false, message: 'This invite is no longer valid.' };
    }
  }
  const directCityEntry = url.searchParams.get('entry') === 'city';
  const directJourneyEntry = url.searchParams.get('entry') === 'journey';
  const journeyReceipt = url.searchParams.get('journeyReceipt');
  if (authResult || directCityEntry || directJourneyEntry) {
    url.searchParams.delete('auth');
    url.searchParams.delete('provider');
    url.searchParams.delete('linked');
    url.searchParams.delete('entry');
    url.searchParams.delete('journeyReceipt');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }
  if (authResult === 'success' && resumePendingHubFly()) {
    // The original FLY action continues without requiring another click.
  } else if ((authResult === 'failed' || authResult === 'collision') && hasPendingHubFly()) {
    hubAccountNotice = { ok: false, message: authResult === 'collision' ? 'THIS SIGN-IN BELONGS TO ANOTHER ACCOUNT' : 'SIGN-IN FAILED. TRY AGAIN.' };
    await showHome();
    await openHubPilotMenu('PROFILE', false);
  } else if (hasPendingHubFly()) {
    if (!resumePendingHubFly()) {
      hubAccountNotice = { ok: true, message: 'CHOOSE HOW TO PLAY' };
      await showHome();
      await openHubPilotMenu('PROFILE', false);
    }
  } else if (directJourneyEntry && hubAccount.state === 'account') {
    await showHome();
    showMissionJourney(false, false);
    const progress = await refreshJourneyProgress();
    if (journeyReceipt && progress?.mission03?.completed && progress.mission03.firstAttemptId === journeyReceipt) {
      missionJourney.celebrateStageThree();
    } else if (journeyReceipt && progress?.mission02?.completed && progress.mission02.firstAttemptId === journeyReceipt) {
      missionJourney.celebrateStageTwo();
    } else if (journeyReceipt && progress?.completed && progress.firstAttemptId === journeyReceipt) {
      missionJourney.celebrateStageOne();
    } else if (journeyReceipt && progress?.mission03?.completed) {
      missionJourney.advanceToStageFour();
    } else if (journeyReceipt && progress?.mission02?.completed) {
      missionJourney.advanceToStageThree();
    } else if (journeyReceipt && progress?.completed) {
      missionJourney.advanceToStageTwo();
    }
  } else if (directCityEntry) {
    await showHome();
    await requestHubFly();
  } else {
    await showHome();
    if (inviteLanding && hubAccount.state === 'guest') await openHubPilotMenu('PROFILE', false);
  }
  const storeContext = pendingStoreContext();
  if (storeContext && hubAccount.state === 'account') {
    clearPendingStoreContext();
    gameStore.restoreContext(storeContext.category, storeContext.itemId);
    await openGameStore();
  } else if (storeContext && authResult === 'failed') clearPendingStoreContext();
  startupLoading.update(1);
  await startupLoading.finish();
  const tokenCheckout = url.searchParams.get('token_checkout');
  if (tokenCheckout === 'success' || tokenCheckout === 'cancel') {
    const sessionId = url.searchParams.get('session_id') ?? '';
    url.searchParams.delete('token_checkout'); url.searchParams.delete('session_id');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    if (skyTokenCommerceEnabled) {
      await openSkyTokenStore();
      if (tokenCheckout === 'cancel') skyTokenStore.setMessage('Purchase cancelled.');
      else if (/^cs_[A-Za-z0-9_]{8,256}$/.test(sessionId)) {
        let paid = false;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const statusUrl = apiUrl('/api/sky-tokens/purchase-status'); statusUrl.searchParams.set('sessionId', sessionId);
          const statusResponse = await apiFetch(statusUrl, { cache: 'no-store' });
          if (statusResponse.ok) {
            const status = await statusResponse.json() as { status: string; profile?: RemoteGarageProfile };
            if (status.status === 'paid' && status.profile) {
              applyAuthoritativeHomeProfile(status.profile); garage.updateProfile(garageProfile);
              if (gameStore.isOpen()) gameStore.update(garageProfile, true);
              skyTokenStore.updateBalance(garageProfile.skyTokens ?? 0);
              skyTokenStore.setMessage(`Purchase confirmed · REF ${sessionId.slice(-12)}`);
              audioManager.playPurchaseSuccess(); hapticsManager.emit('rewardSuccess', `tokens:${sessionId}`); paid = true; break;
            }
            if ((status.status === 'refunded' || status.status === 'partially_refunded') && status.profile) {
              applyAuthoritativeHomeProfile(status.profile); garage.updateProfile(garageProfile);
              if (gameStore.isOpen()) gameStore.update(garageProfile, true);
              skyTokenStore.updateBalance(garageProfile.skyTokens ?? 0);
              skyTokenStore.setMessage(status.status === 'refunded' ? 'Purchase was refunded.' : 'Purchase partially refunded.');
              paid = true; break;
            }
          }
          if (attempt < 7) await new Promise(resolve => window.setTimeout(resolve, 1_500));
        }
        if (!paid) skyTokenStore.setMessage('We are verifying your purchase. Your balance will update when confirmed.');
      }
    }
  }
  try {
    if (sessionStorage.getItem('airport-chaos-open-firehawk-garage') === '1') {
      sessionStorage.removeItem('airport-chaos-open-firehawk-garage');
      await openStartGarage('HANGAR');
      garage.focusAircraft('fighter');
    }
  } catch { /* the Pilot Hub remains usable if session storage is unavailable */ }
}
void start();
