import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export const walletCurrencies = ['CREDITS', 'SKY_TOKENS'] as const;
export type WalletCurrency = typeof walletCurrencies[number];

export const walletTransactionReasons = [
  'FLIGHT_REWARD',
  'MISSION_REWARD',
  'LANDING_REWARD',
  'COMBAT_REWARD',
  'CHALLENGE_REWARD',
  'EVENT_REWARD',
  'TERRITORY_REWARD',
  'OBJECTIVE_REWARD',
  'DISCOVERY_REWARD',
  'INTERCITY_REWARD',
  'SEASON_REWARD',
  'WEEKLY_REWARD',
  'AIRCRAFT_PURCHASE',
  'COSMETIC_PURCHASE',
  'DAILY_REWARD',
  'REWARDED_AD',
  'REFERRAL_INVITER',
  'REFERRAL_NEW_PLAYER',
  'SKY_TOKEN_PURCHASE',
  'SKY_TOKEN_SPEND',
  'SKY_TOKEN_REFUND',
  'ADMIN_ADJUSTMENT',
  'MIGRATION',
] as const;
export type WalletTransactionReason = typeof walletTransactionReasons[number];

export type WalletBalances = Readonly<{ credits: number; skyTokens: number }>;
export type WalletMutationRequest = Readonly<{
  pilotId: string;
  currency: WalletCurrency;
  amount: number;
  reason: WalletTransactionReason;
  idempotencyKey?: string;
  referenceId?: string;
  context?: Readonly<Record<string, string | number | boolean | null>>;
  createdAt?: number;
}>;
export type WalletMutationResult = Readonly<{
  ok: boolean;
  applied: boolean;
  duplicate: boolean;
  balance?: number;
  transactionId?: string;
  code?: 'PROFILE_NOT_FOUND' | 'INVALID_MUTATION' | 'INSUFFICIENT_FUNDS';
}>;

const maximumBalance: Readonly<Record<WalletCurrency, number>> = {
  CREDITS: 1_000_000,
  SKY_TOKENS: 1_000_000_000,
};
const maximumMutationAmount = 1_000_000;
const reasonSet = new Set<string>(walletTransactionReasons);
const currencySet = new Set<string>(walletCurrencies);
const safeReferencePattern = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,159}$/;

function currencyColumn(currency: WalletCurrency): 'credits' | 'sky_tokens' {
  return currency === 'CREDITS' ? 'credits' : 'sky_tokens';
}

function validRequest(request: WalletMutationRequest): boolean {
  return typeof request.pilotId === 'string' && request.pilotId.length > 0 && request.pilotId.length <= 160 &&
    currencySet.has(request.currency) && reasonSet.has(request.reason) && Number.isSafeInteger(request.amount) &&
    request.amount > 0 && request.amount <= maximumMutationAmount &&
    (request.idempotencyKey === undefined || safeReferencePattern.test(request.idempotencyKey)) &&
    (request.referenceId === undefined || safeReferencePattern.test(request.referenceId)) &&
    (request.createdAt === undefined || (Number.isSafeInteger(request.createdAt) && request.createdAt >= 0));
}

function encodedContext(context: WalletMutationRequest['context']): string | null {
  if (!context) return null;
  const encoded = JSON.stringify(context);
  if (encoded.length > 2_000) throw new Error('Wallet context exceeds 2,000 bytes');
  return encoded;
}

class WalletTransaction {
  constructor(private readonly database: DatabaseSync) {}

  balances(pilotId: string): WalletBalances | undefined {
    const row = this.database.prepare('SELECT credits, sky_tokens FROM player_profiles WHERE pilot_id = ?')
      .get(pilotId) as { credits: number; sky_tokens: number } | undefined;
    if (!row || !Number.isSafeInteger(row.credits) || !Number.isSafeInteger(row.sky_tokens) || row.credits < 0 || row.sky_tokens < 0) return undefined;
    return { credits: row.credits, skyTokens: row.sky_tokens };
  }

  credit(request: WalletMutationRequest): WalletMutationResult {
    return this.mutate('CREDIT', request);
  }

  debit(request: WalletMutationRequest): WalletMutationResult {
    return this.mutate('DEBIT', request);
  }

  private mutate(direction: 'CREDIT' | 'DEBIT', request: WalletMutationRequest): WalletMutationResult {
    if (!validRequest(request)) return { ok: false, applied: false, duplicate: false, code: 'INVALID_MUTATION' };
    if (request.idempotencyKey) {
      const prior = this.database.prepare(`SELECT currency, direction, requested_amount, result, balance_after, transaction_id FROM wallet_idempotency_receipts
        WHERE pilot_id = ? AND idempotency_key = ?`).get(request.pilotId, request.idempotencyKey) as
        { currency: string; direction: string; requested_amount: number; result: string; balance_after: number; transaction_id?: string } | undefined;
      if (prior) {
        if (prior.currency !== request.currency || prior.direction !== direction || prior.requested_amount !== request.amount) {
          return { ok: false, applied: false, duplicate: true, code: 'INVALID_MUTATION' };
        }
        return {
          ok: true,
          applied: prior.result === 'APPLIED',
          duplicate: true,
          balance: prior.balance_after,
          transactionId: prior.transaction_id ?? undefined,
        };
      }
    }

    const balances = this.balances(request.pilotId);
    if (!balances) return { ok: false, applied: false, duplicate: false, code: 'PROFILE_NOT_FOUND' };
    const column = currencyColumn(request.currency);
    const before = request.currency === 'CREDITS' ? balances.credits : balances.skyTokens;
    if (direction === 'DEBIT' && before < request.amount) {
      return { ok: false, applied: false, duplicate: false, balance: before, code: 'INSUFFICIENT_FUNDS' };
    }
    const after = direction === 'CREDIT'
      ? Math.min(maximumBalance[request.currency], before + request.amount)
      : before - request.amount;
    const committedAmount = Math.abs(after - before);
    const createdAt = request.createdAt ?? Date.now();
    if (!Number.isSafeInteger(after) || after < 0) return { ok: false, applied: false, duplicate: false, code: 'INVALID_MUTATION' };

    if (committedAmount === 0) {
      if (request.idempotencyKey) {
        this.database.prepare(`INSERT INTO wallet_idempotency_receipts
          (pilot_id,idempotency_key,currency,direction,requested_amount,result,balance_after,created_at)
          VALUES (?,?,?,?,?,'NO_CHANGE',?,?)`)
          .run(request.pilotId, request.idempotencyKey, request.currency, direction, request.amount, after, createdAt);
      }
      return { ok: true, applied: false, duplicate: false, balance: after };
    }

    const updated = this.database.prepare(`UPDATE player_profiles SET ${column} = ? WHERE pilot_id = ? AND ${column} = ?`)
      .run(after, request.pilotId, before);
    if (updated.changes !== 1) throw new Error('Concurrent wallet mutation was not serialized');
    const transactionId = randomUUID();
    this.database.prepare(`INSERT INTO wallet_transactions
      (transaction_id,pilot_id,currency,direction,amount,balance_after,reason,reference_id,idempotency_key,context_json,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(
        transactionId, request.pilotId, request.currency, direction, committedAmount, after, request.reason,
        request.referenceId ?? null, request.idempotencyKey ?? null, encodedContext(request.context), createdAt,
      );
    if (request.idempotencyKey) {
      this.database.prepare(`INSERT INTO wallet_idempotency_receipts
        (pilot_id,idempotency_key,currency,direction,requested_amount,result,balance_after,transaction_id,created_at)
        VALUES (?,?,?,?,?,'APPLIED',?,?,?)`)
        .run(request.pilotId, request.idempotencyKey, request.currency, direction, request.amount, after, transactionId, createdAt);
    }
    return { ok: true, applied: true, duplicate: false, balance: after, transactionId };
  }
}

export class PlayerWallet {
  constructor(private readonly database: DatabaseSync) {
    this.initializeSchema();
  }

  private initializeSchema(): void {
    try { this.database.exec('ALTER TABLE player_profiles ADD COLUMN sky_tokens INTEGER NOT NULL DEFAULT 0 CHECK(sky_tokens >= 0)'); } catch { /* already migrated */ }
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        transaction_id TEXT PRIMARY KEY,
        pilot_id TEXT NOT NULL,
        currency TEXT NOT NULL CHECK(currency IN ('CREDITS','SKY_TOKENS')),
        direction TEXT NOT NULL CHECK(direction IN ('CREDIT','DEBIT')),
        amount INTEGER NOT NULL CHECK(amount > 0),
        balance_after INTEGER NOT NULL CHECK(balance_after >= 0),
        reason TEXT NOT NULL,
        reference_id TEXT,
        idempotency_key TEXT,
        context_json TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(pilot_id) REFERENCES player_profiles(pilot_id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_idempotency
        ON wallet_transactions (pilot_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS wallet_transactions_player_created
        ON wallet_transactions (pilot_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS wallet_transactions_currency_created
        ON wallet_transactions (currency, created_at, reason);
      CREATE TABLE IF NOT EXISTS wallet_idempotency_receipts (
        pilot_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        currency TEXT NOT NULL CHECK(currency IN ('CREDITS','SKY_TOKENS')),
        direction TEXT NOT NULL CHECK(direction IN ('CREDIT','DEBIT')),
        requested_amount INTEGER NOT NULL CHECK(requested_amount > 0),
        result TEXT NOT NULL CHECK(result IN ('APPLIED','NO_CHANGE')),
        balance_after INTEGER NOT NULL CHECK(balance_after >= 0),
        transaction_id TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (pilot_id, idempotency_key),
        FOREIGN KEY(pilot_id) REFERENCES player_profiles(pilot_id) ON DELETE RESTRICT,
        FOREIGN KEY(transaction_id) REFERENCES wallet_transactions(transaction_id) ON DELETE RESTRICT
      );
      CREATE TRIGGER IF NOT EXISTS player_profiles_wallet_non_negative_insert
        BEFORE INSERT ON player_profiles WHEN NEW.credits < 0 OR NEW.sky_tokens < 0
        BEGIN SELECT RAISE(ABORT, 'wallet balances cannot be negative'); END;
      CREATE TRIGGER IF NOT EXISTS player_profiles_wallet_non_negative_update
        BEFORE UPDATE OF credits, sky_tokens ON player_profiles WHEN NEW.credits < 0 OR NEW.sky_tokens < 0
        BEGIN SELECT RAISE(ABORT, 'wallet balances cannot be negative'); END;
    `);
  }

  balances(pilotId: string): WalletBalances | undefined {
    return new WalletTransaction(this.database).balances(pilotId);
  }

  credit(request: WalletMutationRequest): WalletMutationResult {
    return this.transaction((wallet) => wallet.credit(request));
  }

  debit(request: WalletMutationRequest): WalletMutationResult {
    return this.transaction((wallet) => wallet.debit(request));
  }

  transaction<T>(operation: (wallet: WalletTransaction) => T): T {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = operation(new WalletTransaction(this.database));
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      try { this.database.exec('ROLLBACK'); } catch { /* transaction already closed */ }
      throw error;
    }
  }
}
