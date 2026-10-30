# Advertising P7 — commercial readiness

Engineering verification in progress. Commercial launch **NOT AUTHORIZED**.

## Source and scope

`feature/advertising`, `95a6787e9b37de3f7a50922660f3004ee71ec957`. P0–P6 remain uncommitted. Separate `airport-chaos-sky-duel` QA checkout has 28 pre-existing modified/untracked entries and is not edited. P7 changes only the existing management service/CLI, one focused test file and P7 documentation/evidence. No client, catalog renderer, flight, wallet, purchase, authentication, native, geometry or inventory changes.

## Materials and operating controls

[One-page sales sheet PDF](advertising-p7-sales-sheet.pdf) ([editable HTML](advertising-p7-sales-sheet.html)) uses the existing optimized real Hub/DFW/Love Field images; no prices, invented traction, sponsors or guarantees. [Operator materials](advertising-p7-operations.md) include the proposal/order/contract-review template, creative submission/content checklist, manual invoicing/reconciliation SOP, incident/rollback and sponsor-shareable summary templates. All contractual language and actual business approvals require owner/counsel review.

Commercial evidence is stored separately from internal campaign approval and P4's local-QA delivery permission. Ten bounded reference fields, operator identity, timestamp, web scope and a binding fingerprint are recorded transactionally and audited. No contract/payment credentials or public fields are added. Material date/assignment/workflow changes remove evidence; changed advertiser/public branding or creative state makes evidence stale. The readiness CLI distinguishes technical eligibility, current schedule eligibility, recorded or simulated commercial evidence, and production serving denial. Simulated references are accepted only in explicit isolated nonproduction `/tmp` QA.

**P7 deliberately does not unlock production delivery.** Existing server gates still reject production/deployed QA serving even with all individual surface flags misconfigured. Internal APPROVED, `delivery on`, recorded evidence and a database row cannot independently make a real sponsor public. A separately authorized, reviewed production release is required after genuine external approvals. Ordinary clients have no management/release API. First-pilot evidence accepts one Hub assignment and exactly 30 days; world integration remains P5's isolated QA capability, not the first commercial pilot.

## Privacy and legal review — proposed text, NOT published

Compared against `server/src/legal-pages.ts` (October 5, 2026): current Privacy Notice mentions gameplay analytics and no advertising SDK, but does not explain P2 inquiries, P4 reports or P6 direct-sponsorship aggregates. Existing general Terms also lack direct-sponsorship disclosure and website-action treatment. The absence of a third-party SDK does not settle notice/consent/audience obligations. Do not change the published pages until approved.

Exact proposed additions/replacement for owner/counsel review:

> **Business sponsorship inquiries.** If you request sponsorship, we use the company name, optional contact name, work email, optional business website, selected interest and message you provide to review and respond to the inquiry and manage the resulting business relationship. Authorized operators can access these records. Do not send payment credentials or sensitive personal information through the form. Contact support@vadensoftware.com about access, correction or deletion requests; applicable rights and legal retention obligations will be assessed.

> **Direct sponsorships and measurement.** Approved sponsorships are identified as sponsored content. Where enabled following applicable review and any required notice or consent, Airport Chaos records first-party estimated exposures and deliberate Sponsor Details or permitted website actions. Daily totals are grouped by campaign, immutable creative, placement, city/global scope, server UTC date, event type and supported platform. These records do not contain player IDs, email addresses, precise flight coordinates, device fingerprints or persistent advertising identifiers. Temporary random event identifiers prevent duplicate counting and are retained for at most 48 hours. Exposure estimates are client-reported and are not independently audited advertising impressions. Aggregate campaign summaries may be shared with the relevant sponsor; player identities and raw gameplay sessions are not shared for this purpose. Existing gameplay analytics are a separate system.

> **Advertising concerns.** You can report an advertisement from Sponsor Details without providing a contact address. We retain the campaign/creative reference, selected reason, optional explanation, server timestamp and review state to investigate concerns and protect players. Do not include personal or sensitive information in an explanation. Authorized operators review reports; reports do not automatically suspend a sponsor.

> **Storage, choices and external sites.** Sponsorship collection remains disabled until approved disclosures and applicable audience/consent requirements are implemented. When sponsor website actions are separately permitted, a deliberate selection opens an approved HTTPS third-party site whose own policies apply; Airport Chaos does not append player identifiers to that destination. Contact support@vadensoftware.com about sponsorship data or withdrawal requests. Any required consent/withdrawal mechanism and legal basis must be specified before enabling collection; this draft does not implement or assert consent.

Proposed Terms addition:

> **Sponsorships.** Airport Chaos may display reviewed content labeled SPONSORED. A sponsorship does not constitute an endorsement of the sponsor's products or claims. Players may report concerns through Sponsor Details. Sponsor websites, if separately enabled, open only after a deliberate action and are governed by their operators' policies. Business sponsorship terms, fees, remedies and renewals are agreed separately; player currency and digital purchases do not purchase business advertising.

Retention proposals requiring approval: closed inquiries 12 months after closure; moderation reports 90 days subject to investigation/legal holds; daily aggregates 13 months. No automatic deletion/migration is added. Existing P2 retention and P6 48-hour temporary event deduplication are unchanged. Published policy must state the actually approved periods, rights, legal bases and any necessary parental/consent process; these drafts alone cannot enable collection.

### Current official policy references reviewed October 29, 2026

- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/): review Kids Category/ads, privacy/data handling and reporting inappropriate ads; native sponsorship remains unapproved.
- [Google Play Families](https://support.google.com/googleplay/android-developer/answer/9893335): target-audience and child-data/advertising requirements depend on the app's actual audience; no assumption that a direct-sponsor model removes obligations.
- [Google app declarations](https://support.google.com/googleplay/android-developer/answer/9859455): ads, target audience, privacy policy and data-practice declarations need reconciliation before native publication.
- [FTC native-advertising guidance](https://www.ftc.gov/business-guidance/resources/native-advertising-guide-businesses): preserve clear sponsorship labeling; human review must assess whether the overall presentation is misleading.
- [FTC COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions): expressly points to the April 22, 2025 amended Rule; counsel must use the current Rule rather than treating older FAQ examples as final clearance.

Unresolved: child-directed/mixed/general audience classification, COPPA and applicable state/international obligations, category suitability, published disclosures, measurement notice/consent, outbound links, native platform/payment treatment, actual agreement/payment and owner authorization. No legal approval is claimed.

## Production prerequisites — repository evidence versus unverified operations

`render.yaml` declares Node 22.22, `npm ci && npm run build`, `npm start`, `/health`, a 1 GiB disk mounted `/var/data`, DB `/var/data/player-profiles.sqlite`, and origin `https://fly.vadensoftware.com`. This verifies configuration intent only. No production host shell, private records or deployment was accessed or changed. Read-only public HTTPS requests returned 200 for /health, /advertise and /sponsors; this checks HTTP availability, not deployment version, business-page rendering or operational access.

Before go-live an authorized operator must verify: actual disk persistence and capacity; an approved backup plus restore drill; restricted shell access to compiled inquiry/management/report CLIs and the actual DB; ffmpeg/ffprobe on the host (not installed by this Blueprint); deployed immutable asset root/hash permissions; explicit production environment and all disabled gates; actual domain/TLS and unauthenticated /advertise and /sponsors refresh; secret-store access without client/log exposure; audit retention; error monitoring; expiry/restart recovery and emergency pause/client fallback. These remain unverified on production. A local successful CLI does not prove production access. Do not collect production inquiries before a secure retrieval process and approved notices exist.

No automatic backup job, provider integration, payment system or native change is introduced. Use the operator rollback SOP, preserving all campaign/audit records rather than destructive DB rollback.

## Verified isolated pilot rehearsal

**Engineering result: PASS. Commercial launch: NOT AUTHORIZED.** All business attestations in the rehearsal are explicitly TEST-ONLY; no real permission, payment or agreement is asserted.

An initial throwaway fixture was cancelled, then the actual rehearsal created a fake inquiry through the public same-host POST, retrieved it with the inquiry CLI and marked it CONTACTED. A new internal house-art advertiser referenced that inquiry. Advertiser and immutable local creative were approved, a 30-day Hub campaign was assigned/reviewed/approved, and readiness correctly returned missing commercial evidence. The restricted CLI then recorded simulated references in the isolated `/tmp` DB. Actual Chrome showed [Hub sponsor](advertising-p7-evidence/hub-qa.png), [Details](advertising-p7-evidence/details-qa.png), and a single [directory entry](advertising-p7-evidence/directory-qa.png). External website actions were absent. This is an internal QA identity, not a paying sponsor.

The first preview caught unsuitable centered-logo fixture artwork overlapping the text area. A new immutable house-art creative reserved the logo area; assignment change invalidated approval, and fresh review/release evidence was recorded. The Hub itself was not changed. The sales sheet image framing was also corrected to retain the existing house sponsorship banner.

A genuine browser report persisted and was marked REVIEWED using the existing restricted report CLI. A rapid second report was safely rejected by existing abuse/duplicate protection, without false success; the [duplicate-safe UI](advertising-p7-evidence/report-duplicate-safe.png) is retained. Historical aggregates remain tied to both immutable creative versions, not rewritten on replacement. [JSON](advertising-p7-evidence/campaign-summary.json) and [CSV](advertising-p7-evidence/campaign-summary.csv) exports contain only supported counts and the estimate disclaimer. Measurement counts describe this local observed rehearsal, not audience reach.

Pause immediately removed the server sponsor; the already-open Hub restored house content in **37,288 ms**, within the existing 60-second freshness bound ([trace](advertising-p7-evidence/rehearsal-pause.json), [house](advertising-p7-evidence/hub-paused-house.png)). Resume required the established review/approval path and fresh release references. A subsequent deterministic 30-day interval ending shortly afterward verified exact boundaries: present 1 ms before end, absent at and after end. The real open client restored house content approximately **1,043 ms after expiry** ([boundaries](advertising-p7-evidence/expiry-boundaries.json), [trace](advertising-p7-evidence/rehearsal-expiry.json), [house](advertising-p7-evidence/hub-expired-house.png)). That figure includes the QA polling observation interval; it is not GPU or frame timing.

The campaign was then restored to a current 30-day approved QA interval and the isolated server restarted with **global pause true**, independently of campaign status. The new [catalog](advertising-p7-evidence/global-pause-catalog.json) was house/empty with measurement disabled; the actual [Hub](advertising-p7-evidence/hub-global-pause.png) showed its original house banner. Records remained intact. No per-frame work or renderer/catalog code changed, so P4–P6 matched visual/performance evidence is reused; no new hardware performance claim is made.

Inventory is unchanged: one exclusive global Hub slot; 102 authored + 48 generated Dallas placements; exactly the prior three world QA approvals. Downtown south remains BLOCKED and five-location City Partner unavailable. World serving was disabled throughout this rehearsal.

## Verification and limits

Fresh selected regression run: **46 passed, 0 failed, 0 skipped**, including **6 P7** tests. Covers P1 inventory, Mission Focus, reward security/economy, wallet, Sky Duel rules, inquiries, campaign/creative management and concurrency, Hub delivery/reports, world delivery, measurement persistence/security/client lifecycle, and new commercial evidence. P7 specifically covers every missing attestation, unknown fields, missing operator identity, restart/idempotent migration, revocation, pause/date/public-brand/creative invalidation, pre-start review, exact expiry, 30-day restriction, exclusive/adjacent Hub bookings, production simulation denial, default-deny serving/global pause and unknown platform. Full historical gameplay/native/auth/purchase suites were not rerun; those unchanged areas retain P0–P6 evidence, not a new claim of exhaustive testing.

Command:

```sh
./node_modules/.bin/tsx --test server/src/sponsorship-commercial.test.ts server/src/sponsorship-management.test.ts server/src/sponsorship-delivery.test.ts server/src/sponsorship-inquiries.test.ts server/src/sponsorship-world.test.ts server/src/sponsorship-measurement.test.ts server/src/sponsorship-measurement-client.test.mjs server/src/advertising-p1-inventory.test.ts server/src/mission-focus.test.mjs server/src/rewarded-ads.test.ts server/src/player-wallet.test.ts server/src/sky-duel-rules.test.ts
```

`npm run build` passed client and server against the final application source. `git diff --check` passed. [Test log](advertising-p7-evidence/tests.log), [build log](advertising-p7-evidence/build.log) and [manifest](advertising-p7-evidence/manifest.json) are retained. Sales PDF is one A4 page, rendered to PNG and visually checked. Browser evidence is desktop emulation, not physical mobile testing. No P7 client code, rendering behavior or runtime dependency was added.

The Render monitoring skill requires a confirmed workspace before private service inspection. The connector returned **no workspace selected**; no workspace was inferred or switched. Consequently production DB/backup/restore, secure CLI/inquiry retrieval, deployed asset decoder/permissions, private environment configuration, audit/monitoring and restart operations remain unverified. Public route checks alone do not close these prerequisites. They block commercial go-live, not the isolated engineering rehearsal.

P8 is an independent native-ad phase and has not started. Its native SDK/provider, physical-device, store/audience/privacy/consent and server-verification requirements need their own review; no native readiness is inferred from P7. Actual advertiser approval, signed agreement, payment conditions, legal notices, production operations and explicit deployment/go-live authorization remain separate owner-controlled gates.

**Cleanup/source closure:** isolated server and browser stopped; temporary DB, assets and browser profile removed. No QA flags were persisted. Hash comparison found no missing pre-existing files and changes only to `sponsorship-management.ts` and its CLI among the initial files; all other P0–P6 files were preserved. Separate QA worktree remains untouched with its same 28 status entries. [Source/cleanup proof](advertising-p7-evidence/source-and-cleanup.json). No commit, push, deployment, legal-policy publication, real sponsor activation or P8 implementation occurred. Production inquiry, measurement, external links and paid-serving defaults remain disabled; deployed private environment values were not inspected or changed.
