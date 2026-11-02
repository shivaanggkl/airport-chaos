import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { portalRules, type PortalPose, type PortalCity } from '../../shared/intercity-portals.mjs';
export type PortalPhase = 'APPROVED' | 'TRANSIT' | 'DESTINATION_READY' | 'COMMITTED' | 'ARRIVED' | 'CANCELLED';
export type PortalFlight = {
    id: string;
    pilotId: string;
    session: string;
    mode: string;
    from: PortalCity;
    to: PortalCity;
    routeId: string;
    phase: PortalPhase;
    startedAt: number;
    updatedAt: number;
    finishedAt?: number;
    entry: PortalPose;
    pose: PortalPose;
    health: number;
    entryGround: number;
    ready: boolean;
    reward: number;
    dallasTimePreset?: 'day' | 'dusk' | 'evening';
};
/** Durable protocol state; wallet and historical reward eligibility stay in PlayerProfileStore. */
export class PortalTransitionStore {
    private db: DatabaseSync;
    constructor(path: string) { this.db = new DatabaseSync(path); this.db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS pilot_portal_flights (pilot_id TEXT PRIMARY KEY, state TEXT NOT NULL)'); }
    get(pilotId: string, session?: string): PortalFlight | undefined { const row = this.db.prepare('SELECT state FROM pilot_portal_flights WHERE pilot_id=?').get(pilotId) as {
        state: string;
    } | undefined; if (!row)
        return; const state = JSON.parse(row.state) as PortalFlight; return !session || state.session === session ? state : undefined; }
    save(state: PortalFlight) { this.db.prepare("UPDATE pilot_portal_flights SET state=? WHERE pilot_id=? AND json_extract(state,'$.id')=?").run(JSON.stringify(state), state.pilotId, state.id); }
    clear(pilotId: string, session: string) { this.db.prepare("DELETE FROM pilot_portal_flights WHERE pilot_id=? AND json_extract(state,'$.session')=?").run(pilotId, session); }
    approve(pilotId: string, session: string, mode: string, from: PortalCity, to: PortalCity, routeId: string, pose: PortalPose, health: number, now = Date.now(), entryGround = pose.position.y - 215, dallasTimePreset: 'day' | 'dusk' | 'evening' = 'day'): PortalFlight | undefined {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const prior = this.get(pilotId);
            if (prior && !['ARRIVED', 'CANCELLED'].includes(prior.phase) && now - prior.startedAt < portalRules.timeoutMs) {
                this.db.exec('ROLLBACK');
                return;
            }
            const state: PortalFlight = { id: randomUUID(), pilotId, session, mode, from, to, routeId, phase: 'APPROVED', startedAt: now, updatedAt: now, entry: structuredClone(pose), pose: structuredClone(pose), health, entryGround, dallasTimePreset, ready: false, reward: 0 };
            this.db.prepare('INSERT INTO pilot_portal_flights(pilot_id,state) VALUES(?,?) ON CONFLICT(pilot_id) DO UPDATE SET state=excluded.state').run(pilotId, JSON.stringify(state));
            this.db.exec('COMMIT');
            return state;
        }
        catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }
    close() { this.db.close(); }
}
