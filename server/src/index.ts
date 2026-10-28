import {transportPose,transportTuning,transportFootprintRadius} from '../../shared/giant-incoming.mjs';
import { aircraftHitRadii, remoteAircraftCollisionRadius, remoteAircraftContactRadius, remoteAircraftScale, remoteAircraftVisualScale } from '../../shared/remote-aircraft-visual-rules.mjs';
import {createTransportEncounter,loadTransportBuildings,transportAltitude,transportImpact,transportAircraftImpact,transportHullImpact,transportFortressImpact,transportFortressTarget,transportProjectileDisposition,stepTransportEncounter,type TransportEncounter} from './giant-incoming.js';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket, { WebSocketServer } from 'ws';
import { PlayerProfileStore, normalizePilotName, type LegacyProfileImport, type ObjectiveActivity, type PlayerProfile, type ProfileProgress, type WeeklyLeaderboardCategory } from './player-profiles.js';
import type { XpAwardResult } from './pilot-xp-ledger.js';
import { PilotProfileSummaryStore } from './pilot-profile-summary.js';
import { cityCapabilities, routeDefinition } from '../../shared/city-registry.mjs';
import { cityDiscoveries } from '../../shared/city-discoveries.mjs';
import { aircraftPresentationMuzzleSockets } from '../../shared/aircraft-presentation-scale.mjs';
import { primaryTerritoryAt, territoriesForCity, territoryContains, territoryMembershipTransition, type CityTerritory } from '../../shared/city-territories.mjs';
import { missionForCity, missionsForCity, type CityMission } from '../../shared/city-missions.mjs';
import { advanceMission, initializeMissionAttempt, type MissionSignal } from './mission-engine.js';
import { challengeForCity, dfwSpeedGates } from '../../shared/city-challenges.mjs';
import { publicStoreCatalog } from '../../shared/store-catalog.mjs';
import { journeyGateCrossing, crossesJourneyGateWrongWay, journeyDallas01, journeyDallas02, journeyDallas03, journeyDallas04, journeyDallas05, journeyDallas06, journeyDallas07, journeyDallas08, journeyDallas09, journeyDallas10, journeyDallas11, journeyDallas12, journeyDallas13, journeyDallas14, journeyDallas15, journeyDallas16, journeyDallas17, journeyDallas18, journeyDallas19, journeyDallas20, journeyDallas21, journeyDallas22, journeyDallas23, journeyDallas24 } from '../../shared/journey-mission.mjs';
import { reinforcementApproachPoint } from './reinforcement-approach.js';
import { createMonsterEncounter, loadMonsterDistrictBuildings, monsterAttack, monsterBodyContact, monsterHandContact, monsterHandPositions, monsterImpact, stepMonsterEncounter, monsterProjectileHits, recordMonsterFiringPosition, segmentBlockedByBuildings, type MonsterEncounter } from './monster-arrival.js';
import { monsterHandSwipe } from '../../shared/monster-hand-swipe.mjs';
import { authorizedJourneyAirborneSpawn } from './journey-airborne-spawn.js';
import { journeyFormationStatus, type FormationStatus } from '../../shared/journey-formation.mjs';
import { excludesFocusedBotInteraction, missionFocusForAttempt } from '../../shared/mission-focus.mjs';
import { journeyInteractionExcluded } from './journey-isolation.js';
import { boundJourneyHunterPoint, insideJourneyHunterArena, journeyHunterSteeringTarget, keepJourneyHunterInside } from './journey-hunter-airspace.js';
import { aceDamageAuthorized } from './journey-ace.js';
import { CrossfireFireCoordinator } from './journey-crossfire.js';
import { createRearGuardFireState, finalInterceptEscortsCleared, rearGuardTakeoff, rearGuardShooter, rearGuardShotResolved, rearGuardReinforcementsJoined, shouldBeginReinforcements, type RearGuardFireState } from './rear-guard-fire.js';
import { escapeInterval } from './journey-escape.js';
import { JOURNEY_PAUSE_LIMIT_MS, JourneyAttemptStore, type JourneyAttempt } from './journey-attempts.js';
import { localJourneyQaUnlockEnabled, stagingJourneyQaUnlockEnabled } from './staging-journey-qa.js';
import { SpeedGateTracker } from './speed-gate-validation.js';
import { observedChampionshipTouchdown } from './championship-landing.js';
import { aircraftGroundOffset, airportForCity, cityAirports } from '../../shared/city-airports.mjs';
import { maxHealthForAircraft } from '../../shared/aircraft-health.mjs';
import { earnedRankDefinitions, PILOT_LEVEL_CAP, utcDayId } from '../../shared/pilot-progression.mjs';
import { landingGradeForScore, landingPrecisionScore } from '../../shared/landing-scoring.mjs';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { dallasDisplayNames as place } from '../../shared/dallas-display-names.mjs';
import { repairsForCity } from '../../shared/city-repairs.mjs';
import { cargoCreditReward, challengeCreditReward, economyRewards } from '../../shared/reward-economy.mjs';
import { creditReceipt } from '../../shared/credit-receipts.mjs';
import { AIM_ENVELOPE, AIM_SWITCH_MARGIN, COMBAT_RANGE, fireIntervalMs, projectileDamageForAircraft, aimTargetScore, aimGoal, biasAim, stepAim, interpolateAim, insideDynamicLock, ballisticShotSpeed, PROTOCOL_VERSION } from '../../shared/protocol.mjs';
import { AnalyticsStore, analyticsHost, validAdminPassword, type AnalyticsContext, type AnalyticsEventName } from './analytics.js';
import { parseClientIntent } from './analytics-catalog.js';
import { FirehawkPayments } from './firehawk-payments.js';
import { SkyTokenPayments, productionWebOrigin } from './sky-token-payments.js';
import { NativePurchaseLedger, NativePurchaseVerifier, googleNotificationToken, googleSkyTokenNotification, googleVoidedPurchaseNotification, type NativePurchaseProvider } from './native-purchases.js';
import { PilotSessionStore, normalizeAccountEmail, shouldReplaceRealtimeConnection, type SessionIdentity } from './session-auth.js';
import { createAuthorizationUrl, exchangeAndVerifyProviderCode, nativeProviderConfig, pkceChallenge, providerConfig, verifyNativeProviderToken, type NativeAuthPlatform, type OAuthProvider } from './oauth-providers.js';
import { allowedOAuthReturn, rejectsApiRequestOrigin, sameOriginJsonRequest } from './auth-request-security.js';
import { applyCors, isNativeAppOrigin, isTrustedRequestOrigin, nativePlatformForOrigin } from './request-origin.js';
import { validateClientRotation, validateClientTransform } from './transform-validation.js';
import { policyPage } from './legal-pages.js';
import { firehawkProduct } from '../../shared/aircraft-economy.mjs';
import { skyTokenPack, skyTokenPacks, type SkyTokenPackId } from '../../shared/sky-token-economy.mjs';
import { cosmeticCatalog } from '../../shared/cosmetics.mjs';
import { advanceCargoRush, canCompleteLandingChaosEvent } from '../../shared/chaos-event-rules.mjs';
import { BoundedRateLimiter, trustedClientIp, type RateLimitRule } from './rate-limiter.js';
import { TrialNetworkGuard } from './trial-network-guard.js';
import { tutorialLandingApproach, tutorialStepPrerequisitesResolved, tutorialSteps, type TutorialLessonStep, type TutorialStepStatus } from '../../shared/tutorial-flight-rules.mjs';
import { trainingSlideIds } from '../../shared/training-slides.mjs';
import { AdMobSsvVerifier, RewardedAdStore, type RewardedAdClientEvent } from './rewarded-ads.js';
import { ReferralFlightTracker } from './referral-flight.js';
import { SkyDuelStore, type DuelOutcome } from './sky-duel-store.js';
import { closestDuelOpponent, type DuelQueueEntry } from './sky-duel-matchmaking.js';
import { duelTakedownWinner, duelTimeoutWinner } from './sky-duel-rules.js';
import { competitiveModes } from '../../shared/competitive-modes.mjs';
import { skyDuelAirportIds, skyDuelArenaCenter, skyDuelRunwaySpawn } from './sky-duel-spawn.js';

type AircraftType = 'trainer' | 'privateJet' | 'cargo' | 'fighter';
type CityId = 'milwaukee' | 'dallas';
type PlayerLifeState = 'alive' | 'destroyed' | 'respawning';
type PlayerRosterStatus = 'flying' | 'onGround' | 'destroyed' | 'respawning' | 'spawnSafe';

type Transform = {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  aircraftType: AircraftType;
};

type PlayerState = Transform & {
  pilotId: string;
  accountId?: string;
  sessionTokenHash?: string;
  profile: PlayerProfile;
  entityType: 'player';
  isBot: boolean;
  boostActive: boolean;
  cityId: CityId;
  timePreset?: 'day' | 'dusk' | 'evening';
  lastDiscoveryCheckAt?: number;
  displayName: string;
  score: number;
  health: number;
  lifeState: PlayerLifeState;
  hasRespawnTransform: boolean;
  lastFireAt: number;
  spawnProtectedUntil: number;
  lockedTargetId?: string;
  assistedAim?: { x: number; y: number; updatedAt: number; targetId?: string };
  aimSamples?: Array<{ id: number; x: number; y: number; at: number }>;
  aimSequence?: number;
  velocity: Vector3;
  lastStateAt: number;
  lastAcceptedPosition: Vector3;
  lastAcceptedTransformAt: number;
  chaosQaEnabled: boolean;
  tutorialMode: boolean;
  skyDuelMode?: boolean;
  skyDuelMatchId?: string;
  skyDuelPractice?: boolean;
  skyDuelPracticeRespawnAt?: number;
  skyDuelPracticeOwnerId?: string;
  milwaukeeBotsProvoked?: boolean;
  trainingOwnerId?: string;
  selectionRevision?: number;
  spawnSlot?: number;
  lastEquipRequestId?: number;
  territoryIds: Set<string>;
  distanceRewardMeters?: number;
  distanceXpMeters?: number;
  lastDistancePersistAt?: number;
  missionDistanceMeters?: number;
  missionLastFlightAt?: number;
  bot?: BotRuntime;
};

type BotPersonality = 'explorer' | 'racer' | 'hunter' | 'casual';
type BotPhase = 'spawn' | 'taxi' | 'takeoff' | 'cruise' | 'activity' | 'land' | 'approach' | 'attackPass' | 'extend' | 'reposition' | 'respawn';
type BotRuntime = {
  personality: BotPersonality;
  journeyAttemptId?: string;
  journeyTargetPlayerId?: string;
  journeyProvoked?: boolean;
  journeyLeader?: boolean;
  journeyEscape?: boolean;
  journeyAce?: boolean;
  journeyCrossfire?: boolean;
  journeyRearGuardEscort?: 1 | 2 | 3 | 4;
  journeyEscortMissionId?: string;
  escortReturnUntil?: number;
  journeySiege?: boolean;
  journeyBreakout?: boolean;
  journeyDoubleOrdinal?: 1 | 2;
  journeyLegendary?: boolean;
  journeyPilotOutside?: boolean;
  journeyReturnGraceUntil?: number;
  phase: BotPhase;
  route: Vector3[];
  routeIndex: number;
  speed: number;
  desiredSpeed: number;
  nextDecisionAt: number;
  nextFireAt: number;
  respawnAt: number;
  homeAirportIndex: number;
  combatTargetId?: string;
  combatWaypoint?: Vector3;
  combatPhaseUntil: number;
  combatWaypointRefreshAt: number;
  attackFireAfter: number;
  combatTurnSign: -1 | 1;
  bankControl: number;
  attackShots?: number;
  noFireReason?: string;
  noFireLoggedAt?: number;
  blindZoneEscapeUntil: number;
  defenseTerritoryId?: string;
  defenseTargetId?: string;
  defenseReleaseAt?: number;
  defenseSpawned?: boolean;
};

type Vector3 = { x: number; y: number; z: number };
type ProjectileMode = 'ballistic';
type DynamicEventType = 'skyRush' | 'supplyDrop' | 'emergencyEscort' | 'cargoConvoy' | 'riskZone' | 'mostWanted' | 'aceIntercept' | 'vipEscort' | 'goldenSkyRun' | 'cityEmergency' | 'stormLanding' | 'fogApproach' | 'cargoRush' | 'soloAirportSprint';
type DynamicEventLifecycle = 'available' | 'active' | 'completed' | 'failed' | 'cooldown';
type EventRoutePoint = Vector3;
type CityEvent = {
  id: string;
  cityId: CityId;
  type: DynamicEventType;
  lifecycle: DynamicEventLifecycle;
  createdAt: number;
  activeAt: number;
  expiresAt: number;
  cooldownUntil: number;
  objective: EventRoutePoint;
  route: EventRoutePoint[];
  routeSpeed: number;
  eventRouteIds: string[];
  eventAircraftType?: AircraftType;
  eventCombatMode?: 'noncombat' | 'attackable';
  rare: boolean;
  bossHealth?: number;
  bossMaxHealth?: number;
  damageContribution: Map<string, number>;
  participants: Set<string>;
  progress: Map<string, number>;
  rewardsGiven: Set<string>;
  winnerId?: string;
  wantedPlayerId?: string;
  wantedStartedAt?: number;
  riskMode?: 'storm' | 'lowAltitude' | 'highAltitude' | 'downtownDanger';
  targetAirportId?: string;
  pickupAirportId?: string;
  riskRadius: number;
  goldenDrop: boolean;
  qaShortTimer: boolean;
  lastBroadcastAt: number;
};

type ChaosQaEvent = 'mostWanted' | 'supplyDrop' | 'goldenDrop' | 'skyRush' | 'stormRisk' | 'lowAltitudeRisk' | 'highAltitudeRisk' | 'downtownRisk' | 'aceIntercept' | 'vipEscort' | 'goldenSkyRun' | 'cityEmergency' | 'stormLanding' | 'fogApproach' | 'cargoRush' | 'soloAirportSprint';

type ProjectileState = {
  projectileId: string;
  ownerId: string;
  cityId: CityId;
  damage: number;
  position: Vector3;
  direction: Vector3;
  traveled: number;
  speed: number;
  mode: ProjectileMode;
  clientShotId?: string;
  privateAttemptId?: string;
  privateRecipientId?: string;
  skyDuelMatchId?: string;
  skyDuelPractice?: boolean;
};
type ActiveChallenge = { challengeId: string; cityId: CityId; startedAt: number; lastGateAt: number; gateIndex: number; rewarded: boolean };

const players = new Map<string, PlayerState>();
const lastSentCredits = new Map<string, number>();
const repairCooldowns = new Map<string, number>();
const repairLastPosition = new Map<string, { x: number; y: number; z: number }>();
const airportRepairStays = new Map<string, { airportId: string; since: number }>();
const repairCheckMs = 500;
const repairBeaconCooldownMs = 90_000;
const repairHeartCooldownMs = 60_000;
const repairBeaconFraction = 0.45;
const airportRepairDelayMs = 4_000;
const repairAirportGroundSpeed = 8;
const repairAirportGroundAltitude = 45;
// The small (257x257) source grid is also needed for server-owned bot flight.
// Sample it exactly as Dallas rawHeight() does; fixed world Y is not AGL.
const dallasTerrain = (() => {
  const data = JSON.parse(readFileSync(new URL('../../client/src/data/dallas-elevation.json', import.meta.url), 'utf8')) as {
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
    width: number; height: number; baseElevation: number; scale: number; elevations: string;
  };
  const bytes = Buffer.from(data.elevations, 'base64');
  const samples = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  const sample = (x: number, z: number) => data.baseElevation + samples[z * data.width + x] * data.scale;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const elevationAt = (worldX: number, worldZ: number) => {
    const x = Math.max(0, Math.min(1, (worldX - data.bounds.minX) / (data.bounds.maxX - data.bounds.minX))) * (data.width - 1);
    const z = Math.max(0, Math.min(1, (worldZ - data.bounds.minZ) / (data.bounds.maxZ - data.bounds.minZ))) * (data.height - 1);
    const x0 = Math.floor(x), z0 = Math.floor(z), x1 = Math.min(data.width - 1, x0 + 1), z1 = Math.min(data.height - 1, z0 + 1);
    return lerp(lerp(sample(x0, z0), sample(x1, z0), x - x0), lerp(sample(x0, z1), sample(x1, z1), x - x0), z - z0);
  };
  const airportElevations = new Map<string, number>([
    ...cityAirports.dallas.map(airport => [airport.id, elevationAt(airport.x, airport.z)] as [string, number]),
    ...dfwSpeedGates.map((gate, index) => [`dfw-speed:${index}`, elevationAt(gate.x, gate.z)] as [string, number]),
  ]);
  return { elevationAt, airportElevations };
})();
const dallasAirportElevations = dallasTerrain.airportElevations;
const monsterDistrictBuildings = loadMonsterDistrictBuildings();
const monsterEncounters = new Map<string, MonsterEncounter>();
const transportBuildings = loadTransportBuildings();
const transportFlightAltitude = transportAltitude(transportBuildings,dallasTerrain.elevationAt);
const transportEncounters = new Map<string,TransportEncounter>();
const transportReady = new Set<string>();
const journeyCountdownComplete = new Set<string>();
const activeChallenges = new Map<string, ActiveChallenge>();
const flightRecordCandidates = new Map<string, { topSpeed: number; highestAltitude: number; distance: number }>();
type PvpChallenge = { id: string; mode: 'dogfight' | 'airportSprint'; challengerId: string; opponentId: string; cityId: CityId; destinationAirportId?: string; status: 'pending' | 'countdown' | 'active'; expiresAt: number; startsAt?: number };
const pvpChallenges = new Map<string, PvpChallenge>();
type SkyDuelSession = {
  id: string; playerA: string; playerB: string; phase: 'loading' | 'countdown' | 'launch' | 'active' | 'overtime';
  practice?: boolean; aiOpponent?: boolean;
  loadingEndsAt: number; readyA: boolean; readyB: boolean;
  presentationReadyAt: number; presentationReadyA: boolean; presentationReadyB: boolean;
  countdownEndsAt: number; launchStartedAt: number; launchCountdownAt: number; launchEndsAt: number;
  startedAt: number; overtimeEndsAt: number;
  scoreA: number; scoreB: number; respawnA: number; respawnB: number;
  disconnectedA: number; disconnectedB: number;
  activeMsA: number; activeMsB: number;
  outsideA: number; outsideB: number;
  lastStateAt: number; lastBoundaryAtA: number; lastBoundaryAtB: number;
};
const skyDuelQueue = new Map<string, DuelQueueEntry>();
const skyDuelSessions = new Map<string, SkyDuelSession>();
const skyDuelFairWaitNotified = new Set<string>();
const pendingSkyDuelResults = new Map<string, { matchId: string; message: object }>();
type SkyDuelRematch = { matchId: string; pilotA: string; pilotB: string; aiOpponent: boolean; practice: boolean;
  readyA: boolean; readyB: boolean; startsAt: number; expiresAt: number };
const skyDuelRematches = new Map<string, SkyDuelRematch>();
const SKY_DUEL_AI_FALLBACK_MS = 12_000;
const SKY_DUEL_RUNWAY_INTRO_MS = 5_000;
const SKY_DUEL_RUNWAY_COUNTDOWN_MS = 3_000;
const skyDuelCenter = skyDuelArenaCenter;
const skyDuelRunwayElevations = skyDuelAirportIds.map(id => dallasAirportElevations.get(id)!);
const skyDuelBoundaryRadius = 12_000;
const skyDuelHealth = 100;
const skyDuelAiTuning = Object.freeze({
  aircraft: 'fighter' as AircraftType,
  detectionRange: 6_500,
  reactionDelayMs: 120,
  waypointRefreshMs: 600,
  shotIntervalMs: 200,
  aimSpread: 0.008,
});

function skyDuelPilotLevel(player: PlayerState | undefined, aiOpponent: boolean): number {
  return aiOpponent ? PILOT_LEVEL_CAP : player?.profile?.pilotProgress.level ?? 1;
}

function skyDuelPeer(playerId: string): string | undefined {
  const session = players.get(playerId)?.skyDuelMatchId && skyDuelSessions.get(players.get(playerId)!.skyDuelMatchId!);
  return session ? session.playerA === playerId ? session.playerB : session.playerA : undefined;
}

function sameCombatContext(a: PlayerState, b: PlayerState): boolean {
  if (!a.skyDuelMode && !b.skyDuelMode) return true;
  if (!a.skyDuelMatchId || a.skyDuelMatchId !== b.skyDuelMatchId) return false;
  const phase = skyDuelSessions.get(a.skyDuelMatchId)?.phase;
  return phase === 'active' || phase === 'overtime';
}

function sendSkyDuel(session: SkyDuelSession, message: object): void {
  sendToPlayer(session.playerA, message);
  sendToPlayer(session.playerB, message);
}

function markSkyDuelDisconnected(playerId: string, now: number): void {
  const player = players.get(playerId);
  const session = player?.skyDuelMatchId && skyDuelSessions.get(player.skyDuelMatchId);
  if (!session) return;
  const isA = session.playerA === playerId;
  if (isA ? session.disconnectedA : session.disconnectedB) return;
  if (isA) session.disconnectedA = now;
  else session.disconnectedB = now;
  if (session.phase === 'loading') {
    if (isA) session.readyA = false;
    else session.readyB = false;
  }
  sendToPlayer(isA ? session.playerB : session.playerA,
    { type: 'skyDuelOpponentDisconnected', reconnectSeconds: 15 });
}

function skyDuelCardDetails(player: PlayerState | undefined): { aircraft?: AircraftType; avatar?: string } {
  if (!player) return {};
  const account = player.accountId
    ? pilotSessions.status({ pilotId: player.pilotId, accountId: player.accountId, tokenHash: '' })
    : undefined;
  return { aircraft: player.aircraftType, avatar: account?.state === 'account' ? account.avatarUrl : undefined };
}

function skyDuelBotRoute(position: Vector3, heading: number): Vector3[] {
  const forwardX = -Math.sin(heading), forwardZ = -Math.cos(heading);
  return [
    { x: position.x + forwardX * 180, y: position.y, z: position.z + forwardZ * 180 },
    { x: position.x + forwardX * 1_450, y: position.y + 450, z: position.z + forwardZ * 1_450 },
    { x: skyDuelCenter.x - 700, y: position.y + 650, z: skyDuelCenter.z - 500 },
    { x: skyDuelCenter.x + 700, y: position.y + 650, z: skyDuelCenter.z - 500 },
    { x: skyDuelCenter.x + 700, y: position.y + 650, z: skyDuelCenter.z + 500 },
    { x: skyDuelCenter.x - 700, y: position.y + 650, z: skyDuelCenter.z + 500 },
  ];
}

function sendSkyDuelPeerState(playerId: string): void {
  const player = players.get(playerId);
  const peerId = skyDuelPeer(playerId);
  if (!player || !peerId) return;
  sendToPlayer(peerId, {
    type: 'playerState', playerId, cityId: 'dallas', position: player.position, rotation: player.rotation,
    altitudeMeters: Math.max(0, player.position.y - botTerrainHeight('dallas', player.position.x, player.position.z)),
    aircraftType: player.aircraftType, equippedCosmetics: player.profile?.cosmetics?.equipped ?? {},
    displayName: player.displayName, lifeState: player.lifeState, health: player.health,
    maxHealth: skyDuelHealth, isBot: player.isBot, boostActive: player.boostActive,
  });
}

function skyDuelSpawn(playerId: string, session: SkyDuelSession, now: number): void {
  const player = players.get(playerId);
  if (!player) return;
  const isA = session.playerA === playerId;
  const slot = isA ? 0 : 1;
  const { position, heading } = skyDuelRunwaySpawn(slot, skyDuelRunwayElevations[slot]);
  player.position = position;
  player.lastAcceptedPosition = { ...position };
  player.lastAcceptedTransformAt = now;
  player.rotation = { x: 0, y: heading, z: 0 };
  player.velocity = { x: 0, y: 0, z: 0 };
  player.health = skyDuelHealth;
  player.lifeState = 'respawning';
  player.hasRespawnTransform = player.isBot;
  player.spawnProtectedUntil = Math.max(now + 2_000, session.countdownEndsAt + 2_000);
  player.lastFireAt = now;
  player.assistedAim = undefined;
  if (player.bot && session.aiOpponent) {
    player.bot.phase = 'taxi';
    player.bot.speed = 0;
    player.bot.combatTargetId = undefined;
    player.bot.route = skyDuelBotRoute(position, heading);
    player.bot.routeIndex = 0;
  }
  removePlayerProjectiles(playerId);
  setServerLock(playerId, player);
  sendToPlayer(playerId, { type: 'skyDuelSpawn', position, heading, speed: 0, health: skyDuelHealth,
    protectedUntil: player.spawnProtectedUntil, active: session.phase === 'active' || session.phase === 'overtime' });
  sendToPlayer(playerId, { type: 'skyDuelBoundary', secondsLeft: 0 });
  sendSkyDuelPeerState(playerId);
}

function createSkyDuelPracticeBot(ownerId: string, now: number): string | undefined {
  const owner = players.get(ownerId);
  if (!owner) return undefined;
  const id = `sky-duel-ai:${ownerId}`;
  const { position, heading } = skyDuelRunwaySpawn(1, skyDuelRunwayElevations[1]);
  const bot: BotRuntime = {
    personality: 'hunter', phase: 'taxi', journeyTargetPlayerId: ownerId,
    route: skyDuelBotRoute(position, heading), routeIndex: 0, speed: 0, desiredSpeed: 0, nextDecisionAt: now + 5_000,
    nextFireAt: now + 2_000, respawnAt: 0, homeAirportIndex: 0,
    combatPhaseUntil: 0, combatWaypointRefreshAt: 0, attackFireAfter: 0,
    combatTurnSign: 1, bankControl: 0, blindZoneEscapeUntil: 0,
  };
  players.set(id, {
    pilotId: id, profile: undefined as unknown as PlayerProfile, entityType: 'player', isBot: true,
    cityId: 'dallas', position, rotation: { x: 0, y: heading, z: 0 }, aircraftType: skyDuelAiTuning.aircraft,
    displayName: 'AI PLAYER', score: 0, health: skyDuelHealth, lifeState: 'respawning',
    hasRespawnTransform: true, lastFireAt: now, spawnProtectedUntil: now + 2_000,
    velocity: { x: 0, y: 0, z: 0 }, boostActive: false, lastStateAt: now,
    lastAcceptedPosition: { ...position }, lastAcceptedTransformAt: now,
    chaosQaEnabled: false, tutorialMode: false, skyDuelMode: true,
    skyDuelPracticeOwnerId: ownerId, territoryIds: new Set(), bot,
  });
  return id;
}

function startSkyDuelAiMatch(playerId: string, now: number, paid: boolean): boolean {
  const player = players.get(playerId);
  if (!player || paid && !skyDuelStakesEnabled) return false;
  const aiPilotId = `sky-duel-ai:${player.pilotId}`;
  if (paid) profileStore.getOrCreate(aiPilotId, 'AI PLAYER');
  const reservation = paid ? skyDuelStore.reserveAi(player.pilotId, aiPilotId, now) : undefined;
  if (reservation && !reservation.ok) {
    sendToPlayer(playerId, { type: 'skyDuelError', reason: reservation.reason });
    return false;
  }
  const botId = createSkyDuelPracticeBot(playerId, now);
  if (!botId) {
    if (reservation?.ok) skyDuelStore.settle(reservation.match.id, 'CANCELLED', 0, 0, now);
    return false;
  }
  const bot = players.get(botId)!;
  if (paid) { bot.pilotId = aiPilotId; bot.profile = profileStore.getOrCreate(aiPilotId, 'AI PLAYER'); }
  const session: SkyDuelSession = {
    id: reservation?.ok ? reservation.match.id : randomUUID(), playerA: playerId, playerB: botId,
    practice: !paid, aiOpponent: true,
    phase: 'loading', loadingEndsAt: now + 20_000, readyA: false, readyB: true,
    presentationReadyAt: now + (paid ? 1_500 : 0), presentationReadyA: false, presentationReadyB: true,
    countdownEndsAt: 0, launchStartedAt: 0, launchCountdownAt: 0, launchEndsAt: 0,
    startedAt: 0, overtimeEndsAt: 0,
    scoreA: 0, scoreB: 0, respawnA: 0, respawnB: 0,
    disconnectedA: 0, disconnectedB: 0, activeMsA: 0, activeMsB: 0, outsideA: 0, outsideB: 0,
    lastStateAt: 0, lastBoundaryAtA: 0, lastBoundaryAtB: 0,
  };
  skyDuelSessions.set(session.id, session);
  player.skyDuelMatchId = session.id;
  players.get(botId)!.skyDuelMatchId = session.id;
  skyDuelSpawn(playerId, session, now);
  skyDuelSpawn(botId, session, now);
  if (paid) sendProfile(playerId, undefined, undefined, undefined, 'Sky Duel Entry', true);
  sendToPlayer(playerId, { type: 'skyDuelLoading', matchId: session.id, practice: !paid, aiOpponent: true,
    playerAId: session.playerA, playerBId: session.playerB,
    pilotA: player.displayName, pilotB: 'AI PLAYER', pilotAId: player.pilotId,
    pilotBId: botId, levelA: player.profile.pilotProgress.level, levelB: skyDuelPilotLevel(bot, true),
    aircraftA: player.aircraftType, avatarA: skyDuelCardDetails(player).avatar,
    aircraftB: players.get(botId)?.aircraftType,
    ...(paid ? { entry: competitiveModes.skyDuel.entryCredits, prize: competitiveModes.skyDuel.prizeCredits } : {}) });
  return true;
}

function startSkyDuelHumanMatch(playerId: string, opponentId: string, now: number): boolean {
  const player = players.get(playerId), other = players.get(opponentId);
  if (!player || !other || !skyDuelStakesEnabled || !hasOpenPlayerSocket(playerId) || !hasOpenPlayerSocket(opponentId) ||
    player.skyDuelMatchId || other.skyDuelMatchId || player.pilotId === other.pilotId ||
    player.accountId !== undefined && player.accountId === other.accountId) return false;
  const reservation = skyDuelStore.reserve(player.pilotId, other.pilotId, now);
  if (!reservation.ok) {
    sendToPlayer(playerId, { type: 'skyDuelError', reason: reservation.reason });
    sendToPlayer(opponentId, { type: 'skyDuelError', reason: reservation.reason });
    return false;
  }
  const session: SkyDuelSession = {
    id: reservation.match.id, playerA: playerId, playerB: opponentId,
    phase: 'loading', loadingEndsAt: now + 20_000, readyA: false, readyB: false,
    presentationReadyAt: now + 1_500, presentationReadyA: false, presentationReadyB: false,
    countdownEndsAt: 0, launchStartedAt: 0, launchCountdownAt: 0, launchEndsAt: 0,
    startedAt: 0, overtimeEndsAt: 0,
    scoreA: 0, scoreB: 0, respawnA: 0, respawnB: 0, disconnectedA: 0, disconnectedB: 0, activeMsA: 0, activeMsB: 0,
    outsideA: 0, outsideB: 0, lastStateAt: 0, lastBoundaryAtA: 0, lastBoundaryAtB: 0,
  };
  skyDuelSessions.set(session.id, session);
  player.skyDuelMatchId = session.id; other.skyDuelMatchId = session.id;
  skyDuelSpawn(playerId, session, now); skyDuelSpawn(opponentId, session, now);
  sendProfile(playerId, undefined, undefined, undefined, 'Sky Duel Entry', true);
  sendProfile(opponentId, undefined, undefined, undefined, 'Sky Duel Entry', true);
  sendSkyDuel(session, { type: 'skyDuelLoading', matchId: session.id, pilotA: player.displayName,
    playerAId: session.playerA, playerBId: session.playerB,
    pilotB: other.displayName, pilotAId: player.pilotId, pilotBId: other.pilotId,
    levelA: player.profile.pilotProgress.level, levelB: other.profile.pilotProgress.level,
    aircraftA: player.aircraftType, aircraftB: other.aircraftType,
    avatarA: skyDuelCardDetails(player).avatar, avatarB: skyDuelCardDetails(other).avatar,
    entry: competitiveModes.skyDuel.entryCredits, prize: competitiveModes.skyDuel.prizeCredits });
  return true;
}

function connectedSkyDuelPilot(pilotId: string): string | undefined {
  return [...players.entries()].find(([id, player]) => player.pilotId === pilotId && player.skyDuelMode &&
    !player.skyDuelMatchId && ![...skyDuelQueue.values()].some(entry => entry.pilotId === pilotId) &&
    hasOpenPlayerSocket(id))?.[0];
}

function sendSkyDuelRematchState(offer: SkyDuelRematch, available = true, reason?: string): void {
  const message = { type: 'skyDuelRematchState', matchId: offer.matchId, available,
    readyA: offer.readyA, readyB: offer.readyB, ...(reason ? { reason } : {}) };
  const a = connectedSkyDuelPilot(offer.pilotA);
  const b = offer.aiOpponent ? undefined : connectedSkyDuelPilot(offer.pilotB);
  if (a) sendToPlayer(a, message);
  if (b) sendToPlayer(b, message);
}

function abandonSkyDuelRematches(pilotId: string): void {
  for (const [id, offer] of skyDuelRematches) {
    if (offer.pilotA !== pilotId && offer.pilotB !== pilotId) continue;
    skyDuelRematches.delete(id);
    sendSkyDuelRematchState(offer, false, 'OPPONENT_LEFT');
  }
}

function offerSkyDuelRematch(session: SkyDuelSession, now: number): SkyDuelRematch | undefined {
  const a = players.get(session.playerA), b = players.get(session.playerB);
  if (!a || !b || !hasOpenPlayerSocket(session.playerA) ||
    !session.aiOpponent && !hasOpenPlayerSocket(session.playerB) ||
    !session.practice && !skyDuelStakesEnabled || session.practice && !skyDuelAiPracticeEnabled) return undefined;
  const offer: SkyDuelRematch = { matchId: session.id, pilotA: a.pilotId, pilotB: b.pilotId,
    aiOpponent: session.aiOpponent === true, practice: session.practice === true,
    readyA: false, readyB: false, startsAt: 0, expiresAt: now + 60_000 };
  skyDuelRematches.set(session.id, offer);
  return offer;
}

function skyDuelPracticeSpawn(playerId: string, now: number): void {
  const player = players.get(playerId);
  if (!player) return;
  const { position, heading } = skyDuelRunwaySpawn(0, skyDuelRunwayElevations[0]);
  player.position = position;
  player.lastAcceptedPosition = { ...position };
  player.lastAcceptedTransformAt = now;
  player.rotation = { x: 0, y: heading, z: 0 };
  player.velocity = { x: 0, y: 0, z: 0 };
  player.health = skyDuelHealth;
  player.lifeState = 'respawning';
  player.hasRespawnTransform = false;
  player.spawnProtectedUntil = now + 2_000;
  player.skyDuelPractice = true;
  sendToPlayer(playerId, { type: 'skyDuelSpawn', position, heading, speed: 0,
    health: skyDuelHealth, protectedUntil: player.spawnProtectedUntil, active: true });
  sendToPlayer(playerId, { type: 'skyDuelPractice' });
}

function skyDuelFinish(session: SkyDuelSession, outcome: DuelOutcome, now: number, cause: 'completed' | 'forfeit' | 'absence' = 'completed'): void {
  if (!skyDuelSessions.has(session.id)) return;
  if (session.practice) {
    skyDuelSessions.delete(session.id);
    const pilot = players.get(session.playerA);
    if (pilot) {
      pilot.skyDuelMatchId = undefined;
      pilot.lifeState = 'destroyed';
      removePlayerProjectiles(session.playerA);
    }
    const rematch = outcome === 'CANCELLED' ? undefined : offerSkyDuelRematch(session, now);
    removeBot(session.playerB);
    sendToPlayer(session.playerA, { type: 'skyDuelResult', matchId: session.id, practice: true,
      outcome, scoreA: session.scoreA, scoreB: session.scoreB,
      pilotA: pilot?.pilotId, pilotB: session.playerB, pilotNameB: 'AI PLAYER',
      levelB: PILOT_LEVEL_CAP, aiOpponent: true, rematchAvailable: Boolean(rematch) });
    if (!hasOpenPlayerSocket(session.playerA)) cleanupHumanPlayer(session.playerA);
    return;
  }
  // An authoritative result and both wallet mutations commit before clients
  // are notified. A retry after delivery failure reads the settled receipt.
  const naturalResult = cause === 'completed' && (outcome === 'WIN_A' || outcome === 'WIN_B');
  const xpBefore = new Map([session.playerA, session.playerB].map(id => {
    const player = players.get(id);
    return [id, player && !player.isBot ? profileStore.getOrCreate(player.pilotId, player.displayName).pilotProgress : undefined] as const;
  }));
  const xpEligibility = {
    a: naturalResult && (outcome === 'WIN_A' || session.activeMsA >= 60_000 && session.scoreA > 0),
    b: !session.aiOpponent && naturalResult && (outcome === 'WIN_B' || session.activeMsB >= 60_000 && session.scoreB > 0),
  };
  const receipt = skyDuelStore.settle(session.id, outcome, session.scoreA, session.scoreB, now, xpEligibility,
    cause === 'absence' && session.aiOpponent === true && outcome === 'WIN_B');
  skyDuelSessions.delete(session.id);
  for (const playerId of [session.playerA, session.playerB]) {
    const player = players.get(playerId);
    if (player?.skyDuelMatchId === session.id) {
      player.skyDuelMatchId = undefined;
      player.lifeState = 'destroyed';
      removePlayerProjectiles(playerId);
      if (!player.isBot) sendProfile(playerId, undefined, undefined, undefined, 'Sky Duel', true);
      const before = xpBefore.get(playerId);
      const after = !player.isBot ? profileStore.getOrCreate(player.pilotId, player.displayName).pilotProgress : undefined;
      if (before && after && after.xp > before.xp) reportPilotXp(playerId, outcome === 'WIN_A' && playerId === session.playerA || outcome === 'WIN_B' && playerId === session.playerB
        ? 'SKY_DUEL_WIN' : 'SKY_DUEL_LOSS', { awarded: true, amount: after.xp - before.xp, beforeLevel: before.level, afterLevel: after.level }, now);
      else if (before && (playerId === session.playerA ? xpEligibility.a : xpEligibility.b))
        reportPilotXp(playerId, 'SKY_DUEL', { awarded: false, amount: 0, beforeLevel: before.level, afterLevel: before.level, reason: 'LIMIT' }, now);
    }
  }
  if (!receipt) return;
  const rematch = outcome === 'CANCELLED' ? undefined : offerSkyDuelRematch(session, now);
  if (session.aiOpponent) removeBot(session.playerB);
  const resultMessage = { type: 'skyDuelResult', matchId: session.id, outcome,
    scoreA: session.scoreA, scoreB: session.scoreB,
    pilotA: receipt.match.pilotA, pilotB: receipt.match.pilotB,
    pilotNameA: players.get(session.playerA)?.displayName,
    pilotNameB: session.aiOpponent ? 'AI PLAYER' : players.get(session.playerB)?.displayName,
    levelA: players.get(session.playerA)?.profile?.pilotProgress.level,
    levelB: skyDuelPilotLevel(players.get(session.playerB), session.aiOpponent === true),
    balanceA: receipt.balanceA, balanceB: receipt.balanceB,
    entry: competitiveModes.skyDuel.entryCredits,
    prize: outcome === 'WIN_A' || outcome === 'WIN_B' && !(session.aiOpponent && cause === 'absence') ? competitiveModes.skyDuel.prizeCredits : 0,
    aiOpponent: session.aiOpponent === true, rematchAvailable: Boolean(rematch) };
  sendSkyDuel(session, resultMessage);
  for (const playerId of [session.playerA, session.playerB]) {
    const player = players.get(playerId);
    if (player && !player.isBot && (!hasOpenPlayerSocket(playerId) ||
      (session.playerA === playerId ? session.disconnectedA : session.disconnectedB) !== 0))
      pendingSkyDuelResults.set(player.pilotId, { matchId: session.id, message: resultMessage });
  }
  for (const playerId of [session.playerA, session.playerB]) {
    if (session.aiOpponent && playerId === session.playerB) continue;
    if (!hasOpenPlayerSocket(playerId)) cleanupHumanPlayer(playerId);
  }
  console.info('[sky-duel] settled', { matchId: session.id, outcome, scoreA: session.scoreA, scoreB: session.scoreB });
}

function skyDuelTakedown(victimId: string, killerId: string, now: number): void {
  const id = players.get(victimId)?.skyDuelMatchId;
  const session = id && skyDuelSessions.get(id);
  if (!session || (session.phase !== 'active' && session.phase !== 'overtime') || skyDuelPeer(killerId) !== victimId) return;
  if (killerId === session.playerA) session.scoreA += 1;
  else session.scoreB += 1;
  if (victimId === session.playerA) session.respawnA = now + competitiveModes.skyDuel.respawnMs;
  else session.respawnB = now + competitiveModes.skyDuel.respawnMs;
  sendSkyDuel(session, { type: 'skyDuelState', matchId: id, phase: session.phase,
    scoreA: session.scoreA, scoreB: session.scoreB,
    endsAt: session.phase === 'overtime' ? session.overtimeEndsAt : session.startedAt + competitiveModes.skyDuel.durationMs });
  const winner = duelTakedownWinner(session.scoreA, session.scoreB, session.phase === 'overtime');
  if (winner) skyDuelFinish(session, winner, now);
}

function skyDuelTick(now: number): void {
  for (const [id, offer] of skyDuelRematches) {
    if (now >= offer.expiresAt) {
      skyDuelRematches.delete(id);
      sendSkyDuelRematchState(offer, false, 'EXPIRED');
      continue;
    }
    if (!offer.startsAt || now < offer.startsAt) continue;
    skyDuelRematches.delete(id);
    const a = connectedSkyDuelPilot(offer.pilotA);
    const b = offer.aiOpponent ? undefined : connectedSkyDuelPilot(offer.pilotB);
    if (!a || !offer.aiOpponent && !b) {
      sendSkyDuelRematchState(offer, false, 'OPPONENT_LEFT');
      continue;
    }
    const started = offer.aiOpponent ? startSkyDuelAiMatch(a, now, !offer.practice)
      : startSkyDuelHumanMatch(a, b!, now);
    if (!started) sendSkyDuelRematchState(offer, false, 'UNAVAILABLE');
  }
  for (const [playerId, player] of players) {
    if (player.skyDuelPractice && player.skyDuelPracticeRespawnAt && now >= player.skyDuelPracticeRespawnAt) {
      player.skyDuelPracticeRespawnAt = undefined;
      skyDuelPracticeSpawn(playerId, now);
    }
  }
  for (const [playerId, entry] of skyDuelQueue) {
    if (!players.get(playerId)?.skyDuelMode || !hasOpenPlayerSocket(playerId)) {
      skyDuelQueue.delete(playerId); skyDuelFairWaitNotified.delete(playerId); continue;
    }
    const opponent = closestDuelOpponent(entry,
      [...skyDuelQueue.values()].filter(candidate => hasOpenPlayerSocket(candidate.playerId)), now);
    if (!opponent) {
      if (skyDuelStakesEnabled && skyDuelAiPracticeEnabled && now - entry.queuedAt >= SKY_DUEL_AI_FALLBACK_MS) {
        skyDuelQueue.delete(playerId);
        skyDuelFairWaitNotified.delete(playerId);
        startSkyDuelAiMatch(playerId, now, true);
        continue;
      }
      if (now - entry.queuedAt >= 45_000 && !skyDuelFairWaitNotified.has(playerId)) {
        skyDuelFairWaitNotified.add(playerId);
        sendToPlayer(playerId, { type: 'skyDuelWaiting', elapsedMs: now - entry.queuedAt, fairWait: true });
      }
      continue;
    }
    const other = players.get(opponent.playerId);
    const player = players.get(playerId);
    if (!player || !other || !hasOpenPlayerSocket(opponent.playerId) || player.pilotId === other.pilotId ||
      (player.accountId !== undefined && player.accountId === other.accountId)) continue;
    skyDuelQueue.delete(playerId); skyDuelQueue.delete(opponent.playerId);
    skyDuelFairWaitNotified.delete(playerId); skyDuelFairWaitNotified.delete(opponent.playerId);
    startSkyDuelHumanMatch(playerId, opponent.playerId, now);
  }
  for (const session of skyDuelSessions.values()) {
    const aConnected = !session.disconnectedA && hasOpenPlayerSocket(session.playerA);
    const bConnected = session.aiOpponent || !session.disconnectedB && hasOpenPlayerSocket(session.playerB);
    if (session.disconnectedA && now - session.disconnectedA >= 15_000 ||
      session.disconnectedB && now - session.disconnectedB >= 15_000) {
      const outcome = !aConnected && !bConnected ? 'CANCELLED' : !aConnected ? 'WIN_B' : !bConnected ? 'WIN_A' : 'CANCELLED';
      if (!session.practice && outcome !== 'CANCELLED' &&
        (session.phase === 'loading' || session.phase === 'countdown' || session.phase === 'launch'))
        skyDuelStore.start(session.id, now);
      skyDuelFinish(session, outcome, now, 'absence');
      continue;
    }
    if (session.phase === 'loading') {
      if (aConnected && bConnected && now >= session.loadingEndsAt) { skyDuelFinish(session, 'CANCELLED', now); continue; }
      if (!session.readyA || !session.readyB || !session.presentationReadyA || !session.presentationReadyB ||
        !aConnected || !bConnected || now < session.presentationReadyAt) continue;
      session.phase = 'countdown';
      session.countdownEndsAt = now + 5_000;
      for (const participantId of [session.playerA, session.playerB]) {
        const participant = players.get(participantId);
        if (participant) participant.spawnProtectedUntil = session.countdownEndsAt + 2_000;
      }
      sendSkyDuel(session, { type: 'skyDuelFound', matchId: session.id, practice: session.practice === true,
        aiOpponent: session.aiOpponent === true,
        playerAId: session.playerA, playerBId: session.playerB,
        pilotA: players.get(session.playerA)?.displayName, pilotB: players.get(session.playerB)?.displayName,
        pilotAId: players.get(session.playerA)?.pilotId, pilotBId: players.get(session.playerB)?.pilotId,
        levelA: players.get(session.playerA)?.profile?.pilotProgress.level,
        levelB: skyDuelPilotLevel(players.get(session.playerB), session.aiOpponent === true),
        aircraftA: skyDuelCardDetails(players.get(session.playerA)).aircraft,
        aircraftB: skyDuelCardDetails(players.get(session.playerB)).aircraft,
        avatarA: skyDuelCardDetails(players.get(session.playerA)).avatar,
        avatarB: skyDuelCardDetails(players.get(session.playerB)).avatar,
        countdownEndsAt: session.countdownEndsAt, entry: competitiveModes.skyDuel.entryCredits,
        prize: competitiveModes.skyDuel.prizeCredits, protectedUntil: session.countdownEndsAt + 2_000 });
    }
    if (session.phase === 'countdown') {
      if (now < session.countdownEndsAt || !aConnected || !bConnected) continue;
      session.phase = 'launch';
      session.launchStartedAt = now;
      session.launchCountdownAt = now + SKY_DUEL_RUNWAY_INTRO_MS;
      session.launchEndsAt = session.launchCountdownAt + SKY_DUEL_RUNWAY_COUNTDOWN_MS;
      session.lastStateAt = 0;
      for (const participantId of [session.playerA, session.playerB]) {
        const participant = players.get(participantId);
        if (participant) participant.spawnProtectedUntil = session.launchEndsAt + 2_000;
        sendSkyDuelPeerState(participantId);
      }
    }
    if (session.phase === 'launch' && now >= session.launchEndsAt && aConnected && bConnected) {
      session.phase = 'active';
      session.startedAt = now;
      session.lastStateAt = 0;
      if (!session.practice) skyDuelStore.start(session.id, now);
    }
    if (session.phase === 'active' && now >= session.startedAt + competitiveModes.skyDuel.durationMs) {
      const winner = duelTimeoutWinner(session.scoreA, session.scoreB);
      if (winner) { skyDuelFinish(session, winner, now); continue; }
      session.phase = 'overtime';
      session.overtimeEndsAt = now + competitiveModes.skyDuel.overtimeMs;
      session.lastStateAt = 0;
    }
    if (session.phase === 'overtime' && now >= session.overtimeEndsAt) {
      skyDuelFinish(session, 'DRAW', now); continue;
    }
    for (const [playerId, isA] of [[session.playerA, true], [session.playerB, false]] as const) {
      const player = players.get(playerId);
      if (!player) continue;
      const respawnAt = isA ? session.respawnA : session.respawnB;
      if (respawnAt && now >= respawnAt) {
        if (isA) session.respawnA = 0; else session.respawnB = 0;
        skyDuelSpawn(playerId, session, now);
      }
      const outside = Math.hypot(player.position.x - skyDuelCenter.x, player.position.z - skyDuelCenter.z) > skyDuelBoundaryRadius;
      const boundaryDistance = skyDuelBoundaryRadius - Math.hypot(player.position.x - skyDuelCenter.x, player.position.z - skyDuelCenter.z);
      const outsideAt = isA ? session.outsideA : session.outsideB;
      const lastBoundaryAt = isA ? session.lastBoundaryAtA : session.lastBoundaryAtB;
      if (outside && !outsideAt) {
        if (isA) session.outsideA = now; else session.outsideB = now;
        if (isA) session.lastBoundaryAtA = now; else session.lastBoundaryAtB = now;
        sendToPlayer(playerId, { type: 'skyDuelBoundary', secondsLeft: 10 });
      } else if (outside && now - outsideAt >= 10_000) {
        if (isA) session.outsideA = 0; else session.outsideB = 0;
        skyDuelSpawn(playerId, session, now);
      } else if (outside && now - lastBoundaryAt >= 1_000) {
        if (isA) session.lastBoundaryAtA = now; else session.lastBoundaryAtB = now;
        sendToPlayer(playerId, { type: 'skyDuelBoundary', secondsLeft: Math.ceil((10_000 - (now - outsideAt)) / 1_000) });
      } else if (!outside && outsideAt) {
        if (isA) session.outsideA = 0; else session.outsideB = 0;
        sendToPlayer(playerId, { type: 'skyDuelBoundary', secondsLeft: 0 });
      } else if (!outside && boundaryDistance < 1_000 && now - lastBoundaryAt >= 1_000) {
        if (isA) session.lastBoundaryAtA = now; else session.lastBoundaryAtB = now;
        sendToPlayer(playerId, { type: 'skyDuelBoundary', boundaryMeters: Math.ceil(boundaryDistance) });
      }
    }
    if (now - session.lastStateAt >= 1_000) {
      session.lastStateAt = now;
      sendSkyDuel(session, { type: 'skyDuelState', matchId: session.id, phase: session.phase,
        scoreA: session.scoreA, scoreB: session.scoreB,
        launchStartedAt: session.phase === 'launch' ? session.launchStartedAt : undefined,
        launchCountdownAt: session.phase === 'launch' ? session.launchCountdownAt : undefined,
        launchEndsAt: session.phase === 'launch' ? session.launchEndsAt : undefined,
        endsAt: session.phase === 'overtime' ? session.overtimeEndsAt : session.phase === 'active'
          ? session.startedAt + competitiveModes.skyDuel.durationMs : undefined });
    }
  }
}

function challengeForPlayer(playerId: string): PvpChallenge | undefined {
  return [...pvpChallenges.values()].find(item => item.challengerId === playerId || item.opponentId === playerId);
}

function completePvpChallenge(challenge: PvpChallenge, winnerId: string, now: number): void {
  if (challenge.status !== 'active' || now < (challenge.startsAt ?? 0)) return;
  const winner = players.get(winnerId); const loserId = winnerId === challenge.challengerId ? challenge.opponentId : challenge.challengerId;
  const loser = players.get(loserId); if (!isHumanPilot(winner) || !isHumanPilot(loser)) return;
  if (!cityCapabilities(winner.cityId)?.competitiveEnabled) { pvpChallenges.delete(challenge.id); return; }
  // Direct invitations remain casual. They never share the paid duel pool.
  const result = profileStore.awardPvpWin(challenge.id, winner.pilotId, loser.pilotId, 0, now);
  if (result.profile) { winner.profile = result.profile; sendProfile(winnerId, result.profile, undefined, undefined, result.rewarded ? 'PvP Challenge Won' : undefined); }
  for (const id of [challenge.challengerId, challenge.opponentId]) sendToPlayer(id, { type: 'pvpChallengeResult', challengeId: challenge.id, winnerId, rewarded: result.rewarded });
  recordAnalytics(winnerId, 'pvp_challenge_completed', { metadata: { mode: challenge.mode, rewarded: result.rewarded } }, now);
  pvpChallenges.delete(challenge.id);
}

function expirePvpChallenges(now: number): void {
  for (const challenge of pvpChallenges.values()) {
    if (now <= challenge.expiresAt) continue;
    pvpChallenges.delete(challenge.id);
    for (const id of [challenge.challengerId, challenge.opponentId]) {
      sendToPlayer(id, { type: 'pvpChallengeCancelled', challengeId: challenge.id, reason: challenge.status === 'pending' ? 'INVITE EXPIRED' : 'CHALLENGE ENDED' });
    }
  }
}
const landingReceipts = new Map<string, number>();
const landingFlightState = new Map<string, { baselineY: number; airborne: boolean }>();
const championshipTouchdowns = new Map<string, { attemptId: string; approachCycle: number; airportId: string; telemetry: LandingTelemetry; at: number }>();
const airborneMilestones = new ReferralFlightTracker();
const flightAnalytics = new Map<string, { startedAt: number; airborneMs: number; distanceMeters: number; startingScore: number; kills: number; landings: number; missions: number }>();
const projectiles = new Map<string, ProjectileState>();
const playerSockets = new Map<WebSocket, string>();
const usedSpawnSlots = new Map<CityId, Set<number>>();
const cityIds = new Set<CityId>(['milwaukee', 'dallas']);
const botNames = ['Raven', 'Comet', 'Viper', 'Nova', 'Falcon', 'Echo', 'Atlas', 'Mako', 'Orbit', 'Sable', 'Juno', 'Cinder'];
const botPersonalities: readonly BotPersonality[] = ['explorer', 'racer', 'hunter', 'casual'];
const botTickMs = 200;
const botPopulationTickMs = 1_000;
const maxBotsPerCity = 7;
const maxBotsIncludingTemporaryDefenders = maxBotsPerCity + 2;
const botKillRewardMultiplier = 0.35;
const hunterDetectionRange = 4_500;
const hunterPursuitRange = 6_500;
const hunterFireRange = COMBAT_RANGE;
const hunterFireCone = 0.20;
// A defender at the mandatory 2,000-ft floor needs a modest downward gun
// depression to threaten low intruders. Horizontal authority stays unchanged.
const defenderDownwardFireAngle = 0.45;
const hunterReactionDelayMs = 360;
const hunterShotIntervalMinMs = 430;
const hunterShotIntervalJitterMs = 240;
const hunterMinimumHorizontalSeparation = 1_100;
const hunterVerticalBlindHorizontal = 500;
const hunterVerticalBlindMinimum = 60;
const hunterBlindZoneEscapeMs = 3_600;
// Acquire the target shortly after a safe takeoff. DFW's southbound runway
// reaches the visible Dallas edge before a normal Bluejay climb to 1,500 ft.
const journeyHunterEngagementAgl = 300 * 0.3048;
// Ordinary non-takeoff/landing AI flight stays above 2,000 ft AGL.
const botAirborneClearance = 2_000 * 0.3048;
const botCruiseClearance = botAirborneClearance;
const botCombatClearance = botAirborneClearance;
// Mission 14 starts just after takeoff. Its Hunter flies above sampled terrain
// and buildings while staying close enough vertically for a real pursuit.
const journeyEscapeHunterClearance = 200;
const journeyAceClearance = 300;
// Bluejay's existing FAST throttle targets 850 world units/s. A mission-only
// 0.54 cruise factor targets 810 for the fighter Ace in level flight, leaving
// catch-up room without changing either aircraft envelope.
const journeyAceCruiseFactor = 0.54;
const botTerrainSampleSpacing = 180;
const territoryDefenderOwnerRange = 2_500;
const territoryDefenderReleaseMs = 1_000;
let nextBotSerial = 1;
const aircraftTypes = new Set<AircraftType>(['trainer', 'privateJet', 'cargo', 'fighter']);
// Player bullets use the visible remote-aircraft radii; transport gunshots
// against the local pilot retain this smaller physical radius.
const projectileHitRadiusMultiplier = 1.6;
const projectileVisualRadius = 0.65;
const combatTransformFreshMs = 1_500;
const respawnClearance = 24;
// Straight, unlocked rounds remain fast enough to be readable at flight speed.
const spawnProtectionMs = 3000;
const maxProjectiles = 256;
const projectileStateBroadcastMs = 50;
const eventTickMs = 250;
const eventBroadcastMs = 500;
const eventAvailableMinMs = 240_000;
const eventAvailableMaxMs = 480_000;
const eventActiveMs = 90_000;
const eventTerminalMs = 5_000;
const eventCooldownMinMs = 24_000;
const eventCooldownMaxMs = 48_000;
const fighterTrialEndGraceMs = 7_000;
const wantedTransformFreshMs = 1_500;
const cityEvents = new Map<CityId, CityEvent>();
const lastEventTypes = new Map<CityId, DynamicEventType>();
const profileDatabasePath = process.env.AIRPORT_CHAOS_PROFILE_DB ?? resolve(fileURLToPath(new URL('../data/player-profiles.sqlite', import.meta.url)));
const localJourneyQaUnlockAll = localJourneyQaUnlockEnabled();
const stagingJourneyQaUnlockAll = stagingJourneyQaUnlockEnabled() || localJourneyQaUnlockAll;
const profileStore = new PlayerProfileStore(profileDatabasePath, stagingJourneyQaUnlockAll, localJourneyQaUnlockAll);
// Paid entry is deliberately opt-in. Public production must keep this unset
// until the operator has commercial, legal, and platform clearance.
const skyDuelStakesEnabled = process.env.AIRPORT_CHAOS_SKY_DUEL_STAKES_ENABLED === '1';
const skyDuelAiPracticeEnabled = process.env.AIRPORT_CHAOS_SKY_DUEL_AI_TEST_ENABLED === '1';
const skyDuelStore = new SkyDuelStore(profileDatabasePath);
const recoveredSkyDuelMatches = skyDuelStore.refundInterrupted();
skyDuelStore.reconcileXp();
if (recoveredSkyDuelMatches.length) console.warn('[sky-duel] refunded interrupted matches', { count: recoveredSkyDuelMatches.length });
const journeyStore = new JourneyAttemptStore(profileDatabasePath, stagingJourneyQaUnlockAll);
const pilotProfileSummaryStore = new PilotProfileSummaryStore(profileDatabasePath);
const siegeJourneyTerritory = territoriesForCity('dallas').find(territory => territory.id === journeyDallas18.territoryId)!;
const twoFrontAlpha = territoriesForCity('dallas').find(territory => territory.id === journeyDallas21.alphaTerritoryId)!;
const twoFrontBravo = territoriesForCity('dallas').find(territory => territory.id === journeyDallas21.bravoTerritoryId)!;
const playerJourneyAttempts = new Map<string, string>();
const pausedJourneyPlayers = new Map<string, { attemptId: string; accountId?: string; sessionTokenHash: string }>();
const pausedTrainingPlayers = new Map<string, { pausedAt: number; sessionTokenHash: string }>();
const pausedJourneyAttempts = new Set<string>();
const speedGateTracker = new SpeedGateTracker();
const speedGateWarningAt = new Map<string, number>();
const wrongWayGateWarningAt = new Map<string, { attemptId: string; gateIndex: number; at: number }>();
// Populated only from authenticated Journey attempts, never client intent.
const missionFocusedPlayers = new Set<string>();
const monsterFocusedPlayers = new Set<string>();
const missionFocusHunterTargets = new Map<string, string>();
const missionFocusCrossfireTargets = new Map<string, ReadonlySet<string>>();
const crossfireFireCoordinators = new Map<string, CrossfireFireCoordinator>();
const rearGuardFire = new Map<string, RearGuardFireState>();
const reinforcementWaves = new Map<string, { arriveAt: number; spawned: boolean; ids: [string | null, string | null] }>();
const crossfireDefeatedHunters = new Map<string, Set<string>>();
const crossfireHunterMotion = new Map<string, { x: number; z: number; at: number }>();
const siegeDefeatedHunters = new Set<string>();
const breakoutDefeatedHunters = new Set<string>();
const breakoutHunterMotion = new Map<string, { x: number; z: number; at: number }>();
const siegeHunterMotion = new Map<string, { x: number; z: number; at: number }>();
const journeyFormationStates = new Map<string, FormationStatus>();
const journeyEscapeStates = new Map<string, { attemptId: string; engaged: boolean; lastMotionAt: number; lastX: number; lastZ: number; lastSentAt: number; distance: number | null; status: 'PREPARING' | 'PURSUING' | 'HOLDING' | 'CLOSING' }>();
function assignedFocusedHunter(botId: string, pilotId: string): boolean {
  const hunter = players.get(botId)?.bot;
  return missionFocusedPlayers.has(pilotId) && (missionFocusHunterTargets.get(pilotId) === botId ||
    missionFocusCrossfireTargets.get(pilotId)?.has(botId) === true) &&
    hunter?.journeyTargetPlayerId === pilotId && hunter.journeyAttemptId === playerJourneyAttempts.get(pilotId);
}
function allowedFocusedBot(botId: string, pilotId: string): boolean {
  return assignedFocusedHunter(botId, pilotId);
}
function focusedBotInteractionExcluded(firstId: string, first: PlayerState, secondId: string, second: PlayerState): boolean {
  if (journeyInteractionExcluded(firstId, first, playerJourneyAttempts.get(firstId),
    secondId, second, playerJourneyAttempts.get(secondId))) return true;
  if (monsterFocusedPlayers.has(firstId) || monsterFocusedPlayers.has(secondId)) return true;
  // The assigned formation leader is a visible flight objective, never a combatant.
  if (first.bot?.journeyLeader || second.bot?.journeyLeader) return true;
  return excludesFocusedBotInteraction(missionFocusedPlayers.has(firstId), first.isBot, missionFocusedPlayers.has(secondId), second.isBot,
    second.isBot && allowedFocusedBot(secondId, firstId), first.isBot && allowedFocusedBot(firstId, secondId));
}
const playerJourneyDfwTakeoff = new Set<string>();
const playerJourneyLoveTakeoff = new Set<string>();
const playerJourneyAddisonTakeoff = new Set<string>();
const playerJourneyRunwayPrep = new Set<string>();
const analyticsStore = new AnalyticsStore(profileDatabasePath);
const firehawkPayments = new FirehawkPayments(profileDatabasePath);
const skyTokenPayments = new SkyTokenPayments(firehawkPayments.mode);
const nativePurchaseLedger = new NativePurchaseLedger(profileDatabasePath);
const nativePurchaseVerifier = new NativePurchaseVerifier();
const rewardedAdStore = new RewardedAdStore(profileDatabasePath);
const admobSsvVerifier = new AdMobSsvVerifier();
const trialNetworkGuard = new TrialNetworkGuard(profileDatabasePath, process.env.AIRPORT_CHAOS_TRIAL_IP_SECRET);
const firehawkPromotionShownConnections = new Set<string>();
const firehawkPromotionRequestCounts = new Map<string, number>();
profileStore.migrateFighterEntitlementSources(firehawkPayments.activeEntitlementOwners(), analyticsStore.testerEntitlementPilots());
for (const owner of nativePurchaseLedger.activeEntitlementOwners()) {
  if (owner.source.startsWith('apple:') || owner.source.startsWith('google:')) profileStore.grantAircraftEntitlements(owner.pilotId, ['fighter'], owner.source);
}
const pilotSessions = new PilotSessionStore(profileDatabasePath);
pilotSessions.prune();
analyticsStore.prune();
const securityLimiter = new BoundedRateLimiter(20_000);
const securityLimits = {
  checkoutPilot: { limit: 5, windowMs: 10 * 60_000 }, checkoutIp: { limit: 10, windowMs: 10 * 60_000 },
  recoveryPilot: { limit: 5, windowMs: 15 * 60_000 }, recoveryIp: { limit: 10, windowMs: 15 * 60_000 },
  testerPilot: { limit: 5, windowMs: 10 * 60_000 }, testerIp: { limit: 10, windowMs: 10 * 60_000 },
  sessionIp: { limit: 30, windowMs: 60 * 60_000 },
  signupIp: { limit: 5, windowMs: 60 * 60_000 }, signupEmail: { limit: 3, windowMs: 60 * 60_000 },
  loginIp: { limit: 12, windowMs: 15 * 60_000 }, loginEmail: { limit: 6, windowMs: 15 * 60_000 },
  oauthStartIp: { limit: 12, windowMs: 15 * 60_000 }, oauthStartPilot: { limit: 8, windowMs: 15 * 60_000 },
  oauthCallbackIp: { limit: 30, windowMs: 15 * 60_000 },
  realtimeTicketPilot: { limit: 120, windowMs: 15 * 60_000 }, realtimeTicketIp: { limit: 240, windowMs: 15 * 60_000 },
  namePilot: { limit: 5, windowMs: 60 * 60_000 },
  dailyRewardPilot: { limit: 12, windowMs: 15 * 60_000 }, dailyRewardIp: { limit: 30, windowMs: 15 * 60_000 },
  rewardedAdPilot: { limit: 20, windowMs: 15 * 60_000 }, rewardedAdIp: { limit: 60, windowMs: 15 * 60_000 },
  rewardedAdStatusPilot: { limit: 120, windowMs: 15 * 60_000 }, rewardedAdSsvIp: { limit: 1_000, windowMs: 15 * 60_000 },
  nativePurchasePilot: { limit: 12, windowMs: 15 * 60_000 }, nativePurchaseIp: { limit: 30, windowMs: 15 * 60_000 },
  cosmeticPurchasePilot: { limit: 30, windowMs: 15 * 60_000 },
  referralLookupIp: { limit: 30, windowMs: 60 * 60_000 },
  analyticsIntentPilot: { limit: 120, windowMs: 60 * 60_000 },
  journeyLaunchPilot: { limit: 12, windowMs: 15 * 60_000 },
  skyDuelQueuePilot: { limit: 10, windowMs: 60_000 },
  skyDuelQueueIp: { limit: 30, windowMs: 60_000 },
} satisfies Record<string, RateLimitRule>;
const playerClientIps = new Map<string, string>();
const playerTrialNetworkIds = new Map<string, string>();
const rateLimitMessage = 'TOO MANY ATTEMPTS — Please wait a few minutes and try again.';
function rateLimited(response: ServerResponse, retryAfterMs: number): void {
  response.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1000))) });
  response.end(JSON.stringify({ error: rateLimitMessage }));
}
function limitedBy(scope: string, identity: string, rule: RateLimitRule): { limited: boolean; retryAfterMs: number } {
  const result = securityLimiter.attempt(scope, identity, rule);
  return { limited: !result.allowed, retryAfterMs: result.retryAfterMs };
}
function reconcilePaidFirehawk(profile: PlayerProfile): PlayerProfile {
  let reconciled = firehawkPayments.completedForPilot(profile.pilotId)
    ? profileStore.grantAircraftEntitlements(profile.pilotId, ['fighter'], `stripe:${firehawkPayments.mode}`) ?? profile
    : profile;
  for (const source of nativePurchaseLedger.activeNativeSourcesForPilot(profile.pilotId)) {
    reconciled = profileStore.grantAircraftEntitlements(profile.pilotId, ['fighter'], source) ?? reconciled;
  }
  return reconciled;
}
function revokeNativeFirehawk(provider: NativePurchaseProvider, transactionId: string): void {
  const revoked = nativePurchaseLedger.revoke(provider, transactionId);
  if (!revoked || nativePurchaseLedger.hasActiveSource(revoked.pilotId, revoked.source)) return;
  const updated = profileStore.revokeAircraftEntitlementSource(revoked.pilotId, 'fighter', revoked.source);
  if (updated) syncRefundedFirehawkProfile(revoked.pilotId, updated);
}
const analyticsContexts = new Map<string, AnalyticsContext>();
const lastClientCrashAnalytics = new Map<string, number>();
function recordAnalytics(playerId: string, eventName: AnalyticsEventName, details: { amount?: number; source?: string; metadata?: Record<string, string | number | boolean> } = {}, now = Date.now()): void {
  const player = players.get(playerId); const context = analyticsContexts.get(playerId);
  if (!isHumanPilot(player) || !context) return;
  analyticsStore.recordEvent({ ...context, cityId: player.cityId, aircraftType: player.aircraftType }, eventName, details, now);
}
const testerCodeHash = /^[a-f0-9]{64}$/i.test(process.env.REDSPEAR_TESTER_CODE_HASH ?? '')
  ? Buffer.from(process.env.REDSPEAR_TESTER_CODE_HASH!, 'hex')
  : undefined;
const testerCodeEnabled = Boolean(testerCodeHash);
function redeemTesterCode(pilotId: string, value: unknown, clientIp: string): { ok: boolean; reason: string; profile?: PlayerProfile } {
  if (!testerCodeEnabled || !testerCodeHash) return { ok: false, reason: 'Access code redemption unavailable.' };
  const pilotLimit = limitedBy('tester-pilot', pilotId, securityLimits.testerPilot);
  const ipLimit = limitedBy('tester-ip', clientIp, securityLimits.testerIp);
  if (pilotLimit.limited || ipLimit.limited) return { ok: false, reason: rateLimitMessage };
  const supplied = typeof value === 'string' ? value.trim() : '';
  const digest = createHash('sha256').update(supplied).digest();
  if (digest.length !== testerCodeHash.length || !timingSafeEqual(digest, testerCodeHash)) return { ok: false, reason: 'Invalid access code' };
  const profile = profileStore.grantAircraftEntitlements(pilotId, ['fighter'], 'tester');
  return profile ? { ok: true, reason: 'Redspear Fighter Unlocked', profile } : { ok: false, reason: 'Profile unavailable.' };
}
type FormationState = { memberIds: [string, string]; qualifiedAt: number; active: boolean; lastRewardAt: number };
const cityKings = new Map<CityId, string>();
const formations = new Map<CityId, Map<string, FormationState>>();
const formationDelayMs = 5_000;
const formationRewardMs = 15_000;
const socialRewards = {
  formation: { score: 40, credits: 5 },
} as const;

const chaosActionCooldownMs = 8_000;
const chaosActionValues: Record<string, number> = {
  stunt: 35,
  nearMiss: 45,
  hit: 55,
  eventGate: 60,
  risk: 50,
};
const playerChaos = new Map<string, { multiplier: number; lastAction?: string; lastAt: number; pendingCredits: number }>();
type PlayerHeat = { value: number; level: number; updatedAt: number; lastBroadcastAt: number; lastDangerAt: number };
const heatTiers = [0, 20, 45, 75, 110, 150] as const;
const heatMultipliers = [1, 1.05, 1.10, 1.20, 1.35, 1.50] as const;
const heatGains = {
  kill: 36,
  stunt: 7,
  nearMiss: 9,
  eventWin: 22,
  riskBank: 16,
  dangerousFlight: 4,
} as const;
const heatDecayPerMinute = 5;
const heatDangerCooldownMs = 10_000;
const heatKillCooldownMs = 120_000;
const playerHeat = new Map<string, PlayerHeat>();
const recentBountyKills = new Map<string, number>();
const recentHeatKills = new Map<string, number>();
const masteryCooldowns = new Map<string, number>();
const masteryValues: Partial<Record<ObjectiveActivity, number>> = { stunt: 18, territoryCapture: 55, event: 35, discovery: 24, kill: 45, landing: 16, challenge: 32, distance: 0.004 };
const masteryCooldownMs: Partial<Record<ObjectiveActivity, number>> = { stunt: 5_000, territoryCapture: 60_000, event: 30_000, discovery: 0, kill: heatKillCooldownMs, landing: 30_000, challenge: 30_000, distance: 30_000 };

type TerritoryRuntime = {
  definition: CityTerritory;
  controllerId?: string;
  capturingPlayerId?: string;
  captureProgress: number;
  contested: boolean;
  lastRewardAt: number;
  lastBroadcastAt: number;
  lastContestedHeatAt: Map<string, number>;
  defenseAttackerId?: string;
  defenseNotifiedOwnerId?: string;
  defenderBotId?: string;
  defenseMissingSince?: number;
  defenseLastDiagnosticAt?: number;
  defenseLastMoveAt?: number;
  defenseLastPosition?: { x: number; z: number };
  defenderLostForAttackerId?: string;
  aiRecaptureBlockedUntil?: number;
};
const territoryTickMs = 400;
const territoryCaptureSeconds = 24;
const territoryAiRecaptureGraceMs = 60_000;
const territoryCaptureRewardCooldownMs = 120_000;
const territoryControlRewardMs = 45_000;
const territoryRewardCooldown = new Map<string, number>();
const cityTerritoryState = new Map<CityId, Map<string, TerritoryRuntime>>();

// `ws` will otherwise retain every outgoing frame for a client that has
// stopped consuming data (a backgrounded/crashed tab can remain OPEN for a
// long time).  State traffic is continuous, so that queue must be bounded.
const maxBufferedSocketBytes = 512 * 1024;
const stabilityDiagnosticsEnabled = process.env.AIRPORT_CHAOS_DEV_QA === '1';
const transformRejectLogAt = new Map<string, number>();
type TransformWorldBounds = { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
function buildTransformWorldBounds(cityId: CityId): TransformWorldBounds {
  const airports = cityAirports[cityId];
  const territories = territoriesForCity(cityId);
  const minX = Math.min(...airports.map(airport => airport.x - airport.runwayLength), ...territories.map(territory => territory.bounds.minX));
  const maxX = Math.max(...airports.map(airport => airport.x + airport.runwayLength), ...territories.map(territory => territory.bounds.maxX));
  const minZ = Math.min(...airports.map(airport => airport.z - airport.runwayLength), ...territories.map(territory => territory.bounds.minZ));
  const maxZ = Math.max(...airports.map(airport => airport.z + airport.runwayLength), ...territories.map(territory => territory.bounds.maxZ));
  return { minX: minX - 30_000, maxX: maxX + 30_000, minY: -2_000, maxY: 40_000, minZ: minZ - 30_000, maxZ: maxZ + 30_000 };
}
const transformWorldBounds: Record<CityId, TransformWorldBounds> = {
  dallas: buildTransformWorldBounds('dallas'),
  milwaukee: buildTransformWorldBounds('milwaukee'),
};
const wsPayloadWindow = {
  largestBytes: 0,
  largestType: 'none',
  sentBytes: 0,
  sentMessages: 0,
  droppedBackpressureFrames: 0,
};
const fireBlockedDebugAt = new Map<string, number>();

const port = Number(process.env.PORT ?? 8091);
const configuredWebOrigin = process.env.AIRPORT_CHAOS_WEB_ORIGIN?.trim() || productionWebOrigin;
const clientDist = resolve(fileURLToPath(new URL('../../client/dist/', import.meta.url)));
const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
};

function cacheControlFor(filePath: string): string {
  const extension = extname(filePath);
  // The HTML shell and manifest choose the current hashed module/chunk set.
  // They must never be kept across a local production rebuild, otherwise a
  // browser can boot an old Dallas streamer against a newly replaced build.
  if (extension === '.html' || filePath.endsWith(`${sep}manifest.json`)) return 'no-store';
  // Content-hashed assets are safe to retain, while mutable city JSON stays
  // revalidatable so a data-pipeline update cannot leave an old world view.
  if (filePath.includes(`${sep}assets${sep}`)) return 'public, max-age=31536000, immutable';
  if (filePath.includes(`${sep}data${sep}`)) return 'no-cache';
  return 'no-cache';
}

async function serveFile(filePath: string, response: ServerResponse, headOnly: boolean): Promise<boolean> {
  try {
    const file = await stat(filePath);
    if (!file.isFile()) return false;
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': cacheControlFor(filePath),
    });
    if (headOnly) response.end();
    else createReadStream(filePath).pipe(response);
    return true;
  } catch {
    return false;
  }
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) return undefined;
  }
  try { return JSON.parse(body) as Record<string, unknown>; } catch { return undefined; }
}

async function readForm(request: IncomingMessage): Promise<URLSearchParams | undefined> {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) return undefined;
  }
  try { return new URLSearchParams(body); } catch { return undefined; }
}

async function readRawBody(request: IncomingMessage, maximum = 1_048_576): Promise<Buffer | undefined> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += buffer.length;
    if (size > maximum) return undefined; chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function checkoutOrigin(request: IncomingMessage): string {
  const host = (request.headers.host ?? '').toLowerCase();
  return host.startsWith('localhost:') || host.startsWith('127.0.0.1:') ? `http://${host}` : productionWebOrigin;
}

function secureCookieRequest(request: IncomingMessage): boolean {
  const host = (request.headers.host ?? '').toLowerCase();
  return !host.startsWith('localhost:') && !host.startsWith('127.0.0.1:');
}

function sessionCookie(request: IncomingMessage, token: string, expiresAt: number): string {
  const nativeRequest = isNativeAppOrigin(String(request.headers.origin ?? ''));
  return pilotSessions.cookie(token, secureCookieRequest(request), expiresAt, nativeRequest ? 'None' : 'Lax');
}

function jsonResponse(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
}

function authLimiterIdentity(email: unknown): string {
  const normalized = normalizeAccountEmail(email) ?? 'invalid';
  return createHash('sha256').update(normalized).digest('hex');
}

function oauthProvider(value: unknown): OAuthProvider | undefined {
  return value === 'google' || value === 'apple' ? value : undefined;
}

function nativeAuthPlatform(request: IncomingMessage): NativeAuthPlatform | undefined {
  return nativePlatformForOrigin(String(request.headers.origin ?? ''));
}

function skyTokenCommerceAvailable(request: IncomingMessage): boolean {
  const platform = nativeAuthPlatform(request);
  if (platform === 'ios') return process.env.AIRPORT_CHAOS_SKY_TOKEN_COMMERCE_ENABLED === 'true' &&
    process.env.AIRPORT_CHAOS_SKY_TOKEN_IOS_ENABLED === 'true' && nativePurchaseVerifier.appleEnabled;
  if (platform === 'android') return process.env.AIRPORT_CHAOS_SKY_TOKEN_COMMERCE_ENABLED === 'true' &&
    process.env.AIRPORT_CHAOS_SKY_TOKEN_ANDROID_ENABLED === 'true' && nativePurchaseVerifier.googleRefundNotificationsEnabled;
  return skyTokenPayments.enabled;
}

function analyticsPlatform(request: IncomingMessage): NonNullable<AnalyticsContext['platform']> {
  const native = nativeAuthPlatform(request);
  if (native) return native;
  return /\b(?:Mobile|Android|iPhone|iPad)\b/i.test(String(request.headers['user-agent'] ?? '')) ? 'mobile_web' : 'desktop_web';
}

function nativeProviderDisplayName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ');
  return normalized ? normalized.slice(0, 200) : undefined;
}

function redirectOAuthResult(response: ServerResponse, returnTo: string, provider: OAuthProvider, result: 'success' | 'collision' | 'failed', linked = false): void {
  const target = new URL(returnTo);
  target.searchParams.set('auth', result);
  target.searchParams.set('provider', provider);
  if (linked) target.searchParams.set('linked', '1');
  response.writeHead(303, { Location: target.toString(), 'Cache-Control': 'no-store' });
  response.end();
}

const httpServer = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  const requestOrigin = request.headers.origin;
  const trustedOrigin = applyCors(request, response, configuredWebOrigin);
  if (request.method === 'OPTIONS') {
    if (!requestOrigin || !trustedOrigin) { response.writeHead(403); response.end(); return; }
    response.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type' }); response.end(); return;
  }
  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('ok');
    return;
  }

  const requestUrl = new URL(request.url ?? '/', 'http://localhost');
  if (rejectsApiRequestOrigin(request, requestUrl.pathname, configuredWebOrigin)) {
    jsonResponse(response, 403, { error: 'Request origin is not allowed.' }); return;
  }
  if (requestUrl.pathname === '/api/rewarded-ads/admob/ssv') {
    if (request.method !== 'GET') { response.writeHead(405, { Allow: 'GET' }); response.end(); return; }
    const callbackLimit = limitedBy('rewarded-ad-ssv-ip', trustedClientIp(request), securityLimits.rewardedAdSsvIp);
    if (callbackLimit.limited) { rateLimited(response, callbackLimit.retryAfterMs); return; }
    try {
      const verified = await admobSsvVerifier.verify(request.url ?? '');
      const granted = rewardedAdStore.grantVerifiedReward(verified);
      if (granted.ok && granted.rewarded && !granted.duplicate && granted.pilotId) {
        const context: AnalyticsContext = { pilotId: granted.pilotId, platform: granted.platform, ...analyticsHost(request.headers.host) };
        analyticsStore.recordEvent(context, 'rewarded_ad_verified', { source: 'admob' });
        analyticsStore.recordEvent(context, 'rewarded_ad_reward_granted', {
          amount: granted.rewardCredits, source: 'admob', metadata: { provider: 'ADMOB' },
        });
      }
      if (!granted.ok) console.warn('[rewarded-ad] verified callback rejected', granted.code ?? 'unknown');
      jsonResponse(response, 200, { ok: granted.ok, rewarded: granted.rewarded, duplicate: granted.duplicate });
    } catch (error) {
      console.warn('[rewarded-ad] callback verification failed', error instanceof Error ? error.message : 'unknown');
      jsonResponse(response, 401, { error: 'Reward verification failed.' });
    }
    return;
  }
  if (requestUrl.pathname === '/api/realtime-ticket') {
    if (request.method !== 'POST') { response.writeHead(405, { Allow: 'POST' }); response.end(); return; }
    if (requestOrigin !== 'capacitor://localhost' || !sameOriginJsonRequest(request, configuredWebOrigin)) {
      jsonResponse(response, 403, { error: 'Request could not be verified.' }); return;
    }
    const session = pilotSessions.resolveSession(request.headers.cookie);
    if (!session) { jsonResponse(response, 401, { error: 'Secure session required.' }); return; }
    const identity = { pilotId: session.pilotId, clientIp: trustedClientIp(request), session };
    const payload = await readJson(request);
    if (!payload) { jsonResponse(response, 400, { error: 'Invalid request.' }); return; }
    const pilotLimit = limitedBy('realtime-ticket-pilot', identity.pilotId, securityLimits.realtimeTicketPilot);
    const ipLimit = limitedBy('realtime-ticket-ip', identity.clientIp, securityLimits.realtimeTicketIp);
    if (pilotLimit.limited || ipLimit.limited) { rateLimited(response, Math.max(pilotLimit.retryAfterMs, ipLimit.retryAfterMs)); return; }
    const issued = pilotSessions.issueWebSocketTicket(identity.session);
    if (!issued) { jsonResponse(response, 401, { error: 'Secure session required.' }); return; }
    jsonResponse(response, 200, issued);
    return;
  }
  if (requestUrl.pathname === '/api/referrals/validate') {
    if (request.method !== 'GET') { response.writeHead(405, { Allow: 'GET' }); response.end(); return; }
    const lookupLimit = limitedBy('referral-lookup-ip', trustedClientIp(request), securityLimits.referralLookupIp);
    if (lookupLimit.limited) { rateLimited(response, lookupLimit.retryAfterMs); return; }
    jsonResponse(response, 200, { valid: profileStore.validReferralCode(requestUrl.searchParams.get('code')) });
    return;
  }
  const publicPolicy = request.method === 'GET' || request.method === 'HEAD' ? policyPage(requestUrl.pathname) : undefined;
  if (publicPolicy) {
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    });
    response.end(request.method === 'HEAD' ? undefined : publicPolicy);
    return;
  }
  const oauthCallbackMatch = /^\/api\/auth\/oauth\/(google|apple)\/callback$/.exec(requestUrl.pathname);
  if (oauthCallbackMatch) {
    const provider = oauthCallbackMatch[1] as OAuthProvider;
    const callbackLimit = limitedBy('oauth-callback-ip', trustedClientIp(request), securityLimits.oauthCallbackIp);
    if (callbackLimit.limited) { rateLimited(response, callbackLimit.retryAfterMs); return; }
    const expectedMethod = provider === 'apple' ? 'POST' : 'GET';
    if (request.method !== expectedMethod) { response.writeHead(405, { Allow: expectedMethod }); response.end(); return; }
    if (provider === 'apple' && !String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/x-www-form-urlencoded')) {
      jsonResponse(response, 400, { error: 'Provider authentication failed.' }); return;
    }
    const form = provider === 'apple' ? await readForm(request) : requestUrl.searchParams;
    const state = form?.get('state') ?? '';
    const flow = pilotSessions.consumeOAuthFlow(state, provider);
    if (!flow) { jsonResponse(response, 400, { error: 'Provider authentication failed.' }); return; }
    try {
      const config = providerConfig(provider);
      const code = form?.get('code') ?? '';
      if (!config || config.redirectUri !== flow.redirectUri || !code || form?.get('error')) {
        redirectOAuthResult(response, flow.returnTo, provider, 'failed'); return;
      }
      const verified = await exchangeAndVerifyProviderCode(config, { code, nonce: flow.nonce, codeVerifier: flow.codeVerifier });
      if (provider === 'apple') {
        const userValue = form?.get('user');
        if (userValue && userValue.length <= 4_096) {
          try {
            const user = JSON.parse(userValue) as { name?: { firstName?: unknown; lastName?: unknown } };
            const name = [user.name?.firstName, user.name?.lastName].filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join(' ').trim();
            if (name) verified.displayName = name.slice(0, 200);
          } catch { /* Apple's optional first-authorization profile is non-authoritative metadata. */ }
        }
      }
      const result = pilotSessions.completeProviderAuth(flow, verified);
      if (!result.ok || !result.identity || !result.cookie || !result.expiresAt) {
        redirectOAuthResult(response, flow.returnTo, provider, result.collision ? 'collision' : 'failed'); return;
      }
      profileStore.getOrCreate(result.identity.pilotId, verified.displayName ?? 'Pilot');
      if (result.createdAccount) analyticsStore.recordEvent({ pilotId: result.identity.pilotId, ...analyticsHost(request.headers.host), platform: analyticsPlatform(request) }, 'account_created', { source: result.referralAttributed ? 'referral' : 'unknown' });
      if (result.referralAttributed) analyticsStore.recordEvent({ pilotId: result.identity.pilotId, ...analyticsHost(request.headers.host) }, 'referral_signup_attributed');
      response.setHeader('Set-Cookie', sessionCookie(request, result.cookie, result.expiresAt));
      closeSessionConnections(flow.session.tokenHash);
      redirectOAuthResult(response, flow.returnTo, provider, 'success', flow.action === 'link');
    } catch (error) {
      console.warn('[auth] provider callback rejected', provider, error instanceof Error ? error.message : 'invalid');
      redirectOAuthResult(response, flow.returnTo, provider, 'failed');
    }
    return;
  }
  if (requestUrl.pathname.startsWith('/api/auth/')) {
    const identity = authenticatedIdentity(request, response);
    if (!identity) return;
    profileStore.getOrCreate(identity.pilotId, identity.pilotName);
    if (requestUrl.pathname === '/api/auth/status') {
      if (request.method !== 'GET') { response.writeHead(405, { Allow: 'GET' }); response.end(); return; }
      const profile = reconcilePaidFirehawk(profileStore.getOrCreate(identity.pilotId, identity.pilotName));
      jsonResponse(response, 200, { account: pilotSessions.status(identity.session), profile, serverNow: Date.now() });
      return;
    }
    if (request.method !== 'POST') { response.writeHead(405, { Allow: 'POST' }); response.end(); return; }
    if (!sameOriginJsonRequest(request, configuredWebOrigin)) { jsonResponse(response, 403, { error: 'Request could not be verified.' }); return; }
    const payload = await readJson(request);
    if (!payload) { jsonResponse(response, 400, { error: 'Invalid request.' }); return; }
    try {
      if (requestUrl.pathname === '/api/auth/native/start') {
        const platform = nativeAuthPlatform(request);
        const provider = oauthProvider(payload.provider);
        const action = payload.action === 'link' || payload.action === 'login' ? payload.action : undefined;
        if (!platform || !provider || !action || (provider === 'apple' && platform !== 'ios')) {
          jsonResponse(response, 400, { error: 'Invalid provider request.' }); return;
        }
        if (action === 'link') { jsonResponse(response, 409, { error: 'ACCOUNT_LINKING_DISABLED' }); return; }
        if (!identity.session.accountId && payload.guestSwitchConfirmed !== true) { jsonResponse(response, 409, { error: 'Confirm that signing in may make guest progress inaccessible on this device.' }); return; }
        const ipLimit = limitedBy('native-auth-start-ip', identity.clientIp, securityLimits.oauthStartIp);
        const pilotLimit = limitedBy('native-auth-start-pilot', identity.pilotId, securityLimits.oauthStartPilot);
        if (ipLimit.limited || pilotLimit.limited) { rateLimited(response, Math.max(ipLimit.retryAfterMs, pilotLimit.retryAfterMs)); return; }
        const config = nativeProviderConfig(provider, platform);
        if (!config) { jsonResponse(response, 503, { error: 'That sign-in provider is not configured yet.' }); return; }
        const marker = `native:${platform}`;
        const flow = pilotSessions.beginOAuthFlow(identity.session, provider, action, marker, marker, Date.now(), payload.referralCode);
        if (!flow) { jsonResponse(response, 409, { error: "You're already signed in. Log out first to use another account." }); return; }
        jsonResponse(response, 200, {
          state: flow.state,
          nonce: flow.nonce,
          provider,
          platform,
          ...(config.iosClientId ? { iosClientId: config.iosClientId } : {}),
          ...(config.serverClientId ? { serverClientId: config.serverClientId } : {}),
        });
        return;
      }
      if (requestUrl.pathname === '/api/auth/native/complete') {
        const platform = nativeAuthPlatform(request);
        const provider = oauthProvider(payload.provider);
        const state = typeof payload.state === 'string' ? payload.state : '';
        const idToken = typeof payload.idToken === 'string' ? payload.idToken : '';
        if (!platform || !provider || (provider === 'apple' && platform !== 'ios') || !state || !idToken) {
          jsonResponse(response, 400, { error: 'Provider authentication failed.' }); return;
        }
        const ipLimit = limitedBy('native-auth-complete-ip', identity.clientIp, securityLimits.oauthCallbackIp);
        const pilotLimit = limitedBy('native-auth-complete-pilot', identity.pilotId, securityLimits.oauthStartPilot);
        if (ipLimit.limited || pilotLimit.limited) { rateLimited(response, Math.max(ipLimit.retryAfterMs, pilotLimit.retryAfterMs)); return; }
        const flow = pilotSessions.consumeOAuthFlow(state, provider);
        const config = nativeProviderConfig(provider, platform);
        if (!flow || flow.session.tokenHash !== identity.session.tokenHash || flow.redirectUri !== `native:${platform}` || flow.returnTo !== `native:${platform}` || !config) {
          jsonResponse(response, 400, { error: 'Provider authentication failed.' }); return;
        }
        let verified: Awaited<ReturnType<typeof verifyNativeProviderToken>>;
        try {
          verified = await verifyNativeProviderToken(config, idToken, flow.nonce);
        } catch {
          jsonResponse(response, 401, { error: 'Provider authentication failed.' }); return;
        }
        if (provider === 'apple') verified.displayName = nativeProviderDisplayName(payload.displayName);
        const result = pilotSessions.completeProviderAuth(flow, verified);
        if (!result.ok || !result.identity || !result.cookie || !result.expiresAt) {
          jsonResponse(response, result.collision ? 409 : 401, { error: result.error ?? 'Provider authentication failed.' }); return;
        }
        const profile = reconcilePaidFirehawk(profileStore.getOrCreate(result.identity.pilotId, verified.displayName ?? 'Pilot'));
        if (result.createdAccount) analyticsStore.recordEvent({ pilotId: result.identity.pilotId, ...analyticsHost(request.headers.host), platform: analyticsPlatform(request) }, 'account_created', { source: result.referralAttributed ? 'referral' : 'unknown' });
        if (result.referralAttributed) analyticsStore.recordEvent({ pilotId: result.identity.pilotId, ...analyticsHost(request.headers.host) }, 'referral_signup_attributed');
        response.setHeader('Set-Cookie', sessionCookie(request, result.cookie, result.expiresAt));
        closeSessionConnections(flow.session.tokenHash);
        jsonResponse(response, 200, {
          account: pilotSessions.status(result.identity), profile,
          message: result.guestPreserved
            ? 'Account loaded. This device guest profile was preserved separately.'
            : 'Account loaded.',
          guestPreserved: result.guestPreserved === true,
        });
        return;
      }
      if (requestUrl.pathname === '/api/auth/oauth/start') {
        const provider = oauthProvider(payload.provider);
        const action = payload.action === 'link' || payload.action === 'login' ? payload.action : undefined;
        const returnTo = allowedOAuthReturn(payload.returnTo, String(request.headers.origin ?? ''), configuredWebOrigin);
        if (!provider || !action || !returnTo) { jsonResponse(response, 400, { error: 'Invalid provider request.' }); return; }
        if (action === 'link') { jsonResponse(response, 409, { error: 'ACCOUNT_LINKING_DISABLED' }); return; }
        if (!identity.session.accountId && payload.guestSwitchConfirmed !== true) { jsonResponse(response, 409, { error: 'Confirm that signing in may make guest progress inaccessible on this device.' }); return; }
        const ipLimit = limitedBy('oauth-start-ip', identity.clientIp, securityLimits.oauthStartIp);
        const pilotLimit = limitedBy('oauth-start-pilot', identity.pilotId, securityLimits.oauthStartPilot);
        if (ipLimit.limited || pilotLimit.limited) { rateLimited(response, Math.max(ipLimit.retryAfterMs, pilotLimit.retryAfterMs)); return; }
        const config = providerConfig(provider);
        if (!config) { jsonResponse(response, 503, { error: 'That sign-in provider is not configured yet.' }); return; }
        const flow = pilotSessions.beginOAuthFlow(identity.session, provider, action, config.redirectUri, returnTo, Date.now(), payload.referralCode);
        if (!flow) { jsonResponse(response, 409, { error: "You're already signed in. Log out first to use another account." }); return; }
        jsonResponse(response, 200, { authorizationUrl: createAuthorizationUrl(config, {
          state: flow.state, nonce: flow.nonce, codeChallenge: flow.codeVerifier ? pkceChallenge(flow.codeVerifier) : undefined,
        }) });
        return;
      }
      if (requestUrl.pathname === '/api/auth/signup') {
        jsonResponse(response, 410, { error: 'Use Google or Apple to save progress across devices.' });
        return;
      }
      if (requestUrl.pathname === '/api/auth/login') {
        if (!identity.session.accountId && payload.guestSwitchConfirmed !== true) { jsonResponse(response, 409, { error: 'Confirm that signing in may make guest progress inaccessible on this device.' }); return; }
        const emailKey = authLimiterIdentity(payload.email);
        const ipLimit = limitedBy('login-ip', identity.clientIp, securityLimits.loginIp);
        const emailLimit = limitedBy('login-email', emailKey, securityLimits.loginEmail);
        if (ipLimit.limited || emailLimit.limited) { rateLimited(response, Math.max(ipLimit.retryAfterMs, emailLimit.retryAfterMs)); return; }
        const result = await pilotSessions.signIn(identity.session, payload.email, payload.password);
        if (!result.ok || !result.identity || !result.cookie || !result.expiresAt) {
          jsonResponse(response, 401, { error: result.error ?? 'Account request failed.' }); return;
        }
        const profile = reconcilePaidFirehawk(profileStore.getOrCreate(result.identity.pilotId, 'Pilot'));
        response.setHeader('Set-Cookie', sessionCookie(request, result.cookie, result.expiresAt));
        closeSessionConnections(identity.session.tokenHash);
        jsonResponse(response, 200, {
          account: pilotSessions.status(result.identity), profile,
          message: result.guestPreserved ? 'Account loaded. This device guest profile was preserved separately.' : 'Account loaded.',
          guestPreserved: result.guestPreserved === true,
        });
        return;
      }
      if (requestUrl.pathname === '/api/auth/logout') {
        if (!identity.session.accountId) { jsonResponse(response, 409, { error: 'Guest progress remains on this device. Sign in to protect it.' }); return; }
        const result = pilotSessions.signOut(identity.session);
        if (!result.identity || !result.cookie || !result.expiresAt) { jsonResponse(response, 400, { error: 'Unable to log out.' }); return; }
        // A post-account guest is deliberately fresh.  Seal legacy import so
        // cached values from the account being logged out cannot hydrate it.
        const profile = profileStore.createFreshGuest(result.identity.pilotId);
        response.setHeader('Set-Cookie', sessionCookie(request, result.cookie, result.expiresAt));
        closeSessionConnections(identity.session.tokenHash);
        jsonResponse(response, 200, { account: { state: 'guest' }, profile, message: 'Logged out. Continuing as a guest.' });
        return;
      }
      if (requestUrl.pathname === '/api/auth/pilot-name') {
        if (!identity.session.accountId) { jsonResponse(response, 401, { error: 'Sign in to change your pilot name.' }); return; }
        const limit = limitedBy('pilot-name', identity.pilotId, securityLimits.namePilot);
        if (limit.limited) { rateLimited(response, limit.retryAfterMs); return; }
        const name = normalizePilotName(payload.pilotName);
        if (!name) { jsonResponse(response, 400, { error: 'Pilot name must be 3–20 characters using letters, numbers, spaces, hyphens or underscores.' }); return; }
        const profile = profileStore.setPilotName(identity.pilotId, name);
        if (!profile) { jsonResponse(response, 400, { error: 'Pilot name could not be changed.' }); return; }
        updateConnectedPilotName(identity.pilotId, profile);
        jsonResponse(response, 200, { account: pilotSessions.status(identity.session), profile, message: 'Pilot name updated.' });
        return;
      }
      response.writeHead(404); response.end('Not found'); return;
    } catch (error) {
      console.error('[auth] account request failed', error instanceof Error ? error.message : 'unknown');
      jsonResponse(response, 500, { error: 'Account service is temporarily unavailable.' });
      return;
    }
  }
  if (requestUrl.pathname === '/api/store/apple/notifications') {
    if (request.method !== 'POST') { response.writeHead(405, { Allow: 'POST' }); response.end(); return; }
    const payload = await readJson(request);
    const signedPayload = typeof payload?.signedPayload === 'string' ? payload.signedPayload : '';
    try {
      const notification = await nativePurchaseVerifier.decodeAppleNotification(signedPayload);
      if (notification.tokenPurchase && !notification.tokenPurchase.active) {
        const pack = skyTokenPacks[notification.tokenPurchase.packId];
        profileStore.refundVerifiedSkyTokenPurchase('apple', notification.tokenPurchase.providerTransactionId, pack.tokens);
      }
      if (!nativePurchaseLedger.recordNotification('apple', notification.notificationId)) {
        jsonResponse(response, 200, { received: true }); return;
      }
      if (notification.purchase && !notification.purchase.active) revokeNativeFirehawk('apple', notification.purchase.providerTransactionId);
      jsonResponse(response, 200, { received: true });
    } catch (error) {
      console.warn('[apple-iap] notification rejected', error instanceof Error ? error.message : 'invalid');
      jsonResponse(response, 400, { error: 'Invalid notification.' });
    }
    return;
  }
  if (requestUrl.pathname === '/api/store/google/notifications') {
    if (request.method !== 'POST') { response.writeHead(405, { Allow: 'POST' }); response.end(); return; }
    if (!await nativePurchaseVerifier.verifyGooglePushAuthorization(String(request.headers.authorization ?? ''))) {
      jsonResponse(response, 401, { error: 'Notification authentication failed.' }); return;
    }
    const payload = await readJson(request);
    const purchaseToken = googleNotificationToken(payload);
    const tokenNotification = googleSkyTokenNotification(payload);
    const voidedToken = googleVoidedPurchaseNotification(payload);
    if (!purchaseToken && !tokenNotification && !voidedToken) { jsonResponse(response, 400, { error: 'Invalid notification.' }); return; }
    try {
      if (voidedToken) {
        const transactionId = createHash('sha256').update(voidedToken).digest('base64url');
        const quantity = profileStore.skyTokenPurchaseQuantity('google', transactionId) ?? 0;
        profileStore.refundVerifiedSkyTokenPurchase('google', transactionId, quantity);
        revokeNativeFirehawk('google', transactionId);
      } else if (tokenNotification) {
        const purchase = await nativePurchaseVerifier.verifySkyTokenGoogle(tokenNotification.purchaseToken, tokenNotification.productId);
        if (!purchase.active) profileStore.refundVerifiedSkyTokenPurchase('google', purchase.providerTransactionId, skyTokenPacks[purchase.packId].tokens);
      } else {
        const purchase = await nativePurchaseVerifier.verifyGoogle(purchaseToken!);
        const notificationId = createHash('sha256').update(purchaseToken!).digest('base64url');
        if (nativePurchaseLedger.recordNotification('google', notificationId) && !purchase.active) revokeNativeFirehawk('google', purchase.providerTransactionId);
      }
      jsonResponse(response, 200, { received: true });
    } catch (error) {
      console.warn('[google-play] notification rejected', error instanceof Error ? error.message : 'invalid');
      jsonResponse(response, 400, { error: 'Invalid notification.' });
    }
    return;
  }
  if (requestUrl.pathname === '/api/sky-tokens/native/context') {
    if (request.method !== 'POST') { response.writeHead(405, { Allow: 'POST' }); response.end(); return; }
    if (!sameOriginJsonRequest(request, configuredWebOrigin)) { jsonResponse(response, 403, { error: 'Request could not be verified.' }); return; }
    const identity = authenticatedIdentity(request, response);
    if (!identity) return;
    const provider = nativeAuthPlatform(request) === 'ios' ? 'apple' : nativeAuthPlatform(request) === 'android' ? 'google' : undefined;
    if (!identity.session.accountId || !provider || !skyTokenCommerceAvailable(request)) { jsonResponse(response, 403, { error: 'Native Token purchases are unavailable.' }); return; }
    const pilotLimit = limitedBy('native-purchase-pilot', identity.pilotId, securityLimits.nativePurchasePilot);
    const ipLimit = limitedBy('native-purchase-ip', identity.clientIp, securityLimits.nativePurchaseIp);
    if (pilotLimit.limited || ipLimit.limited) { rateLimited(response, Math.max(pilotLimit.retryAfterMs, ipLimit.retryAfterMs)); return; }
    const payload = await readJson(request);
    const packId = typeof payload?.packId === 'string' ? payload.packId : '';
    if (!skyTokenPack(packId)) { jsonResponse(response, 400, { error: 'Unknown Token pack.' }); return; }
    const context = profileStore.createSkyTokenPurchaseContext(identity.pilotId, identity.session.accountId, provider, packId as SkyTokenPackId);
    if (!context) { jsonResponse(response, 400, { error: 'Unable to start purchase.' }); return; }
    analyticsStore.recordEvent({ pilotId: identity.pilotId, platform: analyticsPlatform(request), ...analyticsHost(request.headers.host) }, 'sky_token_purchase_started', { source: provider });
    jsonResponse(response, 200, context); return;
  }
  if (requestUrl.pathname === '/api/sky-tokens/native/verify') {
    if (request.method !== 'POST') { response.writeHead(405, { Allow: 'POST' }); response.end(); return; }
    if (!sameOriginJsonRequest(request, configuredWebOrigin)) { jsonResponse(response, 403, { error: 'Request could not be verified.' }); return; }
    const identity = authenticatedIdentity(request, response);
    if (!identity) return;
    const provider = nativeAuthPlatform(request) === 'ios' ? 'apple' : nativeAuthPlatform(request) === 'android' ? 'google' : undefined;
    if (!identity.session.accountId || !provider) { jsonResponse(response, 403, { error: 'Native purchase is unavailable.' }); return; }
    const payload = await readJson(request);
    const contextId = typeof payload?.contextId === 'string' && /^[0-9a-f-]{36}$/i.test(payload.contextId) ? payload.contextId : '';
    const signedTransaction = typeof payload?.signedTransaction === 'string' ? payload.signedTransaction : '';
    const purchaseToken = typeof payload?.purchaseToken === 'string' ? payload.purchaseToken : '';
    const productId = typeof payload?.productId === 'string' ? payload.productId : '';
    try {
      const verified = provider === 'apple' ? await nativePurchaseVerifier.verifySkyTokenApple(signedTransaction)
        : await nativePurchaseVerifier.verifySkyTokenGoogle(purchaseToken, productId);
      if (!verified.active) { jsonResponse(response, 400, { error: 'This purchase is not active.' }); return; }
      const grant = profileStore.recordVerifiedSkyTokenPurchase({ pilotId: identity.pilotId, accountId: identity.session.accountId,
        provider, transactionId: verified.providerTransactionId, packId: verified.packId, productId: verified.productId,
        amountCents: verified.amountCents, currency: verified.currency, environment: verified.environment,
        purchasedAt: verified.purchasedAt, contextId, accountBinding: verified.accountBinding });
      if (grant.applied) analyticsStore.recordEvent({ pilotId: identity.pilotId, platform: analyticsPlatform(request), ...analyticsHost(request.headers.host) },
        'sky_token_purchase_succeeded', { amount: skyTokenPacks[verified.packId].tokens, source: provider });
      jsonResponse(response, 200, { profile: grant.profile, reference: grant.reference, applied: grant.applied });
    } catch (error) {
      console.warn('[sky-tokens] native verification rejected', error instanceof Error ? error.message : 'invalid');
      jsonResponse(response, 400, { error: 'Unable to verify purchase. Please try again.' });
    }
    return;
  }
  if (requestUrl.pathname === '/api/firehawk/native/context') {
    if (request.method !== 'POST') { response.writeHead(405, { Allow: 'POST' }); response.end(); return; }
    if (!sameOriginJsonRequest(request, configuredWebOrigin)) { jsonResponse(response, 403, { error: 'Request could not be verified.' }); return; }
    const identity = authenticatedIdentity(request, response);
    if (!identity) return;
    if (!identity.session.accountId) { jsonResponse(response, 403, { error: 'Sign in to purchase Firehawk.' }); return; }
    const payload = await readJson(request);
    const provider: NativePurchaseProvider | undefined = payload?.provider === 'apple' || payload?.provider === 'google' ? payload.provider : undefined;
    const action: 'purchase' | 'restore' | undefined = payload?.action === 'purchase' || payload?.action === 'restore' ? payload.action : undefined;
    const platform = nativeAuthPlatform(request);
    if (!provider || !action || (platform === 'ios' ? provider !== 'apple' : platform === 'android' ? provider !== 'google' : true)) {
      jsonResponse(response, 403, { error: 'Native store is unavailable.' }); return;
    }
    if (action === 'purchase') { jsonResponse(response, 409, { error: 'Unlock Firehawk with Sky Tokens in the Garage.' }); return; }
    if ((provider === 'apple' && !nativePurchaseVerifier.appleEnabled) || (provider === 'google' && !nativePurchaseVerifier.googleEnabled)) {
      jsonResponse(response, 503, { error: 'Store verification is not configured yet.' }); return;
    }
    const pilotLimit = limitedBy('native-purchase-pilot', identity.pilotId, securityLimits.nativePurchasePilot);
    const ipLimit = limitedBy('native-purchase-ip', identity.clientIp, securityLimits.nativePurchaseIp);
    if (pilotLimit.limited || ipLimit.limited) { rateLimited(response, Math.max(pilotLimit.retryAfterMs, ipLimit.retryAfterMs)); return; }
    const profile = reconcilePaidFirehawk(profileStore.getOrCreate(identity.pilotId, identity.pilotName));
    const context = nativePurchaseLedger.createContext({ accountId: identity.session.accountId, pilotId: identity.pilotId }, provider, action);
    if (!context) { jsonResponse(response, 403, { error: 'Sign in to purchase Firehawk.' }); return; }
    jsonResponse(response, 200, context);
    return;
  }
  if (requestUrl.pathname === '/api/firehawk/native/verify') {
    if (request.method !== 'POST') { response.writeHead(405, { Allow: 'POST' }); response.end(); return; }
    if (!sameOriginJsonRequest(request, configuredWebOrigin)) { jsonResponse(response, 403, { error: 'Request could not be verified.' }); return; }
    const identity = authenticatedIdentity(request, response);
    if (!identity) return;
    if (!identity.session.accountId) { jsonResponse(response, 403, { error: 'Sign in to restore or purchase Firehawk.' }); return; }
    const payload = await readJson(request);
    const provider: NativePurchaseProvider | undefined = payload?.provider === 'apple' || payload?.provider === 'google' ? payload.provider : undefined;
    const platform = nativeAuthPlatform(request);
    if (!provider || (platform === 'ios' ? provider !== 'apple' : platform === 'android' ? provider !== 'google' : true)) {
      jsonResponse(response, 403, { error: 'Native store is unavailable.' }); return;
    }
    const contextId = typeof payload?.contextId === 'string' && /^[0-9a-f-]{36}$/i.test(payload.contextId) ? payload.contextId : '';
    const signedTransaction = typeof payload?.signedTransaction === 'string' ? payload.signedTransaction : '';
    const purchaseToken = typeof payload?.purchaseToken === 'string' ? payload.purchaseToken : '';
    try {
      const verified = provider === 'apple'
        ? await nativePurchaseVerifier.verifyApple(signedTransaction)
        : await nativePurchaseVerifier.verifyGoogle(purchaseToken);
      const purchaseIntent = nativePurchaseLedger.contextIntent({ accountId: identity.session.accountId, pilotId: identity.pilotId }, contextId, provider);
      const grant = nativePurchaseLedger.recordVerified({ accountId: identity.session.accountId, pilotId: identity.pilotId }, contextId, verified);
      if (!grant.ok || !grant.source) {
        const message = grant.reason === 'ACCOUNT_MISMATCH' ? 'This store purchase belongs to another Airport Chaos account.' :
          grant.reason === 'PURCHASE_INACTIVE' ? 'This purchase is not active.' : 'Unable to verify purchase. Try again.';
        jsonResponse(response, grant.reason === 'ACCOUNT_MISMATCH' ? 409 : 400, { error: message }); return;
      }
      const profile = profileStore.grantAircraftEntitlements(identity.pilotId, ['fighter'], grant.source);
      if (!profile) throw new Error('PROFILE_NOT_FOUND');
      if (provider === 'google' && !verified.acknowledged) await nativePurchaseVerifier.acknowledgeGoogle(purchaseToken);
      if (!grant.duplicate && purchaseIntent === 'purchase') analyticsStore.recordEvent({ pilotId: identity.pilotId, platform: analyticsPlatform(request), ...analyticsHost(request.headers.host), aircraftType: 'fighter' }, 'fighter_purchase_completed', {
        amount: verified.amountCents, source: provider, metadata: { environment: verified.environment },
      });
      if (purchaseIntent === 'restore') analyticsStore.recordEvent({ pilotId: identity.pilotId, platform: analyticsPlatform(request),
        aircraftType: 'fighter', ...analyticsHost(request.headers.host) }, 'firehawk_restore_succeeded', { source: contextId });
      jsonResponse(response, 200, { profile: reconcilePaidFirehawk(profile), transactionId: verified.providerTransactionId });
    } catch (error) {
      console.warn(`[${provider ?? 'native'}-purchase] verification rejected`, error instanceof Error ? error.message : 'invalid');
      analyticsStore.recordEvent({ pilotId: identity.pilotId, platform: analyticsPlatform(request), ...analyticsHost(request.headers.host), aircraftType: 'fighter' }, 'firehawk_purchase_failed', { source: provider ?? 'native' });
      jsonResponse(response, 400, { error: 'Unable to verify purchase. Try again.' });
    }
    return;
  }
  if (requestUrl.pathname === '/api/stripe/webhook') {
    if (request.method !== 'POST') { response.writeHead(405, { Allow: 'POST' }); response.end(); return; }
    const rawBody = await readRawBody(request);
    try {
      if (!rawBody) throw new Error('INVALID_BODY');
      const event = firehawkPayments.verifyEvent(rawBody, request.headers['stripe-signature'] as string | undefined);
      const tokenCheckout = await skyTokenPayments.paidCheckout(event);
      if (tokenCheckout) {
        const grant = profileStore.recordVerifiedSkyTokenPurchase({ ...tokenCheckout, provider: 'stripe' });
        if (grant.applied && tokenCheckout.initialRefundedQuantity < skyTokenPacks[tokenCheckout.packId].tokens)
          analyticsStore.recordEvent({ pilotId: tokenCheckout.pilotId, ...analyticsHost(request.headers.host) }, 'sky_token_purchase_succeeded',
            { amount: skyTokenPacks[tokenCheckout.packId].tokens - tokenCheckout.initialRefundedQuantity, source: 'stripe' });
      }
      if (event.type === 'charge.refunded') {
        const charge = event.data.object;
        const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
        const tokenPurchase = paymentIntentId ? profileStore.skyTokenPurchaseForPaymentIntent(paymentIntentId) : undefined;
        if (!tokenPurchase && paymentIntentId && await skyTokenPayments.isSkyTokenPaymentIntent(paymentIntentId))
          throw new Error('TOKEN_REFUND_PURCHASE_PENDING');
        if (tokenPurchase && charge.currency === 'usd' && charge.amount === tokenPurchase.amountCents && charge.amount > 0) {
          const refundedQuantity = Math.floor(tokenPurchase.quantity * charge.amount_refunded / charge.amount);
          const reversal = profileStore.refundVerifiedSkyTokenPurchase('stripe', tokenPurchase.transactionId, refundedQuantity);
          if (reversal.applied) analyticsStore.recordEvent({ pilotId: reversal.profile!.pilotId, ...analyticsHost(request.headers.host) }, 'sky_token_purchase_refunded',
            { amount: refundedQuantity, source: 'stripe' });
        }
      }
      const purchase = await firehawkPayments.recordPaidCheckout(event);
      if (purchase) {
        nativePurchaseLedger.recordStripePurchase({ transactionId: purchase.sessionId, originalId: purchase.paymentIntentId, accountId: purchase.accountId, pilotId: purchase.pilotId, mode: purchase.stripeMode });
        const entitled = profileStore.grantAircraftEntitlements(purchase.pilotId, ['fighter'], `stripe:${purchase.stripeMode}`);
        const host = analyticsHost(request.headers.host);
        if (entitled?.aircraftEntitlements.includes(firehawkProduct.entitlement)) analyticsStore.recordEvent({ pilotId: purchase.pilotId, ...host, aircraftType: 'fighter' }, 'fighter_purchase_completed', { amount: firehawkProduct.amountCents, source: 'stripe', metadata: { stripeMode: purchase.stripeMode } });
      }
      const refund = firehawkPayments.recordRefund(event);
      if (refund) {
        if (refund.fullRefund) nativePurchaseLedger.recordStripeRefund(refund.sessionId);
        if (refund.fullRefund && !firehawkPayments.completedForPilot(refund.pilotId)) {
          const updatedProfile = profileStore.revokeAircraftEntitlementSource(refund.pilotId, 'fighter', `stripe:${refund.stripeMode}`);
          if (updatedProfile) syncRefundedFirehawkProfile(refund.pilotId, updatedProfile);
        }
        const host = analyticsHost(request.headers.host);
        analyticsStore.recordEvent({ pilotId: refund.pilotId, ...host, aircraftType: 'fighter' }, 'fighter_purchase_refunded', {
          amount: refund.refundDelta, source: 'stripe', metadata: { stripeMode: refund.stripeMode, fullRefund: refund.fullRefund },
        });
      }
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('{"received":true}');
    } catch (error) {
      console.warn('[stripe] webhook rejected', error instanceof Error ? error.message : 'invalid');
      response.writeHead(400, { 'Content-Type': 'application/json' }); response.end('{"error":"Invalid webhook"}');
    }
    return;
  }
  if (requestUrl.pathname === '/api/store/catalog') {
    if (request.method !== 'GET') { response.writeHead(405, { Allow: 'GET' }); response.end(); return; }
    jsonResponse(response, 200, { items: publicStoreCatalog() });
    return;
  }
  if (requestUrl.pathname === '/api/sky-tokens/catalog') {
    if (request.method !== 'GET') { response.writeHead(405, { Allow: 'GET' }); response.end(); return; }
    const identity = authenticatedIdentity(request, response);
    if (!identity) return;
    jsonResponse(response, 200, { enabled: Boolean(identity.session.accountId && skyTokenCommerceAvailable(request)),
      packs: Object.entries(skyTokenPacks).map(([id, pack]) => ({ id, tokens: pack.tokens, usdCents: pack.usdCents })) });
    return;
  }
  if (requestUrl.pathname === '/api/sky-tokens/checkout') {
    if (request.method !== 'POST') { response.writeHead(405, { Allow: 'POST' }); response.end(); return; }
    if (!sameOriginJsonRequest(request, configuredWebOrigin)) { jsonResponse(response, 403, { error: 'Request could not be verified.' }); return; }
    const identity = authenticatedIdentity(request, response);
    if (!identity) return;
    if (!identity.session.accountId || nativeAuthPlatform(request) || !skyTokenPayments.enabled) { jsonResponse(response, 403, { error: 'Token purchases are unavailable.' }); return; }
    const pilotLimit = limitedBy('checkout-pilot', identity.pilotId, securityLimits.checkoutPilot);
    const ipLimit = limitedBy('checkout-ip', identity.clientIp, securityLimits.checkoutIp);
    if (pilotLimit.limited || ipLimit.limited) { rateLimited(response, Math.max(pilotLimit.retryAfterMs, ipLimit.retryAfterMs)); return; }
    const payload = await readJson(request);
    const packId = typeof payload?.packId === 'string' ? payload.packId : '';
    if (!skyTokenPack(packId)) { jsonResponse(response, 400, { error: 'Unknown Token pack.' }); return; }
    try {
      const checkout = await skyTokenPayments.createCheckout(identity.pilotId, identity.session.accountId, packId as SkyTokenPackId, configuredWebOrigin);
      analyticsStore.recordEvent({ pilotId: identity.pilotId, ...analyticsHost(request.headers.host) }, 'sky_token_purchase_started', { source: 'stripe' });
      jsonResponse(response, 200, checkout);
    } catch {
      jsonResponse(response, 503, { error: 'Token checkout is unavailable. Please try again.' });
    }
    return;
  }
  if (requestUrl.pathname === '/api/sky-tokens/purchase-status') {
    if (request.method !== 'GET') { response.writeHead(405, { Allow: 'GET' }); response.end(); return; }
    const identity = authenticatedIdentity(request, response);
    if (!identity) return;
    if (!identity.session.accountId) { jsonResponse(response, 401, { error: 'Sign in to view purchases.' }); return; }
    const sessionId = requestUrl.searchParams.get('sessionId') ?? '';
    if (!/^cs_[A-Za-z0-9_]{8,256}$/.test(sessionId)) { jsonResponse(response, 400, { error: 'Invalid purchase reference.' }); return; }
    jsonResponse(response, 200, { status: profileStore.skyTokenPurchaseStatus(identity.pilotId, sessionId),
      profile: profileStore.getOrCreate(identity.pilotId, identity.pilotName) });
    return;
  }
  if (requestUrl.pathname === '/api/firehawk/checkout') {
    if (request.method !== 'POST') { response.writeHead(405, { Allow: 'POST' }); response.end(); return; }
    if (!sameOriginJsonRequest(request, configuredWebOrigin)) { jsonResponse(response, 403, { error: 'Request could not be verified.' }); return; }
    const identity = authenticatedIdentity(request, response);
    if (!identity) return;
    jsonResponse(response, 409, { error: 'Unlock Firehawk with Sky Tokens in the Store.' }); return;
  }
  if (requestUrl.pathname === '/api/firehawk/purchase-status') {
    if (request.method !== 'GET') { response.writeHead(405, { Allow: 'GET' }); response.end(); return; }
    const identity = authenticatedIdentity(request, response); const sessionId = requestUrl.searchParams.get('sessionId') ?? '';
    if (!identity) return;
    if (!identity.session.accountId) { jsonResponse(response, 401, { error: 'Sign in to view purchase status.' }); return; }
    const status = firehawkPayments.status(identity.pilotId, sessionId);
    if (status.status === 'completed') reconcilePaidFirehawk(profileStore.getOrCreate(identity.pilotId, identity.pilotName));
    if (status.recoveryCode) analyticsStore.recordEvent({ pilotId: identity.pilotId, ...analyticsHost(request.headers.host), aircraftType: 'fighter' }, 'purchase_recovery_created', { source: 'stripe' });
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(status)); return;
  }
  if (requestUrl.pathname === '/api/firehawk/restore') {
    if (request.method !== 'POST') { response.writeHead(405, { Allow: 'POST' }); response.end(); return; }
    if (!sameOriginJsonRequest(request, configuredWebOrigin)) { jsonResponse(response, 403, { error: 'Request could not be verified.' }); return; }
    const identity = authenticatedIdentity(request, response);
    if (!identity) return;
    if (!identity.session.accountId) { jsonResponse(response, 401, { error: 'Sign in to restore purchases.' }); return; }
    const pilotLimit = limitedBy('recovery-pilot', identity.pilotId, securityLimits.recoveryPilot);
    const ipLimit = limitedBy('recovery-ip', identity.clientIp, securityLimits.recoveryIp);
    if (pilotLimit.limited || ipLimit.limited) { rateLimited(response, Math.max(pilotLimit.retryAfterMs, ipLimit.retryAfterMs)); return; }
    const payload = await readJson(request); const code = typeof payload?.recoveryCode === 'string' ? payload.recoveryCode : '';
    const restored = firehawkPayments.restore(code, identity.pilotId);
    if (!restored.ok) { response.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end('{"error":"Invalid recovery code"}'); return; }
    if (restored.previousPilotId && restored.previousPilotId !== identity.pilotId && restored.stripeMode && !firehawkPayments.completedForPilot(restored.previousPilotId)) {
      profileStore.revokeAircraftEntitlementSource(restored.previousPilotId, 'fighter', `stripe:${restored.stripeMode}`);
    }
    const profile = profileStore.grantAircraftEntitlements(identity.pilotId, ['fighter'], `stripe:${restored.stripeMode ?? firehawkPayments.mode}`);
    securityLimiter.clear('recovery-pilot', identity.pilotId);
    analyticsStore.recordEvent({ pilotId: identity.pilotId, ...analyticsHost(request.headers.host), aircraftType: 'fighter' }, 'purchase_recovery_succeeded', { source: restored.reference });
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ profile: profile ? reconcilePaidFirehawk(profile) : undefined, recoveryCode: restored.recoveryCode, reference: restored.reference })); return;
  }
  if (requestUrl.pathname === '/admin/analytics') {
    if (!validAdminPassword(request.headers.authorization, process.env.AIRPORT_CHAOS_ADMIN_PASSWORD_HASH)) {
      response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Airport Chaos Analytics"', 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end('Authentication required'); return;
    }
    const includeDevelopment = requestUrl.searchParams.get('environment') === 'all';
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" });
    response.end(analyticsStore.dashboardHtml(!includeDevelopment, Date.now(), firehawkPayments.metrics(), firehawkPayments.mode)); return;
  }
  if (requestUrl.pathname === '/api/analytics/intent') {
    if (request.method !== 'POST') { response.writeHead(405, { Allow: 'POST' }); response.end(); return; }
    const session = pilotSessions.resolveSession(request.headers.cookie);
    if (!session || !sameOriginJsonRequest(request, configuredWebOrigin)) { jsonResponse(response, 403, { error: 'Request could not be verified.' }); return; }
    const limited = limitedBy('analytics-intent-pilot', session.pilotId, securityLimits.analyticsIntentPilot);
    if (limited.limited) { rateLimited(response, limited.retryAfterMs); return; }
    const intent = parseClientIntent(await readJson(request));
    if (!intent) { jsonResponse(response, 400, { error: 'Invalid analytics event.' }); return; }
    const context: AnalyticsContext = {
      pilotId: session.pilotId, sessionId: `${session.pilotId}:${intent.sessionId}`,
      journeyId: `${session.pilotId}:${intent.sessionId}`,
      cityId: intent.cityId, aircraftType: intent.aircraftType,
      platform: analyticsPlatform(request), ...analyticsHost(request.headers.host),
    };
    analyticsStore.startSession(context);
    analyticsStore.recordEvent(context, intent.event, intent.cosmeticId || intent.itemId ? { source: intent.itemId ?? intent.cosmeticId,
      metadata: { ...(intent.currency ? { currency: intent.currency } : {}), ...(intent.itemType ? { itemType: intent.itemType } : {}), ...(intent.category ? { category: intent.category } : {}) } }
      : intent.category ? { metadata: { category: intent.category } } : {});
    if (intent.event === 'rewards_viewed') {
      const dailyReward = profileStore.dailyRewardState(session.pilotId);
      if (dailyReward?.claimable) analyticsStore.recordEvent(context, 'daily_reward_available',
        { source: String(dailyReward.lastClaimedAt ?? 0), metadata: { day: dailyReward.nextDay } });
    }
    response.writeHead(204, { 'Cache-Control': 'no-store' }); response.end(); return;
  }
  if (requestUrl.pathname === '/api/daily-reward') {
    if (request.method !== 'GET' && request.method !== 'POST') { response.writeHead(405, { Allow: 'GET, POST' }); response.end(); return; }
    const session = pilotSessions.resolveSession(request.headers.cookie);
    if (!session) { jsonResponse(response, 401, { error: 'Play as Guest or sign in to claim rewards.' }); return; }
    profileStore.getOrCreate(session.pilotId, 'Pilot');
    if (request.method === 'GET') {
      const dailyReward = profileStore.dailyRewardState(session.pilotId);
      if (dailyReward?.claimable) analyticsStore.recordEvent({ pilotId: session.pilotId, platform: analyticsPlatform(request), ...analyticsHost(request.headers.host) }, 'daily_reward_available',
        { source: String(dailyReward.lastClaimedAt ?? 0), metadata: { day: dailyReward.nextDay } });
      jsonResponse(response, 200, { dailyReward, serverNow: Date.now() });
      return;
    }
    if (!sameOriginJsonRequest(request, configuredWebOrigin)) { jsonResponse(response, 403, { error: 'Request could not be verified.' }); return; }
    const payload = await readJson(request);
    if (!payload || Object.keys(payload).length > 0) { jsonResponse(response, 400, { error: 'Invalid request.' }); return; }
    const clientIp = trustedClientIp(request);
    const pilotLimit = limitedBy('daily-reward-pilot', session.pilotId, securityLimits.dailyRewardPilot);
    const ipLimit = limitedBy('daily-reward-ip', clientIp, securityLimits.dailyRewardIp);
    if (pilotLimit.limited || ipLimit.limited) { rateLimited(response, Math.max(pilotLimit.retryAfterMs, ipLimit.retryAfterMs)); return; }
    try {
      const before = profileStore.dailyRewardState(session.pilotId);
      const result = profileStore.claimDailyReward(session.pilotId);
      if (!result) { jsonResponse(response, 404, { error: 'Player profile unavailable.' }); return; }
      if (!result.claimed) { jsonResponse(response, 409, { error: "Your next reward isn't ready yet.", dailyReward: result.state, serverNow: Date.now() }); return; }
      analyticsStore.recordEvent({ pilotId: session.pilotId, platform: analyticsPlatform(request), ...analyticsHost(request.headers.host) }, 'daily_reward_claimed',
        { amount: result.credits, metadata: { day: result.day, delaySeconds: before?.nextEligibleAt ? Math.max(0, Math.round((Date.now() - before.nextEligibleAt) / 1_000)) : 0 } });
      jsonResponse(response, 200, { ...result, serverNow: Date.now() });
    } catch (error) {
      console.warn('[daily-reward] claim failed', error instanceof Error ? error.message : 'unknown');
      jsonResponse(response, 503, { error: 'Unable to claim reward. Please try again.' });
    }
    return;
  }
  if (requestUrl.pathname.startsWith('/api/rewarded-ads/')) {
    const session = pilotSessions.resolveSession(request.headers.cookie);
    const platform = nativeAuthPlatform(request);
    if (!session || !platform) { jsonResponse(response, 401, { error: 'Rewarded videos require a mobile player session.' }); return; }
    profileStore.getOrCreate(session.pilotId, 'Pilot');
    const clientIp = trustedClientIp(request);
    const statusRequest = request.method === 'GET';
    const pilotLimit = limitedBy(statusRequest ? 'rewarded-ad-status-pilot' : 'rewarded-ad-pilot', session.pilotId,
      statusRequest ? securityLimits.rewardedAdStatusPilot : securityLimits.rewardedAdPilot);
    const ipLimit = limitedBy('rewarded-ad-ip', clientIp, securityLimits.rewardedAdIp);
    if (pilotLimit.limited || ipLimit.limited) { rateLimited(response, Math.max(pilotLimit.retryAfterMs, ipLimit.retryAfterMs)); return; }

    if (requestUrl.pathname === '/api/rewarded-ads/status') {
      if (request.method !== 'GET') { response.writeHead(405, { Allow: 'GET' }); response.end(); return; }
      jsonResponse(response, 200, { rewardedAds: rewardedAdStore.status(session.pilotId, platform) }); return;
    }
    if (requestUrl.pathname === '/api/rewarded-ads/attempt-status') {
      if (request.method !== 'GET') { response.writeHead(405, { Allow: 'GET' }); response.end(); return; }
      const attemptId = requestUrl.searchParams.get('attemptId') ?? '';
      const result = rewardedAdStore.attemptStatus(session.pilotId, attemptId);
      if (!result) { jsonResponse(response, 404, { error: 'Reward attempt unavailable.' }); return; }
      jsonResponse(response, 200, {
        ...result,
        profile: result.attemptStatus === 'REWARDED' ? reconcilePaidFirehawk(profileStore.getOrCreate(session.pilotId, 'Pilot')) : undefined,
      });
      return;
    }
    if (request.method !== 'POST') { response.writeHead(405, { Allow: 'POST' }); response.end(); return; }
    if (!sameOriginJsonRequest(request, configuredWebOrigin)) { jsonResponse(response, 403, { error: 'Request could not be verified.' }); return; }
    const payload = await readJson(request);
    if (!payload) { jsonResponse(response, 400, { error: 'Invalid request.' }); return; }
    if (requestUrl.pathname === '/api/rewarded-ads/attempt') {
      if (Object.keys(payload).length > 0) { jsonResponse(response, 400, { error: 'Invalid request.' }); return; }
      const created = rewardedAdStore.createAttempt(session.pilotId, platform);
      if (!created.ok) {
        if (created.code === 'LIMIT_REACHED') analyticsStore.recordEvent({ pilotId: session.pilotId, ...analyticsHost(request.headers.host) }, 'rewarded_ad_limit_reached', { source: platform });
        const message = created.code === 'CLAIM_REQUIRED' ? 'Claim your free hourly reward to unlock videos.'
          : created.code === 'LIMIT_REACHED' ? 'All video rewards are claimed for this reward window.'
          : created.code === 'ACTIVE_ATTEMPT' ? 'Another rewarded video is already active.'
            : 'Rewarded videos are unavailable.';
        jsonResponse(response, created.code === 'UNSUPPORTED' ? 404 : 409, { error: message, rewardedAds: created.status }); return;
      }
      analyticsStore.recordEvent({ pilotId: session.pilotId, ...analyticsHost(request.headers.host) }, 'rewarded_ad_requested', {
        amount: created.attempt.rewardCredits, source: platform, metadata: { provider: created.attempt.provider, remaining: created.status.remaining },
      });
      jsonResponse(response, 201, { attempt: created.attempt, rewardedAds: created.status }); return;
    }
    if (requestUrl.pathname === '/api/rewarded-ads/event') {
      const attemptId = typeof payload.attemptId === 'string' ? payload.attemptId : '';
      const event = (['started', 'qualified', 'closed', 'failed'] as const).includes(payload.event as RewardedAdClientEvent)
        ? payload.event as RewardedAdClientEvent : undefined;
      if (!event || Object.keys(payload).some((key) => key !== 'attemptId' && key !== 'event')) {
        jsonResponse(response, 400, { error: 'Invalid request.' }); return;
      }
      const status = rewardedAdStore.recordClientEvent(session.pilotId, attemptId, event);
      if (!status) { jsonResponse(response, 404, { error: 'Reward attempt unavailable.' }); return; }
      const eventName = event === 'started' ? 'rewarded_ad_started'
        : event === 'qualified' ? 'rewarded_ad_pending'
          : event === 'closed' ? 'rewarded_ad_dismissed' : 'rewarded_ad_failed';
      analyticsStore.recordEvent({ pilotId: session.pilotId, ...analyticsHost(request.headers.host) }, eventName, {
        amount: status.rewardCredits, source: platform, metadata: { provider: 'ADMOB', remaining: status.remaining },
      });
      jsonResponse(response, 200, { rewardedAds: status }); return;
    }
    jsonResponse(response, 404, { error: 'Not found.' }); return;
  }
  const journeyAction = /^\/api\/journey\/dallas\/(mission-01|mission-02|mission-03|mission-04|mission-05|mission-06|mission-07|mission-08|mission-09|mission-10|mission-11|mission-12|mission-13|mission-14|mission-15|mission-16|mission-17|mission-18|mission-19|mission-20|mission-21|mission-22|mission-23|mission-24)\/(launch|abandon)$/.exec(requestUrl.pathname);
  if (requestUrl.pathname === '/api/journey/dallas' || journeyAction) {
    const identity = authenticatedIdentity(request, response);
    if (!identity) return;
    const journeyProfile = profileStore.getOrCreate(identity.pilotId, identity.pilotName);
    const dallasUnlocked = journeyProfile.tutorial.dallasUnlocked;
    if (requestUrl.pathname === '/api/journey/dallas' && request.method === 'GET') {
      jsonResponse(response, 200, { missionId: journeyDallas01.id,
        eligible: dallasUnlocked && journeyProfile.unlockedAircraft.includes(journeyProfile.selectedAircraft),
        ...journeyStore.progress(identity.pilotId), mission02: {
          eligible: (stagingJourneyQaUnlockAll || journeyStore.progress(identity.pilotId).completed) && dallasUnlocked && journeyProfile.unlockedAircraft.includes(journeyProfile.selectedAircraft),
          ...journeyStore.progress(identity.pilotId, journeyDallas02.id),
        }, mission03: {
          eligible: (stagingJourneyQaUnlockAll || journeyStore.progress(identity.pilotId, journeyDallas02.id).completed) && dallasUnlocked && journeyProfile.unlockedAircraft.includes(journeyProfile.selectedAircraft),
          ...journeyStore.progress(identity.pilotId, journeyDallas03.id),
        }, mission04: {
          eligible: (stagingJourneyQaUnlockAll || journeyStore.progress(identity.pilotId, journeyDallas03.id).completed) && dallasUnlocked && journeyProfile.unlockedAircraft.includes(journeyProfile.selectedAircraft),
          ...journeyStore.progress(identity.pilotId, journeyDallas04.id),
        }, mission05: {
          eligible: (stagingJourneyQaUnlockAll || journeyStore.progress(identity.pilotId, journeyDallas04.id).completed) && dallasUnlocked && journeyProfile.unlockedAircraft.includes(journeyProfile.selectedAircraft),
          ...journeyStore.progress(identity.pilotId, journeyDallas05.id),
        }, mission06: {
          eligible: (stagingJourneyQaUnlockAll || journeyStore.progress(identity.pilotId, journeyDallas05.id).completed) && dallasUnlocked && journeyProfile.unlockedAircraft.includes(journeyProfile.selectedAircraft),
          ...journeyStore.progress(identity.pilotId, journeyDallas06.id),
        }, mission07: {
          eligible: (stagingJourneyQaUnlockAll || journeyStore.progress(identity.pilotId, journeyDallas06.id).completed) && dallasUnlocked && journeyProfile.unlockedAircraft.includes(journeyProfile.selectedAircraft),
          ...journeyStore.progress(identity.pilotId, journeyDallas07.id),
        }, mission08: {
          eligible: (stagingJourneyQaUnlockAll || journeyStore.progress(identity.pilotId, journeyDallas07.id).completed) && dallasUnlocked && journeyProfile.unlockedAircraft.includes(journeyProfile.selectedAircraft),
          ...journeyStore.progress(identity.pilotId, journeyDallas08.id),
        }, mission09: {
          eligible: (stagingJourneyQaUnlockAll || journeyStore.progress(identity.pilotId, journeyDallas08.id).completed) && dallasUnlocked && journeyProfile.unlockedAircraft.includes(journeyProfile.selectedAircraft),
          ...journeyStore.progress(identity.pilotId, journeyDallas09.id),
        }, mission10: {
          eligible: (stagingJourneyQaUnlockAll || journeyStore.progress(identity.pilotId, journeyDallas09.id).completed) && dallasUnlocked && journeyProfile.unlockedAircraft.includes(journeyProfile.selectedAircraft),
          ...journeyStore.progress(identity.pilotId, journeyDallas10.id),
        }, mission11: {
          eligible: (stagingJourneyQaUnlockAll || journeyStore.progress(identity.pilotId, journeyDallas10.id).completed) && dallasUnlocked && journeyProfile.unlockedAircraft.includes(journeyProfile.selectedAircraft),
          ...journeyStore.progress(identity.pilotId, journeyDallas11.id),
        }, mission12: {
          eligible: (stagingJourneyQaUnlockAll || journeyStore.progress(identity.pilotId, journeyDallas11.id).completed) && dallasUnlocked && journeyProfile.unlockedAircraft.includes(journeyProfile.selectedAircraft),
          ...journeyStore.progress(identity.pilotId, journeyDallas12.id),
        }, mission13: {
          eligible: (stagingJourneyQaUnlockAll || journeyStore.progress(identity.pilotId, journeyDallas12.id).completed) && dallasUnlocked && journeyProfile.unlockedAircraft.includes(journeyProfile.selectedAircraft),
          ...journeyStore.progress(identity.pilotId, journeyDallas13.id),
        }, mission14: {
          eligible: (stagingJourneyQaUnlockAll || journeyStore.progress(identity.pilotId, journeyDallas13.id).completed) && dallasUnlocked && journeyProfile.unlockedAircraft.includes(journeyProfile.selectedAircraft),
          ...journeyStore.progress(identity.pilotId, journeyDallas14.id),
        }, mission15: {
          eligible: (stagingJourneyQaUnlockAll || journeyStore.progress(identity.pilotId, journeyDallas14.id).completed) && dallasUnlocked && journeyProfile.unlockedAircraft.includes(journeyProfile.selectedAircraft),
          ...journeyStore.progress(identity.pilotId, journeyDallas15.id),
        }, mission16: {
          eligible: (stagingJourneyQaUnlockAll || journeyStore.progress(identity.pilotId, journeyDallas15.id).completed) && dallasUnlocked && journeyProfile.unlockedAircraft.includes(journeyProfile.selectedAircraft),
          ...journeyStore.progress(identity.pilotId, journeyDallas16.id),
        }, mission17: {
          eligible: (stagingJourneyQaUnlockAll || journeyStore.progress(identity.pilotId, journeyDallas16.id).completed) && dallasUnlocked && journeyProfile.unlockedAircraft.includes(journeyProfile.selectedAircraft),
          ...journeyStore.progress(identity.pilotId, journeyDallas17.id),
        }, mission18: {
          eligible: (stagingJourneyQaUnlockAll || journeyStore.progress(identity.pilotId, journeyDallas17.id).completed) && dallasUnlocked && journeyProfile.unlockedAircraft.includes(journeyProfile.selectedAircraft),
          ...journeyStore.progress(identity.pilotId, journeyDallas18.id),
        }, mission19: {
          eligible: (stagingJourneyQaUnlockAll || journeyStore.progress(identity.pilotId, journeyDallas18.id).completed) && dallasUnlocked && journeyProfile.unlockedAircraft.includes(journeyProfile.selectedAircraft),
          ...journeyStore.progress(identity.pilotId, journeyDallas19.id),
        }, mission20: {
          eligible: (stagingJourneyQaUnlockAll || journeyStore.progress(identity.pilotId, journeyDallas19.id).completed) && dallasUnlocked && journeyProfile.unlockedAircraft.includes(journeyProfile.selectedAircraft),
          ...journeyStore.progress(identity.pilotId, journeyDallas20.id),
        }, mission21: {
          eligible: (stagingJourneyQaUnlockAll || journeyStore.progress(identity.pilotId, journeyDallas20.id).completed) && dallasUnlocked && journeyProfile.unlockedAircraft.includes(journeyProfile.selectedAircraft),
          ...journeyStore.progress(identity.pilotId, journeyDallas21.id),
        }, mission22: {
          eligible: (stagingJourneyQaUnlockAll || journeyStore.progress(identity.pilotId, journeyDallas21.id).completed) && dallasUnlocked && journeyProfile.unlockedAircraft.includes(journeyProfile.selectedAircraft),
          ...journeyStore.progress(identity.pilotId, journeyDallas22.id),
        }, mission23: {
          eligible: (stagingJourneyQaUnlockAll || journeyStore.progress(identity.pilotId, journeyDallas22.id).completed) && dallasUnlocked && journeyProfile.unlockedAircraft.includes(journeyProfile.selectedAircraft),
          ...journeyStore.progress(identity.pilotId, journeyDallas23.id),
        }, mission24: {
          eligible: (stagingJourneyQaUnlockAll || journeyStore.progress(identity.pilotId, journeyDallas23.id).completed) && dallasUnlocked && journeyProfile.unlockedAircraft.includes(journeyProfile.selectedAircraft),
          ...journeyStore.progress(identity.pilotId, journeyDallas24.id),
        } }); return;
    }
    if (request.method !== 'POST' || !journeyAction) { response.writeHead(405, { Allow: 'GET, POST' }); response.end(); return; }
    if (!sameOriginJsonRequest(request, configuredWebOrigin)) { jsonResponse(response, 403, { error: 'Request could not be verified.' }); return; }
    const payload = await readJson(request);
    if (journeyAction?.[2] === 'launch') {
      if (!payload || Object.keys(payload).length !== 0) { jsonResponse(response, 400, { error: 'Invalid mission launch.' }); return; }
      if (!dallasUnlocked) { jsonResponse(response, 403, { error: 'Complete Milwaukee training to unlock Dallas.' }); return; }
      const limit = limitedBy('journey-launch-pilot', identity.pilotId, securityLimits.journeyLaunchPilot);
      if (limit.limited) { rateLimited(response, limit.retryAfterMs); return; }
      if (!journeyProfile.unlockedAircraft.includes(journeyProfile.selectedAircraft)) { jsonResponse(response, 403, { error: 'Aircraft is unavailable.' }); return; }
      const missionId = journeyAction[1] === 'mission-24' ? journeyDallas24.id : journeyAction[1] === 'mission-23' ? journeyDallas23.id : journeyAction[1] === 'mission-22' ? journeyDallas22.id : journeyAction[1] === 'mission-21' ? journeyDallas21.id : journeyAction[1] === 'mission-20' ? journeyDallas20.id : journeyAction[1] === 'mission-19' ? journeyDallas19.id : journeyAction[1] === 'mission-18' ? journeyDallas18.id : journeyAction[1] === 'mission-17' ? journeyDallas17.id : journeyAction[1] === 'mission-16' ? journeyDallas16.id : journeyAction[1] === 'mission-15' ? journeyDallas15.id : journeyAction[1] === 'mission-14' ? journeyDallas14.id : journeyAction[1] === 'mission-13' ? journeyDallas13.id : journeyAction[1] === 'mission-12' ? journeyDallas12.id : journeyAction[1] === 'mission-11' ? journeyDallas11.id : journeyAction[1] === 'mission-10' ? journeyDallas10.id : journeyAction[1] === 'mission-09' ? journeyDallas09.id : journeyAction[1] === 'mission-08' ? journeyDallas08.id : journeyAction[1] === 'mission-07' ? journeyDallas07.id : journeyAction[1] === 'mission-06' ? journeyDallas06.id : journeyAction[1] === 'mission-05' ? journeyDallas05.id : journeyAction[1] === 'mission-04' ? journeyDallas04.id : journeyAction[1] === 'mission-03' ? journeyDallas03.id : journeyAction[1] === 'mission-02' ? journeyDallas02.id : journeyDallas01.id;
      if (!stagingJourneyQaUnlockAll) {
        if (missionId === journeyDallas02.id && !journeyStore.progress(identity.pilotId).completed) {
          jsonResponse(response, 403, { error: 'Complete Mission 1 first.' }); return;
        }
        if (missionId === journeyDallas03.id && !journeyStore.progress(identity.pilotId, journeyDallas02.id).completed) {
          jsonResponse(response, 403, { error: 'Complete Mission 2 first.' }); return;
        }
        if (missionId === journeyDallas04.id && !journeyStore.progress(identity.pilotId, journeyDallas03.id).completed) {
          jsonResponse(response, 403, { error: 'Complete Mission 3 first.' }); return;
        }
        if (missionId === journeyDallas05.id && !journeyStore.progress(identity.pilotId, journeyDallas04.id).completed) {
          jsonResponse(response, 403, { error: 'Complete Mission 4 first.' }); return;
        }
        if (missionId === journeyDallas06.id && !journeyStore.progress(identity.pilotId, journeyDallas05.id).completed) {
          jsonResponse(response, 403, { error: 'Complete Mission 5 first.' }); return;
        }
        if (missionId === journeyDallas07.id && !journeyStore.progress(identity.pilotId, journeyDallas06.id).completed) {
          jsonResponse(response, 403, { error: 'Complete Mission 6 first.' }); return;
        }
        if (missionId === journeyDallas08.id && !journeyStore.progress(identity.pilotId, journeyDallas07.id).completed) {
          jsonResponse(response, 403, { error: 'Complete Mission 7 first.' }); return;
        }
        if (missionId === journeyDallas09.id && !journeyStore.progress(identity.pilotId, journeyDallas08.id).completed) {
          jsonResponse(response, 403, { error: 'Complete Mission 8 first.' }); return;
        }
        if (missionId === journeyDallas10.id && !journeyStore.progress(identity.pilotId, journeyDallas09.id).completed) {
          jsonResponse(response, 403, { error: 'Complete Mission 9 first.' }); return;
        }
        if (missionId === journeyDallas11.id && !journeyStore.progress(identity.pilotId, journeyDallas10.id).completed) {
          jsonResponse(response, 403, { error: 'Complete Mission 10 first.' }); return;
        }
        if (missionId === journeyDallas12.id && !journeyStore.progress(identity.pilotId, journeyDallas11.id).completed) {
          jsonResponse(response, 403, { error: 'Complete Mission 11 first.' }); return;
        }
        if (missionId === journeyDallas13.id && !journeyStore.progress(identity.pilotId, journeyDallas12.id).completed) {
          jsonResponse(response, 403, { error: 'Complete Mission 12 first.' }); return;
        }
        if (missionId === journeyDallas14.id && !journeyStore.progress(identity.pilotId, journeyDallas13.id).completed) {
          jsonResponse(response, 403, { error: 'Complete Mission 13 first.' }); return;
        }
        if (missionId === journeyDallas15.id && !journeyStore.progress(identity.pilotId, journeyDallas14.id).completed) {
          jsonResponse(response, 403, { error: 'Complete Mission 14 first.' }); return;
        }
        if (missionId === journeyDallas16.id && !journeyStore.progress(identity.pilotId, journeyDallas15.id).completed) {
          jsonResponse(response, 403, { error: 'Complete Mission 15 first.' }); return;
        }
        if (missionId === journeyDallas17.id && !journeyStore.progress(identity.pilotId, journeyDallas16.id).completed) {
          jsonResponse(response, 403, { error: 'Complete Mission 16 first.' }); return;
        }
        if (missionId === journeyDallas19.id && !journeyStore.progress(identity.pilotId, journeyDallas18.id).completed) { jsonResponse(response, 403, { error: 'Journey mission is locked.' }); return; }
        if (missionId === journeyDallas20.id && !journeyStore.progress(identity.pilotId, journeyDallas19.id).completed) { jsonResponse(response, 403, { error: 'Journey mission is locked.' }); return; }
        if (missionId === journeyDallas21.id && !journeyStore.progress(identity.pilotId, journeyDallas20.id).completed) { jsonResponse(response, 403, { error: 'Journey mission is locked.' }); return; }
        if (missionId === journeyDallas22.id && !journeyStore.progress(identity.pilotId, journeyDallas21.id).completed) { jsonResponse(response, 403, { error: 'Journey mission is locked.' }); return; }
        if (missionId === journeyDallas23.id && !journeyStore.progress(identity.pilotId, journeyDallas22.id).completed) { jsonResponse(response, 403, { error: 'Journey mission is locked.' }); return; }
        if (missionId === journeyDallas24.id && !journeyStore.progress(identity.pilotId, journeyDallas23.id).completed) { jsonResponse(response, 403, { error: 'Journey mission is locked.' }); return; }
        if (missionId === journeyDallas18.id && !journeyStore.progress(identity.pilotId, journeyDallas17.id).completed) {
          jsonResponse(response, 403, { error: 'Complete Mission 17 first.' }); return;
        }
      }
      if (Object.values(journeyProfile.missions).some(state => state?.active)) {
        jsonResponse(response, 409, { error: 'Finish or leave your current flight mission first.' }); return;
      }
      const attempt = journeyStore.launch(identity.pilotId, journeyProfile.selectedAircraft, Date.now(), missionId);
      for (const [playerId, linkedId] of playerJourneyAttempts) {
        if (players.get(playerId)?.pilotId !== identity.pilotId) continue;
        if (pausedJourneyPlayers.get(playerId)?.attemptId === linkedId && !hasOpenPlayerSocket(playerId)) {
          cleanupHumanPlayer(playerId);
          continue;
        }
        speedGateTracker.clear(playerId);
        speedGateWarningAt.delete(playerId);
        wrongWayGateWarningAt.delete(playerId);
        playerJourneyRunwayPrep.delete(playerId);
        playerJourneyLoveTakeoff.delete(playerId);
        playerJourneyAddisonTakeoff.delete(playerId);
        const replaced = journeyStore.get(identity.pilotId, linkedId);
        if (replaced) { removeJourneyHunter(replaced); sendJourneyState(playerId, replaced); }
      }
      jsonResponse(response, 201, { attempt }); return;
    }
    const attemptId = typeof payload?.attemptId === 'string' ? payload.attemptId : '';
    const current = journeyStore.get(identity.pilotId, attemptId);
    const requestedMissionId = journeyAction?.[1] === 'mission-24' ? journeyDallas24.id : journeyAction?.[1] === 'mission-23' ? journeyDallas23.id : journeyAction?.[1] === 'mission-22' ? journeyDallas22.id : journeyAction?.[1] === 'mission-21' ? journeyDallas21.id : journeyAction?.[1] === 'mission-20' ? journeyDallas20.id : journeyAction?.[1] === 'mission-19' ? journeyDallas19.id : journeyAction?.[1] === 'mission-18' ? journeyDallas18.id : journeyAction?.[1] === 'mission-17' ? journeyDallas17.id : journeyAction?.[1] === 'mission-16' ? journeyDallas16.id : journeyAction?.[1] === 'mission-15' ? journeyDallas15.id : journeyAction?.[1] === 'mission-14' ? journeyDallas14.id : journeyAction?.[1] === 'mission-13' ? journeyDallas13.id : journeyAction?.[1] === 'mission-12' ? journeyDallas12.id : journeyAction?.[1] === 'mission-11' ? journeyDallas11.id : journeyAction?.[1] === 'mission-10' ? journeyDallas10.id : journeyAction?.[1] === 'mission-09' ? journeyDallas09.id : journeyAction?.[1] === 'mission-08' ? journeyDallas08.id : journeyAction?.[1] === 'mission-07' ? journeyDallas07.id : journeyAction?.[1] === 'mission-06' ? journeyDallas06.id : journeyAction?.[1] === 'mission-05' ? journeyDallas05.id : journeyAction?.[1] === 'mission-04' ? journeyDallas04.id : journeyAction?.[1] === 'mission-03' ? journeyDallas03.id : journeyAction?.[1] === 'mission-02' ? journeyDallas02.id : journeyDallas01.id;
    if (!current || current.missionId !== requestedMissionId) {
      jsonResponse(response, 404, { error: 'Mission attempt unavailable.' }); return;
    }
    const abandoned = journeyStore.abandon(identity.pilotId, attemptId);
    if (abandoned) removeJourneyHunter(abandoned);
    for (const [playerId, linkedId] of playerJourneyAttempts) {
      if (linkedId === attemptId) {
        if (pausedJourneyPlayers.get(playerId)?.attemptId === attemptId && !hasOpenPlayerSocket(playerId)) {
          cleanupHumanPlayer(playerId);
          continue;
        }
        speedGateTracker.clear(playerId);
        speedGateWarningAt.delete(playerId);
        wrongWayGateWarningAt.delete(playerId);
        playerJourneyRunwayPrep.delete(playerId);
        playerJourneyLoveTakeoff.delete(playerId);
        playerJourneyAddisonTakeoff.delete(playerId);
        if (abandoned) sendJourneyState(playerId, abandoned);
      }
    }
    jsonResponse(response, 200, { attempt: abandoned }); return;
  }
  if (requestUrl.pathname === '/api/profile') {
    const identity = authenticatedIdentity(request, response);
    if (!identity) return;
    if (request.method === 'GET') {
      const profile = reconcilePaidFirehawk(profileStore.getOrCreate(identity.pilotId, identity.pilotName));
      const hasActiveFlight = [...players.values()].some(player => !player.isBot && player.pilotId === identity.pilotId);
      const currentProfile = hasActiveFlight ? profile : profileStore.consumeExpiredFighterTrial(identity.pilotId) ?? profile;
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ ...currentProfile,
        legendaryPilot: journeyStore.progress(identity.pilotId, journeyDallas24.id).completed,
        profileSummary: pilotProfileSummaryStore.summary(identity.pilotId) }));
      return;
    }
    if (request.method === 'POST') {
      if (!sameOriginJsonRequest(request, configuredWebOrigin)) { jsonResponse(response, 403, { error: 'Request could not be verified.' }); return; }
      const payload = await readJson(request);
      let profile: PlayerProfile | undefined;
      let error: string | undefined;
      let storeUnlockChanged = false;
      if (payload?.analyticsEvent === 'fighter_modal_viewed' || payload?.analyticsEvent === 'fighter_purchase_clicked') {
        profile = profileStore.getOrCreate(identity.pilotId, identity.pilotName);
        const host = analyticsHost(request.headers.host);
        analyticsStore.recordEvent({ pilotId: identity.pilotId, ...host }, payload.analyticsEvent, { source: 'start_garage' });
      } else if (payload?.legacy) {
        profile = identity.session.accountId
          ? profileStore.getOrCreate(identity.pilotId, identity.pilotName)
          : profileStore.importLegacy(identity.pilotId, payload.legacy as LegacyProfileImport);
      }
      else if (payload?.equipAircraft !== undefined) {
        const previous = profileStore.getOrCreate(identity.pilotId, identity.pilotName).selectedAircraft;
        profile = profileStore.equipAircraft(identity.pilotId, payload.equipAircraft);
        if (profile && profile.selectedAircraft !== previous) analyticsStore.recordEvent({ pilotId: identity.pilotId,
          platform: analyticsPlatform(request), aircraftType: profile.selectedAircraft, ...analyticsHost(request.headers.host) }, 'aircraft_equipped');
      }
      else if (typeof payload?.purchaseCosmetic === 'string' || typeof payload?.equipCosmetic === 'string') {
        const purchasing = typeof payload.purchaseCosmetic === 'string';
        if (purchasing) {
          const limit = limitedBy('cosmetic-purchase-pilot', identity.pilotId, securityLimits.cosmeticPurchasePilot);
          if (limit.limited) { rateLimited(response, limit.retryAfterMs); return; }
        }
        const currency = purchasing ? payload.cosmeticCurrency ?? 'CREDITS' : undefined;
        if (currency === 'SKY_TOKENS' && (!identity.session.accountId || !skyTokenCommerceAvailable(request))) error = 'SKY TOKEN UNLOCKS UNAVAILABLE';
        else {
          const result: { ok: boolean; purchased?: boolean; reason?: string; profile?: PlayerProfile } = purchasing
            ? profileStore.purchaseCosmetic(identity.pilotId, payload.purchaseCosmetic as string, currency)
            : profileStore.equipCosmetic(identity.pilotId, payload.equipCosmetic as string);
          profile = result.profile; error = result.ok ? undefined : result.reason;
          if (purchasing && result.ok && result.purchased) storeUnlockChanged = true;
          if (result.ok && (purchasing ? result.purchased : true)) {
            const item = cosmeticCatalog.find(entry => entry.id === (purchasing ? payload.purchaseCosmetic : payload.equipCosmetic));
            if (item) analyticsStore.recordEvent({ pilotId: identity.pilotId, aircraftType: item.aircraftRestriction,
              platform: analyticsPlatform(request), ...analyticsHost(request.headers.host) }, purchasing ? 'cosmetic_unlocked' : 'cosmetic_equipped',
              { source: item.id, metadata: purchasing ? { currency: currency === 'SKY_TOKENS' ? 'sky_tokens' : 'credits' } : {} });
          }
        }
      }
      else if (payload?.startFighterTrial === true) {
        const result = profileStore.requestFighterTrial(identity.pilotId);
        profile = result.profile; error = result.ok ? undefined : result.reason;
      }
      else if (payload?.purchaseAircraft !== undefined) {
        const before = profileStore.getOrCreate(identity.pilotId, identity.pilotName);
        const result = profileStore.purchaseAircraft(identity.pilotId, payload.purchaseAircraft);
        profile = result.profile; error = result.ok ? undefined : result.reason;
        if (result.ok && profile && typeof payload.purchaseAircraft === 'string' && !before.unlockedAircraft.includes(payload.purchaseAircraft as AircraftType) && profile.unlockedAircraft.includes(payload.purchaseAircraft as AircraftType)) {
          storeUnlockChanged = true;
          const host = analyticsHost(request.headers.host);
          analyticsStore.recordEvent({ pilotId: identity.pilotId, ...host, aircraftType: payload.purchaseAircraft }, 'aircraft_unlocked', { source: 'credits' });
        }
      } else if (payload?.purchaseAircraftWithSkyTokens !== undefined) {
        if (!identity.session.accountId || !skyTokenCommerceAvailable(request)) { error = 'Sky Token unlocks are unavailable.'; }
        else {
          const before = profileStore.getOrCreate(identity.pilotId, identity.pilotName);
          const result = profileStore.purchaseAircraftWithSkyTokens(identity.pilotId, payload.purchaseAircraftWithSkyTokens);
          profile = result.profile; error = result.ok ? undefined : result.reason;
          if (result.ok && profile && typeof payload.purchaseAircraftWithSkyTokens === 'string' &&
              !before.unlockedAircraft.includes(payload.purchaseAircraftWithSkyTokens as AircraftType)) {
            storeUnlockChanged = true;
            analyticsStore.recordEvent({ pilotId: identity.pilotId, ...analyticsHost(request.headers.host), aircraftType: payload.purchaseAircraftWithSkyTokens },
              'aircraft_unlocked', { source: 'sky_tokens' });
            analyticsStore.recordEvent({ pilotId: identity.pilotId, ...analyticsHost(request.headers.host), aircraftType: payload.purchaseAircraftWithSkyTokens },
              'sky_token_spent', { amount: before.skyTokens - profile.skyTokens, source: 'garage' });
          }
        }
      } else if (payload?.testerCode !== undefined) {
        const before = profileStore.getOrCreate(identity.pilotId, identity.pilotName);
        const result = redeemTesterCode(identity.pilotId, payload.testerCode, identity.clientIp);
        profile = result.profile; error = result.ok ? undefined : result.reason;
        if (result.ok && profile?.unlockedAircraft.includes('fighter') && !before.unlockedAircraft.includes('fighter')) {
          const host = analyticsHost(request.headers.host);
          analyticsStore.recordEvent({ pilotId: identity.pilotId, ...host, aircraftType: 'fighter' }, 'aircraft_unlocked', { source: 'tester_code' });
        }
      } else if(payload?.tutorialSlides&&typeof payload.tutorialSlides==='object'){
        const slideRequest=payload.tutorialSlides as {action?:unknown;slideIndex?:unknown;slideId?:unknown};
        const action=slideRequest.action;
        if(action==='start'){
          profileStore.getOrCreate(identity.pilotId,identity.pilotName);
          if(profileStore.startTrainingSlides(identity.pilotId))profile=profileStore.getOrCreate(identity.pilotId,identity.pilotName);
          else error='Start Milwaukee training before opening the guide.';
        }else if(action==='advance'){
          if(typeof slideRequest.slideIndex==='number'&&typeof slideRequest.slideId==='string'&&
            profileStore.advanceTrainingSlide(identity.pilotId,slideRequest.slideIndex,slideRequest.slideId)){
            profile=profileStore.getOrCreate(identity.pilotId,identity.pilotName);
            for(const [id,player] of players){
              if(player.pilotId!==identity.pilotId||!player.tutorialMode)continue;
              if(slideRequest.slideId==='takeoff')sendTutorialScreenplayCruise(id,player);
              if(slideRequest.slideId==='cameraZoom')createTrainingTarget(id,player);
              if(slideRequest.slideId==='approach')createTrainingTarget(id,player);
              if(slideRequest.slideId==='fire')sendTutorialLandingApproach(id,player,true);
            }
          }else error='Follow the training screenplay in order.';
        }else if(action==='complete'){
          profile=profileStore.completeTrainingSlides(identity.pilotId);
          if(!profile)error='Reach the final training slide first.';
          else{
            for(const [id,player] of players){
              if(player.pilotId!==identity.pilotId||!player.tutorialMode)continue;
              removeTrainingTarget(id);removePlayerProjectiles(id);
            }
            analyticsStore.recordEvent({pilotId:identity.pilotId,...analyticsHost(request.headers.host)},'tutorial_completed',{source:'training_screenplay',metadata:{tutorialVersion:'tutorial_v1'}});
          }
        }else error='Invalid training slide action';
      } else if(payload?.tutorialFilm){
        error='Update the QA app to use the Milwaukee training slides.';
      } else if(payload?.tutorialState&&typeof payload.tutorialState==='object'){
        const tutorialState=payload.tutorialState as {version?:unknown;status?:unknown;freshRun?:unknown};
        if(tutorialState.version==='tutorial_v1'&&(tutorialState.status==='started'||tutorialState.status==='completed'||tutorialState.status==='skipped')){
          const sessions=[...players.entries()].filter(([,player])=>player.pilotId===identity.pilotId&&player.tutorialMode);
          if(tutorialState.status==='completed'&&(!profileStore.tutorialStepsResolved(identity.pilotId)||
              (!profileStore.dallasUnlocked(identity.pilotId)&&!profileStore.trainingCompletionVerified(identity.pilotId)))){
            response.writeHead(400,{'Content-Type':'application/json'});response.end(JSON.stringify({error:'Finish Milwaukee training, including a verified landing.'}));return;
          }
          if(tutorialState.status!=='started')for(const [id,player] of sessions){
            removeTrainingTarget(id);removePlayerProjectiles(id);
            // Keep the old socket isolated until navigation disconnects it.
            for(const [peer,peerId] of playerSockets)if(peerId===id)peer.close(1000,'Training ended');
          }
          if(tutorialState.status==='started'&&tutorialState.freshRun===true){
            // Discard the old flight before clearing its slides, including a socket
            // still closing as the pilot returns to the hub.
            for(const [id] of sessions){
              for(const [peer,peerId] of playerSockets)if(peerId===id){playerSockets.delete(peer);peer.close(1000,'Training restarted');}
              cleanupHumanPlayer(id);
            }
            profileStore.resetTutorialRun(identity.pilotId);
          }
          profile=profileStore.setTutorialState(identity.pilotId,tutorialState.status);
          if(profile)analyticsStore.recordEvent({pilotId:identity.pilotId,...analyticsHost(request.headers.host)},tutorialState.status==='started'?'tutorial_started':tutorialState.status==='completed'?'tutorial_completed':'tutorial_skipped',{metadata:{tutorialVersion:'tutorial_v1'}});
        }else error='Invalid tutorial state';
      } else if (payload?.abandonMission && typeof payload.abandonMission === 'object') {
        const abandonMission = payload.abandonMission as { cityId?: unknown; expectedAttemptId?: unknown };
        const cityId = abandonMission.cityId;
        const expectedAttemptId = abandonMission.expectedAttemptId;
        if (typeof cityId !== 'string' || !cityIds.has(cityId as CityId) || typeof expectedAttemptId !== 'string') error = 'Invalid mission state';
        else profile = profileStore.abandonMission(identity.pilotId, cityId as CityId, expectedAttemptId);
      } else if (payload) profile = profileStore.updateProgress(identity.pilotId, payload.progress ?? {});
      if (payload?.storeSource === true) {
        const itemId = typeof payload.purchaseCosmetic === 'string' ? payload.purchaseCosmetic
          : typeof payload.purchaseAircraft === 'string' ? payload.purchaseAircraft
            : typeof payload.purchaseAircraftWithSkyTokens === 'string' ? payload.purchaseAircraftWithSkyTokens : undefined;
        if (itemId && /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(itemId) && (storeUnlockChanged || error || !profile)) {
          analyticsStore.recordEvent({ pilotId: identity.pilotId, platform: analyticsPlatform(request), ...analyticsHost(request.headers.host) },
            storeUnlockChanged ? 'store_unlock_succeeded' : 'store_unlock_failed', { source: itemId });
        }
      }
      response.writeHead(profile && !error ? 200 : error === rateLimitMessage ? 429 : 400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(profile && !error ? reconcilePaidFirehawk(profile) : { error: error ?? 'Invalid profile update' }));
      return;
    }
    response.writeHead(405, { Allow: 'GET, POST' }); response.end(); return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }

  try {
    const pathname = requestUrl.pathname;
    const relativePath = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
    const requestedPath = resolve(clientDist, relativePath);
    if (requestedPath !== clientDist && !requestedPath.startsWith(`${clientDist}${sep}`)) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    const headOnly = request.method === 'HEAD';
    if (await serveFile(requestedPath, response, headOnly)) return;
    // A missing hashed module must remain a 404. Falling through to the SPA
    // shell returns HTML to a module request, masking a stale build as three
    // unrelated browser errors and leaving old streaming code partially live.
    if (extname(relativePath) || /^(data|assets)\//.test(relativePath)) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end('Asset not found');
      return;
    }
    if (await serveFile(resolve(clientDist, 'index.html'), response, headOnly)) return;

    response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Client build unavailable');
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Bad request');
  }
});

// Yield between inbound messages so a buffered reward/state burst cannot
// monopolize the event loop and starve Dallas chunk HTTP responses.
const server = new WebSocketServer({
  server: httpServer,
  allowSynchronousEvents: false,
  verifyClient: ({ origin, req }: { origin: string; req: IncomingMessage }) =>
    isTrustedRequestOrigin(origin, req.headers.host, configuredWebOrigin),
});

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`[server] healthy and listening on http://0.0.0.0:${port}`);
});

function broadcastToCity(cityId: CityId, message: object, except?: WebSocket): void {
  const encoded = encodeSocketMessage(message);
  for (const client of server.clients) {
    const playerId = playerSockets.get(client);
    const player = playerId ? players.get(playerId) : undefined;
    if (client !== except && player?.cityId === cityId && !player.skyDuelMode) sendEncodedSocketMessage(client, encoded);
  }
}

function messageType(message: object): string {
  const type = (message as { type?: unknown }).type;
  return typeof type === 'string' ? type : 'unknown';
}

function encodeSocketMessage(message: object): string {
  const encoded = JSON.stringify(message);
  if (stabilityDiagnosticsEnabled) {
    const bytes = Buffer.byteLength(encoded);
    wsPayloadWindow.sentBytes += bytes;
    wsPayloadWindow.sentMessages += 1;
    if (bytes > wsPayloadWindow.largestBytes) {
      wsPayloadWindow.largestBytes = bytes;
      wsPayloadWindow.largestType = messageType(message);
    }
  }
  return encoded;
}

function sendEncodedSocketMessage(socket: WebSocket, encoded: string): boolean {
  if (socket.readyState !== WebSocket.OPEN) return false;
  // State traffic is coalescible.  Never add to a slow peer's queue: retaining
  // its input channel lets it keep flying/firing while the next current state
  // catches it up after the browser drains the backlog.
  if (socket.bufferedAmount > maxBufferedSocketBytes) {
    if (stabilityDiagnosticsEnabled) wsPayloadWindow.droppedBackpressureFrames += 1;
    return false;
  }
  socket.send(encoded);
  return true;
}

function sendSocketMessage(socket: WebSocket, message: object): boolean {
  return sendEncodedSocketMessage(socket, encodeSocketMessage(message));
}

function sendLockState(playerId: string, targetId?: string): void {
  const player = players.get(playerId);
  if (!player) return;
  const pvp = challengeForPlayer(playerId);
  if (pvp) {
    pvpChallenges.delete(pvp.id);
    const otherId = pvp.challengerId === playerId ? pvp.opponentId : pvp.challengerId;
    sendToPlayer(otherId, { type: 'pvpChallengeCancelled', challengeId: pvp.id });
  }
  const aim = player.assistedAim;
  for (const [socket, socketPlayerId] of playerSockets) {
    if (socketPlayerId === playerId && socket.readyState === WebSocket.OPEN) {
      const sample = { id: player.aimSequence = (player.aimSequence ?? 0) + 1, x: aim?.x ?? 0, y: aim?.y ?? 0, at: Date.now() };
      const samples = player.aimSamples ??= [];
      samples.push(sample);
      if (samples.length > 8) samples.shift();
      sendSocketMessage(socket, { type: 'lockState', targetId, candidateId: aim?.targetId, aimX: sample.x, aimY: sample.y, aimId: sample.id });
      return;
    }
  }
}

function setServerLock(playerId: string, player: PlayerState, targetId?: string, notify = false): void {
  if (player.lockedTargetId === targetId) {
    if (notify) sendLockState(playerId, targetId);
    // Refresh the target's compact warning state so a dropped transition can
    // never leave a stale lock on screen indefinitely.
    if (targetId) sendToPlayer(targetId, { type: 'combatThreat', attackerId: playerId, locked: true });
    return;
  }
  const previousTargetId = player.lockedTargetId;
  player.lockedTargetId = targetId;
  if (targetId && !player.isBot) provokeJourneyHunter(playerId, player, targetId, Date.now());
  sendLockState(playerId, targetId);
  if (previousTargetId) sendToPlayer(previousTargetId, { type: 'combatThreat', attackerId: playerId, locked: false });
  if (targetId) sendToPlayer(targetId, { type: 'combatThreat', attackerId: playerId, locked: true });
  const target = targetId ? players.get(targetId) : undefined;
  if (player.tutorialMode && target?.trainingOwnerId === playerId) {
    profileStore.recordTrainingEvidence(player.pilotId,2);
    completeServerTutorialStep(playerId,player,'targetLock');
    sendToPlayer(playerId, { type: 'tutorialSignal', signal: 'targetLocked' });
  }
}

function sendIncomingFire(targetId: string, attackerId: string): void {
  sendToPlayer(targetId, { type: 'incomingFire', attackerId });
}

function clearLocksForTarget(targetId: string): void {
  for (const [playerId, player] of players) {
    if (player.assistedAim?.targetId === targetId) player.assistedAim.targetId = undefined;
    if (player.lockedTargetId === targetId) setServerLock(playerId, player);
  }
}

// Locks are state, not a one-off client request. Re-evaluate every affected
// city transform so a target leaving the shared cone is cleared immediately.
function refreshCityLocks(cityId: CityId, now: number): void {
  for (const [playerId, player] of players) {
    // Bot locks are refreshed by updateBots from botFireSolution; only human
    // assisted locks use currentLockedTarget and assistedAim samples.
    if (player.cityId !== cityId || player.isBot || !player.lockedTargetId) continue;
    if (!currentLockedTarget(playerId, player, player.lockedTargetId, now)) setServerLock(playerId, player);
  }
}

function broadcastLeaderboard(cityId: CityId): void {
  const now = Date.now();
  const message = {
    type: 'leaderboard',
    cityId,
    players: [...players.entries()]
      .filter(([playerId, player]) => player.cityId === cityId && !player.isBot && !player.skyDuelMode && !pausedJourneyPlayers.has(playerId) && !pausedTrainingPlayers.has(playerId))
      .map(([playerId, player]) => ({
        playerId,
        displayName: player.displayName,
        score: player.score,
        cityId: player.cityId,
        entityType: player.entityType,
        isBot: false,
        aircraftType: player.aircraftType,
        lifeState: player.lifeState,
        status: playerRosterStatus(playerId, player, now),
        masteryLevel: player.profile.mastery[player.cityId]?.level ?? 1,
        // The compact human roster is the authoritative radar-presence source.
        // Position keeps connected pilots trackable when their 3D render state
        // is culled or high-rate browser transforms are temporarily throttled.
        position: player.position,
        altitudeMeters: Math.max(0, player.position.y - botTerrainHeight(player.cityId, player.position.x, player.position.z)),
      }))
      .sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName)),
  };
  const encoded = encodeSocketMessage(message);

  for (const client of server.clients) {
    const playerId = playerSockets.get(client);
    const player = playerId ? players.get(playerId) : undefined;
    if (player?.cityId === cityId) sendEncodedSocketMessage(client, encoded);
  }
}

function playerRosterStatus(playerId: string, player: PlayerState, now: number): PlayerRosterStatus {
  if (player.lifeState === 'destroyed') return 'destroyed';
  if (player.lifeState === 'respawning') {
    return player.hasRespawnTransform && now < player.spawnProtectedUntil ? 'spawnSafe' : 'respawning';
  }
  if (now < player.spawnProtectedUntil) return 'spawnSafe';
  const flight = landingFlightState.get(playerId);
  return flight?.airborne === false || Boolean(groundedAtAirport(player)) ? 'onGround' : 'flying';
}

function socialSnapshot(cityId: CityId): object {
  return { kingPlayerId: cityKings.get(cityId) };
}

function broadcastSocialState(cityId: CityId): void {
  broadcastToCity(cityId, { type: 'socialState', ...socialSnapshot(cityId) });
}

function updateKing(cityId: CityId, preferredId?: string): void {
  if (!cityCapabilities(cityId)?.competitiveEnabled) {
    if (cityKings.delete(cityId)) broadcastSocialState(cityId);
    return;
  }
  const eligible = [...players.entries()]
    .filter(([, player]) => player.cityId === cityId && player.entityType === 'player')
    .sort(([, a], [, b]) => b.score - a.score || a.displayName.localeCompare(b.displayName));
  const nextId = preferredId && players.get(preferredId)?.cityId === cityId ? preferredId : eligible[0]?.[0];
  if (cityKings.get(cityId) === nextId) return;
  if (nextId) cityKings.set(cityId, nextId);
  else cityKings.delete(cityId);
  broadcastSocialState(cityId);
}

function awardSocialPlayer(playerId: string, score: number, credits: number, reason: string): void {
  const player = players.get(playerId);
  if (!player || !progressionEnabled(player)) return;
  const reward = rewardWithHeat(playerId, score, credits);
  player.score += reward.score;
  persistScore(player, reward.score);
  const profile = profileStore.awardServerReward(
    player.pilotId, reward.credits,
    { challengeCompletions: reason.includes('CHALLENGE WON') ? 1 : 0 },
    reason.includes('CHALLENGE WON') ? 'CHALLENGE_REWARD' : 'FLIGHT_REWARD',
  );
  if (profile) sendProfile(playerId, profile, undefined, undefined, reason);
  if (reward.credits > 0) recordAnalytics(playerId, 'credits_earned', { amount: reward.credits, source: 'social' });
  sendToPlayer(playerId, { type: 'socialReward', score: reward.score, credits: reward.credits, reason });
  broadcastLeaderboard(player.cityId);
  updateKing(player.cityId);
}

function persistScore(player: PlayerState, amount: number): void {
  if (isHumanPilot(player) && progressionEnabled(player) && amount > 0) profileStore.awardScore(player.pilotId, amount);
}

function isSocialPairEligible(first: PlayerState, second: PlayerState): boolean {
  if (!first.hasRespawnTransform || !second.hasRespawnTransform || first.lifeState !== 'alive' || second.lifeState !== 'alive') return false;
  if (Math.hypot(first.position.x - second.position.x, first.position.y - second.position.y, first.position.z - second.position.z) > 260) return false;
  const firstSpeed = Math.hypot(first.velocity.x, first.velocity.y, first.velocity.z);
  const secondSpeed = Math.hypot(second.velocity.x, second.velocity.y, second.velocity.z);
  if (firstSpeed < 18 || secondSpeed < 18 || Math.abs(firstSpeed - secondSpeed) > 28) return false;
  const firstForward = forwardDirection(first);
  const secondForward = forwardDirection(second);
  return firstForward.x * secondForward.x + firstForward.y * secondForward.y + firstForward.z * secondForward.z >= 0.9;
}

function updateFormations(now: number): void {
  for (const cityId of cityIds) {
    const cityPlayers = [...players.entries()].filter(([, player]) => player.cityId === cityId && player.entityType === 'player' && !player.isBot);
    const candidates: Array<{ firstId: string; secondId: string; distance: number }> = [];
    for (let firstIndex = 0; firstIndex < cityPlayers.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < cityPlayers.length; secondIndex += 1) {
        const [firstId, first] = cityPlayers[firstIndex];
        const [secondId, second] = cityPlayers[secondIndex];
        if (!isSocialPairEligible(first, second)) continue;
        candidates.push({ firstId, secondId, distance: Math.hypot(first.position.x - second.position.x, first.position.z - second.position.z) });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const selected = new Set<string>();
    const activeKeys = new Set<string>();
    const cityFormations = formations.get(cityId) ?? new Map<string, FormationState>();
    formations.set(cityId, cityFormations);
    for (const candidate of candidates) {
      if (selected.has(candidate.firstId) || selected.has(candidate.secondId)) continue;
      selected.add(candidate.firstId); selected.add(candidate.secondId);
      const key = [candidate.firstId, candidate.secondId].sort().join(':');
      activeKeys.add(key);
      let formation = cityFormations.get(key);
      if (!formation) {
        formation = { memberIds: [candidate.firstId, candidate.secondId], qualifiedAt: now, active: false, lastRewardAt: now };
        cityFormations.set(key, formation);
      }
      if (!formation.active && now - formation.qualifiedAt >= formationDelayMs) {
        formation.active = true;
        broadcastToCity(cityId, { type: 'formationState', memberIds: formation.memberIds, active: true });
      }
      if (formation.active && now - formation.lastRewardAt >= formationRewardMs) {
        formation.lastRewardAt = now;
        for (const playerId of formation.memberIds) {
          awardSocialPlayer(playerId, socialRewards.formation.score, socialRewards.formation.credits, 'FORMATION BONUS');
        }
      }
    }
    for (const [key, formation] of cityFormations) {
      if (activeKeys.has(key)) continue;
      if (formation.active) broadcastToCity(cityId, { type: 'formationState', memberIds: formation.memberIds, active: false });
      cityFormations.delete(key);
    }
  }
}

type CityEventTemplate = {
  type: DynamicEventType;
  name: string;
  rewardScore: number;
  rewardCredits: number;
  objective: EventRoutePoint;
  route?: EventRoutePoint[];
  routeSpeed?: number;
  eventRouteIds?: string[];
  eventAircraftType?: AircraftType;
  eventCombatMode?: CityEvent['eventCombatMode'];
  rarity?: 'normal' | 'rare';
  weight?: number;
  bossHealth?: number;
  targetAirportId?: string;
  pickupAirportId?: string;
  durationMs?: number;
};

// Geographic event anchors are city-owned.  Milwaukee deliberately has no
// Chaos Director template yet, so a Dallas route or drop can never leak into
// a different world coordinate system.
const dallasEventTemplates: ReadonlyArray<CityEventTemplate> = [
  {
    type: 'stormLanding', name: `STORM LANDING · ${place.love}`, rewardScore: 260, rewardCredits: 180,
    objective: { x: -5_140, y: 240, z: -7_780 }, targetAirportId: 'love', durationMs:180_000, rarity: 'normal', weight: 32,
  },
  {
    type: 'fogApproach', name: `FOG APPROACH · ${place.addison}`, rewardScore: 240, rewardCredits: 165,
    objective: { x: -3_700, y: 180, z: -21_100 }, targetAirportId: 'addison', durationMs:180_000, rarity: 'normal', weight: 30,
  },
  {
    type: 'cargoRush', name: `CARGO RUSH · ${place.dfw} TO ${place.executive}`, rewardScore: 320, rewardCredits: 240,
    objective: { x: -22_800, y: 150, z: -13_600 }, pickupAirportId: 'dfw', targetAirportId: 'executive', durationMs:240_000, rarity: 'normal', weight: 28,
  },
  {
    type: 'soloAirportSprint', name: `AIRPORT SPRINT · ${place.dfw} TO ${place.love}`, rewardScore: 280, rewardCredits: 200,
    objective: { x: -5_140, y: 180, z: -7_780 }, targetAirportId: 'love', durationMs:150_000, rarity: 'normal', weight: 30,
  },
  {
    type: 'skyRush', name: `SKY RUSH · ${place.dfw} CORRIDOR`, rewardScore: 400, rewardCredits: 260,
    objective: { x: -20_400, y: 420, z: -10_100 },
    route: [
      { x: -20_400, y: 420, z: -10_100 }, { x: -16_600, y: 540, z: -8_900 },
      { x: -12_900, y: 570, z: -7_400 }, { x: -9_400, y: 520, z: -5_800 },
    ],
    routeSpeed: 170,
  },
  {
    type: 'supplyDrop', name: 'SUPPLY DROP · TRINITY', rewardScore: 350, rewardCredits: 240,
    objective: { x: -2_400, y: 360, z: 1_100 }, routeSpeed: 0,
  },
  {
    type: 'emergencyEscort', name: `EMERGENCY ESCORT · ${place.dfw} TO ${place.love}`, rewardScore: 360, rewardCredits: 260,
    objective: { x: -22_800, y: 230, z: -10_650 },
    route: [
      { x: -22_800, y: 230, z: -10_650 }, { x: -16_500, y: 560, z: -9_900 },
      { x: -9_600, y: 450, z: -8_600 }, { x: -5_140, y: 190, z: -5_950 },
    ],
    routeSpeed: 76,
    eventRouteIds: ['civilian-dfw-love'],
  },
  {
    type: 'cargoConvoy', name: 'CARGO CONVOY · DALLAS CROSSING', rewardScore: 380, rewardCredits: 300,
    objective: { x: -20_000, y: 300, z: -10_850 },
    route: [
      { x: -20_000, y: 300, z: -10_850 }, { x: -15_000, y: 1_000, z: -7_500 },
      { x: -9_000, y: 1_120, z: -2_000 }, { x: -6_700, y: 220, z: 9_550 },
    ],
    routeSpeed: 105,
    eventRouteIds: ['cargo-dfw-executive', 'cargo-dfw-addison', 'cargo-dfw-east-logistics'],
  },
  {
    type: 'riskZone', name: `RISK ZONE · ${place.lasColinas}`, rewardScore: 340, rewardCredits: 240,
    objective: { x: -14_000, y: 2_400, z: -9_200 },
    route: [
      { x: -14_000, y: 2_400, z: -9_200 }, { x: -12_000, y: 2_700, z: -8_200 },
      { x: -10_400, y: 2_520, z: -7_400 },
    ],
    routeSpeed: 45,
  },
  {
    type: 'mostWanted', name: 'MOST WANTED PILOT', rewardScore: 500, rewardCredits: 300,
    objective: { x: -600, y: 650, z: -450 }, routeSpeed: 0,
  },
  {
    type: 'aceIntercept', name: 'ACE INTERCEPT · DALLAS AIRSPACE', rewardScore: 900, rewardCredits: 520,
    objective: { x: -8_800, y: 1_450, z: -5_800 },
    route: [
      { x: -15_400, y: 1_120, z: -10_900 }, { x: -8_800, y: 1_450, z: -5_800 },
      { x: -1_500, y: 1_180, z: -1_400 }, { x: 5_400, y: 1_520, z: -6_500 },
      { x: -3_600, y: 1_680, z: -12_000 },
    ],
    routeSpeed: 178, eventRouteIds: ['ace-intercept'], eventAircraftType: 'fighter', eventCombatMode: 'attackable', bossHealth: 300,
    rarity: 'rare', weight: 4,
  },
  {
    type: 'vipEscort', name: `VIP ESCORT · ${place.lasColinas} TO ${place.downtown}`, rewardScore: 620, rewardCredits: 390,
    objective: { x: -13_500, y: 620, z: -9_350 },
    route: [
      { x: -13_500, y: 620, z: -9_350 }, { x: -8_600, y: 720, z: -5_300 },
      { x: -4_100, y: 610, z: -1_900 }, { x: -650, y: 420, z: -450 },
    ],
    routeSpeed: 220, eventRouteIds: ['vip-escort'], eventAircraftType: 'privateJet', eventCombatMode: 'attackable', bossHealth: 200,
    rarity: 'rare', weight: 5,
  },
  {
    type: 'goldenSkyRun', name: 'GOLDEN SKY RUN · METRO GAUNTLET', rewardScore: 850, rewardCredits: 560,
    objective: { x: -21_000, y: 500, z: -10_800 },
    route: [
      { x: -21_000, y: 500, z: -10_800 }, { x: -16_000, y: 760, z: -9_400 },
      { x: -10_800, y: 980, z: -6_400 }, { x: -5_300, y: 820, z: -2_500 },
      { x: -700, y: 570, z: -420 }, { x: 4_800, y: 700, z: -4_600 },
    ],
    routeSpeed: 225, rarity: 'rare', weight: 4,
  },
  {
    type: 'cityEmergency', name: 'CITY EMERGENCY · TRINITY STORM CORRIDOR', rewardScore: 620, rewardCredits: 400,
    objective: { x: -2_600, y: 680, z: 950 },
    route: [{ x: -7_400, y: 640, z: 3_000 }, { x: -2_600, y: 680, z: 950 }, { x: 2_000, y: 590, z: -1_600 }],
    routeSpeed: 42, rarity: 'rare', weight: 5,
  },
];

const eventTemplatesByCity: Partial<Record<CityId, ReadonlyArray<CityEventTemplate>>> = {
  dallas: dallasEventTemplates,
};

function eventTemplatesForCity(cityId: CityId): ReadonlyArray<CityEventTemplate> {
  return eventTemplatesByCity[cityId] ?? [];
}

function eventTemplateFor(event: Pick<CityEvent, 'cityId' | 'type'>): CityEventTemplate | undefined {
  return eventTemplatesForCity(event.cityId).find((template) => template.type === event.type);
}

function eventName(event: Pick<CityEvent, 'cityId' | 'type' | 'goldenDrop'>): string {
  const name = eventTemplateFor(event)?.name ?? event.type;
  return event.goldenDrop ? name.replace('SUPPLY DROP', 'GOLDEN DROP') : name;
}

function bountyMultiplier(event: Pick<CityEvent, 'type' | 'wantedPlayerId'>): number {
  return event.type === 'mostWanted' && event.wantedPlayerId
    ? heatMultiplier(currentHeat(event.wantedPlayerId).level)
    : 1;
}

function qaEventSpec(forced: ChaosQaEvent): { type: DynamicEventType; riskMode?: CityEvent['riskMode']; goldenDrop: boolean } {
  switch (forced) {
    case 'goldenDrop': return { type: 'supplyDrop', goldenDrop: true };
    case 'stormRisk': return { type: 'riskZone', riskMode: 'storm', goldenDrop: false };
    case 'lowAltitudeRisk': return { type: 'riskZone', riskMode: 'lowAltitude', goldenDrop: false };
    case 'highAltitudeRisk': return { type: 'riskZone', riskMode: 'highAltitude', goldenDrop: false };
    case 'downtownRisk': return { type: 'riskZone', riskMode: 'downtownDanger', goldenDrop: false };
    default: return { type: forced, goldenDrop: false };
  }
}

function isGateEvent(type: DynamicEventType): boolean { return type === 'skyRush' || type === 'goldenSkyRun'; }
function isRiskEvent(type: DynamicEventType): boolean { return type === 'riskZone' || type === 'cityEmergency'; }

function eventRoutePosition(event: CityEvent, now: number): EventRoutePoint {
  if (event.route.length < 2 || event.routeSpeed <= 0) return event.objective;
  let remaining = ((now - event.activeAt) / 1000) * event.routeSpeed;
  for (let index = 0; index < event.route.length - 1; index += 1) {
    const start = event.route[index];
    const end = event.route[index + 1];
    const length = Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
    if (remaining <= length) {
      const t = length === 0 ? 0 : remaining / length;
      return evasiveEventPosition(event, { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t, z: start.z + (end.z - start.z) * t }, now);
    }
    remaining -= length;
  }
  return evasiveEventPosition(event, event.route[event.route.length - 1], now);
}

function evasiveEventPosition(event: CityEvent, position: EventRoutePoint, now: number): EventRoutePoint {
  if (event.type !== 'aceIntercept') return position;
  // Deterministic weave: memorable but deliberately not an AI flight model.
  const phase = (now - event.activeAt) / 1000;
  return { x: position.x + Math.sin(phase * 0.9) * 220, y: position.y + Math.sin(phase * 1.6) * 85, z: position.z + Math.cos(phase * 0.7) * 170 };
}

function eventAircraftStates(event: CityEvent, now: number): Array<{ routeId: string; position: Vector3; direction: Vector3; aircraftType?: AircraftType; eventCombatMode?: 'noncombat' | 'attackable' }> {
  if (event.lifecycle !== 'active' || event.eventRouteIds.length === 0) return [];
  const position = eventRoutePosition(event, now);
  const ahead = eventRoutePosition(event, now + 1000);
  const direction = normalize({ x: ahead.x - position.x, y: ahead.y - position.y, z: ahead.z - position.z });
  return event.eventRouteIds.map((routeId, index) => {
    const lateral = index - (event.eventRouteIds.length - 1) / 2;
    return {
      routeId,
      position: { x: position.x + lateral * 85, y: position.y + Math.abs(lateral) * 18, z: position.z + lateral * 55 },
      direction,
      aircraftType: event.eventAircraftType,
      eventCombatMode: event.eventCombatMode,
    };
  });
}

function eventSnapshot(event: CityEvent): object {
  const template = eventTemplateFor(event);
  const rankedProgress = [...event.progress.entries()].sort((left, right) => right[1] - left[1]);
  const visibleProgress = rankedProgress.slice(0, 3);
  // The same compact event packet drives each pilot's next gate. Keep every
  // human participant visible even when AI fills the first three ranks.
  for (const entry of rankedProgress) {
    if (!isHumanPilot(players.get(entry[0])) || visibleProgress.some(([id]) => id === entry[0])) continue;
    visibleProgress.push(entry);
  }
  const currentObjective = event.type === 'aceIntercept' && event.lifecycle === 'active'
    ? eventRoutePosition(event, Date.now())
    : event.objective;
  const wantedPlayerId = event.type === 'mostWanted' && event.wantedPlayerId &&
    isWantedEligible(event.wantedPlayerId, players.get(event.wantedPlayerId), event.cityId, Date.now())
    ? event.wantedPlayerId
    : undefined;
  return {
    type: 'eventState',
    event: {
      id: event.id,
      cityId: event.cityId,
      eventType: event.type,
      lifecycle: event.lifecycle,
      name: eventName(event),
      objective: currentObjective,
      route: event.route,
      activeAt: event.activeAt,
      expiresAt: event.expiresAt,
      participantCount: event.participants.size,
      rankings: visibleProgress.map(([playerId, progress]) => ({ playerId, progress })),
      eventAircraft: eventAircraftStates(event, Date.now()),
      wantedPlayerId,
      riskMode: event.riskMode,
      riskRadius: event.riskRadius,
      goldenDrop: event.goldenDrop,
      rare: event.rare,
      bossHealth: event.bossHealth,
      bossMaxHealth: event.bossMaxHealth,
      rewardCredits: Math.round((template?.rewardCredits ?? 0) * (event.goldenDrop ? 2 : 1) * bountyMultiplier(event)),
    },
  };
}

function sendToPlayer(playerId: string, message: object): void {
  for (const [socket, socketPlayerId] of playerSockets) {
    if (socketPlayerId === playerId && socket.readyState === WebSocket.OPEN) {
      sendSocketMessage(socket, message);
      return;
    }
  }
}
function sendJourneyState(playerId: string, attempt: JourneyAttempt): void {
  if (attempt.status === 'COMPLETED' || attempt.status === 'FAILED' || attempt.status === 'ABANDONED')
    journeyCountdownComplete.delete(attempt.attemptId);
  if((attempt.missionId===journeyDallas07.id || attempt.missionId===journeyDallas08.id || attempt.missionId===journeyDallas09.id || attempt.missionId===journeyDallas10.id || attempt.missionId===journeyDallas11.id || attempt.missionId===journeyDallas12.id) && attempt.status==='RACING' && attempt.startedAt!==null){
    const existingEncounter=transportEncounters.get(attempt.attemptId);
    const e=existingEncounter??createTransportEncounter(attempt.attemptId,playerId,attempt.startedAt,transportFlightAltitude,
      attempt.missionId===journeyDallas12.id ? journeyDallas12.timeLimitMs : attempt.missionId===journeyDallas11.id ? journeyDallas11.timeLimitMs : attempt.missionId===journeyDallas10.id ? journeyDallas10.timeLimitMs : attempt.missionId===journeyDallas09.id ? journeyDallas09.timeLimitMs : attempt.missionId===journeyDallas08.id ? journeyDallas08.timeLimitMs : journeyDallas07.timeLimitMs,
      attempt.missionId===journeyDallas10.id, attempt.missionId===journeyDallas11.id || attempt.missionId===journeyDallas12.id);
    if(!existingEncounter){const pilot=players.get(playerId);if(pilot){e.lastCollisionPilotPosition={...pilot.position};e.lastCollisionPilotRotation={...pilot.rotation};}}
    if(e.fortressTurrets){e.fortressTurrets[0]=attempt.fortressLeftHealth??0;e.fortressTurrets[1]=attempt.fortressRightHealth??0;e.fortressGunsEnabled=attempt.missionId!==journeyDallas12.id || attempt.finalPhase!=='ESCORTS';}
    e.playerId=playerId;transportEncounters.set(attempt.attemptId,e);
  }
  if (attempt.missionId === journeyDallas19.id && (attempt.status === 'APPROACH' || attempt.status === 'RACING'))
    monsterFocusedPlayers.add(playerId);
  else monsterFocusedPlayers.delete(playerId);
  if (attempt.missionId === journeyDallas19.id && attempt.status === 'RACING' && attempt.startedAt !== null) {
    const encounter = monsterEncounters.get(attempt.attemptId) ?? createMonsterEncounter(attempt.attemptId, playerId, attempt.startedAt);
    encounter.playerId = playerId;
    monsterEncounters.set(attempt.attemptId, encounter);
  }
  if (missionFocusForAttempt(attempt)) missionFocusedPlayers.add(playerId);
  else missionFocusedPlayers.delete(playerId);
  const focusedTargetId = attempt.missionId === journeyDallas24.id
    ? attempt.legendaryPhase === 'ACE' ? attempt.targetId : null
    : attempt.missionId === journeyDallas23.id
    ? attempt.doublePhase === 'FINAL_FIGHT' ? attempt.secondaryTargetId : attempt.doublePhase === 'FIRST_FIGHT' ? attempt.targetId : null
    : attempt.targetId;
  if (missionFocusedPlayers.has(playerId) && (attempt.missionId === journeyDallas14.id || attempt.missionId === journeyDallas15.id || attempt.missionId === journeyDallas18.id || attempt.missionId === journeyDallas19.id || attempt.missionId === journeyDallas23.id || attempt.missionId === journeyDallas24.id) && focusedTargetId)
    missionFocusHunterTargets.set(playerId, focusedTargetId);
  else missionFocusHunterTargets.delete(playerId);
  if (missionFocusedPlayers.has(playerId) && (attempt.missionId === journeyDallas16.id || attempt.missionId === journeyDallas08.id || attempt.missionId === journeyDallas09.id || attempt.missionId === journeyDallas10.id || attempt.missionId === journeyDallas12.id))
    missionFocusCrossfireTargets.set(playerId, new Set([attempt.targetId, attempt.secondaryTargetId,
      ...(attempt.missionId === journeyDallas09.id ? reinforcementWaves.get(attempt.attemptId)?.ids ?? [] : [])]
      .filter((id): id is string => Boolean(id))));
  else missionFocusCrossfireTargets.delete(playerId);
  const target = focusedTargetId ? players.get(focusedTargetId) : undefined;
  sendToPlayer(playerId, { type: 'journeyAttempt', attempt: {
    ...attempt, aiIsolated: missionFocusedPlayers.has(playerId),
    chapterOneComplete: attempt.missionId === journeyDallas06.id && attempt.status === 'COMPLETED'
      && journeyStore.chapterOneComplete(attempt.pilotId),
    bestTimeMs: (attempt.status === 'COMPLETED' || attempt.status === 'FAILED') ? attempt.missionId === journeyDallas01.id
      ? journeyStore.rookieRushBestTime(attempt.pilotId) : attempt.missionId === journeyDallas02.id
      ? journeyStore.lakeRacerBestTime(attempt.pilotId) : attempt.missionId === journeyDallas03.id
      ? journeyStore.goldenAscentBestTime(attempt.pilotId) : attempt.missionId === journeyDallas04.id
      ? journeyStore.downtownSlalomBestTime(attempt.pilotId) : attempt.missionId === journeyDallas05.id
      ? journeyStore.needleRushBestTime(attempt.pilotId) : attempt.missionId === journeyDallas06.id
      ? journeyStore.goldenChampionshipBestTime(attempt.pilotId) : attempt.missionId === journeyDallas19.id
      ? journeyStore.monsterArrivalBestTime(attempt.pilotId) : attempt.missionId===journeyDallas07.id
      ? journeyStore.giantIncomingBestTime(attempt.pilotId) : undefined : undefined,
    escapeStatus: attempt.missionId === journeyDallas14.id ? journeyEscapeStates.get(playerId)?.status ?? 'PREPARING' : undefined,
    hunterDistance: attempt.missionId === journeyDallas14.id ? journeyEscapeStates.get(playerId)?.distance ?? null : undefined,
    targetHealth: attempt.missionId === journeyDallas07.id || attempt.missionId === journeyDallas08.id || attempt.missionId === journeyDallas09.id || attempt.missionId === journeyDallas10.id || attempt.missionId === journeyDallas11.id || attempt.missionId === journeyDallas12.id || attempt.missionId === journeyDallas19.id ? attempt.monsterHealth ?? 0
      : target?.bot?.journeyAttemptId === attempt.attemptId && target.lifeState === 'alive' ? target.health : 0,
    targetEngaged: target?.bot?.journeyAttemptId === attempt.attemptId && target.bot.journeyProvoked === true,
    crossfireHuntersAlive: attempt.missionId === journeyDallas16.id
      ? [attempt.targetId, attempt.secondaryTargetId].filter(id => id && players.get(id)?.lifeState === 'alive').length : undefined,
    fighterEscortsAlive: attempt.missionId === journeyDallas08.id || attempt.missionId === journeyDallas09.id || attempt.missionId === journeyDallas10.id || attempt.missionId === journeyDallas12.id
      ? [attempt.targetId, attempt.secondaryTargetId,
        ...(attempt.missionId === journeyDallas09.id ? reinforcementWaves.get(attempt.attemptId)?.ids ?? [] : [])]
        .filter(id => id && players.get(id)?.lifeState === 'alive').length : undefined,
    reinforcementWarningUntil: attempt.missionId === journeyDallas09.id && !reinforcementWaves.get(attempt.attemptId)?.spawned
      ? reinforcementWaves.get(attempt.attemptId)?.arriveAt : undefined,
  }, serverNow: Date.now() });
  if((attempt.missionId===journeyDallas07.id || attempt.missionId===journeyDallas08.id || attempt.missionId===journeyDallas09.id || attempt.missionId===journeyDallas10.id || attempt.missionId===journeyDallas11.id || attempt.missionId===journeyDallas12.id) && (attempt.status==='APPROACH'||attempt.status==='RACING')){
    const e=transportEncounters.get(attempt.attemptId),now=attempt.pausedAt ?? Date.now();
    sendToPlayer(playerId,{type:'transportState',attemptId:attempt.attemptId,fortress:attempt.missionId===journeyDallas11.id || attempt.missionId===journeyDallas12.id ? {leftHealth:attempt.fortressLeftHealth??0,rightHealth:attempt.fortressRightHealth??0,coreHealth:attempt.monsterHealth??0,phase:attempt.finalPhase}:undefined,pose:transportPose(attempt.startedAt===null?0:now-attempt.startedAt,transportFlightAltitude,
      attempt.missionId===journeyDallas12.id ? journeyDallas12.timeLimitMs : attempt.missionId===journeyDallas11.id ? journeyDallas11.timeLimitMs : attempt.missionId===journeyDallas10.id ? journeyDallas10.timeLimitMs : attempt.missionId===journeyDallas09.id ? journeyDallas09.timeLimitMs : attempt.missionId===journeyDallas08.id ? journeyDallas08.timeLimitMs : journeyDallas07.timeLimitMs),gunYaw:e?.gunYaw??0,gunPitch:e?.gunPitch??0,warningUntil:e?.warningUntil??0,crossfireGuns:e?.crossfire?.guns,activeGun:e?.crossfire?.activeGun,hitSequence:e?.hitSequence??0,hitPosition:e?.hitPosition,health:attempt.monsterHealth??2000,shots:e?.shots??[],serverNow:now});
  }
}
function removeJourneyHunter(attempt: JourneyAttempt): void {
  if(attempt.missionId===journeyDallas07.id || attempt.missionId===journeyDallas08.id || attempt.missionId===journeyDallas09.id || attempt.missionId===journeyDallas10.id || attempt.missionId===journeyDallas11.id || attempt.missionId===journeyDallas12.id){
    const e=transportEncounters.get(attempt.attemptId);if(e)for(const shot of projectiles.values())if(shot.ownerId===e.playerId)removeProjectile(shot.projectileId);
    transportEncounters.delete(attempt.attemptId);transportReady.delete(attempt.attemptId);
    rearGuardFire.delete(attempt.attemptId);
    const wave = reinforcementWaves.get(attempt.attemptId);
    reinforcementWaves.delete(attempt.attemptId);
    for (const id of wave?.ids ?? []) if (id) removeBot(id);
  }
  if (attempt.missionId === journeyDallas19.id) monsterEncounters.delete(attempt.attemptId);
  for (const id of [attempt.targetId, attempt.secondaryTargetId]) {
    const target = id ? players.get(id) : undefined;
    if (target?.bot?.journeyAttemptId === attempt.attemptId) removeBot(id!);
    if (id) doubleHunterMotion.delete(id);
  }
  crossfireFireCoordinators.delete(attempt.attemptId);
  crossfireDefeatedHunters.delete(attempt.attemptId);
  for (const id of [attempt.targetId, attempt.secondaryTargetId]) if (id) crossfireHunterMotion.delete(id);
  if (attempt.targetId && attempt.missionId === journeyDallas19.id) { breakoutDefeatedHunters.delete(attempt.targetId); breakoutHunterMotion.delete(attempt.targetId); }
  if (attempt.targetId && attempt.missionId === journeyDallas18.id) {
    siegeDefeatedHunters.delete(attempt.targetId);
    siegeHunterMotion.delete(attempt.targetId);
  }
  if (attempt.missionId === journeyDallas14.id) for (const [playerId, linkedId] of playerJourneyAttempts)
    if (linkedId === attempt.attemptId) journeyEscapeStates.delete(playerId);
}
const doubleHunterMotion = new Map<string, { x: number; z: number; movedAt: number }>();
function doubleHeartNearPilot(pilot: PlayerState): { x: number; y: number; z: number } {
  const forward = hunterForward(pilot);
  const point = boundJourneyHunterPoint({ x: pilot.position.x + forward.x * 550,
    z: pilot.position.z + forward.z * 550 }, 20);
  return { ...point, y: Math.max(pilot.position.y,
    botSafeFloor('dallas', point.x, point.z, journeyAceClearance) + 100) };
}
function ensureJourneyDouble(playerId: string, pilot: PlayerState, active: JourneyAttempt, now: number): void {
  if (active.missionId !== journeyDallas23.id || pilot.lifeState !== 'alive') return;
  if (active.doublePhase === 'TAKEOFF') {
    if (active.status !== 'APPROACH' || !playerJourneyLoveTakeoff.has(playerId) ||
      !landingFlightState.get(playerId)?.airborne || playerJourneyRunwayPrep.has(playerId) ||
      pilot.position.y - botTerrainHeight('dallas', pilot.position.x, pilot.position.z) < journeyHunterEngagementAgl) return;
    const id = createBot('dallas', undefined, { attemptId: active.attemptId, targetPlayerId: playerId,
      target: pilot, doubleOrdinal: 1 });
    const assigned = journeyStore.assignDoubleHunter(pilot.pilotId, active.attemptId, id, 1, now);
    if (!assigned) { removeBot(id); return; }
    players.get(id)!.bot!.nextFireAt = now + 3_000;
    doubleHunterMotion.set(id, { x: players.get(id)!.position.x, z: players.get(id)!.position.z, movedAt: now });
    playerJourneyRunwayPrep.delete(playerId);
    provokeJourneyHunter(playerId, pilot, id, now);
    sendJourneyState(playerId, assigned);
  } else if (active.doublePhase === 'FIRST_FIGHT' || active.doublePhase === 'FINAL_FIGHT') {
    const ordinal = active.doublePhase === 'FIRST_FIGHT' ? 1 : 2;
    const id = ordinal === 1 ? active.targetId : active.secondaryTargetId;
    if (!id && ordinal === 2 && active.repairCollectedAt !== null) {
      const hunterId = createBot('dallas', undefined, { attemptId: active.attemptId,
        targetPlayerId: playerId, target: pilot, doubleOrdinal: 2 });
      const assigned = journeyStore.assignDoubleHunter(pilot.pilotId, active.attemptId, hunterId, 2, now);
      if (!assigned) { removeBot(hunterId); return; }
      players.get(hunterId)!.bot!.nextFireAt = now + journeyDallas23.hunterTwoDelayMs;
      doubleHunterMotion.set(hunterId, { x: players.get(hunterId)!.position.x,
        z: players.get(hunterId)!.position.z, movedAt: now });
      provokeJourneyHunter(playerId, pilot, hunterId, now);
      sendJourneyState(playerId, assigned);
      return;
    }
    const hunter = id ? players.get(id) : undefined;
    if (!hunter?.bot?.journeyDoubleOrdinal || hunter.bot.journeyDoubleOrdinal !== ordinal ||
      hunter.bot.journeyAttemptId !== active.attemptId || hunter.bot.journeyTargetPlayerId !== playerId ||
      hunter.lifeState !== 'alive' || hunter.health <= 0) { failPlayerJourney(playerId, 'DOUBLE_INTERRUPTED', now); return; }
    const motion = doubleHunterMotion.get(id!);
    if (!motion) { failPlayerJourney(playerId, 'DOUBLE_INTERRUPTED', now); return; }
    if (Math.hypot(hunter.position.x - motion.x, hunter.position.z - motion.z) >= 40) {
      motion.x = hunter.position.x; motion.z = hunter.position.z; motion.movedAt = now;
    } else if (now - motion.movedAt > 8_000) failPlayerJourney(playerId, 'DOUBLE_INTERRUPTED', now);
  }
}
function ensureJourneyEscapeHunter(playerId: string, pilot: PlayerState, active: JourneyAttempt, now: number): void {
  if (active.missionId !== journeyDallas14.id || active.status !== 'APPROACH' ||
    pilot.lifeState !== 'alive' || !playerJourneyLoveTakeoff.has(playerId)) return;
  const love = cityAirports.dallas.find(airport => airport.id === journeyDallas14.startAirportId)!;
  const dx = pilot.position.x - love.x, dz = pilot.position.z - love.z;
  const along = dx * Math.sin(love.heading) + dz * Math.cos(love.heading);
  const lateral = dx * Math.cos(love.heading) - dz * Math.sin(love.heading);
  const agl = pilot.position.y - botTerrainHeight('dallas', pilot.position.x, pilot.position.z);
  if (agl < journeyHunterEngagementAgl || Math.abs(along) <= love.runwayLength / 2 + 350 &&
    Math.abs(lateral) <= Math.max(love.runwayWidth * 3, 160)) return;
  if (!insideJourneyHunterArena(pilot.position)) { failPlayerJourney(playerId, 'INVALID', now); return; }
  const targetId = createBot('dallas', undefined,
    { attemptId: active.attemptId, targetPlayerId: playerId, target: pilot, escape: true });
  const hunter = players.get(targetId)!;
  // A short reaction window begins at engagement, not at runway spawn.
  hunter.bot!.nextFireAt = now + 3_000;
  const assigned = journeyStore.assignHunter(pilot.pilotId, active.attemptId, targetId, null, now);
  if (!assigned) { removeBot(targetId); return; }
  journeyEscapeStates.set(playerId, { attemptId: active.attemptId, engaged: false, lastMotionAt: now,
    lastX: hunter.position.x, lastZ: hunter.position.z, lastSentAt: 0, distance: null, status: 'PURSUING' });
  playerJourneyRunwayPrep.delete(playerId);
  provokeJourneyHunter(playerId, pilot, targetId, now);
  sendJourneyState(playerId, assigned);
}
function ensureJourneyAce(playerId: string, pilot: PlayerState, active: JourneyAttempt, now: number): void {
  if (active.missionId !== journeyDallas15.id || pilot.lifeState === 'destroyed') return;
  if (active.status === 'RACING') {
    const ace = active.targetId ? players.get(active.targetId) : undefined;
    if (!ace?.bot?.journeyAce || ace.bot.journeyAttemptId !== active.attemptId ||
      ace.bot.journeyTargetPlayerId !== playerId || ace.lifeState !== 'alive' || ace.health <= 0)
      failPlayerJourney(playerId, 'ACE_INTERRUPTED', now);
    return;
  }
  if (active.status !== 'APPROACH' || active.targetId) return;
  const targetId = createBot('dallas', undefined,
    { attemptId: active.attemptId, targetPlayerId: playerId, target: pilot, ace: true });
  const ace = players.get(targetId)!;
  ace.bot!.nextFireAt = now + 3_000;
  const assigned = journeyStore.assignHunter(pilot.pilotId, active.attemptId, targetId, null, now);
  if (!assigned) { removeBot(targetId); return; }
  sendJourneyState(playerId, assigned);
}
const legendaryAceMotion = new Map<string, { x: number; z: number; movedAt: number }>();
function ensureJourneyLegendary(playerId: string, pilot: PlayerState, active: JourneyAttempt, now: number): void {
  if (active.missionId !== journeyDallas24.id || active.status !== 'RACING' ||
    active.legendaryPhase !== 'ACE' || pilot.lifeState !== 'alive') return;
  if (active.targetId) {
    const ace = players.get(active.targetId);
    if (!ace?.bot?.journeyLegendary || ace.bot.journeyAttemptId !== active.attemptId ||
      ace.bot.journeyTargetPlayerId !== playerId || ace.lifeState !== 'alive' || ace.health <= 0) {
      failPlayerJourney(playerId, 'ACE_INTERRUPTED', now);
      return;
    }
    const motion = legendaryAceMotion.get(active.targetId);
    if (!motion) { failPlayerJourney(playerId, 'ACE_INTERRUPTED', now); return; }
    if (Math.hypot(ace.position.x - motion.x, ace.position.z - motion.z) >= 40) {
      motion.x = ace.position.x; motion.z = ace.position.z; motion.movedAt = now;
    } else if (now - motion.movedAt > 8_000) failPlayerJourney(playerId, 'ACE_INTERRUPTED', now);
    return;
  }
  const id = createBot('dallas', undefined,
    { attemptId: active.attemptId, targetPlayerId: playerId, target: pilot, ace: true, legendary: true });
  const assigned = journeyStore.assignLegendaryAce(pilot.pilotId, active.attemptId, id);
  if (!assigned) { removeBot(id); return; }
  legendaryAceMotion.set(id, { x: players.get(id)!.position.x, z: players.get(id)!.position.z, movedAt: now });
  players.get(id)!.bot!.nextFireAt = now + 3_000;
  provokeJourneyHunter(playerId, pilot, id, now);
  sendJourneyState(playerId, assigned);
}
function ensureJourneyCrossfire(playerId: string, pilot: PlayerState, active: JourneyAttempt, now: number): void {
  if (active.missionId !== journeyDallas16.id || active.status !== 'RACING' || pilot.lifeState !== 'alive') return;
  for (const ordinal of [1, 2] as const) {
    if (active.gateIndex < (ordinal === 1 ? 1 : 3)) continue;
    const assignedId = ordinal === 1 ? active.targetId : active.secondaryTargetId;
    if (assignedId) {
      if (crossfireDefeatedHunters.get(active.attemptId)?.has(assignedId)) continue;
      const hunter = players.get(assignedId);
      if (!hunter?.bot?.journeyCrossfire || hunter.bot.journeyAttemptId !== active.attemptId ||
        hunter.bot.journeyTargetPlayerId !== playerId || hunter.lifeState !== 'alive') {
        failPlayerJourney(playerId, 'CROSSFIRE_INTERRUPTED', now);
        return;
      }
      const motion = crossfireHunterMotion.get(assignedId);
      if (motion) {
        if (Math.hypot(hunter.position.x - motion.x, hunter.position.z - motion.z) >= 5)
          crossfireHunterMotion.set(assignedId, { x: hunter.position.x, z: hunter.position.z, at: now });
        else if (now - motion.at > 6_000) { failPlayerJourney(playerId, 'CROSSFIRE_INTERRUPTED', now); return; }
      }
      continue;
    }
    const hunterId = createBot('dallas', undefined,
      { attemptId: active.attemptId, targetPlayerId: playerId, target: pilot, crossfireOrdinal: ordinal });
    const hunter = players.get(hunterId)!;
    hunter.bot!.nextFireAt = now + 3_000;
    crossfireHunterMotion.set(hunterId, { x: hunter.position.x, z: hunter.position.z, at: now });
    const assigned = journeyStore.assignCrossfireHunter(pilot.pilotId, active.attemptId, hunterId, ordinal);
    if (!assigned) { crossfireHunterMotion.delete(hunterId); removeBot(hunterId); continue; }
    if (!crossfireFireCoordinators.has(active.attemptId)) crossfireFireCoordinators.set(active.attemptId, new CrossfireFireCoordinator());
    provokeJourneyHunter(playerId, pilot, hunterId, now);
    sendJourneyState(playerId, assigned);
  }
}
function ensureJourneySiegeHunter(playerId: string, pilot: PlayerState, active: JourneyAttempt, now: number): void {
  if (active.missionId !== journeyDallas18.id || active.status !== 'RACING' || pilot.lifeState !== 'alive') return;
  if (active.targetId) {
    if (siegeDefeatedHunters.has(active.targetId)) return;
    const hunter = players.get(active.targetId);
    if (!hunter?.bot?.journeySiege || hunter.bot.journeyAttemptId !== active.attemptId ||
      hunter.bot.journeyTargetPlayerId !== playerId || hunter.lifeState !== 'alive') {
      failPlayerJourney(playerId, 'DEFENSE_INTERRUPTED', now); return;
    }
    const motion = siegeHunterMotion.get(active.targetId);
    if (motion) {
      if (Math.hypot(hunter.position.x - motion.x, hunter.position.z - motion.z) >= 5)
        siegeHunterMotion.set(active.targetId, { x: hunter.position.x, z: hunter.position.z, at: now });
      else if (now - motion.at > 6_000) failPlayerJourney(playerId, 'DEFENSE_INTERRUPTED', now);
    }
    return;
  }
  if (!active.startedAt || now - active.startedAt < journeyDallas18.hunterDelayMs || !playerJourneyLoveTakeoff.has(playerId)) return;
  const hunterId = createBot('dallas', undefined,
    { attemptId: active.attemptId, targetPlayerId: playerId, target: pilot, siege: true });
  const hunter = players.get(hunterId)!;
  hunter.bot!.nextFireAt = now + 3_000;
  siegeHunterMotion.set(hunterId, { x: hunter.position.x, z: hunter.position.z, at: now });
  const assigned = journeyStore.assignSiegeHunter(pilot.pilotId, active.attemptId, hunterId);
  if (!assigned) { siegeHunterMotion.delete(hunterId); removeBot(hunterId); return; }
  provokeJourneyHunter(playerId, pilot, hunterId, now);
  sendJourneyState(playerId, assigned);
}
function crossfireEncounterValid(attempt: JourneyAttempt, playerId: string): boolean {
  const defeated = crossfireDefeatedHunters.get(attempt.attemptId);
  const validHunter = (id: string | null): boolean => {
    if (!id) return false;
    if (defeated?.has(id)) return true;
    const hunter = players.get(id);
    return hunter?.lifeState === 'alive' && hunter.bot?.journeyCrossfire === true &&
      hunter.bot.journeyAttemptId === attempt.attemptId && hunter.bot.journeyTargetPlayerId === playerId;
  };
  return attempt.gateIndex === 0 || validHunter(attempt.targetId) &&
    (attempt.gateIndex < 3 || validHunter(attempt.secondaryTargetId));
}
function updateJourneyEscape(now: number): void {
  for (const [playerId, attemptId] of playerJourneyAttempts) {
    if (pausedJourneyAttempts.has(attemptId)) continue;
    const pilot = players.get(playerId);
    const active = pilot && journeyStore.get(pilot.pilotId, attemptId);
    if (!pilot || active?.missionId !== journeyDallas14.id || active.status !== 'RACING' || !active.targetId) continue;
    const hunter = players.get(active.targetId);
    const state = journeyEscapeStates.get(playerId);
    if (!state || state.attemptId !== attemptId || !hunter?.bot || hunter.bot.journeyAttemptId !== attemptId ||
      hunter.bot.journeyTargetPlayerId !== playerId || hunter.lifeState !== 'alive' || hunter.health <= 0) {
      failPlayerJourney(playerId, 'PURSUIT_INTERRUPTED', now); continue;
    }
    const moved = Math.hypot(hunter.position.x - state.lastX, hunter.position.z - state.lastZ);
    if (moved >= 5) { state.lastMotionAt = now; state.lastX = hunter.position.x; state.lastZ = hunter.position.z; }
    if (now - state.lastMotionAt > 6_000) { failPlayerJourney(playerId, 'PURSUIT_INTERRUPTED', now); continue; }
    const activePursuit = hunter.bot.journeyProvoked === true && isHunterCombatPhase(hunter.bot.phase) &&
      hunter.bot.combatTargetId === playerId && !hunter.bot.journeyPilotOutside &&
      now - state.lastMotionAt < 1_500 && now - hunter.lastStateAt < 450;
    const eligibleFlight = pilot.lifeState === 'alive' && pilot.health > 0 && pilot.hasRespawnTransform &&
      playerJourneyLoveTakeoff.has(playerId) && landingFlightState.get(playerId)?.airborne === true &&
      pilot.position.y - botTerrainHeight('dallas', pilot.position.x, pilot.position.z) > 8 &&
      now - pilot.lastAcceptedTransformAt < 450 && hasOpenPlayerSocket(playerId) &&
      insideJourneyHunterArena(pilot.position);
    const interval = escapeInterval(pilot.position, hunter.position, journeyDallas14.escapeDistance,
      eligibleFlight, activePursuit, state.engaged);
    state.engaged = interval.engaged;
    const valid = interval.valid;
    const previousStatus = state.status;
    state.distance = interval.distance;
    state.status = !state.engaged ? 'PURSUING' : valid ? 'HOLDING' : 'CLOSING';
    const next = journeyStore.updateEscapeHold(pilot.pilotId, attemptId, active.targetId, valid, now, performance.now());
    if (!next) continue;
    if (next.status !== active.status || previousStatus !== state.status || now - state.lastSentAt >= 500) {
      state.lastSentAt = now;
      sendJourneyState(playerId, next);
      if (next.status === 'COMPLETED') {
        sendProfile(playerId, profileStore.getOrCreate(pilot.pilotId, pilot.displayName), undefined, undefined, journeyDallas14.name);
        removeJourneyHunter(next);
      }
    }
  }
}
function spawnRearGuardEscorts(playerId: string, pilot: PlayerState, attempt: JourneyAttempt, now: number): void {
  if ((attempt.missionId !== journeyDallas08.id && attempt.missionId !== journeyDallas09.id && attempt.missionId !== journeyDallas10.id && attempt.missionId !== journeyDallas12.id) || attempt.status !== 'RACING' || attempt.targetId || attempt.secondaryTargetId) return;
  const mission = attempt.missionId === journeyDallas12.id ? journeyDallas12 : attempt.missionId === journeyDallas10.id ? journeyDallas10 : attempt.missionId === journeyDallas09.id ? journeyDallas09 : journeyDallas08;
  rearGuardFire.set(attempt.attemptId, createRearGuardFireState(mission));
  for (const ordinal of [1, 2] as const) {
    const escortId = createBot('dallas', undefined,
      { attemptId: attempt.attemptId, targetPlayerId: playerId, target: pilot, rearGuardOrdinal: ordinal,
        escortMissionId: mission.id, escortPose: transportPose(0, transportFlightAltitude, mission.timeLimitMs) });
    const assigned = journeyStore.assignRearGuardEscort(pilot.pilotId, attempt.attemptId, escortId, ordinal);
    if (!assigned) { removeBot(escortId); break; }
    attempt = assigned;
  }
  sendJourneyState(playerId, attempt);
}

function beginReinforcementWave(attempt: JourneyAttempt, now: number): void {
  if (attempt.missionId !== journeyDallas09.id || attempt.monsterHealth === null ||
    !shouldBeginReinforcements(attempt.monsterHealth, attempt.status, reinforcementWaves.has(attempt.attemptId))) return;
  reinforcementWaves.set(attempt.attemptId, {
    arriveAt: now + journeyDallas09.reinforcementWarningMs, spawned: false, ids: [null, null],
  });
}

function updateReinforcementWaves(now: number): void {
  for (const [attemptId, wave] of reinforcementWaves) {
    if (wave.spawned || now < wave.arriveAt || pausedJourneyAttempts.has(attemptId)) continue;
    const encounter = transportEncounters.get(attemptId);
    const pilot = encounter && players.get(encounter.playerId);
    const attempt = pilot && journeyStore.get(pilot.pilotId, attemptId);
    if (!pilot || attempt?.missionId !== journeyDallas09.id || attempt.status !== 'RACING') {
      reinforcementWaves.delete(attemptId);
      continue;
    }
    wave.spawned = true;
    const pose = transportPose(now - encounter!.startedAt, encounter!.altitude, encounter!.durationMs);
    for (const ordinal of [3, 4] as const) {
      const id = createBot('dallas', undefined, { attemptId, targetPlayerId: encounter!.playerId,
        target: pilot, rearGuardOrdinal: ordinal, escortMissionId: journeyDallas09.id, escortPose: pose });
      wave.ids[ordinal - 3] = id;
      const escort = players.get(id);
      if (escort?.bot) {
        escort.bot.journeyProvoked = true;
        // Let the incoming formation cross the player's view before combat AI turns it away.
        escort.bot.escortReturnUntil = now + journeyDallas09.reinforcementFireDelayMs;
      }
    }
    const fire = rearGuardFire.get(attemptId);
    if (fire) rearGuardReinforcementsJoined(fire, now);
    sendJourneyState(encounter!.playerId, attempt);
  }
}

function ensureJourneyLeader(playerId: string, pilot: PlayerState, active: JourneyAttempt, now: number): void {
  if (active.missionId !== journeyDallas08.id || !['APPROACH', 'RACING'].includes(active.status) ||
    pilot.lifeState !== 'alive') return;
  const current = active.targetId ? players.get(active.targetId) : undefined;
  if (current?.bot?.journeyLeader && current.bot.journeyAttemptId === active.attemptId &&
    current.bot.journeyTargetPlayerId === playerId && current.lifeState === 'alive') return;
  if (active.targetId) removeJourneyHunter(active);
  const targetId = createBot('dallas', undefined, { attemptId: active.attemptId, targetPlayerId: playerId, target: pilot, leader: true });
  const assigned = journeyStore.assignLeader(pilot.pilotId, active.attemptId, targetId, active.targetId, now);
  if (!assigned || assigned.targetId !== targetId) { removeBot(targetId); return; }
  journeyFormationStates.set(playerId, 'AIRBORNE_REQUIRED');
  sendJourneyState(playerId, assigned);
}
function updateJourneyFormation(now: number): void {
  for (const [playerId, attemptId] of playerJourneyAttempts) {
    if (pausedJourneyAttempts.has(attemptId)) continue;
    const pilot = players.get(playerId);
    const active = pilot && journeyStore.get(pilot.pilotId, attemptId);
    if (!pilot || active?.missionId !== journeyDallas08.id || active.status !== 'RACING' || !active.targetId) continue;
    const leader = players.get(active.targetId);
    const fresh = pilot.lifeState === 'alive' && leader?.lifeState === 'alive' && leader.bot?.journeyLeader === true &&
      leader.bot.journeyAttemptId === attemptId && leader.bot.journeyTargetPlayerId === playerId &&
      pilot.cityId === 'dallas' && leader.cityId === 'dallas' &&
      now - pilot.lastAcceptedTransformAt < 450 && now - leader.lastStateAt < 450 &&
      playerJourneyLoveTakeoff.has(playerId) && !playerJourneyRunwayPrep.has(playerId);
    const status: FormationStatus = fresh ? journeyFormationStatus({
      position: pilot.position, heading: pilot.rotation.y,
      speed: Math.hypot(pilot.velocity.x, pilot.velocity.z),
      airborne: landingFlightState.get(playerId)?.airborne === true &&
        pilot.position.y - botTerrainHeight('dallas', pilot.position.x, pilot.position.z) > 8,
    }, {
      position: leader!.position, heading: leader!.rotation.y,
      speed: Math.hypot(leader!.velocity.x, leader!.velocity.z),
      airborne: leader!.position.y - botTerrainHeight('dallas', leader!.position.x, leader!.position.z) > 25,
    }) : 'AIRBORNE_REQUIRED';
    const next = journeyStore.updateFormationHold(pilot.pilotId, attemptId, active.targetId, status === 'VALID', now);
    if (!next) continue;
    const previousStatus = journeyFormationStates.get(playerId);
    journeyFormationStates.set(playerId, status);
    if (next.status !== active.status || Math.floor(next.holdMs / 1_000) !== Math.floor(active.holdMs / 1_000) ||
      previousStatus !== status) {
      sendJourneyState(playerId, next);
      if (next.status === 'COMPLETED') {
        sendProfile(playerId, profileStore.getOrCreate(pilot.pilotId, pilot.displayName), undefined, undefined, journeyDallas08.name);
        removeJourneyHunter(next);
      }
    }
  }
}
function failPlayerJourney(playerId: string, reason: 'TIME_UP' | 'CRASHED' | 'MONSTER_KILLED' | 'INTERRUPTED' | 'INVALID' | 'PURSUIT_INTERRUPTED' | 'ACE_INTERRUPTED' | 'CROSSFIRE_INTERRUPTED' | 'DEFENSE_INTERRUPTED' | 'DOUBLE_INTERRUPTED', now = Date.now()): void {
  const attemptId = playerJourneyAttempts.get(playerId);
  const player = players.get(playerId);
  if (!attemptId || !player) return;
  const previous = journeyStore.get(player.pilotId, attemptId);
  if (!previous || !['READY', 'APPROACH', 'RACING'].includes(previous.status)) return;
  const failed = journeyStore.fail(player.pilotId, attemptId, reason, now);
  if((failed?.missionId===journeyDallas07.id || failed?.missionId===journeyDallas08.id || failed?.missionId===journeyDallas09.id || failed?.missionId===journeyDallas10.id || failed?.missionId===journeyDallas11.id || failed?.missionId===journeyDallas12.id) && reason==='TIME_UP')sendToPlayer(playerId,{type:'transportFinal',attemptId:failed.attemptId,kind:'timeout',at:now});
  if (failed?.missionId === journeyDallas19.id && reason === 'TIME_UP')
    sendToPlayer(playerId, { type: 'monsterFinal', attemptId: failed.attemptId, kind: 'timeout', at: now });
  speedGateTracker.clear(playerId);
  speedGateWarningAt.delete(playerId);
  wrongWayGateWarningAt.delete(playerId);
  playerJourneyRunwayPrep.delete(playerId);
  playerJourneyLoveTakeoff.delete(playerId);
  playerJourneyAddisonTakeoff.delete(playerId);
  if (failed) { sendJourneyState(playerId, failed); removeJourneyHunter(failed); }
}

const serverVerifiedTutorialSteps=new Set<TutorialLessonStep>(['takeoff','approach','targetLock','fire','landing']);
function sendTutorialStepResult(playerId:string,result:{ok:boolean;changed:boolean;reason?:string;nextStep?:TutorialLessonStep;steps:Record<TutorialLessonStep,TutorialStepStatus>},step:TutorialLessonStep,status:Exclude<TutorialStepStatus,'pending'>):void{
  sendToPlayer(playerId,{type:'tutorialStepResult',ok:result.ok,step,status,nextStep:result.nextStep,steps:result.steps,reason:result.reason});
}
function sendTutorialScreenplayCruise(playerId:string,player:PlayerState):void{
  if(!player.tutorialMode||player.cityId!=='milwaukee')return;
  const airport=cityAirports.milwaukee[0];
  const heading=airport.heading;
  const speed=55;
  const position={x:airport.x,y:2_500,z:airport.z};
  const now=Date.now();
  player.position={...position};player.lastAcceptedPosition={...position};player.lastAcceptedTransformAt=now;
  player.rotation={x:0,y:heading,z:0};
  player.velocity={x:-Math.sin(heading)*speed,y:0,z:-Math.cos(heading)*speed};
  player.hasRespawnTransform=false;player.lifeState='alive';player.lastStateAt=now;
  sendToPlayer(playerId,{type:'tutorialScreenplayCruise',position,heading,speed});
}
function sendTutorialLandingApproach(playerId:string,player:PlayerState,screenplay=false):void{
  if(!player.tutorialMode||player.cityId!=='milwaukee'||(!screenplay&&profileStore.nextPendingTutorialStep(player.pilotId)!=='landing'))return;
  const approach=tutorialLandingApproach(cityAirports.milwaukee[0],aircraftFlightEnvelope.trainer.safeLandingSpeed);
  const now=Date.now();
  removeTrainingTarget(playerId);removePlayerProjectiles(playerId);
  // An earlier tutorial touchdown must not consume the final lesson's receipt.
  landingReceipts.delete(`${playerId}:${approach.airportId}`);
  player.position={...approach.position};player.lastAcceptedPosition={...approach.position};player.lastAcceptedTransformAt=now;
  player.rotation={x:0,y:approach.heading,z:0};
  player.velocity={x:-Math.sin(approach.heading)*approach.speed,y:0,z:-Math.cos(approach.heading)*approach.speed};
  player.hasRespawnTransform=false;player.lifeState='alive';player.lastStateAt=now;
  landingFlightState.set(playerId,{baselineY:approach.position.y-8,airborne:true});
  sendToPlayer(playerId,{type:'tutorialLandingApproach',...approach});
}
function completeServerTutorialStep(playerId:string,player:PlayerState,step:TutorialLessonStep,now=Date.now()):void{
  if(!player.tutorialMode)return;
  // Authoritative events can arrive while the preceding lesson's 600ms
  // success card is still visible. Persist the evidence immediately; the
  // client serializes presentation without weakening server verification.
  const result=profileStore.recordTutorialStepStatus(player.pilotId,step,'completed',now);
  if(result.changed){sendTutorialStepResult(playerId,result,step,'completed');if(result.nextStep==='landing')sendTutorialLandingApproach(playerId,player);recordAnalytics(playerId,'tutorial_step_completed',{metadata:{cityId:player.cityId,mode:step}},now);}
}

function isHumanPilot(player: PlayerState | undefined): player is PlayerState & { isBot: false } {
  return Boolean(player && !player.isBot);
}

function tutorialCombatPairAllowed(ownerId: string, owner: PlayerState, targetId: string, target: PlayerState): boolean {
  if (owner.trainingOwnerId) return false;
  if (owner.tutorialMode) return target.trainingOwnerId === ownerId;
  if (target.tutorialMode || target.trainingOwnerId) return false;
  return targetId !== ownerId;
}

function progressionEnabled(player: PlayerState | undefined): boolean {
  return Boolean(player && !player.tutorialMode && !player.skyDuelMode && cityCapabilities(player.cityId)?.progressionEnabled);
}

function sendProfile(playerId: string, _profile?: PlayerProfile, rewardId?: string, equipRequestId?: number, creditReason?: string, preserveActiveAircraft = false, serverReset = false): void {
  const player = players.get(playerId);
  if (!isHumanPilot(player)) return;
  // Caller snapshots can be stale after another reward source commits. Read
  // the persisted profile at send time so the receipt and balance agree.
  const current = reconcilePaidFirehawk(profileStore.getOrCreate(player.pilotId, player.displayName));
  const previousCredits = lastSentCredits.get(playerId);
  const receipt = previousCredits === undefined ? undefined : creditReceipt(previousCredits, current.credits, randomUUID(), creditReason ?? 'Profile Sync');
  lastSentCredits.set(playerId, current.credits);
  const keepActiveAircraft = preserveActiveAircraft || player.tutorialMode;
  player.profile = current;
  player.displayName = current.pilotName;
  if (!keepActiveAircraft) player.aircraftType = current.selectedAircraft;
  sendToPlayer(playerId, { type: 'profile', profile: current, legendaryPilot: journeyStore.progress(player.pilotId, journeyDallas24.id).completed, rewardId, creditReceipt: receipt, selectionRevision: player.selectionRevision ?? 0, equipRequestId, creditReason, preserveActiveAircraft: keepActiveAircraft, serverReset });
}

function reportPilotXp(playerId: string, source: string, result: XpAwardResult, now = Date.now()): void {
  if (!result.awarded) {
    recordAnalytics(playerId, 'pilot_xp_rejected', { source, metadata: { reason: result.reason ?? 'INELIGIBLE' } }, now);
    return;
  }
  recordAnalytics(playerId, 'pilot_xp_earned', { source, amount: result.amount, metadata: { level: result.afterLevel, day: utcDayId(now) } }, now);
  const player = players.get(playerId);
  if (player) recordAnalytics(playerId, 'pilot_xp_daily_total', { amount: profileStore.xpDailyTotal(player.pilotId, now), source: utcDayId(now) }, now);
  if (result.afterLevel > result.beforeLevel) {
    const profile = profileStore.getOrCreate(players.get(playerId)!.pilotId, players.get(playerId)!.displayName);
    sendToPlayer(playerId, { type: 'pilotLevelUp', previousLevel: result.beforeLevel, level: result.afterLevel, title: profile.pilotProgress.title });
    recordAnalytics(playerId, 'pilot_level_up', { metadata: { level: result.afterLevel, title: profile.pilotProgress.title } }, now);
    for (const rank of earnedRankDefinitions)
      if (rank.level > result.beforeLevel && rank.level <= result.afterLevel)
        recordAnalytics(playerId, 'pilot_rank_achieved', { source: rank.id, metadata: { level: rank.level } }, now);
  }
}

function qualifyReferralFromFlight(playerId: string, now = Date.now()): void {
  const player = players.get(playerId);
  if (!isHumanPilot(player) || !player.accountId || !progressionEnabled(player)) return;
  const result = profileStore.qualifyReferral(player.pilotId, now);
  if (!result.rewarded) return;
  const referredProfile = result.profile ?? profileStore.getOrCreate(player.pilotId, player.displayName);
  sendProfile(playerId, referredProfile, undefined, undefined, 'Referral Welcome Reward');
  recordAnalytics(playerId, 'referral_qualified', { metadata: { role: 'referred' } }, now);
  recordAnalytics(playerId, 'referral_new_player_rewarded', { amount: 500 }, now);
  const referredContext = analyticsContexts.get(playerId);
  const inviterContext: AnalyticsContext = { pilotId: result.inviterId!,
    environment: referredContext?.environment ?? 'production', host: referredContext?.host ?? 'unknown' };
  if (!result.inviterRewarded) { analyticsStore.recordEvent(inviterContext, 'referral_cap_reached', {}, now); return; }
  analyticsStore.recordEvent(inviterContext, 'referral_inviter_rewarded', { amount: 750 }, now);
  for (const [otherId, other] of players) if (isHumanPilot(other) && other.pilotId === result.inviterId) {
    const inviterProfile = profileStore.getOrCreate(other.pilotId, other.displayName);
    sendProfile(otherId, inviterProfile, undefined, undefined, 'Referral Reward');
  }
}

function syncRefundedFirehawkProfile(pilotId: string, profile: PlayerProfile): void {
  for (const [playerId, player] of players) {
    if (!isHumanPilot(player) || player.pilotId !== pilotId) continue;
    const preserveActiveAircraft = player.aircraftType === 'fighter' && player.lifeState === 'alive' && landingFlightState.get(playerId)?.airborne === true;
    const previousAircraft = player.aircraftType;
    player.selectionRevision = (player.selectionRevision ?? 0) + 1;
    sendProfile(playerId, profile, undefined, undefined, undefined, preserveActiveAircraft);
    if (preserveActiveAircraft || player.aircraftType === previousAircraft) continue;
    player.health = maxHealthForAircraft(player.aircraftType);
    broadcastToCity(player.cityId, {
      type: 'playerState', playerId, health: player.health, lifeState: player.lifeState,
      position: player.position, rotation: player.rotation, aircraftType: player.aircraftType,
      cityId: player.cityId, displayName: player.displayName, boostActive: player.boostActive, maxHealth: maxHealthForAircraft(player.aircraftType),
    });
  }
}

function sendMissionState(playerId: string): void {
  const player = players.get(playerId);
  if (!isHumanPilot(player)) return;
  sendToPlayer(playerId, { type: 'missionState', cityId: player.cityId, state: player.profile.missions[player.cityId] });
}

function missionAcceptanceUnavailableReason(playerId: string, player: PlayerState, definition: CityMission): string | undefined {
  if (definition.retired) return 'MISSION RETIRED';
  if (definition.type === 'assignedHunter') {
    const available = [...players.values()].some((candidate) => candidate.cityId === player.cityId && candidate.isBot &&
      candidate.bot?.personality === 'hunter' && !candidate.bot.journeyAttemptId && candidate.lifeState === 'alive');
    if (!available) return 'NO HUNTER AVAILABLE — TRY AGAIN SOON';
  }
  if (definition.type === 'humanKill') {
    const opponentAvailable = [...players.entries()].some(([candidateId, candidate]) => candidateId !== playerId &&
      isHumanPilot(candidate) && candidate.cityId === player.cityId && hasOpenPlayerSocket(candidateId));
    if (!opponentAvailable) return 'REQUIRES ANOTHER HUMAN PILOT IN THIS CITY';
  }
  if (definition.type === 'event') {
    const event = cityEvents.get(player.cityId);
    const available = Boolean(event && event.type === definition.requirements.eventType &&
      (event.lifecycle === 'available' || event.lifecycle === 'active') &&
      ((event.type !== 'aceIntercept' && event.type !== 'vipEscort') || event.lifecycle === 'available' || (event.bossHealth ?? 0) > 0));
    if (!available) {
      if (definition.requirements.eventType === 'aceIntercept') return 'ACE EVENT NOT CURRENTLY AVAILABLE';
      if (definition.requirements.eventType === 'vipEscort') return 'VIP EVENT NOT CURRENTLY AVAILABLE';
      if (definition.requirements.eventType === 'goldenSkyRun') return 'GOLDEN SKY RUN NOT CURRENTLY AVAILABLE';
      return 'MATCHING EVENT NOT CURRENTLY AVAILABLE';
    }
  }
  return undefined;
}

function controlledTerritoryIds(playerId: string, cityId: CityId): ReadonlySet<string> {
  return new Set(territoryStates(cityId).filter((state) => state.controllerId === playerId).map((state) => state.definition.id));
}

function missionSignal(playerId: string, signal: MissionSignal): void {
  const player = players.get(playerId);
  if (!isHumanPilot(player) || (player.tutorialMode && signal.type !== 'lostFlight')) return;
  if (playerJourneyAttempts.has(playerId) && signal.type !== 'lostFlight' && signal.type !== 'disconnect') return;
  const state = profileStore.missionState(player.pilotId, player.cityId);
  const active = state?.active;
  if (!active) return;
  const definition = missionForCity(player.cityId, active.missionId);
  if (!definition) return;
  // "Every territory" is resolved from the active city's actual manifest.
  const mission = definition.requirements.allCityTerritories
    ? { ...definition, requirements: { ...definition.requirements, requiredTerritoryIds: territoriesForCity(player.cityId).map((item) => item.id) } }
    : definition;
  const result = advanceMission(mission, active, signal);
  if (!result.changed && !result.completed) return;
  if (result.completed) {
    const reward = profileStore.completeMission(player.pilotId, player.cityId, active.attemptId, signal.at);
    if (!reward) return;
    player.score += reward.score;
    sendProfile(playerId, reward.profile, undefined, undefined, 'Mission Complete');
    sendToPlayer(playerId, { type: 'missionCompleted', missionId: reward.missionId, credits: reward.credits, score: reward.score });
    recordAnalytics(playerId, 'credits_earned', { amount: reward.credits, source: 'mission' }, signal.at);
    recordAnalytics(playerId, 'mission_completed', { source: reward.missionId, amount: reward.credits, metadata: { mammothCargoBonus: reward.cargoBonusCredits, cargoBonusApplied: reward.cargoBonusCredits > 0 } }, signal.at);
    const flightMetrics = flightAnalytics.get(playerId);
    if (flightMetrics) flightMetrics.missions += 1;
    if (reward.xpSource) reportPilotXp(playerId, reward.xpSource, reward.xp, signal.at);
    broadcastLeaderboard(player.cityId);
    updateKing(player.cityId);
  } else {
    const updated = profileStore.updateMissionAttempt(player.pilotId, player.cityId, result.attempt);
    if (!updated) return;
    player.profile.missions[player.cityId] = updated.missions[player.cityId]!;
    sendMissionState(playerId);
  }
}

function tickMissions(now: number): void {
  for (const cityId of cityIds) {
    const humans = [...players.entries()].filter(([playerId, player]) => !player.isBot && player.cityId === cityId && hasOpenPlayerSocket(playerId))
      .sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]));
    const controlled = new Map<string, Set<string>>();
    for (const territory of territoryStates(cityId)) if (territory.controllerId) {
      const owned = controlled.get(territory.controllerId) ?? new Set<string>();
      owned.add(territory.definition.id);
      controlled.set(territory.controllerId, owned);
    }
    for (let rank = 0; rank < humans.length; rank += 1) {
      const [playerId, player] = humans[rank];
      if (!player.profile.missions[cityId]?.active) continue;
      missionSignal(playerId, {
        type: 'tick', at: now, alive: player.lifeState === 'alive', connected: hasOpenPlayerSocket(playerId),
        airborne: Boolean(landingFlightState.get(playerId)?.airborne),
        controlledTerritories: controlled.get(playerId) ?? new Set(),
        scoreRank: rank + 1, humanCount: humans.length, score: player.score,
      });
    }
  }
}

// Every gameplay system reports weekly values through this one server-side
// path; lifecycle handlers never need storage details.
function recordWeeklyActivity(playerId: string, category: WeeklyLeaderboardCategory, amount: number, highest = false): void {
  const player = players.get(playerId);
  if (!isHumanPilot(player) || !progressionEnabled(player) || amount <= 0) return;
  profileStore.recordWeeklyLeaderboard(player.pilotId, player.cityId, category, amount, highest);
  for (const [socket, recipientId] of playerSockets) {
    const recipient = players.get(recipientId);
    if (recipient?.cityId !== player.cityId || socket.readyState !== WebSocket.OPEN) continue;
    sendSocketMessage(socket, { type: 'weeklyLeaderboards', weeklyLeaderboards: weeklyLeaderboardSnapshot(player.cityId, recipientId) });
  }
}

function weeklyLeaderboardSnapshot(cityId: CityId, playerId: string): object[] {
  return (['stunt', 'kills', 'wantedSurvival', 'events', 'territories', 'precisionLanding', 'mastery'] as const)
    .map((category) => ({ category, ...profileStore.weeklyLeaderboard(cityId, category, playerId) }));
}

function recordObjectiveActivity(playerId: string, activity: ObjectiveActivity, amount = 1, airportId?: string): void {
  const player = players.get(playerId);
  if (!isHumanPilot(player) || !progressionEnabled(player)) return;
  const result = profileStore.recordObjectiveActivity(player.pilotId, player.cityId, activity, amount, airportId);
  if (!result) return;
  const earnedCredits = result.completed.reduce((sum, item) => sum + item.reward, 0) + result.bonusCredits;
  if (earnedCredits > 0) recordAnalytics(playerId, 'credits_earned', { amount: earnedCredits, source: 'objective' });
  const seasonalActivity = activity === 'distance' || activity === 'stunt' || activity === 'heat3' ? undefined : activity;
  const seasonResult = seasonalActivity ? profileStore.recordSeasonActivity(player.pilotId, player.cityId, seasonalActivity, `${seasonalActivity}:${randomUUID()}`, amount) : undefined;
  if (seasonResult?.awarded) recordAnalytics(playerId, 'season_points_earned', { amount: seasonResult.points, source: seasonalActivity });
  sendProfile(playerId, seasonResult?.profile ?? result.profile, undefined, undefined, result.completed.length || result.bonusCredits ? 'Objective Complete' : undefined);
  if (activity !== 'distance' || amount >= 250) awardMastery(playerId, activity, activity === 'distance' ? Math.min(30, amount * (masteryValues.distance ?? 0)) : undefined);
  if (activity !== 'distance') {
    const cycle = result.profile.objectives[player.cityId];
    const item = [...(cycle?.daily ?? []), ...(cycle?.weekly ?? [])].find((candidate) => candidate.activity === activity && !candidate.completed);
    if (item) sendToPlayer(playerId, { type: 'objectiveProgress', label: item.label, progress: item.progress, target: item.target });
  }
  for (const item of result.completed) {
    sendToPlayer(playerId, { type: 'objectiveComplete', objectiveId: item.id, label: item.label, credits: item.reward });
    if (item.id.startsWith('daily-')) recordAnalytics(playerId, 'daily_flight_plan_task_completed', { source: item.activity });
  }
  if (result.bonusCredits) {
    sendToPlayer(playerId, { type: 'objectiveComplete', objectiveId: 'cycle-bonus', label: 'Daily Flight Plan complete', credits: result.bonusCredits });
    if (result.profile.objectives[player.cityId]?.dailyBonusAwarded) {
      recordAnalytics(playerId, 'daily_flight_plan_completed', { source: player.cityId });
      recordAnalytics(playerId, 'daily_flight_plan_reward_claimed', { amount: result.bonusCredits, source: player.cityId });
      const dailySeason = profileStore.recordSeasonActivity(player.pilotId, player.cityId, 'dailyComplete', `daily:${result.profile.objectives[player.cityId]?.dailyId ?? 'unknown'}`);
      if (dailySeason.awarded) recordAnalytics(playerId, 'season_points_earned', { amount: dailySeason.points, source: 'dailyComplete' });
    }
  }
  if (result.completed.length) awardMastery(playerId, 'event', 20 * result.completed.length);
}

function flushFlightRecords(playerId: string, player: PlayerState): void {
  const candidate = flightRecordCandidates.get(playerId); if (!candidate || player.isBot) return;
  if (!progressionEnabled(player)) { flightRecordCandidates.delete(playerId); return; }
  const records = [['top_speed', candidate.topSpeed * 1.943844], ['highest_altitude', candidate.highestAltitude * 3.28084], ['longest_flight', candidate.distance]] as const;
  let changed = false;
  for (const [type, value] of records) if (profileStore.updatePersonalRecord(player.pilotId, type, value, player.cityId)) {
    changed = true;
    recordAnalytics(playerId, 'personal_record_broken', { metadata: { recordType: type, value: Math.round(value) } });
  }
  flightRecordCandidates.delete(playerId);
  if (changed) sendProfile(playerId, profileStore.getOrCreate(player.pilotId, player.displayName));
}

function awardMastery(playerId: string, source: ObjectiveActivity, amount?: number): void {
  const player = players.get(playerId);
  const base = amount ?? masteryValues[source];
  if (!isHumanPilot(player) || !progressionEnabled(player) || !base || base <= 0) return;
  const now = Date.now(); const key = `${playerId}:${source}`; const cooldown = masteryCooldownMs[source] ?? 0;
  if ((masteryCooldowns.get(key) ?? 0) > now - cooldown) return;
  masteryCooldowns.set(key, now);
  const result = profileStore.awardMasteryXp(player.pilotId, player.cityId, base);
  if (!result) return;
  recordWeeklyActivity(playerId, 'mastery', result.gained);
  const category = source === 'stunt' ? 'stunt' : source === 'kill' ? 'kills' : source === 'event' ? 'events' : source === 'territoryCapture' ? 'territories' : undefined;
  if (category) recordWeeklyActivity(playerId, category, 1);
  sendProfile(playerId, result.profile);
  if (result.levelUp) sendToPlayer(playerId, { type: 'masteryLevel', cityId: player.cityId, level: result.levelUp, rewards: result.rewards });
}

function startSkyChallenge(playerId: string, player: PlayerState, challengeId: unknown): void {
  if (player.tutorialMode) return;
  const journeyId = playerJourneyAttempts.get(playerId);
  if (journeyId && (journeyStore.get(player.pilotId, journeyId)?.missionId === journeyDallas05.id || journeyStore.get(player.pilotId, journeyId)?.missionId === journeyDallas06.id || journeyStore.get(player.pilotId, journeyId)?.missionId === journeyDallas07.id || journeyStore.get(player.pilotId, journeyId)?.missionId === journeyDallas08.id || journeyStore.get(player.pilotId, journeyId)?.missionId === journeyDallas09.id || journeyStore.get(player.pilotId, journeyId)?.missionId === journeyDallas10.id || journeyStore.get(player.pilotId, journeyId)?.missionId === journeyDallas11.id || journeyStore.get(player.pilotId, journeyId)?.missionId === journeyDallas12.id || journeyStore.get(player.pilotId, journeyId)?.missionId === journeyDallas13.id || journeyStore.get(player.pilotId, journeyId)?.missionId === journeyDallas14.id || journeyStore.get(player.pilotId, journeyId)?.missionId === journeyDallas20.id)) return;
  if (typeof challengeId !== 'string' || player.lifeState !== 'alive' || activeChallenges.has(playerId)) return;
  const challenge = challengeForCity(player.cityId, challengeId);
  if (!challenge) return;
  const now = Date.now();
  activeChallenges.set(playerId, { challengeId, cityId: player.cityId, startedAt: now, lastGateAt: now, gateIndex: 0, rewarded: false });
}

function passSkyChallengeGate(playerId: string, player: PlayerState, challengeId: unknown, gateIndex: unknown): void {
  const journeyId = playerJourneyAttempts.get(playerId);
  if (journeyId && (journeyStore.get(player.pilotId, journeyId)?.missionId === journeyDallas05.id || journeyStore.get(player.pilotId, journeyId)?.missionId === journeyDallas06.id || journeyStore.get(player.pilotId, journeyId)?.missionId === journeyDallas07.id || journeyStore.get(player.pilotId, journeyId)?.missionId === journeyDallas08.id || journeyStore.get(player.pilotId, journeyId)?.missionId === journeyDallas09.id || journeyStore.get(player.pilotId, journeyId)?.missionId === journeyDallas10.id || journeyStore.get(player.pilotId, journeyId)?.missionId === journeyDallas11.id || journeyStore.get(player.pilotId, journeyId)?.missionId === journeyDallas12.id || journeyStore.get(player.pilotId, journeyId)?.missionId === journeyDallas13.id || journeyStore.get(player.pilotId, journeyId)?.missionId === journeyDallas14.id || journeyStore.get(player.pilotId, journeyId)?.missionId === journeyDallas20.id)) return;
  const active = activeChallenges.get(playerId);
  const challenge = active ? challengeForCity(player.cityId, active.challengeId) : undefined;
  const now = Date.now();
  if (!active || !challenge || active.cityId !== player.cityId || active.challengeId !== challengeId || gateIndex !== active.gateIndex || player.lifeState !== 'alive' || active.rewarded || now - active.startedAt > challenge.timeLimit * 1000 || now - active.lastGateAt < 350) {
    if (active && now - active.startedAt > (challenge?.timeLimit ?? 0) * 1000) activeChallenges.delete(playerId);
    return;
  }
  // Validate the standalone sky challenge against the gates the client draws.
  const gate = challenge.gates?.[active.gateIndex];
  if (gate) {
    const gateY = (dallasAirportElevations.get(`${challenge.id}:${active.gateIndex}`) ?? 0) + gate.altitude;
    const distance = Math.hypot(player.position.x - gate.x, player.position.y - gateY, player.position.z - gate.z);
    if (!player.hasRespawnTransform || now - player.lastStateAt > 1_500 || distance > gate.radius + Math.max(24, Math.hypot(player.velocity.x, player.velocity.y, player.velocity.z) * 0.12)) return;
  }
  active.lastGateAt = now;
  active.gateIndex += 1;
  if (active.gateIndex < challenge.gateCount) return;
  active.rewarded = true;
  activeChallenges.delete(playerId);
  const canProgress = progressionEnabled(player);
  const challengeScore = canProgress ? challenge.reward : 0;
  player.score += challengeScore;
  persistScore(player, challengeScore);
  const challengeCredits = canProgress ? challengeCreditReward(challenge.reward) : 0;
  const profile = canProgress ? profileStore.awardServerReward(player.pilotId, challengeCredits, { challengeCompletions: 1 }, 'CHALLENGE_REWARD', challenge.id) : undefined;
  if (profile) sendProfile(playerId, profile, undefined, undefined, 'Sky Challenge');
  if (challengeCredits > 0) recordAnalytics(playerId, 'credits_earned', { amount: challengeCredits, source: 'challenge' }, now);
  recordObjectiveActivity(playerId, 'challenge');
  awardMastery(playerId, 'challenge');
  sendToPlayer(playerId, { type: 'challengeComplete', challengeId: challenge.id, score: challengeScore, credits: challengeCredits });
  broadcastLeaderboard(player.cityId);
}

type LandingTelemetry = { speed: number; descentRate: number; bankAngle: number; pitch: number; headingError: number };

function validLandingTelemetry(value: unknown): LandingTelemetry | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const telemetry = value as Partial<LandingTelemetry>;
  const fields = [telemetry.speed, telemetry.descentRate, telemetry.bankAngle, telemetry.pitch, telemetry.headingError];
  if (!fields.every((field) => typeof field === 'number' && Number.isFinite(field))) return undefined;
  if (telemetry.speed! < 12 || telemetry.speed! > 300 || Math.abs(telemetry.descentRate!) > 40 || telemetry.bankAngle! < 0 || telemetry.bankAngle! > Math.PI || Math.abs(telemetry.pitch!) > Math.PI || telemetry.headingError! < 0 || telemetry.headingError! > Math.PI) return undefined;
  return telemetry as LandingTelemetry;
}

function validateAndRecordLanding(playerId: string, player: PlayerState, airportId: unknown, telemetryValue: unknown): void {
  if (typeof airportId !== 'string' || player.lifeState !== 'alive' || !player.hasRespawnTransform || Date.now() - player.lastStateAt > 1_500) return;
  const airport = airportForCity(player.cityId, airportId);
  const telemetry = validLandingTelemetry(telemetryValue);
  if (!airport || !telemetry) return;
  const now = Date.now(); const receiptKey = `${playerId}:${airport.id}`;
  if ((landingReceipts.get(receiptKey) ?? 0) > now - 30_000) return;
  const dx = player.position.x - airport.x; const dz = player.position.z - airport.z;
  const along = dx * Math.sin(airport.heading) + dz * Math.cos(airport.heading);
  const lateral = dx * Math.cos(airport.heading) - dz * Math.sin(airport.heading);
  if (Math.abs(along) > airport.runwayLength / 2 + 140 || Math.abs(lateral) > Math.max(airport.runwayWidth * 2, 90)) return;
  const serverSpeed = Math.hypot(player.velocity.x, player.velocity.z);
  if (serverSpeed < 12 || Math.abs(serverSpeed - telemetry.speed) > Math.max(45, serverSpeed * 0.75) || Math.abs(player.velocity.y - telemetry.descentRate) > 22) return;
  const flight = landingFlightState.get(playerId);
  const aircraft = aircraftFlightEnvelope[player.aircraftType];
  const envelope = { speed: aircraft.safeLandingSpeed, descent: aircraft.safeDescentRate, tilt: aircraft.landingTilt };
  // Match the assisted touchdown envelope accepted by flight/HUD.
  if (!flight?.airborne || telemetry.speed > envelope.speed * 1.18 || Math.abs(telemetry.descentRate) > envelope.descent * 1.35 || telemetry.bankAngle > envelope.tilt + 0.12 || Math.abs(telemetry.pitch) > envelope.tilt + 0.10 || telemetry.headingError > 0.62) return;
  // Tutorial completion also requires the latest accepted transform at runway height
  // and above the trainer's existing stall threshold; normal landing rules stay intact.
  if (player.tutorialMode && (telemetry.speed < aircraft.stallSpeed || !runwayOrTaxiSpawnArea(player))) return;
  const journeyAttemptId = playerJourneyAttempts.get(playerId);
  const championship = journeyAttemptId ? journeyStore.get(player.pilotId, journeyAttemptId) : undefined;
  const goldenChampionshipRace = championship?.missionId === journeyDallas06.id &&
    (championship.status === 'APPROACH' || championship.status === 'RACING');
  const criticalEncounter = championship?.missionId === journeyDallas17.id;
  const perfectEncounter = championship?.missionId === journeyDallas22.id;
  const legendaryEncounter = championship?.missionId === journeyDallas24.id;
  const scoredJourneyLanding = criticalEncounter || perfectEncounter || legendaryEncounter;
  const championshipActive = scoredJourneyLanding &&
    (championship?.status === 'APPROACH' || championship?.status === 'RACING');
  // Ordinary landing rules stay intact; the championship uses a tighter real
  // runway contact check and scores only the server-accepted transform.
  const touchdown = championshipActive ? championshipTouchdowns.get(playerId) : undefined;
  const serverLandingTelemetry = championshipActive
    ? touchdown && touchdown.attemptId === journeyAttemptId && touchdown.approachCycle === championship?.approachCycle && touchdown.airportId === airport.id && now - touchdown.at < 3_000
      ? touchdown.telemetry : null
    : telemetry;
  if (!serverLandingTelemetry) return;
  // Taxi/parked contacts cannot satisfy the runway, speed, fresh-transform,
  // and telemetry-consistency requirements together.
  landingReceipts.set(receiptKey, now);
  championshipTouchdowns.delete(playerId);
  landingFlightState.set(playerId, { baselineY: player.position.y, airborne: false });
  if (isHumanPilot(player)) profileStore.recordScoredLanding(player.pilotId);
  airborneMilestones.reset(playerId);
  const flightMetrics = flightAnalytics.get(playerId);
  if (flightMetrics) { flightMetrics.landings += 1; recordAnalytics(playerId, 'flight_landed', { source: airport.id }, now); }
  const quality = landingPrecisionScore(serverLandingTelemetry, envelope);
  const grade = landingGradeForScore(quality);
  if (championshipActive) {
    const result = championship && journeyAttemptId && criticalEncounter
        ? journeyStore.recordCriticalLanding(player.pilotId, journeyAttemptId, airport.id, quality, now)
      : championship && journeyAttemptId && perfectEncounter
        ? journeyStore.recordPerfectApproachLanding(player.pilotId, journeyAttemptId, airport.id, quality, championship.approachCycle, now)
      : championship && journeyAttemptId && legendaryEncounter && championship.legendaryPhase === 'LANDING'
        ? journeyStore.recordLegendaryLanding(player.pilotId, journeyAttemptId, airport.id, quality, championship.approachCycle, now) : undefined;
    if (result) {
      sendJourneyState(playerId, result);
      if (result.status === 'COMPLETED') sendProfile(playerId, profileStore.getOrCreate(player.pilotId, player.displayName), undefined, undefined,
        legendaryEncounter ? journeyDallas24.name : perfectEncounter ? journeyDallas22.name : journeyDallas17.name);
    }
  }
  if (!scoredJourneyLanding && !goldenChampionshipRace) {
    completeLandingChaosEvent(playerId, player, airport.id, grade, now);
    missionSignal(playerId, { type: 'landing', at: now, airportId: airport.id, quality, controlledTerritories: controlledTerritoryIds(playerId, player.cityId) });
  }
  if (!progressionEnabled(player)) {
    const tutorialStepsState=player.tutorialMode?profileStore.tutorialStepStates(player.pilotId):undefined;
    if(player.tutorialMode&&airport.id===cityAirports.milwaukee[0].id&&
      profileStore.trainingSlideIndex(player.pilotId)===trainingSlideIds.length-1)
      profileStore.recordTrainingEvidence(player.pilotId,8);
    if(player.tutorialMode&&tutorialStepsState&&tutorialStepPrerequisitesResolved('landing',tutorialStepsState)){
      profileStore.recordTrainingEvidence(player.pilotId,8);
      completeServerTutorialStep(playerId,player,'landing',now);
      sendToPlayer(playerId,{type:'tutorialSignal',signal:'completed'});
    }
    sendToPlayer(playerId, { type: 'landingScored', airportId: airport.id, quality, grade, score: quality, credits: 0 });
    return;
  }
  if (scoredJourneyLanding) {
    sendToPlayer(playerId, { type: 'landingScored', airportId: airport.id, quality, grade, score: quality, credits: 0 });
    return;
  }
  const landingCredits = economyRewards.landing;
  const landingReward = profileStore.awardServerRewardAndXp(player.pilotId, landingCredits, undefined, 'LANDING_REWARD', airport.id,
    { source: 'LANDING', eventId: `${player.cityId}:${airport.id}:${utcDayId(now)}`, cityId: player.cityId, now });
  const landingProfile = landingReward.profile;
  if (landingProfile) {
    const boundaryProfile = profileStore.consumeExpiredFighterTrial(player.pilotId, now) ?? landingProfile;
    player.profile = boundaryProfile;
    sendProfile(playerId, boundaryProfile, undefined, undefined, 'Safe Landing');
  }
  recordAnalytics(playerId, 'successful_landing', { source: airport.id, metadata: { quality } }, now);
  recordAnalytics(playerId, 'landing_scored', { source: grade.toLowerCase(), metadata: { quality } }, now);
  pilotProfileSummaryStore.recordSmoothLanding(player.pilotId, quality, now);
  if (grade === 'PERFECT' || grade === 'LEGENDARY') recordAnalytics(playerId, 'perfect_landing_earned', { source: airport.id }, now);
  sendToPlayer(playerId, { type: 'landingScored', airportId: airport.id, quality, grade, score: quality, credits: landingCredits });
  recordAnalytics(playerId, 'credits_earned', { amount: landingCredits, source: 'landing' }, now);
  recordObjectiveActivity(playerId, 'landing', 1, airport.id);
  recordWeeklyActivity(playerId, 'precisionLanding', quality, true);
  const sprint = challengeForPlayer(playerId);
  if (sprint?.mode === 'airportSprint' && sprint.destinationAirportId === airport.id) completePvpChallenge(sprint, playerId, now);
  profileStore.updatePersonalRecord(player.pilotId, 'best_landing', quality, player.cityId, now);
  flushFlightRecords(playerId, player);
  if (landingReward.xp) reportPilotXp(playerId, 'LANDING', landingReward.xp, now);
}

function broadcastEvent(event: CityEvent): void {
  broadcastToCity(event.cityId, eventSnapshot(event));
  event.lastBroadcastAt = Date.now();
}

function hasOpenPlayerSocket(playerId: string): boolean {
  for (const [socket, socketPlayerId] of playerSockets) {
    if (socketPlayerId === playerId && socket.readyState === WebSocket.OPEN) return true;
  }
  return false;
}

function isWantedEligible(playerId: string, player: PlayerState | undefined, cityId: CityId, now: number): player is PlayerState {
  if (!player || player.entityType !== 'player' || player.cityId !== cityId) return false;
  if (player.lifeState !== 'alive' || !player.hasRespawnTransform || now < player.spawnProtectedUntil) return false;
  if (now - player.lastStateAt > wantedTransformFreshMs || !hasOpenPlayerSocket(playerId)) return false;
  const values = [
    player.position.x, player.position.y, player.position.z,
    player.rotation.x, player.rotation.y, player.rotation.z,
  ];
  return values.every(Number.isFinite);
}

function selectMostWanted(cityId: CityId, now: number): [string, PlayerState] | undefined {
  return [...players.entries()]
    .filter(([playerId, player]) => isWantedEligible(playerId, player, cityId, now))
    .sort((left, right) =>
      currentHeat(right[0], now).value - currentHeat(left[0], now).value ||
      right[1].score - left[1].score,
    )[0];
}

function refreshMostWantedTarget(event: CityEvent, now: number): boolean {
  const current = event.wantedPlayerId ? players.get(event.wantedPlayerId) : undefined;
  if (event.wantedPlayerId && isWantedEligible(event.wantedPlayerId, current, event.cityId, now)) {
    event.objective = { ...current.position };
    return true;
  }
  const replacement = selectMostWanted(event.cityId, now);
  if (!replacement) {
    event.wantedPlayerId = undefined;
    setEventTerminal(event, 'failed', now);
    return false;
  }
  event.wantedPlayerId = replacement[0];
  event.wantedStartedAt = now;
  event.objective = { ...replacement[1].position };
  missionSignal(replacement[0], { type: 'wantedStarted', at: now, eventId: event.id, heatLevel: currentHeat(replacement[0], now).level });
  return true;
}

function recordMostWantedSurvival(playerId: string, event: CityEvent, now: number): void {
  const durationSeconds = Math.max(0, Math.round((now - (event.wantedStartedAt ?? event.activeAt)) / 1000));
  recordWeeklyActivity(playerId, 'wantedSurvival', durationSeconds, true);
  missionSignal(playerId, { type: 'wantedSurvived', at: now, eventId: event.id });
}

function reconcileMostWanted(cityId: CityId, now: number): void {
  const event = cityEvents.get(cityId);
  if (!event || event.lifecycle !== 'active' || event.type !== 'mostWanted') return;
  const previousTargetId = event.wantedPlayerId;
  if (refreshMostWantedTarget(event, now) && event.wantedPlayerId !== previousTargetId) broadcastEvent(event);
}

function awardEventPlayer(event: CityEvent, playerId: string, score: number, credits: number, reason: string, xpEligible = true): void {
  if (event.rewardsGiven.has(playerId)) return;
  const player = players.get(playerId);
  if (!player || player.tutorialMode || player.cityId !== event.cityId) return;
  if (!progressionEnabled(player)) {
    event.rewardsGiven.add(playerId);
    sendToPlayer(playerId, { type: 'eventReward', eventId: event.id, score: 0, credits: 0, reason: 'PRACTICE — NO REWARDS' });
    return;
  }
  const cargoReward = cargoCreditReward(credits, player.aircraftType, 'event', event.type);
  const reward = rewardWithHeat(playerId, score, cargoReward.credits);
  if (isHumanPilot(player)) {
    const now = Date.now();
    const result = profileStore.awardServerRewardOnce(player.pilotId, `chaos-event:${event.id}`, reward.credits,
      { eventCompletions: 1 }, 'EVENT_REWARD', xpEligible ? { source: 'EVENT', eventId: event.id, cityId: event.cityId, now } : undefined);
    if (!result.awarded) return;
    persistScore(player, reward.score);
    const profile = profileStore.getOrCreate(player.pilotId, player.displayName);
    if (profile) sendProfile(playerId, profile, undefined, undefined, reason);
    if (reward.credits > 0) recordAnalytics(playerId, 'credits_earned', { amount: reward.credits, source: 'event', metadata: { eventType: event.type, mammothCargoBonus: cargoReward.bonusCredits, cargoBonusApplied: cargoReward.applied } });
    recordObjectiveActivity(playerId, 'event');
    if (result.xp) reportPilotXp(playerId, 'EVENT', result.xp, now);
    recordAnalytics(playerId, 'chaos_moment_completed', { source: event.type });
    recordAnalytics(playerId, 'chaos_event_completed', { source:event.type });
    recordAnalytics(playerId, 'chaos_event_reward_claimed', { amount:reward.credits, source:event.type });
  }
  event.rewardsGiven.add(playerId);
  addHeat(playerId, reason.includes('RISK ZONE')
    ? heatGains.riskBank
    : reason.includes('WON') || reason.includes('BOUNTY') || reason.includes('SURVIVED')
      ? heatGains.eventWin
      : 5);
  player.score += reward.score;
  sendToPlayer(playerId, { type: 'eventReward', eventId: event.id, score: reward.score, credits: reward.credits, reason });
  broadcastLeaderboard(event.cityId);
}

function completeLandingChaosEvent(playerId: string, player: PlayerState, airportId: string, grade: ReturnType<typeof landingGradeForScore>, now: number): void {
  const event = cityEvents.get(player.cityId);
  if (!event || !event.participants.has(playerId)) return;
  if (!canCompleteLandingChaosEvent({ eventType:event.type, lifecycle:event.lifecycle, targetAirportId:event.targetAirportId, progress:event.progress.get(playerId) ?? 0 }, airportId)) return;
  const template = eventTemplateFor(event);
  if (!template) return;
  const difficultyBonus = event.type === 'fogApproach' && (grade === 'SMOOTH' || grade === 'PERFECT' || grade === 'LEGENDARY') ? 1.15 : 1;
  awardEventPlayer(event, playerId, Math.round(template.rewardScore * difficultyBonus), Math.round(template.rewardCredits * difficultyBonus), `${eventName(event)} COMPLETE`);
  event.winnerId = playerId;
  event.progress.set(playerId, 2);
  if (progressionEnabled(player)) profileStore.finishChaosEvent(player.pilotId, event.id, 'completed', { airportId, grade }, now);
  missionSignal(playerId, { type:'event', at:now, eventId:event.id, eventType:event.type, result:'completed' });
  setEventTerminal(event, 'completed', now);
}

function randomBetween(minimum: number, maximum: number): number {
  return minimum + Math.floor(Math.random() * (maximum - minimum + 1));
}

function registerChaosAction(playerId: string, action: keyof typeof chaosActionValues, now = Date.now()): void {
  const player = players.get(playerId);
  if (!player || player.lifeState !== 'alive') return;
  if (!progressionEnabled(player)) return;
  const previous = playerChaos.get(playerId) ?? { multiplier: 1, lastAt: 0, pendingCredits: 0 };
  if (previous.lastAction === action && now - previous.lastAt < chaosActionCooldownMs) return;
  const chained = previous.lastAction !== undefined && now - previous.lastAt <= 10_000;
  const multiplier = chained && previous.lastAction !== action ? Math.min(5, previous.multiplier + 1) : 1;
  const baseScore = chaosActionValues[action] * multiplier;
  previous.multiplier = multiplier;
  previous.lastAction = action;
  previous.lastAt = now;
  const heatGain = action === 'nearMiss' ? heatGains.nearMiss : action === 'stunt' ? heatGains.stunt : 0;
  if (heatGain > 0) addHeat(playerId, heatGain, now);
  const reward = rewardWithHeat(playerId, baseScore, 0, now);
  previous.pendingCredits += Math.max(1, Math.floor(reward.score / 50));
  player.score += reward.score;
  persistScore(player, reward.score);
  playerChaos.set(playerId, previous);
  if (action === 'stunt') recordObjectiveActivity(playerId, 'stunt');
  sendToPlayer(playerId, { type: 'chaosState', multiplier, action, score: reward.score, pendingCredits: previous.pendingCredits });
  broadcastLeaderboard(player.cityId);
}

function heatLevel(value: number): number {
  for (let level = heatTiers.length - 1; level > 0; level -= 1) if (value >= heatTiers[level]) return level;
  return 0;
}

function heatMultiplier(level: number): number {
  return heatMultipliers[Math.max(0, Math.min(heatMultipliers.length - 1, level))];
}

function currentHeat(playerId: string, now = Date.now()): PlayerHeat {
  const player = players.get(playerId);
  const existing = playerHeat.get(playerId);
  if (!existing) {
    const initial: PlayerHeat = { value: 0, level: 0, updatedAt: now, lastBroadcastAt: 0, lastDangerAt: 0 };
    playerHeat.set(playerId, initial);
    return initial;
  }
  const elapsed = Math.max(0, now - existing.updatedAt);
  if (elapsed > 0) {
    existing.value = Math.max(0, existing.value - elapsed / 60_000 * heatDecayPerMinute);
    existing.updatedAt = now;
    existing.level = heatLevel(existing.value);
  }
  if (player?.cityId !== 'dallas') {
    existing.value = 0;
    existing.level = 0;
  }
  return existing;
}

function heatSnapshot(playerId: string, now = Date.now()): { playerId: string; value: number; level: number; multiplier: number } {
  const heat = currentHeat(playerId, now);
  return { playerId, value: Math.round(heat.value), level: heat.level, multiplier: heatMultiplier(heat.level) };
}

function broadcastHeat(playerId: string, levelChanged = false, now = Date.now()): void {
  const player = players.get(playerId);
  if (!player) return;
  const heat = currentHeat(playerId, now);
  heat.lastBroadcastAt = now;
  broadcastToCity(player.cityId, { type: 'heatState', ...heatSnapshot(playerId, now), levelChanged });
}

function addHeat(playerId: string, amount: number, now = Date.now()): void {
  const player = players.get(playerId);
  if (!player || player.cityId !== 'dallas' || amount <= 0) return;
  const heat = currentHeat(playerId, now);
  const priorLevel = heat.level;
  heat.value = Math.min(200, heat.value + amount);
  heat.level = heatLevel(heat.value);
  heat.updatedAt = now;
  broadcastHeat(playerId, heat.level !== priorLevel, now);
  if (priorLevel < 3 && heat.level >= 3) recordObjectiveActivity(playerId, 'heat3');
}

function reduceHeatAfterDestruction(playerId: string, now = Date.now()): void {
  const heat = currentHeat(playerId, now);
  const priorLevel = heat.level;
  heat.value *= 0.35;
  heat.level = heatLevel(heat.value);
  heat.updatedAt = now;
  broadcastHeat(playerId, heat.level !== priorLevel, now);
}

function rewardWithHeat(playerId: string, score: number, credits: number, now = Date.now()): { score: number; credits: number; multiplier: number } {
  const multiplier = heatMultiplier(currentHeat(playerId, now).level);
  return { score: Math.round(score * multiplier), credits: Math.round(credits * multiplier), multiplier };
}

function updateCityHeat(now: number): void {
  for (const [pair, lastKillAt] of recentHeatKills) if (now - lastKillAt > heatKillCooldownMs) recentHeatKills.delete(pair);
  for (const [playerId, player] of players) {
    const previousLevel = playerHeat.get(playerId)?.level ?? 0;
    const heat = currentHeat(playerId, now);
    if (previousLevel !== heat.level || now - heat.lastBroadcastAt >= 5_000) broadcastHeat(playerId, previousLevel !== heat.level, now);
    if (player.cityId !== 'dallas' || player.lifeState !== 'alive') continue;
    const speed = Math.hypot(player.velocity.x, player.velocity.y, player.velocity.z);
    const dangerous = speed >= 90 && player.position.y <= 220;
    if (dangerous && now - heat.lastDangerAt >= heatDangerCooldownMs) {
      heat.lastDangerAt = now;
      addHeat(playerId, heatGains.dangerousFlight, now);
    }
  }
}

function territoryStates(cityId: CityId): TerritoryRuntime[] {
  let states = cityTerritoryState.get(cityId);
  if (!states) {
    states = new Map(territoriesForCity(cityId).map((definition) => [definition.id, {
      definition,
      captureProgress: 0,
      contested: false,
      lastRewardAt: 0,
      lastBroadcastAt: 0,
      lastContestedHeatAt: new Map<string, number>(),
    }]));
    cityTerritoryState.set(cityId, states);
  }
  return [...states.values()];
}

function territorySnapshot(cityId: CityId): Array<{ id: string; controllerId?: string; controllerName?: string; capturingPlayerId?: string; defenderBotId?: string; captureProgress: number; contested: boolean; captureContested: boolean }> {
  return territoryStates(cityId).map((territory) => ({
    id: territory.definition.id,
    controllerId: territory.controllerId,
    controllerName: territory.controllerId ? players.get(territory.controllerId)?.displayName : undefined,
    capturingPlayerId: territory.capturingPlayerId,
    defenderBotId: territory.defenderBotId,
    captureProgress: Math.round(territory.captureProgress),
    contested: territory.contested || Boolean(territory.controllerId && territory.capturingPlayerId && territory.capturingPlayerId !== territory.controllerId),
    captureContested: territory.contested,
  }));
}

function broadcastTerritories(cityId: CityId, now = Date.now(), force = false): void {
  const territories = territoryStates(cityId);
  if (!territories.length) return;
  if (!force && territories.every((territory) => now - territory.lastBroadcastAt < 1_000)) return;
  for (const territory of territories) territory.lastBroadcastAt = now;
  broadcastToCity(cityId, { type: 'territoryState', cityId, territories: territorySnapshot(cityId) });
}

const territoryCaptureCeilingAgl = 10_000 * 0.3048;
function territoryCaptureAltitudeEligible(player: PlayerState): boolean {
  const agl = player.position.y - botTerrainHeight(player.cityId, player.position.x, player.position.z);
  return agl >= 0 && agl <= territoryCaptureCeilingAgl;
}

function isTerritoryActive(playerId: string, player: PlayerState, now: number): boolean {
  if (player.tutorialMode || player.lifeState !== 'alive' || !player.hasRespawnTransform || now - player.lastStateAt > 1_500) return false;
  const speed = Math.hypot(player.velocity.x, player.velocity.y, player.velocity.z);
  const chaos = playerChaos.get(playerId);
  const event = cityEvents.get(player.cityId);
  const activeEventParticipant = event?.lifecycle === 'active' && event.participants.has(playerId) && speed >= 6;
  // Meaningful movement/firing/event participation count; a parked player never does.
  return speed >= 12 || now - player.lastFireAt < 3_000 || Boolean(chaos && now - chaos.lastAt < 8_000) || activeEventParticipant;
}

function awardTerritory(playerId: string, territory: TerritoryRuntime, kind: 'capture' | 'control', now: number): void {
  const player = players.get(playerId);
  if (!player) return;
  const key = `${player.cityId}:${territory.definition.id}:${playerId}:${kind}`;
  const cooldown = kind === 'capture' ? territoryCaptureRewardCooldownMs : territoryControlRewardMs;
  if ((territoryRewardCooldown.get(key) ?? 0) > now - cooldown) return;
  territoryRewardCooldown.set(key, now);
  const reward = rewardWithHeat(playerId, kind === 'capture' ? 125 : 35, kind === 'capture' ? 250 : 15, now);
  player.score += reward.score;
  persistScore(player, reward.score);
  if (isHumanPilot(player)) {
    const territoryReward = profileStore.awardServerRewardAndXp(player.pilotId, reward.credits, undefined, 'TERRITORY_REWARD', territory.definition.id,
      kind === 'capture' ? { source: 'TERRITORY', eventId: `${player.cityId}:${territory.definition.id}:${utcDayId(now)}`, cityId: player.cityId, now } : undefined);
    const profile = territoryReward.profile;
    if (profile) sendProfile(playerId, profile, undefined, undefined, kind === 'capture' ? 'Territory Captured' : 'Territory Held');
    if (kind === 'capture') recordObjectiveActivity(playerId, 'territoryCapture');
    if (reward.credits > 0) recordAnalytics(playerId, 'credits_earned', { amount: reward.credits, source: kind === 'capture' ? 'territory_capture' : 'territory_control' }, now);
    if (kind === 'capture') recordAnalytics(playerId, 'territory_captured', { source: territory.definition.id }, now);
    if (kind === 'capture') {
      if (territoryReward.xp) reportPilotXp(playerId, 'TERRITORY', territoryReward.xp, now);
      profileStore.updatePersonalRecord(player.pilotId, 'most_territories', controlledTerritoryIds(playerId, player.cityId).size, player.cityId, now);
    }
  }
  sendToPlayer(playerId, { type: 'territoryReward', territoryId: territory.definition.id, score: reward.score, credits: reward.credits, kind });
  broadcastLeaderboard(player.cityId);
}

function removeTerritoryContribution(playerId: string, releaseOwnership = false): void {
  const touched = new Set<CityId>();
  for (const [cityId, states] of cityTerritoryState) for (const territory of states.values()) {
    if (territory.capturingPlayerId === playerId) {
      territory.capturingPlayerId = undefined;
      territory.captureProgress = 0;
      territory.lastBroadcastAt = 0;
      touched.add(cityId);
    }
    // A connected pilot keeps captured airspace through destruction/respawn.
    // Only a true disconnect/despawn releases the ephemeral session owner;
    // mission hold time still resets on lostFlight/disconnect separately.
    if (releaseOwnership && territory.controllerId === playerId) {
      territory.controllerId = undefined;
      territory.captureProgress = 0;
      territory.lastBroadcastAt = 0;
      touched.add(cityId);
    }
  }
  for (const cityId of touched) broadcastTerritories(cityId);
}

function releaseTerritoryDefender(territory: TerritoryRuntime): void {
  const defender = territory.defenderBotId ? players.get(territory.defenderBotId) : undefined;
  territory.defenderBotId = undefined;
  territory.defenseMissingSince = undefined;
  territory.defenseLastMoveAt = undefined;
  territory.defenseLastPosition = undefined;
  if (defender?.bot) {
    if (stabilityDiagnosticsEnabled) console.info(`TERRITORY_DEFENDER territory=${territory.definition.id} bot=${defender.pilotId} state=released`);
    const wasTemporary = defender.bot.defenseSpawned === true;
    defender.bot.defenseTerritoryId = undefined;
    defender.bot.defenseTargetId = undefined;
    defender.bot.defenseReleaseAt = undefined;
    defender.bot.defenseSpawned = false;
    clearHunterCombat(defender, defender.bot);
    if (wasTemporary) removeBot(defender.pilotId);
  }
}

function logMissingTerritoryDefense(territory: TerritoryRuntime, attackerId: string, reason: string, now: number): void {
  if (!stabilityDiagnosticsEnabled) return;
  territory.defenseMissingSince ??= now;
  if (now - territory.defenseMissingSince < 5_000 || now - (territory.defenseLastDiagnosticAt ?? 0) < 5_000) return;
  territory.defenseLastDiagnosticAt = now;
  console.warn(`TERRITORY_DEFENSE_MISSING territory=${territory.definition.id} owner=${territory.controllerId ?? 'none'} attacker=${attackerId} reason=${reason}`);
}

function updateTerritoryDefense(territory: TerritoryRuntime, attackerId: string | undefined, now: number): void {
  const cityId = territory.definition.cityId;
  const attacker = attackerId ? players.get(attackerId) : undefined;
  const activeAttacker = attacker && !attacker.isBot && attacker.cityId === cityId && attacker.lifeState === 'alive' ? attacker : undefined;
  if (!territory.controllerId || !activeAttacker || territory.controllerId === attackerId) {
    if (territory.defenseAttackerId && !territory.defenderBotId) territory.defenseAttackerId = undefined;
    const defender = territory.defenderBotId ? players.get(territory.defenderBotId)?.bot : undefined;
    if (defender && now < (defender.defenseReleaseAt ?? 0)) return;
    releaseTerritoryDefender(territory);
    territory.defenseAttackerId = undefined;
    territory.defenseNotifiedOwnerId = undefined;
    territory.defenderLostForAttackerId = undefined;
    return;
  }
  const owner = players.get(territory.controllerId);
  if (!owner || owner.lifeState !== 'alive') territory.defenseNotifiedOwnerId = undefined;
  if (territory.defenseAttackerId !== attackerId) {
    territory.defenseAttackerId = attackerId;
    territory.defenseNotifiedOwnerId = undefined;
    territory.defenderLostForAttackerId = undefined;
  }
  if (owner && !owner.isBot && owner.cityId === cityId && owner.lifeState === 'alive' && territory.defenseNotifiedOwnerId !== territory.controllerId) {
    sendToPlayer(territory.controllerId, {
      type: 'territoryNotice', territoryId: territory.definition.id, kind: 'underAttack', attackerName: activeAttacker.displayName,
    });
    territory.defenseNotifiedOwnerId = territory.controllerId;
  }
  const humanOwnerNearby = owner && !owner.isBot && owner.lifeState === 'alive' && owner.cityId === cityId &&
    isTerritoryActive(territory.controllerId, owner, now) && now - owner.lastFireAt < 4_000 &&
    Math.hypot(owner.position.x - activeAttacker.position.x, owner.position.y - activeAttacker.position.y, owner.position.z - activeAttacker.position.z) <=
      Math.min(territoryDefenderOwnerRange, COMBAT_RANGE);
  if (humanOwnerNearby && !territory.defenderBotId) { territory.defenseMissingSince = undefined; return; }

  let defender = territory.defenderBotId ? players.get(territory.defenderBotId) : undefined;
  if (!defender?.bot || defender.lifeState !== 'alive' || defender.bot.defenseTerritoryId !== territory.definition.id) {
    if (defender && defender.lifeState !== 'alive') territory.defenderLostForAttackerId = attackerId;
    if (defender?.bot && defender.bot.defenseTerritoryId === territory.definition.id) {
      const wasTemporary = defender.bot.defenseSpawned === true;
      defender.bot.defenseTerritoryId = undefined;
      defender.bot.defenseTargetId = undefined;
      defender.bot.defenseReleaseAt = undefined;
      defender.bot.defenseSpawned = false;
      territory.defenderBotId = undefined;
      if (wasTemporary) removeBot(defender.pilotId);
    }
    territory.defenderBotId = undefined;
    defender = undefined;
  }
  if (!defender && territory.defenderLostForAttackerId === attackerId) {
    logMissingTerritoryDefense(territory, attackerId!, 'defender_destroyed', now);
    return;
  }
  const pursuerCap = currentHeat(attackerId!, now).level >= 4 || cityEvents.get(cityId)?.wantedPlayerId === attackerId ? 2 : 1;
  const pursuing = [...players.values()].filter((pilot) => pilot.isBot && pilot.cityId === cityId && pilot.lifeState === 'alive' &&
    !pilot.bot?.journeyAttemptId &&
    pilot.bot !== undefined && pilot.bot.combatTargetId === attackerId && isHunterCombatPhase(pilot.bot.phase));
  if (!defender) {
    // An existing Hunter already consumes the pursuer slot. Make that Hunter
    // the explicit defender instead of silently refusing territory defense.
    defender = pursuing.find((pilot) => !pilot.bot?.defenseTerritoryId);
    if (!defender && pursuing.length >= pursuerCap) {
      logMissingTerritoryDefense(territory, attackerId!, 'pursuer_cap_other_territory', now);
      return;
    }
    if (!defender) {
      const candidate = [...players.values()]
        .filter((pilot) => pilot.isBot && pilot.cityId === cityId && pilot.lifeState === 'alive' && pilot.bot &&
          !pilot.bot.journeyAttemptId &&
          !pilot.bot.defenseTerritoryId && !isHunterCombatPhase(pilot.bot.phase) &&
          pilot.position.y - botTerrainHeight(cityId, pilot.position.x, pilot.position.z) >= botCombatClearance)
        .sort((a, b) => Math.hypot(a.position.x - territory.definition.center.x, a.position.z - territory.definition.center.z) -
          Math.hypot(b.position.x - territory.definition.center.x, b.position.z - territory.definition.center.z))[0];
      defender = candidate;
    }
    if (!defender) {
      const cityBots = [...players.values()].filter((pilot) => pilot.isBot && pilot.cityId === cityId && !pilot.bot?.journeyLeader);
      if (cityBots.length >= maxBotsIncludingTemporaryDefenders) {
        const humans = [...players.values()].filter((pilot) => !pilot.isBot && pilot.cityId === cityId);
        const replaceable = cityBots
          .filter((pilot) => pilot.bot && !pilot.bot.journeyAttemptId && !pilot.bot.defenseTerritoryId && !isHunterCombatPhase(pilot.bot.phase) &&
            !territoryStates(cityId).some((state) => state.controllerId === pilot.pilotId))
          .sort((a, b) => {
            const nearest = (pilot: PlayerState) => Math.min(...humans.map((human) =>
              Math.hypot(pilot.position.x - human.position.x, pilot.position.z - human.position.z)));
            return nearest(b) - nearest(a);
          })[0];
        if (replaceable) removeBot(replaceable.pilotId);
      }
      if ([...players.values()].filter((pilot) => pilot.isBot && pilot.cityId === cityId && !pilot.bot?.journeyLeader).length < maxBotsIncludingTemporaryDefenders) {
        const id = createBot(cityId, { territory: territory.definition, attacker: activeAttacker });
        defender = players.get(id);
      }
    }
    if (!defender?.bot) {
      logMissingTerritoryDefense(territory, attackerId!, 'temporary_defender_cap', now);
      return;
    }
    territory.defenderBotId = defender.pilotId;
    territory.defenseLastMoveAt = now;
    territory.defenseLastPosition = { x: defender.position.x, z: defender.position.z };
    defender.bot.defenseTerritoryId = territory.definition.id;
    defender.bot.defenseTargetId = attackerId;
    beginHunterApproach(defender, defender.bot, attackerId!, activeAttacker, now);
    sendToPlayer(attackerId!, { type: 'territoryNotice', territoryId: territory.definition.id, kind: 'defenderInbound' });
    if (stabilityDiagnosticsEnabled) console.info(`TERRITORY_DEFENDER territory=${territory.definition.id} bot=${defender.pilotId} target=${attackerId} state=approach`);
  }
  if (defender.bot!.defenseTargetId !== attackerId || !isHunterCombatPhase(defender.bot!.phase) || defender.bot!.combatTargetId !== attackerId) {
    defender.bot!.defenseTargetId = attackerId;
    beginHunterApproach(defender, defender.bot!, attackerId!, activeAttacker, now);
  }
  defender.bot!.defenseReleaseAt = now + territoryDefenderReleaseMs;
  if (!territory.defenseLastPosition || Math.hypot(defender.position.x - territory.defenseLastPosition.x, defender.position.z - territory.defenseLastPosition.z) >= 50) {
    territory.defenseLastPosition = { x: defender.position.x, z: defender.position.z };
    territory.defenseLastMoveAt = now;
  }
  if (now - (territory.defenseLastMoveAt ?? now) >= 5_000) {
    territory.defenseMissingSince ??= territory.defenseLastMoveAt;
    logMissingTerritoryDefense(territory, attackerId!, 'defender_not_moving', now);
  }
  else territory.defenseMissingSince = undefined;
}

function updateTerritories(now: number): void {
  for (const cityId of cityIds) {
    const cityTerritories = territoryStates(cityId);
    const definitions = cityTerritories.map((territory) => territory.definition);
    for (const [playerId, player] of players) {
      if (player.cityId !== cityId || player.skyDuelMode) continue;
      if (!player.hasRespawnTransform) {
        player.territoryIds.clear();
        continue;
      }
      const membership = territoryMembershipTransition(player.territoryIds, definitions, player.position);
      for (const territoryId of membership.entered) {
        sendToPlayer(playerId, { type: 'territoryNotice', territoryId, kind: 'enter' });
      }
      for (const territoryId of membership.exited) {
        sendToPlayer(playerId, { type: 'territoryNotice', territoryId, kind: 'exit' });
      }
      player.territoryIds = membership.current;
    }
    const activePlayers = [...players.entries()].filter(([playerId, player]) => {
      const attemptId = playerJourneyAttempts.get(playerId);
      if (attemptId && pausedJourneyAttempts.has(attemptId)) return false;
      // A linked siege attempt never contributes to persistent territory ownership,
      // including while its completion or failure screen is still open.
      if (attemptId && (journeyStore.get(player.pilotId, attemptId)?.missionId === journeyDallas18.id ||
        journeyStore.get(player.pilotId, attemptId)?.missionId === journeyDallas21.id)) return false;
      return player.cityId === cityId && !player.skyDuelMode && !player.bot?.journeyLeader &&
        !missionFocusedPlayers.has(playerId) &&
        territoryCaptureAltitudeEligible(player) && isTerritoryActive(playerId, player, now);
    });
    const captureTerritoryByPlayer = new Map(activePlayers.map(([playerId, player]) => {
      const territoryId = primaryTerritoryAt(definitions, player.position)?.id;
      return [playerId, territoryId];
    }));
    let changed = false;
    let urgentChanged = false;
    let ownershipChanged = false;
    for (const territory of cityTerritories) {
      // A summoned defender is a combat threat, not a second capture
      // contributor; its arrival must not freeze the invader's progress.
      const inside = activePlayers.filter(([id, player]) => id !== territory.defenderBotId &&
        (!player.isBot || !territory.controllerId || now >= (territory.aiRecaptureBlockedUntil ?? 0)) &&
        captureTerritoryByPlayer.get(id) === territory.definition.id);
      const humansInside = inside.filter(([, pilot]) => !pilot.isBot);
      const intruder = territory.controllerId ? humansInside.find(([id]) => id !== territory.controllerId)?.[0] : undefined;
      const previousDefenderId = territory.defenderBotId;
      updateTerritoryDefense(territory, intruder, now);
      if (territory.defenderBotId !== previousDefenderId) { changed = true; urgentChanged = true; }
      // Ambient AI and the summoned defender must not veto a human's capture.
      // Multiple opposing humans can still contest each other. With no humans,
      // retain the existing bot-only territory participation rule.
      const contenders = humansInside.length ? humansInside : inside;
      const contested = contenders.length > 1;
      if (territory.contested !== contested) {
        territory.contested = contested;
        changed = true;
        urgentChanged = true;
      }
      if (contested) {
        for (const [playerId] of inside) {
          if (now - (territory.lastContestedHeatAt.get(playerId) ?? 0) >= 15_000) {
            territory.lastContestedHeatAt.set(playerId, now);
            addHeat(playerId, 2, now);
          }
        }
        continue;
      }
      const contributor = contenders[0];
      if (!contributor) {
        if (territory.capturingPlayerId) { territory.capturingPlayerId = undefined; territory.captureProgress = 0; changed = true; urgentChanged = true; }
        continue;
      }
      const [playerId] = contributor;
      if (territory.controllerId === playerId) {
        if (territory.capturingPlayerId) { territory.capturingPlayerId = undefined; territory.captureProgress = 0; changed = true; urgentChanged = true; }
        if (now - territory.lastRewardAt >= territoryControlRewardMs) {
          territory.lastRewardAt = now;
          awardTerritory(playerId, territory, 'control', now);
        }
        continue;
      }
      if (territory.capturingPlayerId !== playerId) {
        territory.capturingPlayerId = playerId;
        territory.captureProgress = 0;
        changed = true;
        urgentChanged = true;
      }
      const defender = territory.defenderBotId ? players.get(territory.defenderBotId) : undefined;
      const owner = territory.controllerId ? players.get(territory.controllerId) : undefined;
      const ownerDefending = owner && !owner.isBot && owner.cityId === cityId && owner.lifeState === 'alive' &&
        isTerritoryActive(territory.controllerId!, owner, now) && now - owner.lastFireAt < 4_000 &&
        Math.hypot(owner.position.x - contributor[1].position.x, owner.position.y - contributor[1].position.y, owner.position.z - contributor[1].position.z) <=
          Math.min(territoryDefenderOwnerRange, COMBAT_RANGE);
      const defenderActive = defender?.lifeState === 'alive' && defender.bot?.defenseTerritoryId === territory.definition.id &&
        defender.bot.defenseTargetId === playerId;
      const captureLimit = territory.controllerId && (defenderActive || ownerDefending) ? 95 : 100;
      territory.captureProgress = Math.min(captureLimit, territory.captureProgress + 100 / (territoryCaptureSeconds * 1000 / territoryTickMs) * territory.definition.captureWeight);
      changed = true;
      if (territory.captureProgress >= 100) {
        releaseTerritoryDefender(territory);
        territory.defenseAttackerId = undefined;
        territory.defenderLostForAttackerId = undefined;
        territory.controllerId = playerId;
        territory.aiRecaptureBlockedUntil = !contributor[1].isBot ? now + territoryAiRecaptureGraceMs : undefined;
        ownershipChanged = true;
        territory.capturingPlayerId = undefined;
        territory.lastRewardAt = now;
        awardTerritory(playerId, territory, 'capture', now);
        missionSignal(playerId, { type: 'territoryCapture', at: now, territoryId: territory.definition.id });
        sendToPlayer(playerId, { type: 'territoryNotice', territoryId: territory.definition.id, kind: 'captured' });
        changed = true;
        urgentChanged = true;
      }
    }
    if (cityId === journeyDallas18.cityId) for (const [playerId, attemptId] of playerJourneyAttempts) {
      if (pausedJourneyAttempts.has(attemptId)) continue;
      const pilot = players.get(playerId);
      if (!pilot || pilot.cityId !== cityId) continue;
      const active = journeyStore.get(pilot.pilotId, attemptId);
      if (active?.missionId !== journeyDallas18.id || active.status !== 'APPROACH' && active.status !== 'RACING') continue;
      const airborne = landingFlightState.get(playerId)?.airborne === true && playerJourneyLoveTakeoff.has(playerId) &&
        !playerJourneyRunwayPrep.has(playerId);
      const moving = isTerritoryActive(playerId, pilot, now) &&
        Math.hypot(pilot.velocity.x, pilot.velocity.y, pilot.velocity.z) >= 12;
      const eligible = airborne && moving && territoryCaptureAltitudeEligible(pilot) &&
        pilot.lifeState === 'alive' && pilot.hasRespawnTransform && now - pilot.lastStateAt <= 1_500;
      if (active.status === 'APPROACH') {
        const valid = eligible && territoryContains(siegeJourneyTerritory, pilot.position);
        const next = journeyStore.updateSiegeCapture(pilot.pilotId, attemptId, valid, performance.now(), now);
        if (next && (next.status !== active.status || Math.floor(next.captureMs / 1_000) !== Math.floor(active.captureMs / 1_000)))
          sendJourneyState(playerId, next);
        continue;
      }
      const hunter = active.targetId ? players.get(active.targetId) : undefined;
      const hunterValid = Boolean(active.targetId && (siegeDefeatedHunters.has(active.targetId) ||
        hunter?.lifeState === 'alive' && hunter.bot?.journeySiege && hunter.bot.journeyAttemptId === attemptId &&
        hunter.bot.journeyTargetPlayerId === playerId && hunter.bot.journeyProvoked &&
        siegeHunterMotion.has(active.targetId)));
      const dx = pilot.position.x - siegeJourneyTerritory.center.x;
      const dz = pilot.position.z - siegeJourneyTerritory.center.z;
      const inside = dx * dx + dz * dz <= journeyDallas18.defenseRadius ** 2;
      const next = journeyStore.updateSiegeDefense(pilot.pilotId, attemptId, eligible && inside && hunterValid,
        performance.now(), now);
      if (next && (next.status !== active.status || Math.floor(next.holdMs / 1_000) !== Math.floor(active.holdMs / 1_000))) {
        sendJourneyState(playerId, next);
        if (next.status === 'COMPLETED') {
          removeJourneyHunter(next);
          sendProfile(playerId, profileStore.getOrCreate(pilot.pilotId, pilot.displayName), undefined, undefined, journeyDallas18.name);
        }
      }
    }
    if (cityId === journeyDallas21.cityId) for (const [playerId, attemptId] of playerJourneyAttempts) {
      if (pausedJourneyAttempts.has(attemptId)) continue;
      const pilot = players.get(playerId);
      if (!pilot || pilot.cityId !== cityId) continue;
      const active = journeyStore.get(pilot.pilotId, attemptId);
      if (active?.missionId !== journeyDallas21.id || active.status !== 'APPROACH' && active.status !== 'RACING') continue;
      const eligible = hasOpenPlayerSocket(playerId) && landingFlightState.get(playerId)?.airborne === true && playerJourneyLoveTakeoff.has(playerId) &&
        !playerJourneyRunwayPrep.has(playerId) && isTerritoryActive(playerId, pilot, now) &&
        Math.hypot(pilot.velocity.x, pilot.velocity.y, pilot.velocity.z) >= 12 &&
        territoryCaptureAltitudeEligible(pilot) && pilot.lifeState === 'alive' &&
        pilot.hasRespawnTransform && now - pilot.lastStateAt <= 1_500;
      const currentTerritory = primaryTerritoryAt([twoFrontAlpha, twoFrontBravo], pilot.position)?.id ?? '';
      const next = journeyStore.updateTwoFronts(pilot.pilotId, attemptId, currentTerritory, eligible, performance.now(), now);
      if (next && (next.status !== active.status ||
        next.captureMs !== active.captureMs || next.holdMs !== active.holdMs)) {
        sendJourneyState(playerId, next);
        if (next.status === 'COMPLETED')
          sendProfile(playerId, profileStore.getOrCreate(pilot.pilotId, pilot.displayName), undefined, undefined, journeyDallas21.name);
      }
    }
    if (changed) broadcastTerritories(cityId, now, urgentChanged);
    if (ownershipChanged) tickMissions(now);
  }
}

function bankChaos(playerId: string, reason: string): void {
  const state = playerChaos.get(playerId);
  const player = players.get(playerId);
  if (!state || !player || !progressionEnabled(player) || state.pendingCredits <= 0) return;
  const reward = rewardWithHeat(playerId, 0, state.pendingCredits);
  const credits = reward.credits;
  state.pendingCredits = 0;
  const profile = profileStore.awardServerReward(player.pilotId, credits);
  if (profile) sendProfile(playerId, profile, undefined, undefined, reason || 'Stunt Combo');
  if (credits > 0) recordAnalytics(playerId, 'credits_earned', { amount: credits, source: 'chaos' });
  sendToPlayer(playerId, { type: 'chaosReward', credits, reason });
}

function expireChaos(now: number): void {
  for (const [playerId, state] of playerChaos) {
    if (now - state.lastAt < 10_000) continue;
    bankChaos(playerId, 'CHAOS STREAK BANKED');
    playerChaos.delete(playerId);
  }
}

function createCityEvent(cityId: CityId, now: number, forced?: ChaosQaEvent): CityEvent | undefined {
  const templates = eventTemplatesForCity(cityId);
  if (!templates.length) return undefined;
  const forcedSpec = forced ? qaEventSpec(forced) : undefined;
  const previousType = lastEventTypes.get(cityId);
  const candidates = templates.filter((template) => template.type !== previousType);
  const hasHighHeatPilot = cityId === 'dallas' && [...players.entries()].some(([playerId, player]) => player.cityId === cityId && currentHeat(playerId, now).level >= 4);
  const weighted = (choices: readonly CityEventTemplate[]): CityEventTemplate | undefined => {
    const total = choices.reduce((sum, choice) => sum + (choice.weight ?? (choice.rarity === 'rare' ? 5 : 100)), 0);
    let pick = Math.random() * total;
    for (const choice of choices) { pick -= choice.weight ?? (choice.rarity === 'rare' ? 5 : 100); if (pick <= 0) return choice; }
    return choices[choices.length - 1];
  };
  const template = forcedSpec
    ? templates.find((candidate) => candidate.type === forcedSpec.type)
    : hasHighHeatPilot && candidates.some((candidate) => candidate.type === 'mostWanted') && Math.random() < 0.65
      ? candidates.find((candidate) => candidate.type === 'mostWanted')
      : weighted(candidates) ?? templates[0];
  if (!template) return undefined;
  lastEventTypes.set(cityId, template.type);
  const activeAt = now + randomBetween(eventAvailableMinMs, eventAvailableMaxMs);
  const event: CityEvent = {
    id: randomUUID(), cityId, type: template.type, lifecycle: 'available', createdAt: now,
    activeAt, expiresAt: activeAt + eventActiveMs,
    cooldownUntil: 0, objective: { ...template.objective }, route: template.route?.map((point) => ({ ...point })) ?? [],
    routeSpeed: template.routeSpeed ?? 0, eventRouteIds: [...(template.eventRouteIds ?? [])], eventAircraftType: template.eventAircraftType, eventCombatMode: template.eventCombatMode,
    participants: new Set(), progress: new Map(), rewardsGiven: new Set(), damageContribution: new Map(), rare: template.rarity === 'rare', bossHealth: template.bossHealth, bossMaxHealth: template.bossHealth, riskRadius: isRiskEvent(template.type) ? 900 : 260,
    goldenDrop: forcedSpec?.goldenDrop ?? (template.type === 'supplyDrop' && Math.random() < 0.06),
    qaShortTimer: forced !== undefined,
    riskMode: template.type === 'stormLanding' ? 'storm' : forcedSpec?.riskMode,
    targetAirportId: template.targetAirportId,
    pickupAirportId: template.pickupAirportId,
    lastBroadcastAt: 0,
  };
  cityEvents.set(cityId, event);
  broadcastEvent(event);
  return event;
}

function setEventTerminal(event: CityEvent, lifecycle: Extract<DynamicEventLifecycle, 'completed' | 'failed'>, now: number): void {
  if (event.lifecycle !== 'active') return;
  event.lifecycle = lifecycle;
  event.cooldownUntil = now + eventTerminalMs;
  broadcastEvent(event);
  for (const playerId of event.participants) {
    const player = players.get(playerId);
    if (!isHumanPilot(player)) continue;
    if (progressionEnabled(player)) profileStore.finishChaosEvent(player.pilotId, event.id, lifecycle, { progress:event.progress.get(playerId) ?? 0 }, now);
    if (lifecycle === 'failed') recordAnalytics(playerId, 'chaos_event_failed', { source:event.type }, now);
  }
  // Winners have already completed their attempt through the shared event
  // signal. Everyone else needs a fresh attempt for a later event.
  for (const [playerId, player] of players) {
    if (!isHumanPilot(player) || player.cityId !== event.cityId) continue;
    const active = profileStore.missionState(player.pilotId, player.cityId)?.active;
    const mission = active && missionForCity(player.cityId, active.missionId);
    if (!active || mission?.type !== 'event' || mission.requirements.eventType !== event.type) continue;
    const profile = profileStore.abandonMission(player.pilotId, player.cityId, active.attemptId);
    if (!profile) continue;
    sendProfile(playerId, profile);
    sendToPlayer(playerId, { type: 'missionFailed', missionId: mission.id, reason: lifecycle === 'failed' ? 'EVENT ENDED' : 'EVENT COMPLETED BY ANOTHER PILOT' });
    if (lifecycle === 'failed' && (['HARD', 'VERY HARD', 'EXTREME'].includes(mission.difficulty) || ['aceIntercept', 'vipEscort'].includes(event.type)) &&
        profileStore.recordFirehawkMissionFailure(player.pilotId, mission.id, now)) {
      sendToPlayer(playerId, { type: 'firehawkPromotionReady', missionId: mission.id });
    }
  }
}

function distanceToEventObjective(player: PlayerState, event: CityEvent): number {
  return Math.hypot(player.position.x - event.objective.x, player.position.y - event.objective.y, player.position.z - event.objective.z);
}

function activateEvent(event: CityEvent, now: number): void {
  event.lifecycle = 'active';
  event.activeAt = now;
  const qaDuration = ['stormLanding','fogApproach','cargoRush','soloAirportSprint'].includes(event.type) ? 120_000 : 20_000;
  event.expiresAt = now + (event.qaShortTimer ? qaDuration : (eventTemplateFor(event)?.durationMs ?? eventActiveMs));
  event.objective = eventRoutePosition(event, now);
  if (isRiskEvent(event.type) && !event.riskMode) {
    event.riskMode = event.type === 'cityEmergency'
      ? 'storm'
      : (['storm', 'lowAltitude', 'highAltitude', 'downtownDanger'] as const)[Math.floor(Math.random() * 4)];
  }
  if (event.type === 'mostWanted') {
    // Do not announce a bounty until it has a connected, transformed, and
    // attackable real player behind it.
    if (!refreshMostWantedTarget(event, now)) return;
  }
  const template = eventTemplateFor(event);
  if (!template) {
    setEventTerminal(event, 'failed', now);
    return;
  }
  broadcastToCity(event.cityId, { type: 'eventAnnouncement', eventId: event.id, name: eventName(event), reward: Math.round(template.rewardCredits * (event.goldenDrop ? 2 : 1) * bountyMultiplier(event)), expiresAt: event.expiresAt });
  for (const [playerId, player] of players) if (isHumanPilot(player) && player.cityId === event.cityId) {
    recordAnalytics(playerId, 'chaos_moment_started', { source: event.type }, now);
    recordAnalytics(playerId, 'chaos_event_offered', { source: event.type }, now);
  }
  broadcastEvent(event);
}

function updateActiveEvent(event: CityEvent, now: number): void {
  const template = eventTemplateFor(event);
  if (!template) {
    setEventTerminal(event, 'failed', now);
    return;
  }
  if (event.type === 'emergencyEscort' || event.type === 'cargoConvoy' || event.type === 'vipEscort' || event.type === 'aceIntercept') event.objective = eventRoutePosition(event, now);
  if (event.type === 'mostWanted') {
    const previousTargetId = event.wantedPlayerId;
    if (!refreshMostWantedTarget(event, now)) return;
    if (event.wantedPlayerId !== previousTargetId) broadcastEvent(event);
    if (now >= event.expiresAt) {
      const bounty = bountyMultiplier(event);
      const survivor = players.get(event.wantedPlayerId!);
      if (survivor) recordMostWantedSurvival(event.wantedPlayerId!, event, now);
      awardEventPlayer(event, event.wantedPlayerId!, template.rewardScore * bounty, template.rewardCredits * bounty, 'BOUNTY SURVIVED');
      setEventTerminal(event, 'completed', now);
    }
    return;
  }

  if (event.type === 'aceIntercept') {
    if (now >= event.expiresAt) setEventTerminal(event, 'failed', now);
    return;
  }

  if (event.type === 'stormLanding' || event.type === 'fogApproach' || event.type === 'soloAirportSprint' || event.type === 'cargoRush') {
    if (event.type === 'cargoRush' && event.pickupAirportId) {
      const pickup = airportForCity(event.cityId, event.pickupAirportId);
      if (pickup) for (const playerId of event.participants) {
        const player = players.get(playerId);
        if (!player || player.cityId !== event.cityId || player.lifeState !== 'alive' || (event.progress.get(playerId) ?? 0) >= 1) continue;
        if (Math.hypot(player.position.x - pickup.x, player.position.z - pickup.z) <= 420) {
          const progress = advanceCargoRush({ eventType:event.type, lifecycle:event.lifecycle, progress:event.progress.get(playerId) ?? 0 }, true);
          event.progress.set(playerId, progress);
          if (isHumanPilot(player)) profileStore.updateChaosEventProgress(player.pilotId, event.id, progress);
          const destination = event.targetAirportId ? airportForCity(event.cityId, event.targetAirportId) : undefined;
          sendToPlayer(playerId, { type:'eventProgress', eventId:event.id, message:'CARGO LOADED', progress:1, target:destination ? { x:destination.x, z:destination.z } : undefined });
        }
      }
    }
    if (now >= event.expiresAt) setEventTerminal(event, 'failed', now);
    return;
  }

  if (event.type === 'vipEscort') {
    for (const [playerId, player] of players) {
      if (player.cityId === event.cityId && player.lifeState === 'alive' && distanceToEventObjective(player, event) <= 480) {
        event.participants.add(playerId);
        event.progress.set(playerId, event.progress.get(playerId) ?? 0);
      }
    }
    let completed = false;
    for (const playerId of event.participants) {
      const player = players.get(playerId);
      if (!player || player.cityId !== event.cityId || player.lifeState !== 'alive') continue;
      const checkpoint = Math.floor(event.progress.get(playerId) ?? 0);
      const point = event.route[Math.min(checkpoint, event.route.length - 1)];
      if (!point || Math.hypot(player.position.x - point.x, player.position.y - point.y, player.position.z - point.z) > 480) continue;
      event.progress.set(playerId, checkpoint + 1);
      if (checkpoint + 1 >= event.route.length) completed = true;
    }
    if (completed) {
      for (const playerId of event.participants) {
        const progress = event.progress.get(playerId) ?? 0;
        if (progress > 0) awardEventPlayer(event, playerId, Math.round(template.rewardScore * Math.min(1, 0.35 + progress / event.route.length * 0.65)), Math.round(template.rewardCredits * Math.min(1, 0.35 + progress / event.route.length * 0.65)), 'VIP ESCORT COMPLETE', progress >= event.route.length);
        if (progress >= event.route.length) missionSignal(playerId, { type: 'event', at: now, eventId: event.id, eventType: event.type, result: 'completed' });
      }
      setEventTerminal(event, 'completed', now);
    } else if (now >= event.expiresAt) setEventTerminal(event, 'failed', now);
    return;
  }

  if (isRiskEvent(event.type)) {
    for (const [playerId, player] of players) {
      if (player.cityId !== event.cityId || player.lifeState !== 'alive') continue;
      const horizontalDistance = Math.hypot(player.position.x - event.objective.x, player.position.z - event.objective.z);
      const altitudeValid = event.riskMode === 'highAltitude'
        ? player.position.y >= event.objective.y - 380
        : event.riskMode === 'lowAltitude'
          ? player.position.y <= event.objective.y + 160
          : true;
      const inside = horizontalDistance <= event.riskRadius && altitudeValid;
      const previous = event.progress.get(playerId) ?? 0;
      if (inside) {
        event.participants.add(playerId);
        event.progress.set(playerId, previous + eventTickMs / 1000);
        registerChaosAction(playerId, 'risk', now);
      } else if (previous >= 2) {
        const multiplier = Math.min(5, Math.max(1, Math.floor(previous / 3)));
        awardEventPlayer(event, playerId, template.rewardScore * multiplier, template.rewardCredits * multiplier, `RISK ZONE BANK x${multiplier}`, false);
      }
    }
    if (now >= event.expiresAt) setEventTerminal(event, 'completed', now);
    return;
  }

  // Routes and drops are opt-in by proximity as well as the compact JOIN
  // control. A player naturally entering the first Sky Rush gate is in.
  for (const [playerId, player] of players) {
    if (player.cityId !== event.cityId || player.lifeState !== 'alive') continue;
    if (distanceToEventObjective(player, event) <= (isGateEvent(event.type) ? 150 : 420)) {
      event.participants.add(playerId);
      event.progress.set(playerId, event.progress.get(playerId) ?? 0);
    }
  }

  let completedBy: string | undefined;
  for (const playerId of event.participants) {
    const player = players.get(playerId);
    if (!player || player.cityId !== event.cityId || player.lifeState !== 'alive') continue;
    const gateIndex = isGateEvent(event.type) ? Math.floor(event.progress.get(playerId) ?? 0) : 0;
    const objective = isGateEvent(event.type) ? event.route[Math.min(gateIndex, event.route.length - 1)] : event.objective;
    const withinObjective = Math.hypot(player.position.x - objective.x, player.position.y - objective.y, player.position.z - objective.z) <= (isGateEvent(event.type) ? 150 : 420);
    if (!withinObjective) continue;
    if (isGateEvent(event.type)) {
      const progress = gateIndex + 1;
      event.progress.set(playerId, progress);
      registerChaosAction(playerId, 'eventGate', now);
      if (progress >= event.route.length) completedBy = playerId;
    } else {
      const progress = (event.progress.get(playerId) ?? 0) + eventTickMs / 1000;
      event.progress.set(playerId, progress);
      if (progress >= (event.type === 'supplyDrop' ? 2 : 12)) completedBy = playerId;
    }
  }
  if (completedBy) {
    const goldenMultiplier = event.goldenDrop ? 2 : 1;
    awardEventPlayer(event, completedBy, template.rewardScore * goldenMultiplier, template.rewardCredits * goldenMultiplier, `${eventName(event)} WON`);
    if (event.type === 'goldenSkyRun') missionSignal(completedBy, { type: 'event', at: now, eventId: event.id, eventType: event.type, result: 'completed' });
    for (const playerId of event.participants) {
      if (playerId !== completedBy && (event.progress.get(playerId) ?? 0) > 1) awardEventPlayer(event, playerId, 80, 60, `${template.name} PARTICIPATION`, false);
    }
    event.winnerId = completedBy;
    setEventTerminal(event, 'completed', now);
    return;
  }
  if (now >= event.expiresAt) setEventTerminal(event, 'failed', now);
}

function updateDynamicEvents(now: number): void {
  for (const cityId of cityIds) {
    let event = cityEvents.get(cityId);
    if (!event) {
      createCityEvent(cityId, now);
      continue;
    }
    if (event.lifecycle === 'available' && now >= event.activeAt) activateEvent(event, now);
    else if (event.lifecycle === 'active') updateActiveEvent(event, now);
    else if ((event.lifecycle === 'completed' || event.lifecycle === 'failed') && now >= event.cooldownUntil) {
      event.lifecycle = 'cooldown';
      event.cooldownUntil = now + randomBetween(eventCooldownMinMs, eventCooldownMaxMs);
      broadcastEvent(event);
    } else if (event.lifecycle === 'cooldown' && now >= event.cooldownUntil) {
      cityEvents.delete(cityId);
      event = undefined;
    }
    if (event && now - event.lastBroadcastAt >= (event.type === 'aceIntercept' ? 100 : eventBroadcastMs)) broadcastEvent(event);
  }
  expireChaos(now);
}

function runChaosQaCommand(player: PlayerState, action: unknown, requestedEvent: unknown): void {
  if (!player.chaosQaEnabled || player.cityId !== 'dallas') return;
  const now = Date.now();
  const current = cityEvents.get(player.cityId);
  if (action === 'reset') {
    cityEvents.delete(player.cityId);
    broadcastToCity(player.cityId, { type: 'eventClear' });
    return;
  }
  if (action === 'end') {
    if (!current) return;
    if (current.lifecycle === 'available') activateEvent(current, now);
    setEventTerminal(current, 'failed', now);
    return;
  }
  const allowed: readonly ChaosQaEvent[] = ['mostWanted', 'supplyDrop', 'goldenDrop', 'skyRush', 'stormRisk', 'lowAltitudeRisk', 'highAltitudeRisk', 'downtownRisk', 'aceIntercept', 'vipEscort', 'goldenSkyRun', 'cityEmergency', 'stormLanding', 'fogApproach', 'cargoRush', 'soloAirportSprint'];
  if (action !== 'start' || typeof requestedEvent !== 'string' || !allowed.includes(requestedEvent as ChaosQaEvent)) return;
  // This intentionally goes through the production factory and activation
  // path, only replacing randomized template selection in DEV QA.
  cityEvents.delete(player.cityId);
  const event = createCityEvent(player.cityId, now, requestedEvent as ChaosQaEvent);
  if (event) activateEvent(event, now);
}

function joinDynamicEvent(playerId: string, player: PlayerState, requestedEventId?: string): void {
  const event = cityEvents.get(player.cityId);
  if (!event || (event.lifecycle !== 'available' && event.lifecycle !== 'active') || (requestedEventId && requestedEventId !== event.id)) return;
  event.participants.add(playerId);
  event.progress.set(playerId, event.progress.get(playerId) ?? 0);
  if (isHumanPilot(player)) profileStore.saveActiveChaosEvent(player.pilotId, { id:event.id, type:event.type, cityId:event.cityId, startedAt:event.activeAt, expiresAt:event.expiresAt, target:{ targetAirportId:event.targetAirportId, pickupAirportId:event.pickupAirportId } });
  recordAnalytics(playerId, 'chaos_event_accepted', { source:event.type });
  broadcastEvent(event);
}

function handleWantedDestruction(killerId: string, victimId: string, now: number): void {
  const victim = players.get(victimId);
  if (!victim) return;
  const event = cityEvents.get(victim.cityId);
  if (!event || event.lifecycle !== 'active' || event.type !== 'mostWanted' || event.wantedPlayerId !== victimId) return;
  const pairKey = `${killerId}:${victimId}`;
  if ((recentBountyKills.get(pairKey) ?? 0) > now - 120_000) return;
  recentBountyKills.set(pairKey, now);
  const template = eventTemplateFor(event);
  if (!template) return;
  const bounty = bountyMultiplier(event);
  awardEventPlayer(event, killerId, template.rewardScore * bounty, template.rewardCredits * bounty, 'MOST WANTED BOUNTY');
  event.winnerId = killerId;
  setEventTerminal(event, 'completed', now);
}

function removeProjectile(projectileId: string): void {
  const projectile = projectiles.get(projectileId);
  if (!projectile || !projectiles.delete(projectileId)) return;
  const removed={type:'projectileRemove',projectileId};
  if (projectile.skyDuelPractice) sendToPlayer(projectile.ownerId, removed);
  else if (projectile.skyDuelMatchId) {
    const session = skyDuelSessions.get(projectile.skyDuelMatchId);
    if (session) sendSkyDuel(session, removed);
  } else if(projectile.privateAttemptId)sendToPlayer(projectile.privateRecipientId ?? projectile.ownerId,removed);else broadcastToCity(projectile.cityId,removed);
}

function removePlayerProjectiles(playerId: string): void {
  for (const projectile of projectiles.values()) {
    if (projectile.ownerId === playerId) removeProjectile(projectile.projectileId);
  }
}

function updateRespawningPlayers(now: number): void {
  for (const [playerId, player] of players) {
    if (pausedJourneyPlayers.has(playerId) || pausedTrainingPlayers.has(playerId)) continue;
    if (
      player.lifeState !== 'respawning' ||
      !player.hasRespawnTransform ||
      now < player.spawnProtectedUntil
    ) continue;
    player.lifeState = 'alive';
    const stateMessage = {
      type: 'playerState',
      playerId,
      lifeState: player.lifeState,
      health: player.health,
      position: player.position,
      rotation: player.rotation,
      aircraftType: player.aircraftType,
      equippedCosmetics: player.profile?.cosmetics?.equipped ?? {},
      cityId: player.cityId,
      displayName: player.displayName,
      isBot: player.isBot,
      boostActive: player.boostActive,
      maxHealth: player.skyDuelMode ? skyDuelHealth : maxHealthForAircraft(player.aircraftType),
    };
    const session = player.skyDuelMatchId && skyDuelSessions.get(player.skyDuelMatchId);
    if (session) sendSkyDuel(session, stateMessage);
    else if (player.skyDuelMode) sendToPlayer(playerId, stateMessage);
    else broadcastToCity(player.cityId, stateMessage);
    if (!player.skyDuelMode) broadcastLeaderboard(player.cityId);
  }
}

// The event-boss test still uses its current point against the projectile segment.
function distanceToSegmentSquared(
  point: Vector3,
  startX: number,
  startY: number,
  startZ: number,
  end: Vector3,
): number {
  const segmentX = end.x - startX;
  const segmentY = end.y - startY;
  const segmentZ = end.z - startZ;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY + segmentZ * segmentZ;
  const projection = lengthSquared === 0
    ? 0
    : Math.max(
        0,
        Math.min(
          1,
          ((point.x - startX) * segmentX +
            (point.y - startY) * segmentY +
            (point.z - startZ) * segmentZ) /
            lengthSquared,
        ),
      );
  const closestX = startX + segmentX * projection;
  const closestY = startY + segmentY * projection;
  const closestZ = startZ + segmentZ * projection;
  const dx = point.x - closestX;
  const dy = point.y - closestY;
  const dz = point.z - closestZ;
  return dx * dx + dy * dy + dz * dz;
}

// Test both moving objects over the same server tick. At Redspear Boost speeds
// a four-point target sample can skip a crossing between samples. Relative-
// motion closest approach is continuous and keeps the existing hit radius.
function sweptProjectileHit(
  player: PlayerState,
  startX: number,
  startY: number,
  startZ: number,
  end: Vector3,
  deltaSeconds: number,
  visualScale = 1,
): boolean {
  const hitRadius = aircraftHitRadii[player.aircraftType] * visualScale * projectileHitRadiusMultiplier + projectileVisualRadius;
  // The stored transform is the target's end-of-tick position. Rewind it to
  // the segment start before testing relative swept motion; otherwise fast
  // targets are offset by an extra tick of travel and clean shots can miss.
  const relativeX = startX - (player.position.x - player.velocity.x * deltaSeconds);
  const relativeY = startY - (player.position.y - player.velocity.y * deltaSeconds);
  const relativeZ = startZ - (player.position.z - player.velocity.z * deltaSeconds);
  const motionX = end.x - startX - player.velocity.x * deltaSeconds;
  const motionY = end.y - startY - player.velocity.y * deltaSeconds;
  const motionZ = end.z - startZ - player.velocity.z * deltaSeconds;
  const motionSquared = motionX * motionX + motionY * motionY + motionZ * motionZ;
  const closestTime = motionSquared > 0
    ? Math.max(0, Math.min(1, -(relativeX * motionX + relativeY * motionY + relativeZ * motionZ) / motionSquared))
    : 0;
  const dx = relativeX + motionX * closestTime;
  const dy = relativeY + motionY * closestTime;
  const dz = relativeZ + motionZ * closestTime;
  return dx * dx + dy * dy + dz * dz <= hitRadius * hitRadius;
}

function normalize(vector: Vector3): Vector3 {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function rotateLocalYxz(vector: Vector3, rotation: Transform['rotation']): Vector3 {
  const c1 = Math.cos(rotation.x * 0.5);
  const c2 = Math.cos(rotation.y * 0.5);
  const c3 = Math.cos(rotation.z * 0.5);
  const s1 = Math.sin(rotation.x * 0.5);
  const s2 = Math.sin(rotation.y * 0.5);
  const s3 = Math.sin(rotation.z * 0.5);
  // Exact Three.js Quaternion.setFromEuler() YXZ order: roll is preserved for
  // off-axis sockets and inverted attitudes rather than being silently lost.
  const qx = s1 * c2 * c3 + c1 * s2 * s3;
  const qy = c1 * s2 * c3 - s1 * c2 * s3;
  const qz = c1 * c2 * s3 - s1 * s2 * c3;
  const qw = c1 * c2 * c3 + s1 * s2 * s3;
  const ix = qw * vector.x + qy * vector.z - qz * vector.y;
  const iy = qw * vector.y + qz * vector.x - qx * vector.z;
  const iz = qw * vector.z + qx * vector.y - qy * vector.x;
  const iw = -qx * vector.x - qy * vector.y - qz * vector.z;
  return {
    x: ix * qw + iw * -qx + iy * -qz - iz * -qy,
    y: iy * qw + iw * -qy + iz * -qx - ix * -qz,
    z: iz * qw + iw * -qz + ix * -qy - iy * -qx,
  };
}

function forwardDirection(transform: Pick<Transform, 'rotation'>): Vector3 {
  return normalize(rotateLocalYxz({ x: 0, y: 0, z: -1 }, transform.rotation));
}

function muzzleTransform(transform: Transform): { position: Vector3; direction: Vector3 } {
  const socket = aircraftPresentationMuzzleSockets[transform.aircraftType];
  const localPosition = rotateLocalYxz(socket.position, transform.rotation);
  return {
    position: {
      x: transform.position.x + localPosition.x,
      y: transform.position.y + localPosition.y,
      z: transform.position.z + localPosition.z,
    },
    direction: normalize(rotateLocalYxz(socket.forward, transform.rotation)),
  };
}

function validFireTransform(player: PlayerState, candidate: unknown): Transform | undefined {
  if (!candidate || typeof candidate !== 'object') return undefined;
  const value = candidate as Partial<Transform>;
  if (!value.position || !value.rotation || value.aircraftType !== player.aircraftType) return undefined;
  const values = [value.position.x, value.position.y, value.position.z, value.rotation.x, value.rotation.y, value.rotation.z];
  if (!values.every(Number.isFinite)) return undefined;
  const speed = Math.hypot(player.velocity.x, player.velocity.y, player.velocity.z);
  const envelope = aircraftFlightEnvelope[player.aircraftType];
  const tolerance = 20 + Math.min(speed, envelope.maxSpeed * envelope.boostMaxSpeed) * 0.35;
  const positionDelta = Math.hypot(
    value.position.x - player.position.x,
    value.position.y - player.position.y,
    value.position.z - player.position.z,
  );
  if (positionDelta > tolerance) return undefined;
  const proposed = forwardDirection(value as Transform);
  if (dot(proposed, forwardDirection(player)) < 0.65) return undefined;
  return value as Transform;
}

function dot(left: Vector3, right: Vector3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function closestLockTarget(
  ownerId: string,
  player: PlayerState,
  direction: Vector3,
  now: number,
  origin: Vector3 = player.position,
): [string, PlayerState] | undefined {
  let closest: [string, PlayerState] | undefined;
  let closestScore = Number.POSITIVE_INFINITY;
  let retained: [string, PlayerState] | undefined;
  let retainedScore = Number.POSITIVE_INFINITY;
  for (const [targetId, target] of players) {
    if (
      targetId === ownerId ||
      target.entityType !== 'player' ||
      target.cityId !== player.cityId ||
      !tutorialCombatPairAllowed(ownerId, player, targetId, target) ||
      !sameCombatContext(player, target) ||
      target.lifeState !== 'alive' ||
      now < target.spawnProtectedUntil ||
      now - target.lastStateAt > combatTransformFreshMs ||
      focusedBotInteractionExcluded(ownerId, player, targetId, target)
    ) continue;
    const offset = {
      x: target.position.x - origin.x,
      y: target.position.y - origin.y,
      z: target.position.z - origin.z,
    };
    const distance = Math.hypot(offset.x, offset.y, offset.z);
    if (distance > COMBAT_RANGE) continue;
    const angle = Math.acos(Math.max(-1, Math.min(1, dot(direction, normalize(offset)))));
    if (distance < 0.000001 || angle > AIM_ENVELOPE) continue;
    const score = aimTargetScore(angle, distance);
    if (targetId === player.assistedAim?.targetId) { retained = [targetId, target]; retainedScore = score; }
    if (score < closestScore) {
      closest = [targetId, target];
      closestScore = score;
    }
  }
  return retained && retainedScore <= closestScore + AIM_SWITCH_MARGIN ? retained : closest;
}

function targetInAircraftSpace(transform: Transform, target: Pick<PlayerState,'position'>): Vector3 {
  const offset = { x: target.position.x - transform.position.x, y: target.position.y - transform.position.y, z: target.position.z - transform.position.z };
  return {
    x: dot(offset, rotateLocalYxz({ x: 1, y: 0, z: 0 }, transform.rotation)),
    y: dot(offset, rotateLocalYxz({ x: 0, y: 1, z: 0 }, transform.rotation)),
    z: -dot(offset, forwardDirection(transform)),
  };
}

function updateAssistedAim(ownerId: string, owner: PlayerState, now: number, manualHorizontal: unknown, manualVertical: unknown): void {
  const aim = owner.assistedAim ??= { x: 0, y: 0, updatedAt: now };
  const transportId = playerJourneyAttempts.get(ownerId), transport = transportId ? transportEncounters.get(transportId) : undefined;
  const candidate = (!transport || transport.durationMs === journeyDallas08.timeLimitMs || transport.durationMs === journeyDallas09.timeLimitMs || transport.durationMs === journeyDallas12.timeLimitMs && transport.fortressGunsEnabled === false) && owner.lifeState === 'alive' && now - owner.lastStateAt <= combatTransformFreshMs
    ? closestLockTarget(ownerId, owner, forwardDirection(owner), now) : undefined;
  const goal = { x: 0, y: 0 };
  aim.targetId = candidate?.[0];
  if (candidate) {
    const local = targetInAircraftSpace(owner, candidate[1]);
    aimGoal(local.x, local.y, local.z, goal);
  }
  if(transport && !candidate && transport.fortressGunsEnabled !== false && transport.playerId===ownerId && owner.lifeState==='alive' && now-transport.startedAt<transport.durationMs){
    const pose=transportPose(now-transport.startedAt,transport.altitude,transport.durationMs);
    const fortress=transport.fortressTurrets;
    const possible:('left'|'right'|'core')[]=fortress
      ? fortress[0]<=0 && fortress[1]<=0 ? ['core'] : [fortress[0]>0?'left':null,fortress[1]>0?'right':null].filter((side):side is 'left'|'right'=>side!==null)
      : [];
    const forward=forwardDirection(owner);
    const point=possible.length ? possible.map(side=>transportFortressTarget(pose,side)).sort((a,b)=>
      dot({x:b.x-owner.position.x,y:b.y-owner.position.y,z:b.z-owner.position.z},forward)/Math.hypot(b.x-owner.position.x,b.y-owner.position.y,b.z-owner.position.z)
      -dot({x:a.x-owner.position.x,y:a.y-owner.position.y,z:a.z-owner.position.z},forward)/Math.hypot(a.x-owner.position.x,a.y-owner.position.y,a.z-owner.position.z))[0]!
      : {x:pose.x,y:pose.y+12,z:pose.z};
    const offset={x:point.x-owner.position.x,y:point.y-owner.position.y,z:point.z-owner.position.z};
    const distance=Math.hypot(offset.x,offset.y,offset.z);
    if(distance>0 && distance<=COMBAT_RANGE){
      const direction={x:offset.x/distance,y:offset.y/distance,z:offset.z/distance},speed=ballisticShotSpeed(owner.velocity,direction),v=pose.velocity;
      const qa=v.x*v.x+v.y*v.y+v.z*v.z-speed*speed,qb=2*(offset.x*v.x+offset.y*v.y+offset.z*v.z),qc=distance*distance,disc=qb*qb-4*qa*qc;
      const lead=disc>=0 && qa<0?Math.min(COMBAT_RANGE/speed,Math.max(0,(-qb-Math.sqrt(disc))/(2*qa))):0;
      const local=targetInAircraftSpace(owner,{position:{x:point.x+v.x*lead,y:point.y,z:point.z+v.z*lead}});
      if(aimGoal(local.x,local.y,local.z,goal))aim.targetId=`transport:${transport.attemptId}`;
    }
  }
  if (owner.lifeState === 'alive') biasAim(goal, manualHorizontal, manualVertical);
  stepAim(aim, goal, (now - aim.updatedAt) / 1000, AIM_ENVELOPE);
  aim.updatedAt = now;
  const targetId = candidate && validDynamicTarget(ownerId, owner, candidate[0], now) ? candidate[0] : undefined;
  setServerLock(ownerId, owner, targetId, true);
}

function validDynamicTarget(ownerId: string, owner: PlayerState, targetId: string, now: number, transform: Transform = owner): PlayerState | undefined {
  const aim = owner.assistedAim;
  const target = players.get(targetId);
  if (!aim || aim.targetId !== targetId || now - aim.updatedAt > 500 ||
      owner.lifeState !== 'alive' || now - owner.lastStateAt > combatTransformFreshMs ||
      !target || targetId === ownerId || target.entityType !== 'player' || target.cityId !== owner.cityId ||
      !sameCombatContext(owner, target) ||
      focusedBotInteractionExcluded(ownerId, owner, targetId, target) ||
      !tutorialCombatPairAllowed(ownerId, owner, targetId, target) ||
      target.lifeState !== 'alive' || now < target.spawnProtectedUntil ||
      now - target.lastStateAt > combatTransformFreshMs) return undefined;
  const local = targetInAircraftSpace(transform, target);
  if (Math.hypot(local.x, local.y, local.z) > COMBAT_RANGE || !insideDynamicLock(local.x, local.y, local.z, aim)) return undefined;
  return target;
}

// The lock displayed to the shooter and the eligibility check at trigger time
// share one authoritative predicate.
function currentLockedTarget(
  ownerId: string,
  owner: PlayerState,
  targetId: string | undefined,
  now: number,
  fireTransform?: Transform,
): PlayerState | undefined {
  if (!targetId || owner.lockedTargetId !== targetId) return undefined;
  const transform = fireTransform ?? owner;
  return validDynamicTarget(ownerId, owner, targetId, now, transform);
}

function canFire(player: PlayerState, now: number): boolean {
  return fireBlockReason(player, now) === undefined;
}

function fireBlockReason(player: PlayerState, now: number): 'lifecycle' | 'cooldown' | undefined {
  if (player.entityType !== 'player' || player.lifeState !== 'alive') return 'lifecycle';
  if (player.skyDuelMode && !player.skyDuelPractice &&
    (!player.skyDuelMatchId || !['active', 'overtime'].includes(skyDuelSessions.get(player.skyDuelMatchId)?.phase ?? ''))) return 'lifecycle';
  const interval = player.bot?.journeyEscortMissionId === journeyDallas08.id || player.bot?.journeyEscortMissionId === journeyDallas09.id || player.bot?.journeyEscortMissionId === journeyDallas10.id
    ? journeyDallas08.escortShotSpacingMs : fireIntervalMs(player.aircraftType);
  if (now - player.lastFireAt < interval) return 'cooldown';
  return undefined;
}

function logFireBlocked(playerId: string, reason: string, now = Date.now()): void {
  if (!stabilityDiagnosticsEnabled) return;
  const key = `${playerId}:${reason}`;
  if (now - (fireBlockedDebugAt.get(key) ?? 0) < 1_000) return;
  fireBlockedDebugAt.set(key, now);
  console.info(`[combat] FIRE_BLOCKED ${reason} player=${playerId.slice(0, 8)}`);
}

function logLockShotReject(
  ownerId: string,
  owner: PlayerState,
  targetId: string | undefined,
  fireTransform: Transform | undefined,
  reason: string,
  now = Date.now(),
): void {
  if (!stabilityDiagnosticsEnabled) return;
  const key = `${ownerId}:lock-shot:${reason}`;
  if (now - (fireBlockedDebugAt.get(key) ?? 0) < 1_000) return;
  fireBlockedDebugAt.set(key, now);
  const transform = fireTransform ?? owner;
  const target = targetId ? players.get(targetId) : undefined;
  const offset = target ? {
    x: target.position.x - transform.position.x,
    y: target.position.y - transform.position.y,
    z: target.position.z - transform.position.z,
  } : undefined;
  const distance = offset ? Math.hypot(offset.x, offset.y, offset.z) : Number.NaN;
  const angle = offset && distance > 0
    ? Math.acos(Math.max(-1, Math.min(1, dot(forwardDirection(transform), normalize(offset)))))
    : Number.NaN;
  console.info(`[combat] LOCK_SHOT_REJECT ${reason} distance=${Number.isFinite(distance) ? distance.toFixed(1) : 'n/a'}m angle=${Number.isFinite(angle) ? (angle * 180 / Math.PI).toFixed(2) : 'n/a'}deg player=${ownerId.slice(0, 8)}`);
}

function validatedShotAim(player: PlayerState, reference: unknown, now: number): { x: number; y: number } {
  const neutral = { x: 0, y: 0 };
  if (!reference || typeof reference !== 'object') return neutral;
  const ref = reference as { from?: number; to?: number; blend?: number };
  if (!Number.isFinite(ref.blend) || ref.blend! < 0 || ref.blend! > 1) return neutral;
  const from = player.aimSamples?.find(sample => sample.id === ref.from);
  const to = player.aimSamples?.find(sample => sample.id === ref.to);
  if (!from || !to || from.id > to.id || now - from.at > 600 || now - to.at > 500) return neutral;
  return interpolateAim(from, to, ref.blend!, neutral);
}

function createProjectile(playerId: string, player: PlayerState, clientShotId?: string, fireTransform?: Transform, aim = { x: 0, y: 0 }, damageOverride?: number): boolean {
  const now = Date.now();
  if (
    !canFire(player, now) ||
    projectiles.size >= maxProjectiles
  ) {
    return false;
  }
  player.lastFireAt = now;

  const transform = fireTransform ?? player;
  const muzzle = muzzleTransform(transform);
  const privateId=playerJourneyAttempts.get(playerId);
  const privateAttempt=privateId?journeyStore.get(player.pilotId,privateId):undefined;
  const direction = normalize(rotateLocalYxz({ x: aim.x, y: aim.y, z: -1 }, transform.rotation));
  const projectile: ProjectileState = {
    projectileId: randomUUID(),
    ownerId: playerId,
    cityId: player.cityId,
    damage: damageOverride ?? projectileDamageForAircraft(player.aircraftType),
    position: muzzle.position,
    direction,
    traveled: 0,
    speed: ballisticShotSpeed(player.velocity, direction),
    mode: 'ballistic',
    privateAttemptId: privateAttempt?.missionId===journeyDallas07.id || privateAttempt?.missionId===journeyDallas08.id || privateAttempt?.missionId===journeyDallas09.id || privateAttempt?.missionId===journeyDallas10.id || privateAttempt?.missionId===journeyDallas11.id || privateAttempt?.missionId===journeyDallas12.id ? privateId
      : player.bot?.journeyRearGuardEscort ? player.bot.journeyAttemptId : undefined,
    privateRecipientId: player.bot?.journeyRearGuardEscort ? player.bot.journeyTargetPlayerId : playerId,
    skyDuelMatchId: player.skyDuelMatchId,
    skyDuelPractice: player.skyDuelPractice,
    clientShotId,
  };
  projectiles.set(projectile.projectileId, projectile);
  const spawned = {
    type: 'projectileSpawn',
    projectileId: projectile.projectileId,
    ownerId: projectile.ownerId,
    position: projectile.position,
    direction: projectile.direction,
    speed: projectile.speed,
    mode: projectile.mode,
    clientShotId: projectile.clientShotId,
  };
  if (projectile.skyDuelPractice) sendToPlayer(playerId, spawned);
  else if (projectile.skyDuelMatchId) {
    const session = skyDuelSessions.get(projectile.skyDuelMatchId);
    if (session) sendSkyDuel(session, spawned);
  } else if(projectile.privateAttemptId)sendToPlayer(projectile.privateRecipientId!,spawned);else broadcastToCity(projectile.cityId,spawned);
  return true;
}

let lastProjectileStateBroadcastAt = 0;

function broadcastProjectileStates(now: number): void {
  if (projectiles.size === 0 || now - lastProjectileStateBroadcastAt < projectileStateBroadcastMs) return;
  lastProjectileStateBroadcastAt = now;
  const statesByCity = new Map<CityId, Array<{
    projectileId: string;
    position: Vector3;
    direction: Vector3;
    mode: ProjectileMode;
  }>>();
  const privateStatesByOwner=new Map<string,ProjectileState[]>();
  const duelStates = new Map<string, ProjectileState[]>();
  for (const projectile of projectiles.values()) {
    if (projectile.skyDuelPractice) {
      const batch = privateStatesByOwner.get(projectile.ownerId) ?? [];
      batch.push(projectile); privateStatesByOwner.set(projectile.ownerId, batch); continue;
    }
    if (projectile.skyDuelMatchId) {
      const batch = duelStates.get(projectile.skyDuelMatchId) ?? [];
      batch.push(projectile); duelStates.set(projectile.skyDuelMatchId, batch); continue;
    }
    if(projectile.privateAttemptId){const recipient=projectile.privateRecipientId ?? projectile.ownerId;const batch=privateStatesByOwner.get(recipient)??[];batch.push(projectile);privateStatesByOwner.set(recipient,batch);continue;}
    const states = statesByCity.get(projectile.cityId) ?? [];
    states.push({
      projectileId: projectile.projectileId,
      position: projectile.position,
      direction: projectile.direction,
      mode: projectile.mode,
    });
    statesByCity.set(projectile.cityId, states);
  }
  for(const [owner,batch]of privateStatesByOwner)sendToPlayer(owner,{type:'projectileStates',projectiles:batch.map(p=>({projectileId:p.projectileId,position:p.position,direction:p.direction,mode:p.mode}))});
  for (const [id, batch] of duelStates) {
    const session = skyDuelSessions.get(id);
    if (session) sendSkyDuel(session, { type: 'projectileStates', projectiles: batch.map(p => ({
      projectileId: p.projectileId, position: p.position, direction: p.direction, mode: p.mode,
    })) });
  }
  for (const [cityId, projectiles] of statesByCity) {
    broadcastToCity(cityId, { type: 'projectileStates', projectiles });
  }
}

function applyCombatHit(ownerId: string, victimId: string, cityId: CityId, now: number, damage: number, shotDistance = 0): boolean {
  const victim = players.get(victimId);
  const owner = players.get(ownerId);
  if (
    !owner || !victim || victimId === ownerId || victim.entityType !== 'player' ||
    victim.cityId !== cityId || victim.lifeState !== 'alive' || now < victim.spawnProtectedUntil || playerJourneyRunwayPrep.has(victimId) ||
    focusedBotInteractionExcluded(ownerId, owner, victimId, victim) ||
    !tutorialCombatPairAllowed(ownerId, owner, victimId, victim) || !sameCombatContext(owner, victim)
  ) return false;
  if (owner.skyDuelMatchId) {
    const session = skyDuelSessions.get(owner.skyDuelMatchId);
    if (!session) return false;
    const dealt = Math.min(victim.health, damage);
    victim.health -= dealt;
    sendSkyDuel(session, { type: 'damage', playerId: victimId, shooterId: ownerId,
      health: victim.health, maxHealth: skyDuelHealth, damage: dealt });
    if (victim.health === 0) {
      markPlayerDestroyed(victimId, victim, now);
      sendSkyDuel(session, { type: 'destroyed', cause: 'combat', playerId: victimId,
        position: victim.position, aircraftType: victim.aircraftType, killerId: ownerId,
        killerDisplayName: owner.displayName, victimDisplayName: victim.displayName,
        killerScore: 0, killerReward: 0 });
      skyDuelTakedown(victimId, ownerId, now);
    }
    return true;
  }
  if ((owner.bot?.journeyTargetPlayerId === victimId && !owner.bot.journeyRearGuardEscort && !insideJourneyHunterArena(victim.position)) ||
    (victim.bot?.journeyTargetPlayerId === ownerId && !victim.bot.journeyRearGuardEscort && !insideJourneyHunterArena(owner.position))) return false;
  if (victim.bot?.journeyAce) {
    const activeAttemptId = playerJourneyAttempts.get(ownerId);
    const activeAttempt = activeAttemptId ? journeyStore.get(owner.pilotId, activeAttemptId) : undefined;
    if (!aceDamageAuthorized({ shooterId: ownerId, assignedPilotId: victim.bot.journeyTargetPlayerId ?? '',
      activeAttemptId, bossAttemptId: victim.bot.journeyAttemptId!, activeTargetId: activeAttempt?.targetId ?? null,
      bossId: victimId, attemptStatus: activeAttempt?.status,
      tookOffFromLove: playerJourneyLoveTakeoff.has(ownerId), runwayPreparation: playerJourneyRunwayPrep.has(ownerId) })) return false;
    if (victim.bot.journeyLegendary && (activeAttempt?.missionId !== journeyDallas24.id ||
      activeAttempt.legendaryPhase !== 'ACE')) return false;
  }
  if (victim.bot?.journeyCrossfire) {
    const attemptId = playerJourneyAttempts.get(ownerId);
    const active = attemptId ? journeyStore.get(owner.pilotId, attemptId) : undefined;
    if (victim.bot.journeyTargetPlayerId !== ownerId || active?.missionId !== journeyDallas16.id ||
      active.attemptId !== victim.bot.journeyAttemptId || active.status !== 'RACING' ||
      active.targetId !== victimId && active.secondaryTargetId !== victimId) return false;
  }
  if (victim.bot?.journeyRearGuardEscort) {
    const attemptId = playerJourneyAttempts.get(ownerId);
    const active = attemptId ? journeyStore.get(owner.pilotId, attemptId) : undefined;
    if (victim.bot.journeyTargetPlayerId !== ownerId ||
      (active?.missionId !== journeyDallas08.id && active?.missionId !== journeyDallas09.id && active?.missionId !== journeyDallas10.id && active?.missionId !== journeyDallas12.id) ||
      active.attemptId !== victim.bot.journeyAttemptId || active.status !== 'RACING' ||
      active.deadlineAt === null || now >= active.deadlineAt ||
      (active.missionId === journeyDallas12.id && active.finalPhase !== 'ESCORTS') ||
      (active.targetId !== victimId && active.secondaryTargetId !== victimId &&
      !reinforcementWaves.get(active.attemptId)?.ids.includes(victimId))) return false;
  }
  if (victim.bot?.journeyBreakout) {
    const attemptId = playerJourneyAttempts.get(ownerId);
    const active = attemptId ? journeyStore.get(owner.pilotId, attemptId) : undefined;
    if (victim.bot.journeyTargetPlayerId !== ownerId || active?.missionId !== journeyDallas19.id ||
      active.attemptId !== victim.bot.journeyAttemptId || active.status !== 'RACING' || active.targetId !== victimId) return false;
  }
  if (victim.bot?.journeySiege) {
    const attemptId = playerJourneyAttempts.get(ownerId);
    const active = attemptId ? journeyStore.get(owner.pilotId, attemptId) : undefined;
    if (victim.bot.journeyTargetPlayerId !== ownerId || active?.missionId !== journeyDallas18.id ||
      active.attemptId !== victim.bot.journeyAttemptId || active.status !== 'RACING' || active.targetId !== victimId) return false;
  }
  if (victim.bot?.journeyDoubleOrdinal) {
    const attemptId = playerJourneyAttempts.get(ownerId);
    const active = attemptId ? journeyStore.get(owner.pilotId, attemptId) : undefined;
    if (victim.bot.journeyTargetPlayerId !== ownerId || active?.missionId !== journeyDallas23.id ||
      active.attemptId !== victim.bot.journeyAttemptId || active.status !== 'RACING' ||
      (victim.bot.journeyDoubleOrdinal === 1
        ? active.doublePhase !== 'FIRST_FIGHT' || active.targetId !== victimId
        : active.doublePhase !== 'FINAL_FIGHT' || active.secondaryTargetId !== victimId || active.repairCollectedAt === null)) return false;
  }

  // The training target only accepts a hit during the FIRE lesson. A lucky
  // early ballistic shot must not destroy the lesson target or skip LOCK.
  if(victim.trainingOwnerId&&ownerId===victim.trainingOwnerId&&
    !profileStore.trainingTargetFireAllowed(owner.pilotId))return false;

  if (cityId === 'milwaukee' && !owner.isBot && victim.bot) owner.milwaukeeBotsProvoked = true;
  const damageDealt = Math.min(victim.health, damage);
  victim.health -= damageDealt;
  if (victim.health > 0 && !owner.isBot) provokeJourneyHunter(ownerId, owner, victimId, now);
  if (stabilityDiagnosticsEnabled && players.get(ownerId)?.bot?.defenseTerritoryId) {
    console.info(`DEFENDER_HIT target=${victimId} health=${victim.health} territory=${players.get(ownerId)!.bot!.defenseTerritoryId}`);
  }
  airportRepairStays.delete(victimId);
  const damageMessage = {
    type: 'damage', playerId: victimId, shooterId: ownerId, health: victim.health,
    maxHealth: transportEscortHealth(victim.bot) ?? (victim.bot?.journeyAce ? journeyDallas15.bossHealth : maxHealthForAircraft(victim.aircraftType)), damage: damageDealt,
  };
  if (victim.bot?.journeyRearGuardEscort && victim.bot.journeyTargetPlayerId) sendToPlayer(victim.bot.journeyTargetPlayerId, damageMessage);
  else if (victim.trainingOwnerId) sendToPlayer(victim.trainingOwnerId, damageMessage);
  else broadcastToCity(cityId, damageMessage);
  if (victim.health > 0 && victim.bot?.journeyAttemptId) {
    for (const [playerId, attemptId] of playerJourneyAttempts) {
      if (attemptId !== victim.bot.journeyAttemptId) continue;
      const pilot = players.get(playerId);
      const active = pilot && journeyStore.get(pilot.pilotId, attemptId);
      if (active?.targetId === victimId || active?.missionId === journeyDallas23.id &&
        active.secondaryTargetId === victimId && active.doublePhase === 'FINAL_FIGHT') sendJourneyState(playerId, active);
    }
  }
  if (victim.health !== 0) return true;

  if (victim.trainingOwnerId) {
    const trainingOwnerId = victim.trainingOwnerId;
    if(ownerId===trainingOwnerId&&(profileStore.trainingEvidence(owner.pilotId)&2)!==0)profileStore.recordTrainingEvidence(owner.pilotId,4);
    if(ownerId===trainingOwnerId)completeServerTutorialStep(trainingOwnerId,owner,'fire',now);
    victim.lifeState = 'destroyed';
    removePlayerProjectiles(victimId);
    clearLocksForTarget(victimId);
    players.delete(victimId);
    sendToPlayer(trainingOwnerId, {
      type: 'destroyed', cause: 'combat', playerId: victimId, position: victim.position, aircraftType: victim.aircraftType,
      killerId: ownerId, killerDisplayName: owner.displayName, victimDisplayName: victim.displayName, killerScore: owner.score, killerReward: 0,
    });
    sendToPlayer(trainingOwnerId, { type: 'tutorialSignal', signal: 'targetHit' });
    setTimeout(()=>{
      const currentOwner=players.get(trainingOwnerId);
      if(currentOwner?.tutorialMode&&profileStore.tutorialStepsResolved(currentOwner.pilotId))createTrainingTarget(trainingOwnerId,currentOwner);
    },1_500);
    return true;
  }

  markPlayerDestroyed(victimId, victim, now);
  if (victim.bot?.journeyRearGuardEscort && victim.bot.journeyAttemptId) {
    const active = journeyStore.get(owner.pilotId, victim.bot.journeyAttemptId);
    if (active) {
      if (active.missionId === journeyDallas12.id) {
        const bothDestroyed = finalInterceptEscortsCleared(active.targetId, active.secondaryTargetId,
          id => players.get(id)?.lifeState === 'alive');
        const advanced = journeyStore.advanceFinalIntercept(owner.pilotId, active.attemptId, bothDestroyed, now);
        if (advanced) {
          const encounter = transportEncounters.get(active.attemptId);
          if (encounter?.crossfire) { encounter.fortressGunsEnabled = true; encounter.crossfire.nextBurstAt = now + 2_000; }
          removePlayerProjectiles(ownerId);
        }
        sendJourneyState(ownerId, advanced ?? active);
      } else sendJourneyState(ownerId, active);
    }
  }
  if (victim.bot?.journeyCrossfire && victim.bot.journeyAttemptId) {
    const attemptId = victim.bot.journeyAttemptId;
    const defeated = crossfireDefeatedHunters.get(attemptId) ?? new Set<string>();
    defeated.add(victimId);
    crossfireDefeatedHunters.set(attemptId, defeated);
    crossfireFireCoordinators.get(attemptId)?.revoke(victimId, now);
    crossfireHunterMotion.delete(victimId);
    const active = journeyStore.get(owner.pilotId, attemptId);
    if (active) sendJourneyState(ownerId, active);
  }
  if (victim.bot?.journeyBreakout && victim.bot.journeyAttemptId) {
    breakoutDefeatedHunters.add(victimId);
    breakoutHunterMotion.delete(victimId);
    const linked = playerJourneyAttempts.get(ownerId);
    if (linked === victim.bot.journeyAttemptId) {
      const active = journeyStore.get(owner.pilotId, linked);
      if (active?.missionId === journeyDallas19.id && active.targetId === victimId) sendJourneyState(ownerId, active);
    }
  }
  if (victim.bot?.journeySiege && victim.bot.journeyAttemptId) {
    siegeDefeatedHunters.add(victimId);
    siegeHunterMotion.delete(victimId);
    const linked = playerJourneyAttempts.get(ownerId);
    if (linked === victim.bot.journeyAttemptId) {
      const active = journeyStore.get(owner.pilotId, linked);
      if (active?.missionId === journeyDallas18.id && active.targetId === victimId) sendJourneyState(ownerId, active);
    }
  }
  const killer = owner;
  if (killer?.entityType !== 'player') return true;
  const heatKillKey = `${ownerId}:${victimId}`;
  const linkedAttemptId = playerJourneyAttempts.get(ownerId);
  const linkedAttempt = linkedAttemptId ? journeyStore.get(killer.pilotId, linkedAttemptId) : undefined;
  const campaignTargetDefeat = Boolean(victim.bot?.journeyAttemptId && victim.bot.journeyTargetPlayerId === ownerId);
  const journeyHunterKill = !killer.isBot && victim.bot?.journeyAttemptId === linkedAttemptId && linkedAttempt?.targetId === victimId &&
    (linkedAttempt.missionId === journeyDallas15.id && victim.bot?.journeyAce) &&
    victim.bot?.journeyTargetPlayerId === ownerId
    ? journeyStore.completeHunter(killer.pilotId, linkedAttemptId!, victimId, now) : undefined;
  if (journeyHunterKill) sendJourneyState(ownerId, journeyHunterKill);
  if (!killer.isBot && victim.bot?.journeyLegendary && linkedAttempt?.missionId === journeyDallas24.id &&
    victim.bot.journeyAttemptId === linkedAttemptId && victim.bot.journeyTargetPlayerId === ownerId) {
    const result = journeyStore.defeatLegendaryAce(killer.pilotId, linkedAttemptId!, victimId);
    if (result) sendJourneyState(ownerId, result);
  }
  if (!killer.isBot && victim.bot?.journeyDoubleOrdinal && linkedAttempt?.missionId === journeyDallas23.id &&
    victim.bot.journeyAttemptId === linkedAttemptId && victim.bot.journeyTargetPlayerId === ownerId) {
    const result = victim.bot.journeyDoubleOrdinal === 1
      ? journeyStore.defeatDoubleFirst(killer.pilotId, linkedAttemptId!, victimId, doubleHeartNearPilot(killer))
      : journeyStore.defeatDoubleSecond(killer.pilotId, linkedAttemptId!, victimId, now);
    if (result) {
      sendJourneyState(ownerId, result);
      if (result.status === 'COMPLETED') sendProfile(ownerId,
        profileStore.getOrCreate(killer.pilotId, killer.displayName), undefined, undefined, journeyDallas23.name);
    }
  }
  const eligibleForReward = isHumanPilot(killer) && progressionEnabled(killer) && (recentHeatKills.get(heatKillKey) ?? 0) <= now - heatKillCooldownMs;
  if (eligibleForReward) {
    recentHeatKills.set(heatKillKey, now);
    // Bot takedowns remain a small score/credit reward, never a renewable
    // Heat/combo source. Human-versus-human combat retains the full path.
    if (!victim.isBot) {
      addHeat(ownerId, heatGains.kill, now);
      registerChaosAction(ownerId, 'hit', now);
    }
  }
  if (eligibleForReward && !campaignTargetDefeat) missionSignal(ownerId, { type: 'kill', at: now, targetId: victimId, isBot: victim.isBot, valid: true, controlledTerritories: controlledTerritoryIds(ownerId, killer.cityId) });
  const rewardScale = victim.isBot ? botKillRewardMultiplier : 1;
  const baseKillReward = eligibleForReward ? rewardWithHeat(ownerId, 500 * rewardScale, 200 * rewardScale, now) : { score: 0, credits: 0, multiplier: 1 };
  const killReward = campaignTargetDefeat ? { ...baseKillReward, credits: 0 } : baseKillReward;
  killer.score += killReward.score;
  persistScore(killer, killReward.score);
  if (isHumanPilot(killer)) {
    if (eligibleForReward) { const metrics = flightAnalytics.get(ownerId); if (metrics) metrics.kills += 1; recordAnalytics(ownerId, 'combat_kill', { source: victim.isBot ? 'bot' : 'pilot' }, now); }
    const killerReward = campaignTargetDefeat || !progressionEnabled(killer) ? undefined
      : profileStore.awardServerRewardAndXp(killer.pilotId, killReward.credits, { kills: victim.isBot ? 0 : 1 }, 'COMBAT_REWARD', undefined,
        eligibleForReward && victim.isBot && !killer.skyDuelMode && !killer.skyDuelPractice
          ? { source: 'AI_KILL', eventId: `${victimId}:${now}`, cityId: killer.cityId, now } : undefined);
    const killerProfile = campaignTargetDefeat ? profileStore.getOrCreate(killer.pilotId, killer.displayName) : killerReward?.profile;
    if (killerProfile) sendProfile(ownerId, killerProfile, undefined, undefined, victim.isBot ? 'AI Pilot Destroyed' : 'Enemy Destroyed');
    if (killerProfile && killReward.credits > 0) recordAnalytics(ownerId, 'credits_earned', { amount: killReward.credits, source: victim.isBot ? 'bot_combat' : 'player_combat' }, now);
    if (killerReward?.xp) reportPilotXp(ownerId, 'AI_KILL', killerReward.xp, now);
    if (eligibleForReward && shotDistance > 0 && profileStore.updatePersonalRecord(killer.pilotId, 'longest_kill', shotDistance, killer.cityId, now)) {
      recordAnalytics(ownerId, 'personal_record_broken', { metadata: { recordType: 'longest_kill', value: Math.round(shotDistance) } }, now);
      sendProfile(ownerId, profileStore.getOrCreate(killer.pilotId, killer.displayName));
    }
    if (eligibleForReward && !victim.isBot) recordObjectiveActivity(ownerId, 'kill');
  }
  const destroyedMessage = {
    type: 'destroyed', cause: 'combat', playerId: victimId, position: victim.position, aircraftType: victim.aircraftType, killerId: ownerId, killerDisplayName: killer.displayName, victimDisplayName: victim.displayName, killerScore: killer.score, killerReward: killReward.score,
  };
  if (victim.bot?.journeyRearGuardEscort) sendToPlayer(ownerId, destroyedMessage);
  else broadcastToCity(cityId, destroyedMessage);
  broadcastLeaderboard(cityId);
  if (victim.bot?.journeyAttemptId) removeBot(victimId);
  updateKing(cityId, cityKings.get(cityId) === victimId ? ownerId : undefined);
  handleWantedDestruction(ownerId, victimId, now);
  const pvp = challengeForPlayer(ownerId);
  if (pvp?.mode === 'dogfight' && (pvp.challengerId === victimId || pvp.opponentId === victimId)) completePvpChallenge(pvp, ownerId, now);
  return true;
}

function markPlayerDestroyed(victimId: string, victim: PlayerState, now: number): void {
  if (victim.skyDuelMode) {
    victim.lifeState = 'destroyed';
    victim.health = 0;
    setServerLock(victimId, victim);
    clearLocksForTarget(victimId);
    removePlayerProjectiles(victimId);
    return;
  }
  // Mark destruction before another shot/collision can inspect this player.
  victim.lifeState = 'destroyed';
  failPlayerJourney(victimId, 'CRASHED', now);
  missionSignal(victimId, { type: 'lostFlight', at: now });
  victim.health = 0;
  reduceHeatAfterDestruction(victimId, now);
  playerChaos.delete(victimId);
  activeChallenges.delete(victimId);
  removeTerritoryContribution(victimId);
  const activeRiskZone = cityEvents.get(victim.cityId);
  if (activeRiskZone?.lifecycle === 'active' && activeRiskZone.type === 'riskZone') {
    activeRiskZone.progress.delete(victimId);
    activeRiskZone.participants.delete(victimId);
  }
  if (isHumanPilot(victim)) {
    flushFlightRecords(victimId, victim);
    recordAnalytics(victimId, 'crash', { source: 'destruction' }, now);
    if (flightAnalytics.has(victimId)) recordAnalytics(victimId, 'flight_crashed', { source: 'combat' }, now);
    const victimProfile = progressionEnabled(victim) ? profileStore.awardServerReward(victim.pilotId, 0, { deaths: 1 }) : undefined;
    if (victimProfile) {
      const boundaryProfile = profileStore.consumeExpiredFighterTrial(victim.pilotId, now) ?? victimProfile;
      victim.profile = boundaryProfile;
      sendProfile(victimId, boundaryProfile);
    }
  } else if (victim.bot) {
    victim.bot.phase = 'respawn';
    victim.bot.respawnAt = now + 7_000;
  }
  setServerLock(victimId, victim);
  clearLocksForTarget(victimId);
  removePlayerProjectiles(victimId);
}

function applyAircraftCollision(firstId: string, secondId: string, now: number): boolean {
  const first = players.get(firstId), second = players.get(secondId);
  if (!first || !second || first.tutorialMode || second.tutorialMode || playerJourneyRunwayPrep.has(firstId) || playerJourneyRunwayPrep.has(secondId) || firstId === secondId || first.cityId !== second.cityId ||
      focusedBotInteractionExcluded(firstId, first, secondId, second) ||
      !sameCombatContext(first, second) ||
      first.entityType !== 'player' || second.entityType !== 'player' ||
      first.lifeState !== 'alive' || second.lifeState !== 'alive' ||
      !first.hasRespawnTransform || !second.hasRespawnTransform ||
      now < first.spawnProtectedUntil || now < second.spawnProtectedUntil ||
      now - first.lastStateAt > combatTransformFreshMs || now - second.lastStateAt > combatTransformFreshMs) return false;
  // Parked pilots cannot collide while taxiing or taking off.
  if (runwayOrTaxiSpawnArea(first) || runwayOrTaxiSpawnArea(second)) return false;
  const relativeAllowance = Math.min(30, (Math.hypot(first.velocity.x, first.velocity.y, first.velocity.z) +
    Math.hypot(second.velocity.x, second.velocity.y, second.velocity.z)) * 0.1);
  const distance = Math.hypot(first.position.x - second.position.x, first.position.y - second.position.y, first.position.z - second.position.z);
  const visibleRadius = remoteAircraftCollisionRadius(second.aircraftType, distance);
  if (distance > visibleRadius + relativeAllowance) return false;
  if (first.skyDuelMatchId) {
    const session = skyDuelSessions.get(first.skyDuelMatchId);
    if (!session) return false;
    markPlayerDestroyed(firstId, first, now);
    markPlayerDestroyed(secondId, second, now);
    session.respawnA = now + competitiveModes.skyDuel.respawnMs;
    session.respawnB = now + competitiveModes.skyDuel.respawnMs;
    for (const [victimId, killerId, victim, killer] of [
      [firstId, secondId, first, second], [secondId, firstId, second, first],
    ] as const) sendSkyDuel(session, { type: 'destroyed', cause: 'collision', playerId: victimId,
      position: victim.position, aircraftType: victim.aircraftType, killerId,
      killerDisplayName: killer.displayName, victimDisplayName: victim.displayName,
      killerScore: 0, killerReward: 0 });
    return true;
  }
  markPlayerDestroyed(firstId, first, now);
  markPlayerDestroyed(secondId, second, now);
  broadcastToCity(first.cityId, { type: 'destroyed', cause: 'collision', playerId: firstId, position: first.position, aircraftType: first.aircraftType, killerId: secondId, killerDisplayName: second.displayName, victimDisplayName: first.displayName, killerScore: second.score, killerReward: 0 });
  broadcastToCity(first.cityId, { type: 'destroyed', cause: 'collision', playerId: secondId, position: second.position, aircraftType: second.aircraftType, killerId: firstId, killerDisplayName: first.displayName, victimDisplayName: second.displayName, killerScore: first.score, killerReward: 0 });
  broadcastLeaderboard(first.cityId);
  updateKing(first.cityId);
  handleWantedDestruction(secondId, firstId, now);
  handleWantedDestruction(firstId, secondId, now);
  return true;
}

function createAssistedShot(
  playerId: string,
  player: PlayerState,
  targetId: string,
  clientShotId: string | undefined,
  fireTransform: Transform | undefined,
  shotAim: { x: number; y: number },
): boolean {
  const now = Date.now();
  const target = currentLockedTarget(playerId, player, targetId, now, fireTransform);
  if (!target || !canFire(player, now)) return false;
  const local = targetInAircraftSpace(fireTransform ?? player, target);
  if (!insideDynamicLock(local.x, local.y, local.z, shotAim)) return false;
  player.lastFireAt = now;
  sendIncomingFire(targetId, playerId);
  const muzzle = muzzleTransform(fireTransform ?? player);
  const assistedShot = {
    type: 'assistedShot',
    shotId: randomUUID(),
    ownerId: playerId,
    targetId,
    origin: muzzle.position,
    targetPosition: target.position,
    clientShotId,
  };
  if (player.skyDuelMatchId) {
    const session = skyDuelSessions.get(player.skyDuelMatchId);
    if (session) sendSkyDuel(session, assistedShot);
  } else if (target.bot?.journeyRearGuardEscort) sendToPlayer(playerId, assistedShot);
  else broadcastToCity(player.cityId, assistedShot);
  // A server-valid lock is an assisted hit.  Damage can only fail here if a
  // concurrent lifecycle transition made the target invalid after validation;
  // do not turn that already-emitted assisted shot into a second ballistic one.
  if (!applyCombatHit(playerId, targetId, player.cityId, now, projectileDamageForAircraft(player.aircraftType), Math.hypot(local.x, local.y, local.z))) {
    logLockShotReject(playerId, player, targetId, fireTransform, 'damage_state_changed', now);
  }
  return true;
}

function applyEventAircraftHit(ownerId: string, cityId: CityId, start: Vector3, end: Vector3, now: number, damage: number): boolean {
  const event = cityEvents.get(cityId);
  if (!event || event.lifecycle !== 'active' || (event.type !== 'aceIntercept' && event.type !== 'vipEscort') || !event.bossHealth || event.bossHealth <= 0) return false;
  // This is a server-only event target: it never enters player lock or collision paths.
  const bossPosition = eventRoutePosition(event, now);
  const owner = players.get(ownerId);
  if (!owner || owner.tutorialMode || owner.cityId !== cityId || owner.lifeState !== 'alive') return false;
  const distance = Math.hypot(owner.position.x - bossPosition.x, owner.position.y - bossPosition.y, owner.position.z - bossPosition.z);
  const hitRadius = event.eventAircraftType ? remoteAircraftContactRadius(event.eventAircraftType, distance) : 14;
  if (distanceToSegmentSquared(bossPosition, start.x, start.y, start.z, end) > hitRadius * hitRadius) return false;
  const damageDealt = Math.min(event.bossHealth, damage);
  if (event.type === 'vipEscort') {
    event.bossHealth -= damageDealt;
    if (event.bossHealth > 0) broadcastEvent(event);
    else setEventTerminal(event, 'failed', now);
    return true;
  }
  event.participants.add(ownerId);
  event.damageContribution.set(ownerId, (event.damageContribution.get(ownerId) ?? 0) + damageDealt);
  event.bossHealth -= damageDealt;
  if (event.bossHealth > 0) { broadcastEvent(event); return true; }
  const template = eventTemplateFor(event);
  const totalDamage = Math.max(1, [...event.damageContribution.values()].reduce((sum, value) => sum + value, 0));
  for (const [playerId, damage] of event.damageContribution) {
    const share = 0.4 + 0.6 * damage / totalDamage;
    awardEventPlayer(event, playerId, Math.round((template?.rewardScore ?? 0) * share), Math.round((template?.rewardCredits ?? 0) * share), 'ACE INTERCEPT CONTRIBUTION', false);
  }
  event.winnerId = [...event.damageContribution.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  missionSignal(ownerId, { type: 'event', at: now, eventId: event.id, eventType: event.type, result: 'aceDestroyed' });
  setEventTerminal(event, 'completed', now);
  return true;
}

function applyMonsterHit(ownerId: string, cityId: CityId, start: Vector3, end: Vector3, now: number, damage: number): boolean {
  const owner = players.get(ownerId);
  const attemptId = playerJourneyAttempts.get(ownerId);
  if (!owner || owner.isBot || owner.cityId !== 'dallas' || cityId !== 'dallas' || !attemptId) return false;
  const encounter = monsterEncounters.get(attemptId);
  if (!encounter || encounter.playerId !== ownerId) return false;
  const attempt = journeyStore.get(owner.pilotId, attemptId);
  if (attempt?.missionId !== journeyDallas19.id || attempt.status !== 'RACING' ||
    attempt.deadlineAt === null || now >= attempt.deadlineAt) return false;
  const groundY = dallasTerrain.elevationAt(encounter.x, encounter.z);
  const impact = monsterImpact(encounter, groundY, start, end);
  if (!impact || segmentBlockedByBuildings(start, impact, monsterDistrictBuildings)) return false;
  const hit = journeyStore.hitMonster(owner.pilotId, attemptId, now, damage);
  if (!hit) return false;
  encounter.hitSequence++;
  recordMonsterFiringPosition(encounter, owner.position, now);
  encounter.hitPosition = impact;
  sendJourneyState(ownerId, hit);
  if (hit.status === 'COMPLETED') {
    sendToPlayer(ownerId, { type: 'monsterFinal', attemptId, kind: 'defeat', at: now });
    removeJourneyHunter(hit);
    sendProfile(ownerId, profileStore.getOrCreate(owner.pilotId, owner.displayName), undefined, undefined, journeyDallas19.name);
  }
  return true;
}

function damageMonsterPilot(encounter: MonsterEncounter, pilot: PlayerState, amount: number, now: number): void {
  if (pilot.lifeState !== 'alive' || now < pilot.spawnProtectedUntil) return;
  pilot.health = Math.max(0, pilot.health - amount);
  airportRepairStays.delete(encounter.playerId);
  broadcastToCity('dallas', { type: 'damage', playerId: encounter.playerId, shooterId: `monster:${encounter.attemptId}`,
    health: pilot.health, maxHealth: maxHealthForAircraft(pilot.aircraftType), damage: amount });
  if (pilot.health === 0) {
    failPlayerJourney(encounter.playerId, 'MONSTER_KILLED', now);
    markPlayerDestroyed(encounter.playerId, pilot, now);
  }
}

function updateMonsterEncounters(now: number): void {
  for (const encounter of monsterEncounters.values()) {
    if (pausedJourneyAttempts.has(encounter.attemptId)) continue;
    const pilot = players.get(encounter.playerId);
    const attempt = pilot && journeyStore.get(pilot.pilotId, encounter.attemptId);
    if (!pilot || attempt?.missionId !== journeyDallas19.id || attempt.status !== 'RACING' ||
      attempt.deadlineAt === null || now >= attempt.deadlineAt) continue;
    const delta = Math.max(0, Math.min(0.1, (now - encounter.lastTickAt) / 1000));
    const beforeHands = encounter.handSwipe && monsterHandPositions(encounter,
      dallasTerrain.elevationAt(encounter.x, encounter.z), encounter.lastTickAt);
    stepMonsterEncounter(encounter, pilot.position, pilot.velocity,
      (x,z) => dallasTerrain.elevationAt(x,z), monsterDistrictBuildings, now);
    const groundY = dallasTerrain.elevationAt(encounter.x, encounter.z);
    for (let i = encounter.shots.length - 1; i >= 0; i--) {
      const shot = encounter.shots[i]!;
      const before = { ...shot.position };
      shot.position.x += shot.direction.x * shot.speed * delta;
      shot.position.y += shot.direction.y * shot.speed * delta;
      shot.position.z += shot.direction.z * shot.speed * delta;
      if (now - shot.bornAt >= shot.lifeMs ||
        segmentBlockedByBuildings(before, shot.position, monsterDistrictBuildings) ||
        shot.position.y <= dallasTerrain.elevationAt(shot.position.x, shot.position.z) + monsterAttack.radius) {
        encounter.shots.splice(i, 1); continue;
      }
      if (monsterProjectileHits(shot, before, pilot.position, pilot.velocity, aircraftHitRadii[pilot.aircraftType], delta)) {
        encounter.shots.splice(i, 1);
        damageMonsterPilot(encounter, pilot, monsterAttack.damage, now);
      }
    }
    const swipe = encounter.handSwipe;
    const afterHands = swipe && monsterHandPositions(encounter, groundY, now);
    const handHit = swipe && afterHands && monsterHandContact(
      beforeHands?.[swipe.side] ?? afterHands[swipe.side], afterHands[swipe.side], pilot.position,
      pilot.velocity, aircraftHitRadii[pilot.aircraftType], delta);
    if (now - encounter.contactAt >= 1_000 && pilot.lifeState === 'alive' &&
      (handHit || monsterBodyContact(encounter, groundY, pilot.position, aircraftHitRadii[pilot.aircraftType]))) {
      encounter.contactAt = now;
      damageMonsterPilot(encounter, pilot, monsterHandSwipe.damage, now);
    }
    if (now - encounter.lastBroadcastAt >= 100 && pilot.lifeState === 'alive') {
      encounter.lastBroadcastAt = now;
      sendToPlayer(encounter.playerId, { type: 'monsterState', attemptId: encounter.attemptId,
        x: encounter.x, y: groundY+encounter.jumpHeight, z: encounter.z, yaw: encounter.yaw,
        jumpProgress: encounter.jumpProgress,
        phase: encounter.windupUntil ? 'windup' : 'walk', hitSequence: encounter.hitSequence,
        velocity: encounter.velocity, yawVelocity: encounter.yawVelocity, gaitPhase: encounter.gaitPhase,
        aimYaw: encounter.aimYaw, aimPitch: encounter.aimPitch, attackKind: encounter.attackKind,
        handSwipe: encounter.handSwipe,
        hitPosition: encounter.hitPosition,
        shots: encounter.shots.map(shot => ({ id: shot.id, x: shot.position.x, y: shot.position.y, z: shot.position.z,
          dx: shot.direction.x, dy: shot.direction.y, dz: shot.direction.z, speed: shot.speed, bornAt: shot.bornAt })),
        serverNow: now });
    }
  }
}

function applyTransportHit(ownerId: string, start: Vector3, end: Vector3, now: number, delta: number, damage: number): boolean {
    const owner = players.get(ownerId), id = playerJourneyAttempts.get(ownerId), e = id ? transportEncounters.get(id) : undefined;
    if (!owner || owner.isBot || owner.cityId !== 'dallas' || !e || e.playerId !== ownerId)
        return false;
    const a = journeyStore.get(owner.pilotId, e.attemptId);
    if (a?.status !== 'RACING' || a.deadlineAt === null || now >= a.deadlineAt)
        return false;
    const sideGuns = e.crossfire?.guns.slice(1);
    const beforePose = {...transportPose(now - delta * 1000 - e.startedAt, e.altitude, e.durationMs),gunYaw:e.gunYaw,gunPitch:e.gunPitch,sideGuns};
    const afterPose = {...transportPose(now - e.startedAt, e.altitude, e.durationMs),gunYaw:e.gunYaw,gunPitch:e.gunPitch,sideGuns};
    const fortressHit = a.missionId === journeyDallas11.id || a.missionId === journeyDallas12.id ? transportFortressImpact(start, end, beforePose, afterPose,
      a.fortressLeftHealth === 0 && a.fortressRightHealth === 0) : undefined;
    const hit = fortressHit?.point ?? (a.missionId === journeyDallas11.id || a.missionId === journeyDallas12.id ? undefined : transportImpact(start, end, beforePose, afterPose));
    if (!hit || segmentBlockedByBuildings(start, hit, transportBuildings) || hit.y <= dallasTerrain.elevationAt(hit.x, hit.z))
        return false;
    // Armored hull shots are consumed but cannot mutate health or rewards.
    if (fortressHit?.component === 'armor' || a.missionId === journeyDallas12.id && a.finalPhase === 'ESCORTS') return true;
    const result = fortressHit ? journeyStore.hitFortressComponent(owner.pilotId, e.attemptId, fortressHit.component, now, damage)
      : journeyStore.hitTransport(owner.pilotId, e.attemptId, now, damage);
    if (!result) return true;
    if (e.fortressTurrets) {
      e.fortressTurrets[0] = result.fortressLeftHealth ?? 0;
      e.fortressTurrets[1] = result.fortressRightHealth ?? 0;
      for (const gun of [1, 2]) if (e.fortressTurrets[gun - 1] === 0 && e.crossfire) {
        e.crossfire.guns[gun]!.warningUntil = 0;
        if (e.crossfire.activeGun === gun) { e.crossfire.activeGun = null; e.crossfire.shotsRemaining = 0; }
      }
      if (a.missionId === journeyDallas12.id && a.finalPhase === 'TURRETS' && result.finalPhase === 'CORE')
        removePlayerProjectiles(ownerId);
    }
    e.hitSequence++;
    e.hitPosition = hit;
    if (result.missionId === journeyDallas09.id) beginReinforcementWave(result, now);
    sendJourneyState(ownerId, result);
    if (result.status === 'COMPLETED') {
        sendToPlayer(ownerId, { type: 'transportFinal', attemptId: e.attemptId, kind: 'defeat', at: now });
        removeJourneyHunter(result);
        sendProfile(ownerId, profileStore.getOrCreate(owner.pilotId, owner.displayName), undefined, undefined,
          result.missionId === journeyDallas12.id ? journeyDallas12.name : result.missionId === journeyDallas11.id ? journeyDallas11.name : result.missionId === journeyDallas10.id ? journeyDallas10.name : result.missionId === journeyDallas09.id ? journeyDallas09.name : result.missionId === journeyDallas08.id ? journeyDallas08.name : journeyDallas07.name);
    }
    return true;
}
function updateTransportEncounters(now: number): void {
    for (const e of transportEncounters.values()) {
        if (pausedJourneyAttempts.has(e.attemptId)) continue;
        const pilot = players.get(e.playerId), a = pilot && journeyStore.get(pilot.pilotId, e.attemptId);
        if (!pilot || a?.status !== 'RACING' || a.deadlineAt === null || now >= a.deadlineAt)
            continue;
        const previousTickAt=e.lastTickAt;
        const dt = Math.max(0, Math.min(.1, (now - previousTickAt) / 1000));
        const pose = stepTransportEncounter(e, pilot.position, pilot.velocity, transportBuildings, now);
        const previousPilot=e.lastCollisionPilotPosition??{x:pilot.position.x-pilot.velocity.x*dt,y:pilot.position.y-pilot.velocity.y*dt,z:pilot.position.z-pilot.velocity.z*dt};
        const previousRotation=e.lastCollisionPilotRotation??pilot.rotation;
        e.lastCollisionPilotPosition={...pilot.position};
        e.lastCollisionPilotRotation={...pilot.rotation};
        const fortress=a.missionId===journeyDallas11.id||a.missionId===journeyDallas12.id;
        const sideGuns=e.crossfire?.guns.slice(1);
        const beforePose={...transportPose(previousTickAt-e.startedAt,e.altitude,e.durationMs),gunYaw:e.gunYaw,gunPitch:e.gunPitch,sideGuns};
        const transportHit=transportAircraftImpact(previousPilot,pilot.position,previousRotation,pilot.rotation,pilot.aircraftType,beforePose,
          {...pose,gunYaw:e.gunYaw,gunPitch:e.gunPitch,sideGuns},fortress);
        if (pilot.lifeState === 'alive' && transportHit) {
            sendToPlayer(e.playerId, { type: 'transportCollision', attemptId: e.attemptId, position: transportHit });
            failPlayerJourney(e.playerId, 'CRASHED', now);
            markPlayerDestroyed(e.playerId, pilot, now);
            continue;
        }
        for (let i = e.shots.length - 1; i >= 0; i--) {
            const shot = e.shots[i]!, before = { ...shot.position }, step = Math.min(shot.speed * dt, COMBAT_RANGE - shot.traveled);
            shot.position.x += shot.direction.x * step;
            shot.position.y += shot.direction.y * step;
            shot.position.z += shot.direction.z * step;
            shot.traveled += step;
            if (segmentBlockedByBuildings(before, shot.position, transportBuildings) || shot.position.y <= dallasTerrain.elevationAt(shot.position.x, shot.position.z)) {
                e.shots.splice(i, 1);
                continue;
            }
            if (sweptProjectileHit(pilot, before.x, before.y, before.z, shot.position, dt)) {
                e.shots.splice(i, 1);
                if (pilot.lifeState === 'alive' && now >= pilot.spawnProtectedUntil) {
                    const shotDamage = e.fortressTurrets ? journeyDallas11.gunShotDamage : e.crossfire ? journeyDallas10.gunShotDamage : transportTuning.shotDamage;
                    pilot.health = Math.max(0, pilot.health - shotDamage);
                    sendToPlayer(e.playerId, { type: 'damage', playerId: e.playerId, shooterId: `transport:${e.attemptId}`, health: pilot.health, maxHealth: maxHealthForAircraft(pilot.aircraftType), damage: shotDamage });
                    if (!pilot.health) {
                        failPlayerJourney(e.playerId, 'CRASHED', now);
                        markPlayerDestroyed(e.playerId, pilot, now);
                    }
                }
            }
            else if (shot.traveled >= COMBAT_RANGE)
                e.shots.splice(i, 1);
        }
        if (now - e.lastBroadcastAt >= 100) {
            e.lastBroadcastAt = now;
            sendToPlayer(e.playerId, { type: 'transportState', attemptId: e.attemptId, fortress: a.missionId===journeyDallas11.id || a.missionId===journeyDallas12.id ? {leftHealth:a.fortressLeftHealth??0,rightHealth:a.fortressRightHealth??0,coreHealth:a.monsterHealth??0,phase:a.finalPhase}:undefined, pose, gunYaw: e.gunYaw, gunPitch: e.gunPitch, warningUntil: e.warningUntil, crossfireGuns:e.crossfire?.guns, activeGun:e.crossfire?.activeGun, hitSequence:e.hitSequence, hitPosition:e.hitPosition, health:a.monsterHealth, shots:e.shots, serverNow:now });
        }
    }
}

function updateProjectiles(deltaSeconds: number): void {
  const now = Date.now();
  updateRespawningPlayers(now);

  for (const projectile of projectiles.values()) {
    const owner = players.get(projectile.ownerId);
    if (pausedJourneyAttempts.has(projectile.privateAttemptId ?? owner?.bot?.journeyAttemptId ?? playerJourneyAttempts.get(projectile.ownerId) ?? '')) continue;
    if (!owner || owner.entityType !== 'player' || owner.lifeState !== 'alive' ||
      projectile.skyDuelMatchId && owner.skyDuelMatchId !== projectile.skyDuelMatchId) {
      removeProjectile(projectile.projectileId);
      continue;
    }
    if(projectile.privateAttemptId){
      const missionPilotId=owner.bot?.journeyRearGuardEscort ? owner.bot.journeyTargetPlayerId : projectile.ownerId;
      const missionPilot=missionPilotId ? players.get(missionPilotId) : undefined;
      const a=missionPilot ? journeyStore.get(missionPilot.pilotId,projectile.privateAttemptId) : undefined;
      if(!missionPilotId || playerJourneyAttempts.get(missionPilotId)!==projectile.privateAttemptId||a?.status!=='RACING'||a.deadlineAt===null||now>=a.deadlineAt){removeProjectile(projectile.projectileId);continue;}
    }
    const previousX = projectile.position.x;
    const previousY = projectile.position.y;
    const previousZ = projectile.position.z;
    const step = Math.min(projectile.speed * deltaSeconds, COMBAT_RANGE - projectile.traveled);
    projectile.position.x += projectile.direction.x * step;
    projectile.position.y += projectile.direction.y * step;
    projectile.position.z += projectile.direction.z * step;
    projectile.traveled += step;

    const missionAttemptId = playerJourneyAttempts.get(projectile.ownerId);
    if (projectile.cityId === 'dallas' && missionAttemptId && monsterEncounters.has(missionAttemptId) &&
      (segmentBlockedByBuildings({ x: previousX, y: previousY, z: previousZ }, projectile.position, monsterDistrictBuildings) ||
       projectile.position.y <= dallasTerrain.elevationAt(projectile.position.x, projectile.position.z))) {
      removeProjectile(projectile.projectileId);
      continue;
    }

    const missionAttempt = missionAttemptId ? journeyStore.get(owner.pilotId, missionAttemptId) : undefined;
    const transportMissionId = missionAttempt?.missionId;
    if (transportMissionId === journeyDallas07.id || transportMissionId === journeyDallas08.id || transportMissionId === journeyDallas09.id || transportMissionId === journeyDallas10.id || transportMissionId === journeyDallas11.id || transportMissionId === journeyDallas12.id) {
      const start={x:previousX,y:previousY,z:previousZ};
      if(applyTransportHit(projectile.ownerId,start,projectile.position,now,deltaSeconds,projectile.damage)) {removeProjectile(projectile.projectileId);continue;}
      const blocked = segmentBlockedByBuildings(start, projectile.position, transportBuildings) ||
        projectile.position.y <= dallasTerrain.elevationAt(projectile.position.x, projectile.position.z);
      const disposition = transportProjectileDisposition(transportMissionId, projectile.traveled, blocked);
      if (disposition === 'remove') {removeProjectile(projectile.projectileId);continue;}
      if (disposition === 'continue') continue;
    } else if (!projectile.skyDuelMatchId && !projectile.skyDuelPractice && (applyMonsterHit(projectile.ownerId, projectile.cityId, { x: previousX, y: previousY, z: previousZ }, projectile.position, now, projectile.damage) ||
      applyEventAircraftHit(projectile.ownerId, projectile.cityId, { x: previousX, y: previousY, z: previousZ }, projectile.position, now, projectile.damage))) {
      removeProjectile(projectile.projectileId);
      continue;
    }

    let hitPlayerId: string | null = null;
    for (const [playerId, player] of players) {
      if (
        playerId === projectile.ownerId ||
        player.entityType !== 'player' ||
        player.cityId !== projectile.cityId ||
        !sameCombatContext(owner, player) ||
        ((transportMissionId === journeyDallas08.id || transportMissionId === journeyDallas09.id || transportMissionId === journeyDallas10.id || transportMissionId === journeyDallas12.id) && (!player.bot?.journeyRearGuardEscort || player.bot.journeyAttemptId !== missionAttemptId)) ||
        !tutorialCombatPairAllowed(projectile.ownerId, owner, playerId, player) ||
        player.lifeState !== 'alive' ||
        playerJourneyRunwayPrep.has(playerId) ||
        focusedBotInteractionExcluded(projectile.ownerId, owner, playerId, player) ||
        now < player.spawnProtectedUntil
      ) {
        continue;
      }
      const distance = Math.hypot(owner.position.x - player.position.x, owner.position.y - player.position.y, owner.position.z - player.position.z);
      const targetScale = owner.isBot && !player.isBot ? 1
        : player.bot?.journeyRearGuardEscort ? remoteAircraftScale : remoteAircraftVisualScale(distance);
      if (sweptProjectileHit(player, previousX, previousY, previousZ, projectile.position, deltaSeconds, targetScale)) {
        hitPlayerId = playerId;
        break;
      }
    }

    if (hitPlayerId) {
      removeProjectile(projectile.projectileId);
      applyCombatHit(projectile.ownerId, hitPlayerId, projectile.cityId, now, projectile.damage, projectile.traveled);
      continue;
    }

    if (projectile.traveled >= COMBAT_RANGE) removeProjectile(projectile.projectileId);
  }
  broadcastProjectileStates(now);
  updateMonsterEncounters(now);
  updateTransportEncounters(now);
}

function desiredBotCount(cityId: CityId): number {
  const humans = [...players.values()].filter((player) => player.cityId === cityId && !player.isBot && !player.tutorialMode && !player.skyDuelMode).length;
  if (humans === 0) return 0;
  if (cityId === 'milwaukee') return 3;
  if (humans <= 2) return 7 - humans;
  if (humans <= 5) return 8 - humans;
  if (humans <= 8) return 9 - humans;
  return 0;
}

function transportEscortHealth(bot: BotRuntime | undefined): number | undefined {
  if (!bot?.journeyRearGuardEscort) return undefined;
  return bot.journeyEscortMissionId === journeyDallas10.id || bot.journeyEscortMissionId === journeyDallas12.id
    ? (bot.journeyEscortMissionId === journeyDallas12.id ? journeyDallas12 : journeyDallas10).escortHealth[bot.journeyRearGuardEscort - 1]
    : bot.journeyEscortMissionId === journeyDallas09.id
      ? journeyDallas09.escortHealth[bot.journeyRearGuardEscort - 1] : journeyDallas08.escortHealth;
}

function transportEscortCosmetics(bot: BotRuntime | undefined): Record<string, string> | undefined {
  if (!bot?.journeyRearGuardEscort || bot.journeyEscortMissionId !== journeyDallas08.id && bot.journeyEscortMissionId !== journeyDallas09.id && bot.journeyEscortMissionId !== journeyDallas10.id && bot.journeyEscortMissionId !== journeyDallas12.id) return undefined;
  const mission = bot.journeyEscortMissionId === journeyDallas12.id ? journeyDallas12 : bot.journeyEscortMissionId === journeyDallas10.id ? journeyDallas10 : bot.journeyEscortMissionId === journeyDallas09.id ? journeyDallas09 : journeyDallas08;
  const type = mission.escortAircraft[bot.journeyRearGuardEscort - 1];
  const livery = mission.escortLiveries[bot.journeyRearGuardEscort - 1];
  return type && livery ? { [`livery:${type}`]: livery } : undefined;
}

function botStateMessage(playerId: string, player: PlayerState, type: 'state' | 'playerState' = 'state'): object {
  return {
    type, playerId, position: player.position, rotation: player.rotation,
    altitudeMeters: Math.max(0, player.position.y - botTerrainHeight(player.cityId, player.position.x, player.position.z)),
    aircraftType: player.aircraftType, cityId: player.cityId, displayName: player.displayName,
    lifeState: player.lifeState, health: player.health,
    maxHealth: transportEscortHealth(player.bot) ?? (player.bot?.journeyAce ? journeyDallas15.bossHealth : maxHealthForAircraft(player.aircraftType)), isBot: true,
    botPersonality: player.bot?.personality, boostActive: false,
    ...(player.bot?.journeyRearGuardEscort ? { rearGuardEscort: true } : {}),
    ...(transportEscortCosmetics(player.bot) ? { equippedCosmetics: transportEscortCosmetics(player.bot) } : {}),
  };
}

function botTerrainHeight(cityId: CityId, x: number, z: number): number {
  return cityId === 'dallas' ? dallasTerrain.elevationAt(x, z) : 0;
}

function botRunwayHeight(cityId: CityId, x: number, z: number): number {
  for (const airport of cityAirports[cityId]) {
    const dx = x - airport.x, dz = z - airport.z;
    const along = dx * Math.sin(airport.heading) + dz * Math.cos(airport.heading);
    const lateral = dx * Math.cos(airport.heading) - dz * Math.sin(airport.heading);
    if (Math.abs(along) <= airport.runwayLength * 0.5 + 300 &&
      Math.abs(lateral) <= Math.max(110, airport.runwayWidth * 3)) {
      return cityId === 'dallas' ? dallasAirportElevations.get(airport.id)! : 0;
    }
  }
  return botTerrainHeight(cityId, x, z);
}

function botSafeFloor(cityId: CityId, x: number, z: number, clearance: number): number {
  let floor = (clearance <= 2 ? botRunwayHeight(cityId, x, z) : botTerrainHeight(cityId, x, z)) + clearance;
  // Major downtown towers have no server collision meshes. A city-supplied
  // clearance envelope keeps bot routes above that known obstruction cluster.
  for (const area of territoriesForCity(cityId)) {
    if (area.botObstacleClearance && territoryContains(area, { x, z })) {
      floor = Math.max(floor, botTerrainHeight(cityId, x, z) + area.botObstacleClearance);
    }
  }
  return floor;
}

function safeBotWaypoint(cityId: CityId, from: Vector3, waypoint: Vector3, clearance: number): Vector3 {
  const steps = Math.max(1, Math.ceil(Math.hypot(waypoint.x - from.x, waypoint.z - from.z) / botTerrainSampleSpacing));
  let requiredY = waypoint.y;
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    requiredY = Math.max(requiredY, botSafeFloor(cityId, from.x + (waypoint.x - from.x) * t, from.z + (waypoint.z - from.z) * t, clearance));
  }
  return requiredY > waypoint.y ? { ...waypoint, y: requiredY } : waypoint;
}

const botAirportsByCity = {
  dallas: cityAirports.dallas.filter(airport => airport.id !== 'dfw'),
  milwaukee: cityAirports.milwaukee.filter(airport => airport.id !== 'central'),
};
function botAirports(cityId: CityId) { return botAirportsByCity[cityId]; }

function airportRoute(cityId: CityId, startIndex: number, personality: BotPersonality): Vector3[] {
  const airports = botAirports(cityId);
  const origin = airports[startIndex % airports.length];
  const destination = airports[(startIndex + 1) % airports.length];
  const altitude = Math.max(botAirborneClearance, personality === 'racer' ? 820 : personality === 'hunter' ? 680 : personality === 'explorer' ? 520 : 410);
  const territory = territoriesForCity(cityId)[Math.floor(Math.random() * Math.max(1, territoriesForCity(cityId).length))];
  const activity = personality === 'explorer' || personality === 'casual'
    ? [{ x: territory?.center.x ?? destination.x, y: botTerrainHeight(cityId, territory?.center.x ?? destination.x, territory?.center.z ?? destination.z) + altitude, z: territory?.center.z ?? destination.z }]
    : [];
  const originY = botRunwayHeight(cityId, origin.x, origin.z);
  const destinationY = botRunwayHeight(cityId, destination.x, destination.z);
  const route = [
    { x: origin.x, y: originY + 1.2, z: origin.z + origin.runwayLength * 0.30 },
    { x: origin.x, y: originY + 160, z: origin.z - origin.runwayLength * 0.32 },
    { x: origin.x, y: originY + altitude, z: origin.z - origin.runwayLength * 0.12 },
    ...activity,
    { x: destination.x, y: destinationY + altitude, z: destination.z + destination.runwayLength * 0.16 },
    { x: destination.x, y: destinationY + 1.2, z: destination.z + destination.runwayLength * 0.30 },
  ];
  for (let index = 2; index < route.length - 1; index += 1) {
    route[index] = safeBotWaypoint(cityId, route[index - 1], route[index], botCruiseClearance);
  }
  return route;
}

function botAircraft(personality: BotPersonality): AircraftType {
  if (personality === 'hunter') return 'fighter';
  if (personality === 'racer') return Math.random() < 0.7 ? 'privateJet' : 'fighter';
  if (personality === 'explorer') return Math.random() < 0.65 ? 'trainer' : 'privateJet';
  return Math.random() < 0.5 ? 'trainer' : 'cargo';
}

function createBot(cityId: CityId, defenseSpawn?: { territory: CityTerritory; attacker: PlayerState },
  journeySpawn?: { attemptId: string; targetPlayerId: string; target: PlayerState; leader?: boolean; recovery?: boolean; escape?: boolean; ace?: boolean; legendary?: boolean; siege?: boolean; breakout?: boolean; crossfireOrdinal?: 1 | 2; doubleOrdinal?: 1 | 2; rearGuardOrdinal?: 1 | 2 | 3 | 4; escortMissionId?: string; escortPose?: ReturnType<typeof transportPose> }): string {
  const leaderSpawn = journeySpawn?.leader === true;
  const personality = leaderSpawn ? 'casual' : journeySpawn ? 'hunter' : botPersonalities[(nextBotSerial - 1) % botPersonalities.length];
  const airports = botAirports(cityId);
  const homeAirportIndex = (nextBotSerial - 1) % airports.length;
  const home = airports[homeAirportIndex];
  const id = `bot:${cityId}:${nextBotSerial}`;
  const name = `${botNames[(nextBotSerial - 1) % botNames.length]}-${20 + ((nextBotSerial * 7) % 80)}`;
  const botAircraftType = leaderSpawn ? 'trainer' : journeySpawn?.rearGuardOrdinal
    ? (journeySpawn.escortMissionId === journeyDallas10.id || journeySpawn.escortMissionId === journeyDallas12.id ? (journeySpawn.escortMissionId === journeyDallas12.id ? journeyDallas12 : journeyDallas10).escortAircraft[journeySpawn.rearGuardOrdinal - 1]
      : journeySpawn.escortMissionId === journeyDallas09.id ? journeyDallas09.escortAircraft[journeySpawn.rearGuardOrdinal - 1]
      : journeyDallas08.escortAircraft[journeySpawn.rearGuardOrdinal - 1]) as AircraftType : botAircraft(personality);
  const downtown = journeySpawn && !leaderSpawn && !journeySpawn.recovery && !journeySpawn.escape && !journeySpawn.ace && !journeySpawn.siege && !journeySpawn.breakout && !journeySpawn.crossfireOrdinal && !journeySpawn.doubleOrdinal && !journeySpawn.rearGuardOrdinal ? territoriesForCity('dallas').find(territory => territory.id === 'downtown')! : undefined;
  const escortPose = journeySpawn?.rearGuardOrdinal ? journeySpawn.escortPose ?? transportPose(0, transportFlightAltitude, journeyDallas08.timeLimitMs) : undefined;
  const escortSide = journeySpawn?.rearGuardOrdinal && journeySpawn.rearGuardOrdinal % 2 ? -1 : 1;
  const reinforcement = (journeySpawn?.rearGuardOrdinal ?? 0) >= 3;
  const reinforcementEntry = reinforcement && escortPose
    ? reinforcementApproachPoint(escortPose, journeySpawn!.rearGuardOrdinal as 3 | 4, 'entry') : undefined;
  const reinforcementFormation = reinforcement && escortPose
    ? reinforcementApproachPoint(escortPose, journeySpawn!.rearGuardOrdinal as 3 | 4, 'formation') : undefined;
  const escortLateral = 780;
  const escortAlong = 500;
  const crossfireBehind = journeySpawn?.crossfireOrdinal === 2 ? 1_850 : 1_500;
  const crossfireSide = journeySpawn?.crossfireOrdinal === 2 ? 900 : -650;
  const proposedSpawnX = reinforcementEntry ? reinforcementEntry.x
    : escortPose ? escortPose.x + Math.cos(escortPose.yaw) * escortSide * escortLateral + Math.sin(escortPose.yaw) * escortAlong
    : journeySpawn?.crossfireOrdinal ? journeySpawn.target.position.x + Math.sin(journeySpawn.target.rotation.y) * crossfireBehind + Math.cos(journeySpawn.target.rotation.y) * crossfireSide
    : journeySpawn?.legendary ? journeySpawn.target.position.x - Math.sin(journeySpawn.target.rotation.y) * 2_600 + Math.cos(journeySpawn.target.rotation.y) * 850
    : journeySpawn?.doubleOrdinal === 1 ? -5_140
    : journeySpawn?.doubleOrdinal === 2 ? journeySpawn.target.position.x - Math.sin(journeySpawn.target.rotation.y) * 2_600 + Math.cos(journeySpawn.target.rotation.y) * 850
    : journeySpawn?.breakout ? journeySpawn.target.position.x + 0
    : journeySpawn?.siege ? journeySpawn.target.position.x + Math.sin(journeySpawn.target.rotation.y) * 1_700 + Math.cos(journeySpawn.target.rotation.y) * 650
    : journeySpawn?.ace ? -5_140
    : journeySpawn?.escape ? journeySpawn.target.position.x + Math.sin(journeySpawn.target.rotation.y) * 240
    : journeySpawn?.recovery ? journeySpawn.target.position.x + 450
    : leaderSpawn ? journeyDallas08.leaderRoute[0]!.x : journeySpawn
    ? downtown!.center.x : defenseSpawn
    ? defenseSpawn.attacker.position.x >= defenseSpawn.territory.center.x ? defenseSpawn.territory.bounds.minX - 500 : defenseSpawn.territory.bounds.maxX + 500
    : home.x;
  const proposedSpawnZ = reinforcementEntry ? reinforcementEntry.z
    : escortPose ? escortPose.z - Math.sin(escortPose.yaw) * escortSide * escortLateral + Math.cos(escortPose.yaw) * escortAlong
    : journeySpawn?.crossfireOrdinal ? journeySpawn.target.position.z + Math.cos(journeySpawn.target.rotation.y) * crossfireBehind - Math.sin(journeySpawn.target.rotation.y) * crossfireSide
    : journeySpawn?.legendary ? journeySpawn.target.position.z - Math.cos(journeySpawn.target.rotation.y) * 2_600 - Math.sin(journeySpawn.target.rotation.y) * 850
    : journeySpawn?.doubleOrdinal === 1 ? -12_000
    : journeySpawn?.doubleOrdinal === 2 ? journeySpawn.target.position.z - Math.cos(journeySpawn.target.rotation.y) * 2_600 - Math.sin(journeySpawn.target.rotation.y) * 850
    : journeySpawn?.breakout ? journeySpawn.target.position.z + 0
    : journeySpawn?.siege ? journeySpawn.target.position.z + Math.cos(journeySpawn.target.rotation.y) * 1_700 - Math.sin(journeySpawn.target.rotation.y) * 650
    : journeySpawn?.ace ? -12_000
    : journeySpawn?.escape ? journeySpawn.target.position.z + Math.cos(journeySpawn.target.rotation.y) * 240
    : journeySpawn?.recovery ? journeySpawn.target.position.z + 1_800
    : leaderSpawn ? journeyDallas08.leaderRoute[0]!.z : journeySpawn
    ? downtown!.bounds.minZ + 2_400
    : defenseSpawn ? defenseSpawn.territory.center.z : home.z + home.runwayLength * 0.34;
  const { x: spawnX, z: spawnZ } = journeySpawn && !leaderSpawn && !journeySpawn.rearGuardOrdinal ? boundJourneyHunterPoint({ x: proposedSpawnX, z: proposedSpawnZ })
    : { x: proposedSpawnX, z: proposedSpawnZ };
  const spawnY = escortPose ? Math.max(reinforcementEntry?.y ?? escortPose.y + 150, botSafeFloor(cityId, spawnX, spawnZ, journeyAceClearance) + 50)
    : leaderSpawn ? Math.max(...journeyDallas08.leaderRoute.map((point, index) => {
    const previous = journeyDallas08.leaderRoute[(index + journeyDallas08.leaderRoute.length - 1) % journeyDallas08.leaderRoute.length]!;
    return safeBotWaypoint(cityId, { ...previous, y: 0 }, { ...point, y: 0 }, botCruiseClearance).y;
  })) + 120
    : journeySpawn?.breakout ? Math.max(botSafeFloor(cityId, spawnX, spawnZ, journeyEscapeHunterClearance) + 40, journeySpawn.target.position.y + 30)
    : journeySpawn?.siege ? Math.max(botSafeFloor(cityId, spawnX, spawnZ, journeyEscapeHunterClearance) + 40,
      journeySpawn.target.position.y + 30)
    : journeySpawn?.crossfireOrdinal ? Math.max(botSafeFloor(cityId, spawnX, spawnZ, journeyEscapeHunterClearance) + 40,
      journeySpawn.target.position.y + (journeySpawn.crossfireOrdinal === 2 ? 100 : 20))
    : journeySpawn?.doubleOrdinal ? Math.max(botSafeFloor(cityId, spawnX, spawnZ, journeyAceClearance) + 100,
      journeySpawn.target.position.y + (journeySpawn.doubleOrdinal === 2 ? 60 : 0))
    : journeySpawn?.legendary ? Math.max(botSafeFloor(cityId, spawnX, spawnZ, journeyAceClearance) + 100, journeySpawn.target.position.y + 60)
    : journeySpawn?.ace ? botSafeFloor(cityId, spawnX, spawnZ, journeyAceClearance) + 60
    : journeySpawn?.escape ? botSafeFloor(cityId, spawnX, spawnZ, journeyEscapeHunterClearance) + 20
    : journeySpawn ? botSafeFloor(cityId, spawnX, spawnZ, botCombatClearance) + 180
    : defenseSpawn ? botSafeFloor(cityId, spawnX, spawnZ, botCruiseClearance) : botRunwayHeight(cityId, home.x, home.z) + 1.2;
  const spawnHeading = reinforcementFormation ? Math.atan2(spawnX - reinforcementFormation.x, spawnZ - reinforcementFormation.z)
    : escortPose ? escortPose.yaw
    : leaderSpawn ? Math.atan2(spawnX - journeyDallas08.leaderRoute[1]!.x, spawnZ - journeyDallas08.leaderRoute[1]!.z)
    : journeySpawn?.breakout ? journeySpawn.target.rotation.y
    : journeySpawn?.siege ? journeySpawn.target.rotation.y
    : journeySpawn?.crossfireOrdinal ? journeySpawn.target.rotation.y
    : journeySpawn?.doubleOrdinal === 2 ? journeySpawn.target.rotation.y
    : journeySpawn?.doubleOrdinal === 1 ? 0
    : journeySpawn?.legendary ? journeySpawn.target.rotation.y
    : journeySpawn?.ace ? 0
    : journeySpawn?.escape ? journeySpawn.target.rotation.y : journeySpawn ? Math.PI : defenseSpawn
    ? Math.atan2(spawnX - defenseSpawn.territory.center.x, spawnZ - defenseSpawn.territory.center.z)
    : home.heading;
  nextBotSerial += 1;
  const bot: BotRuntime = {
    personality, phase: defenseSpawn || journeySpawn ? 'cruise' : 'taxi', route: airportRoute(cityId, homeAirportIndex, personality), routeIndex: 0,
    journeyAttemptId: journeySpawn?.attemptId, journeyTargetPlayerId: journeySpawn?.targetPlayerId,
    journeyLeader: leaderSpawn,
    journeyEscape: journeySpawn?.escape === true,
    journeyAce: journeySpawn?.ace === true,
    journeyLegendary: journeySpawn?.legendary === true,
    journeyCrossfire: Boolean(journeySpawn?.crossfireOrdinal),
    journeyRearGuardEscort: journeySpawn?.rearGuardOrdinal,
    journeyEscortMissionId: journeySpawn?.escortMissionId,
    journeySiege: journeySpawn?.siege === true,
    journeyBreakout: journeySpawn?.breakout === true,
    journeyDoubleOrdinal: journeySpawn?.doubleOrdinal,
    speed: defenseSpawn || journeySpawn ? aircraftFlightEnvelope[botAircraftType].stallSpeed * 1.25 : 0,
    desiredSpeed: 0, nextDecisionAt: 0, nextFireAt: Date.now() + 1_200,
    respawnAt: 0, homeAirportIndex, combatPhaseUntil: 0, combatWaypointRefreshAt: 0, attackFireAfter: 0, combatTurnSign: 1, bankControl: 0,
    blindZoneEscapeUntil: 0, defenseSpawned: Boolean(defenseSpawn),
  };
  if (downtown) {
    bot.route = [
      { x: downtown.center.x - 1_100, y: spawnY, z: downtown.bounds.minZ + 2_400 },
      { x: downtown.center.x - 1_100, y: spawnY, z: downtown.bounds.minZ + 4_300 },
      { x: downtown.center.x + 1_100, y: spawnY, z: downtown.bounds.minZ + 4_300 },
      { x: downtown.center.x + 1_100, y: spawnY, z: downtown.bounds.minZ + 2_400 },
    ].map(point => safeBotWaypoint(cityId, { x: spawnX, y: spawnY, z: spawnZ }, point, botCombatClearance));
  }
  if (leaderSpawn) bot.route = journeyDallas08.leaderRoute.map(point => ({ x: point.x, y: spawnY, z: point.z }));
  if (escortPose) bot.route = [reinforcementFormation
    ? safeBotWaypoint(cityId, { x: spawnX, y: spawnY, z: spawnZ }, reinforcementFormation, journeyAceClearance)
    : { x: spawnX + 1_000, y: spawnY, z: spawnZ }];
  if (journeySpawn?.ace) bot.route = [
    { x: -5_140, y: spawnY, z: -12_000 }, { x: -6_240, y: spawnY, z: -13_300 },
    { x: -5_140, y: spawnY, z: -14_600 }, { x: -4_040, y: spawnY, z: -13_300 },
  ].map(point => safeBotWaypoint(cityId, { x: spawnX, y: spawnY, z: spawnZ }, point, journeyAceClearance));
  if (journeySpawn?.legendary) bot.route = [
    { x: spawnX - 1_200, y: spawnY, z: spawnZ - 1_200 },
    { x: spawnX + 1_200, y: spawnY, z: spawnZ - 1_200 },
    { x: spawnX + 1_200, y: spawnY, z: spawnZ + 1_200 },
    { x: spawnX - 1_200, y: spawnY, z: spawnZ + 1_200 },
  ].map(point => safeBotWaypoint(cityId, { x: spawnX, y: spawnY, z: spawnZ }, point, journeyAceClearance));
  if (journeySpawn?.doubleOrdinal) bot.route = [
    { x: spawnX - 900, y: spawnY, z: spawnZ - 900 },
    { x: spawnX + 900, y: spawnY, z: spawnZ - 900 },
    { x: spawnX + 900, y: spawnY, z: spawnZ + 900 },
    { x: spawnX - 900, y: spawnY, z: spawnZ + 900 },
  ].map(point => safeBotWaypoint(cityId, { x: spawnX, y: spawnY, z: spawnZ }, point, journeyAceClearance));
  const player: PlayerState = {
    pilotId: id, profile: undefined as unknown as PlayerProfile, entityType: 'player', isBot: true,
    cityId, position: { x: spawnX, y: spawnY, z: spawnZ },
    rotation: { x: 0, y: spawnHeading, z: 0 }, aircraftType: botAircraftType,
    displayName: journeySpawn?.rearGuardOrdinal ? journeySpawn.escortMissionId === journeyDallas10.id || journeySpawn.escortMissionId === journeyDallas12.id
      ? `${(journeySpawn.escortMissionId === journeyDallas12.id ? ['NIGHTOWL', 'FIREHAWK'] : ['NIGHTOWL', 'MAMMOTH'])[journeySpawn.rearGuardOrdinal - 1]} ESCORT` : journeySpawn.escortMissionId === journeyDallas09.id
      ? `${['BLUEJAY', 'MAMMOTH', 'NIGHTOWL', 'VIOLET NIGHTOWL'][journeySpawn.rearGuardOrdinal - 1]} ESCORT` : `BLUEJAY ESCORT ${journeySpawn.rearGuardOrdinal}` : leaderSpawn ? 'AI LEADER' : journeySpawn?.legendary ? 'LEGENDARY ACE' : journeySpawn?.ace ? journeyDallas15.bossName : journeySpawn?.doubleOrdinal ? `HUNTER ${journeySpawn.doubleOrdinal}` : name,
    score: 0, health: journeySpawn?.rearGuardOrdinal ? journeySpawn.escortMissionId === journeyDallas10.id || journeySpawn.escortMissionId === journeyDallas12.id
      ? (journeySpawn.escortMissionId === journeyDallas12.id ? journeyDallas12 : journeyDallas10).escortHealth[journeySpawn.rearGuardOrdinal - 1]! : journeySpawn.escortMissionId === journeyDallas09.id
      ? journeyDallas09.escortHealth[journeySpawn.rearGuardOrdinal - 1]! : journeyDallas08.escortHealth : journeySpawn?.legendary ? journeyDallas24.bossHealth : journeySpawn?.ace ? journeyDallas15.bossHealth : maxHealthForAircraft(botAircraftType), lifeState: 'alive', hasRespawnTransform: true,
    lastFireAt: 0, spawnProtectedUntil: Date.now() + 1_500, velocity: { x: 0, y: 0, z: 0 }, boostActive: false,
    lastStateAt: Date.now(), lastAcceptedPosition: { x: spawnX, y: spawnY, z: spawnZ }, lastAcceptedTransformAt: Date.now(),
    chaosQaEnabled: false, tutorialMode:false, territoryIds: new Set(), bot,
  };
  players.set(id, player);
  if (journeySpawn?.rearGuardOrdinal) sendToPlayer(journeySpawn.targetPlayerId, botStateMessage(id, player, 'playerState'));
  else broadcastToCity(cityId, botStateMessage(id, player, 'playerState'));
  return id;
}

function removeTrainingTarget(ownerId: string): void {
  for (const [targetId, target] of players) {
    if (target.trainingOwnerId !== ownerId) continue;
    removePlayerProjectiles(targetId);
    clearPlayerRuntimeState(targetId);
    players.delete(targetId);
    sendToPlayer(ownerId, { type: 'remove', playerId: targetId });
  }
}

// Keep the teaching target readable, inside the existing combat envelope.
const trainingApproachRange = Math.min(COMBAT_RANGE, 600);
function createTrainingTarget(ownerId: string, owner: PlayerState, now = Date.now()): string | undefined {
  if (!owner.tutorialMode || owner.cityId !== 'milwaukee' || owner.lifeState !== 'alive' || !owner.hasRespawnTransform) return undefined;
  const screenplay = profileStore.trainingSlideIndex(owner.pilotId) !== undefined;
  const forward = forwardDirection(owner);
  const targetDistance = screenplay ? trainingApproachRange * 0.65 : trainingApproachRange + 150;
  const targetX = owner.position.x + forward.x * targetDistance;
  const targetZ = owner.position.z + forward.z * targetDistance;
  const targetY = Math.max(owner.position.y + (screenplay ? forward.y * targetDistance : 20), botTerrainHeight(owner.cityId, targetX, targetZ) + 85);
  const existing=[...players.entries()].find(([,candidate])=>candidate.trainingOwnerId===ownerId&&candidate.lifeState==='alive');
  if(existing){
    if(screenplay){
      existing[1].position={x:targetX,y:targetY,z:targetZ};
      existing[1].lastAcceptedPosition={...existing[1].position};
      existing[1].lastAcceptedTransformAt=now;
    }
    existing[1].lastStateAt=now;
    sendToPlayer(ownerId,botStateMessage(existing[0],existing[1],'playerState'));
    sendToPlayer(ownerId,{type:'tutorialTarget',targetId:existing[0]});
    return existing[0];
  }
  removeTrainingTarget(ownerId);
  const targetId = `training:${ownerId}`;
  const target: PlayerState = {
    pilotId: targetId, profile: undefined as unknown as PlayerProfile, entityType: 'player', isBot: true,
    cityId: owner.cityId, position: { x: targetX, y: targetY, z: targetZ },
    rotation: { x: 0, y: owner.rotation.y + Math.PI, z: 0 }, aircraftType: 'trainer',
    displayName: 'TRAINING TARGET', score: 0, health: projectileDamageForAircraft('trainer'), lifeState: 'alive', hasRespawnTransform: true,
    lastFireAt: 0, spawnProtectedUntil: 0, velocity: { x: 0, y: 0, z: 0 }, boostActive: false,
    lastStateAt: now, lastAcceptedPosition: { x: targetX, y: targetY, z: targetZ }, lastAcceptedTransformAt: now,
    chaosQaEnabled: false, tutorialMode: true, trainingOwnerId: ownerId, territoryIds: new Set(),
  };
  players.set(targetId, target);
  sendToPlayer(ownerId, botStateMessage(targetId, target, 'playerState'));
  sendToPlayer(ownerId, { type: 'tutorialTarget', targetId });
  return targetId;
}

function updateTrainingTargets(now: number): void {
  for (const [targetId, target] of players) {
    if (!target.trainingOwnerId) continue;
    const owner = players.get(target.trainingOwnerId);
    if (!owner?.tutorialMode || owner.lifeState !== 'alive') {
      removeTrainingTarget(target.trainingOwnerId);
      continue;
    }
    target.lastStateAt = now;
    const range=Math.hypot(target.position.x-owner.position.x,target.position.y-owner.position.y,target.position.z-owner.position.z);
    if(range<=trainingApproachRange){completeServerTutorialStep(target.trainingOwnerId,owner,'approach',now);sendToPlayer(target.trainingOwnerId,{type:'tutorialSignal',signal:'targetInRange'});}
    if(owner.lockedTargetId===targetId){
      // APPROACH may resolve on this same tick after the lock was first
      // acquired. Recheck the live lock now so LOCK completes in order.
      completeServerTutorialStep(target.trainingOwnerId,owner,'targetLock',now);
      sendToPlayer(target.trainingOwnerId,{type:'tutorialSignal',signal:'targetLocked'});
    }
    sendToPlayer(target.trainingOwnerId, botStateMessage(targetId, target));
  }
}

function removeBot(playerId: string): void {
  const player = players.get(playerId);
  if (!player?.isBot) return;
  if (player.bot?.journeyDoubleOrdinal) doubleHunterMotion.delete(playerId);
  if (player.bot?.journeyLegendary) legendaryAceMotion.delete(playerId);
  removePlayerProjectiles(playerId);
  clearPlayerRuntimeState(playerId);
  players.delete(playerId);
  if (player.skyDuelPracticeOwnerId)
    sendToPlayer(player.skyDuelPracticeOwnerId, { type: 'remove', playerId });
  else if (player.bot?.journeyRearGuardEscort && player.bot.journeyTargetPlayerId)
    sendToPlayer(player.bot.journeyTargetPlayerId, { type: 'remove', playerId });
  else broadcastToCity(player.cityId, { type: 'remove', playerId });
}

function reconcileBots(cityId: CityId): void {
  const bots = [...players.entries()].filter(([, player]) => player.cityId === cityId && player.isBot && Boolean(player.bot) && !player.bot?.journeyAttemptId && !player.skyDuelMode);
  const desired = Math.min(maxBotsPerCity, desiredBotCount(cityId));
  if (bots.length < desired) {
    createBot(cityId);
    return;
  }
  if (bots.length <= desired) return;
  const humans = [...players.values()].filter((player) => player.cityId === cityId && !player.isBot && !player.tutorialMode && !player.skyDuelMode && player.lifeState === 'alive');
  const removable = bots
    .filter(([, bot]) => !bot.bot?.defenseTerritoryId)
    .map(([id, bot]) => ({ id, distance: humans.length ? Math.min(...humans.map((human) => Math.hypot(bot.position.x - human.position.x, bot.position.z - human.position.z))) : Infinity }))
    .filter((candidate) => cityId === 'milwaukee' || candidate.distance >= 1_800 || humans.length === 0)
    .sort((left, right) => right.distance - left.distance)[0];
  if (removable) removeBot(removable.id);
}

function wrapAngle(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function botCombatTarget(botId: string, bot: PlayerState, now: number): [string, PlayerState] | undefined {
  if ((bot.cityId !== 'milwaukee' && bot.bot?.personality !== 'hunter') || bot.position.y - botTerrainHeight(bot.cityId, bot.position.x, bot.position.z) < hunterClearance(bot.bot!)) return undefined;
  const candidate = [...players.entries()]
    // Hunters add pressure to real pilots only. Bots remain route traffic and
    // never form a self-sustaining bot-vs-bot combat loop.
    .filter(([id, target]) => id !== botId && !target.isBot && !target.tutorialMode && !playerJourneyRunwayPrep.has(id) &&
      (bot.skyDuelPracticeOwnerId ? id === bot.skyDuelPracticeOwnerId && target.skyDuelMatchId === bot.skyDuelMatchId : !target.skyDuelMode) &&
      (!missionFocusedPlayers.has(id) || allowedFocusedBot(botId, id)) && target.cityId === bot.cityId &&
      (!bot.bot?.journeyTargetPlayerId || id === bot.bot.journeyTargetPlayerId) &&
      (bot.cityId !== 'milwaukee' || target.milwaukeeBotsProvoked) && target.lifeState === 'alive' && target.hasRespawnTransform && now >= target.spawnProtectedUntil && now - target.lastStateAt < 1_500)
    .map(([id, target]) => ({ id, target, distance: Math.hypot(target.position.x - bot.position.x, target.position.y - bot.position.y, target.position.z - bot.position.z) }))
    .filter((candidate) => candidate.distance > 90 && candidate.distance <
      (bot.skyDuelPracticeOwnerId ? skyDuelAiTuning.detectionRange : hunterDetectionRange))
    .filter((candidate) => {
      const currentHunters = [...players.values()].filter((other) => other.isBot && other.lifeState === 'alive' && other.bot?.combatTargetId === candidate.id && isHunterCombatPhase(other.bot.phase)).length;
      const heat = currentHeat(candidate.id, now).level;
      const wanted = cityEvents.get(bot.cityId)?.wantedPlayerId === candidate.id;
      return currentHunters < (wanted || heat >= 4 ? 2 : 1);
    })
    .sort((left, right) => left.distance - right.distance)[0];
  return candidate ? [candidate.id, candidate.target] : undefined;
}

function isHunterCombatPhase(phase: BotPhase): phase is 'approach' | 'attackPass' | 'extend' | 'reposition' {
  return phase === 'approach' || phase === 'attackPass' || phase === 'extend' || phase === 'reposition';
}

function hunterForward(player: PlayerState): Vector3 {
  return forwardDirection(player);
}

function hunterTarget(botId: string, player: PlayerState, bot: BotRuntime, now: number): [string, PlayerState] | undefined {
  const targetId = bot.combatTargetId;
  const target = targetId ? players.get(targetId) : undefined;
  if (!targetId || !target || targetId === botId || target.isBot || target.tutorialMode || playerJourneyRunwayPrep.has(targetId) ||
    (player.skyDuelPracticeOwnerId ? targetId !== player.skyDuelPracticeOwnerId || target.skyDuelMatchId !== player.skyDuelMatchId : target.skyDuelMode) ||
    (missionFocusedPlayers.has(targetId) && !allowedFocusedBot(botId, targetId)) ||
    target.cityId !== player.cityId || target.lifeState !== 'alive' || !target.hasRespawnTransform || now - target.lastStateAt >= 1_500 || now < target.spawnProtectedUntil) return undefined;
  return [targetId, target];
}

function hunterHorizontalSeparation(player: PlayerState, target: PlayerState): number {
  return Math.hypot(target.position.x - player.position.x, target.position.z - player.position.z);
}

function hunterInVerticalBlindZone(player: PlayerState, target: PlayerState): boolean {
  const horizontal = hunterHorizontalSeparation(player, target);
  const vertical = Math.abs(target.position.y - player.position.y);
  return horizontal < hunterVerticalBlindHorizontal &&
    vertical >= hunterVerticalBlindMinimum &&
    vertical > horizontal * 0.6;
}

function hunterClearance(bot: BotRuntime): number {
  return bot.journeyAce || bot.journeyDoubleOrdinal ? journeyAceClearance : bot.journeyEscape || bot.journeySiege || bot.journeyBreakout ? journeyEscapeHunterClearance : botCombatClearance;
}

function hunterInterceptWaypoint(player: PlayerState, bot: BotRuntime, target: PlayerState): Vector3 {
  const distance = Math.hypot(target.position.x - player.position.x, target.position.y - player.position.y, target.position.z - player.position.z);
  const leadSeconds = Math.max(0.65, Math.min(1.35, distance / Math.max(70, bot.speed)));
  const velocityLength = Math.hypot(target.velocity.x, target.velocity.y, target.velocity.z);
  const targetEnvelope = aircraftFlightEnvelope[target.aircraftType];
  const targetSpeedCap = targetEnvelope.maxSpeed * (target.boostActive ? targetEnvelope.boostMaxSpeed : 1);
  const velocityScale = velocityLength > targetSpeedCap ? targetSpeedCap / velocityLength : 1;
  return safeBotWaypoint(player.cityId, player.position, {
    x: target.position.x + target.velocity.x * velocityScale * leadSeconds,
    y: target.position.y + target.velocity.y * velocityScale * leadSeconds,
    z: target.position.z + target.velocity.z * velocityScale * leadSeconds,
  }, hunterClearance(bot));
}

function botFireSolution(shooter: PlayerState, target: PlayerState, defender: boolean): { distance: number; vertical: number; angle: number; aimX: number; aimY: number; reason?: string } {
  const muzzle = muzzleTransform(shooter).position;
  const actualDistance = Math.hypot(target.position.x - muzzle.x, target.position.y - muzzle.y, target.position.z - muzzle.z);
  const envelope = aircraftFlightEnvelope[target.aircraftType];
  const targetCap = envelope.maxSpeed * (target.boostActive ? envelope.boostMaxSpeed : 1);
  const targetSpeed = Math.hypot(target.velocity.x, target.velocity.y, target.velocity.z);
  const scale = targetSpeed > targetCap ? targetCap / targetSpeed : 1;
  let leadTime = 0;
  let aimPoint = target.position;
  {
    // Projectile velocity is fixed at launch. Estimate its intercept in a few
    // bounded iterations, then use that one point for the entire ballistic shot.
    for (let iteration = 0; iteration < 3; iteration += 1) {
      const offset = { x: aimPoint.x - muzzle.x, y: aimPoint.y - muzzle.y, z: aimPoint.z - muzzle.z };
      const direction = normalize(offset);
      leadTime = Math.min(defender ? 2.5 : 1.75, Math.hypot(offset.x, offset.y, offset.z) / ballisticShotSpeed(shooter.velocity, direction));
      aimPoint = {
        x: target.position.x + target.velocity.x * scale * leadTime,
        y: target.position.y + target.velocity.y * scale * leadTime,
        z: target.position.z + target.velocity.z * scale * leadTime,
      };
    }
  }
  const offset = { x: aimPoint.x - muzzle.x, y: aimPoint.y - muzzle.y, z: aimPoint.z - muzzle.z };
  const local = {
    x: dot(offset, rotateLocalYxz({ x: 1, y: 0, z: 0 }, shooter.rotation)),
    y: dot(offset, rotateLocalYxz({ x: 0, y: 1, z: 0 }, shooter.rotation)),
    z: -dot(offset, hunterForward(shooter)),
  };
  const distance = Math.hypot(local.x, local.y, local.z);
  const vertical = target.position.y - shooter.position.y;
  const horizontal = Math.hypot(local.x, local.z);
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(hunterForward(shooter), normalize(offset)))));
  const yaw = Math.atan2(local.x, -local.z);
  const pitch = Math.atan2(local.y, horizontal);
  const downwardLimit = defender && vertical < 0 ? defenderDownwardFireAngle : hunterFireCone;
  const reason = local.z >= 0 ? 'NO_FORWARD_SOLUTION'
    : actualDistance > hunterFireRange || distance > hunterFireRange ? 'OUT_OF_RANGE'
    : !defender && angle > hunterFireCone ? 'NO_FORWARD_SOLUTION'
    : Math.abs(yaw) > hunterFireCone ? 'NO_FORWARD_SOLUTION'
    : pitch < -downwardLimit ? 'TOO_VERTICAL'
    : pitch > hunterFireCone ? 'TOO_VERTICAL' : undefined;
  return { distance: actualDistance, vertical, angle, aimX: local.x / Math.max(1, -local.z), aimY: local.y / Math.max(1, -local.z), reason };
}

function moveTowardBot(value: number, target: number, maximumDelta: number): number {
  if (value < target) return Math.min(target, value + maximumDelta);
  return Math.max(target, value - maximumDelta);
}

function botCruiseFactor(personality: BotPersonality): number {
  // Personality changes the mission pace, never the aircraft's physical cap.
  if (personality === 'racer') return 0.82;
  if (personality === 'hunter') return 0.78;
  if (personality === 'explorer') return 0.68;
  return 0.60;
}

function botMinimumTurnRadius(aircraftType: AircraftType, speed: number): number {
  const envelope = aircraftFlightEnvelope[aircraftType];
  const speedRatio = Math.max(0, Math.min(1, speed / envelope.maxSpeed));
  // This is the same yaw + bank-turn authority used by the player update,
  // evaluated at a conservative, flyable bank rather than an arbitrary bot turn.
  const turnRate =
    (0.42 + speedRatio * 0.5) * envelope.yawRate / envelope.inertia +
    Math.sin(0.82) * speedRatio * envelope.bankTurn;
  return Math.max(180, speed / Math.max(0.12, turnRate));
}

function advanceBotFlight(player: PlayerState, bot: BotRuntime, target: Vector3, delta: number): void {
  const envelope = aircraftFlightEnvelope[player.aircraftType];
  const dx = target.x - player.position.x;
  const dy = target.y - player.position.y;
  const dz = target.z - player.position.z;
  const horizontal = Math.hypot(dx, dz);
  const desiredHeading = Math.atan2(-dx, -dz);
  const headingError = wrapAngle(desiredHeading - player.rotation.y);
  const groundY = botRunwayHeight(player.cityId, player.position.x, player.position.z);
  const isGroundLeg = target.y - botRunwayHeight(player.cityId, target.x, target.z) <= 2 && player.position.y - groundY <= 3;
  const previous = { ...player.position };

  if (isGroundLeg || bot.phase === 'taxi') {
    // Ground steering mirrors the player's speed-dependent taxi authority.
    bot.desiredSpeed = Math.min(22, envelope.groundMaxSpeed * 0.5);
    bot.speed = moveTowardBot(
      bot.speed,
      bot.desiredSpeed,
      delta * (bot.speed < bot.desiredSpeed ? envelope.groundAcceleration : envelope.groundDrag),
    );
    const groundTurnRate = (0.12 + Math.min(1, Math.abs(bot.speed) / 20) * 0.72) * envelope.groundSteering;
    player.rotation.y = wrapAngle(player.rotation.y + Math.max(-groundTurnRate * delta, Math.min(groundTurnRate * delta, headingError)));
    player.rotation.x = moveTowardBot(player.rotation.x, target.y > 2 ? 0.08 : 0, envelope.pitchRate * 0.72 * delta);
    player.rotation.z = 0;
    const forward = hunterForward(player);
    const travel = Math.min(bot.speed * delta, horizontal);
    player.position.x += forward.x * travel;
    player.position.z += forward.z * travel;
    player.position.y = groundY + 1.2;
    player.velocity = { x: forward.x * bot.speed, y: 0, z: forward.z * bot.speed };
    return;
  }

  const speedRatio = Math.max(0, Math.min(1, bot.speed / envelope.maxSpeed));
  // A desired heading produces a bank command first.  The resulting bank and
  // the aircraft's yaw authority then turn the nose; bots never slide directly
  // toward a waypoint or rotate their heading in one decision tick.
  const bankTarget = Math.max(-0.82, Math.min(0.82, headingError * 1.2));
  const bankCommand = Math.max(-1, Math.min(1, (bankTarget - player.rotation.z) / 0.82));
  bot.bankControl += (bankCommand - bot.bankControl) * (1 - Math.exp(-envelope.rollInputResponse * delta));
  player.rotation.z = Math.max(-0.82, Math.min(0.82, player.rotation.z + bot.bankControl * envelope.rollRate * delta));
  const yawAuthority = (0.42 + speedRatio * 0.5) * envelope.yawRate / envelope.inertia;
  const coordinatedTurn = Math.sin(player.rotation.z) * speedRatio * envelope.bankTurn;
  const yawCommand = Math.max(-1, Math.min(1, headingError)) * Math.min(1, Math.abs(player.rotation.z) / 0.3);
  const turnStep = (yawCommand * yawAuthority + coordinatedTurn) * delta;
  player.rotation.y = wrapAngle(player.rotation.y + (Math.sign(turnStep) === Math.sign(headingError) && Math.abs(turnStep) > Math.abs(headingError) ? headingError : turnStep));

  const hardTurn = Math.abs(Math.sin(player.rotation.z));
  const escortEncounter = bot.journeyRearGuardEscort && bot.journeyAttemptId ? transportEncounters.get(bot.journeyAttemptId) : undefined;
  const escortPose = escortEncounter ? transportPose(Date.now() - escortEncounter.startedAt, escortEncounter.altitude, escortEncounter.durationMs) : undefined;
  const escortDistance = escortPose ? Math.hypot(player.position.x - escortPose.x, player.position.z - escortPose.z) : 0;
  const cruiseSpeed = escortPose ? Math.min(540, Math.max(250, Math.hypot(escortPose.velocity.x, escortPose.velocity.z) + 80 + escortDistance * 0.1))
    : envelope.maxSpeed * (bot.journeyLeader ? journeyDallas08.leaderCruiseFactor
    : bot.journeyAce || bot.journeyDoubleOrdinal ? journeyAceCruiseFactor : botCruiseFactor(bot.personality));
  // Induced drag during a bank forces a wide, energy-losing turn instead of a
  // full-speed orbit.  The cap is the normal player aircraft maximum, not a bot bonus.
  bot.desiredSpeed = Math.max(envelope.stallSpeed * 1.1, cruiseSpeed * (1 - hardTurn * 0.16));
  const airspeed = Math.max(0.01, bot.speed);
  const drag = (envelope.drag * (airspeed / envelope.maxSpeed) ** 2 * (1 + hardTurn * 0.25)) / envelope.inertia;
  const acceleration = envelope.acceleration / envelope.inertia;
  const speedDelta = bot.desiredSpeed >= bot.speed ? Math.max(0, acceleration - drag) * delta : drag * delta;
  bot.speed = Math.min(envelope.maxSpeed, moveTowardBot(bot.speed, bot.desiredSpeed, speedDelta));

  // A direct angle-to-waypoint commands a full climb until the bot is nearly
  // overhead. At arcade speeds its limited vertical acceleration then takes
  // many seconds to brake, producing multi-kilometre altitude overshoots.
  const verticalResponse = Math.max(8, Math.min(18, acceleration * 0.55));
  const brakingSpeed = Math.sqrt(2 * verticalResponse * Math.abs(dy)) * 0.65;
  const targetVerticalSpeed = Math.sign(dy) * Math.min(bot.speed * 0.3, brakingSpeed);
  const pitchTarget = Math.max(-envelope.maxDivePitch, Math.min(envelope.maxClimbPitch,
    Math.asin(Math.max(-0.9, Math.min(0.9, targetVerticalSpeed / Math.max(1, bot.speed * 0.58))))));
  player.rotation.x = moveTowardBot(player.rotation.x, pitchTarget, envelope.pitchRate * 0.72 * delta);
  const stallFactor = Math.max(0.18, Math.min(1, (bot.speed - envelope.stallSpeed * 0.48) / (envelope.stallSpeed * 0.52)));
  const desiredVerticalSpeed = Math.sin(player.rotation.x) * bot.speed * 0.58 - (1 - stallFactor) * 4.5;
  player.velocity.y = moveTowardBot(player.velocity.y, desiredVerticalSpeed, verticalResponse * delta);
  const forward = hunterForward(player);
  const nextX = player.position.x + forward.x * bot.speed * delta;
  const nextZ = player.position.z + forward.z * bot.speed * delta;
  const nextPosition = bot.journeyAttemptId && !bot.journeyLeader && !bot.journeyRearGuardEscort ? keepJourneyHunterInside({ x: nextX, z: nextZ }) : { x: nextX, z: nextZ };
  if (bot.journeyRearGuardEscort && bot.journeyAttemptId) {
    const encounter = transportEncounters.get(bot.journeyAttemptId);
    if (encounter) {
      const transport = transportPose(Date.now() - encounter.startedAt, encounter.altitude, encounter.durationMs);
      const dx = nextPosition.x - transport.x, dz = nextPosition.z - transport.z;
      const distance = Math.hypot(dx, dz), safeDistance = transportFootprintRadius + 120;
      if (distance < safeDistance) {
        const side = bot.journeyRearGuardEscort === 1 ? -1 : 1;
        const ux = distance > 1 ? dx / distance : Math.cos(transport.yaw) * side;
        const uz = distance > 1 ? dz / distance : -Math.sin(transport.yaw) * side;
        nextPosition.x = transport.x + ux * safeDistance;
        nextPosition.z = transport.z + uz * safeDistance;
      }
    }
    for (const other of players.values()) {
      if (other === player || other.lifeState !== 'alive' || !other.bot?.journeyRearGuardEscort || other.bot.journeyAttemptId !== bot.journeyAttemptId) continue;
      const dx = nextPosition.x - other.position.x, dz = nextPosition.z - other.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 90) {
        const side = bot.journeyRearGuardEscort === 1 ? -1 : 1;
        nextPosition.x = other.position.x + (distance > 1 ? dx / distance : side) * 90;
        nextPosition.z = other.position.z + (distance > 1 ? dz / distance : 0) * 90;
      }
    }
  }
  const clearance = bot.journeyAce || bot.journeyDoubleOrdinal ? journeyAceClearance : bot.journeyEscape || bot.journeySiege || bot.journeyBreakout ? journeyEscapeHunterClearance
    : isHunterCombatPhase(bot.phase) ? botCombatClearance : bot.phase === 'takeoff' || bot.phase === 'land' ? 2 : botCruiseClearance;
  const safeFloor = Math.max(
    botSafeFloor(player.cityId, player.position.x, player.position.z, clearance),
    botSafeFloor(player.cityId, (player.position.x + nextPosition.x) * 0.5, (player.position.z + nextPosition.z) * 0.5, clearance),
    botSafeFloor(player.cityId, nextPosition.x, nextPosition.z, clearance),
  );
  player.position.x = nextPosition.x;
  player.position.z = nextPosition.z;
  const nextY = player.position.y + player.velocity.y * delta;
  player.position.y = Math.max(safeFloor, nextY);
  // Terrain clearance is a positional safety correction, not lift. Turning
  // its displacement into velocity could launch a bot far above combat.
  if (player.position.y > nextY) player.velocity.y = 0;
  player.velocity.x = (player.position.x - previous.x) / delta;
  player.velocity.z = (player.position.z - previous.z) / delta;
}

function provokeJourneyHunter(pilotId: string, pilot: PlayerState, targetId: string, now: number): void {
  const hunter = players.get(targetId);
  const bot = hunter?.bot;
  if (!hunter || !bot?.journeyAttemptId || bot.journeyTargetPlayerId !== pilotId || bot.journeyProvoked ||
    hunter.lifeState !== 'alive' || playerJourneyAttempts.get(pilotId) !== bot.journeyAttemptId) return;
  const attempt = journeyStore.get(pilot.pilotId, bot.journeyAttemptId);
  if ((attempt?.missionId !== journeyDallas14.id && attempt?.missionId !== journeyDallas15.id && attempt?.missionId !== journeyDallas16.id && attempt?.missionId !== journeyDallas18.id && attempt?.missionId !== journeyDallas19.id && attempt?.missionId !== journeyDallas23.id && attempt?.missionId !== journeyDallas24.id) || attempt.status !== 'RACING' ||
    attempt.targetId !== targetId && attempt.secondaryTargetId !== targetId) return;
  if (attempt.missionId === journeyDallas24.id && attempt.legendaryPhase !== 'ACE') return;
  if (attempt.missionId === journeyDallas23.id && (bot.journeyDoubleOrdinal === 1
    ? attempt.doublePhase !== 'FIRST_FIGHT' || attempt.targetId !== targetId
    : attempt.doublePhase !== 'FINAL_FIGHT' || attempt.secondaryTargetId !== targetId)) return;
  if (attempt.missionId === journeyDallas15.id &&
    (!playerJourneyLoveTakeoff.has(pilotId) || playerJourneyRunwayPrep.has(pilotId))) return;
  bot.journeyProvoked = true;
  beginHunterApproach(hunter, bot, pilotId, pilot, now);
  sendJourneyState(pilotId, attempt);
}

function beginHunterApproach(player: PlayerState, bot: BotRuntime, targetId: string, target: PlayerState, now: number): void {
  const forward = hunterForward(player);
  const offsetX = target.position.x - player.position.x;
  const offsetZ = target.position.z - player.position.z;
  const cross = forward.x * offsetZ - forward.z * offsetX;
  bot.combatTargetId = targetId;
  bot.combatTurnSign = cross >= 0 ? 1 : -1;
  bot.combatWaypoint = hunterInterceptWaypoint(player, bot, target);
  bot.combatWaypointRefreshAt = now + (player.skyDuelPracticeOwnerId ? skyDuelAiTuning.waypointRefreshMs : 1_100);
  bot.blindZoneEscapeUntil = 0;
  const distance = Math.hypot(target.position.x - player.position.x, target.position.y - player.position.y, target.position.z - player.position.z);
  bot.combatPhaseUntil = now + Math.min(25_000, Math.max(8_000, distance / Math.max(70, bot.speed) * 1_400));
  bot.attackFireAfter = now + (player.skyDuelPracticeOwnerId ? skyDuelAiTuning.reactionDelayMs : hunterReactionDelayMs + Math.random() * 320);
  bot.phase = 'approach';
}

function beginHunterAttackPass(player: PlayerState, bot: BotRuntime, target: PlayerState, now: number): void {
  const forward = hunterForward(player);
  const beyond = bot.journeyAttemptId ? 3_000 : 1_000;
  // Freeze a point beyond the target. The pilot commits through the merge,
  // rather than steering back as soon as the target crosses the nose.
  bot.combatWaypoint = safeBotWaypoint(player.cityId, player.position, {
    x: target.position.x + forward.x * beyond,
    y: target.position.y,
    z: target.position.z + forward.z * beyond,
  }, hunterClearance(bot));
  const passDistance = Math.hypot(target.position.x - player.position.x, target.position.z - player.position.z) + beyond;
  bot.combatPhaseUntil = now + Math.max(2_800, Math.min(13_000, passDistance / Math.max(90, bot.speed) * 1_250));
  // A Hunter needs a beat to recognize the opening; this prevents instant,
  // perfect fire exactly when it transitions into a pass.
  bot.attackShots = 0;
  bot.noFireReason = undefined;
  bot.nextFireAt = Math.max(now, bot.attackFireAfter);
  bot.phase = 'attackPass';
}

function beginHunterExtend(player: PlayerState, bot: BotRuntime, now: number): void {
  if (stabilityDiagnosticsEnabled && bot.phase === 'attackPass' && !bot.attackShots) {
    console.log(`HUNTER_NO_FIRE ${bot.noFireReason ?? 'window_closed'} target=${bot.combatTargetId ?? 'none'}`);
  }
  const forward = hunterForward(player);
  const separation = bot.journeyAttemptId ? 3_000 : Math.max(1_800, Math.min(3_000,
    botMinimumTurnRadius(player.aircraftType, Math.max(bot.speed, aircraftFlightEnvelope[player.aircraftType].stallSpeed * 1.2)) * 2.2));
  bot.combatWaypoint = safeBotWaypoint(player.cityId, player.position, {
    x: player.position.x + forward.x * separation,
    y: player.position.y,
    z: player.position.z + forward.z * separation,
  }, hunterClearance(bot));
  bot.combatPhaseUntil = now + Math.max(3_600, separation / Math.max(1, bot.speed) * 1_000);
  bot.phase = 'extend';
}

function beginHunterBlindZoneExtend(
  player: PlayerState,
  bot: BotRuntime,
  target: PlayerState,
  now: number,
  reason: 'vertical_blind_zone' | 'insufficient_horizontal' = 'vertical_blind_zone',
): void {
  const horizontal = hunterHorizontalSeparation(player, target);
  const vertical = Math.abs(target.position.y - player.position.y);
  const forward = hunterForward(player);
  const side = { x: -forward.z * bot.combatTurnSign, z: forward.x * bot.combatTurnSign };
  let escapeX = player.position.x - target.position.x;
  let escapeZ = player.position.z - target.position.z;
  const escapeLength = Math.hypot(escapeX, escapeZ);
  if (escapeLength >= 40) {
    escapeX /= escapeLength;
    escapeZ /= escapeLength;
  } else {
    // With no useful horizontal bearing, commit forward and sideways. This
    // creates separation without an impossible pivot or vertical-only orbit.
    escapeX = forward.x * 0.75 + side.x * 0.66;
    escapeZ = forward.z * 0.75 + side.z * 0.66;
    const length = Math.hypot(escapeX, escapeZ);
    escapeX /= length;
    escapeZ /= length;
  }
  const separation = Math.max(
    bot.journeyAttemptId ? 3_000 : hunterMinimumHorizontalSeparation * 1.2,
    botMinimumTurnRadius(player.aircraftType, Math.max(bot.speed, aircraftFlightEnvelope[player.aircraftType].stallSpeed * 1.2)) * 2,
  );
  bot.combatWaypoint = safeBotWaypoint(player.cityId, player.position, {
    x: target.position.x + escapeX * separation,
    y: target.position.y + Math.max(-90, Math.min(90, player.position.y - target.position.y)),
    z: target.position.z + escapeZ * separation,
  }, hunterClearance(bot));
  bot.combatPhaseUntil = now + Math.max(hunterBlindZoneEscapeMs, separation / Math.max(1, bot.speed) * 1_200);
  bot.blindZoneEscapeUntil = bot.combatPhaseUntil;
  bot.phase = 'extend';
  if (stabilityDiagnosticsEnabled) {
    console.log(`HUNTER_REPOSITION reason=${reason} horiz=${Math.round(horizontal)}m vertical=${Math.round(vertical)}m target=${bot.combatTargetId ?? 'none'}`);
  }
}

function beginHunterReposition(player: PlayerState, bot: BotRuntime, target: PlayerState | undefined, now: number): void {
  if (bot.journeyDoubleOrdinal === 2) bot.combatTurnSign = bot.combatTurnSign === 1 ? -1 : 1;
  const forward = target ? hunterForward(target) : hunterForward(player);
  const side = { x: -forward.z * bot.combatTurnSign, z: forward.x * bot.combatTurnSign };
  // A broad offset forces real separation and a flyable turn radius before
  // another approach is considered. Anchor it around the target so a vertical
  // stack cannot satisfy repositioning through altitude difference alone.
  const radius = Math.max(
    bot.journeyAttemptId ? 3_000 : hunterMinimumHorizontalSeparation,
    botMinimumTurnRadius(player.aircraftType, Math.max(bot.speed, aircraftFlightEnvelope[player.aircraftType].stallSpeed * 1.2)) * 1.35,
  );
  const origin = target?.position ?? player.position;
  bot.combatWaypoint = safeBotWaypoint(player.cityId, player.position, {
    x: origin.x - forward.x * radius * 0.7 + side.x * radius,
    y: origin.y + (bot.combatTurnSign > 0 ? 70 : -70),
    z: origin.z - forward.z * radius * 0.7 + side.z * radius,
  }, hunterClearance(bot));
  const waypointDistance = Math.hypot(
    bot.combatWaypoint.x - player.position.x,
    bot.combatWaypoint.y - player.position.y,
    bot.combatWaypoint.z - player.position.z,
  );
  bot.combatPhaseUntil = now + Math.max(5_200, waypointDistance / Math.max(1, bot.speed) * 1_500);
  bot.phase = 'reposition';
}

function clearHunterCombat(player: PlayerState, bot: BotRuntime): void {
  bot.combatTargetId = undefined;
  bot.combatWaypoint = undefined;
  bot.combatPhaseUntil = 0;
  bot.combatWaypointRefreshAt = 0;
  bot.attackFireAfter = 0;
  bot.blindZoneEscapeUntil = 0;
  if (isHunterCombatPhase(bot.phase)) bot.phase = 'cruise';
}

function hunterNavigationTarget(botId: string, player: PlayerState, bot: BotRuntime, now: number): { waypoint: Vector3; target?: [string, PlayerState] } | undefined {
  if (player.cityId !== 'milwaukee' && bot.personality !== 'hunter' && !bot.defenseTerritoryId) return undefined;
  if (player.skyDuelPracticeOwnerId && (bot.phase === 'taxi' || bot.phase === 'takeoff')) return undefined;
  if (bot.journeyAttemptId && !bot.journeyProvoked) {
    clearHunterCombat(player, bot);
    return undefined;
  }
  const missionPilot = bot.journeyTargetPlayerId ? players.get(bot.journeyTargetPlayerId) : undefined;
  if (bot.journeyRearGuardEscort && (bot.escortReturnUntil ?? 0) > now) {
    clearHunterCombat(player, bot);
    return undefined;
  }
  if (missionPilot && !bot.journeyRearGuardEscort && !insideJourneyHunterArena(missionPilot.position)) {
    bot.journeyPilotOutside = true;
    clearHunterCombat(player, bot);
    return { waypoint: safeBotWaypoint(player.cityId, player.position,
      { ...boundJourneyHunterPoint(missionPilot.position), y: player.position.y }, hunterClearance(bot)) };
  }
  if (bot.journeyPilotOutside) {
    bot.journeyPilotOutside = false;
    bot.journeyReturnGraceUntil = now + 30_000;
    clearHunterCombat(player, bot);
  }
  let target = hunterTarget(botId, player, bot, now);
  if (!isHunterCombatPhase(bot.phase)) {
    const assigned = bot.defenseTargetId ? players.get(bot.defenseTargetId) : undefined;
    const journeyTarget = missionPilot;
    const availableJourneyTarget = journeyTarget && (!missionFocusedPlayers.has(bot.journeyTargetPlayerId!) || assignedFocusedHunter(botId, bot.journeyTargetPlayerId!)) &&
      journeyTarget.cityId === player.cityId && journeyTarget.lifeState === 'alive' &&
      journeyTarget.hasRespawnTransform && !playerJourneyRunwayPrep.has(bot.journeyTargetPlayerId!) && now - journeyTarget.lastStateAt < 1_500
      ? [bot.journeyTargetPlayerId!, journeyTarget] as [string, PlayerState] : undefined;
    const candidate: [string, PlayerState] | undefined = bot.defenseTerritoryId && assigned &&
      (!missionFocusedPlayers.has(bot.defenseTargetId!) || allowedFocusedBot(botId, bot.defenseTargetId!)) && assigned.lifeState === 'alive' &&
      assigned.cityId === player.cityId && !assigned.isBot && !assigned.tutorialMode && now < (bot.defenseReleaseAt ?? 0)
      ? [bot.defenseTargetId!, assigned] : availableJourneyTarget ?? botCombatTarget(botId, player, now);
    if (!candidate) return undefined;
    beginHunterApproach(player, bot, candidate[0], candidate[1], now);
    target = candidate;
  }

  if (bot.phase === 'approach') {
    if (!target) {
      clearHunterCombat(player, bot);
      return undefined;
    }
    if (hunterInVerticalBlindZone(player, target[1])) {
      beginHunterBlindZoneExtend(player, bot, target[1], now);
      target = undefined;
    } else {
      if (!botFireSolution(player, target[1], Boolean(bot.defenseTerritoryId)).reason) {
        beginHunterAttackPass(player, bot, target[1], now);
      } else if (now >= bot.combatPhaseUntil) {
        // A timeout is not a firing solution. Make a wide reposition instead.
        beginHunterReposition(player, bot, target[1], now);
      } else if (now >= bot.combatWaypointRefreshAt) {
        // Intercept updates are deliberately sparse and retain the same target.
        bot.combatWaypoint = hunterInterceptWaypoint(player, bot, target[1]);
        bot.combatWaypointRefreshAt = now + (player.skyDuelPracticeOwnerId ? skyDuelAiTuning.waypointRefreshMs : 1_100);
      }
    }
  } else if (bot.phase === 'attackPass') {
    if (now >= bot.combatPhaseUntil || (bot.combatWaypoint && Math.hypot(bot.combatWaypoint.x - player.position.x, bot.combatWaypoint.y - player.position.y, bot.combatWaypoint.z - player.position.z) < 100)) {
      beginHunterExtend(player, bot, now);
      if (bot.journeyRearGuardEscort) bot.escortReturnUntil = now + 4_000;
      target = undefined;
    }
  } else if (bot.phase === 'extend') {
    if (now >= bot.combatPhaseUntil || (bot.combatWaypoint && Math.hypot(bot.combatWaypoint.x - player.position.x, bot.combatWaypoint.y - player.position.y, bot.combatWaypoint.z - player.position.z) < 130)) {
      beginHunterReposition(player, bot, target?.[1], now);
      target = undefined;
    }
  } else if (bot.phase === 'reposition' && (now >= bot.combatPhaseUntil || (bot.combatWaypoint && Math.hypot(bot.combatWaypoint.x - player.position.x, bot.combatWaypoint.y - player.position.y, bot.combatWaypoint.z - player.position.z) < 140))) {
    if (target && (bot.journeyTargetPlayerId === target[0] ||
      Math.hypot(target[1].position.x - player.position.x, target[1].position.z - player.position.z) < hunterPursuitRange)) {
      const horizontal = hunterHorizontalSeparation(player, target[1]);
      if (horizontal < (bot.journeyAttemptId ? 3_000 : hunterMinimumHorizontalSeparation) || now < bot.blindZoneEscapeUntil) {
        beginHunterBlindZoneExtend(
          player,
          bot,
          target[1],
          now,
          hunterInVerticalBlindZone(player, target[1]) || now < bot.blindZoneEscapeUntil
            ? 'vertical_blind_zone'
            : 'insufficient_horizontal',
        );
      } else {
        bot.blindZoneEscapeUntil = 0;
        beginHunterApproach(player, bot, target[0], target[1], now);
      }
    } else {
      clearHunterCombat(player, bot);
      return undefined;
    }
  }

  // The same forward-cone and cooldown validation applies throughout a
  // committed maneuver: a defender may take a legal shot during approach or
  // a wide turn, but cannot fire backward while extending away.
  return bot.combatWaypoint ? { waypoint: bot.combatWaypoint, target } : undefined;
}

function updateBots(now: number): void {
  updateTrainingTargets(now);
  for (const [playerId, attemptId] of playerJourneyAttempts) {
    if (pausedJourneyAttempts.has(attemptId)) continue;
    const pilot = players.get(playerId);
    const active = pilot && journeyStore.get(pilot.pilotId, attemptId);
    if (pilot && active?.missionId === journeyDallas14.id) ensureJourneyEscapeHunter(playerId, pilot, active, now);
    if (pilot && active?.missionId === journeyDallas15.id) ensureJourneyAce(playerId, pilot, active, now);
    if (pilot && active?.missionId === journeyDallas16.id) ensureJourneyCrossfire(playerId, pilot, active, now);
    if (pilot && active?.missionId === journeyDallas18.id) ensureJourneySiegeHunter(playerId, pilot, active, now);
    if (pilot && active?.missionId === journeyDallas23.id) ensureJourneyDouble(playerId, pilot, active, now);
    if (pilot && active?.missionId === journeyDallas24.id) ensureJourneyLegendary(playerId, pilot, active, now);
  }
  const delta = botTickMs / 1000;
  for (const [botId, player] of players) {
    const bot = player.bot;
    if (!player.isBot || !bot) continue;
    if (player.skyDuelPracticeOwnerId) {
      const session = player.skyDuelMatchId ? skyDuelSessions.get(player.skyDuelMatchId) : undefined;
      if (!session || session.phase === 'loading' || session.phase === 'countdown' || session.phase === 'launch') continue;
    }
    if (bot.journeyAttemptId && pausedJourneyAttempts.has(bot.journeyAttemptId)) continue;
    if (player.lifeState === 'destroyed') {
      if (player.skyDuelPracticeOwnerId) continue;
      const missionPilot = bot.journeyTargetPlayerId ? players.get(bot.journeyTargetPlayerId) : undefined;
      if (missionPilot && bot.journeyAttemptId && (journeyStore.get(missionPilot.pilotId, bot.journeyAttemptId)?.missionId === journeyDallas09.id ||
        journeyStore.get(missionPilot.pilotId, bot.journeyAttemptId)?.missionId === journeyDallas10.id ||
        journeyStore.get(missionPilot.pilotId, bot.journeyAttemptId)?.missionId === journeyDallas12.id ||
        journeyStore.get(missionPilot.pilotId, bot.journeyAttemptId)?.missionId === journeyDallas14.id ||
        journeyStore.get(missionPilot.pilotId, bot.journeyAttemptId)?.missionId === journeyDallas15.id ||
        journeyStore.get(missionPilot.pilotId, bot.journeyAttemptId)?.missionId === journeyDallas08.id ||
        journeyStore.get(missionPilot.pilotId, bot.journeyAttemptId)?.missionId === journeyDallas16.id ||
        journeyStore.get(missionPilot.pilotId, bot.journeyAttemptId)?.missionId === journeyDallas18.id ||
        journeyStore.get(missionPilot.pilotId, bot.journeyAttemptId)?.missionId === journeyDallas19.id ||
        journeyStore.get(missionPilot.pilotId, bot.journeyAttemptId)?.missionId === journeyDallas23.id ||
        journeyStore.get(missionPilot.pilotId, bot.journeyAttemptId)?.missionId === journeyDallas24.id)) {
        removeBot(botId);
        continue;
      }
      if (now < bot.respawnAt) continue;
      const airports = botAirports(player.cityId);
      const airport = airports[bot.homeAirportIndex % airports.length];
      player.position = { x: airport.x, y: botRunwayHeight(player.cityId, airport.x, airport.z) + 1.2, z: airport.z + airport.runwayLength * 0.34 };
      player.rotation = { x: 0, y: airport.heading, z: 0 };
      player.velocity = { x: 0, y: 0, z: 0 };
      player.health = maxHealthForAircraft(player.aircraftType);
      player.lifeState = 'respawning';
      player.hasRespawnTransform = true;
      player.spawnProtectedUntil = now + 1_500;
      bot.phase = 'taxi';
      bot.speed = 0;
      bot.combatTargetId = undefined;
      bot.defenseTerritoryId = undefined;
      bot.defenseTargetId = undefined;
      bot.defenseReleaseAt = undefined;
      bot.combatWaypoint = undefined;
      bot.combatPhaseUntil = 0;
      bot.combatWaypointRefreshAt = 0;
      bot.attackFireAfter = 0;
      bot.blindZoneEscapeUntil = 0;
      bot.bankControl = 0;
      bot.route = airportRoute(player.cityId, bot.homeAirportIndex, bot.personality);
      bot.routeIndex = 0;
      broadcastToCity(player.cityId, botStateMessage(botId, player, 'playerState'));
      continue;
    }
    if (player.lifeState !== 'alive') continue;

    const activeEvent = cityEvents.get(player.cityId);
    if (now >= bot.nextDecisionAt) {
      bot.nextDecisionAt = now + 5_000 + Math.random() * 4_000;
      if (!player.skyDuelMode && !bot.journeyAttemptId && activeEvent?.lifecycle === 'active' && bot.personality !== 'casual' && !isHunterCombatPhase(bot.phase) && Math.random() < 0.45) {
        activeEvent.participants.add(botId);
        bot.route = [safeBotWaypoint(player.cityId, player.position, { x: activeEvent.objective.x, y: activeEvent.objective.y + 420, z: activeEvent.objective.z }, botCruiseClearance), ...airportRoute(player.cityId, bot.homeAirportIndex, bot.personality).slice(-2)];
        bot.routeIndex = 0;
        bot.phase = 'activity';
      }
    }

    if (bot.journeyRearGuardEscort && bot.journeyAttemptId) {
      const encounter = transportEncounters.get(bot.journeyAttemptId);
      if (encounter) {
        const pose = transportPose(now - encounter.startedAt + 2_000, encounter.altitude, encounter.durationMs);
        const side = bot.journeyRearGuardEscort % 2 ? -1 : 1;
        const formation = bot.journeyRearGuardEscort >= 3
          ? reinforcementApproachPoint(pose, bot.journeyRearGuardEscort as 3 | 4, 'formation')
          : { x: pose.x + Math.cos(pose.yaw) * side * 850 + Math.sin(pose.yaw) * 350,
              y: pose.y + 150,
              z: pose.z - Math.sin(pose.yaw) * side * 850 + Math.cos(pose.yaw) * 350 };
        bot.route[0] = safeBotWaypoint(player.cityId, player.position, formation, journeyAceClearance);
        bot.routeIndex = 0;
      }
    }
    const previousPhase = bot.phase;
    const combatNavigation = hunterNavigationTarget(botId, player, bot, now);
    if (stabilityDiagnosticsEnabled && (bot.personality === 'hunter' || bot.defenseTerritoryId) && previousPhase !== bot.phase) {
      const tracked = bot.combatTargetId ? players.get(bot.combatTargetId) : undefined;
      console.log(`HUNTER target=${bot.combatTargetId ?? 'none'} state=${bot.phase} dist=${tracked ? Math.round(Math.hypot(tracked.position.x - player.position.x, tracked.position.y - player.position.y, tracked.position.z - player.position.z)) : '-'}`);
    }
    const combatTarget = combatNavigation?.target;
    const combatSolution = combatTarget ? botFireSolution(player, combatTarget[1], Boolean(bot.defenseTerritoryId)) : undefined;
    const canAttack = !bot.journeyAttemptId || bot.journeyProvoked === true;
    if (bot.journeyCrossfire && bot.journeyAttemptId && (!canAttack || !combatTarget || !combatSolution || combatSolution.reason))
      crossfireFireCoordinators.get(bot.journeyAttemptId)?.revoke(botId, now);
    const botLockTargetId = canAttack && combatTarget && combatSolution && !combatSolution.reason &&
      combatTarget[1].lifeState === 'alive' && now >= combatTarget[1].spawnProtectedUntil
      ? combatTarget[0]
      : undefined;
    // Bot warning state reuses the active combat target and the exact firing
    // solution below. Proximity and radar presence never create a lock.
    setServerLock(botId, player, botLockTargetId);
    if (canAttack && combatTarget && combatSolution && (bot.journeyRearGuardEscort || now >= Math.max(bot.nextFireAt, bot.attackFireAfter))) {
      const [targetId, target] = combatTarget;
      const solution = combatSolution;
      // Attack-pass shots use the normal ballistic projectile pipeline. The
      // separate, modest bot cone and random dispersion create pressure
      // without granting a bot the player's assisted LOCKED-hit contract.
      const canShoot = !target.isBot && target.lifeState === 'alive' && now >= target.spawnProtectedUntil &&
        !solution.reason;
      const crossfireAllowed = !bot.journeyCrossfire || Boolean(bot.journeyAttemptId &&
        crossfireFireCoordinators.get(bot.journeyAttemptId)?.canInitiate(botId, canShoot, now));
      const escortFire = bot.journeyRearGuardEscort && bot.journeyAttemptId ? rearGuardFire.get(bot.journeyAttemptId) : undefined;
      const escortAttempt = escortFire ? journeyStore.get(combatTarget[1].pilotId, bot.journeyAttemptId!) : undefined;
      const escortAlive = escortAttempt ? [escortAttempt.targetId, escortAttempt.secondaryTargetId,
        ...(escortAttempt.missionId === journeyDallas09.id ? reinforcementWaves.get(escortAttempt.attemptId)?.ids ?? [] : [])]
        .map(id => Boolean(id && players.get(id)?.lifeState === 'alive')) : [];
      const escortAllowed = !bot.journeyRearGuardEscort || Boolean(escortFire &&
        rearGuardShooter(escortFire, now, escortAlive) === bot.journeyRearGuardEscort);
      if (canShoot && crossfireAllowed && escortAllowed && (player.skyDuelPracticeOwnerId || bot.journeyRearGuardEscort || Math.random() < (bot.defenseTerritoryId ? 0.92 : 0.84))) {
        // Sky Duel's fallback AI has tighter aim; other Hunters keep their
        // existing spread and all shots remain server-owned ballistics.
        const spread = player.skyDuelPracticeOwnerId ? skyDuelAiTuning.aimSpread : bot.defenseTerritoryId ? 0.01 : bot.journeyAttemptId ? 0.014 : 0.028;
        const variance = (Math.random() - 0.5) * spread;
        if (createProjectile(botId, player, undefined, undefined, { x: solution.aimX + variance, y: solution.aimY + variance * 0.45 },
          bot.journeyRearGuardEscort ? journeyDallas08.escortShotDamage : undefined)) {
          if (escortFire) rearGuardShotResolved(escortFire, now);
          bot.attackShots = (bot.attackShots ?? 0) + 1;
          bot.noFireReason = undefined;
          if (player.lockedTargetId === targetId) sendIncomingFire(targetId, botId);
          if (stabilityDiagnosticsEnabled && bot.defenseTerritoryId && bot.attackShots === 1) {
            console.info(`DEFENDER_FIRE dist=${Math.round(solution.distance)} vertical=${Math.round(solution.vertical)} angle=${Math.round(solution.angle * 180 / Math.PI)} agl=${Math.round(player.position.y - botTerrainHeight(player.cityId, player.position.x, player.position.z))} phase=${bot.phase}`);
          }
        } else bot.noFireReason = 'cooldown_protection_or_capacity';
      } else {
        bot.noFireReason = !canShoot ? solution.reason ?? 'PROTECTED' : !crossfireAllowed ? 'COORDINATED_HOLD' : 'burst_pause';
      }
      if (stabilityDiagnosticsEnabled && bot.noFireReason && now - (bot.noFireLoggedAt ?? 0) >= 2_000) {
        bot.noFireLoggedAt = now;
        if (bot.defenseTerritoryId) console.log(`DEFENDER_NO_FIRE dist=${Math.round(solution.distance)} vertical=${Math.round(solution.vertical)} angle=${Math.round(solution.angle * 180 / Math.PI)} reason=${bot.noFireReason}`);
        else console.log(`HUNTER_NO_FIRE ${bot.noFireReason} target=${bot.combatTargetId}`);
      }
      if (!bot.journeyRearGuardEscort) {
        const nextShotDelay = !canShoot ? 260 : player.skyDuelPracticeOwnerId
          ? skyDuelAiTuning.shotIntervalMs : hunterShotIntervalMinMs + Math.random() * hunterShotIntervalJitterMs;
        bot.nextFireAt = now + nextShotDelay;
      }
    }

    const followingCombatWaypoint = Boolean(combatNavigation);
    const requestedTarget = combatNavigation?.waypoint ?? bot.route[Math.min(bot.routeIndex, bot.route.length - 1)];
    const target = requestedTarget && bot.journeyAttemptId && !bot.journeyLeader && !bot.journeyRearGuardEscort
      ? { ...requestedTarget, ...journeyHunterSteeringTarget(player.position, hunterForward(player), requestedTarget) }
      : requestedTarget;
    if (!target) continue;
    const dx = target.x - player.position.x;
    const dy = target.y - player.position.y;
    const dz = target.z - player.position.z;
    const horizontal = Math.hypot(dx, dz);
    const distance = Math.hypot(horizontal, dy);
    // Begin the leader's next turn before reaching the waypoint so it does
    // not steer back toward the old point after carrying past it.
    const arrivalRadius = bot.journeyLeader
      ? Math.max(26, bot.speed * delta * 1.25, botMinimumTurnRadius(player.aircraftType, bot.speed) * 0.75)
      : Math.max(26, bot.speed * delta * 1.25);
    if (!followingCombatWaypoint && distance <= arrivalRadius) {
      bot.routeIndex += 1;
      if (bot.phase === 'taxi') bot.phase = 'takeoff';
      if (bot.routeIndex === bot.route.length - 1 && !bot.journeyAttemptId && !player.skyDuelMode) bot.phase = 'land';
      if (bot.routeIndex >= bot.route.length) {
        if (player.skyDuelPracticeOwnerId || bot.journeyAttemptId && (!bot.journeyProvoked || bot.journeyAce || bot.journeyCrossfire || bot.journeyDoubleOrdinal || bot.journeyRearGuardEscort)) {
          bot.routeIndex = player.skyDuelPracticeOwnerId ? 2 : 0;
          bot.phase = 'cruise';
        } else {
          bot.homeAirportIndex = (bot.homeAirportIndex + 1) % botAirports(player.cityId).length;
          bot.route = airportRoute(player.cityId, bot.homeAirportIndex, bot.personality);
          bot.routeIndex = 0;
          bot.phase = 'taxi';
        }
      }
      // The Journey Hunter keeps flying through patrol turns. A zero-velocity
      // tick here made its authoritative transform pause for 200 ms per corner.
      const nextPatrolWaypoint = bot.journeyAttemptId && !bot.journeyProvoked ? bot.route[bot.routeIndex] : undefined;
      if (nextPatrolWaypoint) {
        advanceBotFlight(player, bot, bot.journeyLeader ? nextPatrolWaypoint : {
          ...nextPatrolWaypoint, ...journeyHunterSteeringTarget(player.position, hunterForward(player), nextPatrolWaypoint),
        }, delta);
      } else {
        player.velocity = { x: 0, y: 0, z: 0 };
      }
    } else {
      advanceBotFlight(player, bot, target, delta);
      if (player.position.y >= botSafeFloor(player.cityId, player.position.x, player.position.z, botCruiseClearance) && bot.phase === 'takeoff') bot.phase = 'cruise';
    }
    player.lastStateAt = now;
    player.hasRespawnTransform = true;
    if (player.skyDuelPracticeOwnerId) sendToPlayer(player.skyDuelPracticeOwnerId, botStateMessage(botId, player));
    else if (bot.journeyRearGuardEscort && bot.journeyTargetPlayerId) sendToPlayer(bot.journeyTargetPlayerId, botStateMessage(botId, player));
    else broadcastToCity(player.cityId, botStateMessage(botId, player));
  }
  updateJourneyEscape(now);
}

function groundedAtAirport(player: PlayerState): { id: string } | undefined {
  if (Math.hypot(player.velocity.x, player.velocity.z) > repairAirportGroundSpeed) return undefined;
  for (const airport of cityAirports[player.cityId]) {
    const groundY = player.cityId === 'dallas' ? dallasAirportElevations.get(airport.id)! : 0;
    if (Math.abs(player.position.y - groundY) > repairAirportGroundAltitude) continue;
    const dx = player.position.x - airport.x;
    const dz = player.position.z - airport.z;
    const along = dx * Math.sin(airport.heading) + dz * Math.cos(airport.heading);
    const lateral = dx * Math.cos(airport.heading) - dz * Math.sin(airport.heading);
    if (Math.abs(along) <= airport.runwayLength * 0.5 + 150 &&
      Math.abs(lateral) <= Math.max(110, airport.runwayWidth * 3)) return airport;
  }
  return undefined;
}

function runwayOrTaxiSpawnArea(player: PlayerState): { id: string } | undefined {
  for (const airport of cityAirports[player.cityId]) {
    const groundY = player.cityId === 'dallas' ? dallasAirportElevations.get(airport.id)! : 0;
    if (Math.abs(player.position.y - groundY) > 6) continue;
    const dx = player.position.x - airport.x;
    const dz = player.position.z - airport.z;
    const along = dx * Math.sin(airport.heading) + dz * Math.cos(airport.heading);
    const lateral = dx * Math.cos(airport.heading) - dz * Math.sin(airport.heading);
    if (Math.abs(along) <= airport.runwayLength * 0.5 + 150 &&
      Math.abs(lateral) <= Math.max(110, airport.runwayWidth * 3)) return airport;
  }
  return undefined;
}

function safeRespawnTransform(playerId: string, player: PlayerState, now: number): { position: Vector3; heading: number } {
  const activeAttemptId = playerJourneyAttempts.get(playerId);
  const activeAttempt = activeAttemptId ? journeyStore.get(player.pilotId, activeAttemptId) : undefined;
  const missionAirportId = activeAttempt?.missionId === journeyDallas21.id ? journeyDallas21.startAirportId
    : activeAttempt?.missionId === journeyDallas20.id ? journeyDallas20.startAirportId
    : activeAttempt?.missionId === journeyDallas18.id ? journeyDallas18.startAirportId
    : activeAttempt?.missionId === journeyDallas16.id ? journeyDallas16.startAirportId
    : activeAttempt?.missionId === journeyDallas15.id ? journeyDallas15.startAirportId
    : activeAttempt?.missionId === journeyDallas09.id ? journeyDallas09.startAirportId
    : activeAttempt?.missionId === journeyDallas14.id ? journeyDallas14.startAirportId
    : activeAttempt?.missionId === journeyDallas13.id ? journeyDallas13.startAirportId
    : activeAttempt?.missionId === journeyDallas12.id ? journeyDallas12.startAirportId
    : activeAttempt?.missionId === journeyDallas11.id ? journeyDallas11.startAirportId
    : activeAttempt?.missionId === journeyDallas10.id ? journeyDallas10.startAirportId
    : activeAttempt?.missionId === journeyDallas08.id ? journeyDallas08.startAirportId
    : activeAttempt?.missionId === journeyDallas07.id ? journeyDallas07.startAirportId
    : undefined;
  const airports = missionAirportId && activeAttempt && ['APPROACH', 'RACING'].includes(activeAttempt.status)
    ? cityAirports.dallas.filter(airport => airport.id === missionAirportId) : cityAirports[player.cityId];
  const preferredSlot = player.spawnSlot ?? 0;
  let fallback: { position: Vector3; heading: number } | undefined;
  for (const airport of airports) {
    const groundY = player.cityId === 'dallas' ? (dallasAirportElevations.get(airport.id) ?? 0) : 0;
    const baseAlong = Math.min(airport.runwayLength * 0.32, airport.runwayLength * 0.5 - 120);
    for (let step = 0; step < 12; step += 1) {
      const lane = (preferredSlot + step) % 12;
      const along = baseAlong + (lane - 5.5) * respawnClearance * 1.35;
      const position = {
        x: airport.x + Math.sin(airport.heading) * along,
        y: groundY,
        z: airport.z + Math.cos(airport.heading) * along,
      };
      fallback ??= { position, heading: airport.heading };
      const occupied = [...players.entries()].some(([otherId, other]) => otherId !== playerId &&
        other.cityId === player.cityId && other.entityType === 'player' && other.lifeState !== 'destroyed' &&
        other.hasRespawnTransform && now - other.lastStateAt <= combatTransformFreshMs &&
        Math.abs(other.position.y - position.y) < 12 && Math.hypot(other.position.x - position.x, other.position.z - position.z) < respawnClearance);
      if (!occupied) return { position, heading: airport.heading };
    }
  }
  // All defined runway slots being occupied is practically unreachable; the
  // fallback remains on the configured runway with temporary spawn protection.
  return fallback ?? { position: { ...player.position }, heading: player.rotation.y };
}

function resetHumanToSafeRunway(playerId: string, player: PlayerState, profile: PlayerProfile, now: number, serverReset = false, aircraftOverride?: AircraftType): void {
  missionSignal(playerId, { type: 'lostFlight', at: now });
  const safeSpawn = safeRespawnTransform(playerId, player, now);
  player.assistedAim = undefined;
  player.aimSamples = undefined;
  const activeAircraft = aircraftOverride ?? profile.selectedAircraft;
  if (activeAircraft !== player.aircraftType) player.selectionRevision = (player.selectionRevision ?? 0) + 1;
  player.profile = profile;
  player.aircraftType = activeAircraft;
  player.health = maxHealthForAircraft(player.aircraftType);
  player.lifeState = 'respawning';
  player.hasRespawnTransform = false;
  player.spawnProtectedUntil = now + spawnProtectionMs;
  player.position = safeSpawn.position;
  player.lastAcceptedPosition = { ...safeSpawn.position };
  player.lastAcceptedTransformAt = now;
  player.rotation = { x: 0, y: safeSpawn.heading, z: 0 };
  player.velocity = { x: 0, y: 0, z: 0 };
  playerChaos.delete(playerId);
  activeChallenges.delete(playerId);
  landingFlightState.delete(playerId);
  championshipTouchdowns.delete(playerId);
  airborneMilestones.reset(playerId);
  airportRepairStays.delete(playerId);
  removeTerritoryContribution(playerId);
  const activeRiskZone = cityEvents.get(player.cityId);
  if (activeRiskZone?.lifecycle === 'active' && activeRiskZone.type === 'riskZone') {
    activeRiskZone.progress.delete(playerId);
    activeRiskZone.participants.delete(playerId);
  }
  setServerLock(playerId, player);
  sendProfile(playerId, profile, undefined, undefined, undefined, false, serverReset);
  reconcileMostWanted(player.cityId, now);
  broadcastToCity(player.cityId, {
    type: 'respawn', playerId, health: player.health, maxHealth: maxHealthForAircraft(player.aircraftType),
    lifeState: player.lifeState, spawnPosition: safeSpawn.position, spawnHeading: safeSpawn.heading,
  });
  broadcastLeaderboard(player.cityId);
}

function expectedInitialTransform(cityId: CityId, spawnSlot: number, generic: Vector3, airportId = 'dfw'): Vector3 {
  if (cityId !== 'dallas') return { ...generic };
  const airport = cityAirports[cityId].find(candidate => candidate.id === airportId)!;
  const along = Math.min(airport.runwayLength * 0.32, airport.runwayLength * 0.5 - 120) + spawnSlot * 15;
  return {
    x: airport.x + Math.sin(airport.heading) * along,
    y: dallasAirportElevations.get(airport.id) ?? generic.y,
    z: airport.z + Math.cos(airport.heading) * along,
  };
}

function logTransformReject(playerId: string, player: PlayerState, reason: string, distance: number, allowed: number, now: number): void {
  if (!stabilityDiagnosticsEnabled || now - (transformRejectLogAt.get(playerId) ?? 0) < 2_000) return;
  transformRejectLogAt.set(playerId, now);
  console.warn(`PLAYER_TRANSFORM_REJECT pilot=${player.pilotId} aircraft=${player.aircraftType} reason=${reason} distance=${distance.toFixed(1)}m allowed=${allowed.toFixed(1)}m`);
}

function broadcastRepair(playerId: string, player: PlayerState, sourceId: string, full: boolean, cooldownMs?: number): void {
  broadcastToCity(player.cityId, {
    type: 'repair', playerId, sourceId, full,
    cooldownMs,
    health: player.health,
    maxHealth: maxHealthForAircraft(player.aircraftType),
  });
}

function clearRepairState(playerId: string): void {
  airportRepairStays.delete(playerId);
  repairLastPosition.delete(playerId);
  // Cooldowns belong to the pilot, not the ephemeral socket. Expiry pruning
  // below clears them; a reconnect cannot collect the same Heart early.
}

// All of these maps are keyed by an ephemeral connection/bot id.  A bot can
// be retired and a browser can disappear without a clean gameplay transition,
// so remove every such reference in the same lifecycle path.
function clearPlayerRuntimeState(playerId: string): void {
  const player = players.get(playerId);
  if (player?.lockedTargetId) setServerLock(playerId, player);
  clearLocksForTarget(playerId);
  playerChaos.delete(playerId);
  activeChallenges.delete(playerId);
  landingFlightState.delete(playerId);
  championshipTouchdowns.delete(playerId);
  airborneMilestones.reset(playerId);
  playerHeat.delete(playerId);
  clearRepairState(playerId);
  for (const key of landingReceipts.keys()) if (key.startsWith(`${playerId}:`)) landingReceipts.delete(key);
  for (const key of masteryCooldowns.keys()) if (key.startsWith(`${playerId}:`)) masteryCooldowns.delete(key);
  for (const key of territoryRewardCooldown.keys()) if (key.includes(`:${playerId}:`)) territoryRewardCooldown.delete(key);
  for (const key of recentBountyKills.keys()) if (key.startsWith(`${playerId}:`) || key.endsWith(`:${playerId}`)) recentBountyKills.delete(key);
  for (const key of recentHeatKills.keys()) if (key.startsWith(`${playerId}:`) || key.endsWith(`:${playerId}`)) recentHeatKills.delete(key);
  for (const key of fireBlockedDebugAt.keys()) if (key.startsWith(`${playerId}:`)) fireBlockedDebugAt.delete(key);
  for (const cityFormations of formations.values()) {
    for (const [key, formation] of cityFormations) {
      if (formation.memberIds.includes(playerId)) cityFormations.delete(key);
    }
  }
  for (const territories of cityTerritoryState.values()) {
    for (const territory of territories.values()) territory.lastContestedHeatAt.delete(playerId);
  }
  for (const event of cityEvents.values()) {
    event.participants.delete(playerId);
    event.progress.delete(playerId);
    event.rewardsGiven.delete(playerId);
    event.damageContribution.delete(playerId);
    if (event.winnerId === playerId) event.winnerId = undefined;
    if (event.wantedPlayerId === playerId) event.wantedPlayerId = undefined;
  }
  removeTerritoryContribution(playerId, true);
}

function pruneEphemeralRuntimeState(now: number): void {
  for (const [key, expiresAt] of repairCooldowns) if (expiresAt <= now) repairCooldowns.delete(key);
  for (const [key, receivedAt] of landingReceipts) if (now - receivedAt > 30_000) landingReceipts.delete(key);
  for (const [key, touchdown] of championshipTouchdowns) if (now - touchdown.at > 3_000) championshipTouchdowns.delete(key);
  for (const [key, receivedAt] of recentBountyKills) if (now - receivedAt > 120_000) recentBountyKills.delete(key);
  for (const [key, receivedAt] of recentHeatKills) if (now - receivedAt > heatKillCooldownMs) recentHeatKills.delete(key);
  for (const [key, receivedAt] of masteryCooldowns) if (now - receivedAt > heatKillCooldownMs) masteryCooldowns.delete(key);
  for (const [key, receivedAt] of territoryRewardCooldown) if (now - receivedAt > territoryCaptureRewardCooldownMs) territoryRewardCooldown.delete(key);
  for (const [key, receivedAt] of fireBlockedDebugAt) if (now - receivedAt > 1_000) fireBlockedDebugAt.delete(key);
  for (const territories of cityTerritoryState.values()) {
    for (const territory of territories.values()) {
      for (const [playerId, lastAt] of territory.lastContestedHeatAt) {
        if (!players.has(playerId) || now - lastAt > 15_000) territory.lastContestedHeatAt.delete(playerId);
      }
    }
  }
}

function logStabilityDiagnostics(): void {
  if (!stabilityDiagnosticsEnabled) return;
  const memory = process.memoryUsage();
  const receipts = profileStore.rewardReceiptDiagnostics();
  const humans = [...players.values()].filter((player) => !player.isBot).length;
  const bots = players.size - humans;
  const eventMembers = [...cityEvents.values()].reduce((count, event) => count + event.participants.size + event.progress.size + event.damageContribution.size, 0);
  const territoryHeatEntries = [...cityTerritoryState.values()].reduce((count, territories) => count + [...territories.values()].reduce((total, territory) => total + territory.lastContestedHeatAt.size, 0), 0);
  const buffered = [...server.clients].reduce((total, socket) => total + socket.bufferedAmount, 0);
  const maxBuffered = [...server.clients].reduce((largest, socket) => Math.max(largest, socket.bufferedAmount), 0);
  console.info(
    `[stability] heap=${Math.round(memory.heapUsed / 1024 / 1024)}/${Math.round(memory.heapTotal / 1024 / 1024)}MB rss=${Math.round(memory.rss / 1024 / 1024)}MB ` +
    `humans=${humans} bots=${bots} projectiles=${projectiles.size} events=${cityEvents.size}/${eventMembers} ` +
    `maps=repair:${repairCooldowns.size},landing:${landingReceipts.size},challenge:${activeChallenges.size},mastery:${masteryCooldowns.size},territory:${territoryRewardCooldown.size}/${territoryHeatEntries},heat:${recentHeatKills.size}/${recentBountyKills.size} ` +
    `receipts=${receipts.rows},dbBytes:${receipts.databaseBytes},lastPrune:${receipts.lastPruneCount}@${receipts.lastPruneAt || 0} ` +
    `ws=max:${maxBuffered},total:${buffered},payload=${wsPayloadWindow.largestType}:${wsPayloadWindow.largestBytes}B,avg:${wsPayloadWindow.sentMessages ? Math.round(wsPayloadWindow.sentBytes / wsPayloadWindow.sentMessages) : 0}B,dropped:${wsPayloadWindow.droppedBackpressureFrames}`,
  );
  wsPayloadWindow.largestBytes = 0;
  wsPayloadWindow.largestType = 'none';
  wsPayloadWindow.sentBytes = 0;
  wsPayloadWindow.sentMessages = 0;
  wsPayloadWindow.droppedBackpressureFrames = 0;
}

function updateRepairStations(now: number): void {
  for (const [playerId, player] of players) {
    if (pausedJourneyPlayers.has(playerId) || pausedTrainingPlayers.has(playerId) || player.skyDuelMode) continue;
    if (player.lifeState !== 'alive' || !player.hasRespawnTransform || now - player.lastStateAt > 1_500) {
      airportRepairStays.delete(playerId);
      repairLastPosition.delete(playerId);
      continue;
    }
    const previous = repairLastPosition.get(playerId);
    const priorX = previous?.x ?? player.position.x, priorY = previous?.y ?? player.position.y, priorZ = previous?.z ?? player.position.z;
    const travel = previous ? Math.hypot(player.position.x - previous.x, player.position.y - previous.y, player.position.z - previous.z) : 0;
    const maxTravel = aircraftFlightEnvelope[player.aircraftType].maxSpeed * aircraftFlightEnvelope[player.aircraftType].boostMaxSpeed * 0.9 + 150;
    const swept = previous && travel <= maxTravel && travel > 0.001;
    if (previous) {
      previous.x = player.position.x; previous.y = player.position.y; previous.z = player.position.z;
    } else repairLastPosition.set(playerId, { x: player.position.x, y: player.position.y, z: player.position.z });
    const maxHealth = maxHealthForAircraft(player.aircraftType);
    const linkedAttemptId = playerJourneyAttempts.get(playerId);
    const recoveryAttempt = linkedAttemptId ? journeyStore.get(player.pilotId, linkedAttemptId) : undefined;
    const criticalActive = recoveryAttempt?.missionId === journeyDallas17.id &&
      (recoveryAttempt.status === 'APPROACH' || recoveryAttempt.status === 'RACING');
    const doubleActive = recoveryAttempt?.missionId === journeyDallas23.id &&
      (recoveryAttempt.status === 'APPROACH' || recoveryAttempt.status === 'RACING');
    const doubleHeart = doubleActive && recoveryAttempt.doublePhase === 'REPAIR' && recoveryAttempt.heartPosition
      ? { id: journeyDallas23.heartId, kind: 'heart' as const,
        x: recoveryAttempt.heartPosition.x, z: recoveryAttempt.heartPosition.z,
        radius: journeyDallas23.heartRadius,
        altitudeAgl: recoveryAttempt.heartPosition.y - botTerrainHeight(player.cityId,
          recoveryAttempt.heartPosition.x, recoveryAttempt.heartPosition.z) } : null;
    if (player.health < maxHealth || criticalActive || doubleActive) {
      for (const beacon of doubleActive ? doubleHeart ? [doubleHeart] : []
        : criticalActive ? [journeyDallas17.heart] : repairsForCity(player.cityId)) {
        if (beacon.kind === 'heart') {
          const heartY = botTerrainHeight(player.cityId, beacon.x, beacon.z) + beacon.altitudeAgl;
          let distance = Math.hypot(player.position.x - beacon.x, player.position.y - heartY, player.position.z - beacon.z);
          if (swept) {
            const dx = player.position.x - priorX, dy = player.position.y - priorY, dz = player.position.z - priorZ;
            const t = Math.max(0, Math.min(1, ((beacon.x - priorX) * dx + (heartY - priorY) * dy + (beacon.z - priorZ) * dz) / (travel * travel)));
            distance = Math.min(distance, Math.hypot(priorX + dx * t - beacon.x, priorY + dy * t - heartY, priorZ + dz * t - beacon.z));
          }
          if (distance > beacon.radius) continue;
        } else {
          if (player.position.y > beacon.maxAltitude || Math.hypot(player.position.x - beacon.x, player.position.z - beacon.z) > beacon.radius) continue;
        }
        const cooldownKey = `${player.pilotId}:${beacon.id}`;
        if (doubleActive) {
          if (!swept || recoveryAttempt.doublePhase !== 'REPAIR' || !landingFlightState.get(playerId)?.airborne) continue;
          const collected = journeyStore.collectDoubleHeart(player.pilotId, recoveryAttempt.attemptId, beacon.id, now);
          if (!collected) continue;
          player.health = maxHealth;
          airportRepairStays.delete(playerId);
          broadcastRepair(playerId, player, beacon.id, true);
          sendJourneyState(playerId, collected);
          ensureJourneyDouble(playerId, player, collected, now);
          break;
        }
        if (criticalActive) {
          if (recoveryAttempt.status !== 'APPROACH' || !landingFlightState.get(playerId)?.airborne) continue;
          const collected = journeyStore.collectCriticalHeart(player.pilotId, recoveryAttempt.attemptId, beacon.id, now);
          if (!collected) continue;
          player.health = maxHealth;
          airportRepairStays.delete(playerId);
          broadcastRepair(playerId, player, beacon.id, true);
          sendJourneyState(playerId, collected);
          break;
        }
        if ((repairCooldowns.get(cooldownKey) ?? 0) > now) continue;
        const repaired = beacon.kind === 'heart' ? maxHealth - player.health :
          Math.min(maxHealth - player.health, Math.max(1, Math.round(maxHealth * repairBeaconFraction)));
        player.health += repaired;
        repairCooldowns.set(cooldownKey, now + (beacon.kind === 'heart' ? repairHeartCooldownMs : repairBeaconCooldownMs));
        airportRepairStays.delete(playerId);
        broadcastRepair(playerId, player, beacon.id, beacon.kind === 'heart', beacon.kind === 'heart' ? repairHeartCooldownMs : undefined);
        break;
      }
    }
    if (criticalActive) { airportRepairStays.delete(playerId); continue; }
    const airport = groundedAtAirport(player);
    const stay = airportRepairStays.get(playerId);
    if (!airport || player.health >= maxHealth) {
      airportRepairStays.delete(playerId);
      continue;
    }
    if (!stay || stay.airportId !== airport.id) {
      airportRepairStays.set(playerId, { airportId: airport.id, since: now });
    } else if (now - stay.since >= airportRepairDelayMs) {
      player.health = maxHealth;
      airportRepairStays.delete(playerId);
      broadcastRepair(playerId, player, airport.id, true);
    }
  }
}

function updateFighterTrialExpiries(now: number): void {
  for (const [playerId, player] of players) {
    if (!isHumanPilot(player)) continue;
    const trial = player.profile.fighterTrial;
    if (trial.status !== 'active' || !Number.isFinite(trial.expiresAt) || now < trial.expiresAt! + fighterTrialEndGraceMs) continue;
    if (profileStore.markFighterTrialCompleted(player.pilotId, now)) {
      recordAnalytics(playerId, 'fighter_trial_completed', { metadata: { cityId: player.cityId } }, now);
    }
    const consumed = profileStore.consumeExpiredFighterTrial(player.pilotId, now);
    if (!consumed || consumed.fighterTrial.status !== 'consumed') continue;
    if (player.aircraftType === 'fighter' && consumed.selectedAircraft !== 'fighter') {
      resetHumanToSafeRunway(playerId, player, consumed, now, true);
    } else {
      player.profile = consumed;
      sendProfile(playerId, consumed);
    }
  }
}

let lastProjectileUpdate = Date.now();
setInterval(() => {
  const now = Date.now();
  const deltaSeconds = Math.min(0.1, (now - lastProjectileUpdate) / 1000);
  lastProjectileUpdate = now;
  updateProjectiles(deltaSeconds);
}, 50);

setInterval(() => updateDynamicEvents(Date.now()), eventTickMs);
setInterval(() => skyDuelTick(Date.now()), 1_000);
setInterval(() => {
  updateCityHeat(Date.now());
  // Existing compact roster doubles as presence, independent of render FPS.
  // Periodic snapshots also recover a dropped join/remove under backpressure.
  for (const cityId of cityIds) broadcastLeaderboard(cityId);
}, 1_000);
setInterval(() => updateTerritories(Date.now()), territoryTickMs);
setInterval(() => tickMissions(Date.now()), 1_000);
setInterval(() => { expirePausedJourneys(Date.now()); expirePausedTraining(Date.now()); }, 1_000);
setInterval(() => {
  const now = Date.now();
  for (const [playerId, attemptId] of playerJourneyAttempts) {
    if (pausedJourneyAttempts.has(attemptId)) continue;
    const player = players.get(playerId);
    if (!player) continue;
    const attempt = journeyStore.get(player.pilotId, attemptId);
    if((attempt?.missionId===journeyDallas07.id || attempt?.missionId===journeyDallas08.id || attempt?.missionId===journeyDallas09.id || attempt?.missionId===journeyDallas10.id || attempt?.missionId===journeyDallas11.id || attempt?.missionId===journeyDallas12.id) && attempt.status==='APPROACH' && transportReady.has(attemptId) && journeyCountdownComplete.has(attemptId) &&
      player.lifeState==='alive' && player.hasRespawnTransform && hasOpenPlayerSocket(playerId)){
      const started=journeyStore.startGiantIncoming(player.pilotId,attemptId,now);if(started){
        if(started.missionId===journeyDallas08.id || started.missionId===journeyDallas09.id || started.missionId===journeyDallas10.id || started.missionId===journeyDallas12.id)spawnRearGuardEscorts(playerId,player,started,now);
        else sendJourneyState(playerId,started);
      }
    }
    if (attempt?.missionId === journeyDallas19.id && attempt.status === 'APPROACH' && journeyCountdownComplete.has(attemptId) &&
        player.lifeState === 'alive' && player.hasRespawnTransform && hasOpenPlayerSocket(playerId)) {
      const started = journeyStore.startMonsterArrival(player.pilotId, attemptId, now);
      if (started) sendJourneyState(playerId, started);
    }
    const current = journeyStore.get(player.pilotId, attemptId);
    if ((current?.status === 'APPROACH' || current?.status === 'RACING') && current.deadlineAt && now >= current.deadlineAt)
      failPlayerJourney(playerId, 'TIME_UP', now);
  }
  updateReinforcementWaves(now);
}, 250);
setInterval(() => expirePvpChallenges(Date.now()), 1_000);
setInterval(() => updateFighterTrialExpiries(Date.now()), 500);
setInterval(() => updateBots(Date.now()), botTickMs);
setInterval(() => { for (const cityId of cityIds) reconcileBots(cityId); }, botPopulationTickMs);
setInterval(() => updateRepairStations(Date.now()), repairCheckMs);
setInterval(() => {
  const now = Date.now();
  updateFormations(now);
}, 500);
setInterval(() => {
  const now = Date.now();
  pruneEphemeralRuntimeState(now);
  logStabilityDiagnostics();
}, 30_000);
setInterval(() => {
  const now = Date.now();
  for (const [playerId, context] of analyticsContexts) {
    const player = players.get(playerId);
    if (isHumanPilot(player)) analyticsStore.heartbeat(context.sessionId!, player.aircraftType, now);
  }
}, 60_000);
setInterval(() => {
  try { profileStore.pruneRewardReceipts(); analyticsStore.prune(); nativePurchaseLedger.prune(); }
  catch (error) { console.error('[profiles] reward receipt prune failed', error); }
}, 6 * 60 * 60_000);

function cityFromRequest(request: IncomingMessage): CityId {
  const cityId = new URL(request.url ?? '/', 'http://localhost').searchParams.get('city');
  return cityIds.has(cityId as CityId) ? cityId as CityId : 'milwaukee';
}

function chaosQaFromRequest(request: IncomingMessage): boolean {
  return process.env.AIRPORT_CHAOS_DEV_QA === '1' &&
    new URL(request.url ?? '/', 'http://localhost').searchParams.get('chaosqa') === '1';
}

function protocolMatchesRequest(request: IncomingMessage): boolean {
  const requested = new URL(request.url ?? '/', 'http://localhost').searchParams.get('protocol');
  return requested === String(PROTOCOL_VERSION);
}

function requestedPilotName(request: IncomingMessage): string {
  const url = new URL(request.url ?? '/', 'http://localhost');
  return (url.searchParams.get('pilotName') ?? '').slice(0, 20);
}

function authenticatedIdentity(request: IncomingMessage, response: ServerResponse): { pilotId: string; pilotName: string; clientIp: string; session: SessionIdentity } | undefined {
  const clientIp = trustedClientIp(request);
  const resolved = pilotSessions.resolveSession(request.headers.cookie);
  if (resolved) return { pilotId: resolved.pilotId, pilotName: requestedPilotName(request), clientIp, session: resolved };
  const issuanceLimit = limitedBy('session-ip', clientIp, securityLimits.sessionIp);
  if (issuanceLimit.limited) { rateLimited(response, issuanceLimit.retryAfterMs); return undefined; }
  const url = new URL(request.url ?? '/', 'http://localhost');
  const legacyId = url.searchParams.get('pilotId') ?? '';
  const validLegacyId = /^[a-zA-Z0-9-]{16,80}$/.test(legacyId);
  const existingLegacyProfile = validLegacyId && profileStore.hasProfile(legacyId);
  const issued = pilotSessions.issue(legacyId, existingLegacyProfile);
  // If an existing local pilot ID has already been claimed, it may be a stale
  // cache from a signed-out account.  The replacement guest must never accept
  // that cache as a legacy import.  A genuinely first migration remains
  // allowed through issued.migrated.
  if (!validLegacyId || (existingLegacyProfile && !issued.migrated)) {
    profileStore.createFreshGuest(issued.pilotId);
  }
  response.setHeader('Set-Cookie', sessionCookie(request, issued.cookie, issued.expiresAt));
  return { pilotId: issued.pilotId, pilotName: requestedPilotName(request), clientIp, session: { pilotId: issued.pilotId, tokenHash: issued.tokenHash } };
}

function sessionIdentity(request: IncomingMessage): { pilotId: string; pilotName: string; session: SessionIdentity } | undefined {
  const ticket = new URL(request.url ?? '/', 'http://localhost').searchParams.get('ticket') ?? undefined;
  const session = ticket
    ? (request.headers.origin === 'capacitor://localhost' ? pilotSessions.consumeWebSocketTicket(ticket) : undefined)
    : pilotSessions.resolveSession(request.headers.cookie);
  return session ? { pilotId: session.pilotId, pilotName: requestedPilotName(request), session } : undefined;
}

function closeSessionConnections(tokenHash: string): void {
  for (const [socket, playerId] of playerSockets) {
    if (players.get(playerId)?.sessionTokenHash !== tokenHash) continue;
    removeHumanConnection(socket);
    socket.close(4003, 'Session changed');
  }
}

function updateConnectedPilotName(pilotId: string, profile: PlayerProfile): void {
  for (const [playerId, player] of players) {
    if (player.pilotId !== pilotId || player.isBot) continue;
    player.profile = profile;
    player.displayName = profile.pilotName;
    broadcastToCity(player.cityId, {
      type: 'playerState', playerId, health: player.health, lifeState: player.lifeState,
      position: player.position, rotation: player.rotation, aircraftType: player.aircraftType,
      equippedCosmetics: player.profile.cosmetics.equipped, cityId: player.cityId,
      displayName: player.displayName, boostActive: player.boostActive, maxHealth: maxHealthForAircraft(player.aircraftType),
    });
    broadcastLeaderboard(player.cityId);
  }
}

function reserveSpawnSlot(cityId: CityId): number {
  const slots = usedSpawnSlots.get(cityId) ?? new Set<number>();
  usedSpawnSlots.set(cityId, slots);
  for (let slot = 0; slot < 10; slot += 1) {
    if (!slots.has(slot)) {
      slots.add(slot);
      return slot;
    }
  }
  return 0;
}

function pausePlayerJourney(playerId: string, now = Date.now()): boolean {
  const player = players.get(playerId);
  const attemptId = playerJourneyAttempts.get(playerId);
  if (!player || !attemptId || !player.sessionTokenHash) return false;
  const attempt = journeyStore.pause(player.pilotId, attemptId, now);
  if (!attempt || !['READY', 'APPROACH', 'RACING'].includes(attempt.status) || attempt.pausedAt === null) return false;
  pausedJourneyPlayers.set(playerId, { attemptId, accountId: player.accountId, sessionTokenHash: player.sessionTokenHash });
  pausedJourneyAttempts.add(attemptId);
  speedGateTracker.clear(playerId);
  sendToPlayer(playerId, { type: 'journeyPauseState', attemptId, paused: true, pausedAt: attempt.pausedAt, serverNow: Date.now() });
  return true;
}

function pausePlayerTraining(playerId: string, now = Date.now()): boolean {
  const player = players.get(playerId);
  if (!player?.tutorialMode || !player.sessionTokenHash) return false;
  pausedTrainingPlayers.set(playerId, { pausedAt: pausedTrainingPlayers.get(playerId)?.pausedAt ?? now, sessionTokenHash: player.sessionTokenHash });
  return true;
}

function expirePausedTraining(now = Date.now()): void {
  for (const [playerId, paused] of pausedTrainingPlayers) {
    if (now - paused.pausedAt < JOURNEY_PAUSE_LIMIT_MS) continue;
    pausedTrainingPlayers.delete(playerId);
    for (const [socket, connectedId] of playerSockets) {
      if (connectedId !== playerId) continue;
      playerSockets.delete(socket);
      socket.close(4001, 'Training pause expired');
    }
    cleanupHumanPlayer(playerId);
  }
}

function shiftJourneyRuntime(playerId: string, attemptId: string, pausedMs: number): void {
  const shift = (value: number): number => value > 0 ? value + pausedMs : value;
  const player = players.get(playerId);
  if (player) {
    player.lastStateAt = shift(player.lastStateAt);
    player.lastAcceptedTransformAt = shift(player.lastAcceptedTransformAt);
    player.spawnProtectedUntil = shift(player.spawnProtectedUntil);
    player.lastFireAt = shift(player.lastFireAt);
    if (player.missionLastFlightAt !== undefined) player.missionLastFlightAt = shift(player.missionLastFlightAt);
  }
  for (const [botId, botPlayer] of players) {
    const bot = botPlayer.bot;
    if (bot?.journeyAttemptId !== attemptId) continue;
    botPlayer.lastStateAt = shift(botPlayer.lastStateAt);
    botPlayer.spawnProtectedUntil = shift(botPlayer.spawnProtectedUntil);
    bot.nextDecisionAt = shift(bot.nextDecisionAt);
    bot.nextFireAt = shift(bot.nextFireAt);
    bot.respawnAt = shift(bot.respawnAt);
    bot.combatPhaseUntil = shift(bot.combatPhaseUntil);
    bot.combatWaypointRefreshAt = shift(bot.combatWaypointRefreshAt);
    bot.attackFireAfter = shift(bot.attackFireAfter);
    bot.blindZoneEscapeUntil = shift(bot.blindZoneEscapeUntil);
    if (bot.journeyReturnGraceUntil !== undefined) bot.journeyReturnGraceUntil = shift(bot.journeyReturnGraceUntil);
    if (bot.escortReturnUntil !== undefined) bot.escortReturnUntil = shift(bot.escortReturnUntil);
    if (bot.defenseReleaseAt !== undefined) bot.defenseReleaseAt = shift(bot.defenseReleaseAt);
    for (const motions of [crossfireHunterMotion, breakoutHunterMotion, siegeHunterMotion]) {
      const motion = motions.get(botId);
      if (motion) motion.at = shift(motion.at);
    }
    const doubleMotion = doubleHunterMotion.get(botId);
    if (doubleMotion) doubleMotion.movedAt = shift(doubleMotion.movedAt);
  }
  const escape = journeyEscapeStates.get(playerId);
  if (escape?.attemptId === attemptId) {
    escape.lastMotionAt = shift(escape.lastMotionAt);
    escape.lastSentAt = shift(escape.lastSentAt);
  }
  const transport = transportEncounters.get(attemptId);
  if (transport) for (const key of ['startedAt', 'lastTickAt', 'lastBroadcastAt', 'nextBurstAt', 'warningUntil', 'nextShotAt'] as const)
    transport[key] = shift(transport[key]);
  if (transport?.crossfire) {
    transport.crossfire.nextBurstAt = shift(transport.crossfire.nextBurstAt);
    transport.crossfire.nextShotAt = shift(transport.crossfire.nextShotAt);
    for (const gun of transport.crossfire.guns) if (gun.warningUntil) gun.warningUntil = shift(gun.warningUntil);
  }
  const escortFire = rearGuardFire.get(attemptId);
  if (escortFire) {
    if (escortFire.tookOffAt !== null) escortFire.tookOffAt = shift(escortFire.tookOffAt);
    escortFire.nextBurstAt = shift(escortFire.nextBurstAt);
    escortFire.nextShotAt = shift(escortFire.nextShotAt);
    if (escortFire.lastBurstAt !== null) escortFire.lastBurstAt = shift(escortFire.lastBurstAt);
    if (escortFire.waveCombatAt !== null) escortFire.waveCombatAt = shift(escortFire.waveCombatAt);
    escortFire.eligibleAfter = escortFire.eligibleAfter.map(at => shift(at));
  }
  const wave = reinforcementWaves.get(attemptId);
  if (wave && !wave.spawned) wave.arriveAt = shift(wave.arriveAt);
  const monster = monsterEncounters.get(attemptId);
  if (monster) {
    for (const key of ['startedAt', 'nextAttackAt', 'windupUntil', 'nextJumpAt', 'jumpStartedAt', 'lastPlayerHitAt', 'sustainedSince', 'contactAt', 'lastTickAt', 'lastBroadcastAt', 'nextHandSwipeAt'] as const)
      monster[key] = shift(monster[key]);
    if (monster.handSwipe) monster.handSwipe.startedAt = shift(monster.handSwipe.startedAt);
    for (const shot of monster.shots) shot.bornAt = shift(shot.bornAt);
    for (const shot of monster.pendingFan) shot.at = shift(shot.at);
  }
}

function resumePlayerJourney(playerId: string, now = Date.now()): boolean {
  expirePausedJourneys(now);
  const paused = pausedJourneyPlayers.get(playerId);
  const player = players.get(playerId);
  if (!paused || !player) return false;
  const resumed = journeyStore.resume(player.pilotId, paused.attemptId, now);
  if (!resumed) return false;
  shiftJourneyRuntime(playerId, paused.attemptId, resumed.pausedMs);
  pausedJourneyPlayers.delete(playerId);
  pausedJourneyAttempts.delete(paused.attemptId);
  sendJourneyState(playerId, resumed.attempt);
  sendToPlayer(playerId, { type: 'journeyPauseState', attemptId: paused.attemptId, paused: false });
  return true;
}

function expirePausedJourneys(now = Date.now()): void {
  for (const attempt of journeyStore.expirePaused(now)) {
    const paused = [...pausedJourneyPlayers].find(([, state]) => state.attemptId === attempt.attemptId);
    if (!paused) continue; // Persisted attempt from a prior server process.
    const [playerId] = paused;
    pausedJourneyPlayers.delete(playerId);
    pausedJourneyAttempts.delete(attempt.attemptId);
    sendJourneyState(playerId, attempt);
    removeJourneyHunter(attempt);
    for (const [socket, connectedId] of playerSockets) {
      if (connectedId !== playerId) continue;
      playerSockets.delete(socket);
      socket.close(4001, 'Mission pause expired');
    }
    cleanupHumanPlayer(playerId);
  }
}

function cleanupHumanPlayer(playerId: string, socket?: WebSocket): void {
  const player = players.get(playerId);
  if (!player) return;
  if (player.skyDuelMode) abandonSkyDuelRematches(player.pilotId);
  if (isHumanPilot(player) && (player.distanceXpMeters ?? 0) > 0) {
    const now = Date.now();
    if (progressionEnabled(player)) {
      for (const result of profileStore.recordAcceptedFlightDistance(player.pilotId, player.distanceXpMeters!, now))
        reportPilotXp(playerId, 'DISTANCE', result, now);
    } else profileStore.recordAcceptedPracticeDistance(player.pilotId, player.distanceXpMeters!);
    player.distanceXpMeters = 0;
  }
  const paused = pausedJourneyPlayers.get(playerId);
  if (paused) pausedJourneyAttempts.delete(paused.attemptId);
  pausedJourneyPlayers.delete(playerId);
  pausedTrainingPlayers.delete(playerId);
  const analyticsContext = analyticsContexts.get(playerId);
  const flight = flightAnalytics.get(playerId);
  if (analyticsContext && flight) {
    const endedAt = Date.now();
    analyticsStore.recordEvent({ ...analyticsContext, cityId: player.cityId, aircraftType: player.aircraftType }, 'flight_ended', {
      amount: analyticsStore.flightCreditsEarned(player.pilotId, flight.startedAt, endedAt),
      metadata: { durationSeconds: Math.round((endedAt - flight.startedAt) / 1_000), airborneSeconds: Math.round(flight.airborneMs / 1_000),
        distanceMeters: Math.round(flight.distanceMeters), score: Math.max(0, player.score - flight.startingScore),
        kills: flight.kills, landings: flight.landings, missions: flight.missions },
    }, endedAt);
  }
  flightAnalytics.delete(playerId);
  if (analyticsContext) analyticsStore.endSession({ ...analyticsContext, cityId: player.cityId, aircraftType: player.aircraftType });
  analyticsContexts.delete(playerId);
  playerClientIps.delete(playerId);
  playerTrialNetworkIds.delete(playerId);
  firehawkPromotionShownConnections.delete(playerId);
  firehawkPromotionRequestCounts.delete(playerId);
  lastSentCredits.delete(playerId);
  lastClientCrashAnalytics.delete(playerId);
  transformRejectLogAt.delete(playerId);
  failPlayerJourney(playerId, 'INTERRUPTED');
  playerJourneyAttempts.delete(playerId);
  speedGateTracker.clear(playerId);
  speedGateWarningAt.delete(playerId);
  wrongWayGateWarningAt.delete(playerId);
  missionFocusedPlayers.delete(playerId);
  monsterFocusedPlayers.delete(playerId);
  missionFocusHunterTargets.delete(playerId);
  missionFocusCrossfireTargets.delete(playerId);
  journeyFormationStates.delete(playerId);
  journeyEscapeStates.delete(playerId);
  playerJourneyLoveTakeoff.delete(playerId);
  playerJourneyAddisonTakeoff.delete(playerId);
  playerJourneyDfwTakeoff.delete(playerId);
  playerJourneyRunwayPrep.delete(playerId);
  missionSignal(playerId, { type: 'disconnect', at: Date.now() });
  removeTrainingTarget(playerId);
  removePlayerProjectiles(playerId);
  clearPlayerRuntimeState(playerId);
  players.delete(playerId);
  if (cityKings.get(player.cityId) === playerId) updateKing(player.cityId);
  if (player.spawnSlot !== undefined) usedSpawnSlots.get(player.cityId)?.delete(player.spawnSlot);
  reconcileMostWanted(player.cityId, Date.now());
  broadcastToCity(player.cityId, { type: 'remove', playerId }, socket);
  broadcastLeaderboard(player.cityId);
  console.log(`[server] player disconnected: ${playerId} (${playerSockets.size} humans online)`);
}

function removeHumanConnection(socket: WebSocket): void {
  const playerId = playerSockets.get(socket);
  if (!playerId) return; // Replacement and the subsequent close are idempotent.
  const player = players.get(playerId);
  playerSockets.delete(socket);
  if (!player) return;
  if (player.skyDuelMode) {
    skyDuelQueue.delete(playerId);
    skyDuelFairWaitNotified.delete(playerId);
    const session = player.skyDuelMatchId && skyDuelSessions.get(player.skyDuelMatchId);
    if (session) {
      markSkyDuelDisconnected(playerId, Date.now());
      return;
    }
  }
  if (pausePlayerJourney(playerId) || pausePlayerTraining(playerId)) {
    broadcastToCity(player.cityId, { type: 'remove', playerId }, socket);
    console.log(`[server] flight paused: ${playerId}`);
    return;
  }
  cleanupHumanPlayer(playerId, socket);
}

server.on('connection', (socket, request) => {
  if (!protocolMatchesRequest(request)) {
    sendSocketMessage(socket, { type: 'protocolMismatch', expectedProtocolVersion: PROTOCOL_VERSION });
    socket.close(4002, 'Protocol mismatch');
    return;
  }
  let playerId: string = randomUUID();
  const cityId = cityFromRequest(request);
  const chaosQaEnabled = chaosQaFromRequest(request);
  const identity = sessionIdentity(request);
  if (!identity) {
    sendSocketMessage(socket, { type: 'sessionRequired' });
    socket.close(4003, 'Secure session required');
    return;
  }
  const entryProfile = profileStore.getOrCreate(identity.pilotId, identity.pilotName);
  const connectionParams = new URL(request.url ?? '/', 'http://localhost').searchParams;
  const requestedTime = connectionParams.get('time');
  const timePreset = requestedTime === 'dusk' || requestedTime === 'evening' ? requestedTime : 'day';
  const skyDuelMode = cityId === 'dallas' && connectionParams.get('launchMode') === 'sky-duel';
  const requestedJourneyAttemptId = connectionParams.get('journeyAttempt');
  if (requestedJourneyAttemptId && cityId === 'dallas' && !entryProfile.tutorial.dallasUnlocked) {
    sendSocketMessage(socket, { type: 'journeyUnavailable', reason: 'Complete Milwaukee training to unlock Dallas.' });
    socket.close(4003, 'Training required');
    return;
  }
  let connectionKind = 'NEW';
  const reconnectingDuelPlayerId = skyDuelMode
    ? [...players.entries()].find(([, candidate]) => candidate.skyDuelMode && candidate.pilotId === identity.pilotId &&
      candidate.sessionTokenHash === identity.session.tokenHash && candidate.skyDuelMatchId &&
      skyDuelSessions.has(candidate.skyDuelMatchId))?.[0] : undefined;
  if (reconnectingDuelPlayerId) playerId = reconnectingDuelPlayerId;
  // A persistent profile may be active on multiple authenticated devices.
  // Replace only another socket from this exact first-party session; a Web
  // session and an iPhone session can safely share the same pilot/profile.
  for (const [otherSocket, otherId] of playerSockets) {
    const existingPlayer = players.get(otherId);
    if (!existingPlayer || !shouldReplaceRealtimeConnection(existingPlayer, identity.session)) continue;
    connectionKind = 'REPLACED';
    removeHumanConnection(otherSocket);
    otherSocket.close(4001, 'Session opened in another tab');
  }
  let profile = profileStore.consumeExpiredFighterTrial(identity.pilotId)!;
  const activatedTrialOnConnect = profile.fighterTrial.status === 'pending';
  if (activatedTrialOnConnect) profile = profileStore.activateFighterTrial(identity.pilotId)!;
  profile = profileStore.objectivesForCity(identity.pilotId, cityId)!;
  const tutorialMode = Boolean(connectionParams.get('launchMode') !== 'free-fly' && !skyDuelMode && cityCapabilities(cityId)?.tutorialEnabled && profile.tutorial.status === 'started');
  expirePausedTraining(Date.now());
  let restoringPausedTraining = false;
  if (tutorialMode) {
    const pausedPlayerId = [...pausedTrainingPlayers].find(([id, paused]) =>
      players.get(id)?.pilotId === profile.pilotId && players.get(id)?.cityId === cityId &&
      paused.sessionTokenHash === identity.session.tokenHash)?.[0];
    if (pausedPlayerId) {
      // Recover sessions stranded by an earlier fresh start that cleared the slide row.
      if(profileStore.trainingSlideIndex(profile.pilotId)===undefined)profileStore.startTrainingSlides(profile.pilotId);
      playerId = pausedPlayerId;
      restoringPausedTraining = true;
      const restored = players.get(playerId)!;
      restored.sessionTokenHash = identity.session.tokenHash;
      restored.profile = profile;
    }
  }
  const intercityArrival=tutorialMode ? {completed:false,credits:0} : profileStore.completeIntercityArrival(identity.pilotId,cityId);
  if(intercityArrival.completed&&intercityArrival.profile)profile=intercityArrival.profile;
  const priorWeeklyRewardId = profile.weeklyReward?.weekId;
  const weeklyReward = !tutorialMode && cityCapabilities(cityId)?.progressionEnabled ? profileStore.finalizePreviousWeeklyReward(identity.pilotId) : undefined;
  const weeklyRewardNew = Boolean(weeklyReward && weeklyReward.weekId !== priorWeeklyRewardId);
  if (weeklyReward) profile = profileStore.getOrCreate(identity.pilotId, identity.pilotName);
  if (connectionKind === 'NEW' && !profile.legacyImportPending) connectionKind = 'RECONNECT';
  const activeAircraftType: AircraftType = tutorialMode ? 'trainer' : profile.selectedAircraft;
  if (requestedJourneyAttemptId) expirePausedJourneys(Date.now());
  let journeyAttempt: JourneyAttempt | undefined;
  let restoringPausedJourney = false;
  if (requestedJourneyAttemptId) {
    const candidate = journeyStore.get(profile.pilotId, requestedJourneyAttemptId);
    if (cityId !== journeyDallas01.cityId || tutorialMode ||
      !candidate || candidate.aircraftType !== activeAircraftType ||
      !profile.unlockedAircraft.includes(activeAircraftType) ||
      !stagingJourneyQaUnlockAll && (
        candidate.missionId === journeyDallas02.id && !journeyStore.progress(profile.pilotId).completed ||
        candidate.missionId === journeyDallas03.id && !journeyStore.progress(profile.pilotId, journeyDallas02.id).completed ||
        candidate.missionId === journeyDallas04.id && !journeyStore.progress(profile.pilotId, journeyDallas03.id).completed ||
        candidate.missionId === journeyDallas05.id && !journeyStore.progress(profile.pilotId, journeyDallas04.id).completed ||
        candidate.missionId === journeyDallas06.id && !journeyStore.progress(profile.pilotId, journeyDallas05.id).completed ||
        candidate.missionId === journeyDallas07.id && !journeyStore.progress(profile.pilotId, journeyDallas06.id).completed ||
        candidate.missionId === journeyDallas08.id && !journeyStore.progress(profile.pilotId, journeyDallas07.id).completed ||
        candidate.missionId === journeyDallas09.id && !journeyStore.progress(profile.pilotId, journeyDallas08.id).completed ||
        candidate.missionId === journeyDallas10.id && !journeyStore.progress(profile.pilotId, journeyDallas09.id).completed)) {
      sendSocketMessage(socket, { type: 'journeyUnavailable', reason: 'Mission attempt is no longer available. Return to Journey and retry.' });
      socket.close(4003, 'Journey attempt unavailable');
      return;
    }
    if (!stagingJourneyQaUnlockAll) {
      if (candidate.missionId === journeyDallas13.id && !journeyStore.progress(profile.pilotId, journeyDallas12.id).completed) {
        socket.close(4003, 'Journey mission is locked'); return;
      }
      if (candidate.missionId === journeyDallas15.id && !journeyStore.progress(profile.pilotId, journeyDallas14.id).completed) {
        socket.close(4003, 'Journey mission is locked'); return;
      }
      if (candidate.missionId === journeyDallas16.id && !journeyStore.progress(profile.pilotId, journeyDallas15.id).completed) {
        socket.close(4003, 'Journey mission is locked'); return;
      }
      if (candidate.missionId === journeyDallas17.id && !journeyStore.progress(profile.pilotId, journeyDallas16.id).completed) {
        socket.close(4003, 'Journey mission is locked'); return;
      }
      if (candidate.missionId === journeyDallas19.id && !journeyStore.progress(profile.pilotId, journeyDallas18.id).completed) { socket.close(4003, 'Journey mission is locked'); return; }
      if (candidate.missionId === journeyDallas20.id && !journeyStore.progress(profile.pilotId, journeyDallas19.id).completed) { socket.close(4003, 'Journey mission is locked'); return; }
      if (candidate.missionId === journeyDallas21.id && !journeyStore.progress(profile.pilotId, journeyDallas20.id).completed) { socket.close(4003, 'Journey mission is locked'); return; }
      if (candidate.missionId === journeyDallas22.id && !journeyStore.progress(profile.pilotId, journeyDallas21.id).completed) { socket.close(4003, 'Journey mission is locked'); return; }
      if (candidate.missionId === journeyDallas23.id && !journeyStore.progress(profile.pilotId, journeyDallas22.id).completed) { socket.close(4003, 'Journey mission is locked'); return; }
      if (candidate.missionId === journeyDallas24.id && !journeyStore.progress(profile.pilotId, journeyDallas23.id).completed) { socket.close(4003, 'Journey mission is locked'); return; }
      if (candidate.missionId === journeyDallas18.id && !journeyStore.progress(profile.pilotId, journeyDallas17.id).completed) {
        socket.close(4003, 'Journey mission is locked'); return;
      }
      if (candidate.missionId === journeyDallas14.id && !journeyStore.progress(profile.pilotId, journeyDallas13.id).completed) {
        socket.close(4003, 'Journey mission is locked'); return;
      }
      if (candidate.missionId === journeyDallas12.id && !journeyStore.progress(profile.pilotId, journeyDallas11.id).completed) {
        sendSocketMessage(socket, { type: 'journeyUnavailable', reason: 'Mission attempt is no longer available. Return to Journey and retry.' });
        socket.close(4003, 'Journey attempt unavailable');
        return;
      }
      if (candidate.missionId === journeyDallas11.id && !journeyStore.progress(profile.pilotId, journeyDallas10.id).completed) {
        sendSocketMessage(socket, { type: 'journeyUnavailable', reason: 'Mission attempt is no longer available. Return to Journey and retry.' });
        socket.close(4003, 'Journey attempt unavailable');
        return;
      }
    }
    const pausedPlayerId = [...pausedJourneyPlayers].find(([id, paused]) =>
      paused.attemptId === requestedJourneyAttemptId &&
      (paused.accountId && paused.accountId === identity.session.accountId ||
        paused.sessionTokenHash === identity.session.tokenHash) &&
      players.get(id)?.pilotId === profile.pilotId)?.[0];
    // A server restart loses the in-memory aircraft pose. Fail honestly through
    // the normal result dialog rather than leave a paused attempt inaccessible.
    const unrestorable = candidate.pausedAt !== null && !pausedPlayerId
      ? journeyStore.fail(profile.pilotId, requestedJourneyAttemptId, 'INTERRUPTED') : undefined;
    if (pausedPlayerId) {
      for (const [otherSocket, otherId] of playerSockets) if (otherId === pausedPlayerId) {
        removeHumanConnection(otherSocket);
        otherSocket.close(4001, 'Paused mission opened elsewhere');
      }
      playerId = pausedPlayerId;
      restoringPausedJourney = true;
    }
    journeyAttempt = unrestorable ?? (restoringPausedJourney ? candidate : candidate.status === 'READY'
      ? journeyStore.approach(profile.pilotId, requestedJourneyAttemptId)
      : candidate.status === 'APPROACH' || candidate.status === 'RACING'
        ? journeyStore.fail(profile.pilotId, requestedJourneyAttemptId, 'INTERRUPTED')
        : candidate);
    if (!journeyAttempt) { socket.close(4003, 'Journey attempt unavailable'); return; }
  }
  const spawnSlot = restoringPausedJourney || restoringPausedTraining ? players.get(playerId)?.spawnSlot ?? 0 : reserveSpawnSlot(cityId);
  const spawnPosition = { x: 0, y: 1.2, z: 45 + spawnSlot * 15 };
  const spawnAirportId = journeyAttempt?.missionId === journeyDallas24.id ? journeyDallas24.startAirportId
    : journeyAttempt?.missionId === journeyDallas23.id ? journeyDallas23.startAirportId
    : journeyAttempt?.missionId === journeyDallas21.id ? journeyDallas21.startAirportId
    : journeyAttempt?.missionId === journeyDallas20.id ? journeyDallas20.startAirportId
    : journeyAttempt?.missionId === journeyDallas18.id ? journeyDallas18.startAirportId
    : journeyAttempt?.missionId === journeyDallas16.id ? journeyDallas16.startAirportId
    : journeyAttempt?.missionId === journeyDallas15.id ? journeyDallas15.startAirportId
    : journeyAttempt?.missionId === journeyDallas09.id ? journeyDallas09.startAirportId
    : journeyAttempt?.missionId === journeyDallas14.id ? journeyDallas14.startAirportId
    : journeyAttempt?.missionId === journeyDallas13.id ? journeyDallas13.startAirportId
    : journeyAttempt?.missionId === journeyDallas12.id ? journeyDallas12.startAirportId
    : journeyAttempt?.missionId === journeyDallas11.id ? journeyDallas11.startAirportId
    : journeyAttempt?.missionId === journeyDallas10.id ? journeyDallas10.startAirportId
    : journeyAttempt?.missionId === journeyDallas08.id ? journeyDallas08.startAirportId
    : journeyAttempt?.missionId === journeyDallas07.id ? journeyDallas07.startAirportId
    : undefined;
  // Golden Gates missions 1–6 use the normal DFW runway takeoff.
  const airborneSpawn = authorizedJourneyAirborneSpawn(journeyAttempt, journeyDallas17, dallasTerrain.elevationAt)
    ?? authorizedJourneyAirborneSpawn(journeyAttempt, journeyDallas19, dallasTerrain.elevationAt)
    ?? authorizedJourneyAirborneSpawn(journeyAttempt, journeyDallas22, dallasTerrain.elevationAt);
  const initialAcceptedPosition = airborneSpawn?.position ?? expectedInitialTransform(cityId, spawnSlot, spawnPosition, spawnAirportId);

  if (restoringPausedJourney) {
    const restored = players.get(playerId)!;
    restored.profile = profile;
    restored.sessionTokenHash = identity.session.tokenHash;
  } else if (!restoringPausedTraining && !reconnectingDuelPlayerId) players.set(playerId, {
    pilotId: profile.pilotId,
    timePreset,
    accountId: identity.session.accountId,
    sessionTokenHash: identity.session.tokenHash,
    profile,
    entityType: 'player',
    isBot: false,
    cityId,
    position: initialAcceptedPosition,
    rotation: { x: 0, y: airborneSpawn?.heading ?? (cityId === 'dallas'
      ? cityAirports[cityId].find(airport => airport.id === spawnAirportId)?.heading ?? 0 : 0), z: 0 },
    aircraftType: activeAircraftType,
    displayName: profile.pilotName,
    score: 0,
    health: journeyAttempt?.missionId === journeyDallas17.id && journeyAttempt.status === 'APPROACH'
      ? Math.round(maxHealthForAircraft(activeAircraftType) * journeyDallas17.startHealthFraction)
      : maxHealthForAircraft(activeAircraftType),
    lifeState: 'respawning',
    hasRespawnTransform: false,
    lastFireAt: 0,
    spawnProtectedUntil: Date.now() + Math.max(spawnProtectionMs, journeyAttempt?.missionId === journeyDallas19.id ? journeyDallas19.prepareMs : journeyAttempt?.missionId === journeyDallas22.id ? journeyDallas22.prepareMs : 0),
    velocity: airborneSpawn ? { x: -Math.sin(airborneSpawn.heading) * airborneSpawn.speed, y: 0,
      z: -Math.cos(airborneSpawn.heading) * airborneSpawn.speed } : { x: 0, y: 0, z: 0 },
    boostActive: false,
    lastStateAt: Date.now(),
    lastAcceptedPosition: initialAcceptedPosition,
    lastAcceptedTransformAt: Date.now(),
    chaosQaEnabled,
    tutorialMode,
    skyDuelMode,
    territoryIds: new Set(),
    distanceRewardMeters: 0,
    spawnSlot,
  });
  if (reconnectingDuelPlayerId) {
    const restored = players.get(playerId)!;
    restored.profile = profile;
    restored.sessionTokenHash = identity.session.tokenHash;
    restored.lastAcceptedTransformAt = Date.now();
    const session = restored.skyDuelMatchId && skyDuelSessions.get(restored.skyDuelMatchId);
    if (session) {
      const disconnectedAt = session.playerA === playerId ? session.disconnectedA : session.disconnectedB;
      if (session.phase === 'loading' && disconnectedAt) session.loadingEndsAt += Date.now() - disconnectedAt;
      if (session.playerA === playerId) session.disconnectedA = 0;
      else session.disconnectedB = 0;
      if (session.phase === 'countdown' || session.phase === 'launch') {
        session.phase = 'countdown';
        session.countdownEndsAt = Date.now() + 5_000;
        session.launchStartedAt = session.launchCountdownAt = session.launchEndsAt = 0;
        session.lastStateAt = 0;
        for (const participantId of [session.playerA, session.playerB]) {
          const participant = players.get(participantId);
          if (participant) participant.spawnProtectedUntil = session.countdownEndsAt + 2_000;
        }
        sendToPlayer(skyDuelPeer(playerId) ?? '', { type: 'skyDuelState', matchId: session.id,
          phase: 'countdown', scoreA: session.scoreA, scoreB: session.scoreB,
          countdownEndsAt: session.countdownEndsAt, endsAt: 0 });
      }
      sendToPlayer(skyDuelPeer(playerId) ?? '', { type: 'skyDuelOpponentReconnected' });
    }
  }
  lastSentCredits.set(playerId, profile.credits);
  playerSockets.set(socket, playerId);
  if (journeyAttempt) {
    playerJourneyAttempts.set(playerId, journeyAttempt.attemptId);
    if (missionFocusForAttempt(journeyAttempt)) missionFocusedPlayers.add(playerId);
    if (missionFocusedPlayers.has(playerId) && (journeyAttempt.missionId === journeyDallas14.id || journeyAttempt.missionId === journeyDallas15.id || journeyAttempt.missionId === journeyDallas19.id) && journeyAttempt.targetId)
      missionFocusHunterTargets.set(playerId, journeyAttempt.targetId);
    if (missionFocusedPlayers.has(playerId) && (journeyAttempt.missionId === journeyDallas16.id || journeyAttempt.missionId === journeyDallas08.id || journeyAttempt.missionId === journeyDallas09.id || journeyAttempt.missionId === journeyDallas10.id))
      missionFocusCrossfireTargets.set(playerId, new Set([journeyAttempt.targetId, journeyAttempt.secondaryTargetId].filter((id): id is string => Boolean(id))));
    if (!restoringPausedJourney && journeyAttempt.status === 'APPROACH' && !airborneSpawn) playerJourneyRunwayPrep.add(playerId);
  }
  if (!restoringPausedJourney && airborneSpawn) landingFlightState.set(playerId, { baselineY: airborneSpawn.position.y - 8, airborne: true });
  const restoredChaosEvent = profileStore.activeChaosEvent(profile.pilotId);
  const currentChaosEvent = cityEvents.get(cityId);
  if (restoredChaosEvent && currentChaosEvent?.id === restoredChaosEvent.eventId && currentChaosEvent.lifecycle === 'active') {
    currentChaosEvent.participants.add(playerId);
    currentChaosEvent.progress.set(playerId, restoredChaosEvent.progress);
  }
  const clientIp = trustedClientIp(request);
  playerClientIps.set(playerId, clientIp);
  const trialNetworkId = trialNetworkGuard.identify(clientIp);
  if (trialNetworkId) { playerTrialNetworkIds.set(playerId, trialNetworkId); profileStore.registerNetworkIdentity(profile.pilotId, trialNetworkId); }
  const host = analyticsHost(request.headers.host);
  const journeyToken = new URL(request.url ?? '/', 'http://localhost').searchParams.get('analyticsSession');
  const journeyId = journeyToken && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(journeyToken) ? `${profile.pilotId}:${journeyToken}` : undefined;
  const analyticsContext: AnalyticsContext = { pilotId: profile.pilotId, sessionId: playerId, journeyId, cityId, aircraftType: profile.selectedAircraft, platform: analyticsPlatform(request), ...host };
  if (!restoringPausedJourney && !restoringPausedTraining) {
    analyticsContexts.set(playerId, analyticsContext);
    analyticsStore.startSession(analyticsContext);
  }
  if (!tutorialMode && !restoringPausedJourney && !restoringPausedTraining) {
    const startedAt = Date.now();
    flightAnalytics.set(playerId, { startedAt, airborneMs: 0, distanceMeters: 0, startingScore: players.get(playerId)?.score ?? 0, kills: 0, landings: 0, missions: 0 });
    analyticsStore.recordEvent(analyticsContext, 'flight_started', {}, startedAt);
    analyticsStore.recordEvent(analyticsContext, 'game_started', {}, startedAt);
  }
  if (!restoringPausedJourney && !restoringPausedTraining) {
    analyticsStore.recordEvent(analyticsContext,'city_entered',{source:intercityArrival.completed?'intercity':'direct'});
    if(intercityArrival.completed)analyticsStore.recordEvent(analyticsContext,'intercity_route_completed',{amount:intercityArrival.credits,source:intercityArrival.routeId});
    if (activatedTrialOnConnect) analyticsStore.recordEvent(analyticsContext, 'fighter_trial_started', { source: 'garage' });
  }
  console.log(`[server] player connected: ${playerId} (${playerSockets.size} humans online)`);
  if (stabilityDiagnosticsEnabled) console.info('[connection]', {
    pilotId: profile.pilotId, sessionId: playerId, cityId, kind: connectionKind,
    browser: (request.headers['user-agent'] ?? 'unknown').slice(0, 140),
    humans: [...players.values()].filter(player => !player.isBot && player.cityId === cityId).length,
  });
  // Populate a newly occupied city before its first snapshot, so a late join
  // immediately receives the same server-owned bot roster as existing pilots.
  if (!skyDuelMode) reconcileBots(cityId);

  sendSocketMessage(socket,
    {
      type: 'welcome',
      protocolVersion: PROTOCOL_VERSION,
      journeyPauseSupported: true,
      selectionRevision: 0,
      playerId,
      pilotId: profile.pilotId,
      cityId,
      tutorialMode,
      skyDuelStakesEnabled: skyDuelMode && skyDuelStakesEnabled,
      skyDuelAiPracticeEnabled: skyDuelMode && skyDuelAiPracticeEnabled,
      tutorialSteps: profileStore.tutorialStepStates(profile.pilotId),
      ...(restoringPausedTraining ? { trainingSlideIndex: profileStore.trainingSlideIndex(profile.pilotId) } : {}),
      ...(restoringPausedTraining ? { trainingPausedAt: pausedTrainingPlayers.get(playerId)!.pausedAt, serverNow: Date.now() } : {}),
      activeAircraftType,
      spawnPosition,
      spawnAirportId,
      ...(!restoringPausedJourney && airborneSpawn ? { airborneSpawn } : {}),
      ...(restoringPausedJourney || restoringPausedTraining || reconnectingDuelPlayerId ? { resumeFlight: {
        position: players.get(playerId)!.position,
        rotation: players.get(playerId)!.rotation,
        velocity: players.get(playerId)!.velocity,
        onGround: reconnectingDuelPlayerId
          ? Boolean(runwayOrTaxiSpawnArea(players.get(playerId)!))
          : landingFlightState.get(playerId)?.airborne !== true,
      } } : {}),
      health: players.get(playerId)!.health,
      maxHealth: skyDuelMode ? skyDuelHealth : maxHealthForAircraft(activeAircraftType),
      lifeState: players.get(playerId)!.lifeState,
      event: !skyDuelMode && cityEvents.get(cityId) ? (eventSnapshot(cityEvents.get(cityId)!) as { event?: unknown }).event : undefined,
      social: socialSnapshot(cityId),
      heatStates: [...players.entries()]
        .filter(([, existing]) => existing.cityId === cityId)
        .map(([existingPlayerId]) => heatSnapshot(existingPlayerId)),
      territories: territorySnapshot(cityId),
      weeklyLeaderboards: weeklyLeaderboardSnapshot(cityId, playerId),
      profile,
      repairCooldowns: repairsForCity(cityId).filter((beacon) => beacon.kind === 'heart').flatMap((beacon) => {
        const remainingMs = (repairCooldowns.get(`${profile.pilotId}:${beacon.id}`) ?? 0) - Date.now();
        return remainingMs > 0 ? [{ id: beacon.id, remainingMs }] : [];
      }),
      players: skyDuelMode ? [] : [...players.entries()]
        .filter(([existingPlayerId, player]) => existingPlayerId !== playerId && !pausedJourneyPlayers.has(existingPlayerId) && !pausedTrainingPlayers.has(existingPlayerId) && player.cityId === cityId &&
          !player.skyDuelMode &&
          (!player.bot?.journeyRearGuardEscort || player.bot.journeyTargetPlayerId === playerId) &&
          (!player.trainingOwnerId || player.trainingOwnerId === playerId))
        .map(([existingPlayerId, player]) => ({
          playerId: existingPlayerId,
          cityId: player.cityId,
          displayName: player.displayName,
          position: player.position,
          altitudeMeters: Math.max(0, player.position.y - botTerrainHeight(player.cityId, player.position.x, player.position.z)),
          rotation: player.rotation,
          aircraftType: player.aircraftType,
          equippedCosmetics: player.profile?.cosmetics?.equipped ?? {},
          lifeState: player.lifeState,
          isBot: player.isBot,
          botPersonality: player.bot?.personality,
          boostActive: player.boostActive,
          health: player.health,
          maxHealth: transportEscortHealth(player.bot) ?? (player.bot?.journeyAce ? journeyDallas15.bossHealth : maxHealthForAircraft(player.aircraftType)),
          ...(player.bot?.journeyRearGuardEscort ? { rearGuardEscort: true } : {}),
          ...(transportEscortCosmetics(player.bot) ? { equippedCosmetics: transportEscortCosmetics(player.bot) } : {}),
        })),
    },
  );
  if (reconnectingDuelPlayerId) {
    const participant = players.get(playerId)!;
    const session = participant.skyDuelMatchId && skyDuelSessions.get(participant.skyDuelMatchId);
    if (session) {
      if (session.phase === 'loading') skyDuelSpawn(playerId, session, Date.now());
      const opponent = players.get(session.playerA === playerId ? session.playerB : session.playerA);
      if (opponent) sendToPlayer(playerId, {
        type: 'playerState', playerId: session.playerA === playerId ? session.playerB : session.playerA,
        cityId: 'dallas', position: opponent.position, rotation: opponent.rotation,
        altitudeMeters: Math.max(0, opponent.position.y - botTerrainHeight('dallas', opponent.position.x, opponent.position.z)),
        aircraftType: opponent.aircraftType, equippedCosmetics: opponent.profile?.cosmetics?.equipped ?? {},
        displayName: opponent.displayName, lifeState: opponent.lifeState, health: opponent.health,
        maxHealth: skyDuelHealth, isBot: opponent.isBot, boostActive: opponent.boostActive,
      });
      sendToPlayer(playerId, { type: session.phase === 'loading' ? 'skyDuelLoading' : 'skyDuelFound', matchId: session.id,
        playerAId: session.playerA, playerBId: session.playerB,
        practice: session.practice === true, aiOpponent: session.aiOpponent === true,
        phase: session.phase, recovered: true,
        opponentDisconnected: Boolean(session.playerA === playerId ? session.disconnectedB : session.disconnectedA),
        pilotA: players.get(session.playerA)?.displayName, pilotB: players.get(session.playerB)?.displayName,
        pilotAId: players.get(session.playerA)?.pilotId, pilotBId: players.get(session.playerB)?.pilotId,
        levelA: players.get(session.playerA)?.profile?.pilotProgress.level,
        levelB: skyDuelPilotLevel(players.get(session.playerB), session.aiOpponent === true),
        aircraftA: skyDuelCardDetails(players.get(session.playerA)).aircraft,
        aircraftB: skyDuelCardDetails(players.get(session.playerB)).aircraft,
        avatarA: skyDuelCardDetails(players.get(session.playerA)).avatar,
        avatarB: skyDuelCardDetails(players.get(session.playerB)).avatar,
        countdownEndsAt: session.countdownEndsAt, entry: competitiveModes.skyDuel.entryCredits,
        launchStartedAt: session.phase === 'launch' ? session.launchStartedAt : undefined,
        launchCountdownAt: session.phase === 'launch' ? session.launchCountdownAt : undefined,
        launchEndsAt: session.phase === 'launch' ? session.launchEndsAt : undefined,
        prize: competitiveModes.skyDuel.prizeCredits, protectedUntil: players.get(playerId)?.spawnProtectedUntil });
      if (session.phase !== 'loading') sendToPlayer(playerId, { type: 'skyDuelState', matchId: session.id, phase: session.phase,
        scoreA: session.scoreA, scoreB: session.scoreB,
        countdownEndsAt: session.phase === 'countdown' ? session.countdownEndsAt : undefined,
        launchStartedAt: session.phase === 'launch' ? session.launchStartedAt : undefined,
        launchCountdownAt: session.phase === 'launch' ? session.launchCountdownAt : undefined,
        launchEndsAt: session.phase === 'launch' ? session.launchEndsAt : undefined,
        endsAt: session.phase === 'overtime' ? session.overtimeEndsAt : session.phase === 'active'
          ? session.startedAt + competitiveModes.skyDuel.durationMs : undefined });
    }
  }
  if (skyDuelMode && !reconnectingDuelPlayerId) {
    const pendingResult = pendingSkyDuelResults.get(profile.pilotId);
    if (pendingResult) sendToPlayer(playerId, pendingResult.message);
  }
  if (journeyAttempt) sendJourneyState(playerId, journeyAttempt);
  if(tutorialMode&&!restoringPausedTraining&&profileStore.nextPendingTutorialStep(profile.pilotId)==='landing')sendTutorialLandingApproach(playerId,players.get(playerId)!);
  if (restoringPausedTraining && (profileStore.trainingSlideIndex(profile.pilotId) ?? 0) >= trainingSlideIds.indexOf('approach') &&
      (profileStore.trainingSlideIndex(profile.pilotId) ?? 0) <= trainingSlideIds.indexOf('fire'))
    createTrainingTarget(playerId, players.get(playerId)!);
  broadcastToCity(cityId, { type: 'cosmeticChanged', playerId, equipped: profile.cosmetics.equipped });
  if (weeklyRewardNew && weeklyReward) {
    sendSocketMessage(socket, { type: 'weeklyRewardClaimed', reward: weeklyReward });
    analyticsStore.recordEvent(analyticsContext, 'weekly_reward_awarded', { amount: weeklyReward.credits, metadata: { rank: weeklyReward.rank, category: weeklyReward.category } });
  }
  broadcastLeaderboard(cityId);

  socket.on('message', (data) => {
    if (playerSockets.get(socket) !== playerId) return;
    try {
      const message = JSON.parse(data.toString()) as {
        type?: string; attemptId?: unknown; matchId?: unknown;
        displayName?: unknown;
        score?: unknown;
        targetId?: unknown;
        aimHorizontal?: unknown;
        aimVertical?: unknown;
        aimSample?: unknown;
        clientShotId?: unknown;
        eventId?: unknown;
        challengeId?: unknown;
        gateIndex?: unknown;
        challengeType?: unknown;
        action?: unknown;
        qaEvent?: unknown;
        legacy?: LegacyProfileImport;
        progress?: ProfileProgress;
        aircraftType?: unknown;
        purchaseRequestId?: unknown;
        testerCode?: unknown;
        startFighterTrial?: unknown;
        fighterTrialBoundary?: unknown;
        equipRequestId?: unknown;
        airportId?: unknown;
        telemetry?: unknown;
        rewardId?: unknown;
        rewardSource?: unknown;
        missionId?: unknown;
        missionCityId?: unknown;
        replaceMission?: unknown;
        expectedAttemptId?: unknown;
        maneuver?: unknown;
        boostActive?: unknown;
        transform?: unknown;
        event?: unknown;
        opponentId?: unknown;
        mode?: unknown;
        destinationAirportId?: unknown;
        accept?: unknown;
        code?: unknown;
        tutorialStatus?: unknown;
        tutorialStep?: unknown;
        tutorialStepStatus?: unknown;
        tutorialResetReason?: unknown;
        cosmeticId?: unknown;
        currency?: unknown;
        weeklyEventId?: unknown;
        routeId?: unknown;
      } & Partial<Transform>;
      const player = players.get(playerId);
      if (!player) return;
      if (player.skyDuelMode) {
        if (message.type === 'skyDuelRematchReady' || message.type === 'skyDuelRematchLeave') {
          if (typeof message.matchId !== 'string') return;
          const offer = skyDuelRematches.get(message.matchId);
          if (!offer || offer.pilotA !== player.pilotId && offer.pilotB !== player.pilotId) {
            sendToPlayer(playerId, { type: 'skyDuelRematchState', matchId: message.matchId, available: false,
              readyA: false, readyB: false, reason: 'EXPIRED' });
            return;
          }
          if (message.type === 'skyDuelRematchLeave') { abandonSkyDuelRematches(player.pilotId); return; }
          if (!skyDuelStakesEnabled && !offer.practice || player.skyDuelMatchId ||
            !offer.practice && (skyDuelStore.balance(player.pilotId) ?? 0) < competitiveModes.skyDuel.entryCredits) {
            skyDuelRematches.delete(offer.matchId);
            sendSkyDuelRematchState(offer, false, 'INSUFFICIENT_CREDITS');
            return;
          }
          if (offer.pilotA === player.pilotId) offer.readyA = true;
          else offer.readyB = true;
          if (offer.aiOpponent) offer.readyB = true;
          if (offer.readyA && offer.readyB && !offer.startsAt) offer.startsAt = Date.now() + 650;
          sendSkyDuelRematchState(offer);
          return;
        }
        if (message.type === 'skyDuelBackgrounded') {
          const session = player.skyDuelMatchId ? skyDuelSessions.get(player.skyDuelMatchId) : undefined;
          if (session?.phase === 'loading' || session?.phase === 'countdown' || session?.phase === 'launch')
            markSkyDuelDisconnected(playerId, Date.now());
          return;
        }
        if (message.type === 'skyDuelResultSeen') {
          const pending = pendingSkyDuelResults.get(player.pilotId);
          if (pending?.matchId === ('matchId' in message ? message.matchId : undefined)) pendingSkyDuelResults.delete(player.pilotId);
          return;
        }
        if (message.type === 'skyDuelReady') {
          const session = player.skyDuelMatchId ? skyDuelSessions.get(player.skyDuelMatchId) : undefined;
          if (session?.phase === 'loading') {
            if (session.playerA === playerId) session.readyA = true;
            else if (session.playerB === playerId) session.readyB = true;
          }
          return;
        }
        if (message.type === 'skyDuelPresentationReady') {
          const session = player.skyDuelMatchId ? skyDuelSessions.get(player.skyDuelMatchId) : undefined;
          if (session?.phase === 'loading') {
            if (session.playerA === playerId) session.presentationReadyA = true;
            else if (session.playerB === playerId) session.presentationReadyB = true;
          }
          return;
        }
        if (message.type === 'skyDuelQueue') {
          abandonSkyDuelRematches(player.pilotId);
          if (!skyDuelStakesEnabled) { sendToPlayer(playerId, { type: 'skyDuelError', reason: 'PAID_MATCHES_UNAVAILABLE' }); return; }
          if (!hasOpenPlayerSocket(playerId)) return;
          if (player.skyDuelMatchId || skyDuelStore.activeFor(player.pilotId) ||
            [...skyDuelQueue.values()].some(entry => entry.pilotId === player.pilotId)) {
            sendToPlayer(playerId, { type: 'skyDuelError', reason: 'ALREADY_ACTIVE' }); return;
          }
          if (limitedBy('sky-duel-queue-pilot', player.pilotId, securityLimits.skyDuelQueuePilot).limited ||
            limitedBy('sky-duel-queue-ip', playerClientIps.get(playerId) ?? '', securityLimits.skyDuelQueueIp).limited) {
            sendToPlayer(playerId, { type: 'skyDuelError', reason: 'RATE_LIMITED' }); return;
          }
          const balance = skyDuelStore.balance(player.pilotId) ?? 0;
          if (balance < competitiveModes.skyDuel.entryCredits) {
            sendToPlayer(playerId, { type: 'skyDuelError', reason: 'INSUFFICIENT_CREDITS' }); return;
          }
          if (balance + competitiveModes.skyDuel.entryCredits > 1_000_000) {
            sendToPlayer(playerId, { type: 'skyDuelError', reason: 'WALLET_CAP' }); return;
          }
          const now = Date.now();
          player.skyDuelPractice = false;
          removePlayerProjectiles(playerId);
          skyDuelQueue.set(playerId, { playerId, pilotId: player.pilotId, queuedAt: now,
            rating: skyDuelStore.rating(player.pilotId),
            recentOpponents: new Set(skyDuelStore.recentOpponents(player.pilotId, now - 15 * 60_000)) });
          skyDuelFairWaitNotified.delete(playerId);
          sendToPlayer(playerId, { type: 'skyDuelWaiting', elapsedMs: 0, fairWait: false });
          return;
        }
        if (message.type === 'skyDuelPractice') {
          if (player.skyDuelMatchId) return;
          if (skyDuelAiPracticeEnabled && limitedBy('sky-duel-ai-practice', player.pilotId, securityLimits.skyDuelQueuePilot).limited) {
            sendToPlayer(playerId, { type: 'skyDuelError', reason: 'RATE_LIMITED' }); return;
          }
          skyDuelQueue.delete(playerId);
          skyDuelFairWaitNotified.delete(playerId);
        if (skyDuelAiPracticeEnabled) startSkyDuelAiMatch(playerId, Date.now(), false);
          else skyDuelPracticeSpawn(playerId, Date.now());
          return;
        }
        if (message.type === 'skyDuelCancel') {
          skyDuelQueue.delete(playerId);
          skyDuelFairWaitNotified.delete(playerId);
          // A reservation may have completed just before a queued pilot cancelled.
          const session = player.skyDuelMatchId && skyDuelSessions.get(player.skyDuelMatchId);
          if (session) skyDuelFinish(session, session.phase === 'loading' || session.phase === 'countdown' ? 'CANCELLED' :
            session.playerA === playerId ? 'WIN_B' : 'WIN_A', Date.now(), 'forfeit');
          else sendToPlayer(playerId, { type: 'skyDuelCancelled' });
          return;
        }
        if (message.type === 'skyDuelSurrender') {
          const session = player.skyDuelMatchId && skyDuelSessions.get(player.skyDuelMatchId);
          if (session) skyDuelFinish(session, session.phase === 'loading' || session.phase === 'countdown' ? 'CANCELLED' :
            session.playerA === playerId ? 'WIN_B' : 'WIN_A', Date.now(), 'forfeit');
          return;
        }
        if (message.type === 'skyDuelGroundCrash') {
          const session = player.skyDuelMatchId && skyDuelSessions.get(player.skyDuelMatchId);
          if (player.lifeState !== 'alive' || !player.hasRespawnTransform ||
            !session && !player.skyDuelPractice) return;
          markPlayerDestroyed(playerId, player, Date.now());
          const destroyed = { type: 'destroyed', cause: 'collision', playerId, position: player.position,
            aircraftType: player.aircraftType, killerId: '', killerDisplayName: '',
            victimDisplayName: player.displayName, killerScore: 0, killerReward: 0 };
          if (session) {
            sendSkyDuel(session, destroyed);
            if (session.playerA === playerId) session.respawnA = Date.now() + competitiveModes.skyDuel.respawnMs;
            else session.respawnB = Date.now() + competitiveModes.skyDuel.respawnMs;
          } else if (player.skyDuelPractice) {
            sendToPlayer(playerId, destroyed);
            player.skyDuelPracticeRespawnAt = Date.now() + competitiveModes.skyDuel.respawnMs;
          }
          return;
        }
        if (message.type !== 'state' && message.type !== 'lock' && message.type !== 'fire' && message.type !== 'collision') return;
      }
      if (message.type === 'trainingResume' && pausedTrainingPlayers.has(playerId)) {
        const paused = pausedTrainingPlayers.get(playerId)!;
        if (Date.now() - paused.pausedAt >= JOURNEY_PAUSE_LIMIT_MS) { expirePausedTraining(Date.now()); return; }
        pausedTrainingPlayers.delete(playerId);
        player.lastStateAt = Date.now();
        player.lastAcceptedTransformAt = Date.now();
        sendToPlayer(playerId, { type: 'trainingPauseState', paused: false });
        return;
      }
      if (pausedTrainingPlayers.has(playerId)) return;
      if (message.type === 'journeyPause') {
        if (message.attemptId === playerJourneyAttempts.get(playerId)) pausePlayerJourney(playerId);
        return;
      }
      if (message.type === 'journeyResume') {
        if (message.attemptId === pausedJourneyPlayers.get(playerId)?.attemptId) resumePlayerJourney(playerId);
        return;
      }
      if (pausedJourneyPlayers.has(playerId)) return;

      if (message.type === 'analyticsEvent') {
        const now = Date.now();
        if (message.event === 'crash' && player.lifeState === 'alive' && player.hasRespawnTransform && now - player.lastStateAt <= 2_000 && (lastClientCrashAnalytics.get(playerId) ?? 0) <= now - 5_000) {
          lastClientCrashAnalytics.set(playerId, now);
          recordAnalytics(playerId, 'crash', { source: 'terrain_or_landing' }, now);
        }
        if (message.event === 'fighter_modal_viewed' || message.event === 'fighter_purchase_clicked' || message.event === 'photo_mode_opened' || message.event === 'secret_discovered' || message.event === 'flight_recap_shown' || message.event === 'fly_again_clicked' || message.event === 'daily_flight_plan_viewed' || message.event === 'input_mode_detected' || message.event === 'touch_controls_enabled' || message.event === 'graphics_quality_changed' || message.event === 'mobile_layout_used' || message.event === 'photo_mode_touch_opened' || message.event === 'tutorial_retried' || message.event === 'tutorial_crashed') {
          const boundedMode = typeof message.mode === 'string' && ['touch', 'auto', 'on', 'off', 'high', 'balanced', 'low', 'narrow', 'wide','tutorial_v1','joystick','throttle','takeoff','turnLeft','turnRight','climb','descend','targetLock','fire','landing'].includes(message.mode) ? message.mode : undefined;
          recordAnalytics(playerId, message.event, { metadata: { cityId: player.cityId, ...(boundedMode ? { mode: boundedMode } : {}) } }, now);
        }
        if (message.event === 'fighter_trial_completed' && profileStore.markFighterTrialCompleted(player.pilotId, now)) {
          player.profile = profileStore.getOrCreate(player.pilotId, player.displayName);
          recordAnalytics(playerId, 'fighter_trial_completed', { metadata: { cityId: player.cityId } }, now);
          sendProfile(playerId, player.profile);
        }
        return;
      }

      if (message.type === 'firehawkPromotionRequest') {
        const attempts = firehawkPromotionRequestCounts.get(playerId) ?? 0;
        if (attempts >= 5 || firehawkPromotionShownConnections.has(playerId) || player.tutorialMode || !cityCapabilities(player.cityId)?.progressionEnabled) return;
        firehawkPromotionRequestCounts.set(playerId, attempts + 1);
        const mission = typeof message.missionId === 'string' ? missionForCity(player.cityId, message.missionId) : undefined;
        if (!mission || !(['HARD', 'VERY HARD', 'EXTREME'].includes(mission.difficulty) || (mission.type === 'event' && ['aceIntercept', 'vipEscort'].includes(mission.requirements.eventType ?? '')))) return;
        const claimed = profileStore.claimFirehawkPromotion(player.pilotId, mission.id, Date.now());
        if (!claimed) return;
        firehawkPromotionShownConnections.add(playerId);
        sendToPlayer(playerId, { type: 'firehawkPromotionOffer', missionId: mission.id, trialEligible: claimed.trialEligible, displayPrice: '2,400 Sky Tokens' });
        return;
      }

      if(message.type==='tutorialState'&&(message.tutorialStatus==='started'||message.tutorialStatus==='completed'||message.tutorialStatus==='skipped')){
        if(!cityCapabilities(player.cityId)?.tutorialEnabled)return;
        if(message.tutorialStatus==='completed'&&(!profileStore.tutorialStepsResolved(player.pilotId)||
            (!profileStore.dallasUnlocked(player.pilotId)&&!profileStore.trainingCompletionVerified(player.pilotId))))return;
        if(message.tutorialStatus!=='started'){
          removeTrainingTarget(playerId);removePlayerProjectiles(playerId);
          profileStore.setTutorialState(player.pilotId,message.tutorialStatus,Date.now());
          socket.close(1000,'Training ended');return;
        }
        player.tutorialMode=message.tutorialStatus==='started';
        const profile=profileStore.setTutorialState(player.pilotId,message.tutorialStatus,Date.now());
        if(player.tutorialMode && profile) {
          const challenge = challengeForPlayer(playerId);
          if (challenge) {
            pvpChallenges.delete(challenge.id);
            for (const id of [challenge.challengerId, challenge.opponentId]) sendToPlayer(id, {type:'pvpChallengeCancelled',challengeId:challenge.id,reason:'TUTORIAL FLIGHT STARTED'});
          }
          resetHumanToSafeRunway(playerId, player, profile, Date.now(), true, 'trainer');
        } else if(profile){removeTrainingTarget(playerId);player.profile=profile;sendProfile(playerId,profile,undefined,undefined,undefined,true);}
        recordAnalytics(playerId,message.tutorialStatus==='started'?'tutorial_started':message.tutorialStatus==='completed'?'tutorial_completed':'tutorial_skipped',{metadata:{cityId:player.cityId,tutorialVersion:'tutorial_v1'}},Date.now());
        return;
      }

      if(message.type==='tutorialStepStatus'){
        if(!player.tutorialMode||player.cityId!=='milwaukee'||!tutorialSteps.includes(message.tutorialStep as TutorialLessonStep)||(message.tutorialStepStatus!=='completed'&&message.tutorialStepStatus!=='skipped'))return;
        const step=message.tutorialStep as TutorialLessonStep;const status=message.tutorialStepStatus as Exclude<TutorialStepStatus,'pending'>;
        if(status==='completed'&&serverVerifiedTutorialSteps.has(step))return;
        const result=profileStore.recordTutorialStepStatus(player.pilotId,step,status,Date.now());
        sendTutorialStepResult(playerId,result,step,status);
        if(result.ok&&result.changed&&result.nextStep==='landing')sendTutorialLandingApproach(playerId,player);
        if(result.ok&&result.changed)recordAnalytics(playerId,status==='completed'?'tutorial_step_completed':'tutorial_step_skipped',{metadata:{cityId:player.cityId,mode:step}},Date.now());
        return;
      }

      if(message.type==='tutorialRunReset'&&(message.tutorialResetReason==='crash'||message.tutorialResetReason==='replay')){
        if(!player.tutorialMode||player.cityId!=='milwaukee')return;
        removeTrainingTarget(playerId);removePlayerProjectiles(playerId);profileStore.resetTutorialRun(player.pilotId,message.tutorialResetReason==='crash');
        const profile=profileStore.setTutorialState(player.pilotId,'started',Date.now());if(!profile)return;
        resetHumanToSafeRunway(playerId,player,profile,Date.now(),true,'trainer');
        const trainingSlideIndex=message.tutorialResetReason==='crash'?profileStore.trainingSlideIndex(player.pilotId):undefined;
        sendToPlayer(playerId,{type:'tutorialRunReset',reason:message.tutorialResetReason,steps:profileStore.tutorialStepStates(player.pilotId),nextStep:tutorialSteps[0],trainingSlideIndex});
        if(trainingSlideIndex!==undefined){
          const slide=trainingSlideIds[trainingSlideIndex];
          if(slide==='landing')sendTutorialLandingApproach(playerId,player,true);
          else if(trainingSlideIndex>trainingSlideIds.indexOf('takeoff')){
            sendTutorialScreenplayCruise(playerId,player);
            if(slide==='fire')createTrainingTarget(playerId,player,Date.now());
          }
        }
        return;
      }

      if(message.type==='tutorialTargetRequest'){
        if(!player.tutorialMode||player.cityId!=='milwaukee')return;
        const lesson=profileStore.nextPendingTutorialStep(player.pilotId);
        if(lesson!=='approach'&&lesson!=='targetLock'&&lesson!=='fire')return;
        createTrainingTarget(playerId,player,Date.now());
        return;
      }

      if (message.type === 'player') {
        // Names are durable profile data and may only change through the
        // validated, rate-limited HTTP account/profile endpoint.
        broadcastLeaderboard(player.cityId);
        updateKing(player.cityId);
        return;
      }

      if (message.type === 'profileImport') {
        const profile = player.accountId
          ? profileStore.getOrCreate(player.pilotId, player.displayName)
          : profileStore.importLegacy(player.pilotId, message.legacy ?? {});
        // The first legacy hydration is also an explicit server-side profile
        // reconciliation. Keep the active player transform aligned with that
        // persisted selection before any later transform can be broadcast.
        player.aircraftType = player.tutorialMode ? 'trainer' : profile.selectedAircraft;
        player.health = maxHealthForAircraft(player.aircraftType);
        sendProfile(playerId, profile, undefined, undefined, undefined, player.tutorialMode);
        broadcastToCity(player.cityId, {
          type: 'playerState', playerId, health: player.health, lifeState: player.lifeState,
          position: player.position, rotation: player.rotation, aircraftType: player.aircraftType, equippedCosmetics: player.profile?.cosmetics?.equipped ?? {},
          cityId: player.cityId, displayName: player.displayName, boostActive: player.boostActive, maxHealth: maxHealthForAircraft(player.aircraftType),
        });
        return;
      }

      if (message.type === 'profileProgress') {
        // Client progress is a presentation snapshot, never proof of activity.
        sendProfile(playerId, player.profile);
        return;
      }

      if (message.type === 'equipAircraft') {
        const requestId = message.equipRequestId;
        if (typeof requestId !== 'number' || !Number.isSafeInteger(requestId) || requestId <= 0) return;
        if (journeyStore.get(player.pilotId, playerJourneyAttempts.get(playerId) ?? '')?.missionId === journeyDallas09.id) {
          sendToPlayer(playerId, { type: 'equipRejected', equipRequestId: requestId, reason: 'FINISH OR LEAVE THE MISSION FIRST' });
          return;
        }
        if(player.tutorialMode){sendToPlayer(playerId,{type:'equipRejected',equipRequestId:requestId,reason:'BLUEJAY IS LOCKED FOR TRAINING'});return;}
        if (requestId <= (player.lastEquipRequestId ?? 0)) {
          sendToPlayer(playerId, { type: 'equipRejected', equipRequestId: requestId, reason: 'AIRCRAFT REQUEST ALREADY HANDLED' });
          return;
        }
        player.lastEquipRequestId = requestId;
        // A selection is profile-owned, but equipping it is a physical airport
        // action.  Enforcing the same safe-ground predicate on the server
        // prevents mid-air health/speed swaps and keeps every client honest.
        if (player.lifeState !== 'alive' || !player.hasRespawnTransform || Date.now() - player.lastStateAt > 1500 || !groundedAtAirport(player)) {
          sendToPlayer(playerId, { type: 'equipRejected', equipRequestId: requestId, reason: 'STOP AT AN AIRPORT TO CHANGE AIRCRAFT' });
          return;
        }
        const previousAircraft = player.aircraftType;
        const profile = profileStore.equipAircraft(player.pilotId, message.aircraftType);
        if (!profile || profile.selectedAircraft !== message.aircraftType) {
          sendToPlayer(playerId, { type: 'equipRejected', equipRequestId: requestId, reason: 'AIRCRAFT LOCKED — CHOOSE AN OWNED AIRCRAFT' });
          return;
        }
        player.profile = profile;
        player.selectionRevision = (player.selectionRevision ?? 0) + 1;
        player.aircraftType = profile.selectedAircraft;
        if (previousAircraft !== player.aircraftType) recordAnalytics(playerId, 'aircraft_equipped');
        player.health = maxHealthForAircraft(player.aircraftType);
        sendProfile(playerId, profile, undefined, requestId);
        broadcastToCity(player.cityId, {
          type: 'playerState', playerId, health: player.health, lifeState: player.lifeState,
          position: player.position, rotation: player.rotation, aircraftType: player.aircraftType, equippedCosmetics: player.profile?.cosmetics?.equipped ?? {},
          cityId: player.cityId, displayName: player.displayName, boostActive: player.boostActive, maxHealth: maxHealthForAircraft(player.aircraftType),
        });
        return;
      }

      if (message.type === 'startFighterTrial') {
        if (journeyStore.get(player.pilotId, playerJourneyAttempts.get(playerId) ?? '')?.missionId === journeyDallas09.id) {
          sendToPlayer(playerId, { type: 'fighterTrialResult', ok: false, reason: 'FINISH OR LEAVE THE MISSION FIRST' }); return;
        }
        if(player.tutorialMode){sendToPlayer(playerId,{type:'fighterTrialResult',ok:false,reason:'TEST FLIGHTS ARE UNAVAILABLE DURING TRAINING'});return;}
        if (player.lifeState !== 'alive' || !player.hasRespawnTransform || Date.now() - player.lastStateAt > 1500 || !groundedAtAirport(player)) {
          sendToPlayer(playerId, { type: 'fighterTrialResult', ok: false, reason: 'STOP AT AN AIRPORT TO START TEST FLIGHT' }); return;
        }
        const currentProfile = profileStore.getOrCreate(player.pilotId, player.profile.pilotName);
        const permanentlyOwned = currentProfile.aircraftEntitlements.includes(firehawkProduct.entitlement);
        const networkDecision = trialNetworkGuard.authorizeNewTrial(
          currentProfile.fighterTrial.status, permanentlyOwned, playerTrialNetworkIds.get(playerId),
        );
        if (!networkDecision.allowed) {
          const reason = networkDecision.reason === 'used'
            ? 'FREE TEST FLIGHT ALREADY USED ON THIS NETWORK\nTry again later or unlock Firehawk for 2,400 Sky Tokens.'
            : 'FREE TEST FLIGHT TEMPORARILY UNAVAILABLE';
          sendToPlayer(playerId, { type: 'fighterTrialResult', ok: false, reason });
          return;
        }
        const requested = profileStore.requestFighterTrial(player.pilotId);
        if (!requested.ok) { sendToPlayer(playerId, { type: 'fighterTrialResult', ok: false, reason: requested.reason }); return; }
        const profile = profileStore.activateFighterTrial(player.pilotId);
        if (!profile) return;
        player.profile = profile; player.aircraftType = 'fighter'; player.health = maxHealthForAircraft('fighter');
        player.selectionRevision = (player.selectionRevision ?? 0) + 1;
        sendProfile(playerId, profile);
        recordAnalytics(playerId, 'fighter_trial_started', { metadata: { cityId: player.cityId } });
        sendToPlayer(playerId, { type: 'fighterTrialResult', ok: true, reason: 'FIREHAWK TEST FLIGHT STARTED' });
        return;
      }

      if (message.type === 'fighterTrialBoundary') {
        if (journeyStore.get(player.pilotId, playerJourneyAttempts.get(playerId) ?? '')?.missionId === journeyDallas09.id) return;
        if (player.lifeState !== 'alive' || !player.hasRespawnTransform || Date.now() - player.lastStateAt > 1_500 || !groundedAtAirport(player)) return;
        const profile = profileStore.consumeExpiredFighterTrial(player.pilotId);
        if (!profile || profile.fighterTrial.status !== 'consumed') return;
        player.profile = profile; player.aircraftType = profile.selectedAircraft; player.health = maxHealthForAircraft(player.aircraftType);
        player.selectionRevision = (player.selectionRevision ?? 0) + 1;
        sendProfile(playerId, profile);
        broadcastToCity(player.cityId, {
          type: 'playerState', playerId, health: player.health, lifeState: player.lifeState,
          position: player.position, rotation: player.rotation, aircraftType: player.aircraftType, equippedCosmetics: player.profile?.cosmetics?.equipped ?? {},
          cityId: player.cityId, displayName: player.displayName, boostActive: player.boostActive, maxHealth: maxHealthForAircraft(player.aircraftType),
        });
        return;
      }

      if (message.type === 'purchaseAircraft') {
        const requestId = message.purchaseRequestId;
        if (typeof requestId !== 'number' || !Number.isSafeInteger(requestId) || requestId <= 0) return;
        const previouslyOwned = new Set(player.profile.unlockedAircraft);
        const result = profileStore.purchaseAircraft(player.pilotId, message.aircraftType);
        if (result.profile) { player.profile = result.profile; sendProfile(playerId, result.profile); }
        if (result.ok && result.profile && typeof message.aircraftType === 'string' && !previouslyOwned.has(message.aircraftType as AircraftType) && result.profile.unlockedAircraft.includes(message.aircraftType as AircraftType)) {
          const context = analyticsContexts.get(playerId);
          if (context) analyticsStore.recordEvent({ ...context, cityId: player.cityId, aircraftType: message.aircraftType }, 'aircraft_unlocked', { source: 'credits' });
        }
        sendToPlayer(playerId, { type: 'aircraftPurchaseResult', purchaseRequestId: requestId, aircraftType: message.aircraftType, ok: result.ok, reason: result.reason });
        return;
      }

      if (message.type === 'purchaseCosmetic' && typeof message.cosmeticId === 'string') {
        const limit = limitedBy('cosmetic-purchase-pilot', player.pilotId, securityLimits.cosmeticPurchasePilot);
        if (limit.limited) {
          sendToPlayer(playerId, { type: 'cosmeticResult', action: 'purchase', cosmeticId: message.cosmeticId, ok: false, reason: rateLimitMessage });
          return;
        }
        const result: { ok: boolean; purchased?: boolean; reason?: string; profile?: PlayerProfile } = message.currency === 'SKY_TOKENS' && (!player.accountId || !skyTokenCommerceAvailable(request))
          ? { ok: false, reason: 'SKY TOKEN UNLOCKS UNAVAILABLE' }
          : profileStore.purchaseCosmetic(player.pilotId, message.cosmeticId, message.currency ?? 'CREDITS');
        if (result.profile) { player.profile = result.profile; sendProfile(playerId, result.profile); }
        if (result.purchased) recordAnalytics(playerId, 'cosmetic_unlocked', { source: message.cosmeticId,
          metadata: { currency: message.currency === 'SKY_TOKENS' ? 'sky_tokens' : 'credits' } });
        sendToPlayer(playerId, { type: 'cosmeticResult', action: 'purchase', cosmeticId: message.cosmeticId, ok: result.ok, reason: result.reason });
        return;
      }
      if (message.type === 'seasonRewardClaim' && typeof message.rewardId === 'string') {
        const result=profileStore.claimSeasonReward(player.pilotId,player.cityId,message.rewardId);
        if(result.profile) sendProfile(playerId,result.profile,undefined,undefined,result.ok?'Season Reward Claimed':result.reason);
        return;
      }
      if (message.type === 'weeklyEventRewardClaim' && typeof message.weeklyEventId === 'string') {
        const result=profileStore.claimWeeklyEventReward(player.pilotId,player.cityId,message.weeklyEventId);
        if(result.profile) sendProfile(playerId,result.profile,undefined,undefined,result.ok?'Weekly Event Reward Claimed':result.reason);
        if(result.ok) recordAnalytics(playerId,'weekly_event_reward_claimed',{source:player.cityId});
        return;
      }
      if(message.type==='intercityRouteStart'&&typeof message.routeId==='string'){
        const route=routeDefinition(message.routeId);const airport=route&&airportForCity(player.cityId,route.fromAirportId);
        const nearAirport=Boolean(airport&&Math.hypot(player.position.x-airport.x,player.position.z-airport.z)<=Math.max(900,airport.runwayLength*.55)&&Math.hypot(player.velocity.x,player.velocity.z)<20);
        if(!route||!nearAirport||player.lifeState!=='alive'){sendToPlayer(playerId,{type:'intercityRouteResult',ok:false,reason:'LAND AND STOP AT THE DEPARTURE AIRPORT'});recordAnalytics(playerId,'intercity_route_failed',{source:message.routeId});return;}
        const result=profileStore.startIntercityRoute(player.pilotId,message.routeId,player.cityId);if(result.profile){player.profile=result.profile;sendProfile(playerId,result.profile);}sendToPlayer(playerId,{type:'intercityRouteResult',ok:result.ok,reason:result.reason,routeId:message.routeId,toCityId:route.toCityId});if(result.ok)recordAnalytics(playerId,'intercity_route_started',{source:message.routeId});else recordAnalytics(playerId,'intercity_route_failed',{source:message.routeId});return;
      }
      if (message.type === 'equipCosmetic' && typeof message.cosmeticId === 'string') {
        const result = profileStore.equipCosmetic(player.pilotId, message.cosmeticId);
        if (result.profile) {
          player.profile = result.profile; sendProfile(playerId, result.profile);
          broadcastToCity(player.cityId, { type: 'cosmeticChanged', playerId, equipped: result.profile.cosmetics.equipped });
        }
        if (result.ok) recordAnalytics(playerId, 'cosmetic_equipped', { source: message.cosmeticId });
        sendToPlayer(playerId, { type: 'cosmeticResult', action: 'equip', cosmeticId: message.cosmeticId, ok: result.ok, reason: result.reason });
        return;
      }

      if (message.type === 'redeemTesterCode') {
        const previouslyOwned = player.profile.unlockedAircraft.includes('fighter');
        const result = redeemTesterCode(player.pilotId, message.testerCode, playerClientIps.get(playerId) ?? 'unknown');
        if (result.profile) { player.profile = result.profile; sendProfile(playerId, result.profile); }
        if (result.ok && result.profile?.unlockedAircraft.includes('fighter') && !previouslyOwned) {
          const context = analyticsContexts.get(playerId);
          if (context) analyticsStore.recordEvent({ ...context, cityId: player.cityId, aircraftType: 'fighter' }, 'aircraft_unlocked', { source: 'tester_code' });
        }
        sendToPlayer(playerId, { type: 'testerCodeResult', ok: result.ok, reason: result.reason });
        return;
      }

      if (message.type === 'profileReward') {
        // The old client-generated Contracts path is retired. Never accept a
        // browser-originated Credits claim as a mission completion.
        return;
      }

      if (message.type === 'missionAccept') {
        if (player.tutorialMode || playerJourneyAttempts.has(playerId)) return;
        if (typeof message.missionId !== 'string') return;
        if (process.env.AIRPORT_CHAOS_MISSION_DEBUG === '1') console.log('[mission-accept]', { requested: message.missionId, replace: message.replaceMission, expected: message.expectedAttemptId, active: profileStore.missionState(player.pilotId, player.cityId)?.active?.attemptId });
        const definition = missionForCity(player.cityId, message.missionId);
        if (!definition) return;
        const unavailableReason = missionAcceptanceUnavailableReason(playerId, player, definition);
        if (unavailableReason) {
          sendToPlayer(playerId, { type: 'missionResult', ok: false, missionId: definition.id, reason: unavailableReason });
          return;
        }
        const hunter = definition.type === 'assignedHunter'
          ? [...players.entries()]
            .filter(([, candidate]) => candidate.cityId === player.cityId && candidate.isBot && candidate.bot?.personality === 'hunter' &&
              !candidate.bot.journeyAttemptId && candidate.lifeState === 'alive')
            .sort((a, b) => Math.hypot(a[1].position.x - player.position.x, a[1].position.z - player.position.z) - Math.hypot(b[1].position.x - player.position.x, b[1].position.z - player.position.z))[0]
          : undefined;
        const result = profileStore.acceptMission(player.pilotId, player.cityId, definition.id, message.replaceMission === true,
          typeof message.expectedAttemptId === 'string' ? message.expectedAttemptId : undefined);
        if (!result.ok) {
          sendToPlayer(playerId, { type: 'missionResult', ok: false, missionId: definition.id, reason: result.reason, confirmationRequired: result.confirmationRequired });
          return;
        }
        let profile = result.profile!;
        const acceptedAttempt = profile.missions[player.cityId]?.active;
        if (acceptedAttempt) {
          const initialized = initializeMissionAttempt(definition, acceptedAttempt, {
            at: Date.now(),
            alive: player.lifeState === 'alive',
            connected: hasOpenPlayerSocket(playerId),
            airborne: Boolean(landingFlightState.get(playerId)?.airborne),
            heading: player.rotation.y,
            x: player.position.x,
            z: player.position.z,
            altitudeMeters: Math.max(0, player.position.y - botTerrainHeight(player.cityId, player.position.x, player.position.z)),
          });
          if (hunter) initialized.targetId = hunter[0];
          profile = profileStore.updateMissionAttempt(player.pilotId, player.cityId, initialized) ?? profile;
        }
        sendProfile(playerId, profile);
        if (process.env.AIRPORT_CHAOS_MISSION_DEBUG === '1') console.log('[mission-issued]', profile.missions[player.cityId]?.active?.attemptId);
        sendToPlayer(playerId, { type: 'missionResult', ok: true, missionId: definition.id, attemptId: profile.missions[player.cityId]?.active?.attemptId });
        // Existing server ownership counts on the accepted attempt immediately;
        // no new capture event is required to initialize its checklist/timer.
        tickMissions(Date.now());
        return;
      }

      if (message.type === 'missionAbandon') {
        const missionCityId = message.missionCityId === 'dallas' || message.missionCityId === 'milwaukee'
          ? message.missionCityId : player.cityId;
        const profile = profileStore.abandonMission(player.pilotId, missionCityId,
          typeof message.expectedAttemptId === 'string' ? message.expectedAttemptId : undefined);
        if (profile) sendProfile(playerId, profile);
        return;
      }

      if (message.type === 'chaosAction') {
        const action = message.action;
        if (action === 'stunt' || action === 'nearMiss') {
          registerChaosAction(playerId, action, Date.now());
        }
        return;
      }

      if (message.type === 'landingIntent') {
        validateAndRecordLanding(playerId, player, message.airportId, message.telemetry);
        return;
      }

      if (message.type === 'challengeStart') { if (!playerJourneyAttempts.has(playerId)) startSkyChallenge(playerId, player, message.challengeId); return; }
      if (message.type === 'challengeGate') { if (!playerJourneyAttempts.has(playerId)) passSkyChallengeGate(playerId, player, message.challengeId, message.gateIndex); return; }
      if (message.type === 'transportReady') {
        const id=playerJourneyAttempts.get(playerId);
        const a=id?journeyStore.get(player.pilotId,id):undefined;
        if((a?.missionId===journeyDallas07.id || a?.missionId===journeyDallas08.id || a?.missionId===journeyDallas09.id || a?.missionId===journeyDallas10.id || a?.missionId===journeyDallas11.id || a?.missionId===journeyDallas12.id) && a.status==='APPROACH' && message.attemptId===id)transportReady.add(id!);
        return;
      }
      if (message.type === 'journeyCountdownComplete') {
        const id = playerJourneyAttempts.get(playerId);
        const attempt = id ? journeyStore.get(player.pilotId, id) : undefined;
        if (message.attemptId === id && (attempt?.status === 'APPROACH' || attempt?.status === 'RACING') && !pausedJourneyAttempts.has(id!)) {
          journeyCountdownComplete.add(id!);
          if (attempt.status === 'APPROACH') {
            const now = Date.now();
            const started = journeyStore.startRookieRush(player.pilotId, id!, now)
              ?? journeyStore.startTimedGateClock(player.pilotId, id!, now);
            if (started) sendJourneyState(playerId, started);
          }
        }
        return;
      }
      if (message.type === 'journeyCrash') {
        // The intro and start countdown have not produced a gameplay transform yet.
        if (player.hasRespawnTransform) failPlayerJourney(playerId, 'CRASHED');
        return;
      }

      if (message.type === 'chaosQa') {
        runChaosQaCommand(player, message.action, message.qaEvent);
        return;
      }

      if (message.type === 'lock') {
        // Target IDs/aim coordinates are hints at most; selection and the
        // bounded moving aim are computed entirely from authoritative state.
        updateAssistedAim(playerId, player, Date.now(), message.aimHorizontal, message.aimVertical);
        return;
      }

      if (message.type === 'fire') {
        const now = Date.now();
        if (playerJourneyRunwayPrep.has(playerId)) return;
        const firingAttemptId = playerJourneyAttempts.get(playerId);
        const firingAttempt = firingAttemptId ? journeyStore.get(player.pilotId, firingAttemptId) : undefined;
        if ((firingAttempt?.missionId === journeyDallas19.id || firingAttempt?.missionId === journeyDallas07.id || firingAttempt?.missionId === journeyDallas08.id || firingAttempt?.missionId === journeyDallas09.id || firingAttempt?.missionId === journeyDallas10.id || firingAttempt?.missionId === journeyDallas11.id || firingAttempt?.missionId === journeyDallas12.id) &&
          (firingAttempt.status !== 'RACING' || now - player.lastAcceptedTransformAt > combatTransformFreshMs)) return;
        if((firingAttempt?.missionId===journeyDallas07.id || firingAttempt?.missionId===journeyDallas08.id || firingAttempt?.missionId===journeyDallas09.id || firingAttempt?.missionId===journeyDallas10.id || firingAttempt?.missionId===journeyDallas11.id || firingAttempt?.missionId===journeyDallas12.id) && (firingAttempt.deadlineAt===null||now>=firingAttempt.deadlineAt))return;
        const blocked = fireBlockReason(player, now);
        if (blocked) {
          logFireBlocked(playerId, blocked, now);
          return;
        }
        const clientShotId = typeof message.clientShotId === 'string' && message.clientShotId.length <= 80
          ? message.clientShotId
          : undefined;
        const requestedTargetId = typeof message.targetId === 'string' ? message.targetId : undefined;
        const fireTransform = validFireTransform(player, message.transform);
        const shotAim = validatedShotAim(player, message.aimSample, now);
        const assisted = requestedTargetId && requestedTargetId === player.lockedTargetId
          ? createAssistedShot(playerId, player, requestedTargetId, clientShotId, fireTransform, shotAim)
          : false;
        if (requestedTargetId && !assisted && !players.get(requestedTargetId)?.bot?.journeyRearGuardEscort) {
          logLockShotReject(
            playerId,
            player,
            requestedTargetId,
            fireTransform,
            requestedTargetId === player.lockedTargetId ? 'lock_geometry' : 'stale_lock',
            now,
          );
        }
        if (!assisted) {
          if (!createProjectile(playerId, player, clientShotId, fireTransform, shotAim)) {
            logFireBlocked(playerId, projectiles.size >= maxProjectiles ? 'projectile_cap' : 'invalid_state', now);
          } else {
            const lockedTarget = currentLockedTarget(playerId, player, player.lockedTargetId, now, fireTransform);
            if (lockedTarget && player.lockedTargetId) sendIncomingFire(player.lockedTargetId, playerId);
          }
        }
        return;
      }

      if (message.type === 'eventJoin') {
        if (player.tutorialMode) return;
        joinDynamicEvent(playerId, player, typeof message.eventId === 'string' ? message.eventId : undefined);
        return;
      }

      if (message.type === 'pvpChallengeInvite') {
        if (player.tutorialMode || !cityCapabilities(player.cityId)?.competitiveEnabled) return;
        if (typeof message.opponentId !== 'string' || challengeForPlayer(playerId)) return;
        const opponent = players.get(message.opponentId);
        const mode = message.mode === 'airportSprint' ? 'airportSprint' : message.mode === 'dogfight' ? 'dogfight' : undefined;
        if (!mode || !isHumanPilot(opponent) || opponent.tutorialMode || opponent.cityId !== player.cityId || challengeForPlayer(message.opponentId)) return;
        const destination = mode === 'airportSprint' && typeof message.destinationAirportId === 'string' ? airportForCity(player.cityId, message.destinationAirportId) : undefined;
        if (mode === 'airportSprint' && !destination) return;
        if (mode === 'airportSprint') {
          const challengerAirport = groundedAtAirport(player)?.id;
          const opponentAirport = groundedAtAirport(opponent)?.id;
          if (!challengerAirport || challengerAirport !== opponentAirport || destination?.id === challengerAirport) return;
        }
        const challenge: PvpChallenge = { id: randomUUID(), mode, challengerId: playerId, opponentId: message.opponentId, cityId: player.cityId, destinationAirportId: destination?.id, status: 'pending', expiresAt: Date.now() + 30_000 };
        pvpChallenges.set(challenge.id, challenge);
        sendToPlayer(message.opponentId, { type: 'pvpChallengeInvite', challenge });
        sendToPlayer(playerId, { type: 'pvpChallengeState', challenge });
        recordAnalytics(playerId, 'pvp_challenge_sent', { metadata: { mode } }); return;
      }
      if (message.type === 'pvpChallengeResponse') {
        if (!cityCapabilities(player.cityId)?.competitiveEnabled) return;
        const challenge = typeof message.challengeId === 'string' ? pvpChallenges.get(message.challengeId) : undefined;
        if (!challenge || challenge.opponentId !== playerId || challenge.status !== 'pending' || Date.now() > challenge.expiresAt) return;
        if (message.accept !== true) { pvpChallenges.delete(challenge.id); for (const id of [challenge.challengerId, challenge.opponentId]) sendToPlayer(id, { type: 'pvpChallengeCancelled', challengeId: challenge.id }); return; }
        challenge.status = 'countdown'; challenge.startsAt = Date.now() + 3_000; challenge.expiresAt = challenge.startsAt + (challenge.mode === 'dogfight' ? 300_000 : 480_000);
        setTimeout(() => { if (pvpChallenges.get(challenge.id) === challenge) { challenge.status = 'active'; for (const id of [challenge.challengerId, challenge.opponentId]) sendToPlayer(id, { type: 'pvpChallengeState', challenge }); } }, 3_000);
        for (const id of [challenge.challengerId, challenge.opponentId]) sendToPlayer(id, { type: 'pvpChallengeState', challenge });
        recordAnalytics(playerId, 'pvp_challenge_accepted', { metadata: { mode: challenge.mode } }); return;
      }

      if (message.type === 'collision') {
        if (typeof message.targetId === 'string') applyAircraftCollision(playerId, message.targetId, Date.now());
        return;
      }

      if (message.type === 'respawn') {
        failPlayerJourney(playerId, 'CRASHED');
        const boundaryProfile = profileStore.getOrCreate(player.pilotId, player.displayName);
        resetHumanToSafeRunway(playerId, player, boundaryProfile, Date.now());
        return;
      }

      if (message.type !== 'state' || !message.position || !message.rotation) return;

      const stateNow = Date.now();
      const values = [
        message.position.x,
        message.position.y,
        message.position.z,
        message.rotation.x,
        message.rotation.y,
        message.rotation.z,
      ];
      if (!values.every(Number.isFinite)) {
        logTransformReject(playerId, player, 'MALFORMED', Infinity, 0, stateNow);
        return;
      }

      // Preserve fast aircraft velocity for interpolation, pursuit and swept
      // hits instead of truncating every aircraft at the old 300m/s limit.
      const envelope = aircraftFlightEnvelope[player.aircraftType];
      const velocityCap = envelope.maxSpeed * envelope.boostMaxSpeed + 10; // existing challenge speed bonus
      const validation = validateClientTransform(
        player.lastAcceptedPosition, message.position, stateNow - player.lastAcceptedTransformAt,
        envelope, 0, transformWorldBounds[player.cityId],
      );
      const firstValidTransform = !player.hasRespawnTransform;
      const rotationValidation = validateClientRotation(
        player.rotation, message.rotation, stateNow - player.lastAcceptedTransformAt, envelope,
      );
      const traveled = Math.hypot(
        message.position.x - player.lastAcceptedPosition.x,
        message.position.y - player.lastAcceptedPosition.y,
        message.position.z - player.lastAcceptedPosition.z,
      );
      // A discontinuity is trusted only while the server has put this player
      // into its spawn lifecycle, at the server-selected runway or tutorial approach.
      if ((!validation.accepted && !(firstValidTransform && traveled <= 250)) || (firstValidTransform && traveled > 250)) {
        const reason = validation.accepted ? 'SPAWN_MISMATCH' : validation.reason;
        logTransformReject(playerId, player, reason, traveled, validation.accepted ? 250 : validation.allowedDistance, stateNow);
        return;
      }
      if (!firstValidTransform && !rotationValidation.accepted) {
        logTransformReject(playerId, player, rotationValidation.reason, rotationValidation.angularDistance, rotationValidation.allowedAngularDistance, stateNow);
        return;
      }
      const stateSeconds = validation.accepted ? validation.elapsedSeconds : Math.max(0.05, (stateNow - player.lastAcceptedTransformAt) / 1000);
      const nextVelocity = firstValidTransform || !validation.accepted ? { x: 0, y: 0, z: 0 } : validation.velocity;
      const velocityLength = Math.hypot(nextVelocity.x, nextVelocity.y, nextVelocity.z);
      player.velocity = velocityLength > velocityCap
        ? { x: nextVelocity.x / velocityLength * velocityCap, y: nextVelocity.y / velocityLength * velocityCap, z: nextVelocity.z / velocityLength * velocityCap }
        : nextVelocity;
      const previousAcceptedPosition = player.lastAcceptedPosition;
      const previousAcceptedRotation = player.rotation;
      player.lastStateAt = stateNow;
      player.position = message.position;
      player.lastAcceptedPosition = { ...message.position };
      player.lastAcceptedTransformAt = stateNow;
      player.rotation = message.rotation;
      player.boostActive = message.boostActive === true;
      // Transform packets never equip aircraft. Explicit equipAircraft above
      // is the only selection path accepted by the server profile.
      player.hasRespawnTransform = true;
      if (player.skyDuelMatchId && velocityLength >= 10 && player.lifeState === 'alive') {
        const session = skyDuelSessions.get(player.skyDuelMatchId);
        if (session && (session.phase === 'active' || session.phase === 'overtime')) {
          const elapsed = Math.min(2_000, Math.max(0, stateSeconds * 1_000));
          if (session.playerA === playerId) session.activeMsA += elapsed;
          else if (session.playerB === playerId) session.activeMsB += elapsed;
        }
      }
      if (isHumanPilot(player) && progressionEnabled(player) && !player.skyDuelMode && !player.tutorialMode &&
        stateNow - (player.lastDiscoveryCheckAt ?? 0) >= 500) {
        player.lastDiscoveryCheckAt = stateNow;
        const altitude = player.position.y - botTerrainHeight(player.cityId, player.position.x, player.position.z);
        for (const location of cityDiscoveries[player.cityId]) {
          if ((player.profile.discoveries[player.cityId] ?? []).includes(location.id)) continue;
          if (location.timePreset && location.timePreset !== player.timePreset ||
            altitude < location.minAltitude || altitude > location.maxAltitude ||
            Math.hypot(player.position.x - location.x, player.position.z - location.z) > location.radius) continue;
          const discovery = profileStore.recordVerifiedDiscovery(player.pilotId, player.cityId, location.id, stateNow);
          if (!discovery) continue;
          sendProfile(playerId, discovery.profile, undefined, undefined, 'Discovery');
          reportPilotXp(playerId, 'DISCOVERY', discovery.xp, stateNow);
          recordObjectiveActivity(playerId, 'discovery');
          recordAnalytics(playerId, 'city_discovery_found', { source: location.id }, stateNow);
          break;
        }
      }
      const flight = landingFlightState.get(playerId);
      const wasAirborne = Boolean(flight?.airborne);
      if (!flight) landingFlightState.set(playerId, { baselineY: player.position.y, airborne: false });
      else if (player.position.y >= flight.baselineY + 8) flight.airborne = true;
      const journeyAttemptId = playerJourneyAttempts.get(playerId);
      const currentJourney = journeyAttemptId ? journeyStore.get(player.pilotId, journeyAttemptId) : undefined;
      const speedGateMeasured = currentJourney?.missionId === journeyDallas13.id && !firstValidTransform
        ? speedGateTracker.record(playerId, journeyAttemptId!, player.position, stateNow) : null;
      if (journeyAttemptId && wasAirborne) {
        const active = journeyStore.get(player.pilotId, journeyAttemptId);
        if (active?.missionId === journeyDallas22.id && (active.status === 'APPROACH' || active.status === 'RACING') ||
          active?.missionId === journeyDallas24.id && active.legendaryPhase === 'LANDING' && active.status === 'RACING' ||
          active?.missionId === journeyDallas17.id && (active.status === 'APPROACH' || active.status === 'RACING')) {
          const aircraft = aircraftFlightEnvelope[player.aircraftType];
          for (const airport of cityAirports.dallas) {
            const runwayElevation = dallasAirportElevations.get(airport.id);
            if (runwayElevation === undefined) continue;
            const touchdown = observedChampionshipTouchdown(previousAcceptedPosition, player.position, player.velocity, previousAcceptedRotation,
              airport, runwayElevation + aircraftGroundOffset, { speed: aircraft.safeLandingSpeed, descent: aircraft.safeDescentRate, tilt: aircraft.landingTilt });
            if (touchdown) {
              championshipTouchdowns.set(playerId, { attemptId: journeyAttemptId, approachCycle: active.approachCycle, airportId: airport.id, telemetry: touchdown, at: stateNow });
              break;
            }
          }
        }
      }
      if (journeyAttemptId && (player.lifeState === 'alive' || (currentJourney?.missionId === journeyDallas01.id || currentJourney?.missionId === journeyDallas02.id || currentJourney?.missionId === journeyDallas03.id || currentJourney?.missionId === journeyDallas04.id || currentJourney?.missionId === journeyDallas05.id || currentJourney?.missionId === journeyDallas06.id) &&
        player.lifeState === 'respawning') && !firstValidTransform && flight?.airborne) {
        const active = journeyStore.get(player.pilotId, journeyAttemptId);
        const tookOffFromMissionAirport = active?.missionId === journeyDallas07.id || active?.missionId === journeyDallas08.id || active?.missionId === journeyDallas09.id || active?.missionId === journeyDallas10.id || active?.missionId === journeyDallas11.id || active?.missionId === journeyDallas12.id ? true
          : active?.missionId === journeyDallas01.id || active?.missionId === journeyDallas02.id || active?.missionId === journeyDallas03.id || active?.missionId === journeyDallas04.id || active?.missionId === journeyDallas05.id || active?.missionId === journeyDallas06.id || active?.missionId === journeyDallas11.id || active?.missionId === journeyDallas19.id || active?.missionId === journeyDallas22.id ? true
          : active?.missionId === journeyDallas08.id || active?.missionId === journeyDallas12.id || active?.missionId === journeyDallas13.id || active?.missionId === journeyDallas14.id || active?.missionId === journeyDallas15.id || active?.missionId === journeyDallas16.id || active?.missionId === journeyDallas18.id || active?.missionId === journeyDallas20.id || active?.missionId === journeyDallas21.id || active?.missionId === journeyDallas23.id || active?.missionId === journeyDallas24.id
            ? playerJourneyLoveTakeoff.has(playerId) : playerJourneyDfwTakeoff.has(playerId);
        if (!tookOffFromMissionAirport) { /* Wait for an authorized runway takeoff. */ }
        else if (active?.missionId === journeyDallas14.id && active.status === 'APPROACH') {
          ensureJourneyEscapeHunter(playerId, player, active, stateNow);
        } else if (active?.missionId === journeyDallas15.id && active.status === 'RACING' && active.targetId) {
          const ace = players.get(active.targetId);
          if (ace?.bot?.journeyAce && !ace.bot.journeyProvoked) {
            playerJourneyRunwayPrep.delete(playerId);
            ace.bot.nextFireAt = stateNow + 3_000;
            provokeJourneyHunter(playerId, player, active.targetId, stateNow);
          }
        } else if (active?.status === 'RACING' && active.deadlineAt && stateNow >= active.deadlineAt) {
          failPlayerJourney(playerId, 'TIME_UP', stateNow);
        } else if (active?.missionId === journeyDallas22.id && active.status === 'RACING' && active.gateIndex > 0 &&
          previousAcceptedPosition.z > journeyDallas22.approachRestartZ &&
          message.position.z <= journeyDallas22.approachRestartZ) {
          const reset = journeyStore.resetPerfectApproach(player.pilotId, journeyAttemptId, active.approachCycle, null, stateNow);
          if (reset) sendJourneyState(playerId, reset);
        } else if (active && journeyCountdownComplete.has(journeyAttemptId) && (active.missionId === journeyDallas01.id || active.missionId === journeyDallas02.id || active.missionId === journeyDallas03.id || active.missionId === journeyDallas04.id || active.missionId === journeyDallas05.id || active.missionId === journeyDallas06.id || active.missionId === journeyDallas13.id || active.missionId === journeyDallas16.id || active.missionId === journeyDallas20.id || active.missionId === journeyDallas22.id || active.missionId === journeyDallas24.id && active.legendaryPhase === 'GATES') &&
          (active.status === 'APPROACH' || active.status === 'RACING')) {
          if (active.missionId === journeyDallas16.id && !crossfireEncounterValid(active, playerId)) {
            failPlayerJourney(playerId, 'CROSSFIRE_INTERRUPTED', stateNow);
            return;
          }
          const mission = active.missionId === journeyDallas24.id ? journeyDallas24 : active.missionId === journeyDallas22.id ? journeyDallas22 : active.missionId === journeyDallas20.id ? journeyDallas20 : active.missionId === journeyDallas16.id ? journeyDallas16 : active.missionId === journeyDallas13.id ? journeyDallas13 : active.missionId === journeyDallas06.id ? journeyDallas06 : active.missionId === journeyDallas05.id ? journeyDallas05 : active.missionId === journeyDallas04.id ? journeyDallas04 : active.missionId === journeyDallas03.id ? journeyDallas03 : active.missionId === journeyDallas02.id ? journeyDallas02 : journeyDallas01;
          const gate = mission.gates[active.gateIndex];
          const crossing = gate ? journeyGateCrossing(previousAcceptedPosition, message.position, active.gateIndex,
            dallasTerrain.elevationAt(gate.x, gate.z), mission) : false;
          if (crossing === 'TOO_HIGH') {
            sendToPlayer(playerId, { type: 'journeyGateTooHigh', gateIndex: active.gateIndex });
          } else if (crossing === false && gate &&
            (active.missionId === journeyDallas01.id || active.missionId === journeyDallas02.id || active.missionId === journeyDallas03.id ||
              active.missionId === journeyDallas04.id || active.missionId === journeyDallas05.id || active.missionId === journeyDallas06.id) &&
            crossesJourneyGateWrongWay(previousAcceptedPosition, message.position, active.gateIndex,
              dallasTerrain.elevationAt(gate.x, gate.z), mission)) {
            const warned = wrongWayGateWarningAt.get(playerId);
            if (!warned || warned.attemptId !== journeyAttemptId || warned.gateIndex !== active.gateIndex || stateNow - warned.at >= 2_500) {
              wrongWayGateWarningAt.set(playerId, { attemptId: journeyAttemptId, gateIndex: active.gateIndex, at: stateNow });
              sendToPlayer(playerId, { type: 'journeyGateWrongWay', attemptId: journeyAttemptId, gateIndex: active.gateIndex });
            }
          } else if (crossing === 'VALID') {
            const verifiedSpeed = active.missionId === journeyDallas13.id ? speedGateMeasured : undefined;
            const requiredSpeed = active.missionId === journeyDallas13.id ? journeyDallas13.speedThresholds[active.aircraftType as keyof typeof journeyDallas13.speedThresholds] : undefined;
            if (active.missionId === journeyDallas13.id && active.gateIndex > 0 &&
              (!Number.isFinite(requiredSpeed) || verifiedSpeed === null || verifiedSpeed === undefined || verifiedSpeed < requiredSpeed!)) {
              if (stateNow - (speedGateWarningAt.get(playerId) ?? 0) > 1_500) {
                speedGateWarningAt.set(playerId, stateNow);
                sendToPlayer(playerId, { type: 'journeyGateTooSlow', attemptId: journeyAttemptId, gateIndex: active.gateIndex });
              }
            } else {
              const advanced = active.missionId === journeyDallas24.id
                ? journeyStore.acceptLegendaryGate(player.pilotId, journeyAttemptId, active.gateIndex, stateNow)
                : active.missionId === journeyDallas22.id
                ? journeyStore.acceptPerfectApproachGate(player.pilotId, journeyAttemptId, active.gateIndex, stateNow)
                : journeyStore.acceptGate(player.pilotId, journeyAttemptId, active.gateIndex, stateNow, verifiedSpeed ?? undefined);
              if (advanced) {
                sendJourneyState(playerId, advanced);
                if (advanced.missionId === journeyDallas16.id) {
                  if (advanced.status === 'COMPLETED') removeJourneyHunter(advanced);
                  else if (advanced.gateIndex === 1 || advanced.gateIndex === 3) ensureJourneyCrossfire(playerId, player, advanced, stateNow);
                }
                if (advanced.missionId === journeyDallas24.id && advanced.legendaryPhase === 'ACE')
                  ensureJourneyLegendary(playerId, player, advanced, stateNow);
                if (advanced.status === 'COMPLETED') {
                  wrongWayGateWarningAt.delete(playerId);
                  sendProfile(playerId, profileStore.getOrCreate(player.pilotId, player.displayName), undefined, undefined, mission.name);
                }
              }
            }
          }
        }
      }
      if (isHumanPilot(player) && flight?.airborne && !wasAirborne) {
        if (player.accountId && progressionEnabled(player)) airborneMilestones.begin(playerId);
        const departure = cityAirports[player.cityId].find((airport) => {
          const dx = player.position.x - airport.x; const dz = player.position.z - airport.z;
          const along = dx * Math.sin(airport.heading) + dz * Math.cos(airport.heading);
          const lateral = dx * Math.cos(airport.heading) - dz * Math.sin(airport.heading);
          return Math.abs(along) <= airport.runwayLength / 2 + 350 && Math.abs(lateral) <= Math.max(airport.runwayWidth * 3, 160);
        });
        if (journeyAttemptId && departure?.id === 'dfw') {
          playerJourneyDfwTakeoff.add(playerId);
          playerJourneyRunwayPrep.delete(playerId);
        }
        if (journeyAttemptId && departure?.id === journeyDallas24.finishAirportId &&
          journeyStore.get(player.pilotId, journeyAttemptId)?.legendaryPhase === 'LANDING')
          landingReceipts.delete(`${playerId}:${journeyDallas24.finishAirportId}`);
        if (journeyAttemptId && (departure?.id === journeyDallas08.startAirportId || departure?.id === journeyDallas13.startAirportId || departure?.id === journeyDallas14.startAirportId || departure?.id === journeyDallas15.startAirportId || departure?.id === journeyDallas16.startAirportId || departure?.id === journeyDallas18.startAirportId || departure?.id === journeyDallas20.startAirportId || departure?.id === journeyDallas21.startAirportId || departure?.id === journeyDallas24.startAirportId)) {
          const active = journeyStore.get(player.pilotId, journeyAttemptId);
          if (active?.missionId === journeyDallas08.id || active?.missionId === journeyDallas13.id || active?.missionId === journeyDallas14.id || active?.missionId === journeyDallas15.id || active?.missionId === journeyDallas16.id || active?.missionId === journeyDallas18.id || active?.missionId === journeyDallas20.id || active?.missionId === journeyDallas21.id || active?.missionId === journeyDallas23.id || active?.missionId === journeyDallas24.id) {
            playerJourneyLoveTakeoff.add(playerId);
            playerJourneyRunwayPrep.delete(playerId);
          }
        }
        if (journeyAttemptId && departure?.id === journeyDallas07.startAirportId &&
          (journeyStore.get(player.pilotId, journeyAttemptId)?.missionId === journeyDallas07.id ||
            journeyStore.get(player.pilotId, journeyAttemptId)?.missionId === journeyDallas08.id ||
            journeyStore.get(player.pilotId, journeyAttemptId)?.missionId === journeyDallas09.id || journeyStore.get(player.pilotId, journeyAttemptId)?.missionId === journeyDallas10.id)) {
          playerJourneyAddisonTakeoff.add(playerId);
          playerJourneyRunwayPrep.delete(playerId);
        }
        if (journeyAttemptId) {
          const active = journeyStore.get(player.pilotId, journeyAttemptId);
          if ((active?.missionId === journeyDallas08.id || active?.missionId === journeyDallas09.id || active?.missionId === journeyDallas10.id || active?.missionId === journeyDallas12.id) && active.status === 'RACING') {
            const fire = rearGuardFire.get(journeyAttemptId);
            if (fire) rearGuardTakeoff(fire, stateNow);
            for (const id of [active.targetId, active.secondaryTargetId]) {
              const escort = id ? players.get(id) : undefined;
              if (escort?.bot?.journeyRearGuardEscort) escort.bot.journeyProvoked = true;
            }
          }
        }
        missionSignal(playerId, { type: 'takeoff', at: stateNow, airportId: departure?.id });
        recordAnalytics(playerId, 'takeoff', { source: departure?.id ?? 'unknown' }, stateNow);
        sendToPlayer(playerId, { type: 'takeoffConfirmed', airportId: departure?.id, confirmedAt: stateNow });
        if(player.tutorialMode){profileStore.recordTrainingEvidence(player.pilotId,1);completeServerTutorialStep(playerId,player,'takeoff',stateNow);sendToPlayer(playerId,{type:'tutorialSignal',signal:'airborne'});}
      }
      if (isHumanPilot(player) && flight?.airborne && player.lifeState === 'alive') {
        const aboveTerrain = player.position.y >= botTerrainHeight(player.cityId, player.position.x, player.position.z) + 8;
        if (wasAirborne && aboveTerrain && velocityLength >= 10) {
          const metrics = flightAnalytics.get(playerId);
          if (metrics) metrics.airborneMs += Math.min(2_000, Math.max(0, stateSeconds * 1_000));
        }
        if (wasAirborne && airborneMilestones.has(playerId) && player.accountId && progressionEnabled(player)) {
          if (aboveTerrain && velocityLength >= 10 && airborneMilestones.advance(playerId, stateSeconds * 1_000)) {
            const context = analyticsContexts.get(playerId);
            if (context) analyticsStore.recordActivation({ ...context, cityId: player.cityId, aircraftType: player.aircraftType }, stateNow);
            if (profileStore.hasPendingReferral(player.pilotId)) qualifyReferralFromFlight(playerId, stateNow);
            airborneMilestones.reset(playerId);
          }
        }
        const acceptedTravel = Math.min(traveled, velocityCap * stateSeconds * 1.15);
        const metrics = flightAnalytics.get(playerId);
        if (metrics) metrics.distanceMeters += acceptedTravel;
        player.missionDistanceMeters = (player.missionDistanceMeters ?? 0) + acceptedTravel;
        if (progressionEnabled(player)) {
          const candidate = flightRecordCandidates.get(playerId) ?? { topSpeed: 0, highestAltitude: 0, distance: 0 };
          candidate.topSpeed = Math.max(candidate.topSpeed, Math.hypot(player.velocity.x, player.velocity.y, player.velocity.z));
          candidate.highestAltitude = Math.max(candidate.highestAltitude, player.position.y - botTerrainHeight(player.cityId, player.position.x, player.position.z));
          candidate.distance += acceptedTravel;
          flightRecordCandidates.set(playerId, candidate);
          player.distanceRewardMeters = (player.distanceRewardMeters ?? 0) + acceptedTravel;
          player.distanceXpMeters = (player.distanceXpMeters ?? 0) + acceptedTravel;
          if (stateNow - (player.lastDistancePersistAt ?? 0) >= 1_000 && player.distanceXpMeters > 0) {
            const acceptedMeters = player.distanceXpMeters;
            player.distanceXpMeters = 0;
            player.lastDistancePersistAt = stateNow;
            const distanceAwards = profileStore.recordAcceptedFlightDistance(player.pilotId, acceptedMeters, stateNow);
            if (distanceAwards.some(result => result.awarded)) sendProfile(playerId, undefined, undefined, undefined, 'Flight Distance');
            for (const result of distanceAwards)
              reportPilotXp(playerId, 'DISTANCE', result, stateNow);
            recordObjectiveActivity(playerId, 'distance', acceptedMeters);
          }
          const batches = Math.floor(player.distanceRewardMeters / economyRewards.distanceBatchMeters);
          if (batches > 0) {
            player.distanceRewardMeters -= batches * economyRewards.distanceBatchMeters;
            const rewarded = profileStore.awardServerReward(player.pilotId, batches * economyRewards.distanceBatchCredits);
            if (rewarded) sendProfile(playerId, rewarded, undefined, undefined, 'Flight Distance');
            if (rewarded) recordAnalytics(playerId, 'credits_earned', { amount: batches * economyRewards.distanceBatchCredits, source: 'flight_distance' }, stateNow);
          }
        } else {
          player.distanceXpMeters = (player.distanceXpMeters ?? 0) + acceptedTravel;
          if (stateNow - (player.lastDistancePersistAt ?? 0) >= 1_000 && player.distanceXpMeters > 0) {
            profileStore.recordAcceptedPracticeDistance(player.pilotId, player.distanceXpMeters);
            player.distanceXpMeters = 0;
            player.lastDistancePersistAt = stateNow;
          }
        }
      }
      if (isHumanPilot(player) && stateNow - (player.missionLastFlightAt ?? 0) >= 1_000) {
        player.missionLastFlightAt = stateNow;
        missionSignal(playerId, {
          type: 'flight', at: stateNow, alive: player.lifeState === 'alive', airborne: Boolean(flight?.airborne),
          meters: player.missionDistanceMeters ?? 0, heading: player.rotation.y,
          x: player.position.x, z: player.position.z,
          altitudeMeters: Math.max(0, player.position.y - botTerrainHeight(player.cityId, player.position.x, player.position.z)),
        });
        player.missionDistanceMeters = 0;
      }
      refreshCityLocks(player.cityId, stateNow);

      const update = {
        type: 'state',
        playerId,
        position: player.position,
        altitudeMeters: Math.max(0, player.position.y - botTerrainHeight(player.cityId, player.position.x, player.position.z)),
        rotation: player.rotation,
        aircraftType: player.aircraftType,
        equippedCosmetics: player.profile?.cosmetics?.equipped ?? {},
        cityId: player.cityId,
        displayName: player.displayName,
        lifeState: player.lifeState,
        boostActive: player.boostActive,
        health: player.health,
        maxHealth: player.skyDuelMode ? skyDuelHealth : maxHealthForAircraft(player.aircraftType),
      };
      // A join is announced from the server's accepted first transform, not
      // from a best-effort client-side timing assumption. This gives already
      // connected peers a complete fallback-renderable player immediately.
      if (player.skyDuelMode) {
        const peerId = skyDuelPeer(playerId);
        if (peerId) sendToPlayer(peerId, firstValidTransform ? { ...update, type: 'playerState' } : update);
      } else if (firstValidTransform) {
        broadcastToCity(player.cityId, { ...update, type: 'playerState', health: player.health });
        broadcastLeaderboard(player.cityId);
      } else {
        broadcastToCity(player.cityId, update, socket);
      }
    } catch {
      // Ignore malformed client messages.
    }
  });

  socket.on('close', () => removeHumanConnection(socket));
});

server.on('error', (error) => {
  console.error('[server] WebSocket error:', error);
});

httpServer.on('error', (error) => {
  console.error('[server] HTTP error:', error);
});
