# Point → Fire → Destroy — QA acceptance

**Status: PARTIAL.** Implemented locally on `qa`, based on `4ba21daa05d8a010851376fa0452fc10b77d69a0`. The latest client was built and installed wirelessly on the iPhone QA app. Server changes remain local; the iPhone still connects to the existing staging server. No commits, pushes, merges or deployments were performed.

## Implemented

- Stable 112 px firing guide; selected-enemy identity/health labels; reduced repeated lock/range messages. Existing shared angle-first switching and server eligibility remain in place.
- Local projectile visuals stay bounded at 256 and preserve the pilot's own rounds before remote cosmetic traffic. Clearing the scene leaves zero active visuals.
- Replaced the shared 256-round server bottleneck with per-pilot (64) and per-city (8192) budgets. Firing cooldowns, eligibility and damage rules remain unchanged.
- Added a conservative city-scoped spatial broad phase. Existing exact swept-impact checks still decide hits; randomized equivalence tests cover the broad phase.
- Coalesced city lock display refreshes to 10 Hz, public transform forwarding to 10 Hz, projectile corrections to 1 Hz and repeated roster snapshots to 250 ms. Incoming transforms and each firing request are still validated; spawn, removal, damage and reward events remain immediate. Private mission and Sky Duel projectile scopes remain intact.

## Server load evidence

Local Node 22.18.0, isolated disposable test profiles/database, validated WebSocket clients, 30 seconds per case. Parallel lanes with synchronized sustained firing; these are synthetic protocol clients, not human pilots or full flight-physics playthroughs. Same baseline and candidate workload. Aggregate traffic is traffic across all clients, not per client.

| Aircraft | Baseline accepted/sent | Final accepted/sent | Final rejected | Missing ACK | Server loop p95 | Aggregate traffic |
|---|---:|---:|---:|---:|---:|---:|
| 10 | 958/1490 | 1480/1480 | 0 | 0 | 12.4 ms | 6.8 Mbps |
| 25 | 1024/3725 | 3675/3675 | 0 | 0 | 14.7 ms | 36.7 Mbps |
| 50 | 1024/7400 | 7400/7400 | 0 | 0 | 18.2 ms | 128.7 Mbps |
| 100 | 1024/14800 | 13785/14800 | 1015 | 0 | 46.7 ms | 442.4 Mbps |

The final 100-client synchronized case reached 146.4 ms maximum event-loop delay and 91.8 ms p95 shot acknowledgement. Cooldown blocks were observed, but diagnostic logging is throttled: it does not establish the reason for every rejection. **This case does not pass a smooth 100-plane readiness gate.** No transform rejections occurred in these parallel cases.

### 100-aircraft opposing pairs

A separate final run used 50 opposing pairs, authoritative shots/impacts, deaths and respawns: **8973 requests, 8807 accepted, 166 rejected, zero missing ACKs, 1577 damage events, 287 destructions**. All 100 connections remained open. Recorded rejection reasons exactly matched the 166: 56 lifecycle and 110 cooldown. Thirty-six synthetic transform updates were rejected around respawn transitions; this is retained evidence, not proof of a real-client defect.

Movement-triggered repeated city-wide targeting work originally starved this scenario (zero shot acknowledgements). The bounded city refresh corrected that bottleneck. Coalescing duplicate rosters then reduced aggregate paired-battle traffic from 1274 to 508 Mbps. Final loop p95 was 32.5 ms, maximum 170.0 ms, and ACK p95 65.7 ms. Traffic and spikes remain material release concerns.

## Rendering and native evidence

Controlled rendering fixture: Chrome, hardware ANGLE Metal Apple M1, 844×390 CSS viewport, actual production aircraft models, 100 visible aircraft and sustained cosmetic firing. Both baseline and candidate averaged approximately 60 FPS. At DPR 2, frame p95 was 17.1 ms baseline / 17.9 ms candidate; CPU frame p95 was 6.2 ms for both. This fixture isolates rendering and does not prove complete gameplay, city streaming, WAN behavior or physical-phone performance.

Checks confirmed circle width 112 px at both tested FOVs, own-round survival under remote traffic, bounded visual count and zero active rounds after clearing. [Screenshot](combat-scale-qa-evidence/render-fixture.png) is explicitly a rendering fixture, not a genuine mission playthrough.

Capacitor staging sync, web build, server TypeScript build and native iOS Debug build completed. Latest client installed wirelessly. Physical iPhone profiling was attempted, but Apple's Game Performance attachment timed out waiting for the device; no physical FPS measurement is available. ADB reported no Android device. No physical-device acceptance is claimed.

## Regression and safety

**256 tests passed, zero failed/skipped/cancelled**, including the four new budget/spatial tests, mission targeting, transform validation, protected targets, projectile authority, duplicate-impact handling and Sky Duel reconnect/integration coverage. [Exact test files](combat-scale-qa-evidence/test-files.json), [results](combat-scale-qa-evidence/regressions.tap), [source hashes](combat-scale-qa-evidence/source.json).

No mission difficulty, flight physics, weapon rate/damage, economy, purchases, player accounts, production advertising or P8 code was changed. No new dependencies. No client authority over damage or wallet state was added. QA fixtures exist only in standalone scripts with disposable local databases; no production runtime fixture hooks were added.

## Remaining acceptance gates

1. Resolve measured synchronized 100-client rejection/latency and bandwidth limits without weakening validation; profile before further optimization.
2. Repeat on representative staging hardware and realistic WAN latency/loss after deployment is authorized.
3. Measure actual iPhone/Android gameplay and sustained firing, thermal behavior and frame times; manually verify target switching, UI/audio and mission transitions. Current fixture measurements do not replace these checks.
4. Staging must receive the local server fixes before an installed QA client can exercise them against staging. No deployment authorization was inferred for this task.

## Reproduction

```sh
./node_modules/.bin/tsx scripts/combat-load-test.mts --counts=10,25,50,100 --seconds=30 --output=/tmp/combat-load.json
./node_modules/.bin/tsx scripts/combat-load-test.mts --counts=100 --scenario=pairs --cadence=staggered --seconds=30 --output=/tmp/combat-pairs.json
# Start Vite on 127.0.0.1:5178, then use the already installed Playwright module:
PLAYWRIGHT_MODULE_PATH=<installed-playwright-path> node scripts/combat-render-benchmark.cjs --counts=100 --dpr=2 --output=/tmp/combat-render.json
```

Raw sanitized results, intermediate isolations and matched baseline measurements are retained in [combat-scale-qa-evidence](combat-scale-qa-evidence/).
