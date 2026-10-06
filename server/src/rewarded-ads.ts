import { createPublicKey, randomUUID, verify as verifySignature } from 'node:crypto';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  REWARDED_AD_ATTEMPT_LIFETIME_MS,
  REWARDED_AD_CREDITS,
  REWARDED_AD_MAX_REWARDS,
  REWARDED_AD_WINDOW_MS,
  type RewardedAdAttemptStatus,
} from '../../shared/rewarded-ads.mjs';
import { PlayerWallet } from './player-wallet.js';

export type RewardedAdPlatform = 'ios' | 'android';
export type RewardedAdClientEvent = 'started' | 'qualified' | 'closed' | 'failed';

type PlatformConfiguration = Readonly<{ enabled: boolean; adUnitId?: string }>;
export type RewardedAdConfiguration = Readonly<{
  enabled: boolean;
  ios: PlatformConfiguration;
  android: PlatformConfiguration;
  webEnabled: false;
  providerRewardAmount: string;
  providerRewardItem?: string;
}>;

export type RewardedAdStatus = Readonly<{
  supported: boolean;
  provider?: 'ADMOB';
  platform?: RewardedAdPlatform;
  rewardCredits: number;
  maxRewards: number;
  remaining: number;
  windowStartedAt?: number;
  windowEndsAt?: number;
  activeAttempt?: { attemptId: string; status: RewardedAdAttemptStatus; expiresAt: number };
  serverNow: number;
}>;

export type RewardedAdAttempt = Readonly<{
  attemptId: string;
  provider: 'ADMOB';
  platform: RewardedAdPlatform;
  adUnitId: string;
  customData: string;
  expiresAt: number;
  rewardCredits: number;
}>;

export type VerifiedAdMobReward = Readonly<{
  adUnit: string;
  customData: string;
  rewardAmount: string;
  rewardItem: string;
  timestamp: number;
  transactionId: string;
}>;

type AttemptRow = {
  attempt_id: string;
  pilot_id: string;
  provider: 'ADMOB';
  platform: RewardedAdPlatform;
  ad_unit_id: string;
  status: RewardedAdAttemptStatus;
  created_at: number;
  expires_at: number;
  provider_transaction_id?: string;
  wallet_transaction_id?: string;
};

const activeAttemptStatuses = "'CREATED','AD_STARTED','PENDING_VERIFICATION'";
const referencePattern = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,159}$/;
const adUnitPattern = /^ca-app-pub-[0-9]{16}\/[0-9]{10}$/;
const admobVerificationKeysUrl = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
const keyCacheLifetimeMs = 23 * 60 * 60 * 1000;
const callbackClockToleranceMs = 5 * 60 * 1000;
const androidTestAdUnit = 'ca-app-pub-3940256099942544/5224354917';
const iosTestAdUnit = 'ca-app-pub-3940256099942544/1712485313';

function enabledFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === 'true' || value.trim() === '1';
}

function configuredAdUnit(value: string | undefined, fallback?: string): string | undefined {
  const candidate = value?.trim() || fallback;
  return candidate && adUnitPattern.test(candidate) ? candidate : undefined;
}

export function rewardedAdConfiguration(environment: NodeJS.ProcessEnv = process.env): RewardedAdConfiguration {
  const development = environment.NODE_ENV !== 'production';
  const enabled = enabledFlag(environment.AIRPORT_CHAOS_REWARDED_ADS_ENABLED, development);
  const iosAdUnit = configuredAdUnit(environment.AIRPORT_CHAOS_ADMOB_IOS_REWARDED_AD_UNIT_ID, development ? iosTestAdUnit : undefined);
  const androidAdUnit = configuredAdUnit(environment.AIRPORT_CHAOS_ADMOB_ANDROID_REWARDED_AD_UNIT_ID, development ? androidTestAdUnit : undefined);
  return {
    enabled,
    ios: { enabled: enabled && enabledFlag(environment.AIRPORT_CHAOS_REWARDED_ADS_IOS_ENABLED, true) && Boolean(iosAdUnit), adUnitId: iosAdUnit },
    android: { enabled: enabled && enabledFlag(environment.AIRPORT_CHAOS_REWARDED_ADS_ANDROID_ENABLED, true) && Boolean(androidAdUnit), adUnitId: androidAdUnit },
    webEnabled: false,
    providerRewardAmount: environment.AIRPORT_CHAOS_ADMOB_REWARD_AMOUNT?.trim() || '1',
    providerRewardItem: environment.AIRPORT_CHAOS_ADMOB_REWARD_ITEM?.trim() || undefined,
  };
}

function providerAdUnitMatches(configured: string, callbackValue: string): boolean {
  return callbackValue === configured || callbackValue === configured.slice(configured.lastIndexOf('/') + 1);
}

function normalizeProviderTimestamp(value: number): number {
  return value > 100_000_000_000_000 ? Math.floor(value / 1_000) : value;
}

export class RewardedAdStore {
  private readonly database: DatabaseSync;
  private readonly wallet: PlayerWallet;

  constructor(filePath: string, readonly configuration = rewardedAdConfiguration()) {
    mkdirSync(dirname(filePath), { recursive: true });
    this.database = new DatabaseSync(filePath);
    this.database.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
    this.wallet = new PlayerWallet(this.database);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS rewarded_ad_windows (
        pilot_id TEXT PRIMARY KEY,
        window_started_at INTEGER,
        successful_count INTEGER NOT NULL DEFAULT 0 CHECK(successful_count BETWEEN 0 AND ${REWARDED_AD_MAX_REWARDS}),
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(pilot_id) REFERENCES player_profiles(pilot_id) ON DELETE RESTRICT
      );
      CREATE TABLE IF NOT EXISTS rewarded_ad_attempts (
        attempt_id TEXT PRIMARY KEY,
        pilot_id TEXT NOT NULL,
        provider TEXT NOT NULL CHECK(provider = 'ADMOB'),
        platform TEXT NOT NULL CHECK(platform IN ('ios','android')),
        ad_unit_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('CREATED','AD_STARTED','PENDING_VERIFICATION','REWARDED','CLOSED_WITHOUT_REWARD','FAILED','EXPIRED')),
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        window_started_at INTEGER,
        provider_transaction_id TEXT UNIQUE,
        wallet_transaction_id TEXT UNIQUE,
        verified_at INTEGER,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(pilot_id) REFERENCES player_profiles(pilot_id) ON DELETE RESTRICT,
        FOREIGN KEY(wallet_transaction_id) REFERENCES wallet_transactions(transaction_id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS rewarded_ad_one_active_attempt
        ON rewarded_ad_attempts(pilot_id) WHERE status IN (${activeAttemptStatuses});
      CREATE INDEX IF NOT EXISTS rewarded_ad_attempts_pilot_created
        ON rewarded_ad_attempts(pilot_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS rewarded_ad_provider_transactions (
        provider TEXT NOT NULL CHECK(provider = 'ADMOB'),
        transaction_id TEXT NOT NULL,
        attempt_id TEXT NOT NULL UNIQUE,
        received_at INTEGER NOT NULL,
        PRIMARY KEY(provider, transaction_id),
        FOREIGN KEY(attempt_id) REFERENCES rewarded_ad_attempts(attempt_id) ON DELETE RESTRICT
      );
    `);
  }

  status(pilotId: string, platform: RewardedAdPlatform, now = Date.now()): RewardedAdStatus {
    if (!this.platformConfiguration(platform)?.enabled || !this.profileExists(pilotId)) return this.unsupported(platform, now);
    return this.wallet.transaction(() => this.statusWithinTransaction(pilotId, platform, now));
  }

  createAttempt(pilotId: string, platform: RewardedAdPlatform, now = Date.now()): { ok: true; attempt: RewardedAdAttempt; status: RewardedAdStatus } | { ok: false; code: 'UNSUPPORTED' | 'LIMIT_REACHED' | 'ACTIVE_ATTEMPT'; status: RewardedAdStatus } {
    const platformConfig = this.platformConfiguration(platform);
    if (!platformConfig?.enabled || !platformConfig.adUnitId || !this.profileExists(pilotId)) {
      return { ok: false, code: 'UNSUPPORTED', status: this.unsupported(platform, now) };
    }
    const adUnitId = platformConfig.adUnitId;
    return this.wallet.transaction(() => {
      const current = this.statusWithinTransaction(pilotId, platform, now);
      if (current.remaining <= 0) return { ok: false as const, code: 'LIMIT_REACHED' as const, status: current };
      if (current.activeAttempt) return { ok: false as const, code: 'ACTIVE_ATTEMPT' as const, status: current };
      const attemptId = randomUUID();
      const expiresAt = now + REWARDED_AD_ATTEMPT_LIFETIME_MS;
      this.database.prepare(`INSERT INTO rewarded_ad_attempts
        (attempt_id,pilot_id,provider,platform,ad_unit_id,status,created_at,expires_at,window_started_at,updated_at)
        VALUES(?,?,'ADMOB',?,?,'CREATED',?,?,?,?)`).run(
          attemptId, pilotId, platform, adUnitId, now, expiresAt, current.windowStartedAt ?? null, now,
        );
      const status = this.statusWithinTransaction(pilotId, platform, now);
      return {
        ok: true as const,
        attempt: { attemptId, provider: 'ADMOB' as const, platform, adUnitId, customData: attemptId, expiresAt, rewardCredits: REWARDED_AD_CREDITS },
        status,
      };
    });
  }

  recordClientEvent(pilotId: string, attemptId: string, event: RewardedAdClientEvent, now = Date.now()): RewardedAdStatus | undefined {
    if (!referencePattern.test(attemptId)) return undefined;
    return this.wallet.transaction(() => {
      const attempt = this.attempt(attemptId);
      if (!attempt || attempt.pilot_id !== pilotId) return undefined;
      this.expireAttempts(pilotId, now);
      const current = this.attempt(attemptId)!;
      const next = this.clientTransition(current.status, event);
      if (next !== current.status) {
        this.database.prepare('UPDATE rewarded_ad_attempts SET status=?,updated_at=? WHERE attempt_id=? AND pilot_id=?')
          .run(next, now, attemptId, pilotId);
      }
      return this.statusWithinTransaction(pilotId, current.platform, now);
    });
  }

  attemptStatus(pilotId: string, attemptId: string, now = Date.now()): { attemptStatus: RewardedAdAttemptStatus; status: RewardedAdStatus } | undefined {
    if (!referencePattern.test(attemptId)) return undefined;
    return this.wallet.transaction(() => {
      const attempt = this.attempt(attemptId);
      if (!attempt || attempt.pilot_id !== pilotId) return undefined;
      this.expireAttempts(pilotId, now);
      const current = this.attempt(attemptId)!;
      return { attemptStatus: current.status, status: this.statusWithinTransaction(pilotId, current.platform, now) };
    });
  }

  grantVerifiedReward(reward: VerifiedAdMobReward, now = Date.now()): { ok: boolean; duplicate: boolean; rewarded: boolean; pilotId?: string; attemptId?: string; platform?: RewardedAdPlatform; code?: string } {
    const timestamp = normalizeProviderTimestamp(reward.timestamp);
    if (!referencePattern.test(reward.customData) || !referencePattern.test(reward.transactionId) || !Number.isSafeInteger(timestamp)) {
      return { ok: false, duplicate: false, rewarded: false, code: 'INVALID_CALLBACK' };
    }
    return this.wallet.transaction((wallet) => {
      const prior = this.database.prepare(`SELECT transaction_id,attempt_id FROM rewarded_ad_provider_transactions
        WHERE provider='ADMOB' AND transaction_id=?`).get(reward.transactionId) as { transaction_id: string; attempt_id: string } | undefined;
      if (prior) {
        const existing = this.attempt(prior.attempt_id);
        const matches = existing?.attempt_id === reward.customData && existing.provider_transaction_id === reward.transactionId;
        return { ok: Boolean(matches), duplicate: true, rewarded: existing?.status === 'REWARDED', pilotId: existing?.pilot_id, attemptId: existing?.attempt_id, platform: existing?.platform, code: matches ? undefined : 'TRANSACTION_MISMATCH' };
      }

      const attempt = this.attempt(reward.customData);
      if (!attempt || attempt.provider !== 'ADMOB') return { ok: false, duplicate: false, rewarded: false, code: 'UNKNOWN_ATTEMPT' };
      const platformConfig = this.platformConfiguration(attempt.platform);
      if (!this.configuration.enabled || !platformConfig?.enabled || !platformConfig.adUnitId ||
          !providerAdUnitMatches(attempt.ad_unit_id, reward.adUnit) || attempt.ad_unit_id !== platformConfig.adUnitId ||
          reward.rewardAmount !== this.configuration.providerRewardAmount ||
          (this.configuration.providerRewardItem && reward.rewardItem !== this.configuration.providerRewardItem)) {
        return { ok: false, duplicate: false, rewarded: false, pilotId: attempt.pilot_id, attemptId: attempt.attempt_id, code: 'PROVIDER_MISMATCH' };
      }
      if (!['CREATED', 'AD_STARTED', 'PENDING_VERIFICATION'].includes(attempt.status) || now > attempt.expires_at ||
          timestamp < attempt.created_at - callbackClockToleranceMs || timestamp > attempt.expires_at || timestamp > now + callbackClockToleranceMs) {
        return { ok: false, duplicate: false, rewarded: false, pilotId: attempt.pilot_id, attemptId: attempt.attempt_id, code: 'ATTEMPT_NOT_ELIGIBLE' };
      }

      const window = this.windowState(attempt.pilot_id, now);
      if (window.count >= REWARDED_AD_MAX_REWARDS) {
        return { ok: false, duplicate: false, rewarded: false, pilotId: attempt.pilot_id, attemptId: attempt.attempt_id, code: 'LIMIT_REACHED' };
      }
      const walletResult = wallet.credit({
        pilotId: attempt.pilot_id,
        currency: 'CREDITS',
        amount: REWARDED_AD_CREDITS,
        reason: 'REWARDED_AD',
        idempotencyKey: `rewarded-ad:${reward.transactionId}`,
        referenceId: attempt.attempt_id,
        context: { provider: 'ADMOB', platform: attempt.platform, adUnit: attempt.ad_unit_id },
        createdAt: now,
      });
      if (!walletResult.ok || !walletResult.applied || !walletResult.transactionId) throw new Error('Rewarded ad wallet grant failed');

      const windowStartedAt = window.startedAt ?? now;
      this.database.prepare(`INSERT INTO rewarded_ad_provider_transactions(provider,transaction_id,attempt_id,received_at)
        VALUES('ADMOB',?,?,?)`).run(reward.transactionId, attempt.attempt_id, now);
      this.database.prepare(`UPDATE rewarded_ad_attempts SET status='REWARDED',provider_transaction_id=?,wallet_transaction_id=?,verified_at=?,updated_at=?
        WHERE attempt_id=? AND status IN (${activeAttemptStatuses})`).run(reward.transactionId, walletResult.transactionId, now, now, attempt.attempt_id);
      this.database.prepare(`INSERT INTO rewarded_ad_windows(pilot_id,window_started_at,successful_count,updated_at) VALUES(?,?,1,?)
        ON CONFLICT(pilot_id) DO UPDATE SET window_started_at=excluded.window_started_at,successful_count=?,updated_at=excluded.updated_at`)
        .run(attempt.pilot_id, windowStartedAt, now, window.count + 1);
      return { ok: true, duplicate: false, rewarded: true, pilotId: attempt.pilot_id, attemptId: attempt.attempt_id, platform: attempt.platform };
    });
  }

  private clientTransition(status: RewardedAdAttemptStatus, event: RewardedAdClientEvent): RewardedAdAttemptStatus {
    if (status === 'REWARDED' || status === 'EXPIRED' || status === 'CLOSED_WITHOUT_REWARD' || status === 'FAILED') return status;
    if (event === 'qualified') return 'PENDING_VERIFICATION';
    if (event === 'started' && status === 'CREATED') return 'AD_STARTED';
    if (event === 'closed' && status !== 'PENDING_VERIFICATION') return 'CLOSED_WITHOUT_REWARD';
    if (event === 'failed' && status !== 'PENDING_VERIFICATION') return 'FAILED';
    return status;
  }

  private platformConfiguration(platform: RewardedAdPlatform): PlatformConfiguration | undefined {
    return platform === 'ios' ? this.configuration.ios : platform === 'android' ? this.configuration.android : undefined;
  }

  private unsupported(platform: RewardedAdPlatform, now: number): RewardedAdStatus {
    return { supported: false, platform, rewardCredits: REWARDED_AD_CREDITS, maxRewards: REWARDED_AD_MAX_REWARDS, remaining: 0, serverNow: now };
  }

  private profileExists(pilotId: string): boolean {
    return Boolean(this.database.prepare('SELECT 1 FROM player_profiles WHERE pilot_id=?').get(pilotId));
  }

  private attempt(attemptId: string): AttemptRow | undefined {
    return this.database.prepare('SELECT * FROM rewarded_ad_attempts WHERE attempt_id=?').get(attemptId) as AttemptRow | undefined;
  }

  private expireAttempts(pilotId: string, now: number): void {
    this.database.prepare(`UPDATE rewarded_ad_attempts SET status='EXPIRED',updated_at=?
      WHERE pilot_id=? AND status IN (${activeAttemptStatuses}) AND expires_at<=?`).run(now, pilotId, now);
  }

  private windowState(pilotId: string, now: number): { startedAt?: number; count: number } {
    this.database.prepare('INSERT OR IGNORE INTO rewarded_ad_windows(pilot_id,window_started_at,successful_count,updated_at) VALUES(?,NULL,0,?)').run(pilotId, now);
    let row = this.database.prepare('SELECT window_started_at,successful_count FROM rewarded_ad_windows WHERE pilot_id=?').get(pilotId) as { window_started_at?: number; successful_count: number };
    if (Number.isSafeInteger(row.window_started_at) && now >= row.window_started_at! + REWARDED_AD_WINDOW_MS) {
      this.database.prepare('UPDATE rewarded_ad_windows SET window_started_at=NULL,successful_count=0,updated_at=? WHERE pilot_id=?').run(now, pilotId);
      row = { successful_count: 0 };
    }
    return { startedAt: Number.isSafeInteger(row.window_started_at) ? row.window_started_at : undefined, count: Math.max(0, Math.min(REWARDED_AD_MAX_REWARDS, row.successful_count)) };
  }

  private statusWithinTransaction(pilotId: string, platform: RewardedAdPlatform, now: number): RewardedAdStatus {
    this.expireAttempts(pilotId, now);
    const window = this.windowState(pilotId, now);
    const active = this.database.prepare(`SELECT attempt_id,status,expires_at FROM rewarded_ad_attempts
      WHERE pilot_id=? AND status IN (${activeAttemptStatuses}) ORDER BY created_at DESC LIMIT 1`).get(pilotId) as { attempt_id: string; status: RewardedAdAttemptStatus; expires_at: number } | undefined;
    return {
      supported: true,
      provider: 'ADMOB',
      platform,
      rewardCredits: REWARDED_AD_CREDITS,
      maxRewards: REWARDED_AD_MAX_REWARDS,
      remaining: REWARDED_AD_MAX_REWARDS - window.count,
      windowStartedAt: window.startedAt,
      windowEndsAt: window.startedAt === undefined ? undefined : window.startedAt + REWARDED_AD_WINDOW_MS,
      activeAttempt: active ? { attemptId: active.attempt_id, status: active.status, expiresAt: active.expires_at } : undefined,
      serverNow: now,
    };
  }
}

type AdMobKey = { keyId: number; pem: string };
type AdMobKeysPayload = { keys?: AdMobKey[] };
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function decodeBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid callback signature encoding');
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='), 'base64');
}

export class AdMobSsvVerifier {
  private cachedKeys?: { fetchedAt: number; keys: Map<number, string> };

  constructor(private readonly fetcher: FetchLike = fetch) {}

  async verify(rawRequestUrl: string, now = Date.now()): Promise<VerifiedAdMobReward> {
    const queryStart = rawRequestUrl.indexOf('?');
    if (queryStart < 0) throw new Error('Missing callback query');
    const rawQuery = rawRequestUrl.slice(queryStart + 1);
    const signatureMarker = '&signature=';
    const signatureIndex = rawQuery.indexOf(signatureMarker);
    if (signatureIndex <= 0) throw new Error('Missing callback signature');
    const keyMarker = '&key_id=';
    const keyIndex = rawQuery.indexOf(keyMarker, signatureIndex + signatureMarker.length);
    if (keyIndex < 0 || rawQuery.indexOf('&', keyIndex + keyMarker.length) >= 0) throw new Error('Invalid callback signature fields');
    const content = rawQuery.slice(0, signatureIndex);
    const encodedSignature = rawQuery.slice(signatureIndex + signatureMarker.length, keyIndex);
    const keyIdText = rawQuery.slice(keyIndex + keyMarker.length);
    if (!/^\d{1,20}$/.test(keyIdText)) throw new Error('Invalid callback key');
    const keyId = Number(keyIdText);
    if (!Number.isSafeInteger(keyId)) throw new Error('Invalid callback key');

    let keys = await this.keys(now, false);
    if (!keys.has(keyId)) keys = await this.keys(now, true);
    const pem = keys.get(keyId);
    if (!pem) throw new Error('Unknown callback key');
    const valid = verifySignature('sha256', Buffer.from(content, 'utf8'), createPublicKey(pem), decodeBase64Url(encodedSignature));
    if (!valid) throw new Error('Invalid callback signature');

    const parameters = new URLSearchParams(content);
    const adUnit = parameters.get('ad_unit') ?? '';
    const customData = parameters.get('custom_data') ?? '';
    const rewardAmount = parameters.get('reward_amount') ?? '';
    const rewardItem = parameters.get('reward_item') ?? '';
    const timestampText = parameters.get('timestamp') ?? '';
    const transactionId = parameters.get('transaction_id') ?? '';
    if (!adUnit || !customData || !rewardAmount || !timestampText || !transactionId || !/^\d+$/.test(timestampText)) throw new Error('Incomplete callback');
    const timestamp = Number(timestampText);
    if (!Number.isSafeInteger(timestamp)) throw new Error('Invalid callback timestamp');
    return { adUnit, customData, rewardAmount, rewardItem, timestamp, transactionId };
  }

  private async keys(now: number, force: boolean): Promise<Map<number, string>> {
    if (!force && this.cachedKeys && now - this.cachedKeys.fetchedAt < keyCacheLifetimeMs) return this.cachedKeys.keys;
    const response = await this.fetcher(admobVerificationKeysUrl, { signal: AbortSignal.timeout(5_000), headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Unable to retrieve callback keys');
    const payload = await response.json() as AdMobKeysPayload;
    const keys = new Map<number, string>();
    for (const key of payload.keys ?? []) {
      if (Number.isSafeInteger(key.keyId) && typeof key.pem === 'string' && key.pem.includes('BEGIN PUBLIC KEY')) keys.set(key.keyId, key.pem);
    }
    if (keys.size === 0) throw new Error('No callback keys available');
    this.cachedKeys = { fetchedAt: now, keys };
    return keys;
  }
}
