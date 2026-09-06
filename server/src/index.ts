import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket, { WebSocketServer } from 'ws';

type AircraftType = 'trainer' | 'privateJet' | 'cargo' | 'fighter';
type CityId = 'milwaukee' | 'dallas';

type Transform = {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  aircraftType: AircraftType;
};

type PlayerState = Transform & {
  cityId: CityId;
  displayName: string;
  score: number;
  health: number;
  lastFireAt: number;
  spawnProtectedUntil: number;
};

type Vector3 = { x: number; y: number; z: number };

type ProjectileState = {
  projectileId: string;
  ownerId: string;
  cityId: CityId;
  position: Vector3;
  direction: Vector3;
  traveled: number;
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
const projectileSpeed = 420;
const projectileRange = 1000;
const projectileDamage = 25;
const fireCooldownMs = 250;
const spawnProtectionMs = 3000;
const maxProjectiles = 256;

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

const httpServer = createServer(async (request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('ok');
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }

  try {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
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

function removeProjectile(projectileId: string): void {
  const projectile = projectiles.get(projectileId);
  if (!projectile || !projectiles.delete(projectileId)) return;
  broadcastToCity(projectile.cityId, { type: 'projectileRemove', projectileId });
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

function createProjectile(playerId: string, player: PlayerState): void {
  const now = Date.now();
  if (
    player.health <= 0 ||
    now - player.lastFireAt < fireCooldownMs ||
    projectiles.size >= maxProjectiles
  ) {
    return;
  }
  player.lastFireAt = now;

  const pitch = player.rotation.x;
  const heading = player.rotation.y;
  const direction = {
    x: -Math.sin(heading) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: -Math.cos(heading) * Math.cos(pitch),
  };
  const muzzleOffset = 4;
  const projectile: ProjectileState = {
    projectileId: randomUUID(),
    ownerId: playerId,
    cityId: player.cityId,
    position: {
      x: player.position.x + direction.x * muzzleOffset,
      y: player.position.y + direction.y * muzzleOffset,
      z: player.position.z + direction.z * muzzleOffset,
    },
    direction,
    traveled: 0,
  };
  projectiles.set(projectile.projectileId, projectile);
  broadcastToCity(projectile.cityId, {
    type: 'projectileSpawn',
    projectileId: projectile.projectileId,
    ownerId: projectile.ownerId,
    position: projectile.position,
    direction: projectile.direction,
  });
}

function updateProjectiles(deltaSeconds: number): void {
  const step = projectileSpeed * deltaSeconds;
  const now = Date.now();

  for (const projectile of projectiles.values()) {
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
        player.cityId !== projectile.cityId ||
        player.health <= 0 ||
        now < player.spawnProtectedUntil
      ) {
        continue;
      }
      const hitRadius = aircraftHitRadii[player.aircraftType];
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
        const killer = players.get(projectile.ownerId);
        if (killer) {
          killer.score += 500;
          broadcastToCity(projectile.cityId, {
            type: 'destroyed',
            playerId: hitPlayerId,
            killerId: projectile.ownerId,
            killerDisplayName: killer.displayName,
            killerScore: killer.score,
          });
          broadcastLeaderboard(projectile.cityId);
        }
      }
      continue;
    }

    if (projectile.traveled >= projectileRange) removeProjectile(projectile.projectileId);
  }
}

let lastProjectileUpdate = Date.now();
setInterval(() => {
  const now = Date.now();
  const deltaSeconds = Math.min(0.1, (now - lastProjectileUpdate) / 1000);
  lastProjectileUpdate = now;
  updateProjectiles(deltaSeconds);
}, 50);

function cityFromRequest(request: IncomingMessage): CityId {
  const cityId = new URL(request.url ?? '/', 'http://localhost').searchParams.get('city');
  return cityIds.has(cityId as CityId) ? cityId as CityId : 'milwaukee';
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
  const spawnSlot = reserveSpawnSlot(cityId);
  const spawnPosition = { x: 0, y: 1.2, z: 45 + spawnSlot * 15 };
  console.log(`[server] player connected: ${playerId} (${server.clients.size} online)`);

  players.set(playerId, {
    cityId,
    position: spawnPosition,
    rotation: { x: 0, y: 0, z: 0 },
    aircraftType: 'trainer',
    displayName: `Pilot-${playerId.slice(0, 3).toUpperCase()}`,
    score: 0,
    health: 100,
    lastFireAt: 0,
    spawnProtectedUntil: Date.now() + spawnProtectionMs,
  });
  playerSockets.set(socket, playerId);

  socket.send(
    JSON.stringify({
      type: 'welcome',
      playerId,
      cityId,
      spawnPosition,
      health: 100,
      players: [...players.entries()]
        .filter(([existingPlayerId, player]) => existingPlayerId !== playerId && player.cityId === cityId)
        .map(([existingPlayerId, player]) => ({
          playerId: existingPlayerId,
          cityId: player.cityId,
          position: player.position,
          rotation: player.rotation,
          aircraftType: player.aircraftType,
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
      } & Partial<Transform>;
      const player = players.get(playerId);
      if (!player) return;

      if (message.type === 'player') {
        if (typeof message.displayName === 'string' && message.displayName.trim()) {
          player.displayName = message.displayName.trim().slice(0, 20);
        }
        if (typeof message.score === 'number' && Number.isFinite(message.score)) {
          player.score = Math.max(0, Math.floor(message.score));
        }
        broadcastLeaderboard(player.cityId);
        return;
      }

      if (message.type === 'fire') {
        createProjectile(playerId, player);
        return;
      }

      if (message.type === 'respawn') {
        player.health = 100;
        player.spawnProtectedUntil = Date.now() + spawnProtectionMs;
        broadcastToCity(player.cityId, { type: 'respawn', playerId, health: player.health });
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

      player.position = message.position;
      player.rotation = message.rotation;
      if (aircraftTypes.has(message.aircraftType as AircraftType)) player.aircraftType = message.aircraftType as AircraftType;

      const update = {
        type: 'state',
        playerId,
        position: player.position,
        rotation: player.rotation,
        aircraftType: player.aircraftType,
        cityId: player.cityId,
      };
      broadcastToCity(player.cityId, update, socket);
    } catch {
      // Ignore malformed client messages.
    }
  });

  socket.on('close', () => {
    for (const projectile of projectiles.values()) {
      if (projectile.ownerId === playerId) removeProjectile(projectile.projectileId);
    }
    players.delete(playerId);
    playerSockets.delete(socket);
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
