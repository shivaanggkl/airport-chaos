# Advertising P3 — internal sponsorship management

**Source baseline:** `feature/advertising` at `95a6787`, with P0–P2 work uncommitted. The separate `qa` worktree at `airport-chaos-sky-duel` remains attached at `95a6787`. P3 adds only this report, one management service, one operator CLI, focused tests and a tiny test-only WebP fixture; it exports the existing P2 HTTPS website validator for reuse. P0–P2 files and all public advertising surfaces are otherwise preserved. No campaign is served to players in P3.

## Implementation

- `server/src/sponsorship-management.ts` adds five separate SQLite entities in the existing profile database: advertisers, creatives, campaigns, placement assignments, and administrative audit events. Table and index creation is idempotent. IDs are UUIDs; queries use parameters and bounded reads; foreign keys and status checks are enabled. P2 inquiry rows remain separate and unchanged. An optional inquiry ID can be linked after it is verified in the existing inquiry table.
- An advertiser moves from `DRAFT` to `APPROVED` or `REJECTED`; an approved advertiser can be suspended. A creative is registered as `DRAFT`, then approved or rejected; approved art can only be disabled, and its asset identity is immutable at the database level. Replacing art requires a new creative record and review. The stored SHA-256 is rechecked before campaign approval and in preview.
- A campaign moves `DRAFT → IN_REVIEW → APPROVED`, then may be paused or cancelled. Paused campaigns require another review before approval. Changing dates or assignments on an approved/paused campaign returns it to `IN_REVIEW`; title edits preserve approval. Cancellation keeps all records and audit history. Approval requires an approved advertiser, at least one assignment, same-advertiser approved creative, exact creative-to-placement fit, P1 `QA_APPROVED` inventory, intact asset hash, and no overlapping approved reservation.
- UTC intervals are half-open: `start ≤ time < end`. Approval runs inside `BEGIN IMMEDIATE`, so two concurrent operator processes cannot reserve the same placement and intersecting time. Adjacent periods are allowed. The Hub is one separate global resource, `global-hub-spotlight`; world placement identity and city come from the existing P0/P1 registry. New city inventory can be registered in those files without changing the schema. No aircraft, city rendering, or game-loop code imports this module.
- `server/src/sponsorship-management-cli.ts` is host-shell only. There is no browser admin interface, public mutation/manifest API, background activation job, or client bundle addition. The read-only preview reports the advertiser, creatives, scopes, status, dates, approval/schedule blockers, and `publicServingAllowed: false`. `SPONSORSHIP_SERVING_DEFAULTS` keeps global pause on and Hub/world paid serving off; preview also records the pending platform/audience gate. Future P4/P5 delivery must add separate audience, platform, privacy, and release checks; internal schedule eligibility never authorizes public serving.

## Creative safety

The operator registers a static file already in the authorized local asset directory (default `client/public/media/advertise`, configurable with `AIRPORT_CHAOS_SPONSOR_ASSET_ROOT`). The filename cannot contain paths; symlink targets are rejected. The file must be PNG/JPEG/WebP, at most 1 MiB compressed, 256–4096 pixels on each axis (height at least 64), at most eight million pixels, and within 8% of the target placement aspect ratio. `ffprobe` checks format/dimensions and `ffmpeg` decodes the actual bounded bytes; approval fails closed if those local tools are absent. This adds no client dependency or gameplay runtime work. Public upload, remote asset fetch, advertiser code, and advertiser-defined coordinates do not exist.

## Operator workflow

Run from the repository root on an authorized local or restricted hosting shell. Use `AIRPORT_CHAOS_PROFILE_DB=/absolute/path/to/player-profiles.sqlite`; for a built server run `node server/dist/sponsorship-management-cli.js` instead of `./node_modules/.bin/tsx server/src/sponsorship-management-cli.ts`. The actual host database path and `ffmpeg`/`ffprobe` availability must be verified before any commercial operation. Never put contact messages or secrets into CLI arguments or public logs.

```text
./node_modules/.bin/tsx server/src/sponsorship-management-cli.ts advertiser create "Internal Fixture Company"
./node_modules/.bin/tsx server/src/sponsorship-management-cli.ts advertiser approve <advertiser-id>
./node_modules/.bin/tsx server/src/sponsorship-management-cli.ts creative register <advertiser-id> demo.png dallas-dfw-terminal-sign "Fixture Company"
./node_modules/.bin/tsx server/src/sponsorship-management-cli.ts creative validate <creative-id>
./node_modules/.bin/tsx server/src/sponsorship-management-cli.ts creative approve <creative-id>
./node_modules/.bin/tsx server/src/sponsorship-management-cli.ts campaign create <advertiser-id> "Fixture pilot" 2026-11-01T00:00:00Z 2026-12-01T00:00:00Z
./node_modules/.bin/tsx server/src/sponsorship-management-cli.ts assignment add <campaign-id> <creative-id> dallas-dfw-terminal-sign
./node_modules/.bin/tsx server/src/sponsorship-management-cli.ts campaign review <campaign-id>
./node_modules/.bin/tsx server/src/sponsorship-management-cli.ts campaign conflicts <campaign-id>
./node_modules/.bin/tsx server/src/sponsorship-management-cli.ts campaign approve <campaign-id>
./node_modules/.bin/tsx server/src/sponsorship-management-cli.ts campaign preview <campaign-id> 2026-11-01T00:00:00Z
./node_modules/.bin/tsx server/src/sponsorship-management-cli.ts campaign pause <campaign-id>
./node_modules/.bin/tsx server/src/sponsorship-management-cli.ts audit record <campaign-id>
```

`advertiser`, `creative`, and `campaign` each have bounded `list` and `view`; `assignment` has `list`, `change`, and `remove`; `audit` has bounded `list` and `record`. Campaign `edit` accepts `title`, `start`, or `end`; `cancel` preserves history. CLI errors explain invalid transitions and placement conflicts. Routine list output omits P2 contact details.

## Verification and P4 handoff

Focused P3 tests use only temporary SQLite databases and locally generated house/demo images. They execute the complete CLI lifecycle, a true two-process reservation race, asset tampering, state transitions, UTC boundaries, and repeated migration. The fixture database and image are removed after testing. P4 can reuse the placement registry lookup, approved creative identity/hash check, conflict-safe campaign status, and read-only schedule preview when connecting the existing Hub banner and later directory. P4 must add explicit public delivery gates, global pause behavior, age/privacy/platform review, and house fallback; P3 has no public serving path. Three Dallas signs remain technically qualified; the blocked tower and all other unapproved P1 inventory remain unavailable. External privacy, audience, contractual, and platform approvals remain release blockers.

**Validation results:** `./node_modules/.bin/tsx --test server/src/sponsorship-management.test.ts` — **7/7 passed**, including actual SQLite reopen/repeated migration, P2 inquiry preservation, PNG/JPEG/WebP validation, tamper and path rejection, full CLI workflow, two separate approval processes competing for one placement (one success/one conflict), UTC boundaries, audit filtering, and a live local HTTP check (`/sponsors` 200; no public campaign mutation route). The previous P1 suite plus P2 inquiries, auth, Daily Rewards, wallet and native purchase tests ran together: **91/91 passed**, 0 failed. `npm run build` passed for client and server; after final P3 server edits, `npm run build --workspace server` passed. The compiled `node server/dist/sponsorship-management-cli.js advertiser list` exited 0 against an isolated database. `git diff --check` passed. No physical-device test was performed; no player-facing P3 UI was added. Local `ffmpeg`/`ffprobe` were used for tests; their availability on the eventual deployment host has not been verified. No commercial capacity is activated, and the P2 public inquiry gate remains separate and off by default.

Broader regression command: `./node_modules/.bin/tsx --test server/src/advertising-p1-inventory.test.ts server/src/mission-focus.test.mjs server/src/ad-placement-visibility.test.ts server/src/rewarded-ads.test.ts server/src/session-auth.test.ts server/src/native-transport.test.ts server/src/sky-duel-spawn.test.ts server/src/sky-duel-matchmaking.test.ts server/src/sky-duel-rules.test.ts server/src/sky-duel-store.test.ts server/src/sky-duel.integration.test.ts server/src/sponsorship-inquiries.test.ts server/src/auth-request-security.test.ts server/src/daily-rewards.test.ts server/src/player-wallet.test.ts server/src/native-purchases.test.ts`.
