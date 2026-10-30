import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SponsorshipInquiryStore } from './sponsorship-inquiries.js';

const [command, id, nextStatus] = process.argv.slice(2);
if (!['list', 'view', 'status'].includes(command ?? '') ||
  ((command === 'view' || command === 'status') && !id) ||
  (command === 'status' && !['CONTACTED', 'CLOSED', 'SPAM'].includes(nextStatus ?? ''))) {
  console.error('Usage: inquiries list [limit] | view <id> | status <id> CONTACTED|CLOSED|SPAM');
  process.exitCode = 2;
} else {
  const dbPath = process.env.AIRPORT_CHAOS_PROFILE_DB ?? resolve(fileURLToPath(new URL('../data/player-profiles.sqlite', import.meta.url)));
  const store = new SponsorshipInquiryStore(dbPath);
  try {
    if (command === 'list') {
      const limit = Math.max(1, Math.min(100, Number(id) || 25));
      console.table(store.list(limit).map(({ id, companyName, interest, createdAt, status }) => ({ id, companyName, interest, createdAt, status })));
    } else if (command === 'view') {
      const inquiry = store.get(id!);
      if (!inquiry) { console.error('Inquiry not found.'); process.exitCode = 1; }
      else console.log(JSON.stringify(inquiry, null, 2));
    } else {
      const updated = store.updateStatus(id!, nextStatus as 'CONTACTED' | 'CLOSED' | 'SPAM');
      if (!updated) { console.error('Inquiry not found.'); process.exitCode = 1; }
      else console.log('Status updated.');
    }
  } finally { store.close(); }
}
