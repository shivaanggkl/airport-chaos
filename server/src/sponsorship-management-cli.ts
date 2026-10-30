import { readFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SponsorshipManagementStore } from './sponsorship-management.js';

const [entity, action, ...args] = process.argv.slice(2);
const usage = `Usage: sponsor <entity> <action> [arguments]
  advertiser create <company> [https-website] [inquiry-id]
  advertiser list [limit] [offset] | view <id> | approve|suspend|reject <id> [note]
  advertiser public-info <id> <description> <listed:on|off>
  creative register <advertiser-id> <local-filename> <placement-id> [display-name] [tagline]
  creative list <advertiser-id> [limit] [offset] | view|validate|approve|reject|disable <id> [note]
  campaign create <advertiser-id> <title> <start-UTC> <end-UTC>
  campaign list [limit] [offset] | view <id> | edit <id> title|start|end <value>
  campaign review|approve|pause|cancel <id> [note] | preview <id> <test-UTC> | conflicts <id>
  campaign delivery <id> on|off (isolated QA serving only)
  campaign readiness <id> [UTC] | release <id> <evidence-json-file> reviewed|qa-simulated | revoke-release <id>
  assignment add <campaign-id> <creative-id> <placement-id> | list <campaign-id>
  assignment change <assignment-id> <creative-id> | remove <assignment-id>
  audit list [limit] [offset] | record <record-id> [limit] [offset]`;
const dbPath = process.env.AIRPORT_CHAOS_PROFILE_DB ?? resolve(fileURLToPath(new URL('../data/player-profiles.sqlite', import.meta.url)));
const store = new SponsorshipManagementStore(dbPath, { assetRoot: process.env.AIRPORT_CHAOS_SPONSOR_ASSET_ROOT });
const actor = `host-shell:${userInfo().username}`;
const number = (value: string | undefined, fallback: number) => value === undefined ? fallback : Number(value);
const show = (value: unknown) => console.log(JSON.stringify(value, null, 2));
try {
  if (entity === 'advertiser') {
    if (action === 'create') show(store.createAdvertiser({ companyName: args[0], website: args[1], inquiryId: args[2] }, actor));
    else if (action === 'list') console.table(store.listAdvertisers(number(args[0], 25), number(args[1], 0)).map(({ id, companyName, status, createdAt }) => ({ id, companyName, status, createdAt })));
    else if (action === 'view') show(store.getAdvertiser(args[0]));
    else if (action === 'public-info' && ['on','off'].includes(args[2])) show(store.setAdvertiserPublicInfo(args[0], args[1], args[2] === 'on', actor));
    else if (['approve','suspend','reject'].includes(action ?? '')) show(store.setAdvertiserStatus(args[0], ({ approve: 'APPROVED', suspend: 'SUSPENDED', reject: 'REJECTED' } as const)[action as 'approve'|'suspend'|'reject'], args[1] ?? null, actor));
    else throw new Error(usage);
  } else if (entity === 'creative') {
    if (action === 'register') show(store.registerCreative({ advertiserId: args[0], assetRef: args[1], targetPlacementId: args[2], displayName: args[3], tagline: args[4] }, actor));
    else if (action === 'list') console.table(store.listCreatives(args[0], number(args[1], 25), number(args[2], 0)).map(({ id, advertiserId, targetPlacementId, status, sha256 }) => ({ id, advertiserId, targetPlacementId, status, sha256 })));
    else if (action === 'view') show(store.getCreative(args[0]));
    else if (action === 'validate') show({ valid: store.validateCreative(args[0]) });
    else if (['approve','reject','disable'].includes(action ?? '')) show(store.setCreativeStatus(args[0], ({ approve: 'APPROVED', reject: 'REJECTED', disable: 'DISABLED' } as const)[action as 'approve'|'reject'|'disable'], args[1] ?? null, actor));
    else throw new Error(usage);
  } else if (entity === 'campaign') {
    if (action === 'create') show(store.createCampaign({ advertiserId: args[0], title: args[1], startsAt: args[2], endsAt: args[3] }, actor));
    else if (action === 'list') console.table(store.listCampaigns(number(args[0], 25), number(args[1], 0)).map(({ id, advertiserId, title, status, startsAt, endsAt }) => ({ id, advertiserId, title, status, startsAt, endsAt })));
    else if (action === 'view') show({ campaign: store.getCampaign(args[0]), assignments: store.listAssignments(args[0]) });
    else if (action === 'edit') {
      const field = args[1];
      if (!['title','start','end'].includes(field)) throw new Error(usage);
      show(store.editCampaign(args[0], field === 'title' ? { title: args[2] } : field === 'start' ? { startsAt: args[2] } : { endsAt: args[2] }, actor));
    } else if (['review','approve','pause','cancel'].includes(action ?? '')) {
      const status = ({ review: 'IN_REVIEW', approve: 'APPROVED', pause: 'PAUSED', cancel: 'CANCELLED' } as const)[action as 'review'|'approve'|'pause'|'cancel'];
      show(store.setCampaignStatus(args[0], status, args[1] ?? null, actor));
    } else if (action === 'preview') show(store.preview(args[0], args[1]));
    else if (action === 'readiness') show(store.commercialReadiness(args[0], args[1]));
    else if (action === 'release' && ['reviewed','qa-simulated'].includes(args[2])) {
      const bytes = readFileSync(args[1]);
      if (bytes.length > 4096) throw new Error('Evidence file too large');
      store.recordCommercialRelease(args[0], JSON.parse(bytes.toString('utf8')), args[2] === 'qa-simulated', actor);
      show(store.commercialReadiness(args[0]));
    } else if (action === 'revoke-release') { store.revokeCommercialRelease(args[0], actor); show(store.commercialReadiness(args[0])); }
    else if (action === 'conflicts') show(store.conflicts(args[0]));
    else if (action === 'delivery' && ['on','off'].includes(args[1])) show(store.setCampaignDeliveryApproval(args[0], args[1] === 'on', actor));
    else throw new Error(usage);
  } else if (entity === 'assignment') {
    if (action === 'add') show(store.addAssignment(args[0], args[1], args[2], actor));
    else if (action === 'list') show(store.listAssignments(args[0]));
    else if (action === 'change') show(store.changeAssignment(args[0], args[1], actor));
    else if (action === 'remove') { store.removeAssignment(args[0], actor); show({ removed: true }); }
    else throw new Error(usage);
  } else if (entity === 'audit') {
    if (action === 'list') show(store.auditEvents(number(args[0], 25), number(args[1], 0)));
    else if (action === 'record') show(store.auditEvents(number(args[1], 25), number(args[2], 0), args[0]));
    else throw new Error(usage);
  } else throw new Error(usage);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Management operation failed');
  process.exitCode = 1;
} finally { store.close(); }
