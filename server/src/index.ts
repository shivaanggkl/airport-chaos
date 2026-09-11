import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket, { WebSocketServer } from 'ws';
import { PlayerProfileStore, type LegacyProfileImport, type ObjectiveActivity, type PlayerProfile, type ProfileProgress, type WeeklyLeaderboardCategory } from './player-profiles.js';
import { aircraftMuzzleSockets } from '../../shared/aircraft-muzzles.mjs';
import { territoriesForCity, type CityTerritory } from '../../shared/city-territories.mjs';
import { challengeForCity } from '../../shared/city-challenges.mjs';
import { airportForCity, cityAirports } from '../../shared/city-airports.mjs';
import { maxHealthForAircraft } from '../../shared/aircraft-health.mjs';
import { aircraftFlightEnvelope } from '../../shared/aircraft-flight-envelope.mjs';
import { repairsForCity } from '../../shared/city-repairs.mjs';
import { challengeCreditReward, economyRewards } from '../../shared/reward-economy.mjs';
import { AIM_ENVELOPE, AIM_SWITCH_MARGIN, aimTargetScore, aimGoal, biasAimVertically, stepAim, interpolateAim, insideDynamicLock, ballisticShotSpeed, PROTOCOL_VERSION } from '../../shared/protocol.mjs';

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
  profile: PlayerProfile;
  entityType: 'player';
  isBot: boolean;
  boostActive: boolean;
  cityId: CityId;
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
  chaosQaEnabled: boolean;
  selectionRevision?: number;
  spawnSlot?: number;
  lastEquipRequestId?: number;
  territoryIds: Set<string>;
  distanceRewardMeters?: number;
  bot?: BotRuntime;
};

type BotPersonality = 'explorer' | 'racer' | 'hunter' | 'casual';
type BotPhase = 'spawn' | 'taxi' | 'takeoff' | 'cruise' | 'activity' | 'land' | 'approach' | 'attackPass' | 'extend' | 'reposition' | 'respawn';
type BotRuntime = {
  personality: BotPersonality;
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
};

type Vector3 = { x: number; y: number; z: number };
type ProjectileMode = 'ballistic';
type DynamicEventType = 'skyRush' | 'supplyDrop' | 'emergencyEscort' | 'cargoConvoy' | 'riskZone' | 'mostWanted' | 'aceIntercept' | 'vipEscort' | 'goldenSkyRun' | 'cityEmergency';
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
  riskRadius: number;
  goldenDrop: boolean;
  qaShortTimer: boolean;
  lastBroadcastAt: number;
};

type ChaosQaEvent = 'mostWanted' | 'supplyDrop' | 'goldenDrop' | 'skyRush' | 'stormRisk' | 'lowAltitudeRisk' | 'highAltitudeRisk' | 'downtownRisk' | 'aceIntercept' | 'vipEscort' | 'goldenSkyRun' | 'cityEmergency';

type ProjectileState = {
  projectileId: string;
  ownerId: string;
  cityId: CityId;
  position: Vector3;
  direction: Vector3;
  traveled: number;
  speed: number;
  mode: ProjectileMode;
  clientShotId?: string;
};
type ActiveChallenge = { challengeId: string; cityId: CityId; startedAt: number; lastGateAt: number; gateIndex: number; rewarded: boolean };

const players = new Map<string, PlayerState>();
const repairCooldowns = new Map<string, number>();
const airportRepairStays = new Map<string, { airportId: string; since: number }>();
const repairCheckMs = 500;
const repairBeaconCooldownMs = 90_000;
const repairBeaconFraction = 0.45;
const airportRepairDelayMs = 4_000;
const repairAirportGroundSpeed = 8;
const repairAirportGroundAltitude = 45;
// Use the same elevation samples and bilinear sampling as Dallas rawHeight().
// Retain only four heights; do not retain/render a second terrain grid.
const dallasAirportElevations = (() => {
  const data = JSON.parse(readFileSync(new URL('../../client/src/data/dallas-elevation.json', import.meta.url), 'utf8')) as {
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
    width: number; height: number; baseElevation: number; scale: number; elevations: string;
  };
  const bytes = Buffer.from(data.elevations, 'base64');
  const samples = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  const sample = (x: number, z: number) => data.baseElevation + samples[z * data.width + x] * data.scale;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return new Map(cityAirports.dallas.map(airport => {
    const x = Math.max(0, Math.min(1, (airport.x - data.bounds.minX) / (data.bounds.maxX - data.bounds.minX))) * (data.width - 1);
    const z = Math.max(0, Math.min(1, (airport.z - data.bounds.minZ) / (data.bounds.maxZ - data.bounds.minZ))) * (data.height - 1);
    const x0 = Math.floor(x), z0 = Math.floor(z), x1 = Math.min(data.width - 1, x0 + 1), z1 = Math.min(data.height - 1, z0 + 1);
    return [airport.id, lerp(lerp(sample(x0, z0), sample(x1, z0), x - x0), lerp(sample(x0, z1), sample(x1, z1), x - x0), z - z0)];
  }));
})();
const activeChallenges = new Map<string, ActiveChallenge>();
const landingReceipts = new Map<string, number>();
const landingFlightState = new Map<string, { baselineY: number; airborne: boolean }>();
const projectiles = new Map<string, ProjectileState>();
const playerSockets = new Map<WebSocket, string>();
const usedSpawnSlots = new Map<CityId, Set<number>>();
const cityIds = new Set<CityId>(['milwaukee', 'dallas']);
const botNames = ['Raven', 'Comet', 'Viper', 'Nova', 'Falcon', 'Echo', 'Atlas', 'Mako', 'Orbit', 'Sable', 'Juno', 'Cinder'];
const botPersonalities: readonly BotPersonality[] = ['explorer', 'racer', 'hunter', 'casual'];
const botTickMs = 200;
const botPopulationTickMs = 1_000;
const maxBotsPerCity = 7;
const botKillRewardMultiplier = 0.35;
const hunterDetectionRange = 4_500;
const hunterPursuitRange = 6_500;
const hunterFireRange = 950;
const hunterFireCone = 0.20;
const hunterReactionDelayMs = 480;
const hunterShotIntervalMinMs = 560;
const hunterShotIntervalJitterMs = 360;
let nextBotSerial = 1;
const aircraftTypes = new Set<AircraftType>(['trainer', 'privateJet', 'cargo', 'fighter']);
const aircraftHitRadii: Record<AircraftType, number> = {
  trainer: 2.4,
  privateJet: 2.6,
  cargo: 3.6,
  fighter: 2.4,
};
// This only widens projectile-vs-aircraft hit tests.  It intentionally does
// not affect aircraft collision, which remains calibrated separately.
const projectileHitRadiusMultiplier = 1.6;
const projectileVisualRadius = 0.65;
const lockRange = 1000;
const combatTransformFreshMs = 1_500;
const aircraftCollisionRadius = 2.5;
const respawnClearance = 24;
// Straight, unlocked rounds remain fast enough to be readable at flight speed.
const projectileRange = 1000;
const projectileDamage = 25;
const fireCooldownMs = 250;
const spawnProtectionMs = 3000;
const maxProjectiles = 256;
const projectileStateBroadcastMs = 50;
const eventTickMs = 250;
const eventBroadcastMs = 500;
const eventAvailableMinMs = 15_000;
const eventAvailableMaxMs = 42_000;
const eventActiveMs = 90_000;
const eventTerminalMs = 5_000;
const eventCooldownMinMs = 24_000;
const eventCooldownMaxMs = 48_000;
const wantedTransformFreshMs = 1_500;
const cityEvents = new Map<CityId, CityEvent>();
const lastEventTypes = new Map<CityId, DynamicEventType>();
const profileStore = new PlayerProfileStore(process.env.AIRPORT_CHAOS_PROFILE_DB ?? resolve(fileURLToPath(new URL('../data/player-profiles.sqlite', import.meta.url))));
const testerCodeHash = /^[a-f0-9]{64}$/i.test(process.env.REDSPEAR_TESTER_CODE_HASH ?? '')
  ? Buffer.from(process.env.REDSPEAR_TESTER_CODE_HASH!, 'hex')
  : undefined;
const testerCodeEnabled = Boolean(testerCodeHash);
const testerAttempts = new Map<string, number[]>();
function redeemTesterCode(pilotId: string, value: unknown): { ok: boolean; reason: string; profile?: PlayerProfile } {
  if (!testerCodeEnabled || !testerCodeHash) return { ok: false, reason: 'Access code redemption unavailable.' };
  const now = Date.now();
  const recent = (testerAttempts.get(pilotId) ?? []).filter((at) => now - at < 10 * 60_000);
  if (recent.length >= 5) return { ok: false, reason: 'Too many attempts. Try again later.' };
  recent.push(now); testerAttempts.set(pilotId, recent);
  const supplied = typeof value === 'string' ? value.trim() : '';
  const digest = createHash('sha256').update(supplied).digest();
  if (digest.length !== testerCodeHash.length || !timingSafeEqual(digest, testerCodeHash)) return { ok: false, reason: 'Invalid access code' };
  const profile = profileStore.grantAircraftEntitlements(pilotId, ['fighter']);
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
};
const territoryTickMs = 400;
const territoryCaptureSeconds = 24;
const territoryCaptureRewardCooldownMs = 120_000;
const territoryControlRewardMs = 45_000;
const territoryRewardCooldown = new Map<string, number>();
const cityTerritoryState = new Map<CityId, Map<string, TerritoryRuntime>>();

// `ws` will otherwise retain every outgoing frame for a client that has
// stopped consuming data (a backgrounded/crashed tab can remain OPEN for a
// long time).  State traffic is continuous, so that queue must be bounded.
const maxBufferedSocketBytes = 512 * 1024;
const stabilityDiagnosticsEnabled = process.env.AIRPORT_CHAOS_DEV_QA === '1';
const wsPayloadWindow = {
  largestBytes: 0,
  largestType: 'none',
  sentBytes: 0,
  sentMessages: 0,
  droppedBackpressureFrames: 0,
};
const fireBlockedDebugAt = new Map<string, number>();

const port = Number(process.env.PORT ?? 8091);
const clientDist = resolve(fileURLToPath(new URL('../../client/dist/', import.meta.url)));
const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
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

const httpServer = createServer(async (request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('ok');
    return;
  }

  const requestUrl = new URL(request.url ?? '/', 'http://localhost');
  if (requestUrl.pathname === '/api/profile') {
    const identity = identityFromRequest(request);
    if (request.method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(profileStore.getOrCreate(identity.pilotId, identity.pilotName)));
      return;
    }
    if (request.method === 'POST') {
      const payload = await readJson(request);
      let profile: PlayerProfile | undefined;
      let error: string | undefined;
      if (payload?.legacy) profile = profileStore.importLegacy(identity.pilotId, payload.legacy as LegacyProfileImport);
      else if (payload?.equipAircraft !== undefined) profile = profileStore.equipAircraft(identity.pilotId, payload.equipAircraft);
      else if (payload?.purchaseAircraft !== undefined) {
        const result = profileStore.purchaseAircraft(identity.pilotId, payload.purchaseAircraft);
        profile = result.profile; error = result.ok ? undefined : result.reason;
      } else if (payload?.testerCode !== undefined) {
        const result = redeemTesterCode(identity.pilotId, payload.testerCode);
        profile = result.profile; error = result.ok ? undefined : result.reason;
      } else if (payload) profile = profileStore.updateProgress(identity.pilotId, payload.progress ?? {});
      response.writeHead(profile && !error ? 200 : error?.startsWith('Too many') ? 429 : 400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(profile && !error ? profile : { error: error ?? 'Invalid profile update' }));
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
const server = new WebSocketServer({ server: httpServer, allowSynchronousEvents: false });

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`[server] healthy and listening on http://0.0.0.0:${port}`);
});

function broadcastToCity(cityId: CityId, message: object, except?: WebSocket): void {
  const encoded = encodeSocketMessage(message);
  for (const client of server.clients) {
    const playerId = playerSockets.get(client);
    const player = playerId ? players.get(playerId) : undefined;
    if (client !== except && player?.cityId === cityId) sendEncodedSocketMessage(client, encoded);
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
    return;
  }
  player.lockedTargetId = targetId;
  sendLockState(playerId, targetId);
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
    if (player.cityId !== cityId || !player.lockedTargetId) continue;
    if (!currentLockedTarget(playerId, player, player.lockedTargetId, now)) setServerLock(playerId, player);
  }
}

function broadcastLeaderboard(cityId: CityId): void {
  const now = Date.now();
  const message = {
    type: 'leaderboard',
    cityId,
    players: [...players.entries()]
      .filter(([, player]) => player.cityId === cityId && !player.isBot)
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
  if (!player) return;
  const reward = rewardWithHeat(playerId, score, credits);
  player.score += reward.score;
  const profile = profileStore.awardServerReward(player.pilotId, reward.credits, { challengeCompletions: reason.includes('CHALLENGE WON') ? 1 : 0 });
  if (profile) sendProfile(playerId, profile);
  sendToPlayer(playerId, { type: 'socialReward', score: reward.score, credits: reward.credits, reason });
  broadcastLeaderboard(player.cityId);
  updateKing(player.cityId);
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
};

// Geographic event anchors are city-owned.  Milwaukee deliberately has no
// Chaos Director template yet, so a Dallas route or drop can never leak into
// a different world coordinate system.
const dallasEventTemplates: ReadonlyArray<CityEventTemplate> = [
  {
    type: 'skyRush', name: 'SKY RUSH · DFW CORRIDOR', rewardScore: 400, rewardCredits: 260,
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
    type: 'emergencyEscort', name: 'EMERGENCY ESCORT · DFW TO LOVE', rewardScore: 360, rewardCredits: 260,
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
    type: 'riskZone', name: 'RISK ZONE · LAS COLINAS', rewardScore: 340, rewardCredits: 240,
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
    type: 'vipEscort', name: 'VIP ESCORT · LAS COLINAS TO DOWNTOWN', rewardScore: 620, rewardCredits: 390,
    objective: { x: -13_500, y: 620, z: -9_350 },
    route: [
      { x: -13_500, y: 620, z: -9_350 }, { x: -8_600, y: 720, z: -5_300 },
      { x: -4_100, y: 610, z: -1_900 }, { x: -650, y: 420, z: -450 },
    ],
    routeSpeed: 220, eventRouteIds: ['vip-escort'], eventAircraftType: 'privateJet', rarity: 'rare', weight: 5,
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
      rankings: [...event.progress.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([playerId, progress]) => ({ playerId, progress })),
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

function isHumanPilot(player: PlayerState | undefined): player is PlayerState & { isBot: false } {
  return Boolean(player && !player.isBot);
}

function sendProfile(playerId: string, profile?: PlayerProfile, rewardId?: string, equipRequestId?: number): void {
  const player = players.get(playerId);
  if (!isHumanPilot(player)) return;
  const current = profile ?? player.profile;
  player.profile = current;
  player.displayName = current.pilotName;
  player.aircraftType = current.selectedAircraft;
  sendToPlayer(playerId, { type: 'profile', profile: current, rewardId, selectionRevision: player.selectionRevision ?? 0, equipRequestId });
}

// Every gameplay system reports weekly values through this one server-side
// path; lifecycle handlers never need storage details.
function recordWeeklyActivity(playerId: string, category: WeeklyLeaderboardCategory, amount: number, highest = false): void {
  const player = players.get(playerId);
  if (!isHumanPilot(player) || amount <= 0) return;
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
  if (!isHumanPilot(player)) return;
  const result = profileStore.recordObjectiveActivity(player.pilotId, player.cityId, activity, amount, airportId);
  if (!result) return;
  sendProfile(playerId, result.profile);
  if (activity !== 'distance' || amount >= 250) awardMastery(playerId, activity, activity === 'distance' ? Math.min(30, amount * (masteryValues.distance ?? 0)) : undefined);
  if (activity !== 'distance') {
    const cycle = result.profile.objectives[player.cityId];
    const item = [...(cycle?.daily ?? []), ...(cycle?.weekly ?? [])].find((candidate) => candidate.activity === activity && !candidate.completed);
    if (item) sendToPlayer(playerId, { type: 'objectiveProgress', label: item.label, progress: item.progress, target: item.target });
  }
  for (const item of result.completed) sendToPlayer(playerId, { type: 'objectiveComplete', objectiveId: item.id, label: item.label, credits: item.reward });
  if (result.bonusCredits) sendToPlayer(playerId, { type: 'objectiveComplete', objectiveId: 'cycle-bonus', label: 'Objective set complete', credits: result.bonusCredits });
  if (result.completed.length) awardMastery(playerId, 'event', 20 * result.completed.length);
}

function awardMastery(playerId: string, source: ObjectiveActivity, amount?: number): void {
  const player = players.get(playerId);
  const base = amount ?? masteryValues[source];
  if (!isHumanPilot(player) || !base || base <= 0) return;
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
  if (typeof challengeId !== 'string' || player.lifeState !== 'alive' || activeChallenges.has(playerId)) return;
  const challenge = challengeForCity(player.cityId, challengeId);
  if (!challenge) return;
  const now = Date.now();
  activeChallenges.set(playerId, { challengeId, cityId: player.cityId, startedAt: now, lastGateAt: now, gateIndex: 0, rewarded: false });
}

function passSkyChallengeGate(playerId: string, player: PlayerState, challengeId: unknown, gateIndex: unknown): void {
  const active = activeChallenges.get(playerId);
  const challenge = active ? challengeForCity(player.cityId, active.challengeId) : undefined;
  const now = Date.now();
  if (!active || !challenge || active.cityId !== player.cityId || active.challengeId !== challengeId || gateIndex !== active.gateIndex || player.lifeState !== 'alive' || active.rewarded || now - active.startedAt > challenge.timeLimit * 1000 || now - active.lastGateAt < 350) {
    if (active && now - active.startedAt > (challenge?.timeLimit ?? 0) * 1000) activeChallenges.delete(playerId);
    return;
  }
  active.lastGateAt = now;
  active.gateIndex += 1;
  if (active.gateIndex < challenge.gateCount) return;
  active.rewarded = true;
  activeChallenges.delete(playerId);
  player.score += challenge.reward;
  const challengeCredits = challengeCreditReward(challenge.reward);
  const profile = profileStore.awardServerReward(player.pilotId, challengeCredits, { challengeCompletions: 1 });
  if (profile) sendProfile(playerId, profile);
  recordObjectiveActivity(playerId, 'challenge');
  awardMastery(playerId, 'challenge');
  sendToPlayer(playerId, { type: 'challengeComplete', challengeId: challenge.id, score: challenge.reward, credits: challengeCredits });
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

function precisionLandingScore(telemetry: LandingTelemetry, envelope: { speed: number; descent: number; tilt: number }): number {
  const within = (value: number, maximum: number) => Math.max(0, 1 - value / maximum);
  const smoothness = within(Math.abs(telemetry.descentRate), envelope.descent * 1.5) * 0.36;
  const alignment = within(telemetry.headingError, 0.46) * 0.28;
  const wingsLevel = within(telemetry.bankAngle, envelope.tilt) * 0.22;
  const attitude = within(Math.abs(telemetry.pitch), envelope.tilt) * 0.08;
  const speedControl = within(Math.abs(telemetry.speed - envelope.speed * 0.72), envelope.speed * 0.75) * 0.06;
  return Math.max(1, Math.min(1000, Math.round((smoothness + alignment + wingsLevel + attitude + speedControl) * 1000)));
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
  // Match the maximum assisted touchdown envelope accepted by flight/HUD.
  if (!flight?.airborne || telemetry.speed > envelope.speed * 1.32 || Math.abs(telemetry.descentRate) > envelope.descent * 1.7 || telemetry.bankAngle > envelope.tilt + 0.22 || Math.abs(telemetry.pitch) > envelope.tilt + 0.18 || telemetry.headingError > 0.82) return;
  // Taxi/parked contacts cannot satisfy the runway, speed, fresh-transform,
  // and telemetry-consistency requirements together.
  landingReceipts.set(receiptKey, now);
  landingFlightState.set(playerId, { baselineY: player.position.y, airborne: false });
  const landingProfile = profileStore.awardServerReward(player.pilotId, economyRewards.landing);
  if (landingProfile) sendProfile(playerId, landingProfile);
  recordObjectiveActivity(playerId, 'landing', 1, airport.id);
  recordWeeklyActivity(playerId, 'precisionLanding', precisionLandingScore(telemetry, envelope), true);
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
  return true;
}

function recordMostWantedSurvival(playerId: string, event: CityEvent, now: number): void {
  const durationSeconds = Math.max(0, Math.round((now - (event.wantedStartedAt ?? event.activeAt)) / 1000));
  recordWeeklyActivity(playerId, 'wantedSurvival', durationSeconds, true);
}

function reconcileMostWanted(cityId: CityId, now: number): void {
  const event = cityEvents.get(cityId);
  if (!event || event.lifecycle !== 'active' || event.type !== 'mostWanted') return;
  const previousTargetId = event.wantedPlayerId;
  if (refreshMostWantedTarget(event, now) && event.wantedPlayerId !== previousTargetId) broadcastEvent(event);
}

function awardEventPlayer(event: CityEvent, playerId: string, score: number, credits: number, reason: string): void {
  if (event.rewardsGiven.has(playerId)) return;
  const player = players.get(playerId);
  if (!player || player.cityId !== event.cityId) return;
  event.rewardsGiven.add(playerId);
  addHeat(playerId, reason.includes('RISK ZONE')
    ? heatGains.riskBank
    : reason.includes('WON') || reason.includes('BOUNTY') || reason.includes('SURVIVED')
      ? heatGains.eventWin
      : 5);
  const reward = rewardWithHeat(playerId, score, credits);
  player.score += reward.score;
  if (isHumanPilot(player)) {
    const profile = profileStore.awardServerReward(player.pilotId, reward.credits, { eventCompletions: 1 });
    if (profile) sendProfile(playerId, profile);
    recordObjectiveActivity(playerId, 'event');
  }
  sendToPlayer(playerId, { type: 'eventReward', eventId: event.id, score: reward.score, credits: reward.credits, reason });
  broadcastLeaderboard(event.cityId);
}

function randomBetween(minimum: number, maximum: number): number {
  return minimum + Math.floor(Math.random() * (maximum - minimum + 1));
}

function registerChaosAction(playerId: string, action: keyof typeof chaosActionValues, now = Date.now()): void {
  const player = players.get(playerId);
  if (!player || player.lifeState !== 'alive') return;
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

function territorySnapshot(cityId: CityId): Array<{ id: string; controllerId?: string; controllerName?: string; capturingPlayerId?: string; captureProgress: number; contested: boolean }> {
  return territoryStates(cityId).map((territory) => ({
    id: territory.definition.id,
    controllerId: territory.controllerId,
    controllerName: territory.controllerId ? players.get(territory.controllerId)?.displayName : undefined,
    capturingPlayerId: territory.capturingPlayerId,
    captureProgress: Math.round(territory.captureProgress),
    contested: territory.contested,
  }));
}

function broadcastTerritories(cityId: CityId, now = Date.now()): void {
  const territories = territoryStates(cityId);
  if (!territories.length) return;
  if (territories.every((territory) => now - territory.lastBroadcastAt < 1_000)) return;
  for (const territory of territories) territory.lastBroadcastAt = now;
  broadcastToCity(cityId, { type: 'territoryState', cityId, territories: territorySnapshot(cityId) });
}

function territoryContains(definition: CityTerritory, position: Vector3): boolean {
  return position.x >= definition.bounds.minX && position.x <= definition.bounds.maxX &&
    position.z >= definition.bounds.minZ && position.z <= definition.bounds.maxZ;
}

function isTerritoryActive(playerId: string, player: PlayerState, now: number): boolean {
  if (player.lifeState !== 'alive' || !player.hasRespawnTransform || now - player.lastStateAt > 1_500) return false;
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
  if (isHumanPilot(player)) {
    const profile = profileStore.awardServerReward(player.pilotId, reward.credits);
    if (profile) sendProfile(playerId, profile);
    if (kind === 'capture') recordObjectiveActivity(playerId, 'territoryCapture');
  }
  sendToPlayer(playerId, { type: 'territoryReward', territoryId: territory.definition.id, score: reward.score, credits: reward.credits, kind });
  broadcastLeaderboard(player.cityId);
}

function removeTerritoryContribution(playerId: string): void {
  const touched = new Set<CityId>();
  for (const [cityId, states] of cityTerritoryState) for (const territory of states.values()) {
    if (territory.capturingPlayerId === playerId) {
      territory.capturingPlayerId = undefined;
      territory.captureProgress = 0;
      territory.lastBroadcastAt = 0;
      touched.add(cityId);
    }
    if (territory.controllerId === playerId) {
      territory.controllerId = undefined;
      territory.captureProgress = 0;
      territory.lastBroadcastAt = 0;
      touched.add(cityId);
    }
  }
  for (const cityId of touched) broadcastTerritories(cityId);
}

function updateTerritories(now: number): void {
  for (const cityId of cityIds) {
    const cityTerritories = territoryStates(cityId);
    for (const [playerId, player] of players) {
      if (player.cityId !== cityId) continue;
      if (!player.hasRespawnTransform) {
        player.territoryIds.clear();
        continue;
      }
      const memberships = new Set(cityTerritories.filter((territory) => territoryContains(territory.definition, player.position)).map((territory) => territory.definition.id));
      for (const territoryId of memberships) if (!player.territoryIds.has(territoryId)) {
        sendToPlayer(playerId, { type: 'territoryNotice', territoryId, kind: 'enter' });
      }
      player.territoryIds = memberships;
    }
    const activePlayers = [...players.entries()].filter(([playerId, player]) => player.cityId === cityId && isTerritoryActive(playerId, player, now));
    let changed = false;
    for (const territory of cityTerritories) {
      const inside = activePlayers.filter(([, player]) => territoryContains(territory.definition, player.position));
      const contested = inside.length > 1;
      if (territory.contested !== contested) { territory.contested = contested; changed = true; }
      if (contested) {
        for (const [playerId] of inside) {
          if (now - (territory.lastContestedHeatAt.get(playerId) ?? 0) >= 15_000) {
            territory.lastContestedHeatAt.set(playerId, now);
            addHeat(playerId, 2, now);
          }
        }
        continue;
      }
      const contributor = inside[0];
      if (!contributor) continue;
      const [playerId] = contributor;
      if (territory.controllerId === playerId) {
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
      }
      territory.captureProgress = Math.min(100, territory.captureProgress + 100 / (territoryCaptureSeconds * 1000 / territoryTickMs) * territory.definition.captureWeight);
      changed = true;
      if (territory.captureProgress >= 100) {
        territory.controllerId = playerId;
        territory.capturingPlayerId = undefined;
        territory.lastRewardAt = now;
        awardTerritory(playerId, territory, 'capture', now);
        sendToPlayer(playerId, { type: 'territoryNotice', territoryId: territory.definition.id, kind: 'captured' });
        changed = true;
      }
    }
    if (changed) broadcastTerritories(cityId, now);
  }
}

function bankChaos(playerId: string, reason: string): void {
  const state = playerChaos.get(playerId);
  const player = players.get(playerId);
  if (!state || !player || state.pendingCredits <= 0) return;
  const reward = rewardWithHeat(playerId, 0, state.pendingCredits);
  const credits = reward.credits;
  state.pendingCredits = 0;
  const profile = profileStore.awardServerReward(player.pilotId, credits);
  if (profile) sendProfile(playerId, profile);
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
    riskMode: forcedSpec?.riskMode,
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
}

function distanceToEventObjective(player: PlayerState, event: CityEvent): number {
  return Math.hypot(player.position.x - event.objective.x, player.position.y - event.objective.y, player.position.z - event.objective.z);
}

function activateEvent(event: CityEvent, now: number): void {
  event.lifecycle = 'active';
  event.activeAt = now;
  event.expiresAt = now + (event.qaShortTimer ? 20_000 : eventActiveMs);
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
        if (progress > 0) awardEventPlayer(event, playerId, Math.round(template.rewardScore * Math.min(1, 0.35 + progress / event.route.length * 0.65)), Math.round(template.rewardCredits * Math.min(1, 0.35 + progress / event.route.length * 0.65)), 'VIP ESCORT COMPLETE');
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
        awardEventPlayer(event, playerId, template.rewardScore * multiplier, template.rewardCredits * multiplier, `RISK ZONE BANK x${multiplier}`);
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
    for (const playerId of event.participants) {
      if (playerId !== completedBy && (event.progress.get(playerId) ?? 0) > 1) awardEventPlayer(event, playerId, 80, 60, `${template.name} PARTICIPATION`);
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
  const allowed: readonly ChaosQaEvent[] = ['mostWanted', 'supplyDrop', 'goldenDrop', 'skyRush', 'stormRisk', 'lowAltitudeRisk', 'highAltitudeRisk', 'downtownRisk', 'aceIntercept', 'vipEscort', 'goldenSkyRun', 'cityEmergency'];
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
  broadcastToCity(projectile.cityId, { type: 'projectileRemove', projectileId });
}

function removePlayerProjectiles(playerId: string): void {
  for (const projectile of projectiles.values()) {
    if (projectile.ownerId === playerId) removeProjectile(projectile.projectileId);
  }
}

function updateRespawningPlayers(now: number): void {
  for (const [playerId, player] of players) {
    if (
      player.lifeState !== 'respawning' ||
      !player.hasRespawnTransform ||
      now < player.spawnProtectedUntil
    ) continue;
    player.lifeState = 'alive';
    broadcastToCity(player.cityId, {
      type: 'playerState',
      playerId,
      lifeState: player.lifeState,
      health: player.health,
      position: player.position,
      rotation: player.rotation,
      aircraftType: player.aircraftType,
      cityId: player.cityId,
      displayName: player.displayName,
      isBot: player.isBot,
      boostActive: player.boostActive,
      maxHealth: maxHealthForAircraft(player.aircraftType),
    });
    broadcastLeaderboard(player.cityId);
  }
}

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

// A projectile can advance roughly 37m per 50Hz tick at Redspear Boost speed.
// Sample the target's short predicted sweep against the
// projectile segment so a valid hit cannot tunnel between transform updates.
function sweptProjectileHit(
  player: PlayerState,
  startX: number,
  startY: number,
  startZ: number,
  end: Vector3,
  deltaSeconds: number,
): boolean {
  const hitRadius = aircraftHitRadii[player.aircraftType] * projectileHitRadiusMultiplier + projectileVisualRadius;
  const hitRadiusSquared = hitRadius * hitRadius;
  for (const fraction of [0, 1 / 3, 2 / 3, 1]) {
    const projectedPosition = {
      x: player.position.x + player.velocity.x * deltaSeconds * fraction,
      y: player.position.y + player.velocity.y * deltaSeconds * fraction,
      z: player.position.z + player.velocity.z * deltaSeconds * fraction,
    };
    if (distanceToSegmentSquared(projectedPosition, startX, startY, startZ, end) <= hitRadiusSquared) return true;
  }
  return false;
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
  const socket = aircraftMuzzleSockets[transform.aircraftType];
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
      target.lifeState !== 'alive' ||
      now < target.spawnProtectedUntil ||
      now - target.lastStateAt > combatTransformFreshMs
    ) continue;
    const offset = {
      x: target.position.x - origin.x,
      y: target.position.y - origin.y,
      z: target.position.z - origin.z,
    };
    const distance = Math.hypot(offset.x, offset.y, offset.z);
    if (distance > lockRange) continue;
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

function targetInAircraftSpace(transform: Transform, target: PlayerState): Vector3 {
  const offset = { x: target.position.x - transform.position.x, y: target.position.y - transform.position.y, z: target.position.z - transform.position.z };
  return {
    x: dot(offset, rotateLocalYxz({ x: 1, y: 0, z: 0 }, transform.rotation)),
    y: dot(offset, rotateLocalYxz({ x: 0, y: 1, z: 0 }, transform.rotation)),
    z: -dot(offset, forwardDirection(transform)),
  };
}

function updateAssistedAim(ownerId: string, owner: PlayerState, now: number, manualVertical: unknown): void {
  const aim = owner.assistedAim ??= { x: 0, y: 0, updatedAt: now };
  const candidate = owner.lifeState === 'alive' && now - owner.lastStateAt <= combatTransformFreshMs
    ? closestLockTarget(ownerId, owner, forwardDirection(owner), now) : undefined;
  const goal = { x: 0, y: 0 };
  aim.targetId = candidate?.[0];
  if (candidate) {
    const local = targetInAircraftSpace(owner, candidate[1]);
    aimGoal(local.x, local.y, local.z, goal);
  }
  if (owner.lifeState === 'alive') biasAimVertically(goal, manualVertical);
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
      target.lifeState !== 'alive' || now < target.spawnProtectedUntil || now - target.lastStateAt > combatTransformFreshMs) return undefined;
  const local = targetInAircraftSpace(transform, target);
  if (Math.hypot(local.x, local.y, local.z) > lockRange || !insideDynamicLock(local.x, local.y, local.z, aim)) return undefined;
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
  if (now - player.lastFireAt < fireCooldownMs) return 'cooldown';
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

function createProjectile(playerId: string, player: PlayerState, clientShotId?: string, fireTransform?: Transform, aim = { x: 0, y: 0 }): boolean {
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
  const direction = normalize(rotateLocalYxz({ x: aim.x, y: aim.y, z: -1 }, transform.rotation));
  const projectile: ProjectileState = {
    projectileId: randomUUID(),
    ownerId: playerId,
    cityId: player.cityId,
    position: muzzle.position,
    direction,
    traveled: 0,
    speed: ballisticShotSpeed(player.velocity, direction),
    mode: 'ballistic',
    clientShotId,
  };
  projectiles.set(projectile.projectileId, projectile);
  broadcastToCity(projectile.cityId, {
    type: 'projectileSpawn',
    projectileId: projectile.projectileId,
    ownerId: projectile.ownerId,
    position: projectile.position,
    direction: projectile.direction,
    speed: projectile.speed,
    mode: projectile.mode,
    clientShotId: projectile.clientShotId,
  });
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
  for (const projectile of projectiles.values()) {
    const states = statesByCity.get(projectile.cityId) ?? [];
    states.push({
      projectileId: projectile.projectileId,
      position: projectile.position,
      direction: projectile.direction,
      mode: projectile.mode,
    });
    statesByCity.set(projectile.cityId, states);
  }
  for (const [cityId, projectiles] of statesByCity) {
    broadcastToCity(cityId, { type: 'projectileStates', projectiles });
  }
}

function applyCombatHit(ownerId: string, victimId: string, cityId: CityId, now: number): boolean {
  const victim = players.get(victimId);
  if (
    !victim || victimId === ownerId || victim.entityType !== 'player' ||
    victim.cityId !== cityId || victim.lifeState !== 'alive' || now < victim.spawnProtectedUntil
  ) return false;

  victim.health = Math.max(0, victim.health - projectileDamage);
  airportRepairStays.delete(victimId);
  broadcastToCity(cityId, {
    type: 'damage', playerId: victimId, shooterId: ownerId, health: victim.health, maxHealth: maxHealthForAircraft(victim.aircraftType), damage: projectileDamage,
  });
  if (victim.health !== 0) return true;

  markPlayerDestroyed(victimId, victim, now);
  const killer = players.get(ownerId);
  if (killer?.entityType !== 'player') return true;
  const heatKillKey = `${ownerId}:${victimId}`;
  const eligibleForReward = isHumanPilot(killer) && (recentHeatKills.get(heatKillKey) ?? 0) <= now - heatKillCooldownMs;
  if (eligibleForReward) {
    recentHeatKills.set(heatKillKey, now);
    // Bot takedowns remain a small score/credit reward, never a renewable
    // Heat/combo source. Human-versus-human combat retains the full path.
    if (!victim.isBot) {
      addHeat(ownerId, heatGains.kill, now);
      registerChaosAction(ownerId, 'hit', now);
    }
  }
  const rewardScale = victim.isBot ? botKillRewardMultiplier : 1;
  const killReward = eligibleForReward ? rewardWithHeat(ownerId, 500 * rewardScale, 200 * rewardScale, now) : { score: 0, credits: 0, multiplier: 1 };
  killer.score += killReward.score;
  if (isHumanPilot(killer)) {
    const killerProfile = profileStore.awardServerReward(killer.pilotId, killReward.credits, { kills: victim.isBot ? 0 : 1 });
    if (killerProfile) sendProfile(ownerId, killerProfile);
    if (eligibleForReward && !victim.isBot) recordObjectiveActivity(ownerId, 'kill');
  }
  broadcastToCity(cityId, {
    type: 'destroyed', cause: 'combat', playerId: victimId, killerId: ownerId, killerDisplayName: killer.displayName, killerScore: killer.score, killerReward: killReward.score,
  });
  broadcastLeaderboard(cityId);
  updateKing(cityId, cityKings.get(cityId) === victimId ? ownerId : undefined);
  handleWantedDestruction(ownerId, victimId, now);
  return true;
}

function markPlayerDestroyed(victimId: string, victim: PlayerState, now: number): void {
  // Mark destruction before another shot/collision can inspect this player.
  victim.lifeState = 'destroyed';
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
    const victimProfile = profileStore.awardServerReward(victim.pilotId, 0, { deaths: 1 });
    if (victimProfile) sendProfile(victimId, victimProfile);
  } else if (victim.bot) {
    victim.bot.phase = 'respawn';
    victim.bot.respawnAt = now + 7_000;
  }
  clearLocksForTarget(victimId);
  removePlayerProjectiles(victimId);
}

function applyAircraftCollision(firstId: string, secondId: string, now: number): boolean {
  const first = players.get(firstId), second = players.get(secondId);
  if (!first || !second || firstId === secondId || first.cityId !== second.cityId ||
      first.entityType !== 'player' || second.entityType !== 'player' ||
      first.lifeState !== 'alive' || second.lifeState !== 'alive' ||
      !first.hasRespawnTransform || !second.hasRespawnTransform ||
      now < first.spawnProtectedUntil || now < second.spawnProtectedUntil ||
      now - first.lastStateAt > combatTransformFreshMs || now - second.lastStateAt > combatTransformFreshMs) return false;
  const relativeAllowance = Math.min(30, (Math.hypot(first.velocity.x, first.velocity.y, first.velocity.z) +
    Math.hypot(second.velocity.x, second.velocity.y, second.velocity.z)) * 0.1);
  if (Math.hypot(first.position.x - second.position.x, first.position.y - second.position.y, first.position.z - second.position.z) > aircraftCollisionRadius + relativeAllowance) return false;
  markPlayerDestroyed(firstId, first, now);
  markPlayerDestroyed(secondId, second, now);
  broadcastToCity(first.cityId, { type: 'destroyed', cause: 'collision', playerId: firstId, killerId: secondId, killerDisplayName: second.displayName, killerScore: second.score, killerReward: 0 });
  broadcastToCity(first.cityId, { type: 'destroyed', cause: 'collision', playerId: secondId, killerId: firstId, killerDisplayName: first.displayName, killerScore: first.score, killerReward: 0 });
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
  const muzzle = muzzleTransform(fireTransform ?? player);
  broadcastToCity(player.cityId, {
    type: 'assistedShot',
    shotId: randomUUID(),
    ownerId: playerId,
    targetId,
    origin: muzzle.position,
    targetPosition: target.position,
    clientShotId,
  });
  // A server-valid lock is an assisted hit.  Damage can only fail here if a
  // concurrent lifecycle transition made the target invalid after validation;
  // do not turn that already-emitted assisted shot into a second ballistic one.
  if (!applyCombatHit(playerId, targetId, player.cityId, now)) {
    logLockShotReject(playerId, player, targetId, fireTransform, 'damage_state_changed', now);
  }
  return true;
}

function applyAceInterceptHit(ownerId: string, cityId: CityId, start: Vector3, end: Vector3, now: number): boolean {
  const event = cityEvents.get(cityId);
  if (!event || event.lifecycle !== 'active' || event.type !== 'aceIntercept' || !event.bossHealth || event.bossHealth <= 0) return false;
  // This is a server-only event target: it never enters player lock or collision paths.
  const bossPosition = eventRoutePosition(event, now);
  if (distanceToSegmentSquared(bossPosition, start.x, start.y, start.z, end) > 14 * 14) return false;
  const owner = players.get(ownerId);
  if (!owner || owner.cityId !== cityId || owner.lifeState !== 'alive') return false;
  event.participants.add(ownerId);
  event.damageContribution.set(ownerId, (event.damageContribution.get(ownerId) ?? 0) + projectileDamage);
  event.bossHealth = Math.max(0, event.bossHealth - projectileDamage);
  if (event.bossHealth > 0) { broadcastEvent(event); return true; }
  const template = eventTemplateFor(event);
  const totalDamage = Math.max(1, [...event.damageContribution.values()].reduce((sum, value) => sum + value, 0));
  for (const [playerId, damage] of event.damageContribution) {
    const share = 0.4 + 0.6 * damage / totalDamage;
    awardEventPlayer(event, playerId, Math.round((template?.rewardScore ?? 0) * share), Math.round((template?.rewardCredits ?? 0) * share), 'ACE INTERCEPT CONTRIBUTION');
  }
  event.winnerId = [...event.damageContribution.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  setEventTerminal(event, 'completed', now);
  return true;
}

function updateProjectiles(deltaSeconds: number): void {
  const now = Date.now();
  updateRespawningPlayers(now);

  for (const projectile of projectiles.values()) {
    const owner = players.get(projectile.ownerId);
    if (!owner || owner.entityType !== 'player' || owner.lifeState !== 'alive') {
      removeProjectile(projectile.projectileId);
      continue;
    }
    const previousX = projectile.position.x;
    const previousY = projectile.position.y;
    const previousZ = projectile.position.z;
    const step = Math.min(projectile.speed * deltaSeconds, projectileRange - projectile.traveled);
    projectile.position.x += projectile.direction.x * step;
    projectile.position.y += projectile.direction.y * step;
    projectile.position.z += projectile.direction.z * step;
    projectile.traveled += step;

    if (applyAceInterceptHit(projectile.ownerId, projectile.cityId, { x: previousX, y: previousY, z: previousZ }, projectile.position, now)) {
      removeProjectile(projectile.projectileId);
      continue;
    }

    let hitPlayerId: string | null = null;
    for (const [playerId, player] of players) {
      if (
        playerId === projectile.ownerId ||
        player.entityType !== 'player' ||
        player.cityId !== projectile.cityId ||
        player.lifeState !== 'alive' ||
        now < player.spawnProtectedUntil
      ) {
        continue;
      }
      if (sweptProjectileHit(player, previousX, previousY, previousZ, projectile.position, deltaSeconds)) {
        hitPlayerId = playerId;
        break;
      }
    }

    if (hitPlayerId) {
      removeProjectile(projectile.projectileId);
      applyCombatHit(projectile.ownerId, hitPlayerId, projectile.cityId, now);
      continue;
    }

    if (projectile.traveled >= projectileRange) removeProjectile(projectile.projectileId);
  }
  broadcastProjectileStates(now);
}

function desiredBotCount(cityId: CityId): number {
  const humans = [...players.values()].filter((player) => player.cityId === cityId && !player.isBot).length;
  if (humans === 0) return 0;
  if (humans <= 2) return 7 - humans;
  if (humans <= 5) return 8 - humans;
  if (humans <= 8) return 9 - humans;
  return 0;
}

function botStateMessage(playerId: string, player: PlayerState, type: 'state' | 'playerState' = 'state'): object {
  return {
    type, playerId, position: player.position, rotation: player.rotation,
    aircraftType: player.aircraftType, cityId: player.cityId, displayName: player.displayName,
    lifeState: player.lifeState, health: player.health, maxHealth: maxHealthForAircraft(player.aircraftType), isBot: true, boostActive: false,
  };
}

function airportRoute(cityId: CityId, startIndex: number, personality: BotPersonality): Vector3[] {
  const airports = cityAirports[cityId];
  const origin = airports[startIndex % airports.length];
  const destination = airports[(startIndex + 1) % airports.length];
  const altitude = personality === 'racer' ? 820 : personality === 'hunter' ? 680 : personality === 'explorer' ? 520 : 410;
  const territory = territoriesForCity(cityId)[Math.floor(Math.random() * Math.max(1, territoriesForCity(cityId).length))];
  const activity = personality === 'explorer' || personality === 'casual'
    ? [{ x: territory?.center.x ?? destination.x, y: altitude, z: territory?.center.z ?? destination.z }]
    : [];
  return [
    { x: origin.x, y: 1.2, z: origin.z + origin.runwayLength * 0.30 },
    { x: origin.x, y: 160, z: origin.z - origin.runwayLength * 0.32 },
    { x: origin.x, y: altitude, z: origin.z - origin.runwayLength * 0.12 },
    ...activity,
    { x: destination.x, y: altitude, z: destination.z + destination.runwayLength * 0.16 },
    { x: destination.x, y: 1.2, z: destination.z + destination.runwayLength * 0.30 },
  ];
}

function botAircraft(personality: BotPersonality): AircraftType {
  if (personality === 'hunter') return 'fighter';
  if (personality === 'racer') return Math.random() < 0.7 ? 'privateJet' : 'fighter';
  if (personality === 'explorer') return Math.random() < 0.65 ? 'trainer' : 'privateJet';
  return Math.random() < 0.5 ? 'trainer' : 'cargo';
}

function createBot(cityId: CityId): void {
  const personality = botPersonalities[(nextBotSerial - 1) % botPersonalities.length];
  const airports = cityAirports[cityId];
  const homeAirportIndex = (nextBotSerial - 1) % airports.length;
  const home = airports[homeAirportIndex];
  const id = `bot:${cityId}:${nextBotSerial}`;
  const name = `${botNames[(nextBotSerial - 1) % botNames.length]}-${20 + ((nextBotSerial * 7) % 80)}`;
  const botAircraftType = botAircraft(personality);
  nextBotSerial += 1;
  const bot: BotRuntime = {
    personality, phase: 'taxi', route: airportRoute(cityId, homeAirportIndex, personality), routeIndex: 0,
    speed: 0, desiredSpeed: 0, nextDecisionAt: 0, nextFireAt: Date.now() + 1_200,
    respawnAt: 0, homeAirportIndex, combatPhaseUntil: 0, combatWaypointRefreshAt: 0, attackFireAfter: 0, combatTurnSign: 1, bankControl: 0,
  };
  const player: PlayerState = {
    pilotId: id, profile: undefined as unknown as PlayerProfile, entityType: 'player', isBot: true,
    cityId, position: { x: home.x, y: 1.2, z: home.z + home.runwayLength * 0.34 },
    rotation: { x: 0, y: home.heading, z: 0 }, aircraftType: botAircraftType,
    displayName: name, score: 0, health: maxHealthForAircraft(botAircraftType), lifeState: 'alive', hasRespawnTransform: true,
    lastFireAt: 0, spawnProtectedUntil: Date.now() + 1_500, velocity: { x: 0, y: 0, z: 0 }, boostActive: false,
    lastStateAt: Date.now(), chaosQaEnabled: false, territoryIds: new Set(), bot,
  };
  players.set(id, player);
  broadcastToCity(cityId, botStateMessage(id, player, 'playerState'));
}

function removeBot(playerId: string): void {
  const player = players.get(playerId);
  if (!player?.isBot) return;
  removePlayerProjectiles(playerId);
  clearPlayerRuntimeState(playerId);
  players.delete(playerId);
  broadcastToCity(player.cityId, { type: 'remove', playerId });
}

function reconcileBots(cityId: CityId): void {
  const bots = [...players.entries()].filter(([, player]) => player.cityId === cityId && player.isBot);
  const desired = Math.min(maxBotsPerCity, desiredBotCount(cityId));
  if (bots.length < desired) {
    createBot(cityId);
    return;
  }
  if (bots.length <= desired) return;
  const humans = [...players.values()].filter((player) => player.cityId === cityId && !player.isBot && player.lifeState === 'alive');
  const removable = bots
    .map(([id, bot]) => ({ id, distance: humans.length ? Math.min(...humans.map((human) => Math.hypot(bot.position.x - human.position.x, bot.position.z - human.position.z))) : Infinity }))
    .filter((candidate) => candidate.distance >= 1_800 || humans.length === 0)
    .sort((left, right) => right.distance - left.distance)[0];
  if (removable) removeBot(removable.id);
}

function wrapAngle(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function botCombatTarget(botId: string, bot: PlayerState, now: number): [string, PlayerState] | undefined {
  if (bot.bot?.personality !== 'hunter' || bot.position.y < 120) return undefined;
  const candidate = [...players.entries()]
    // Hunters add pressure to real pilots only. Bots remain route traffic and
    // never form a self-sustaining bot-vs-bot combat loop.
    .filter(([id, target]) => id !== botId && !target.isBot && target.cityId === bot.cityId && target.lifeState === 'alive' && target.hasRespawnTransform && now >= target.spawnProtectedUntil && now - target.lastStateAt < 1_500)
    .map(([id, target]) => ({ id, target, distance: Math.hypot(target.position.x - bot.position.x, target.position.y - bot.position.y, target.position.z - bot.position.z) }))
    .filter((candidate) => candidate.distance > 90 && candidate.distance < hunterDetectionRange)
    .filter((candidate) => {
      const currentHunters = [...players.values()].filter((other) => other.isBot && other.lifeState === 'alive' && other.bot?.personality === 'hunter' && other.bot.combatTargetId === candidate.id && isHunterCombatPhase(other.bot.phase)).length;
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
  if (!targetId || !target || targetId === botId || target.isBot || target.cityId !== player.cityId || target.lifeState !== 'alive' || !target.hasRespawnTransform || now - target.lastStateAt >= 1_500 || now < target.spawnProtectedUntil) return undefined;
  return [targetId, target];
}

function hunterInterceptWaypoint(player: PlayerState, bot: BotRuntime, target: PlayerState): Vector3 {
  const distance = Math.hypot(target.position.x - player.position.x, target.position.y - player.position.y, target.position.z - player.position.z);
  const leadSeconds = Math.max(0.65, Math.min(1.35, distance / Math.max(70, bot.speed)));
  const velocityLength = Math.hypot(target.velocity.x, target.velocity.y, target.velocity.z);
  const targetEnvelope = aircraftFlightEnvelope[target.aircraftType];
  const targetSpeedCap = targetEnvelope.maxSpeed * (target.boostActive ? targetEnvelope.boostMaxSpeed : 1);
  const velocityScale = velocityLength > targetSpeedCap ? targetSpeedCap / velocityLength : 1;
  return {
    x: target.position.x + target.velocity.x * velocityScale * leadSeconds,
    y: Math.max(180, target.position.y + target.velocity.y * velocityScale * leadSeconds),
    z: target.position.z + target.velocity.z * velocityScale * leadSeconds,
  };
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
  const isGroundLeg = target.y <= 2 && player.position.y <= 3;
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
    player.position.y = 1.2;
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
  const cruiseSpeed = envelope.maxSpeed * botCruiseFactor(bot.personality);
  // Induced drag during a bank forces a wide, energy-losing turn instead of a
  // full-speed orbit.  The cap is the normal player aircraft maximum, not a bot bonus.
  bot.desiredSpeed = Math.max(envelope.stallSpeed * 1.1, cruiseSpeed * (1 - hardTurn * 0.16));
  const airspeed = Math.max(0.01, bot.speed);
  const drag = (envelope.drag * (airspeed / envelope.maxSpeed) ** 2 * (1 + hardTurn * 0.25)) / envelope.inertia;
  const acceleration = envelope.acceleration / envelope.inertia;
  const speedDelta = bot.desiredSpeed >= bot.speed ? Math.max(0, acceleration - drag) * delta : drag * delta;
  bot.speed = Math.min(envelope.maxSpeed, moveTowardBot(bot.speed, bot.desiredSpeed, speedDelta));

  const pitchTarget = Math.max(-envelope.maxDivePitch, Math.min(envelope.maxClimbPitch, Math.atan2(dy, Math.max(1, horizontal))));
  player.rotation.x = moveTowardBot(player.rotation.x, pitchTarget, envelope.pitchRate * 0.72 * delta);
  const stallFactor = Math.max(0.18, Math.min(1, (bot.speed - envelope.stallSpeed * 0.48) / (envelope.stallSpeed * 0.52)));
  const desiredVerticalSpeed = Math.sin(player.rotation.x) * bot.speed * 0.58 - (1 - stallFactor) * 4.5;
  const verticalResponse = Math.max(2.5, Math.min(18, acceleration * 0.55));
  player.velocity.y = moveTowardBot(player.velocity.y, desiredVerticalSpeed, verticalResponse * delta);
  const forward = hunterForward(player);
  player.position.x += forward.x * bot.speed * delta;
  player.position.z += forward.z * bot.speed * delta;
  player.position.y = Math.max(1.2, player.position.y + player.velocity.y * delta);
  player.velocity.x = (player.position.x - previous.x) / delta;
  player.velocity.z = (player.position.z - previous.z) / delta;
}

function beginHunterApproach(player: PlayerState, bot: BotRuntime, targetId: string, target: PlayerState, now: number): void {
  const forward = hunterForward(player);
  const offsetX = target.position.x - player.position.x;
  const offsetZ = target.position.z - player.position.z;
  const cross = forward.x * offsetZ - forward.z * offsetX;
  bot.combatTargetId = targetId;
  bot.combatTurnSign = cross >= 0 ? 1 : -1;
  bot.combatWaypoint = hunterInterceptWaypoint(player, bot, target);
  bot.combatWaypointRefreshAt = now + 1_100;
  const distance = Math.hypot(target.position.x - player.position.x, target.position.y - player.position.y, target.position.z - player.position.z);
  bot.combatPhaseUntil = now + Math.min(25_000, Math.max(8_000, distance / Math.max(70, bot.speed) * 1_400));
  bot.attackFireAfter = now + hunterReactionDelayMs + Math.random() * 320;
  bot.phase = 'approach';
}

function beginHunterAttackPass(player: PlayerState, bot: BotRuntime, target: PlayerState, now: number): void {
  const forward = hunterForward(player);
  // Freeze a point beyond the target. The pilot commits through the merge,
  // rather than steering back as soon as the target crosses the nose.
  bot.combatWaypoint = {
    x: target.position.x + forward.x * 850,
    y: Math.max(180, target.position.y),
    z: target.position.z + forward.z * 850,
  };
  bot.combatPhaseUntil = now + 2_800;
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
  const separation = Math.max(1_050, botMinimumTurnRadius(player.aircraftType, Math.max(bot.speed, aircraftFlightEnvelope[player.aircraftType].stallSpeed * 1.2)) * 1.7);
  bot.combatWaypoint = {
    x: player.position.x + forward.x * separation,
    y: Math.max(180, player.position.y),
    z: player.position.z + forward.z * separation,
  };
  bot.combatPhaseUntil = now + Math.max(3_600, separation / Math.max(1, bot.speed) * 1_000);
  bot.phase = 'extend';
  player.lockedTargetId = undefined;
}

function beginHunterReposition(player: PlayerState, bot: BotRuntime, now: number): void {
  const forward = hunterForward(player);
  const side = { x: -forward.z * bot.combatTurnSign, z: forward.x * bot.combatTurnSign };
  // A broad offset forces real separation and a flyable turn radius before
  // another approach is considered.
  const radius = botMinimumTurnRadius(player.aircraftType, Math.max(bot.speed, aircraftFlightEnvelope[player.aircraftType].stallSpeed * 1.2));
  bot.combatWaypoint = {
    x: player.position.x + forward.x * radius * 0.8 + side.x * radius,
    y: Math.max(210, player.position.y + 70),
    z: player.position.z + forward.z * radius * 0.8 + side.z * radius,
  };
  bot.combatPhaseUntil = now + Math.max(5_200, radius / Math.max(1, bot.speed) * 2_000);
  bot.phase = 'reposition';
}

function clearHunterCombat(player: PlayerState, bot: BotRuntime): void {
  bot.combatTargetId = undefined;
  bot.combatWaypoint = undefined;
  bot.combatPhaseUntil = 0;
  bot.combatWaypointRefreshAt = 0;
  bot.attackFireAfter = 0;
  if (isHunterCombatPhase(bot.phase)) bot.phase = 'cruise';
  player.lockedTargetId = undefined;
}

function hunterNavigationTarget(botId: string, player: PlayerState, bot: BotRuntime, now: number): { waypoint: Vector3; target?: [string, PlayerState] } | undefined {
  if (bot.personality !== 'hunter') return undefined;
  let target = hunterTarget(botId, player, bot, now);
  if (!isHunterCombatPhase(bot.phase)) {
    const candidate = botCombatTarget(botId, player, now);
    if (!candidate) return undefined;
    beginHunterApproach(player, bot, candidate[0], candidate[1], now);
    target = candidate;
  }

  if (bot.phase === 'approach') {
    if (!target) {
      clearHunterCombat(player, bot);
      return undefined;
    }
    const distance = Math.hypot(target[1].position.x - player.position.x, target[1].position.y - player.position.y, target[1].position.z - player.position.z);
    const offset = normalize({ x: target[1].position.x - player.position.x, y: target[1].position.y - player.position.y, z: target[1].position.z - player.position.z });
    if (distance <= hunterFireRange && dot(hunterForward(player), offset) >= Math.cos(hunterFireCone)) {
      beginHunterAttackPass(player, bot, target[1], now);
    } else if (now >= bot.combatPhaseUntil) {
      // A timeout is not a firing solution. Make a wide reposition instead.
      beginHunterReposition(player, bot, now);
    } else if (now >= bot.combatWaypointRefreshAt) {
      // Intercept updates are deliberately sparse and retain the same target.
      bot.combatWaypoint = hunterInterceptWaypoint(player, bot, target[1]);
      bot.combatWaypointRefreshAt = now + 1_100;
    }
  } else if (bot.phase === 'attackPass') {
    if (now >= bot.combatPhaseUntil || (bot.combatWaypoint && Math.hypot(bot.combatWaypoint.x - player.position.x, bot.combatWaypoint.y - player.position.y, bot.combatWaypoint.z - player.position.z) < 100)) {
      beginHunterExtend(player, bot, now);
      target = undefined;
    }
  } else if (bot.phase === 'extend') {
    if (now >= bot.combatPhaseUntil || (bot.combatWaypoint && Math.hypot(bot.combatWaypoint.x - player.position.x, bot.combatWaypoint.y - player.position.y, bot.combatWaypoint.z - player.position.z) < 130)) {
      beginHunterReposition(player, bot, now);
      target = undefined;
    }
  } else if (bot.phase === 'reposition' && (now >= bot.combatPhaseUntil || (bot.combatWaypoint && Math.hypot(bot.combatWaypoint.x - player.position.x, bot.combatWaypoint.y - player.position.y, bot.combatWaypoint.z - player.position.z) < 140))) {
    if (target && Math.hypot(target[1].position.x - player.position.x, target[1].position.z - player.position.z) < hunterPursuitRange) {
      beginHunterApproach(player, bot, target[0], target[1], now);
    } else {
      clearHunterCombat(player, bot);
      return undefined;
    }
  }

  return bot.combatWaypoint ? { waypoint: bot.combatWaypoint, target: bot.phase === 'attackPass' ? target : undefined } : undefined;
}

function updateBots(now: number): void {
  const delta = botTickMs / 1000;
  for (const [botId, player] of players) {
    const bot = player.bot;
    if (!player.isBot || !bot) continue;
    if (player.lifeState === 'destroyed') {
      if (now < bot.respawnAt) continue;
      const airport = cityAirports[player.cityId][bot.homeAirportIndex % cityAirports[player.cityId].length];
      player.position = { x: airport.x, y: 1.2, z: airport.z + airport.runwayLength * 0.34 };
      player.rotation = { x: 0, y: airport.heading, z: 0 };
      player.velocity = { x: 0, y: 0, z: 0 };
      player.health = maxHealthForAircraft(player.aircraftType);
      player.lifeState = 'respawning';
      player.hasRespawnTransform = true;
      player.spawnProtectedUntil = now + 1_500;
      bot.phase = 'taxi';
      bot.speed = 0;
      bot.combatTargetId = undefined;
      bot.combatWaypoint = undefined;
      bot.combatPhaseUntil = 0;
      bot.combatWaypointRefreshAt = 0;
      bot.attackFireAfter = 0;
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
      if (activeEvent?.lifecycle === 'active' && bot.personality !== 'casual' && !isHunterCombatPhase(bot.phase) && Math.random() < 0.45) {
        activeEvent.participants.add(botId);
        bot.route = [{ x: activeEvent.objective.x, y: Math.max(420, activeEvent.objective.y + 420), z: activeEvent.objective.z }, ...airportRoute(player.cityId, bot.homeAirportIndex, bot.personality).slice(-2)];
        bot.routeIndex = 0;
        bot.phase = 'activity';
      }
    }

    const previousPhase = bot.phase;
    const combatNavigation = hunterNavigationTarget(botId, player, bot, now);
    if (stabilityDiagnosticsEnabled && bot.personality === 'hunter' && previousPhase !== bot.phase) {
      const tracked = bot.combatTargetId ? players.get(bot.combatTargetId) : undefined;
      console.log(`HUNTER target=${bot.combatTargetId ?? 'none'} state=${bot.phase} dist=${tracked ? Math.round(Math.hypot(tracked.position.x - player.position.x, tracked.position.y - player.position.y, tracked.position.z - player.position.z)) : '-'}`);
    }
    const combatTarget = combatNavigation?.target;
    if (combatTarget && now >= Math.max(bot.nextFireAt, bot.attackFireAfter)) {
      const [, target] = combatTarget;
      const offsetX = target.position.x - player.position.x;
      const offsetY = target.position.y - player.position.y;
      const offsetZ = target.position.z - player.position.z;
      const distanceToTarget = Math.hypot(offsetX, offsetY, offsetZ);
      const currentForward = hunterForward(player);
      const aimAngle = distanceToTarget > 1
        ? Math.acos(Math.max(-1, Math.min(1, dot(currentForward, normalize({ x: offsetX, y: offsetY, z: offsetZ })))))
        : Math.PI;
      // Attack-pass shots use the normal ballistic projectile pipeline. The
      // separate, modest bot cone and random dispersion create pressure
      // without granting a bot the player's assisted LOCKED-hit contract.
      const canShoot = !target.isBot && target.lifeState === 'alive' && now >= target.spawnProtectedUntil &&
        distanceToTarget <= hunterFireRange && aimAngle <= hunterFireCone;
      if (canShoot && Math.random() < 0.72) {
        const variance = (Math.random() - 0.5) * 0.052;
        const fireTransform: Transform = {
          position: player.position,
          rotation: {
            x: player.rotation.x + variance * 0.45,
            y: player.rotation.y + variance,
            z: player.rotation.z,
          },
          aircraftType: player.aircraftType,
        };
        if (createProjectile(botId, player, undefined, fireTransform)) {
          bot.attackShots = (bot.attackShots ?? 0) + 1;
          bot.noFireReason = undefined;
        } else bot.noFireReason = 'cooldown_protection_or_capacity';
      } else {
        bot.noFireReason = !canShoot ? (distanceToTarget > hunterFireRange ? 'range' : aimAngle > hunterFireCone ? 'angle' : 'eligibility') : 'burst_pause';
      }
      if (stabilityDiagnosticsEnabled && bot.noFireReason && now - (bot.noFireLoggedAt ?? 0) >= 2_000) {
        bot.noFireLoggedAt = now;
        console.log(`HUNTER_NO_FIRE ${bot.noFireReason} target=${bot.combatTargetId}`);
      }
      // 2–4 imperfect shots per committed pass when the geometry is good,
      // with quick retries after a missed window instead of silent fly-bys.
      bot.nextFireAt = now + (canShoot ? hunterShotIntervalMinMs + Math.random() * hunterShotIntervalJitterMs : 260);
    }

    const followingCombatWaypoint = Boolean(combatNavigation);
    const target = combatNavigation?.waypoint ?? bot.route[Math.min(bot.routeIndex, bot.route.length - 1)];
    if (!target) continue;
    const dx = target.x - player.position.x;
    const dy = target.y - player.position.y;
    const dz = target.z - player.position.z;
    const horizontal = Math.hypot(dx, dz);
    const distance = Math.hypot(horizontal, dy);
    if (distance <= Math.max(26, bot.speed * delta * 1.25)) {
      if (!followingCombatWaypoint) {
        bot.routeIndex += 1;
        if (bot.phase === 'taxi') bot.phase = 'takeoff';
        if (bot.routeIndex >= bot.route.length) {
          bot.homeAirportIndex = (bot.homeAirportIndex + 1) % cityAirports[player.cityId].length;
          bot.route = airportRoute(player.cityId, bot.homeAirportIndex, bot.personality);
          bot.routeIndex = 0;
          bot.phase = 'taxi';
        }
      }
    } else {
      advanceBotFlight(player, bot, target, delta);
      player.lastStateAt = now;
      player.hasRespawnTransform = true;
      if (player.position.y > 300 && bot.phase === 'takeoff') bot.phase = 'cruise';
    }
    broadcastToCity(player.cityId, botStateMessage(botId, player));
  }
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
    if (Math.abs(along) <= airport.runwayLength * 0.5 + 150 && Math.abs(lateral) <= Math.max(110, airport.runwayWidth * 3)) return airport;
  }
  return undefined;
}

function safeRespawnTransform(playerId: string, player: PlayerState, now: number): { position: Vector3; heading: number } {
  const airports = cityAirports[player.cityId];
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
  // fallback remains on the configured runway and protection still disables collision.
  return fallback ?? { position: { ...player.position }, heading: player.rotation.y };
}

function broadcastRepair(playerId: string, player: PlayerState, sourceId: string, full: boolean): void {
  broadcastToCity(player.cityId, {
    type: 'repair', playerId, sourceId, full,
    health: player.health,
    maxHealth: maxHealthForAircraft(player.aircraftType),
  });
}

function clearRepairState(playerId: string): void {
  airportRepairStays.delete(playerId);
  for (const key of repairCooldowns.keys()) {
    if (key.startsWith(`${playerId}:`)) repairCooldowns.delete(key);
  }
}

// All of these maps are keyed by an ephemeral connection/bot id.  A bot can
// be retired and a browser can disappear without a clean gameplay transition,
// so remove every such reference in the same lifecycle path.
function clearPlayerRuntimeState(playerId: string): void {
  clearLocksForTarget(playerId);
  playerChaos.delete(playerId);
  activeChallenges.delete(playerId);
  landingFlightState.delete(playerId);
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
  removeTerritoryContribution(playerId);
}

function pruneEphemeralRuntimeState(now: number): void {
  for (const [key, expiresAt] of repairCooldowns) if (expiresAt <= now) repairCooldowns.delete(key);
  for (const [key, receivedAt] of landingReceipts) if (now - receivedAt > 30_000) landingReceipts.delete(key);
  for (const [key, receivedAt] of recentBountyKills) if (now - receivedAt > 120_000) recentBountyKills.delete(key);
  for (const [key, receivedAt] of recentHeatKills) if (now - receivedAt > heatKillCooldownMs) recentHeatKills.delete(key);
  for (const [key, receivedAt] of masteryCooldowns) if (now - receivedAt > heatKillCooldownMs) masteryCooldowns.delete(key);
  for (const [key, receivedAt] of territoryRewardCooldown) if (now - receivedAt > territoryCaptureRewardCooldownMs) territoryRewardCooldown.delete(key);
  for (const [key, receivedAt] of fireBlockedDebugAt) if (now - receivedAt > 1_000) fireBlockedDebugAt.delete(key);
  for (const [pilotId, attempts] of testerAttempts) {
    const recent = attempts.filter((at) => now - at < 10 * 60_000);
    if (recent.length) testerAttempts.set(pilotId, recent); else testerAttempts.delete(pilotId);
  }
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
    if (player.lifeState !== 'alive' || !player.hasRespawnTransform || now - player.lastStateAt > 1_500) {
      airportRepairStays.delete(playerId);
      continue;
    }
    const maxHealth = maxHealthForAircraft(player.aircraftType);
    if (player.health < maxHealth) {
      for (const beacon of repairsForCity(player.cityId)) {
        if (player.position.y > beacon.maxAltitude) continue;
        if (Math.hypot(player.position.x - beacon.x, player.position.z - beacon.z) > beacon.radius) continue;
        const cooldownKey = `${playerId}:${beacon.id}`;
        if ((repairCooldowns.get(cooldownKey) ?? 0) > now) break;
        const repaired = Math.min(maxHealth - player.health, Math.max(1, Math.round(maxHealth * repairBeaconFraction)));
        player.health += repaired;
        repairCooldowns.set(cooldownKey, now + repairBeaconCooldownMs);
        airportRepairStays.delete(playerId);
        broadcastRepair(playerId, player, beacon.id, false);
        break;
      }
    }
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

let lastProjectileUpdate = Date.now();
setInterval(() => {
  const now = Date.now();
  const deltaSeconds = Math.min(0.1, (now - lastProjectileUpdate) / 1000);
  lastProjectileUpdate = now;
  updateProjectiles(deltaSeconds);
}, 50);

setInterval(() => updateDynamicEvents(Date.now()), eventTickMs);
setInterval(() => {
  updateCityHeat(Date.now());
  // Existing compact roster doubles as presence, independent of render FPS.
  // Periodic snapshots also recover a dropped join/remove under backpressure.
  for (const cityId of cityIds) broadcastLeaderboard(cityId);
}, 1_000);
setInterval(() => updateTerritories(Date.now()), territoryTickMs);
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

function identityFromRequest(request: IncomingMessage): { pilotId: string; pilotName: string } {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const requestedId = url.searchParams.get('pilotId') ?? '';
  const pilotId = /^[a-zA-Z0-9-]{16,80}$/.test(requestedId) ? requestedId : randomUUID();
  const requestedName = url.searchParams.get('pilotName') ?? '';
  return { pilotId, pilotName: requestedName.slice(0, 20) };
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

function removeHumanConnection(socket: WebSocket): void {
  const playerId = playerSockets.get(socket);
  if (!playerId) return; // Replacement and the subsequent close are idempotent.
  const player = players.get(playerId);
  playerSockets.delete(socket);
  if (!player) return;
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

server.on('connection', (socket, request) => {
  if (!protocolMatchesRequest(request)) {
    sendSocketMessage(socket, { type: 'protocolMismatch', expectedProtocolVersion: PROTOCOL_VERSION });
    socket.close(4002, 'Protocol mismatch');
    return;
  }
  const playerId = randomUUID();
  const cityId = cityFromRequest(request);
  const chaosQaEnabled = chaosQaFromRequest(request);
  const identity = identityFromRequest(request);
  let connectionKind = 'NEW';
  // A persistent profile owns progression; each live connection gets a new
  // playerId. Replace only the SAME profile, never another browser's identity.
  for (const [otherSocket, otherId] of playerSockets) {
    if (players.get(otherId)?.pilotId !== identity.pilotId) continue;
    connectionKind = 'REPLACED';
    removeHumanConnection(otherSocket);
    otherSocket.close(4001, 'Profile opened in another tab');
  }
  profileStore.getOrCreate(identity.pilotId, identity.pilotName);
  const profile = profileStore.objectivesForCity(identity.pilotId, cityId)!;
  if (connectionKind === 'NEW' && !profile.legacyImportPending) connectionKind = 'RECONNECT';
  const spawnSlot = reserveSpawnSlot(cityId);
  const spawnPosition = { x: 0, y: 1.2, z: 45 + spawnSlot * 15 };

  players.set(playerId, {
    pilotId: profile.pilotId,
    profile,
    entityType: 'player',
    isBot: false,
    cityId,
    position: spawnPosition,
    rotation: { x: 0, y: 0, z: 0 },
    aircraftType: profile.selectedAircraft,
    displayName: profile.pilotName,
    score: 0,
    health: maxHealthForAircraft(profile.selectedAircraft),
    lifeState: 'respawning',
    hasRespawnTransform: false,
    lastFireAt: 0,
    spawnProtectedUntil: Date.now() + spawnProtectionMs,
    velocity: { x: 0, y: 0, z: 0 },
    boostActive: false,
    lastStateAt: Date.now(),
    chaosQaEnabled,
    territoryIds: new Set(),
    distanceRewardMeters: 0,
    spawnSlot,
  });
  playerSockets.set(socket, playerId);
  console.log(`[server] player connected: ${playerId} (${playerSockets.size} humans online)`);
  if (stabilityDiagnosticsEnabled) console.info('[connection]', {
    pilotId: profile.pilotId, sessionId: playerId, cityId, kind: connectionKind,
    browser: (request.headers['user-agent'] ?? 'unknown').slice(0, 140),
    humans: [...players.values()].filter(player => !player.isBot && player.cityId === cityId).length,
  });
  // Populate a newly occupied city before its first snapshot, so a late join
  // immediately receives the same server-owned bot roster as existing pilots.
  reconcileBots(cityId);

  sendSocketMessage(socket,
    {
      type: 'welcome',
      protocolVersion: PROTOCOL_VERSION,
      selectionRevision: 0,
      playerId,
      pilotId: profile.pilotId,
      cityId,
      spawnPosition,
      health: maxHealthForAircraft(profile.selectedAircraft),
      maxHealth: maxHealthForAircraft(profile.selectedAircraft),
      lifeState: 'respawning',
      event: cityEvents.get(cityId) ? (eventSnapshot(cityEvents.get(cityId)!) as { event?: unknown }).event : undefined,
      social: socialSnapshot(cityId),
      heatStates: [...players.entries()]
        .filter(([, existing]) => existing.cityId === cityId)
        .map(([existingPlayerId]) => heatSnapshot(existingPlayerId)),
      territories: territorySnapshot(cityId),
      weeklyLeaderboards: weeklyLeaderboardSnapshot(cityId, playerId),
      profile,
      players: [...players.entries()]
        .filter(([existingPlayerId, player]) => existingPlayerId !== playerId && player.cityId === cityId)
        .map(([existingPlayerId, player]) => ({
          playerId: existingPlayerId,
          cityId: player.cityId,
          displayName: player.displayName,
          position: player.position,
          rotation: player.rotation,
          aircraftType: player.aircraftType,
          lifeState: player.lifeState,
          isBot: player.isBot,
          boostActive: player.boostActive,
          health: player.health,
          maxHealth: maxHealthForAircraft(player.aircraftType),
        })),
    },
  );
  broadcastLeaderboard(cityId);

  socket.on('message', (data) => {
    if (playerSockets.get(socket) !== playerId) return;
    try {
      const message = JSON.parse(data.toString()) as {
        type?: string;
        displayName?: unknown;
        score?: unknown;
        targetId?: unknown;
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
        equipRequestId?: unknown;
        airportId?: unknown;
        telemetry?: unknown;
        rewardId?: unknown;
        rewardSource?: unknown;
        boostActive?: unknown;
        transform?: unknown;
      } & Partial<Transform>;
      const player = players.get(playerId);
      if (!player) return;

      if (message.type === 'player') {
        if (typeof message.displayName === 'string' && message.displayName.trim()) {
          const profile = profileStore.setPilotName(player.pilotId, message.displayName);
          if (profile) {
            player.profile = profile;
            player.displayName = message.displayName.trim().slice(0, 20);
          }
        }
        broadcastLeaderboard(player.cityId);
        updateKing(player.cityId);
        return;
      }

      if (message.type === 'profileImport') {
        const profile = profileStore.importLegacy(player.pilotId, message.legacy ?? {});
        // The first legacy hydration is also an explicit server-side profile
        // reconciliation. Keep the active player transform aligned with that
        // persisted selection before any later transform can be broadcast.
        player.aircraftType = profile.selectedAircraft;
        player.health = maxHealthForAircraft(player.aircraftType);
        sendProfile(playerId, profile);
        broadcastToCity(player.cityId, {
          type: 'playerState', playerId, health: player.health, lifeState: player.lifeState,
          position: player.position, rotation: player.rotation, aircraftType: player.aircraftType,
          cityId: player.cityId, displayName: player.displayName, boostActive: player.boostActive, maxHealth: maxHealthForAircraft(player.aircraftType),
        });
        return;
      }

      if (message.type === 'profileProgress') {
        const before = player.profile;
        const profile = profileStore.updateProgress(player.pilotId, message.progress ?? {});
        if (profile) {
          player.profile = profile;
          const priorDiscoveries = new Set(before.discoveries[player.cityId] ?? []).size;
          const nextDiscoveries = new Set(profile.discoveries[player.cityId] ?? []).size;
          let objectiveUpdated = false;
          if (nextDiscoveries > priorDiscoveries) { recordObjectiveActivity(playerId, 'discovery', nextDiscoveries - priorDiscoveries); objectiveUpdated = true; }
          const distanceGain = Math.max(0, profile.totalDistance - before.totalDistance);
          if (distanceGain > 0) { recordObjectiveActivity(playerId, 'distance', distanceGain); objectiveUpdated = true; }
          if (!objectiveUpdated) sendProfile(playerId, profile);
        }
        return;
      }

      if (message.type === 'equipAircraft') {
        const requestId = message.equipRequestId;
        if (typeof requestId !== 'number' || !Number.isSafeInteger(requestId) || requestId <= 0) return;
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
        const profile = profileStore.equipAircraft(player.pilotId, message.aircraftType);
        if (!profile || profile.selectedAircraft !== message.aircraftType) {
          sendToPlayer(playerId, { type: 'equipRejected', equipRequestId: requestId, reason: 'AIRCRAFT LOCKED — CHOOSE AN OWNED AIRCRAFT' });
          return;
        }
        player.profile = profile;
        player.selectionRevision = (player.selectionRevision ?? 0) + 1;
        player.aircraftType = profile.selectedAircraft;
        player.health = maxHealthForAircraft(player.aircraftType);
        sendProfile(playerId, profile, undefined, requestId);
        broadcastToCity(player.cityId, {
          type: 'playerState', playerId, health: player.health, lifeState: player.lifeState,
          position: player.position, rotation: player.rotation, aircraftType: player.aircraftType,
          cityId: player.cityId, displayName: player.displayName, boostActive: player.boostActive, maxHealth: maxHealthForAircraft(player.aircraftType),
        });
        return;
      }

      if (message.type === 'purchaseAircraft') {
        const requestId = message.purchaseRequestId;
        if (typeof requestId !== 'number' || !Number.isSafeInteger(requestId) || requestId <= 0) return;
        const result = profileStore.purchaseAircraft(player.pilotId, message.aircraftType);
        if (result.profile) { player.profile = result.profile; sendProfile(playerId, result.profile); }
        sendToPlayer(playerId, { type: 'aircraftPurchaseResult', purchaseRequestId: requestId, aircraftType: message.aircraftType, ok: result.ok, reason: result.reason });
        return;
      }

      if (message.type === 'redeemTesterCode') {
        const result = redeemTesterCode(player.pilotId, message.testerCode);
        if (result.profile) { player.profile = result.profile; sendProfile(playerId, result.profile); }
        sendToPlayer(playerId, { type: 'testerCodeResult', ok: result.ok, reason: result.reason });
        return;
      }

      if (message.type === 'profileReward') {
        const rewardId = typeof message.rewardId === 'string' ? message.rewardId : '';
        const profile = profileStore.applyClientReward(player.pilotId, rewardId, message.rewardSource);
        if (profile) sendProfile(playerId, profile, rewardId);
        return;
      }

      if (message.type === 'chaosAction') {
        const action = message.action;
        if (action === 'stunt' || action === 'nearMiss') {
          registerChaosAction(playerId, action, Date.now());
          addHeat(playerId, action === 'nearMiss' ? 5 : 3);
        }
        return;
      }

      if (message.type === 'landingIntent') {
        validateAndRecordLanding(playerId, player, message.airportId, message.telemetry);
        return;
      }

      if (message.type === 'challengeStart') { startSkyChallenge(playerId, player, message.challengeId); return; }
      if (message.type === 'challengeGate') { passSkyChallengeGate(playerId, player, message.challengeId, message.gateIndex); return; }

      if (message.type === 'chaosQa') {
        runChaosQaCommand(player, message.action, message.qaEvent);
        return;
      }

      if (message.type === 'lock') {
        // Target IDs/aim coordinates are hints at most; selection and the
        // bounded moving aim are computed entirely from authoritative state.
        updateAssistedAim(playerId, player, Date.now(), message.aimVertical);
        return;
      }

      if (message.type === 'fire') {
        const now = Date.now();
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
        if (requestedTargetId && !assisted) {
          logLockShotReject(
            playerId,
            player,
            requestedTargetId,
            fireTransform,
            requestedTargetId === player.lockedTargetId ? 'lock_geometry' : 'stale_lock',
            now,
          );
        }
        if (!assisted && !createProjectile(playerId, player, clientShotId, fireTransform, shotAim)) {
          logFireBlocked(playerId, projectiles.size >= maxProjectiles ? 'projectile_cap' : 'invalid_state', now);
        }
        return;
      }

      if (message.type === 'eventJoin') {
        joinDynamicEvent(playerId, player, typeof message.eventId === 'string' ? message.eventId : undefined);
        return;
      }

      if (message.type === 'collision') {
        if (typeof message.targetId === 'string') applyAircraftCollision(playerId, message.targetId, Date.now());
        return;
      }

      if (message.type === 'respawn') {
        const safeSpawn = safeRespawnTransform(playerId, player, Date.now());
        player.assistedAim = undefined;
        player.aimSamples = undefined;
        player.health = maxHealthForAircraft(player.aircraftType);
        player.lifeState = 'respawning';
        player.hasRespawnTransform = false;
        player.spawnProtectedUntil = Date.now() + spawnProtectionMs;
        player.position = safeSpawn.position;
        player.rotation = { x: 0, y: safeSpawn.heading, z: 0 };
        player.velocity = { x: 0, y: 0, z: 0 };
        playerChaos.delete(playerId);
        activeChallenges.delete(playerId);
        landingFlightState.delete(playerId);
        airportRepairStays.delete(playerId);
        removeTerritoryContribution(playerId);
        const activeRiskZone = cityEvents.get(player.cityId);
        if (activeRiskZone?.lifecycle === 'active' && activeRiskZone.type === 'riskZone') {
          activeRiskZone.progress.delete(playerId);
          activeRiskZone.participants.delete(playerId);
        }
        setServerLock(playerId, player);
        reconcileMostWanted(player.cityId, Date.now());
        broadcastToCity(player.cityId, {
          type: 'respawn',
          playerId,
          health: player.health,
          maxHealth: maxHealthForAircraft(player.aircraftType),
          lifeState: player.lifeState,
          spawnPosition: safeSpawn.position,
          spawnHeading: safeSpawn.heading,
        });
        broadcastLeaderboard(player.cityId);
        return;
      }

      if (message.type !== 'state' || !message.position || !message.rotation) return;

      const values = [
        message.position.x,
        message.position.y,
        message.position.z,
        message.rotation.x,
        message.rotation.y,
        message.rotation.z,
      ];
      if (!values.every(Number.isFinite)) return;

      const stateNow = Date.now();
      const stateSeconds = Math.min(0.35, Math.max(0.08, (stateNow - player.lastStateAt) / 1000));
      const traveled = Math.hypot(
        message.position.x - player.position.x,
        message.position.y - player.position.y,
        message.position.z - player.position.z,
      );
      const nextVelocity = {
        x: (message.position.x - player.position.x) / stateSeconds,
        y: (message.position.y - player.position.y) / stateSeconds,
        z: (message.position.z - player.position.z) / stateSeconds,
      };
      const velocityLength = Math.hypot(nextVelocity.x, nextVelocity.y, nextVelocity.z);
      // Preserve fast aircraft velocity for interpolation, pursuit and swept
      // hits instead of truncating every aircraft at the old 300m/s limit.
      const envelope = aircraftFlightEnvelope[player.aircraftType];
      const velocityCap = envelope.maxSpeed * envelope.boostMaxSpeed + 10; // existing challenge speed bonus
      player.velocity = velocityLength > velocityCap
        ? { x: nextVelocity.x / velocityLength * velocityCap, y: nextVelocity.y / velocityLength * velocityCap, z: nextVelocity.z / velocityLength * velocityCap }
        : nextVelocity;
      const firstValidTransform = !player.hasRespawnTransform;
      player.lastStateAt = stateNow;
      player.position = message.position;
      player.rotation = message.rotation;
      player.boostActive = message.boostActive === true;
      // Transform packets never equip aircraft. Explicit equipAircraft above
      // is the only selection path accepted by the server profile.
      player.hasRespawnTransform = true;
      const flight = landingFlightState.get(playerId);
      if (!flight) landingFlightState.set(playerId, { baselineY: player.position.y, airborne: false });
      else if (player.position.y >= flight.baselineY + 8) flight.airborne = true;
      if (isHumanPilot(player) && flight?.airborne && player.lifeState === 'alive') {
        const acceptedTravel = Math.min(traveled, velocityCap * stateSeconds * 1.15);
        player.distanceRewardMeters = (player.distanceRewardMeters ?? 0) + acceptedTravel;
        const batches = Math.floor(player.distanceRewardMeters / economyRewards.distanceBatchMeters);
        if (batches > 0) {
          player.distanceRewardMeters -= batches * economyRewards.distanceBatchMeters;
          const rewarded = profileStore.awardServerReward(player.pilotId, batches * economyRewards.distanceBatchCredits);
          if (rewarded) sendProfile(playerId, rewarded);
        }
      }
      refreshCityLocks(player.cityId, stateNow);

      const update = {
        type: 'state',
        playerId,
        position: player.position,
        rotation: player.rotation,
        aircraftType: player.aircraftType,
        cityId: player.cityId,
        displayName: player.displayName,
        lifeState: player.lifeState,
        boostActive: player.boostActive,
        health: player.health,
        maxHealth: maxHealthForAircraft(player.aircraftType),
      };
      // A join is announced from the server's accepted first transform, not
      // from a best-effort client-side timing assumption. This gives already
      // connected peers a complete fallback-renderable player immediately.
      if (firstValidTransform) {
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
