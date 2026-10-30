# QA feature integration — October 29, 2026

## Preserved sources

- Starting QA/staging: `ef7003458d386aa247a45143c4873b2017dd5017`.
- All tracked modifications and non-ignored untracked files in `feature/advertising` saved in `7110398` (advertising, native ads, unified combat and evidence).
- All tracked modifications in `feature/bugfixes` saved in `a78cdb2` (Firehawk and earlier QA gameplay work).
- Both feature commits are ancestors of the integrated QA branch. Their original content remains recoverable in history. Ignored credentials, local databases and routine build output were not added.

## Conflict resolution

The bugfix worktree carried the older v19 raised stabilizer cap, while QA already had the requested v20 integrated fin tip. Kept QA's v20 model, generation script and cache version. Kept its matching shared muzzle, exhaust and ground-contact coordinates; the v19 offsets correspond to the older model's different normalized center. Firehawk geometry/socket tests pass. Other bugfix changes already present on QA were retained.

Advertising/combat merged automatically with QA's latest cosmetics, account access and timed Sky Duel rules. Reviewed overlapping client/server and live-test edits. Whitespace-only normalization was applied to two evidence files and the ends of two shared helper files.

## Validation

- Production build: PASS.
- Full server test inventory: 750 tests, 714 passed, 36 failed.
- Every failed test also fails in the preserved feature source before integration; no newly failing automated check detected.
- Live Sky Duel, combat projectile/M8/M9 checks, Firehawk model alignment, cosmetics and sponsorship checks are included in the full run. One sponsorship HTTP check is among the existing failures.
- Exact failures: [qa-integration-validation.json](qa-integration-validation.json).

This confirms branch integration and build compatibility; it does not certify the product as issue-free. Existing test failures and previously documented device/performance coverage limits remain. No staging/production deployment or iPhone installation was performed for this integration.
