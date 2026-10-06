#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';

const [databasePath, provider, reference] = process.argv.slice(2);
if (!databasePath || !['stripe', 'apple', 'google'].includes(provider) || !reference) {
  console.error('Usage: node scripts/inspect-sky-token-purchase.mjs <profile-db> <stripe|apple|google> <provider-transaction-id>');
  process.exitCode = 2;
} else {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const purchase = database.prepare(`SELECT provider,provider_transaction_id,pilot_id,account_id,pack_id,product_id,
      quantity,amount_cents,currency,environment,status,refunded_quantity,wallet_transaction_id,purchased_at,updated_at
      FROM sky_token_purchases WHERE provider=? AND provider_transaction_id=?`).get(provider, reference);
    if (!purchase) {
      console.error('No Sky Token purchase found for that provider transaction.');
      process.exitCode = 1;
    } else {
      const ledger = database.prepare(`SELECT transaction_id,direction,amount,balance_after,reason,reference_id,created_at
        FROM wallet_transactions WHERE pilot_id=? AND currency='SKY_TOKENS'
        AND (transaction_id=? OR (reason='SKY_TOKEN_REFUND' AND reference_id=?)) ORDER BY created_at`)
        .all(purchase.pilot_id, purchase.wallet_transaction_id, reference.slice(0, 160));
      const wallet = database.prepare('SELECT sky_tokens,sky_token_deficit FROM player_profiles WHERE pilot_id=?').get(purchase.pilot_id);
      console.log(JSON.stringify({ purchase, ledger, wallet }, null, 2));
    }
  } finally {
    database.close();
  }
}
