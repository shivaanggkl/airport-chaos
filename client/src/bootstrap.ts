import './style.css';
import { CITY_QUERY_PARAM, activeCityFromUrl, cities, resolveCityTimePreset, type CityDefinition } from './cities';
import type { CityTimeOfDay } from './city-visuals';
import { AircraftGarage, type GarageProfile } from './garage';
import { aircraftDefinitions, aircraftDisplayName, type AircraftType } from './aircraft';
import { HomeHangar, type HomeHangarData } from './home-hangar';
import { getSponsorCatalog, type PublicSponsor } from './sponsorship-catalog';
import { setSponsorMeasurementCatalog, flushSponsorMeasurements } from './sponsorship-measurement';
import type { BusinessRoute } from './advertise-page';
import { LAUNCH_MODE_PARAM, type LaunchMode } from './launch-mode';
import { AppShellHeader, type AppShellActive } from './app-shell';
import { showPendingRankHelmetUnlock } from './rank-helmet-unlock';
import { createLockIcon } from './lock-icon';
import { HubInfoDialog } from './hub-info-dialog';
import { GameStore } from './game-store';
import { publicStoreCatalog, type PublicStoreCatalogItem } from '../../shared/store-catalog.mjs';
import { MissionJourney, missionJourneyStages } from './mission-journey';
import { storeFeatured, storeItemState, type StoreItem, type StoreCategory } from './store-catalog';
import { PilotMenu, type PilotMenuAccountResult, type PilotMenuData, type PilotMenuSection, type PilotProfileSummary } from './pilot-menu';
import { BrandLoadingScreen } from './startup-loading';
import { loadAirportChaosLogo } from './brand';
import { aircraftDisplayOrder } from '../../shared/aircraft-economy.mjs';
import { cosmeticCatalog } from '../../shared/cosmetics.mjs';
import { skyTokenPacks, type SkyTokenPackId } from '../../shared/sky-token-economy.mjs';
import { SkyTokenStore, type SkyTokenOffer } from './sky-token-store';
import { PLAYER_STORAGE_KEY } from './player-storage';
import { takeJourneyRewardReceipt } from './journey-reward-receipt';
import { setFlightLaunchAircraft } from './flight-launch-aircraft';
import { cityCapabilities } from '../../shared/city-registry.mjs';
import { beginFirehawkCheckout, restoreFirehawkPurchase, verifyCheckoutReturn } from './firehawk-checkout';
import { apiFetch, apiOrigin, apiUrl } from './transport';
import { loadNativeFirehawkOffer, loadNativeSkyTokenOffers, nativePurchaseProvider, purchaseNativeFirehawk, purchaseNativeSkyTokenPack, recoverNativeSkyTokenPurchases, restoreNativeFirehawk } from './native-purchases';
import { missionsForCity } from '../../shared/city-missions.mjs';
import { territoriesForCity } from '../../shared/city-territories.mjs';
import { acquireNativeCredential, availableNativeProviders, clearNativeProviderState, nativeAuthPlatform, type NativeAuthChallenge } from './native-auth';
import { closeTopUiLayer, registerUiBackLayer, uiBackPriority } from './ui-back-navigation';
import { audioManager, type AudioLevels } from './audio-manager';
import { hapticsManager } from './haptics-manager';
import { rewardedAdProvider, type RewardedAdAttempt } from './rewarded-ads';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
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
const cityJourneyPrevious = cityOptions.querySelector<HTMLButtonElement>('[data-city-previous]')!;
const cityJourneyNext = cityOptions.querySelector<HTMLButtonElement>('[data-city-next]')!;
const cityHelp = document.querySelector<HTMLButtonElement>('#city-help')!;
const cityHelpDialog = document.querySelector<HTMLElement>('#city-help-dialog')!;
const cityHelpCopy = document.querySelector<HTMLElement>('#city-help-copy')!;
const timeOptions = document.querySelector<HTMLElement>('#time-options')!;
const multiplayerFreeFly = document.querySelector<HTMLButtonElement>('#multiplayer-free-fly')!;
const cityBack = document.querySelector<HTMLButtonElement>('#city-back')!;
const citySelectTitle = document.querySelector<HTMLElement>('#city-select-title')!;
const citySelectDescription = document.querySelector<HTMLElement>('#city-select-description')!;
const citySelectionError = document.querySelector<HTMLElement>('#city-selection-error')!;
const garageOverlay = document.querySelector<HTMLElement>('#garage-overlay')!;
const pilotMenuOverlay = document.querySelector<HTMLElement>('#pilot-menu-overlay')!;
const startupLoading = new BrandLoadingScreen(brandLoadingElement);
const menuHeader = document.querySelector<HTMLElement>('#app-shell-header')!;
let menuEntrancesEnabled = false;
let menuEntranceCleanup: number | undefined;
let menuEntranceRoot: HTMLElement | undefined;
let menuEntranceItems: HTMLElement[] = [];

function menuContentFor(root: HTMLElement): HTMLElement[] {
  const selectors = root === homeHangarElement ? ['.home-hangar-missions', '.home-hangar-free-fly', '.home-hangar-store', '.home-hangar-sponsor', '.home-hangar-settings']
    : root === citySelector ? [citySelector.dataset.view === 'time' || citySelector.dataset.view === 'multiplayer' ? '.city-options' : '.city-journey', '.city-help']
    : root === missionJourneyElement ? ['.mission-journey-map', '.mission-journey-detail']
    : root === gameStoreElement ? ['.store-category-rail', '.store-content', '.store-notice']
    : root === garageOverlay ? ['.garage-card']
    : root === pilotMenuOverlay ? ['.pilot-menu-card']
    : root.classList.contains('sky-token-overlay') ? ['.sky-token-panel'] : [];
  return selectors.flatMap(selector => {
    const item = root.querySelector<HTMLElement>(selector);
    return item && !item.hidden ? [item] : [];
  });
}

function clearMenuEntrance(): void {
  if (menuEntranceCleanup !== undefined) window.clearTimeout(menuEntranceCleanup);
  menuEntranceCleanup = undefined;
  menuHeader.classList.remove('menu-entrance-ready', 'menu-entrance');
  for (const item of menuEntranceItems) {
    item.classList.remove('menu-entrance-ready', 'menu-entrance');
    item.style.removeProperty('--menu-entrance-delay');
  }
  menuEntranceItems = [];
  menuEntranceRoot = undefined;
}

function prepareMenuEntrance(root: HTMLElement): void {
  clearMenuEntrance();
  menuEntranceRoot = root;
  if (!menuHeader.hidden) menuHeader.classList.add('menu-entrance-ready');
  menuEntranceItems = menuContentFor(root);
  menuEntranceItems.forEach((item, index) => {
    item.style.setProperty('--menu-entrance-delay', `${130 + index * 90}ms`);
    item.classList.add('menu-entrance-ready');
  });
}

function playMenuEntrance(root: HTMLElement): void {
  if (!menuEntrancesEnabled) return;
  prepareMenuEntrance(root);
  // Force the prepared state before starting a repeat visit to the same page.
  void root.offsetWidth;
  revealMenuEntrance();
}

function revealMenuEntrance(): void {
  if (!menuEntranceRoot) return;
  menuHeader.classList.replace('menu-entrance-ready', 'menu-entrance');
  for (const item of menuEntranceItems) item.classList.replace('menu-entrance-ready', 'menu-entrance');
  menuEntranceCleanup = window.setTimeout(clearMenuEntrance, 1_200);
}
const missionJourney = new MissionJourney(missionJourneyElement, playJourneyMission, openMissionDetails, closeMissionDetails);
let journeyAttemptId: string | undefined;
let journeyLaunchPending = false;
let pendingAircraftSelection: Promise<boolean> | undefined;

function trackAircraftSelection<T>(operation: Promise<T>, confirmed: (value: T) => boolean): Promise<T> {
  const completion = operation.then(confirmed, () => false);
  pendingAircraftSelection = completion;
  void completion.then(() => { if (pendingAircraftSelection === completion) pendingAircraftSelection = undefined; });
  return operation;
}
let journeyAttemptMission: 'mission-01' | 'mission-02' | 'mission-03' | 'mission-04' | 'mission-05' | 'mission-06' | 'mission-07' | 'mission-08' | 'mission-09' | 'mission-10' | 'mission-11' | 'mission-12' | 'mission-13' | 'mission-14' | 'mission-15' | 'mission-16' | 'mission-17' | 'mission-18' | 'mission-19' | 'mission-20' | 'mission-21' | 'mission-22' | 'mission-23' | 'mission-24' = 'mission-01';

function abandonPendingJourneyLaunch(): void {
  const attemptId = journeyAttemptId;
  journeyAttemptId = undefined;
  if (!attemptId) return;
  void apiFetch(apiUrl(`/api/journey/dallas/${journeyAttemptMission}/abandon`), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attemptId }),
  }).catch(() => undefined);
}

async function refreshJourneyProgress(): Promise<{ completed: boolean; firstAttemptId?: string; mission02?: { completed: boolean; firstAttemptId?: string }; mission03?: { completed: boolean; firstAttemptId?: string }; mission04?: { completed: boolean; firstAttemptId?: string }; mission05?: { completed: boolean; firstAttemptId?: string }; mission06?: { completed: boolean; firstAttemptId?: string }; mission07?: { completed: boolean; firstAttemptId?: string }; mission08?: { completed: boolean; firstAttemptId?: string }; mission09?: { completed: boolean; firstAttemptId?: string }; mission10?: { completed: boolean; firstAttemptId?: string }; mission11?: { completed: boolean; firstAttemptId?: string }; mission12?: { completed: boolean; firstAttemptId?: string }; mission13?: { completed: boolean; firstAttemptId?: string }; mission14?: { completed: boolean; firstAttemptId?: string }; mission15?: { completed: boolean; firstAttemptId?: string }; mission16?: { completed: boolean; firstAttemptId?: string }; mission17?: { completed: boolean; firstAttemptId?: string }; mission18?: { completed: boolean; firstAttemptId?: string }; mission19?: { completed: boolean; firstAttemptId?: string }; mission20?: { completed: boolean; firstAttemptId?: string }; mission21?: { completed: boolean; firstAttemptId?: string }; mission22?: { completed: boolean; firstAttemptId?: string }; mission23?: { completed: boolean; firstAttemptId?: string }; mission24?: { completed: boolean; firstAttemptId?: string } } | undefined> {
  try {
    const response = await apiFetch(apiUrl('/api/journey/dallas'), { cache: 'no-store' });
    if (!response.ok) { if (response.status === 403 && hubAccount.state === 'account') await refreshHubPilotData(); missionJourney.setSignInRequired(false); missionJourney.setStageOneProgress(false, false); missionJourney.setStageTwoProgress(false, false); missionJourney.setStageThreeProgress(false, false); missionJourney.setStageFourProgress(false, false); missionJourney.setStageFiveProgress(false, false); missionJourney.setStageSixProgress(false, false); missionJourney.setStageSevenProgress(false, false); missionJourney.setStageEightProgress(false, false); missionJourney.setStageNineProgress(false, false); missionJourney.setStageTenProgress(false, false); missionJourney.setStageElevenProgress(false, false); missionJourney.setStageTwelveProgress(false, false); missionJourney.setStageThirteenProgress(false, false); missionJourney.setStageFourteenProgress(false, false); missionJourney.setStageFifteenProgress(false, false); missionJourney.setStageSixteenProgress(false, false); missionJourney.setStageSeventeenProgress(false, false); missionJourney.setStageEighteenProgress(false, false); return undefined; }
    const progress = await response.json() as { eligible?: boolean; completed?: boolean; firstAttemptId?: string; mission02?: { eligible?: boolean; completed?: boolean; firstAttemptId?: string }; mission03?: { eligible?: boolean; completed?: boolean; firstAttemptId?: string }; mission04?: { eligible?: boolean; completed?: boolean; firstAttemptId?: string }; mission05?: { eligible?: boolean; completed?: boolean; firstAttemptId?: string }; mission06?: { eligible?: boolean; completed?: boolean; firstAttemptId?: string }; mission07?: { eligible?: boolean; completed?: boolean; firstAttemptId?: string }; mission08?: { eligible?: boolean; completed?: boolean; firstAttemptId?: string }; mission09?: { eligible?: boolean; completed?: boolean; firstAttemptId?: string }; mission10?: { eligible?: boolean; completed?: boolean; firstAttemptId?: string }; mission11?: { eligible?: boolean; completed?: boolean; firstAttemptId?: string }; mission12?: { eligible?: boolean; completed?: boolean; firstAttemptId?: string }; mission13?: { eligible?: boolean; completed?: boolean; firstAttemptId?: string }; mission14?: { eligible?: boolean; completed?: boolean; firstAttemptId?: string }; mission15?: { eligible?: boolean; completed?: boolean; firstAttemptId?: string }; mission16?: { eligible?: boolean; completed?: boolean; firstAttemptId?: string }; mission17?: { eligible?: boolean; completed?: boolean; firstAttemptId?: string }; mission18?: { eligible?: boolean; completed?: boolean; firstAttemptId?: string }; mission19?: { eligible?: boolean; completed?: boolean; firstAttemptId?: string }; mission20?: { eligible?: boolean; completed?: boolean; firstAttemptId?: string }; mission21?: { eligible?: boolean; completed?: boolean; firstAttemptId?: string }; mission22?: { eligible?: boolean; completed?: boolean; firstAttemptId?: string }; mission23?: { eligible?: boolean; completed?: boolean; firstAttemptId?: string }; mission24?: { eligible?: boolean; completed?: boolean; firstAttemptId?: string } };
    missionJourney.setSignInRequired(false);
    missionJourney.setStageOneProgress(progress.eligible === true, progress.completed === true);
    missionJourney.setStageTwoProgress(progress.mission02?.eligible === true, progress.mission02?.completed === true);
    missionJourney.setStageThreeProgress(progress.mission03?.eligible === true, progress.mission03?.completed === true);
    missionJourney.setStageFourProgress(progress.mission04?.eligible === true, progress.mission04?.completed === true);
    missionJourney.setStageFiveProgress(progress.mission05?.eligible === true, progress.mission05?.completed === true);
    missionJourney.setStageSixProgress(progress.mission06?.eligible === true, progress.mission06?.completed === true);
    missionJourney.setStageSevenProgress(progress.mission07?.eligible === true, progress.mission07?.completed === true);
    missionJourney.setStageEightProgress(progress.mission08?.eligible === true, progress.mission08?.completed === true);
    missionJourney.setStageNineProgress(progress.mission09?.eligible === true, progress.mission09?.completed === true);
    missionJourney.setStageTenProgress(progress.mission10?.eligible === true, progress.mission10?.completed === true);
    missionJourney.setStageElevenProgress(progress.mission11?.eligible === true, progress.mission11?.completed === true);
    missionJourney.setStageTwelveProgress(progress.mission12?.eligible === true, progress.mission12?.completed === true);
    missionJourney.setStageThirteenProgress(progress.mission13?.eligible === true, progress.mission13?.completed === true);
    missionJourney.setStageFourteenProgress(progress.mission14?.eligible === true, progress.mission14?.completed === true);
    missionJourney.setStageFifteenProgress(progress.mission15?.eligible === true, progress.mission15?.completed === true);
    missionJourney.setStageSixteenProgress(progress.mission16?.eligible === true, progress.mission16?.completed === true);
    missionJourney.setStageSeventeenProgress(progress.mission17?.eligible === true, progress.mission17?.completed === true);
    missionJourney.setStageEighteenProgress(progress.mission18?.eligible === true, progress.mission18?.completed === true);
    missionJourney.setStageNineteenProgress(progress.mission19?.eligible === true, progress.mission19?.completed === true);
    missionJourney.setStageTwentyProgress(progress.mission20?.eligible === true, progress.mission20?.completed === true);
    missionJourney.setStageTwentyOneProgress(progress.mission21?.eligible === true, progress.mission21?.completed === true);
    missionJourney.setStageTwentyTwoProgress(progress.mission22?.eligible === true, progress.mission22?.completed === true);
    missionJourney.setStageTwentyThreeProgress(progress.mission23?.eligible === true, progress.mission23?.completed === true);
    missionJourney.setStageTwentyFourProgress(progress.mission24?.eligible === true, progress.mission24?.completed === true);
    return { completed: progress.completed === true, firstAttemptId: progress.firstAttemptId,
      mission02: { completed: progress.mission02?.completed === true, firstAttemptId: progress.mission02?.firstAttemptId },
      mission03: { completed: progress.mission03?.completed === true, firstAttemptId: progress.mission03?.firstAttemptId },
      mission04: { completed: progress.mission04?.completed === true, firstAttemptId: progress.mission04?.firstAttemptId },
      mission05: { completed: progress.mission05?.completed === true, firstAttemptId: progress.mission05?.firstAttemptId },
      mission06: { completed: progress.mission06?.completed === true, firstAttemptId: progress.mission06?.firstAttemptId },
      mission07: { completed: progress.mission07?.completed === true, firstAttemptId: progress.mission07?.firstAttemptId },
      mission08: { completed: progress.mission08?.completed === true, firstAttemptId: progress.mission08?.firstAttemptId },
      mission09: { completed: progress.mission09?.completed === true, firstAttemptId: progress.mission09?.firstAttemptId },
      mission10: { completed: progress.mission10?.completed === true, firstAttemptId: progress.mission10?.firstAttemptId },
      mission11: { completed: progress.mission11?.completed === true, firstAttemptId: progress.mission11?.firstAttemptId },
      mission12: { completed: progress.mission12?.completed === true, firstAttemptId: progress.mission12?.firstAttemptId },
      mission13: { completed: progress.mission13?.completed === true, firstAttemptId: progress.mission13?.firstAttemptId },
      mission14: { completed: progress.mission14?.completed === true, firstAttemptId: progress.mission14?.firstAttemptId },
      mission15: { completed: progress.mission15?.completed === true, firstAttemptId: progress.mission15?.firstAttemptId },
      mission16: { completed: progress.mission16?.completed === true, firstAttemptId: progress.mission16?.firstAttemptId },
      mission17: { completed: progress.mission17?.completed === true, firstAttemptId: progress.mission17?.firstAttemptId },
      mission18: { completed: progress.mission18?.completed === true, firstAttemptId: progress.mission18?.firstAttemptId },
      mission19: { completed: progress.mission19?.completed === true, firstAttemptId: progress.mission19?.firstAttemptId },
      mission20: { completed: progress.mission20?.completed === true, firstAttemptId: progress.mission20?.firstAttemptId },
      mission21: { completed: progress.mission21?.completed === true, firstAttemptId: progress.mission21?.firstAttemptId },
      mission22: { completed: progress.mission22?.completed === true, firstAttemptId: progress.mission22?.firstAttemptId },
      mission23: { completed: progress.mission23?.completed === true, firstAttemptId: progress.mission23?.firstAttemptId },
      mission24: { completed: progress.mission24?.completed === true, firstAttemptId: progress.mission24?.firstAttemptId } };
  } catch {
    missionJourney.setStageOneProgress(false, false);
    missionJourney.setStageTwoProgress(false, false);
    missionJourney.setStageThreeProgress(false, false);
    missionJourney.setStageFourProgress(false, false);
    missionJourney.setStageFiveProgress(false, false);
    missionJourney.setStageSixProgress(false, false);
    missionJourney.setStageSevenProgress(false, false);
    missionJourney.setStageEightProgress(false, false);
    missionJourney.setStageNineProgress(false, false);
    missionJourney.setStageTenProgress(false, false);
    missionJourney.setStageElevenProgress(false, false);
    missionJourney.setStageTwelveProgress(false, false);
    missionJourney.setStageThirteenProgress(false, false); missionJourney.setStageFourteenProgress(false, false);
    missionJourney.setStageFifteenProgress(false, false); missionJourney.setStageSixteenProgress(false, false);
    missionJourney.setStageSeventeenProgress(false, false); missionJourney.setStageEighteenProgress(false, false);
    missionJourney.setStageNineteenProgress(false, false); missionJourney.setStageTwentyProgress(false, false); missionJourney.setStageTwentyOneProgress(false, false);
    return undefined;
  }
}

async function playJourneyMission(): Promise<void> {
  if (journeyLaunchPending) return;
  if (!dallasUnlocked()) return;
  cityJourneyMode = 'missions';
  const mission = missionJourney.selectedMissionNumber === 24 ? 'mission-24' : missionJourney.selectedMissionNumber === 23 ? 'mission-23' : missionJourney.selectedMissionNumber === 22 ? 'mission-22' : missionJourney.selectedMissionNumber === 21 ? 'mission-21' : missionJourney.selectedMissionNumber === 20 ? 'mission-20' : missionJourney.selectedMissionNumber === 19 ? 'mission-19' : missionJourney.selectedMissionNumber === 18 ? 'mission-18' : missionJourney.selectedMissionNumber === 17 ? 'mission-17' : missionJourney.selectedMissionNumber === 16 ? 'mission-16' : missionJourney.selectedMissionNumber === 15 ? 'mission-15' : missionJourney.selectedMissionNumber === 14 ? 'mission-14' : missionJourney.selectedMissionNumber === 13 ? 'mission-13' : missionJourney.selectedMissionNumber === 12 ? 'mission-12' : missionJourney.selectedMissionNumber === 11 ? 'mission-11' : missionJourney.selectedMissionNumber === 10 ? 'mission-10' : missionJourney.selectedMissionNumber === 9 ? 'mission-09' : missionJourney.selectedMissionNumber === 8 ? 'mission-08' : missionJourney.selectedMissionNumber === 7 ? 'mission-07' : missionJourney.selectedMissionNumber === 6 ? 'mission-06' : missionJourney.selectedMissionNumber === 5 ? 'mission-05' : missionJourney.selectedMissionNumber === 4 ? 'mission-04' : missionJourney.selectedMissionNumber === 3 ? 'mission-03' : missionJourney.selectedMissionNumber === 2 ? 'mission-02' : 'mission-01';
  journeyLaunchPending = true;
  try {
    if (pendingAircraftSelection && !await pendingAircraftSelection) throw new Error('Aircraft change was not confirmed');
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
  } finally {
    journeyLaunchPending = false;
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
  profileSummary?: PilotProfileSummary;
  pilotId?: string; pilotName?: string; score?: number; skyTokens?: number;
  totalDistance?: number; successfulLandings?: number;
  discoveries?: Record<string, string[]>;
  legacyImportPending?: boolean; legendaryPilot?: boolean;
  tutorial?: { version: 'tutorial_v1'; status: 'new' | 'started' | 'completed' | 'skipped'; completedAt?: number; dallasUnlocked: boolean };
  kills?: number; deaths?: number;
  pilotProgress?: { xp: number; level: number; title: string; rankId?: string; nextLevelXp: number };
  profileCosmetics?: { ownedPremiumBadges: string[]; ownedAvatarFrames: string[]; equippedPremiumBadge: string | null; equippedAvatarFrame: string };
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
let skyTokenCatalogKey: string | undefined;
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
  supported: boolean; provider?: 'ADMOB'; platform?: 'ios' | 'android'; rewardCredits: number; rewardCreditsByStep: readonly number[]; maxRewards: number; remaining: number;
  windowStartedAt?: number; windowEndsAt?: number;
  activeAttempt?: { attemptId: string; status: RewardedAdAttemptStatus; expiresAt: number };
  serverNow: number;
};
let hubRewardedAdStatus: RewardedAdStatus | undefined;
let hubRewardedAdNotice: string | undefined;
let hubRewardedAdPhase: 'idle' | 'loading' | 'playing' | 'verifying' = 'idle';
let rewardedAdPollGeneration = 0;
let hubFlyIntent = false;
let hubFlyMode: CityJourneyMode = 'missions';
let hubFlyGateActive = false;
const hubInfoDialog = new HubInfoDialog();
let advertiseOverlay: HTMLElement | undefined;
let advertiseController: { setRoute: (route: BusinessRoute, sponsorId?: string) => void; destroy: () => void } | undefined;
let advertiseReturnFocus: HTMLElement | undefined;
async function openAdvertisePage(trigger: HTMLElement, restoredRoute?: BusinessRoute, sponsorId?: string, detailIntentSource?: 'HUB'): Promise<void> {
  if (advertiseOverlay) return;
  const { mountAdvertiseExperience } = await import('./advertise-page');
  advertiseReturnFocus = trigger;
  advertiseOverlay = document.createElement('div');
  advertiseOverlay.className = 'advertise-overlay';
  document.body.append(advertiseOverlay);
  const openRoute = (route: BusinessRoute, id?: string) => {
    window.history.pushState({ airportChaosBusiness: route, sponsorId: id }, '', route === 'details' ? `/sponsors/${id}` : `/${route}`);
    advertiseController?.setRoute(route, id);
  };
  advertiseController = mountAdvertiseExperience(advertiseOverlay, {
    route: restoredRoute ?? 'advertise', sponsorId, detailIntentSource, onNavigate: openRoute, onClose: () => window.history.back(),
  });
  if (!restoredRoute || (restoredRoute === 'details' && window.history.state?.airportChaosBusiness !== 'details')) openRoute(restoredRoute ?? 'advertise', sponsorId);
  advertiseOverlay.querySelector<HTMLElement>('[data-back]')?.focus();
}
registerUiBackLayer({
  id: 'advertise-page', priority: uiBackPriority.blockingModal,
  isActive: () => Boolean(advertiseOverlay),
  close: () => window.history.back(),
});
const appHeader = new AppShellHeader(document.querySelector<HTMLElement>('#app-shell-header')!, {
  home: () => { void showHome(); },
  back: () => { hapticsManager.emit('selection'); closeTopUiLayer(); },
  advertise: trigger => { hapticsManager.emit('selection'); void openAdvertisePage(trigger); },
  friends: trigger => { hapticsManager.emit('selection'); hubInfoDialog.openFriends(trigger); },
  store: () => { hapticsManager.emit('selection'); void openGameStore(); },
  garage: () => { hapticsManager.emit('selection'); void openStartGarage(entryState === 'STORE' || (entryState === 'PILOT_MENU' && hubPilotMenuReturnState === 'STORE') ? 'STORE' : missionJourneyReturnPending ? 'MISSION_JOURNEY' : 'HANGAR'); },
  rewards: () => { hapticsManager.emit('selection'); void openHubRewards(); },
  profile: () => { hapticsManager.emit('selection'); void openHubPilotMenu('PROFILE', true, !missionJourneyReturnPending); },
  skyTokens: () => {
    hapticsManager.emit('selection');
    void openSkyTokenStore();
  },
});
const skyTokenStore = new SkyTokenStore(async packId => {
  if (hubAccount.state !== 'account') {
    skyTokenStore.setMessage('');
    promptPurchaseSignIn(undefined, () => { skyTokenStore.close(); void openHubPilotMenu('PROFILE'); });
    return;
  }
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
}, () => showAppHeader(entryState === 'AIRCRAFT' ? 'GARAGE' : entryState === 'STORE' ? 'STORE' : undefined));

async function refreshSkyTokenCatalog(): Promise<void> {
  const catalogKey = `${garageIdentity.pilotId}:${hubAccount.state}`;
  if (skyTokenCatalogKey === catalogKey) return;
  const response = await apiFetch(apiUrl('/api/sky-tokens/catalog'), { cache: 'no-store' });
  if (!response.ok) throw new Error('Store configuration unavailable');
  const result = await response.json() as { enabled?: boolean; packs?: Array<{ id: string; tokens: number; usdCents: number }> };
  skyTokenCommerceEnabled = hubAccount.state === 'account' && result.enabled === true;
  const guest = hubAccount.state !== 'account';
  const useNativePrices = Boolean(nativePurchaseProvider && (skyTokenCommerceEnabled || (guest && !stagingTokenStorePreview)));
  const nativeOffers = useNativePrices ? await loadNativeSkyTokenOffers() : {};
  const showOffers = guest || skyTokenCommerceEnabled || stagingTokenStorePreview;
  skyTokenOffers = showOffers ? (result.packs ?? []).flatMap(pack => {
    const id = pack.id as SkyTokenPackId;
    if (!Object.hasOwn(skyTokenPacks, id) || pack.tokens !== skyTokenPacks[id].tokens || pack.usdCents !== skyTokenPacks[id].usdCents) return [];
    const price = useNativePrices ? nativeOffers[id]?.localizedPrice : `$${(pack.usdCents / 100).toFixed(2)}`;
    return price ? [{ id, tokens: pack.tokens, price }] : [];
  }) : [];
  const completeCatalog = skyTokenOffers.length === Object.keys(skyTokenPacks).length;
  skyTokenCatalogKey = !showOffers || completeCatalog ? catalogKey : undefined;
  if (skyTokenCommerceEnabled && !completeCatalog) garage.setTokenStoreUnavailable();
  else garage.setTokenCommerce(skyTokenCommerceEnabled, stagingTokenStorePreview && !skyTokenCommerceEnabled && completeCatalog);
  gameStore.setTokenSpendingAvailable(skyTokenCommerceEnabled);
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
  if (skyTokenOffers.length !== Object.keys(skyTokenPacks).length) {
    try { await refreshSkyTokenCatalog(); } catch { /* Surface the existing store-unavailable message below. */ }
  }
  if (hubAccount.state === 'account' && !skyTokenCommerceEnabled && !stagingTokenStorePreview) {
    if (entryState === 'STORE') gameStore.setNotice('SKY TOKEN PURCHASES ARE NOT AVAILABLE HERE YET');
    return;
  }
  if (skyTokenOffers.length !== Object.keys(skyTokenPacks).length) {
    if (entryState === 'STORE') gameStore.setNotice('SKY TOKEN PURCHASES ARE UNAVAILABLE — TRY AGAIN LATER');
    else garage.showActionResult('STORE UNAVAILABLE — PLEASE TRY AGAIN LATER');
    return;
  }
  recordProductIntent('sky_token_store_viewed');
  skyTokenStore.open(garageProfile.skyTokens ?? 0, skyTokenOffers, missing, hubAccount.state === 'account' && !skyTokenCommerceEnabled);
  showAppHeader(undefined);
  const tokenPage = document.querySelector<HTMLElement>('.sky-token-overlay');
  if (tokenPage) playMenuEntrance(tokenPage);
  appHeader.focusBack();
  if (nativeSkyTokenPurchasePending) void recoverPendingNativeSkyTokens();
}
function tokenStoreAvailable(): boolean {
  return skyTokenOffers.length === Object.keys(skyTokenPacks).length &&
    (hubAccount.state !== 'account' || skyTokenCommerceEnabled || stagingTokenStorePreview);
}

function showAppHeader(active: AppShellActive): void {
  if (entryState === 'PILOT_MENU' && !skyTokenStore.isOpen() && hubPilotMenu.isHubSettingsOpen()) {
    appHeader.hide();
    return;
  }
  if (entryState === 'STARTUP' || entryState === 'TUTORIAL' || entryState === 'FLIGHT') {
    appHeader.hide();
    return;
  }
  const pageTitle = skyTokenStore.isOpen() ? 'GET SKY TOKENS'
    : !citySelector.hidden && citySelector.dataset.view === 'multiplayer' ? 'DALLAS MULTIPLAYER'
    : !citySelector.hidden && citySelector.dataset.view === 'time' ? 'CHOOSE TIME'
    : entryState === 'CITY_SELECTION' ? 'CHOOSE CITY'
    : entryState === 'MISSION_JOURNEY' ? 'CHOOSE MISSION'
    : entryState === 'STORE' ? 'STORE'
    : entryState === 'AIRCRAFT' ? 'AIRCRAFT HANGAR'
    : entryState === 'PILOT_MENU' && hubPilotMenu.isSectionOpen('REWARDS') ? 'REWARDS'
    : entryState === 'PILOT_MENU' && hubPilotMenu.isSectionOpen('PROFILE') ? 'PILOT PROFILE'
    : undefined;
  const homeData = homeHangarData();
  appHeader.show({
    active,
    hubActions: !pageTitle && (entryState === 'HANGAR' || entryState === 'PILOT_MENU'),
    pageTitle,
    advertiseVisible: true,
    pilotName: authoritativeHomeProfile?.pilotName ?? garageIdentity.displayName,
    credits: garageProfile.credits,
    skyTokens: Math.max(0, authoritativeHomeProfile?.skyTokens ?? 0),
    storeHasOffers: storeFeatured.some(item => storeItemState(item, garageProfile) === 'LOCKED'),
    tokenStoreAvailable: tokenStoreAvailable(),
    rewardsAvailable: homeData.rewardsAvailable,
    rewardsAvailableInMs: homeData.rewardsAvailableInMs,
    pilotLevel: authoritativeHomeProfile?.pilotProgress?.level,
  });
}
function refreshAppHeaderIdentity(): void {
  appHeader.updateIdentity(
    authoritativeHomeProfile?.pilotName ?? garageIdentity.displayName,
    garageProfile.credits,
    Math.max(0, authoritativeHomeProfile?.skyTokens ?? 0),
    authoritativeHomeProfile?.pilotProgress?.level,
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
let timeSelectionReturnState: 'CITY_SELECTION' | 'MISSION_JOURNEY' | 'MULTIPLAYER_MODES' = 'CITY_SELECTION';
let hubMissionPreferredCity: CityDefinition['id'] | undefined;
let garageOpenRequest = 0;
function applyAuthoritativeHomeProfile(profile: RemoteGarageProfile): void {
  const prior = authoritativeHomeProfile;
  authoritativeHomeProfile = { ...profile,
    profileSummary: profile.profileSummary ?? (profile.pilotId === prior?.pilotId ? prior?.profileSummary : undefined) };
  garageProfile = normalizeGarageProfile(profile);
  garageIdentity.pilotId = profile.pilotId ?? garageIdentity.pilotId;
  garageIdentity.displayName = profile.pilotName ?? garageIdentity.displayName;
  cacheAuthoritativeProfile(profile);
  refreshAppHeaderIdentity();
  if (entryState === 'HANGAR') showPendingRankHelmetUnlock(profile.pilotId, profile.pilotProgress?.level);
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
    rewardsAvailable: Boolean(reward && (reward.claimable || rewardsAvailableInMs === 0)),
    rewardsAvailableInMs: reward && !reward.claimable ? rewardsAvailableInMs : undefined,
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
const CITY_JOURNEY_MODE_KEY = 'airport-chaos-city-journey-mode-v1';
type CityJourneyMode = 'missions' | 'free-fly' | 'multiplayer';
let cityJourneyMode: CityJourneyMode = (() => {
  try { const stored = sessionStorage.getItem(CITY_JOURNEY_MODE_KEY); return stored === 'free-fly' || stored === 'multiplayer' ? stored : 'missions'; }
  catch { return 'missions'; }
})();
const cityJourneyEntries: readonly CityJourneyEntry[] = Object.freeze([
  ...cities.map((city, index) => ({ id: city.id, title: city.displayName.toUpperCase(), subtitle: city.id === 'milwaukee' ? 'TRAINING CITY' : `CITY ${String(index).padStart(2, '0')}`, artImage: city.id === 'milwaukee' ? milwaukeeJourneyImage : `/media/city-journey/${city.id}.jpg`, artPosition: city.id === 'milwaukee' ? 'center 46%' : 'center', cityId: city.id })),
  { id: 'california', title: 'CALIFORNIA', subtitle: 'COMING SOON', artImage: '/media/cities/california-coming-soon.svg', artPosition: 'center' },
  { id: 'new-york', title: 'NEW YORK', subtitle: 'COMING SOON', artImage: '/media/cities/new-york-coming-soon.svg', artPosition: 'center' },
]);
let cityJourneyIndex = 0;
let cityJourneyLaunching = false;
let cityJourneyPointer: { id: number; x: number; y: number; dragging: boolean } | undefined;
let cityJourneyClickBlockedUntil = 0;
let cityJourneyTransitionUntil = 0;
let cityJourneyWheelAt = Number.NEGATIVE_INFINITY;
let pendingDallasUnlock = false;
let dallasUnlockAnimating = false;
type CityJourneyView = { card: HTMLElement; detail: HTMLElement; status: HTMLElement; lock: HTMLElement; cta: HTMLButtonElement };
const cityJourneyViews: CityJourneyView[] = [];

function journeyCity(entry: CityJourneyEntry): CityDefinition | undefined {
  return entry.cityId ? cities.find(city => city.id === entry.cityId && city.status === 'available' && Boolean(city.loadWorld)) : undefined;
}

function dallasUnlocked(): boolean {
  return authoritativeHomeProfile?.tutorial?.dallasUnlocked === true;
}

function cityJourneyState(entry: CityJourneyEntry): { detail: string; status: string; cta: string; city?: CityDefinition; training?: boolean; locked?: boolean; disabled?: boolean } {
  const city = journeyCity(entry);
  if (!city) return { detail: 'COMING SOON', status: 'CITY LOCKED', cta: 'LOCKED', disabled: true };
  if (entry.id === 'milwaukee') {
    const completed = Boolean(authoritativeHomeProfile?.tutorial?.completedAt);
    if (cityJourneyMode === 'missions') return { city, detail: 'TRAINING', status: completed ? 'TRAINING COMPLETED' : 'TRAINING AVAILABLE', cta: completed ? 'PRACTICE AGAIN' : 'START TRAINING', training: true };
    return { city, detail: 'PRACTICE FREE FLY', status: 'TRAINING CITY', cta: 'CONTINUE' };
  }
  if (cityJourneyMode === 'missions' && city.id !== 'dallas') return { detail: 'COMING SOON', status: 'MISSIONS UNAVAILABLE', cta: 'LOCKED', disabled: true };
  const capabilities = cityCapabilities(city.id);
  if (cityJourneyMode === 'free-fly' && !capabilities?.competitiveEnabled && !capabilities?.practiceMode) {
    return { detail: 'COMING SOON', status: 'FREE FLY UNAVAILABLE', cta: 'LOCKED', disabled: true };
  }
  const unlocked = cityJourneyMode !== 'missions' || entry.id !== 'dallas' || dallasUnlocked();
  const detail = cityJourneyMode === 'missions'
    ? `${missionJourneyStages.filter(stage => stage.implementation === 'playable').length} MISSIONS`
    : cityJourneyMode === 'multiplayer' ? 'MULTIPLAYER' : capabilities?.competitiveEnabled ? 'MULTIPLAYER FREE FLY' : 'PRACTICE FREE FLY';
  return { city, detail, status: unlocked ? 'AVAILABLE' : 'COMPLETE MILWAUKEE TRAINING FIRST', cta: unlocked ? cityJourneyMode === 'missions' ? 'VIEW MISSIONS' : 'CONTINUE' : 'LOCKED', locked: !unlocked, disabled: !unlocked && cityJourneyMode !== 'missions' };
}

function preferredCityJourneyIndex(preferDallas = false): number {
  const dallasIndex = cityJourneyEntries.findIndex(entry => entry.id === 'dallas');
  try {
    const stored = localStorage.getItem(CITY_JOURNEY_SELECTION_KEY);
    const storedIndex = cityJourneyEntries.findIndex(entry => entry.id === stored);
    if (storedIndex >= 0) return storedIndex;
  } catch { /* use the current authoritative city availability */ }
  if (cityJourneyMode === 'missions' && !dallasUnlocked()) return Math.max(0, cityJourneyEntries.findIndex(entry => entry.id === 'milwaukee'));
  if (preferDallas && dallasIndex >= 0 && journeyCity(cityJourneyEntries[dallasIndex]!)) return dallasIndex;
  if (dallasIndex >= 0 && journeyCity(cityJourneyEntries[dallasIndex]!)) return dallasIndex;
  return Math.max(0, cityJourneyEntries.findIndex(entry => entry.id === 'milwaukee'));
}

function activateCityJourneyCard(index: number): void {
  const state = cityJourneyState(cityJourneyEntries[index]!);
  if (cityJourneyLaunching || pendingDallasUnlock && cityJourneyMode === 'missions' || performance.now() < cityJourneyClickBlockedUntil || index !== cityJourneyIndex || state.disabled || !state.city) return;
  cityJourneyLaunching = true;
  hapticsManager.emit('selection');
  if (state.training) void startTrainingFromHub();
  else chooseCity(state.city);
}

function createMenuCarouselCard(cardClass: string, artClass: string, copyClass: string): { card: HTMLElement; art: HTMLElement; copy: HTMLElement } {
  const card = document.createElement('article');
  card.className = `game-card-frame menu-selection-card menu-card-carousel-card ${cardClass}`;
  const art = document.createElement('div');
  art.className = `menu-selection-card-art menu-card-carousel-art ${artClass}`;
  art.setAttribute('aria-hidden', 'true');
  const copy = document.createElement('div');
  copy.className = `menu-selection-card-copy menu-card-carousel-copy ${copyClass}`;
  card.append(art, copy);
  return { card, art, copy };
}

function positionMenuCarouselCard(card: HTMLElement, offset: number): void {
  card.classList.toggle('is-selected', offset === 0);
  card.classList.toggle('is-previous', offset === -1);
  card.classList.toggle('is-next', offset === 1);
  card.classList.toggle('is-before', offset < -1);
  card.classList.toggle('is-after', offset > 1);
  card.classList.toggle('is-hidden', Math.abs(offset) > 1);
  card.setAttribute('aria-hidden', Math.abs(offset) > 1 ? 'true' : 'false');
}

function installMenuCarouselSwipe(container: HTMLElement, onGestureEnd: (direction: -1 | 0 | 1) => void): void {
  let pointer: { id: number; x: number; y: number; dragging: boolean } | undefined;
  container.onpointerdown = event => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('.city-journey-arrow')) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false };
  };
  container.onpointermove = event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (!pointer.dragging && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { pointer = undefined; return; }
    if (!pointer.dragging && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      pointer.dragging = true;
      container.classList.add('is-dragging');
      container.setPointerCapture(event.pointerId);
    }
    if (!pointer.dragging) return;
    event.preventDefault();
    const limit = Math.max(70, container.clientWidth * .28);
    const bounded = Math.max(-limit, Math.min(limit, dx));
    container.style.setProperty('--journey-drag-x', `${bounded}px`);
    container.style.setProperty('--journey-side-drag-x', `${bounded * .55}px`);
  };
  const finish = (event: PointerEvent, cancelled: boolean): void => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    const wasDragging = pointer.dragging;
    pointer = undefined;
    if (!wasDragging) return;
    container.classList.remove('is-dragging');
    void container.offsetWidth;
    container.style.removeProperty('--journey-drag-x');
    container.style.removeProperty('--journey-side-drag-x');
    onGestureEnd(!cancelled && Math.abs(dx) >= 42 && Math.abs(dx) > Math.abs(dy) ? dx < 0 ? 1 : -1 : 0);
  };
  container.onpointerup = event => finish(event, false);
  container.onpointercancel = event => finish(event, true);
}

function cityJourneyFullCardSrc(entry: CityJourneyEntry): string {
  return (entry.id === 'dallas' || entry.id === 'california' || entry.id === 'new-york') && cityJourneyMode === 'missions'
    ? `/media/city-journey/${entry.id}-single-player-card.png`
    : `/media/city-journey/${entry.id}-card.png`;
}

function createCityJourneyCards(): void {
  if (cityJourneyViews.length) return;
  cityJourneyTrack.replaceChildren();
  cityJourneyEntries.forEach((entry, index) => {
    const { card, art, copy } = createMenuCarouselCard('city-journey-card', 'city-journey-art', 'city-journey-copy');
    card.classList.add(`city-journey-${entry.id}`);
    card.dataset.cityJourneyId = entry.id;
    card.setAttribute('role', 'option');

    card.style.setProperty('--journey-art-image', `url("${entry.artImage}")`);
    card.style.setProperty('--journey-art-position', entry.artPosition);
    if (entry.id === 'dallas' || entry.id === 'milwaukee' || entry.id === 'california' || entry.id === 'new-york') {
      const fullCard = document.createElement('img');
      fullCard.className = 'city-journey-full-card-image';
      fullCard.src = cityJourneyFullCardSrc(entry);
      fullCard.alt = '';
      fullCard.setAttribute('aria-hidden', 'true');
      card.append(fullCard);
    }
    const subtitle = document.createElement('small');
    subtitle.textContent = entry.subtitle;
    const title = document.createElement('h2');
    title.textContent = entry.title;
    const detail = document.createElement('span');
    detail.className = 'city-journey-detail';
    const status = document.createElement('strong');
    status.className = 'city-journey-status';
    const lock = document.createElement('span');
    lock.className = 'city-journey-lock';
    lock.append(createLockIcon());
    lock.setAttribute('aria-hidden', 'true');
    copy.append(title, subtitle, detail, status, lock);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'entry-button entry-button-primary city-journey-cta';
    button.addEventListener('click', event => {
      event.stopPropagation();
      activateCityJourneyCard(index);
    });
    copy.append(button);

    card.addEventListener('click', () => {
      if (index === cityJourneyIndex) { activateCityJourneyCard(index); return; }
      if (performance.now() < cityJourneyClickBlockedUntil || Math.abs(index - cityJourneyIndex) !== 1) return;
      hapticsManager.emit('selection');
      setCityJourneyIndex(index);
    });
    if (entry.id === 'dallas' || entry.id === 'milwaukee') card.addEventListener('keydown', event => {
      if (event.target !== card || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      activateCityJourneyCard(index);
    });
    cityJourneyTrack.append(card);

    cityJourneyViews.push({ card, detail, status, lock, cta: button });
  });
  cityJourneyTrack.append(cityJourneyPrevious, cityJourneyNext);
}

function renderCityJourney(): void {
  createCityJourneyCards();
  cityOptions.classList.toggle('is-unlock-pending', pendingDallasUnlock && cityJourneyMode === 'missions');
  cityJourneyViews.forEach((view, index) => {
    const offset = index - cityJourneyIndex;
    const entry = cityJourneyEntries[index]!;
    const state = cityJourneyState(entry);
    const dallasFullCard = entry.id === 'dallas' && cityJourneyMode !== 'free-fly';
    const newYorkFullCard = entry.id === 'new-york' && cityJourneyMode !== 'free-fly';
    const fullCardDisplay = entry.id === 'milwaukee' || entry.id === 'california' || dallasFullCard || newYorkFullCard;
    const unlocking = pendingDallasUnlock && cityJourneyMode === 'missions' && entry.id === 'dallas';
    view.card.setAttribute('aria-selected', offset === 0 ? 'true' : 'false');
    positionMenuCarouselCard(view.card, offset);
    view.card.classList.toggle('is-full-card-display', fullCardDisplay);
    view.card.classList.toggle('is-california-single-player', entry.id === 'california' && cityJourneyMode === 'missions');
    if (dallasFullCard || entry.id === 'california' || newYorkFullCard) {
      const image = view.card.querySelector<HTMLImageElement>('.city-journey-full-card-image');
      const src = cityJourneyFullCardSrc(entry);
      if (image && image.getAttribute('src') !== src) image.src = src;
    }
    view.card.tabIndex = fullCardDisplay && offset === 0 && !state.disabled ? 0 : -1;
    if (dallasFullCard) view.card.setAttribute('aria-label', cityJourneyMode === 'missions' ? 'Dallas, Single Player' : 'Dallas, Multiplayer');
    else if (entry.id === 'milwaukee') view.card.setAttribute('aria-label', 'Milwaukee, Training City');
    else if (entry.id === 'california') view.card.setAttribute('aria-label', cityJourneyMode === 'missions' ? 'California, Single Player, Coming Soon' : 'California, Multiplayer, Coming Soon');
    else if (newYorkFullCard) view.card.setAttribute('aria-label', cityJourneyMode === 'missions' ? 'New York, Single Player, Coming Soon' : 'New York, Multiplayer, Coming Soon');
    else view.card.removeAttribute('aria-label');
    view.card.classList.toggle('is-locked', unlocking || state.locked === true || state.disabled === true);
    view.detail.textContent = state.detail === cityJourneyEntries[index]!.subtitle ? '' : state.detail;
    view.status.textContent = unlocking ? 'TRAINING COMPLETE' : state.status;
    view.lock.hidden = !unlocking && state.locked !== true && state.disabled !== true;
    view.cta.textContent = unlocking ? 'UNLOCKING…' : state.cta;
    view.cta.disabled = unlocking || state.disabled === true;
    view.cta.setAttribute('aria-disabled', unlocking || state.disabled === true ? 'true' : 'false');
    view.cta.tabIndex = offset === 0 && !fullCardDisplay ? 0 : -1;
    view.card.classList.toggle('is-enterable', offset === 0 && !unlocking && !state.disabled && Boolean(state.city));
  });
  cityJourneyPrevious.disabled = pendingDallasUnlock && cityJourneyMode === 'missions' || cityJourneyIndex === 0;
  cityJourneyNext.disabled = pendingDallasUnlock && cityJourneyMode === 'missions' || cityJourneyIndex === cityJourneyEntries.length - 1;
  cityJourneyPrevious.hidden = cityJourneyIndex === 0;
  cityJourneyNext.hidden = cityJourneyIndex === cityJourneyEntries.length - 1;
}

function setCityJourneyIndex(index: number, remember = true): void {
  const next = Math.max(0, Math.min(cityJourneyEntries.length - 1, index));
  if ((next === cityJourneyIndex && cityJourneyTrack.childElementCount) || performance.now() < cityJourneyTransitionUntil) return;
  cityJourneyIndex = next;
  cityJourneyTransitionUntil = performance.now() + 320;
  if (remember) try { localStorage.setItem(CITY_JOURNEY_SELECTION_KEY, cityJourneyEntries[next]!.id); } catch { /* session selection still works */ }
  renderCityJourney();
}

function celebrateDallasUnlock(): void {
  if (!pendingDallasUnlock || dallasUnlockAnimating || cityJourneyMode !== 'missions' || citySelector.hidden) return;
  const dallasIndex = cityJourneyEntries.findIndex(entry => entry.id === 'dallas');
  const milwaukeeIndex = cityJourneyEntries.findIndex(entry => entry.id === 'milwaukee');
  if (dallasIndex < 0 || milwaukeeIndex < 0) return;
  const cancel = () => {
    dallasUnlockAnimating = false;
    cityOptions.classList.remove('is-unlock-traveling');
    cityJourneyViews[milwaukeeIndex]?.card.classList.remove('is-unlock-source');
    cityJourneyViews[dallasIndex]?.card.classList.remove('is-unlocking');
  };
  const finish = () => {
    if (citySelector.hidden) { cancel(); return; }
    pendingDallasUnlock = false;
    cancel();
    const dallas = cityJourneyViews[dallasIndex]?.card;
    renderCityJourney();
    dallas?.classList.add('is-just-unlocked');
    window.setTimeout(() => dallas?.classList.remove('is-just-unlocked'), 1200);
    hapticsManager.emit('rewardSuccess', `dallas-unlock:${authoritativeHomeProfile?.tutorial?.completedAt}`);
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setCityJourneyIndex(dallasIndex);
    finish();
    return;
  }
  dallasUnlockAnimating = true;
  cityJourneyViews[milwaukeeIndex]?.card.classList.add('is-unlock-source');
  window.setTimeout(() => {
    if (citySelector.hidden) { cancel(); return; }
    cityOptions.classList.add('is-unlock-traveling');
    setCityJourneyIndex(dallasIndex);
    window.setTimeout(() => {
      if (citySelector.hidden) { cancel(); return; }
      cityJourneyViews[dallasIndex]?.card.classList.add('is-unlocking');
      window.setTimeout(finish, 650);
    }, 1050);
  }, 500);
}

function stepCityJourney(direction: -1 | 1): void {
  if (pendingDallasUnlock && cityJourneyMode === 'missions') return;
  setCityJourneyIndex(cityJourneyIndex + direction);
}
cityJourneyPrevious.addEventListener('click', () => stepCityJourney(-1));
cityJourneyNext.addEventListener('click', () => stepCityJourney(1));

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

let currentHubSponsor: PublicSponsor | null = null;
let hubSponsorExpiresAt = 0;
let hubSponsorTimer: ReturnType<typeof setTimeout> | undefined;
let hubSponsorRequest = 0;
const homeHangar = new HomeHangar(homeHangarElement, {
  missions: () => { hapticsManager.emit('selection'); recordProductIntent('fly_clicked'); void requestHubFly('missions'); },
  freeFly: () => { hapticsManager.emit('selection'); recordProductIntent('fly_clicked'); showSelector('', { mode: 'multiplayer', preferDallas: true }); },
  store: () => { hapticsManager.emit('selection'); void openGameStore(); },
  sponsor: trigger => { hapticsManager.emit('selection'); void openAdvertisePage(trigger,
    currentHubSponsor && performance.now() < hubSponsorExpiresAt && trigger.classList.contains('is-sponsored') ? 'details' : undefined,
    currentHubSponsor?.advertiserId, currentHubSponsor ? 'HUB' : undefined); },
  settings: () => { if (entryState !== 'HANGAR') return; hapticsManager.emit('selection'); void openHubPilotMenu('CONTROLS', false); },
}, homeHangarData());

async function refreshHubSponsor(): Promise<void> {
  const request = ++hubSponsorRequest;
  if (hubSponsorTimer) clearTimeout(hubSponsorTimer);
  homeHangar.setSponsor(null);
  currentHubSponsor = null;
  const catalog = await getSponsorCatalog(true);
  if (request !== hubSponsorRequest || !homeHangar.isVisible()) return;
  setSponsorMeasurementCatalog(catalog);
  currentHubSponsor = catalog.hub;
  homeHangar.setSponsor(catalog.hub, catalog.measurementEnabled);
  hubSponsorExpiresAt = performance.now() + catalog.maxAgeMs;
  if (catalog.hub) hubSponsorTimer = setTimeout(() => {
    currentHubSponsor = null;
    homeHangar.setSponsor(null);
    void flushSponsorMeasurements();
  }, catalog.maxAgeMs);
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && homeHangar.isVisible()) void refreshHubSponsor();
});

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
  sections: ['CONTROLS', 'AUDIO', 'HELP', 'ACCOUNT'],
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
    profileSummary: profile?.profileSummary,
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
      badges: authoritativeHomeProfile?.legendaryPilot ? 1 : 0,
      legendaryPilot: authoritativeHomeProfile?.legendaryPilot === true,
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
      canClaim: Boolean(profile),
      notice: hubRewardNotice,
      state: profile?.dailyReward
        ? { ...profile.dailyReward, serverNow: hubServerNow }
        : { schedule: [], nextDay: 1, nextAmount: 0, claimable: false, claimedDays: [], claimCount: 0, nextEligibleAt: Number.MAX_SAFE_INTEGER, serverNow: hubServerNow },
      claim: claimDailyReward,
      watchAndEarn: hubRewardedAdStatus && rewardedAdProvider ? {
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
      setGraphicsQuality: (quality) => { hubGraphicsQuality = quality; try { localStorage.setItem('airport-chaos-graphics-quality-v1', quality); } catch { /* optional */ } notifySharedMenuPreferences(); hubPilotMenu.refresh(hubPilotMenuData(), true); },
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

async function hubAccountRequest(path: 'logout' | 'pilot-name', payload: Record<string, string> = {}): Promise<PilotMenuAccountResult> {
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
      skyTokenCatalogKey = undefined; nativeSkyTokenRecoveryPilotId = undefined; nativeSkyTokenPurchasePending = false;
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
    if (path !== 'pilot-name' || !hubPilotMenu.isSectionOpen('PROFILE')) hubPilotMenu.refresh(hubPilotMenuData(), true);
    return { ok: true, message: result.message ?? 'ACCOUNT UPDATED', pilotName: result.profile?.pilotName };
  } catch { return { ok: false, message: 'ACCOUNT SERVICE UNAVAILABLE' }; }
}

async function hubProviderAccountRequest(provider: 'google' | 'apple', action: 'login'): Promise<{ ok: boolean; message: string }> {
  if (hubAccount.state === 'account') {
    return { ok: false, message: "You're already signed in. Log out first to use another account." };
  }
  try {
    if (nativeAuthPlatform) {
      const start = await apiFetch(apiUrl('/api/auth/native/start'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, action, guestSwitchConfirmed: true, referralCode: pendingReferralCode() }) });
      const challenge = await start.json() as Partial<NativeAuthChallenge> & { error?: string };
      if (!start.ok || challenge.provider !== provider || challenge.platform !== nativeAuthPlatform || !challenge.state || !challenge.nonce) return { ok: false, message: challenge.error ?? 'PROVIDER SIGN-IN UNAVAILABLE' };
      const credential = await acquireNativeCredential(challenge as NativeAuthChallenge);
      if (credential.cancelled) {
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
      if (hubPilotMenu.isSectionOpen('PROFILE')) await refreshHubProfileSummary();
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
    const response = await apiFetch(apiUrl('/api/auth/oauth/start'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, action, guestSwitchConfirmed: true, returnTo: returnUrl.toString(), referralCode: pendingReferralCode() }) });
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
    if (result.profile) {
      applyAuthoritativeHomeProfile(result.profile);
      if (garage.isOpen()) garage.updateProfile(garageProfile);
    }
    if (Number.isFinite(result.serverNow)) hubServerNow = result.serverNow!;
    try { await refreshSkyTokenCatalog(); } catch { garage.setTokenStoreUnavailable(); }
    refreshAppHeaderIdentity();
    await refreshRewardedAdStatus();
    homeHangar.update(homeHangarData());
    if (hubPilotMenu.isOpen()) hubPilotMenu.refresh(hubPilotMenuData());
  } catch { /* cached authoritative profile keeps navigation usable */ }
}

async function refreshRewardedAdStatus(): Promise<void> {
  if (!rewardedAdProvider) {
    hubRewardedAdStatus = undefined;
    return;
  }
  try {
    const response = await apiFetch(apiUrl('/api/rewarded-ads/status'), { cache: 'no-store' });
    const result = await response.json() as { rewardedAds?: RewardedAdStatus };
    hubRewardedAdStatus = response.ok ? result.rewardedAds : undefined;
    if (response.ok && result.rewardedAds && !result.rewardedAds.activeAttempt && hubRewardedAdPhase === 'verifying') {
      // A callback may settle while Rewards is closed. Do not leave the next action locked.
      rewardedAdPollGeneration += 1;
      hubRewardedAdPhase = 'idle'; hubRewardedAdNotice = undefined;
      const profileResponse = await apiFetch(apiUrl('/api/auth/status'), { cache: 'no-store' });
      const profileResult = await profileResponse.json() as { profile?: RemoteGarageProfile };
      if (profileResponse.ok && profileResult.profile) applyAuthoritativeHomeProfile(profileResult.profile);
    }
  } catch { hubRewardedAdStatus = undefined; }
}

async function recordRewardedAdEvent(attemptId: string, event: 'started' | 'qualified' | 'closed' | 'failed'): Promise<void> {
  const response = await apiFetch(apiUrl('/api/rewarded-ads/event'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attemptId, event }),
  });
  const result = await response.json() as { rewardedAds?: RewardedAdStatus };
  if (result.rewardedAds) hubRewardedAdStatus = result.rewardedAds;
}

async function waitForRewardedAdVerification(attemptId: string, expectedCredits: number, source: DOMRect): Promise<void> {
  const generation = ++rewardedAdPollGeneration;
  for (let check = 0; check < 15; check += 1) {
    if (generation !== rewardedAdPollGeneration || !hubPilotMenu.isSectionOpen('REWARDS')) return;
    if (check > 0) await new Promise(resolve => window.setTimeout(resolve, 2_000));
    const url = apiUrl('/api/rewarded-ads/attempt-status'); url.searchParams.set('attemptId', attemptId);
    try {
      const response = await apiFetch(url, { cache: 'no-store' });
      const result = await response.json() as { attemptStatus?: RewardedAdAttemptStatus; rewardCredits?: number; status?: RewardedAdStatus; profile?: RemoteGarageProfile };
      if (!response.ok || !result.attemptStatus || !result.status) continue;
      hubRewardedAdStatus = result.status;
      if (result.attemptStatus === 'REWARDED') {
        const previousCredits = garageProfile.credits;
        if (result.profile) applyAuthoritativeHomeProfile(result.profile);
        if (result.profile && result.rewardCredits && result.profile.credits - previousCredits === result.rewardCredits)
          appHeader.animateCreditsEarned(source, previousCredits, result.profile.credits);
        hubRewardedAdPhase = 'idle';
        hubRewardedAdNotice = `+${(result.rewardCredits ?? expectedCredits).toLocaleString()} CREDITS`;
        audioManager.playReward();
        hapticsManager.emit('rewardSuccess', `ad:${attemptId}`);
        homeHangar.update(homeHangarData());
        hubPilotMenu.refresh(hubPilotMenuData(), true);
        return;
      }
      if (['FAILED', 'EXPIRED', 'CLOSED_WITHOUT_REWARD'].includes(result.attemptStatus)) {
        hubRewardedAdPhase = 'idle';
        hubRewardedAdNotice = result.attemptStatus === 'CLOSED_WITHOUT_REWARD' ? 'No reward earned.' : 'Unable to verify reward. Please try again.';
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

async function watchRewardedAd(source: DOMRect): Promise<void> {
  if (!rewardedAdProvider || hubRewardedAdPhase !== 'idle') return;
  let attempt: RewardedAdAttempt | undefined;
  hubRewardedAdPhase = 'loading'; hubRewardedAdNotice = 'Loading video...';
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
      // Advisory transport failure must not terminally fail a completed video. SSV remains authoritative.
      await recordRewardedAdEvent(attempt.attemptId, 'qualified').catch(() => undefined);
      hubRewardedAdPhase = 'verifying'; hubRewardedAdNotice = 'Verifying your reward...';
      hubPilotMenu.refresh(hubPilotMenuData(), true);
      await waitForRewardedAdVerification(attempt.attemptId, attempt.rewardCredits, source);
      return;
    }
    await recordRewardedAdEvent(attempt.attemptId, shown.state === 'closed' ? 'closed' : 'failed');
    hubRewardedAdPhase = 'idle';
    hubRewardedAdNotice = shown.state === 'closed' ? 'No reward earned.' : 'Unable to start video. Please try again.';
  } catch (error) {
    audioManager.setMenuMusicDesired(true);
    await rewardedAdProvider.discard().catch(() => undefined);
    if (attempt) await recordRewardedAdEvent(attempt.attemptId, 'failed').catch(() => undefined);
    hubRewardedAdPhase = 'idle';
    if (error instanceof Error && error.message.includes('No video')) recordProductIntent('rewarded_ad_no_fill');
    hubRewardedAdNotice = error instanceof Error && error.message.includes('No video')
      ? 'No video available right now.' : error instanceof Error ? error.message : 'Unable to start video. Please try again.';
  }
  hubPilotMenu.refresh(hubPilotMenuData(), true);
}

async function openHubRewards(): Promise<void> {
  recordProductIntent('rewards_viewed');
  await openHubPilotMenu('REWARDS', true, true);
  if (hubRewardedAdStatus?.supported) recordProductIntent('rewarded_ad_offer_viewed');
  const pending = hubRewardedAdStatus?.activeAttempt;
  if (pending && ['AD_STARTED', 'PENDING_VERIFICATION'].includes(pending.status) && !['loading', 'playing'].includes(hubRewardedAdPhase)) {
    hubRewardedAdPhase = 'verifying';
    hubRewardedAdNotice = 'Verifying your reward...';
    void waitForRewardedAdVerification(pending.attemptId, hubRewardedAdStatus!.rewardCredits,
      document.querySelector('.pilot-watch-earn')?.getBoundingClientRect() ?? new DOMRect());
  }
}

async function claimDailyReward(source: DOMRect): Promise<{ ok: boolean; message: string }> {
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
    const previousCredits = garageProfile.credits;
    applyAuthoritativeHomeProfile(result.profile);
    if (result.credits && result.profile.credits - previousCredits === result.credits)
      appHeader.animateCreditsEarned(source, previousCredits, result.profile.credits);
    await refreshRewardedAdStatus();
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
  try { return ['1', 'missions', 'free-fly', 'multiplayer'].includes(sessionStorage.getItem(PENDING_FLY_STORAGE_KEY) ?? ''); }
  catch { return false; }
}

function pendingHubFlyMode(): CityJourneyMode {
  try { const stored = sessionStorage.getItem(PENDING_FLY_STORAGE_KEY); return stored === 'free-fly' || stored === 'multiplayer' ? stored : hubFlyMode; }
  catch { return hubFlyMode; }
}

function rememberPendingHubFly(mode: CityJourneyMode): void {
  hubFlyIntent = true;
  hubFlyMode = mode;
  try { sessionStorage.setItem(PENDING_FLY_STORAGE_KEY, mode); } catch { /* in-memory intent still works */ }
}

function clearPendingHubFly(): void {
  hubFlyIntent = false;
  try { sessionStorage.removeItem(PENDING_FLY_STORAGE_KEY); } catch { /* in-memory intent is already cleared */ }
}

function resumePendingHubFly(): boolean {
  if (hubAccount.state !== 'account' || !hasPendingHubFly()) return false;
  const mode = pendingHubFlyMode();
  clearPendingHubFly();
  hubAccountNotice = undefined;
  hubPilotMenu.close(false);
  showSelector('', { mode, preferDallas: authoritativeHomeProfile?.tutorial?.status === 'completed' });
  return true;
}

function continueHubAsGuest(): void {
  hubAccountNotice = undefined;
  if (!hasPendingHubFly()) {
    hubPilotMenu.close();
    hubInfoDialog.openGuestProgress(document.body, () => { void openHubPilotMenu('PROFILE'); });
    return;
  }
  const mode = pendingHubFlyMode();
  clearPendingHubFly();
  hubPilotMenu.close(false);
  showSelector('', { mode, preferDallas: authoritativeHomeProfile?.tutorial?.status === 'completed' });
  hubInfoDialog.openGuestProgress(document.body, () => { void openHubPilotMenu('PROFILE'); });
}

async function requestHubFly(mode: CityJourneyMode = cityJourneyMode): Promise<void> {
  if (hubFlyGateActive || (hasPendingHubFly() && hubPilotMenu.isOpen())) return;
  hubFlyGateActive = true;
  try {
    await refreshHubPilotData();
    if (hubAccount.state === 'account') {
      clearPendingHubFly();
      showSelector('', { mode, preferDallas: authoritativeHomeProfile?.tutorial?.status === 'completed' });
      return;
    }
    rememberPendingHubFly(mode);
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
  if (hubSection === 'REWARDS') homeHangar.show(homeHangarData());
  else homeHangar.hide();
  gameStore.hide();
  citySelector.hidden = true;
  missionJourney.hide();
  hubPilotMenu.open(hubPilotMenuData(), hubSection);
  showAppHeader(hubSection === 'REWARDS' ? 'REWARDS' : hubSection === 'PROFILE' ? 'PROFILE' : undefined);
  playMenuEntrance(pilotMenuOverlay);
  if (hubSection === 'REWARDS') appHeader.focusBack();
  if (refresh) await refreshHubPilotData();
  if (hubSection === 'PROFILE') await refreshHubProfileSummary();
  if (entryState === 'PILOT_MENU') await garage.showcase(appHeader.aircraftPreviewHost, garageProfile);
}

async function refreshHubProfileSummary(): Promise<void> {
  if (hubAccount.state !== 'account') return;
  try {
    const response = await apiFetch(apiUrl('/api/profile'), { cache: 'no-store' });
    if (response.ok) applyAuthoritativeHomeProfile(await response.json() as RemoteGarageProfile);
    if (hubPilotMenu.isSectionOpen('PROFILE')) hubPilotMenu.refresh(hubPilotMenuData(), true);
  } catch { /* Keep the last authoritative values if offline. */ }
}

const garage = new AircraftGarage(garageOverlay, (selectedAircraft) => trackAircraftSelection((async () => {
  const previouslySelected = garageProfile.selectedAircraft;
  const url = apiUrl('/api/profile');
  url.searchParams.set('pilotId', garageIdentity.pilotId); url.searchParams.set('pilotName', garageIdentity.displayName);
  const response = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ equipAircraft: selectedAircraft }) });
  if (!response.ok) return false;
  const profile = await response.json() as RemoteGarageProfile;
  applyAuthoritativeHomeProfile(profile);
  if (profile.selectedAircraft !== previouslySelected) hapticsManager.emit('confirmation');
  try { localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(PLAYER_STORAGE_KEY) ?? '{}'), version: 1, pilotId: garageIdentity.pilotId, displayName: garageIdentity.displayName, credits: garageProfile.credits, selectedAircraft: garageProfile.selectedAircraft })); } catch { /* server profile remains authoritative */ }
  if (garage.isOpen()) garage.open(garageProfile);
  return profile.selectedAircraft === selectedAircraft;
})(), confirmed => confirmed), undefined, () => {
  garageOverlay.classList.remove('hub-aircraft');
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
  if (hubAccount.state !== 'account') { promptPurchaseSignIn(); return; }
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
  if (hubAccount.state !== 'account') { promptPurchaseSignIn(); return; }
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
  if (hubAccount.state !== 'account') { promptPurchaseSignIn(); return; }
  try {
    if (!await pricingBackendReady()) return;
    const response = await apiFetch(apiUrl('/api/profile'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purchaseAircraftWithSkyTokens: type }) });
    const result = await response.json() as RemoteGarageProfile & { error?: string };
    if (!response.ok) { garage.showActionResult(result.error ?? 'UNLOCK FAILED'); return; }
    applyAuthoritativeHomeProfile(result); garage.updateProfile(garageProfile);
    garage.showActionResult(`${aircraftDisplayName(type)} UNLOCKED`); audioManager.playPurchaseSuccess(); hapticsManager.emit('rewardSuccess', `aircraft:${type}`);
  } catch { garage.showActionResult('SERVER UNAVAILABLE — SKY TOKENS NOT SPENT'); }
}, missing => { void openSkyTokenStore(missing); }, () => {
  hapticsManager.emit('selection');
  void openGameStore();
  gameStore.setCategory('AIRCRAFT');
});

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
  equip: item => trackAircraftSelection(equipStoreItem(item), result => result.ok),
  login: () => { requestStoreLogin(); },
  retry: () => { void openGameStore(false); },
});

async function matchingPricingCatalog(): Promise<PublicStoreCatalogItem[]> {
  const response = await apiFetch(apiUrl('/api/store/catalog'), { cache: 'no-store' });
  if (!response.ok) throw new Error('Catalog unavailable');
  const body = await response.json() as { items?: PublicStoreCatalogItem[] };
  if (!Array.isArray(body.items)) throw new Error('Invalid catalog');
  const expected = publicStoreCatalog();
  const actual = new Map(body.items.map(item => [item.id, item]));
  if (actual.size !== expected.length || expected.some(item => {
    const serverItem = actual.get(item.id);
    return !serverItem || serverItem.kind !== item.kind || serverItem.credits !== item.credits || serverItem.tokens !== item.tokens
      || Boolean(serverItem.free) !== Boolean(item.free) || Boolean(serverItem.included) !== Boolean(item.included);
  })) throw new Error('QA BACKEND UPDATE REQUIRED');
  return body.items;
}

async function pricingBackendReady(): Promise<boolean> {
  try { await matchingPricingCatalog(); return true; }
  catch { garage.showActionResult('QA BACKEND UPDATE REQUIRED — NO PURCHASE MADE'); return false; }
}

function closeGameStore(): void {
  if (window.history.state?.airportChaosStoreView) window.history.replaceState(null, '', window.location.href);
  gameStore.close(); void showHome();
}

async function openGameStore(recordOpen = true): Promise<void> {
  if (entryState === 'FLIGHT' || entryState === 'TUTORIAL') return;
  if (recordOpen && entryState === 'STORE' && gameStore.isOpen()) return;
  const fromState = entryState;
  entryState = 'STORE';
  if (recordOpen && fromState !== 'STORE') {
    if (window.history.state?.airportChaosStoreView || (missionJourneyReturnPending && fromState !== 'MISSION_JOURNEY' && window.history.state?.airportChaosEntryView)) window.history.replaceState({ airportChaosStoreView: 'STORE' }, '', window.location.href);
    else window.history.pushState({ airportChaosStoreView: 'STORE' }, '', window.location.href);
  }
  if (hubPilotMenu.isOpen()) hubPilotMenu.close(false);
  if (garage.isOpen()) garage.close();
  homeHangar.hide(); citySelector.hidden = true; missionJourney.hide();
  showAppHeader('STORE');
  gameStore.setBackLabel('BACK TO HUB');
  gameStore.open(authoritativeHomeProfile ? garageProfile : undefined, hubAccount.state === 'account', true);
  gameStore.setTokenSpendingAvailable(skyTokenCommerceEnabled);
  playMenuEntrance(gameStoreElement);
  try {
    const [catalog, profile] = await Promise.all([
      matchingPricingCatalog(),
      loadGarageProfile(),
    ]);
    if (entryState === 'STORE') {
      gameStore.setCatalog(catalog);
      gameStore.setPurchaseAvailable(true);
      gameStore.update(profile, hubAccount.state === 'account');
    }
  } catch (error) {
    if (entryState !== 'STORE') return;
    if (error instanceof Error && error.message === 'QA BACKEND UPDATE REQUIRED') {
      gameStore.setCatalog(publicStoreCatalog());
      gameStore.setPurchaseAvailable(false);
      gameStore.update(garageProfile, hubAccount.state === 'account');
    } else gameStore.fail(error instanceof Error ? error.message : 'STORE UNAVAILABLE');
  }
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
  if (advertiseOverlay) {
    const route = window.history.state?.airportChaosBusiness;
    if (route === 'advertise' || route === 'sponsors' || route === 'details') advertiseController?.setRoute(route, window.history.state?.sponsorId);
    else {
      advertiseController?.destroy();
      advertiseOverlay.remove();
      advertiseController = undefined;
      advertiseOverlay = undefined;
      advertiseReturnFocus?.focus();
      advertiseReturnFocus = undefined;
    }
    return;
  }
  const businessRoute = window.history.state?.airportChaosBusiness;
  if (businessRoute === 'advertise' || businessRoute === 'sponsors' || businessRoute === 'details') {
    void openAdvertisePage(menuHeader.querySelector<HTMLElement>('.app-shell-advertise') ?? menuHeader, businessRoute, window.history.state?.sponsorId);
    return;
  }
  if (entryState === 'CITY_SELECTION' && citySelector.dataset.view === 'multiplayer') {
    showSelector('', { mode: 'multiplayer', preferDallas: true });
    return;
  }
  if (entryState === 'CITY_SELECTION' && citySelector.dataset.view === 'time') {
    if (window.history.state?.airportChaosEntryView === 'MULTIPLAYER_MODES') {
      const dallas = cities.find(city => city.id === 'dallas' && city.status === 'available');
      if (dallas) showDallasMultiplayerCards(dallas, false);
    } else if (window.history.state?.airportChaosEntryView === 'MISSION_JOURNEY') showMissionJourney(false);
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
  if (entryState !== 'STORE' && missionJourneyReturnPending && window.history.state?.airportChaosEntryView === 'MISSION_JOURNEY') {
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
  } else if (entryState === 'STORE' && !window.history.state?.airportChaosStoreView) {
    gameStore.close(); void showHome();
  }
});

function requestStoreLogin(): void {
  promptPurchaseSignIn(undefined, () => {
    try { sessionStorage.setItem(PENDING_STORE_STORAGE_KEY, JSON.stringify(gameStore.getContext())); } catch { /* Native sign-in still returns within this page. */ }
    void openHubPilotMenu('PROFILE');
  });
}

function promptPurchaseSignIn(trigger?: HTMLElement, signIn: () => void = () => { void openHubPilotMenu('PROFILE'); }): void {
  hubInfoDialog.openPurchaseSignIn(trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : document.body), signIn);
}

function pendingStoreContext(): { category: StoreCategory; itemId?: string } | undefined {
  try {
    const raw = sessionStorage.getItem(PENDING_STORE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { category?: StoreCategory | 'PAINTS'; itemId?: string };
    const category = parsed.category === 'PAINTS' ? 'AIRCRAFT' : parsed.category;
    if (category && ['FEATURED', 'AIRCRAFT', 'EFFECTS', 'CITIES'].includes(category)) return { category, itemId: parsed.itemId };
  } catch { /* Optional return context. */ }
}

function clearPendingStoreContext(): void { try { sessionStorage.removeItem(PENDING_STORE_STORAGE_KEY); } catch { /* Optional. */ } }

async function unlockStoreItem(item: StoreItem, currency: 'CREDITS' | 'SKY_TOKENS'): Promise<{ ok: boolean; message: string }> {
  if (currency === 'SKY_TOKENS' && hubAccount.state !== 'account') return { ok: false, message: 'SIGN IN TO UNLOCK WITH SKY TOKENS' };
  if (item.kind === 'aircraft' && (item.aircraftType === 'cargo' || item.aircraftType === 'privateJet'))
    return { ok: false, message: 'CHOOSE AN APPEARANCE FIRST' };
  try { await matchingPricingCatalog(); }
  catch { return { ok: false, message: 'QA BACKEND UPDATE REQUIRED — NO PURCHASE MADE' }; }
  const payload = item.kind === 'paint'
    ? { purchaseCosmetic: item.id, cosmeticCurrency: currency }
    : currency === 'CREDITS' ? { purchaseAircraft: item.aircraftType } : { purchaseAircraftWithSkyTokens: item.aircraftType };
  try {
    const response = await apiFetch(apiUrl('/api/profile'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, storeSource: true }) });
    const result = await response.json() as RemoteGarageProfile & { error?: string };
    if (!response.ok) return { ok: false, message: result.error ?? 'UNLOCK FAILED' };
    applyAuthoritativeHomeProfile(result);
    garage.updateProfile(garageProfile);
    gameStore.update(garageProfile, hubAccount.state === 'account');
    audioManager.playPurchaseSuccess();
    hapticsManager.emit('rewardSuccess', `store:${item.id}`);
    const unlockedName = item.aircraftType === 'fighter' ? 'FIREHAWK + ALL APPEARANCES'
      : item.kind === 'paint' && item.aircraftType !== 'trainer'
        ? `${aircraftDefinitions[item.aircraftType].callsign} + ${item.name}` : item.name;
    return { ok: true, message: `${unlockedName} UNLOCKED` };
  } catch { return { ok: false, message: 'SERVER UNAVAILABLE — NO CURRENCY SPENT' }; }
}

async function equipStoreItem(item: StoreItem): Promise<{ ok: boolean; message: string }> {
  const update = async (payload: Record<string, string>): Promise<RemoteGarageProfile> => {
    const url = apiUrl('/api/profile');
    url.searchParams.set('pilotId', garageIdentity.pilotId);
    url.searchParams.set('pilotName', garageIdentity.displayName);
    const response = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const profile = await response.json() as RemoteGarageProfile & { error?: string };
    if (!response.ok) throw new Error(profile.error ?? 'AIRCRAFT CHANGE UNAVAILABLE');
    applyAuthoritativeHomeProfile(profile);
    return profile;
  };
  try {
    if (item.kind === 'paint' && garageProfile.cosmetics?.equipped?.[`livery:${item.aircraftType}`] !== item.id)
      await update({ equipCosmetic: item.id });
    if (garageProfile.selectedAircraft !== item.aircraftType)
      await update({ equipAircraft: item.aircraftType });
    if (garageProfile.selectedAircraft !== item.aircraftType) throw new Error('AIRCRAFT CHANGE NOT CONFIRMED');
    garage.updateProfile(garageProfile);
    gameStore.update(garageProfile, hubAccount.state === 'account');
    hapticsManager.emit('confirmation');
    recordProductIntent('aircraft_selected', { aircraftType: item.aircraftType });
    return { ok: true, message: `${aircraftDisplayName(item.aircraftType)} EQUIPPED` };
  } catch (error) {
    gameStore.update(garageProfile, hubAccount.state === 'account');
    return { ok: false, message: error instanceof Error ? error.message.toUpperCase() : 'AIRCRAFT CHANGE UNAVAILABLE' };
  }
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
  if (action === 'purchaseCosmetic' && currency === 'SKY_TOKENS' && hubAccount.state !== 'account') { promptPurchaseSignIn(); return; }
  try {
    if (action === 'purchaseCosmetic' && !await pricingBackendReady()) return;
    const url = apiUrl('/api/profile');
    url.searchParams.set('pilotId', garageIdentity.pilotId);
    const response = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [action]: id, ...(action === 'purchaseCosmetic' ? { cosmeticCurrency: currency } : {}) }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? 'COSMETIC UPDATE FAILED');
    applyAuthoritativeHomeProfile(result as RemoteGarageProfile); garage.updateProfile(garageProfile);
    garage.showActionResult(action === 'equipCosmetic' ? 'COSMETIC EQUIPPED' : 'PAINT UNLOCKED AND EQUIPPED');
    if (action === 'purchaseCosmetic') { audioManager.playPurchaseSuccess(); hapticsManager.emit('rewardSuccess', `cosmetic:${id}`); }
    else hapticsManager.emit('confirmation');
  } catch (error) { garage.showActionResult(error instanceof Error ? error.message : 'SERVER UNAVAILABLE'); }
}

void verifyCheckoutReturn({ pilotId: garageIdentity.pilotId, pilotName: garageIdentity.displayName }).then(async result => {
  if (result.state === 'none') return;
  entryState = 'AIRCRAFT';
  garageReturnState = 'HANGAR';
  garageOverlay.classList.add('hub-aircraft');
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
  garageOverlay.classList.add('hub-aircraft');
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
  playMenuEntrance(garageOverlay);
  try {
    const profile = await loadGarageProfile();
    if (entryState !== 'AIRCRAFT' || request !== garageOpenRequest) return;
    garage.open(profile);
  } catch {
    if (entryState !== 'AIRCRAFT' || request !== garageOpenRequest) return;
    if (authoritativeHomeProfile) {
      garage.open(garageProfile);
      garage.showActionResult('SHOWING LAST SYNCED AIRCRAFT');
    } else {
      garage.showProfileUnavailable();
    }
  }
}

let hubViewRecorded = false;
function showHome(): Promise<void> {
  if (!hubViewRecorded || entryState !== 'HANGAR') { recordProductIntent('hub_viewed'); hubViewRecorded = true; }
  if (window.history.state?.airportChaosStoreView || window.history.state?.airportChaosEntryView) window.history.replaceState(null, '', window.location.href);
  audioManager.setMenuMusicDesired(true);
  entryState = 'HANGAR';
  abandonPendingJourneyLaunch();
  missionJourneyReturnPending = false;
  garageReturnState = 'HANGAR';
  garageOpenRequest += 1;
  if (hubPilotMenu.isOpen()) hubPilotMenu.close(false);
  if (garage.isOpen()) garage.close();
  gameStore.close();
  citySelector.hidden = true;
  missionJourney.hide();
  homeHangar.show(homeHangarData());
  void refreshHubSponsor();
  showAppHeader(undefined);
  showPendingRankHelmetUnlock(authoritativeHomeProfile?.pilotId, authoritativeHomeProfile?.pilotProgress?.level);
  playMenuEntrance(homeHangarElement);
  appHeader.aircraftPreviewHost.title = homeHangarData().aircraftName;
  return garage.showcase(appHeader.aircraftPreviewHost, garageProfile);
}

function closeCityHelp(restoreFocus = false): void {
  cityHelpDialog.hidden = true;
  if (restoreFocus) cityHelp.focus();
}

function showSelector(message = '', options: { preferDallas?: boolean; mode?: CityJourneyMode } = {}): void {
  if (options.mode) cityJourneyMode = options.mode;
  abandonPendingJourneyLaunch();
  try { sessionStorage.setItem(CITY_JOURNEY_MODE_KEY, cityJourneyMode); } catch { /* in-memory mode remains available */ }
  cityJourneyLaunching = false;
  cityJourneyTransitionUntil = 0;
  closeCityHelp();
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
  cityOptions.hidden = false;
  timeOptions.hidden = true;
  timeOptions.classList.remove('menu-card-carousel', 'multiplayer-mode-cards', 'time-selection-cards');
  timeOptions.removeAttribute('role');
  timeOptions.onwheel = null;
  multiplayerFreeFly.hidden = true;
  cityBack.textContent = 'BACK TO PILOT HUB';
  citySelectTitle.textContent = 'CHOOSE CITY';
  showAppHeader(undefined);
  citySelectDescription.textContent = 'Choose your city.';
  cityOptions.setAttribute('aria-label', cityJourneyMode === 'missions' ? 'Mission cities' : cityJourneyMode === 'multiplayer' ? 'Multiplayer cities' : 'Free Fly cities');
  cityHelp.setAttribute('aria-label', `${cityJourneyMode === 'missions' ? 'Missions' : cityJourneyMode === 'multiplayer' ? 'Multiplayer' : 'Free Fly'} help`);
  cityHelpCopy.textContent = cityJourneyMode === 'missions'
    ? 'Use the arrows, swipe, or tap a nearby city. View Dallas’s journey at any time. Complete Milwaukee training to unlock its missions.'
    : cityJourneyMode === 'multiplayer' ? 'Choose Dallas for Sky Duel. Free Fly remains available in Dallas and Milwaukee.'
      : 'Use the arrows, swipe, or tap a nearby city. Choose Continue, pick a time, and fly freely. Milwaukee is a training city; Dallas supports multiplayer. Locked cities cannot launch.';
  cityJourneyIndex = pendingDallasUnlock && cityJourneyMode === 'missions'
    ? Math.max(0, cityJourneyEntries.findIndex(entry => entry.id === 'milwaukee'))
    : preferredCityJourneyIndex(options.preferDallas === true);
  renderCityJourney();
  citySelectionError.textContent = message;
  citySelectionError.hidden = !message;
  playMenuEntrance(citySelector);
  if (menuEntrancesEnabled) celebrateDallasUnlock();
}

function showMissionJourney(pushHistory = true, refreshProgress = true): void {
  cityJourneyMode = 'missions';
  try { sessionStorage.setItem(CITY_JOURNEY_MODE_KEY, cityJourneyMode); } catch { /* current mode remains available */ }
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
  missionJourney.setCityLocked(!dallasUnlocked());
  missionJourney.setSignInRequired(false);
  missionJourney.show(window.history.state?.missionDetailsOpen === true);
  if (refreshProgress) void refreshJourneyProgress();
  showAppHeader(undefined);
  playMenuEntrance(missionJourneyElement);
}

function leaveMissionJourney(): void {
  if (missionJourney.isPanelOpen && window.history.state?.missionDetailsOpen) {
    window.history.go(-2);
    return;
  }
  if (window.history.state?.airportChaosEntryView === 'MISSION_JOURNEY') window.history.back();
  else showSelector('', { mode: 'missions' });
}

function openMissionDetails(): void {
  if (entryState === 'MISSION_JOURNEY') window.history.pushState({ airportChaosEntryView: 'MISSION_JOURNEY', missionDetailsOpen: true }, '', window.location.href);
}

function closeMissionDetails(): void {
  if (window.history.state?.missionDetailsOpen) window.history.back();
  else missionJourney.closePanel();
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
  if (!cityHelpDialog.hidden) { closeCityHelp(true); return; }
  if (citySelector.dataset.view === 'multiplayer') {
    if (window.history.state?.airportChaosEntryView === 'MULTIPLAYER_MODES') window.history.back();
    else showSelector('', { mode: 'multiplayer', preferDallas: true });
    return;
  }
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

cityHelp.addEventListener('click', () => {
  cityHelpDialog.hidden = false;
  cityHelpDialog.querySelector<HTMLButtonElement>('[data-city-help-close]')!.focus();
});
cityHelpDialog.querySelector<HTMLButtonElement>('[data-city-help-close]')!.addEventListener('click', () => closeCityHelp(true));
registerUiBackLayer({
  id: 'city-journey-help',
  priority: uiBackPriority.blockingModal,
  isActive: () => !cityHelpDialog.hidden,
  close: () => closeCityHelp(true),
});

registerUiBackLayer({
  id: 'city-selection',
  priority: uiBackPriority.surface,
  isActive: () => !citySelector.hidden,
  close: returnFromCitySelection,
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
    showSelector('Unable to start Milwaukee training. Please try again.', { mode: 'missions' });
  }
}

async function enterCity(city: CityDefinition, requestedTimePreset: CityTimeOfDay = 'day', trainingSession = false, modeOverride?: LaunchMode): Promise<void> {
  if (pendingAircraftSelection && !await pendingAircraftSelection) throw new Error('Aircraft change was not confirmed');
  if (city.status !== 'available' || !city.loadWorld) return;
  const timePreset = modeOverride === 'sky-duel' ? 'day' : resolveCityTimePreset(city, requestedTimePreset);
  if (cityJourneyMode === 'missions' && city.id === 'dallas' && !dallasUnlocked()) { showSelector('Complete Milwaukee training to unlock Dallas.'); return; }
  const launchProgress = authoritativeHomeProfile?.pilotProgress;
  setFlightLaunchAircraft(authoritativeHomeProfile ? {
    pilotId: garageIdentity.pilotId,
    type: garageProfile.selectedAircraft,
    equippedCosmetics: { ...garageProfile.cosmetics?.equipped },
    pilotPreview: modeOverride === 'sky-duel' && authoritativeHomeProfile.pilotName &&
      launchProgress && Number.isSafeInteger(launchProgress.level) && launchProgress.level > 0
      ? { name: authoritativeHomeProfile.pilotName, level: launchProgress.level,
          credits: authoritativeHomeProfile.credits, skyTokens: authoritativeHomeProfile.skyTokens ?? 0 }
      : undefined,
  } : null);
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
  url.searchParams.set('time', timePreset);
  url.searchParams.set(LAUNCH_MODE_PARAM, modeOverride ?? cityJourneyMode);
  if (trainingSession) url.searchParams.set('training', '1');
  else url.searchParams.delete('training');
  if (cityJourneyMode === 'missions' && city.id === 'dallas' && journeyAttemptId) url.searchParams.set('journeyAttempt', journeyAttemptId);
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
  if (cityJourneyMode === 'multiplayer') {
    if (city.id === 'dallas') showDallasMultiplayerCards(city);
    else if (city.id === 'milwaukee') {
      void enterCity(city, 'day', false, 'free-fly').catch((error: unknown) => {
        console.error('[city-entry] Unable to initialize gameplay.', error);
        showSelector('Unable to load this city.');
      });
    }
    else showTimeSelection(city);
    return;
  }
  if (cityJourneyMode === 'free-fly') {
    abandonPendingJourneyLaunch();
    showTimeSelection(city);
    return;
  }
  if (city.id === 'dallas') {
    showMissionJourney();
    return;
  }
  if (cityJourneyMode === 'missions' && city.timePresets.length === 1) {
    const preset = city.timePresets[0]!;
    try { localStorage.setItem(`airport-chaos-time-${city.id}`, preset); } catch { /* launch with the configured time */ }
    void enterCity(city, preset).catch((error: unknown) => {
      console.error('[city-entry] Unable to initialize gameplay.', error);
      showSelector('Unable to load this city.');
    });
    return;
  }
  showTimeSelection(city, 'CITY_SELECTION');
}

function showDallasMultiplayerCards(city: CityDefinition, pushHistory = true): void {
  closeCityHelp();
  if (pushHistory && window.history.state?.airportChaosEntryView !== 'MULTIPLAYER_MODES')
    window.history.pushState({ airportChaosEntryView: 'MULTIPLAYER_MODES' }, '', window.location.href);
  citySelector.dataset.view = 'multiplayer';
  cityOptions.hidden = true;
  timeOptions.hidden = false;
  // Existing Free Fly entry is exposed only for local P1 world inspection.
  // The server still validates all authenticated actions and rewards.
  multiplayerFreeFly.hidden = !(['localhost', '127.0.0.1'].includes(window.location.hostname) &&
    new URLSearchParams(window.location.search).get('p1qa') === '1');
  cityBack.textContent = 'BACK TO CITIES';
  citySelectTitle.textContent = 'DALLAS MULTIPLAYER';
  citySelectDescription.textContent = '';
  showAppHeader(undefined);
  timeOptions.replaceChildren();
  timeOptions.classList.remove('time-selection-cards');
  timeOptions.classList.add('menu-card-carousel', 'multiplayer-mode-cards');
  timeOptions.removeAttribute('role');
  timeOptions.onwheel = null;
  const modes = [
    { id: 'sky', title: 'SKY DUEL', subtitle: '1 VS 1', playable: true },
    { id: 'squad', title: 'SQUAD BATTLE', subtitle: '3 VS 3', playable: false },
    { id: 'fleet', title: 'FLEET WAR', subtitle: '', playable: false },
    { id: 'city', title: 'CITY CONTROL', subtitle: 'CAPTURE & HOLD', playable: false },
  ] as const;
  const fullCardArtwork = {
    sky: 'sky-duel',
    squad: 'squad-battle',
    fleet: 'fleet-war',
    city: 'city-control',
  } as const;
  const track = document.createElement('div');
  track.className = 'menu-card-carousel-track multiplayer-mode-track';
  const cards: HTMLElement[] = [];
  let enteringSkyDuel = false;
  let ignoreCardClickUntil = 0;
  let selectedIndex = 0;
  for (const mode of modes) {
    const { card } = createMenuCarouselCard(`city-time-option multiplayer-mode-card multiplayer-mode-${mode.id}${mode.playable ? ' is-playable' : ' is-coming-soon'}`, 'multiplayer-mode-art', 'multiplayer-mode-copy');
    card.classList.add('is-full-artwork');
    card.setAttribute('aria-label', mode.id === 'sky' ? 'Sky Duel, 1 versus 1, entry 500 Credits, prize 1,000 Credits, first to 3'
      : mode.id === 'squad' ? 'Squad Battle, 3 versus 3, coming soon'
      : mode.id === 'city' ? 'City Control, capture and hold, coming soon' : 'Fleet War, coming soon');
    if (mode.playable) card.setAttribute('role', 'button');
    const fullCard = document.createElement('img');
    fullCard.className = 'multiplayer-mode-full-card-image';
    fullCard.src = `/media/multiplayer/${fullCardArtwork[mode.id]}-card.png`;
    fullCard.alt = '';
    fullCard.setAttribute('aria-hidden', 'true');
    card.replaceChildren(fullCard);
    track.append(card);
    cards.push(card);
  }
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'city-journey-arrow city-journey-arrow-previous';
  previous.setAttribute('aria-label', 'Previous multiplayer mode');
  previous.textContent = '‹';
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'city-journey-arrow city-journey-arrow-next';
  next.setAttribute('aria-label', 'Next multiplayer mode');
  next.textContent = '›';
  const selectMode = (index: number): void => {
    selectedIndex = Math.max(0, Math.min(index, modes.length - 1));
    cards.forEach((card, cardIndex) => {
      const distance = cardIndex - selectedIndex;
      positionMenuCarouselCard(card, distance);
      card.setAttribute('aria-current', cardIndex === selectedIndex ? 'true' : 'false');
      if (modes[cardIndex]?.playable) {
        card.tabIndex = cardIndex === selectedIndex ? 0 : -1;
        card.setAttribute('aria-disabled', enteringSkyDuel ? 'true' : 'false');
      }
    });
    previous.hidden = previous.disabled = selectedIndex === 0;
    next.hidden = next.disabled = selectedIndex === modes.length - 1;
  };
  const startSkyDuel = (): void => {
    if (selectedIndex !== 0 || enteringSkyDuel || performance.now() < ignoreCardClickUntil) return;
    enteringSkyDuel = true;
    cards[0]?.setAttribute('aria-disabled', 'true');
    hapticsManager.emit('selection');
    void enterCity(city, 'day', false, 'sky-duel').catch((error: unknown) => {
      console.error('[sky-duel] Unable to initialize gameplay.', error);
      enteringSkyDuel = false;
      showDallasMultiplayerCards(city, false);
      citySelectionError.textContent = 'Unable to load Sky Duel.';
      citySelectionError.hidden = false;
    });
  };
  cards.forEach((card, index) => card.addEventListener('click', () => {
    if (performance.now() < ignoreCardClickUntil) return;
    if (index !== selectedIndex) selectMode(index);
    else if (modes[index]?.playable) startSkyDuel();
  }));
  cards[0]?.addEventListener('keydown', (event) => {
    if (event.target === cards[0] && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      startSkyDuel();
    }
  });
  previous.addEventListener('click', () => selectMode(selectedIndex - 1));
  next.addEventListener('click', () => selectMode(selectedIndex + 1));
  track.append(previous, next);
  timeOptions.append(track);
  timeOptions.tabIndex = 0;
  timeOptions.setAttribute('aria-label', 'Dallas multiplayer modes');
  timeOptions.onkeydown = (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      selectMode(selectedIndex + (event.key === 'ArrowRight' ? 1 : -1));
    }
  };
  installMenuCarouselSwipe(timeOptions, direction => {
    ignoreCardClickUntil = performance.now() + 350;
    if (direction) selectMode(selectedIndex + direction);
  });
  selectMode(selectedIndex);
  citySelectionError.hidden = true;
  playMenuEntrance(citySelector);
}

multiplayerFreeFly.addEventListener('click', () => {
  const dallas = cities.find(city => city.id === 'dallas' && city.status === 'available');
  if (dallas) showTimeSelection(dallas, 'MULTIPLAYER_MODES');
});

function showTimeSelection(city: CityDefinition, returnTo: 'CITY_SELECTION' | 'MISSION_JOURNEY' | 'MULTIPLAYER_MODES' = 'CITY_SELECTION'): void {
  closeCityHelp();
  timeSelectionReturnState = returnTo;
  if (window.history.state?.airportChaosEntryView !== 'TIME_SELECTION') {
    window.history.pushState({ airportChaosEntryView: 'TIME_SELECTION' }, '', window.location.href);
  }
  citySelector.dataset.view = 'time';
  cityOptions.hidden = true;
  multiplayerFreeFly.hidden = true;
  timeOptions.classList.remove('multiplayer-mode-cards');
  timeOptions.classList.add('menu-card-carousel', 'time-selection-cards');
  timeOptions.setAttribute('role', 'listbox');
  timeOptions.setAttribute('aria-label', 'Time of day');
  timeOptions.tabIndex = 0;
  timeOptions.replaceChildren();
  timeOptions.hidden = false;
  cityBack.textContent = returnTo === 'MISSION_JOURNEY' ? 'BACK TO MISSION JOURNEY' : returnTo === 'MULTIPLAYER_MODES' ? 'BACK TO MULTIPLAYER' : 'BACK TO CITIES';
  citySelectTitle.textContent = 'CHOOSE TIME';
  showAppHeader(undefined);
  citySelectDescription.textContent = `${city.displayName} · Choose a time to fly.`;
  let preferred = 'dusk';
  try { preferred = localStorage.getItem(`airport-chaos-time-${city.id}`) ?? 'dusk'; } catch { /* default dusk */ }
  preferred = resolveCityTimePreset(city, preferred);
  const track = document.createElement('div');
  track.className = 'menu-card-carousel-track';
  const cards: HTMLElement[] = [];
  let selectedIndex = Math.max(0, city.timePresets.findIndex(preset => preset === preferred));
  let launching = false;
  let ignoreCardClickUntil = 0;
  const launchPreset = (index: number): void => {
    if (index !== selectedIndex || launching || performance.now() < ignoreCardClickUntil) return;
    const preset = city.timePresets[index];
    if (!preset) return;
    launching = true;
    hapticsManager.emit('selection');
    try { localStorage.setItem(`airport-chaos-time-${city.id}`, preset); } catch { /* no persistence available */ }
    void enterCity(city, preset, false, cityJourneyMode === 'multiplayer' ? 'free-fly' : undefined).catch((error: unknown) => {
      console.error('[city-entry] Unable to initialize gameplay.', error);
      launching = false;
      showSelector('Unable to load this city.');
    });
  };
  for (const [index, preset] of city.timePresets.entries()) {
    const option = document.createElement('article');
    option.className = 'game-card-frame menu-selection-card menu-card-carousel-card city-option city-time-option';
    option.classList.add(`city-${city.id}`);
    option.classList.add(`city-time-${preset}`);
    if (preset === preferred) option.classList.add('is-preferred');
    option.setAttribute('role', 'option');
    option.setAttribute('aria-label', preset === 'day' ? 'Day, daytime flying'
      : preset === 'dusk' ? 'Night, dusk flying'
      : 'Evening, golden-hour flying');
    option.addEventListener('click', () => {
      if (performance.now() < ignoreCardClickUntil) return;
      if (index !== selectedIndex) selectTime(index);
      else launchPreset(index);
    });
    option.addEventListener('keydown', event => {
      if (event.target !== option || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      launchPreset(index);
    });
    option.classList.add('is-full-artwork');
    const image = document.createElement('img');
    image.className = 'city-time-full-card-image';
    image.src = `/media/city-journey/${preset}-card.png`;
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    option.append(image);
    track.append(option);
    cards.push(option);
  }
  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'city-journey-arrow city-journey-arrow-previous';
  previous.setAttribute('aria-label', 'Previous time');
  previous.textContent = '‹';
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'city-journey-arrow city-journey-arrow-next';
  next.setAttribute('aria-label', 'Next time');
  next.textContent = '›';
  function selectTime(index: number): void {
    selectedIndex = Math.max(0, Math.min(index, cards.length - 1));
    cards.forEach((card, cardIndex) => {
      const selected = cardIndex === selectedIndex;
      positionMenuCarouselCard(card, cardIndex - selectedIndex);
      card.setAttribute('aria-selected', selected ? 'true' : 'false');
      card.tabIndex = selected ? 0 : -1;
    });
    previous.hidden = previous.disabled = selectedIndex === 0;
    next.hidden = next.disabled = selectedIndex === cards.length - 1;
  }
  previous.addEventListener('click', () => selectTime(selectedIndex - 1));
  next.addEventListener('click', () => selectTime(selectedIndex + 1));
  track.append(previous, next);
  timeOptions.append(track);
  timeOptions.onkeydown = event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    selectTime(selectedIndex + (event.key === 'ArrowRight' ? 1 : -1));
  };
  let wheelAt = 0;
  timeOptions.onwheel = event => {
    if (Math.abs(event.deltaX) < 18 || Math.abs(event.deltaX) <= Math.abs(event.deltaY) || performance.now() - wheelAt < 360) return;
    event.preventDefault();
    wheelAt = performance.now();
    selectTime(selectedIndex + (event.deltaX > 0 ? 1 : -1));
  };
  installMenuCarouselSwipe(timeOptions, direction => {
    ignoreCardClickUntil = performance.now() + 350;
    if (direction) selectTime(selectedIndex + direction);
  });
  selectTime(selectedIndex);
  playMenuEntrance(citySelector);
}
function returnFromTimeSelection(): void {
  if (window.history.state?.airportChaosEntryView === 'TIME_SELECTION') window.history.back();
  else if (timeSelectionReturnState === 'MISSION_JOURNEY') showMissionJourney(false);
  else if (timeSelectionReturnState === 'MULTIPLAYER_MODES') {
    const dallas = cities.find(city => city.id === 'dallas' && city.status === 'available');
    if (dallas) showDallasMultiplayerCards(dallas, false);
  }
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
  const directMultiplayerEntry = url.searchParams.get('entry') === 'multiplayer';
  const dallasUnlockReceipt = Number(url.searchParams.get('dallasUnlock'));
  pendingDallasUnlock = dallasUnlockReceipt > 0 && authoritativeHomeProfile?.tutorial?.dallasUnlocked === true &&
    authoritativeHomeProfile.tutorial.completedAt === dallasUnlockReceipt;
  if (pendingDallasUnlock) cityJourneyMode = 'missions';
  const directJourneyEntry = url.searchParams.get('entry') === 'journey';
  const journeyReceipt = url.searchParams.get('journeyReceipt');
  let pendingJourneyCelebration: { mission: number; credits: number } | undefined;
  if (authResult || directCityEntry || directMultiplayerEntry || directJourneyEntry || url.searchParams.has('dallasUnlock')) {
    url.searchParams.delete('auth');
    url.searchParams.delete('provider');
    url.searchParams.delete('linked');
    url.searchParams.delete('entry');
    url.searchParams.delete('journeyReceipt');
    url.searchParams.delete('dallasUnlock');
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
  } else if (directJourneyEntry) {
    await showHome();
    showMissionJourney(false, false);
    const progress = await refreshJourneyProgress();
    const earnedCredits = journeyReceipt ? takeJourneyRewardReceipt(journeyReceipt, garageIdentity.pilotId) : 0;
    if (journeyReceipt && progress) {
      const missions = [progress, ...Array.from({ length: missionJourneyStages.length - 1 }, (_, index) => {
        const mission = progress[`mission${String(index + 2).padStart(2, '0')}` as keyof typeof progress];
        return mission && typeof mission === 'object' ? mission : undefined;
      })];
      const completedIndex = missions.findIndex(mission => mission?.completed && mission.firstAttemptId === journeyReceipt);
      if (completedIndex >= 0) pendingJourneyCelebration = { mission: completedIndex + 1, credits: earnedCredits };
    }
  } else if (directMultiplayerEntry) {
    await showHome();
    showSelector('', { preferDallas: true, mode: 'multiplayer' });
    const dallas = cities.find(city => city.id === 'dallas' && city.status === 'available');
    if (dallas) showDallasMultiplayerCards(dallas);
  } else if (directCityEntry) {
    await showHome();
    if (pendingDallasUnlock) showSelector('', { mode: 'missions' });
    else await requestHubFly();
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
  const startupMenuRoot = skyTokenStore.isOpen() ? document.querySelector<HTMLElement>('.sky-token-overlay')
    : entryState === 'PILOT_MENU' ? pilotMenuOverlay
    : entryState === 'AIRCRAFT' ? garageOverlay
    : entryState === 'STORE' ? gameStoreElement
    : entryState === 'CITY_SELECTION' ? citySelector
    : entryState === 'MISSION_JOURNEY' ? missionJourneyElement
    : entryState === 'HANGAR' && homeHangar.isVisible() ? homeHangarElement : null;
  if (startupMenuRoot) prepareMenuEntrance(startupMenuRoot);
  startupLoading.update(1);
  await startupLoading.finish();
  menuEntrancesEnabled = true;
  revealMenuEntrance();
  if (pendingJourneyCelebration) {
    const { mission, credits } = pendingJourneyCelebration;
    const balance = garageProfile.credits;
    missionJourney.celebrateCompletion(mission, credits > 0 && balance >= credits
      ? source => appHeader.animateCreditsEarned(source, balance - credits, balance)
      : undefined);
  }
  if (entryState === 'CITY_SELECTION') celebrateDallasUnlock();
  if (Capacitor.getPlatform() === 'ios' && entryState !== 'FLIGHT' && entryState !== 'TUTORIAL') {
    void audioManager.unlock();
  }
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
