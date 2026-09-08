import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket, { WebSocketServer } from 'ws';
import { PlayerProfileStore, type LegacyProfileImport, type PlayerProfile, type ProfileProgress } from './player-profiles.js';
import { aircraftMuzzleSockets } from '../../shared/aircraft-muzzles.mjs';

type AircraftType = 'trainer' | 'privateJet' | 'cargo' | 'fighter';
type CityId = 'milwaukee' | 'dallas';
type PlayerLifeState = 'alive' | 'destroyed' | 'respawning';

type Transform = {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  aircraftType: AircraftType;
};

type PlayerState = Transform & {
  pilotId: string;
  profile: PlayerProfile;
  entityType: 'player';
  cityId: CityId;
  displayName: string;
  score: number;
  health: number;
  lifeState: PlayerLifeState;
  hasRespawnTransform: boolean;
  lastFireAt: number;
  spawnProtectedUntil: number;
  lockedTargetId?: string;
  velocity: Vector3;
  lastStateAt: number;
  chaosQaEnabled: boolean;
};

type Vector3 = { x: number; y: number; z: number };
type ProjectileMode = 'ballistic' | 'homing';
type DynamicEventType = 'skyRush' | 'supplyDrop' | 'emergencyEscort' | 'cargoConvoy' | 'riskZone' | 'mostWanted';
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
  participants: Set<string>;
  progress: Map<string, number>;
  rewardsGiven: Set<string>;
  winnerId?: string;
  wantedPlayerId?: string;
  riskMode?: 'storm' | 'lowAltitude' | 'highAltitude' | 'downtownDanger';
  riskRadius: number;
  goldenDrop: boolean;
  qaShortTimer: boolean;
  lastBroadcastAt: number;
};

type ChaosQaEvent = 'mostWanted' | 'supplyDrop' | 'goldenDrop' | 'skyRush' | 'stormRisk' | 'lowAltitudeRisk' | 'highAltitudeRisk' | 'downtownRisk';

type ProjectileState = {
  projectileId: string;
  ownerId: string;
  cityId: CityId;
  position: Vector3;
  direction: Vector3;
  traveled: number;
  mode: ProjectileMode;
  targetId?: string;
  guidanceTurnRate: number;
  clientShotId?: string;
};

const players = new Map<string, PlayerState>();
const projectiles = new Map<string, ProjectileState>();
const playerSockets = new Map<WebSocket, string>();
const usedSpawnSlots = new Map<CityId, Set<number>>();
const cityIds = new Set<CityId>(['milwaukee', 'dallas']);
const aircraftTypes = new Set<AircraftType>(['trainer', 'privateJet', 'cargo', 'fighter']);
const aircraftHitRadii: Record<AircraftType, number> = {
  trainer: 2.4,
  privateJet: 2.6,
  cargo: 3.6,
  fighter: 2.4,
};
const projectileHitRadiusMultiplier = 1.5;
const aimAssistByAircraft: Record<AircraftType, { selectionCone: number; assistRange: number; turnRate: number }> = {
  trainer: { selectionCone: 0.15, assistRange: 1000, turnRate: 5.5 },
  privateJet: { selectionCone: 0.15, assistRange: 1000, turnRate: 5.0 },
  cargo: { selectionCone: 0.15, assistRange: 1000, turnRate: 4.4 },
  fighter: { selectionCone: 0.15, assistRange: 1000, turnRate: 7.0 },
};
const projectileSpeed = 420;
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
const cityEvents = new Map<CityId, CityEvent>();
const lastEventTypes = new Map<CityId, DynamicEventType>();
const profileStore = new PlayerProfileStore(process.env.AIRPORT_CHAOS_PROFILE_DB ?? resolve(fileURLToPath(new URL('../data/player-profiles.sqlite', import.meta.url))));
type FormationState = { memberIds: [string, string]; qualifiedAt: number; active: boolean; lastRewardAt: number };
const cityKings = new Map<CityId, string>();
const formations = new Map<CityId, Map<string, FormationState>>();
const formationDelayMs = 5_000;
const formationRewardMs = 15_000;
const socialRewards = {
  formation: { score: 40, credits: 8 },
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
const playerHeat = new Map<string, { value: number; updatedAt: number }>();
const recentBountyKills = new Map<string, number>();

const port = Number(process.env.PORT ?? 8091);
const clientDist = resolve(fileURLToPath(new URL('../../client/dist/', import.meta.url)));
const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

async function serveFile(filePath: string, response: ServerResponse, headOnly: boolean): Promise<boolean> {
  try {
    const file = await stat(filePath);
    if (!file.isFile()) return false;
    response.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream' });
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
      const profile = payload?.legacy
        ? profileStore.importLegacy(identity.pilotId, payload.legacy as LegacyProfileImport)
        : payload ? profileStore.updateProgress(identity.pilotId, payload.progress ?? {}) : undefined;
      response.writeHead(profile ? 200 : 400, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(profile ?? { error: 'Invalid profile update' }));
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
    if (await serveFile(resolve(clientDist, 'index.html'), response, headOnly)) return;

    response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Client build unavailable');
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Bad request');
  }
});

const server = new WebSocketServer({ server: httpServer });

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`[server] healthy and listening on http://0.0.0.0:${port}`);
});

function broadcastToCity(cityId: CityId, message: object, except?: WebSocket): void {
  const encoded = JSON.stringify(message);
  for (const client of server.clients) {
    const playerId = playerSockets.get(client);
    const player = playerId ? players.get(playerId) : undefined;
    if (client !== except && player?.cityId === cityId && client.readyState === WebSocket.OPEN) client.send(encoded);
  }
}

function sendLockState(playerId: string, targetId?: string): void {
  for (const [socket, socketPlayerId] of playerSockets) {
    if (socketPlayerId === playerId && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'lockState', targetId }));
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
    if (player.lockedTargetId === targetId) setServerLock(playerId, player);
  }
}

function broadcastLeaderboard(cityId: CityId): void {
  const message = JSON.stringify({
    type: 'leaderboard',
    players: [...players.entries()]
      .filter(([, player]) => player.cityId === cityId)
      .map(([playerId, player]) => ({
        playerId,
        displayName: player.displayName,
        score: player.score,
      }))
      .sort((a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName))
      .slice(0, 10),
  });

  for (const client of server.clients) {
    const playerId = playerSockets.get(client);
    const player = playerId ? players.get(playerId) : undefined;
    if (player?.cityId === cityId && client.readyState === WebSocket.OPEN) client.send(message);
  }
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
  player.score += score;
  const profile = profileStore.awardServerReward(player.pilotId, credits, { challengeCompletions: reason.includes('CHALLENGE WON') ? 1 : 0 });
  if (profile) sendProfile(playerId, profile);
  sendToPlayer(playerId, { type: 'socialReward', score, credits, reason });
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
    const cityPlayers = [...players.entries()].filter(([, player]) => player.cityId === cityId && player.entityType === 'player');
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

function eventRoutePosition(event: CityEvent, now: number): EventRoutePoint {
  if (event.route.length < 2 || event.routeSpeed <= 0) return event.objective;
  let remaining = ((now - event.activeAt) / 1000) * event.routeSpeed;
  for (let index = 0; index < event.route.length - 1; index += 1) {
    const start = event.route[index];
    const end = event.route[index + 1];
    const length = Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
    if (remaining <= length) {
      const t = length === 0 ? 0 : remaining / length;
      return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t, z: start.z + (end.z - start.z) * t };
    }
    remaining -= length;
  }
  return event.route[event.route.length - 1];
}

function eventAircraftStates(event: CityEvent, now: number): Array<{ routeId: string; position: Vector3; direction: Vector3 }> {
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
    };
  });
}

function eventSnapshot(event: CityEvent): object {
  const template = eventTemplateFor(event);
  return {
    type: 'eventState',
    event: {
      id: event.id,
      cityId: event.cityId,
      eventType: event.type,
      lifecycle: event.lifecycle,
      name: eventName(event),
      objective: event.objective,
      route: event.route,
      activeAt: event.activeAt,
      expiresAt: event.expiresAt,
      participantCount: event.participants.size,
      rankings: [...event.progress.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([playerId, progress]) => ({ playerId, progress })),
      eventAircraft: eventAircraftStates(event, Date.now()),
      wantedPlayerId: event.wantedPlayerId,
      riskMode: event.riskMode,
      riskRadius: event.riskRadius,
      goldenDrop: event.goldenDrop,
      rewardCredits: (template?.rewardCredits ?? 0) * (event.goldenDrop ? 2 : 1),
    },
  };
}

function sendToPlayer(playerId: string, message: object): void {
  for (const [socket, socketPlayerId] of playerSockets) {
    if (socketPlayerId === playerId && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
      return;
    }
  }
}

function sendProfile(playerId: string, profile?: PlayerProfile, rewardId?: string): void {
  const player = players.get(playerId);
  if (!player) return;
  const current = profile ?? player.profile;
  player.profile = current;
  player.displayName = current.pilotName;
  player.aircraftType = current.selectedAircraft;
  sendToPlayer(playerId, { type: 'profile', profile: current, rewardId });
}

function broadcastEvent(event: CityEvent): void {
  broadcastToCity(event.cityId, eventSnapshot(event));
  event.lastBroadcastAt = Date.now();
}

function awardEventPlayer(event: CityEvent, playerId: string, score: number, credits: number, reason: string): void {
  if (event.rewardsGiven.has(playerId)) return;
  const player = players.get(playerId);
  if (!player || player.cityId !== event.cityId) return;
  event.rewardsGiven.add(playerId);
  player.score += score;
  addHeat(playerId, 22);
  const profile = profileStore.awardServerReward(player.pilotId, credits, { eventCompletions: 1 });
  if (profile) sendProfile(playerId, profile);
  sendToPlayer(playerId, { type: 'eventReward', eventId: event.id, score, credits, reason });
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
  const score = chaosActionValues[action] * multiplier;
  previous.multiplier = multiplier;
  previous.lastAction = action;
  previous.lastAt = now;
  previous.pendingCredits += Math.max(1, Math.floor(score / 50));
  player.score += score;
  playerChaos.set(playerId, previous);
  sendToPlayer(playerId, { type: 'chaosState', multiplier, action, score, pendingCredits: previous.pendingCredits });
  broadcastLeaderboard(player.cityId);
}

function addHeat(playerId: string, amount: number, now = Date.now()): void {
  const current = playerHeat.get(playerId);
  const decayed = current ? Math.max(0, current.value - (now - current.updatedAt) / 60_000 * 5) : 0;
  playerHeat.set(playerId, { value: Math.min(250, decayed + amount), updatedAt: now });
}

function bankChaos(playerId: string, reason: string): void {
  const state = playerChaos.get(playerId);
  const player = players.get(playerId);
  if (!state || !player || state.pendingCredits <= 0) return;
  const credits = state.pendingCredits;
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
  const template = forcedSpec
    ? templates.find((candidate) => candidate.type === forcedSpec.type)
    : candidates[Math.floor(Math.random() * candidates.length)] ?? templates[0];
  if (!template) return undefined;
  lastEventTypes.set(cityId, template.type);
  const activeAt = now + randomBetween(eventAvailableMinMs, eventAvailableMaxMs);
  const event: CityEvent = {
    id: randomUUID(), cityId, type: template.type, lifecycle: 'available', createdAt: now,
    activeAt, expiresAt: activeAt + eventActiveMs,
    cooldownUntil: 0, objective: { ...template.objective }, route: template.route?.map((point) => ({ ...point })) ?? [],
    routeSpeed: template.routeSpeed ?? 0, eventRouteIds: [...(template.eventRouteIds ?? [])],
    participants: new Set(), progress: new Map(), rewardsGiven: new Set(), riskRadius: template.type === 'riskZone' ? 900 : 260,
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
  if (event.type === 'riskZone' && !event.riskMode) {
    event.riskMode = (['storm', 'lowAltitude', 'highAltitude', 'downtownDanger'] as const)[Math.floor(Math.random() * 4)];
  }
  if (event.type === 'mostWanted') {
    const candidates = [...players.entries()]
      .filter(([, player]) => player.cityId === event.cityId && player.lifeState === 'alive')
      .sort((left, right) => (playerHeat.get(right[0])?.value ?? right[1].score * 0.05) - (playerHeat.get(left[0])?.value ?? left[1].score * 0.05));
    event.wantedPlayerId = candidates[0]?.[0];
  }
  const template = eventTemplateFor(event);
  if (!template) {
    setEventTerminal(event, 'failed', now);
    return;
  }
  broadcastToCity(event.cityId, { type: 'eventAnnouncement', eventId: event.id, name: eventName(event), reward: template.rewardCredits * (event.goldenDrop ? 2 : 1), expiresAt: event.expiresAt });
  broadcastEvent(event);
}

function updateActiveEvent(event: CityEvent, now: number): void {
  const template = eventTemplateFor(event);
  if (!template) {
    setEventTerminal(event, 'failed', now);
    return;
  }
  if (event.type === 'emergencyEscort' || event.type === 'cargoConvoy') event.objective = eventRoutePosition(event, now);
  if (event.type === 'mostWanted') {
    const target = event.wantedPlayerId ? players.get(event.wantedPlayerId) : undefined;
    if (!target || target.cityId !== event.cityId) {
      setEventTerminal(event, 'failed', now);
      return;
    }
    event.objective = { ...target.position };
    if (now >= event.expiresAt) {
      awardEventPlayer(event, event.wantedPlayerId!, template.rewardScore, template.rewardCredits, 'BOUNTY SURVIVED');
      setEventTerminal(event, 'completed', now);
    }
    return;
  }

  if (event.type === 'riskZone') {
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
    if (distanceToEventObjective(player, event) <= (event.type === 'skyRush' ? 150 : 420)) {
      event.participants.add(playerId);
      event.progress.set(playerId, event.progress.get(playerId) ?? 0);
    }
  }

  let completedBy: string | undefined;
  for (const playerId of event.participants) {
    const player = players.get(playerId);
    if (!player || player.cityId !== event.cityId || player.lifeState !== 'alive') continue;
    const gateIndex = event.type === 'skyRush' ? Math.floor(event.progress.get(playerId) ?? 0) : 0;
    const objective = event.type === 'skyRush' ? event.route[Math.min(gateIndex, event.route.length - 1)] : event.objective;
    const withinObjective = Math.hypot(player.position.x - objective.x, player.position.y - objective.y, player.position.z - objective.z) <= (event.type === 'skyRush' ? 150 : 420);
    if (!withinObjective) continue;
    if (event.type === 'skyRush') {
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
    if (event && now - event.lastBroadcastAt >= eventBroadcastMs) broadcastEvent(event);
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
  const allowed: readonly ChaosQaEvent[] = ['mostWanted', 'supplyDrop', 'goldenDrop', 'skyRush', 'stormRisk', 'lowAltitudeRisk', 'highAltitudeRisk', 'downtownRisk'];
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
  awardEventPlayer(event, killerId, template.rewardScore, template.rewardCredits, 'MOST WANTED BOUNTY');
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
    });
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
  const tolerance = Math.min(75, 20 + speed * 0.35);
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

function steerToward(direction: Vector3, targetDirection: Vector3, turnAngle: number): Vector3 {
  const cosine = Math.max(-1, Math.min(1, dot(direction, targetDirection)));
  const angle = Math.acos(cosine);
  if (angle < 0.0001 || turnAngle <= 0) return direction;
  const amount = Math.min(1, turnAngle / angle);
  return normalize({
    x: direction.x + (targetDirection.x - direction.x) * amount,
    y: direction.y + (targetDirection.y - direction.y) * amount,
    z: direction.z + (targetDirection.z - direction.z) * amount,
  });
}

function closestLockTarget(ownerId: string, player: PlayerState, direction: Vector3, now: number): [string, PlayerState] | undefined {
  const tuning = aimAssistByAircraft[player.aircraftType];
  let closest: [string, PlayerState] | undefined;
  let closestAngle = Number.POSITIVE_INFINITY;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const [targetId, target] of players) {
    if (
      targetId === ownerId ||
      target.entityType !== 'player' ||
      target.cityId !== player.cityId ||
      target.lifeState !== 'alive' ||
      now < target.spawnProtectedUntil
    ) continue;
    const offset = {
      x: target.position.x - player.position.x,
      y: target.position.y - player.position.y,
      z: target.position.z - player.position.z,
    };
    const distance = Math.hypot(offset.x, offset.y, offset.z);
    if (distance < 1 || distance > tuning.assistRange) continue;
    const angle = Math.acos(Math.max(-1, Math.min(1, dot(direction, normalize(offset)))));
    if (angle > tuning.selectionCone) continue;
    if (angle < closestAngle || (angle === closestAngle && distance < closestDistance)) {
      closest = [targetId, target];
      closestAngle = angle;
      closestDistance = distance;
    }
  }
  return closest;
}

function validLockTarget(ownerId: string, player: PlayerState, direction: Vector3, now: number, targetId?: string): PlayerState | undefined {
  if (!targetId) return undefined;
  const closest = closestLockTarget(ownerId, player, direction, now);
  return closest?.[0] === targetId ? closest[1] : undefined;
}

function validGuidanceTarget(projectile: ProjectileState, owner: PlayerState, now: number): PlayerState | undefined {
  const targetId = projectile.targetId;
  if (!targetId || owner.lockedTargetId !== targetId) return undefined;
  const target = players.get(targetId);
  if (
    !target ||
    targetId === projectile.ownerId ||
    target.entityType !== 'player' ||
    target.cityId !== projectile.cityId ||
    target.lifeState !== 'alive' ||
    now < target.spawnProtectedUntil
  ) return undefined;
  const ownerDistance = Math.hypot(
    target.position.x - owner.position.x,
    target.position.y - owner.position.y,
    target.position.z - owner.position.z,
  );
  const tuning = aimAssistByAircraft[owner.aircraftType];
  if (ownerDistance > tuning.assistRange) return undefined;
  const targetDirection = normalize({
    x: target.position.x - owner.position.x,
    y: target.position.y - owner.position.y,
    z: target.position.z - owner.position.z,
  });
  // Guidance is valid only while the actual aircraft remains inside the same
  // server-validated lock circle. Predicted intercept never controls locking.
  return dot(forwardDirection(owner), targetDirection) >= Math.cos(tuning.selectionCone) ? target : undefined;
}

function createProjectile(playerId: string, player: PlayerState, preferredTargetId?: string, clientShotId?: string, fireTransform?: Transform): void {
  const now = Date.now();
  if (
    player.entityType !== 'player' ||
    player.lifeState !== 'alive' ||
    now - player.lastFireAt < fireCooldownMs ||
    projectiles.size >= maxProjectiles
  ) {
    return;
  }
  player.lastFireAt = now;

  const transform = fireTransform ?? player;
  const muzzle = muzzleTransform(transform);
  const direction = muzzle.direction;
  const targetId = preferredTargetId && preferredTargetId === player.lockedTargetId &&
    validLockTarget(playerId, player, direction, now, preferredTargetId)
    ? preferredTargetId
    : undefined;
  const projectile: ProjectileState = {
    projectileId: randomUUID(),
    ownerId: playerId,
    cityId: player.cityId,
    position: muzzle.position,
    direction,
    traveled: 0,
    mode: targetId ? 'homing' : 'ballistic',
    targetId,
    guidanceTurnRate: targetId ? aimAssistByAircraft[player.aircraftType].turnRate : 0,
    clientShotId,
  };
  projectiles.set(projectile.projectileId, projectile);
  broadcastToCity(projectile.cityId, {
    type: 'projectileSpawn',
    projectileId: projectile.projectileId,
    ownerId: projectile.ownerId,
    position: projectile.position,
    direction: projectile.direction,
    mode: projectile.mode,
    targetId: projectile.targetId,
    clientShotId: projectile.clientShotId,
  });
}

function updateProjectileGuidance(projectile: ProjectileState, owner: PlayerState, now: number, deltaSeconds: number): boolean {
  if (projectile.mode !== 'homing' || !projectile.targetId) return false;
  const targetId = projectile.targetId;
  const target = validGuidanceTarget(projectile, owner, now);
  if (!target) {
    projectile.mode = 'ballistic';
    if (owner.lockedTargetId === targetId) setServerLock(projectile.ownerId, owner);
    return true;
  }

  const distance = Math.hypot(
    target.position.x - projectile.position.x,
    target.position.y - projectile.position.y,
    target.position.z - projectile.position.z,
  );
  if (distance < 1 || distance > projectileRange) {
    projectile.mode = 'ballistic';
    if (owner.lockedTargetId === targetId) setServerLock(projectile.ownerId, owner);
    return true;
  }

  let interceptSeconds = Math.min(2.2, distance / projectileSpeed);
  const firstOffset = {
    x: target.position.x + target.velocity.x * interceptSeconds - projectile.position.x,
    y: target.position.y + target.velocity.y * interceptSeconds - projectile.position.y,
    z: target.position.z + target.velocity.z * interceptSeconds - projectile.position.z,
  };
  interceptSeconds = Math.min(2.2, Math.hypot(firstOffset.x, firstOffset.y, firstOffset.z) / projectileSpeed);
  const interceptDirection = normalize({
    x: target.position.x + target.velocity.x * interceptSeconds - projectile.position.x,
    y: target.position.y + target.velocity.y * interceptSeconds - projectile.position.y,
    z: target.position.z + target.velocity.z * interceptSeconds - projectile.position.z,
  });
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(projectile.direction, interceptDirection))));
  const turn = Math.min(angle, projectile.guidanceTurnRate * deltaSeconds);
  if (turn < 0.0001) return false;
  projectile.direction = steerToward(projectile.direction, interceptDirection, turn);
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
    targetId?: string;
  }>>();
  for (const projectile of projectiles.values()) {
    const states = statesByCity.get(projectile.cityId) ?? [];
    states.push({
      projectileId: projectile.projectileId,
      position: projectile.position,
      direction: projectile.direction,
      mode: projectile.mode,
      targetId: projectile.targetId,
    });
    statesByCity.set(projectile.cityId, states);
  }
  for (const [cityId, projectiles] of statesByCity) {
    broadcastToCity(cityId, { type: 'projectileStates', projectiles });
  }
}

function updateProjectiles(deltaSeconds: number): void {
  const step = projectileSpeed * deltaSeconds;
  const now = Date.now();
  updateRespawningPlayers(now);

  for (const projectile of projectiles.values()) {
    const owner = players.get(projectile.ownerId);
    if (!owner || owner.entityType !== 'player' || owner.lifeState !== 'alive') {
      removeProjectile(projectile.projectileId);
      continue;
    }
    updateProjectileGuidance(projectile, owner, now, deltaSeconds);
    const previousX = projectile.position.x;
    const previousY = projectile.position.y;
    const previousZ = projectile.position.z;
    projectile.position.x += projectile.direction.x * step;
    projectile.position.y += projectile.direction.y * step;
    projectile.position.z += projectile.direction.z * step;
    projectile.traveled += step;

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
      const hitRadius = aircraftHitRadii[player.aircraftType] * projectileHitRadiusMultiplier;
      if (
        distanceToSegmentSquared(
          player.position,
          previousX,
          previousY,
          previousZ,
          projectile.position,
        ) <= hitRadius * hitRadius
      ) {
        hitPlayerId = playerId;
        break;
      }
    }

    if (hitPlayerId) {
      const victim = players.get(hitPlayerId);
      if (!victim) continue;
      if (victim.lifeState !== 'alive') {
        removeProjectile(projectile.projectileId);
        continue;
      }
      victim.health = Math.max(0, victim.health - projectileDamage);
      broadcastToCity(projectile.cityId, {
        type: 'damage',
        playerId: hitPlayerId,
        shooterId: projectile.ownerId,
        health: victim.health,
        damage: projectileDamage,
      });
      removeProjectile(projectile.projectileId);

      if (victim.health === 0) {
        // This must happen before any later projectile can evaluate the same
        // player in this tick, preventing duplicate kills and rewards.
        victim.lifeState = 'destroyed';
        playerChaos.delete(hitPlayerId);
        const activeRiskZone = cityEvents.get(victim.cityId);
        if (activeRiskZone?.lifecycle === 'active' && activeRiskZone.type === 'riskZone') {
          activeRiskZone.progress.delete(hitPlayerId);
          activeRiskZone.participants.delete(hitPlayerId);
        }
        const victimProfile = profileStore.awardServerReward(victim.pilotId, 0, { deaths: 1 });
        if (victimProfile) sendProfile(hitPlayerId, victimProfile);
        clearLocksForTarget(hitPlayerId);
        removePlayerProjectiles(hitPlayerId);
        const killer = players.get(projectile.ownerId);
        if (killer?.entityType === 'player') {
          killer.score += 500;
          addHeat(projectile.ownerId, 45, now);
          registerChaosAction(projectile.ownerId, 'hit', now);
          const killerProfile = profileStore.awardServerReward(killer.pilotId, 200, { kills: 1 });
          if (killerProfile) sendProfile(projectile.ownerId, killerProfile);
          broadcastToCity(projectile.cityId, {
            type: 'destroyed',
            playerId: hitPlayerId,
            killerId: projectile.ownerId,
            killerDisplayName: killer.displayName,
            killerScore: killer.score,
          });
          broadcastLeaderboard(projectile.cityId);
          updateKing(projectile.cityId, cityKings.get(projectile.cityId) === hitPlayerId ? projectile.ownerId : undefined);
          handleWantedDestruction(projectile.ownerId, hitPlayerId, now);
        }
      }
      continue;
    }

    if (projectile.traveled >= projectileRange) removeProjectile(projectile.projectileId);
  }
  broadcastProjectileStates(now);
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
  const now = Date.now();
  updateFormations(now);
}, 500);

function cityFromRequest(request: IncomingMessage): CityId {
  const cityId = new URL(request.url ?? '/', 'http://localhost').searchParams.get('city');
  return cityIds.has(cityId as CityId) ? cityId as CityId : 'milwaukee';
}

function chaosQaFromRequest(request: IncomingMessage): boolean {
  return process.env.AIRPORT_CHAOS_DEV_QA === '1' &&
    new URL(request.url ?? '/', 'http://localhost').searchParams.get('chaosqa') === '1';
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

server.on('connection', (socket, request) => {
  const playerId = randomUUID();
  const cityId = cityFromRequest(request);
  const chaosQaEnabled = chaosQaFromRequest(request);
  const identity = identityFromRequest(request);
  const profile = profileStore.getOrCreate(identity.pilotId, identity.pilotName);
  const spawnSlot = reserveSpawnSlot(cityId);
  const spawnPosition = { x: 0, y: 1.2, z: 45 + spawnSlot * 15 };
  console.log(`[server] player connected: ${playerId} (${server.clients.size} online)`);

  players.set(playerId, {
    pilotId: profile.pilotId,
    profile,
    entityType: 'player',
    cityId,
    position: spawnPosition,
    rotation: { x: 0, y: 0, z: 0 },
    aircraftType: profile.selectedAircraft,
    displayName: profile.pilotName,
    score: 0,
    health: 100,
    lifeState: 'respawning',
    hasRespawnTransform: false,
    lastFireAt: 0,
    spawnProtectedUntil: Date.now() + spawnProtectionMs,
    velocity: { x: 0, y: 0, z: 0 },
    lastStateAt: Date.now(),
    chaosQaEnabled,
  });
  playerSockets.set(socket, playerId);

  socket.send(
    JSON.stringify({
      type: 'welcome',
      playerId,
      pilotId: profile.pilotId,
      cityId,
      spawnPosition,
      health: 100,
      lifeState: 'respawning',
      event: cityEvents.get(cityId) ? (eventSnapshot(cityEvents.get(cityId)!) as { event?: unknown }).event : undefined,
      social: socialSnapshot(cityId),
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
        })),
    }),
  );
  broadcastLeaderboard(cityId);

  socket.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString()) as {
        type?: string;
        displayName?: unknown;
        score?: unknown;
        targetId?: unknown;
        clientShotId?: unknown;
        eventId?: unknown;
        challengeId?: unknown;
        challengeType?: unknown;
        action?: unknown;
        qaEvent?: unknown;
        legacy?: LegacyProfileImport;
        progress?: ProfileProgress;
        rewardId?: unknown;
        credits?: unknown;
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
        sendProfile(playerId, profile);
        return;
      }

      if (message.type === 'profileProgress') {
        const profile = profileStore.updateProgress(player.pilotId, message.progress ?? {});
        if (profile) sendProfile(playerId, profile);
        return;
      }

      if (message.type === 'profileReward') {
        const rewardId = typeof message.rewardId === 'string' ? message.rewardId : '';
        const profile = profileStore.applyClientReward(player.pilotId, rewardId, typeof message.credits === 'number' ? message.credits : 0);
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

      if (message.type === 'chaosQa') {
        runChaosQaCommand(player, message.action, message.qaEvent);
        return;
      }

      if (message.type === 'lock') {
        const targetId = typeof message.targetId === 'string' ? message.targetId : undefined;
        const target = validLockTarget(playerId, player, forwardDirection(player), Date.now(), targetId);
        setServerLock(playerId, player, target ? targetId : undefined, true);
        return;
      }

      if (message.type === 'fire') {
        const clientShotId = typeof message.clientShotId === 'string' && message.clientShotId.length <= 80
          ? message.clientShotId
          : undefined;
        const requestedTargetId = typeof message.targetId === 'string' ? message.targetId : undefined;
        createProjectile(
          playerId,
          player,
          requestedTargetId && requestedTargetId === player.lockedTargetId ? requestedTargetId : undefined,
          clientShotId,
          validFireTransform(player, message.transform),
        );
        return;
      }

      if (message.type === 'eventJoin') {
        joinDynamicEvent(playerId, player, typeof message.eventId === 'string' ? message.eventId : undefined);
        return;
      }

      if (message.type === 'respawn') {
        player.health = 100;
        player.lifeState = 'respawning';
        player.hasRespawnTransform = false;
        player.spawnProtectedUntil = Date.now() + spawnProtectionMs;
        playerChaos.delete(playerId);
        const activeRiskZone = cityEvents.get(player.cityId);
        if (activeRiskZone?.lifecycle === 'active' && activeRiskZone.type === 'riskZone') {
          activeRiskZone.progress.delete(playerId);
          activeRiskZone.participants.delete(playerId);
        }
        setServerLock(playerId, player);
        broadcastToCity(player.cityId, {
          type: 'respawn',
          playerId,
          health: player.health,
          lifeState: player.lifeState,
        });
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
      const nextVelocity = {
        x: (message.position.x - player.position.x) / stateSeconds,
        y: (message.position.y - player.position.y) / stateSeconds,
        z: (message.position.z - player.position.z) / stateSeconds,
      };
      const velocityLength = Math.hypot(nextVelocity.x, nextVelocity.y, nextVelocity.z);
      player.velocity = velocityLength > 300
        ? { x: nextVelocity.x / velocityLength * 300, y: nextVelocity.y / velocityLength * 300, z: nextVelocity.z / velocityLength * 300 }
        : nextVelocity;
      const firstValidTransform = !player.hasRespawnTransform;
      player.lastStateAt = stateNow;
      player.position = message.position;
      player.rotation = message.rotation;
      if (aircraftTypes.has(message.aircraftType as AircraftType) && player.aircraftType !== message.aircraftType && player.profile.unlockedAircraft.includes(message.aircraftType as AircraftType)) {
        player.aircraftType = message.aircraftType as AircraftType;
        const profile = profileStore.updateProgress(player.pilotId, { selectedAircraft: player.aircraftType });
        if (profile) player.profile = profile;
      }
      player.hasRespawnTransform = true;

      const update = {
        type: 'state',
        playerId,
        position: player.position,
        rotation: player.rotation,
        aircraftType: player.aircraftType,
        cityId: player.cityId,
        displayName: player.displayName,
        lifeState: player.lifeState,
      };
      // A join is announced from the server's accepted first transform, not
      // from a best-effort client-side timing assumption. This gives already
      // connected peers a complete fallback-renderable player immediately.
      if (firstValidTransform) {
        broadcastToCity(player.cityId, { ...update, type: 'playerState', health: player.health });
      } else {
        broadcastToCity(player.cityId, update, socket);
      }
    } catch {
      // Ignore malformed client messages.
    }
  });

  socket.on('close', () => {
    removePlayerProjectiles(playerId);
    players.delete(playerId);
    playerSockets.delete(socket);
    playerChaos.delete(playerId);
    playerHeat.delete(playerId);
    if (cityKings.get(cityId) === playerId) updateKing(cityId);
    usedSpawnSlots.get(cityId)?.delete(spawnSlot);
    broadcastToCity(cityId, { type: 'remove', playerId }, socket);
    broadcastLeaderboard(cityId);
    console.log(`[server] player disconnected: ${playerId} (${server.clients.size} online)`);
  });
});

server.on('error', (error) => {
  console.error('[server] WebSocket error:', error);
});

httpServer.on('error', (error) => {
  console.error('[server] HTTP error:', error);
});
