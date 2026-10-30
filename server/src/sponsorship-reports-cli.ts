import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SponsorshipReportStore } from './sponsorship-delivery.js';

const path = process.env.AIRPORT_CHAOS_PROFILE_DB ?? resolve(fileURLToPath(new URL('../data/player-profiles.sqlite', import.meta.url)));
const store = new SponsorshipReportStore(path);
const [action, ...args] = process.argv.slice(2);
try {
  if (action === 'list') {
    const limit = args[0] === undefined ? 25 : Number(args[0]);
    const offset = args[1] === undefined ? 0 : Number(args[1]);
    console.table(store.list(limit, offset).map(({ id, campaignId, creativeId, reason, status, createdAt }) => ({ id, campaignId, creativeId, reason, status, createdAt })));
  } else if (action === 'view' && args[0]) console.log(JSON.stringify(store.get(args[0]) ?? null, null, 2));
  else if (action === 'review' && args[0]) console.log(JSON.stringify(store.setStatus(args[0], 'REVIEWED'), null, 2));
  else if (action === 'resolve' && args[0]) console.log(JSON.stringify(store.setStatus(args[0], 'RESOLVED'), null, 2));
  else throw new Error('Usage: sponsorship-reports-cli list [limit] [offset] | view|review|resolve <report-id>');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Report operation failed');
  process.exitCode = 1;
} finally { store.close(); }
