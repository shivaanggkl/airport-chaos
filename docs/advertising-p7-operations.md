# Sponsorship operations — P7 review draft

**Not a signed agreement or legal approval. No go-live authorization.** Operator-only planning. First pilot: one business, `global-hub-spotlight`, web only, exactly 30 days, no automatic renewal. Dallas remains a separate later approval. Internal unvalidated 30-day experiments: Hub $199, Dallas $499, future City Partner $999; never publish these as validated/public prices. Five-location City Partner is unavailable with only three qualified world signs.

## Lead → agreement → creative → release

Review NEW inquiries daily; internal target: acknowledge valid inquiries within two business days, without a public response-time promise. Use `sponsorship-inquiries-cli list`, `view ID`, `status ID CONTACTED|CLOSED|SPAM`. Verify the company's legal identity, domain and representative's authority manually; do not crawl submitted URLs automatically. Check category suitability and `campaign conflicts ID` before quoting inventory. No new CRM.

### Proposal / order / contract-review template

Complete outside the public game; owner and counsel must review before use:

- Proposal reference, date, operator; Ecleva LLC and advertiser legal identities/authorized signatories.
- Advertiser public name, approved HTTPS domain, inquiry reference.
- Package; exact placement ID(s) and scope; first pilot `global-hub-spotlight`, global/web only. No native or Dallas activation in the first pilot.
- UTC inclusive start / exclusive end, actual 30-day duration, no automatic renewal.
- Agreed fee/currency, invoice reference, due date, payment conditions and any explicitly approved pre-settlement condition. No in-game currency.
- Approved immutable creative ID/hash, preview screenshot reference, advertiser artwork/placement signoff; brand/trademark permission and replacement review.
- Content restrictions and operator right to pause unsafe/misleading content; suspension, termination and cancellation notice/process.
- Availability/outages and agreed extension, replacement period, credit or refund remedies; no unilateral automatic makegoods.
- Measurement availability and limitations; no guarantee of audience, views, clicks, conversions or commercial results.
- Privacy, applicable policies, permitted aggregate sharing; no player identities or raw sessions shared.
- Separate owner go-live authorization, commercial release evidence, human signatures/dates; manual renewal requires a new agreement and conflict review.

### Creative submission instructions

Operator receives permitted brand assets outside the game; no public upload. Static PNG/JPEG/WebP only, ≤1 MiB compressed. Approved local asset root, filename only; no SVG/HTML/scripts, executable tags, tracking pixels or remote art. Existing P3 decoder enforces 256–4096 width, 64–4096 height, ≤8 million pixels and aspect-ratio tolerance 8% against the actual placement. Hub is 480:64. World artwork must match its own existing surface, not the Hub format.

Use ≥8% interior margins, one logo/symbol, brand name preferably ≤28 characters, optional tagline ≤42. Legible high contrast, no stretching/cropping/paragraphs/QR/phone numbers/fake game messages or purchase prompts. Long unreadable names need redesign, not automatic tiny text. No flashing. Verify hash, decode, dimension, presentation and advertiser permission before approval. A replacement is a new immutable creative and fresh campaign/release review. Preview actual Hub and retain screenshot/signoff.

Human category review rejects adult/sexual content, gambling, alcohol/nicotine/recreational drugs, weapons sales, fraud, deceptive financial/health claims, misleading endorsements, hate/extremism, malicious destinations and content inappropriate for the approved audience. Other regulated categories need specific review. External sponsor links remain disabled pending audience/platform/privacy approval.

### Manual invoicing / reconciliation SOP

Record the signed amount/currency, invoice reference/due date and external bookkeeping reference in the approved business system. Reconcile payment receipt or the separately authorized pre-settlement condition; store only the approval reference in release evidence. Never store card/bank details, full contracts or invoices in the gameplay DB. Refunds/credits follow signed terms and approved bookkeeping, with a recorded remedy and reconciliation status. No player Credits, Tokens, purchases, Store, payment SDK or automatic charge/renewal.

## Restricted release workflow

Run on an authorized host shell, using the existing DB/asset environment and `./node_modules/.bin/tsx server/src/sponsorship-management-cli.ts` (or compiled `node server/dist/sponsorship-management-cli.js`). Existing create/review/approve/assignment/preview/conflicts/audit commands remain unchanged.

New commands:

```
campaign readiness ID [UTC]
campaign release ID /secure/path/evidence.json reviewed
campaign release ID /tmp/isolated/evidence.json qa-simulated
campaign revoke-release ID
```

Evidence JSON has exactly these ten keys, each a 3–120 character non-sensitive reference to independently reviewed records: `identity`, `creativeRights`, `artwork`, `agreement`, `invoice`, `paymentCondition`, `inventory`, `privacyAudiencePolicy`, `operations`, `ownerGoLive`. A reference is a human attestation, not automatic verification that an agreement/payment/legal approval exists. `reviewed` must only be run by an authorized operator after genuine review. Codex must not populate real approvals. `qa-simulated` requires nonproduction, no Render service, `AIRPORT_CHAOS_DEV_QA=1`, and DB/assets under `/tmp` or `/private/tmp`; never legal permission.

Readiness separates technical eligibility, recorded/completed evidence (or QA_SIMULATED), and serving. **Serving remains BLOCKED: production activation is not authorized or implemented by this command.** Existing `campaign delivery on` is the P4/P5 isolated QA gate, not commercial release. Even misconfigured production flags cannot serve via that QA path. Production enablement needs a separately reviewed release change/authorization; no client controls exist.

Evidence is bound to advertiser/public-brand state, dates, assignments and immutable creative state/hash. Date, assignment and workflow-state changes clear it; public branding/creative changes make it stale. Re-review and record fresh evidence after correcting issues. Pause → review → approve is the existing resume path; pause never retains release evidence. Expiry and global pause always override serving. `audit record ID` preserves release/revoke and ordinary material-change history. Access is host/OS authorization, not player privileges.

## Monitoring, incidents, expiration and renewal

Before any separately authorized activation: verify records, production host/operator access, asset decoder and deployment, approved notices, flags, schedule, reporting permission, real-browser preview, fallback and emergency pause. Capture final creative/hash, Hub placement, UTC interval, web scope and audit reference. Production evidence must be captured after an actually authorized deployment, never simulated.

Review application health/errors, campaign eligibility, player complaints and authorized measurement. Existing `sponsorship-measurement-cli moderation`, report CLI view/review/resolve, management campaign pause/creative disable and audit are authoritative. An untrusted report cannot suspend a business automatically.

For an advertiser issue: record external ticket/reference → verify actual campaign/catalog/audit/artwork → inspect screenshots and aggregates → correct the cause with necessary approvals → record remedy → notify advertiser manually. Incorrect dates/artwork require renewed approval. No automatic extensions/refunds.

Emergency rollback: set `SPONSORSHIP_GLOBAL_PAUSE=true` → verify new catalog is house and open clients fall back within ≤60 seconds → disable Hub/world serving → preserve campaign/audit/report records → verify ordinary Hub/gameplay → revert only separately approved deployment changes if needed. Do not destructively roll back the DB. Restart must not revive expired/paused campaigns.

At exact end, house art returns. Reconcile incidents and signed remedies before issuing a summary or proposing a new manual renewal. Adjacent periods are permitted; overlapping exclusive Hub bookings are rejected transactionally.

### Sponsor-shareable period-end summary template

Company / business reference; campaign ID; contracted placement and web scope; scheduled UTC dates; actual eligible delivery period **only if evidenced**, otherwise unavailable; measurement-enabled dates; estimated Hub/world exposures; intentional Details opens; permitted website actions; incidents/resolution and operational availability notes. If collection was disabled, say measurement unavailable—not zero audience. Never report unique viewers, demographics, sales, ROI or guaranteed reach. Include: “Exposure totals are internal estimates based on eligible in-game presentation and are not independently audited advertising impressions.” Export existing CLI JSON/CSV; no raw sessions, contacts, operator notes or automatic email.
