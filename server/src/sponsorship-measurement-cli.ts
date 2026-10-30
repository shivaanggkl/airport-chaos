import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SponsorshipManagementStore } from './sponsorship-management.js';
import { SponsorshipReportStore } from './sponsorship-delivery.js';
import { SponsorshipMeasurementStore, sponsorMeasurementCaveat } from './sponsorship-measurement.js';

const db = process.env.AIRPORT_CHAOS_PROFILE_DB ?? resolve(fileURLToPath(new URL('../data/player-profiles.sqlite', import.meta.url)));
const management = new SponsorshipManagementStore(db, { assetRoot: process.env.AIRPORT_CHAOS_SPONSOR_ASSET_ROOT });
const reports = new SponsorshipReportStore(db);
const measurements = new SponsorshipMeasurementStore(db);
const [action, campaignId, fromArg, toArg, format = 'text'] = process.argv.slice(2);
const today = new Date().toISOString().slice(0, 10);
const from = fromArg ?? new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
const to = toArg ?? today;
const csv = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
try {
  if (action === 'report' && campaignId && ['text','json','csv'].includes(format)) {
    const campaign = management.getCampaign(campaignId);
    if (!campaign) throw new Error('Campaign not found');
    const advertiser = management.getAdvertiser(campaign.advertiserId);
    const rows = measurements.daily(campaignId, from, to);
    const reportCounts = measurements.reportCounts(campaignId);
    const totals = Object.fromEntries(['HUB_ESTIMATED_EXPOSURE','WORLD_ESTIMATED_EXPOSURE','SPONSOR_DETAILS_OPEN','SPONSOR_WEBSITE_ACTION'].map(type =>
      [type, rows.filter(row => row.type === type).reduce((sum, row) => sum + row.count, 0)]));
    const summary = { advertiser: advertiser?.companyName ?? 'Unknown', campaignId, campaignStatus: campaign.status,
      startsAt: campaign.startsAt, endsAt: campaign.endsAt, dateRange: { from, to },
      assignments: management.listAssignments(campaignId).map(item => ({ placementId: item.placementId, city: item.city, surface: item.surface })),
      totals, reports: reportCounts, daily: rows, caveat: sponsorMeasurementCaveat,
      noDataExplanation: rows.length ? undefined : 'No events were recorded in this range; this does not establish that no players saw the sponsorship. Check whether QA measurement was enabled.' };
    if (format === 'json') console.log(JSON.stringify(summary, null, 2));
    else if (format === 'csv') {
      console.log('date,advertiser,campaignId,creativeId,placementId,cityId,platform,type,count');
      for (const row of rows) console.log([row.date, summary.advertiser, row.campaignId, row.creativeId, row.placementId, row.cityId, row.platform, row.type, row.count].map(csv).join(','));
      console.log(`# ${sponsorMeasurementCaveat}`);
    } else {
      console.log(`${summary.advertiser} · ${campaignId} · ${campaign.status} · ${from} to ${to}`);
      console.log(`Schedule: ${campaign.startsAt} to ${campaign.endsAt}`);
      console.log(`Placements: ${summary.assignments.map(item => `${item.city}/${item.placementId}`).join(', ')}`);
      for (const [type, count] of Object.entries(totals)) console.log(`${type}: ${count}`);
      console.log(`Sponsor reports: ${reportCounts.total} (${reportCounts.open} open); reasons: ${JSON.stringify(reportCounts.reasons)}`);
      if (summary.noDataExplanation) console.log(summary.noDataExplanation);
      console.log(sponsorMeasurementCaveat);
    }
  } else if (action === 'moderation') {
    const limit = campaignId === undefined ? 25 : Number(campaignId);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid limit');
    const open = reports.listOpen(limit);
    console.table(open.map(item => ({ reportId: item.id, campaignId: item.campaignId, creativeId: item.creativeId,
      reason: item.reason, advertiser: management.getAdvertiser(management.getCampaign(item.campaignId)?.advertiserId ?? '')?.companyName ?? 'Unknown',
      campaignStatus: management.getCampaign(item.campaignId)?.status ?? 'Unknown', createdAt: item.createdAt })));
    console.log('Use sponsorship-reports-cli view/review/resolve, sponsorship-management-cli campaign pause or creative disable, then audit record. Player reports do not automatically suspend sponsors.');
  } else throw new Error('Usage: sponsorship-measurement-cli report <campaign-id> [from-YYYY-MM-DD] [to-YYYY-MM-DD] [text|json|csv] | moderation [limit]');
} catch (error) { console.error(error instanceof Error ? error.message : 'Reporting failed'); process.exitCode = 1; }
finally { measurements.close(); reports.close(); management.close(); }
