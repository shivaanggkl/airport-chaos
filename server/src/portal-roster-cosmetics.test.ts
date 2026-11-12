import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

test('committed public portal roster preserves humans and profile-less bot cosmetics', () => {
    // Exercise the actual packet builder without starting a second server or changing its roster.
    const source = readFileSync('server/src/index.ts', 'utf8');
    const start = source.indexOf('function sendPortal(');
    const fn = source.slice(start, source.indexOf('\nfunction applyPortalPose', start));
    const peers = [
        { profile: { cosmetics: { equipped: { paint: 'human' } } } },
        { npcOpponent: { cosmetics: { paint: 'npc' } } },
        { bot: { opponent: { cosmetics: { paint: 'bot' } } } },
        { bot: { escort: true } },
        {},
    ].map(peer => ({ cityId: 'milwaukee', aircraftType: 'trainer', ...peer }));
    let packet: any;
    runInNewContext(ts.transpileModule(fn + ';sendPortal("owner",{id:"test",phase:"COMMITTED",from:"dallas",to:"milwaukee"});', {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText, {
        players: new Map([['owner', { cityId: 'milwaukee', aircraftType: 'trainer' }], ...peers.map((peer, i) => [String(i), peer] as const)]),
        sendToPlayer: (_id: string, value: unknown) => { packet = value; },
        portalNavigation: () => undefined, territorySnapshot: () => [], socialSnapshot: () => [],
        cityEvents: new Map(), eventSnapshot: () => ({}), playerJourneyAttempts: new Map(),
        pausedJourneyPlayers: new Map(), pausedTrainingPlayers: new Map(),
        maxHealthForAircraft: () => 100,
        transportEscortCosmetics: (bot: any) => bot?.escort ? { paint: 'escort' } : undefined,
    });
    assert.equal(packet.players.length, peers.length);
    assert.deepEqual(JSON.parse(JSON.stringify(packet.players.map((peer: any) => peer.equippedCosmetics))), [
        { paint: 'human' }, { paint: 'npc' }, { paint: 'bot' }, { paint: 'escort' }, {},
    ]);
});
