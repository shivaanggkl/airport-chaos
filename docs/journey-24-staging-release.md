# 24-mission Journey staging release procedure

This is a preparation checklist. The integrated Missions 14–24 client and server
must be released together. Do not install the new iPhone app against the older
Mission 13 staging server.

## Candidate and data

- Source baseline: `origin/staging` at `8b44f557c4a20dc850fa92ded222523d68204f33`.
- Apply the integrated patch once to that baseline. Verify its checksum, clean
  application, and client/server builds before staging deployment.
- Keep the existing `com.vadensoftware.airportchaos` bundle identity and embed
  `https://airport-chaos-staging.onrender.com` in the staging iPhone build.
- Use separate staging services, credentials, and profile database. Do not copy
  a real player's progression into a QA account or expose test unlock routes.
- The Journey store adds nullable or defaulted columns to `journey_attempts`:
  `secondary_target_id`, `repair_collected_at`, `landing_score`, `capture_ms`,
  `approach_cycle`, `double_phase`, `legendary_phase`, and `heart_x/y/z`.
  Existing `journey_completions` records are retained. The startup migration
  checks for each column before adding it and is safe to run again.

## Authorized staging rollout, when separately approved

1. Record the exact staging server revision, app build identity, and database
   backup location. Take a verified staging profile database backup before any
   server replacement. Keep the backup private and encrypted.
2. Recheck that the target staging branch still matches the patch baseline.
   If it moved, reconcile and rebuild; do not force-apply the patch.
3. Deploy the integrated server and web client as one revision. Wait for its
   `/health` response and check startup migration logs and the Journey schema.
4. Confirm a disposable QA account can load Journey and that ordinary accounts
   retain their previous completions and wallet balances.
5. Only then install the matching signed staging iPhone QA build on an
   authorized test device. Confirm its bundle ID and backend before testing.
6. Run the physical checklist below. Keep production untouched.

## Rollback

If the coordinated staging release fails, stop new staging sessions, restore
the previous matching staging server/web revision and iPhone QA build, and
verify health, account login, wallet balances, and Missions 1–13. The added
Journey columns are additive and may remain if the previous server works with
them. Restore the pre-release staging database backup only if data integrity
requires it, after checking for valid player progress created during the test.
Never run a destructive schema rollback against production.

## Physical gameplay acceptance

- Start with a disposable test account and a free Bluejay. Check Day and Dusk,
  iPhone landscape controls, Fire, throttle, altitude, haptics, audio resume,
  and Retry/Exit cleanup.
- Complete the selected high-risk courses with normal controls: Missions 10,
  11, 13–24. Record actual times, accepted hits, damage, landing tiers, and
  capture progress. Check Mission 16's single active shooter and Missions 18/21
  pause and resume behavior.
- For Mission 22, land safely below PERFECT, taxi, take off, repeat all three
  gates, and land again. For Mission 24, a safe non-PERFECT landing must preserve
  the cleared gates and defeated Ace while allowing another landing.
- Confirm Stage 24 victory gives one capped first-clear Credit transaction,
  Profile shows Legendary Pilot after a new login, Journey shows 24/24, Replay
  remains available, and Free Flight and purchased aircraft remain accessible.
- Measure FPS, frame time, memory, and object/listener growth through repeated
  Retry/Exit cycles on actual test devices. Record results rather than inferring
  them from deterministic tests.
