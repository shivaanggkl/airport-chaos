# Final targeted combat QA closure — 2026-10-30

**STATUS: PARTIAL.** Current automated gates pass. The historical intermittent Sky Duel failure did not reproduce; its cause remains unproven. Both genuine mission attempts reached normal timeout failures, not successful clears.

## Sky Duel

- Ran the complete integration scenario four additional times: immediate reconnect; reconnect delayed 3,100 ms; reconnect delayed 1,400 ms with ordered 180 ms inbound delivery delay; reversed initial queue order with 2,200 ms reconnect delay and 180 ms inbound delay. **4/4 passed.** Delays were confined to a temporary test transport/copy, not production code.
- The final subsystem regression run also passed the unchanged full scenario: **five complete passing executions in this pass**, including authoritative combat, active/countdown reconnect, surrender, payout/idempotence, cancellation, absence and AI fallback assertions.
- Every traced reconnect delivered the opponent runway pose before launch. No confirmed server ordering or fairness defect was found. The prior failure has no retained failing packet trace, so these passes do **not** establish that it was a timing-only test defect.
- Only test-source change: preserve the existing assertion and include participant, phase/index and packet-window details on failure. No assertion weakened, gameplay fix invented, or reconnect/economy rule changed.

## Actual Mission 8/9 attempts

Used the built application, isolated local QA account/database, Chrome with SwiftShader, 640×360 viewport, ordinary mission UI and keyboard inputs. No injected poses, damage, health, aim or synthetic victory.

| Mission | Actual result | Combat evidence | Exit |
| --- | --- | --- | --- |
| 8 | FAILED / transport timeout, “Transport escaped” | 27 fire intents, 26 owned projectiles; transport 2,000→1,640; escort damaged; incoming player damage | Normal result button; hub visible; no later mission events in 3-second observation |
| 9 | FAILED / transport timeout, “Transport escaped” | 34 fire intents, 33 owned projectiles; both initial escorts damaged; Mammoth escort destroyed (125→85→45→5→0); transport remained 2,000 | Normal result button; hub visible; no later mission events in 3-second observation |

- Both attempts covered authorized takeoff, climb/descent, banking/turning, changing aim candidates, real projectile spawns and authoritative impacts. No browser exceptions occurred. Mission 9 destruction is captured in `final-closure/playthrough-m9-destruction.png`.
- Autonomous pursuit overshot/failed to intercept the transport before the unmodified mission timer expired; distance increased despite throttle adjustments. This software-rendered automation does not establish human playability, smoothness or device performance. Successful clears, reinforcement-wave progression and visual aiming quality still need manual gameplay acceptance.
- **One `shotRejected` occurred in each mission.** Canonical blend-1 references were used. The public rejection packet omits its reason and this server run did not retain per-shot authoritative diagnostics. These cannot honestly be classified as legitimate validation or a new defect, nor attributed to the previously corrected stale-previous-sample defect. Their IDs/timestamps and surrounding gameplay are retained. No security gate was relaxed.
- On terminal state, existing client handlers clear target/projectile visuals; normal exit disposes the transport and navigates to a fresh hub document. Existing server cleanup removes mission encounters, escort waves and owned projectiles. Runtime showed no continuing mission events after either exit. This is an observed lifecycle check plus source inspection, not a heap-retention proof.

## Final gates and protection

- Relevant regression: **224/224 passed, 0 failed, 0 skipped** (`final-closure/regressions.tap`), plus **4/4** additional complete Sky Duel executions.
- **Client and server builds passed** (`final-closure/build.log`); existing bundle-size warning remains. `git diff --check` passed.
- Aircraft physics, mission difficulty/objectives/rewards, weapon balance, multiplayer economy, authoritative validation and release restrictions were unchanged.
- Branch **qa**, commit **831fa674426b449f90218960831926f8667f9545**. Existing combat/P8/unrelated modifications preserved. This pass changed only the Sky Duel assertion diagnostic, this report and new evidence.
- No commits, pushes, merges, installations or deployments. Temporary test transport, browser process, account/database and local server were isolated and removed after capture.

**Remaining acceptance:** capture a failing Sky Duel sequence if the intermittent issue recurs; classify the two newly observed rejections with authoritative reasons; manually clear Missions 8/9, verify aiming/target switching and successful-transition cleanup on desktop and physical iOS/Android hardware. No full acceptance or production release approval is asserted.

Evidence: [summary](combat-aim-evidence/final-closure/summary.json), [integrity](combat-aim-evidence/final-closure/integrity.json), [gameplay](combat-aim-evidence/final-closure/playthrough-gameplay.json). Earlier reports and evidence remain below.

---

# Final combat acceptance closure

## STATUS: PARTIAL — Mission 9 synchronization defect fixed

The rejected-fire defect is reproduced, corrected and regression-tested. Actual airborne Mission 9 firing succeeds after the fix. Full combat acceptance remains open because neither transport objective was completed in the bounded browser encounters, physical-device QA is pending, and one Sky Duel reconnect assertion failed in the final broad run. This section supersedes the earlier acceptance status below.

### Exact rejection evidence

The earlier two historical rejected requests had no per-shot server diagnostics; their individual causes cannot be retrospectively proven. A controlled reproduction of the same airborne keyboard sequence on the same QA source produced four rejected requests with an exact, consistent cause:

| Reproduced request | Previous sample age | Current sample age | Blend | Server result |
| --- | ---: | ---: | ---: | --- |
| R1 | 712 ms | 350 ms | 1 | `invalid_aim_sample` |
| R2 | 602 ms | 187 ms | 1 | `invalid_aim_sample` |
| R3 | 611 ms | 195 ms | 1 | `invalid_aim_sample` |
| R4 | 725 ms | 264 ms | 1 | `invalid_aim_sample` |

All four had matching requested/accepted state revisions, alive aircraft, and fresh accepted transforms (1–5 ms old). The current aim samples were inside the server's 500 ms window. The previous samples exceeded the 600 ms contributing-sample limit. They were incorrectly referenced even though `blend: 1` means their contribution is zero. The server's rejection was legitimate; the client reference construction was defective.

A longer gameplay run after that first correction found the related partial-blend case: previous sample **1,195 ms** old, current sample **49 ms** old, `blend: 0.477`, matching state revision, transform age **0 ms**. The client restarted interpolation through expired state after an update gap. That client timing defect is also corrected.

Evidence: [initial server decisions](combat-aim-evidence/closure/before-server-shots.json), [all diagnostic decisions](combat-aim-evidence/closure/server-shots.json), [original reproduction](combat-aim-evidence/closure/reproduction-runtime.json). Diagnostic logging ran only in a temporary copy of the current server; it was not added to application source.

### Verified fixes

- Fully blended shots reference the current sample for both endpoints. Their displayed firing vector is unchanged.
- The client tracks when the previous sample was received. At 500 ms local age it stops blending through that sample and uses the current sample, leaving margin inside the server's 600 ms contributing-sample window. The same blend drives HUD/prediction and the submitted reference.
- Ordinary fresh-sample interpolation remains 100 ms. Partial blends still retain both contributing references. The server still rejects expired contributing references, invalid aim, stale transforms and unaccepted state revisions.
- Added two unit regression cases covering the delayed-update boundary, endpoint references and vector consistency; extended the live server regression to reject the old packet and an expired partial blend while accepting the corrected reference. Updated one source-text assertion to the new helper call.

Server validation, fire rate, damage, target selection, flight physics, controls, mission objectives, economy, progression, multiplayer rules, protocol version and P8 implementation are unchanged. No new dependency or combat-system redesign.

### Actual gameplay completed

Browser checks used the bundle current at each run (the longer encounters preceded the final partial-blend correction; the final M9 replay used the final build) and an authenticated ephemeral local QA account, ordinary mission/time-selection UI, genuine keyboard controls and real authoritative server encounters. The pursuit driver only read network telemetry and pressed keys; it never injected positions, aim, health, damage or fake completion messages.

- **Mission 9:** server-confirmed takeoff; banking/turning; multiple enemies; owned projectile travel and impact; one escort destroyed through health **75 → 35 → 0**. Its two damage events matched owned projectile IDs, observed **1,335 ms** and **705 ms** after their spawn messages. The HUD reflected the destroyed escort and remaining enemy. The post-fix controlled replay emitted **5 fire intents / 5 owned projectile spawns / 0 rejections / 0 JavaScript errors**. The final replay after both corrections again produced **5 / 5 / 0 / 0**.
- **Mission 8:** takeoff, banking/turning, incoming damage, owned firing and real transport hits. Transport health fell **2,000 → 1,880**. A second bounded pursuit attempt confirmed damage again but did not destroy the transport. Do not call either attempt a mission win.
- **Transitions:** normal mission replacement recorded `ABANDONED / REPLACED`; the authenticated normal abandon endpoint returned **200 / ABANDONED** after gameplay. Attempts to reach a crash/failure screen during the limited control window remained `RACING`; crash and victory screens were not verified here.
- **Relevant combat regressions:** transport/gunship, escort selection, earliest collision, damage/travel, replay rejection, mission isolation and progression checks ran in the integrated batch. Free Fly touch and responsive evidence from the preceding pass is retained, not presented as a newly repeated device test.

[Gameplay events and controls](combat-aim-evidence/closure/gameplay.json), [additional M8 attempt](combat-aim-evidence/closure/adaptive-gameplay.json), [final M9 replay](combat-aim-evidence/closure/final-runtime.json), [transition results](combat-aim-evidence/closure/transitions.json).

Screenshots inspected: [M9 escort destroyed](combat-aim-evidence/closure/combat-m9-destruction.png), [M8 combat HUD](combat-aim-evidence/closure/combat-m8-end.png), [final M9 airborne firing](combat-aim-evidence/closure/final-live-m9-flight.png). Screenshot time is not a precise impact timestamp; the event trace provides the timing evidence.

### Tests and build

- Current `npm run build`: **PASS**. Existing bundle-size warning only.
- Current focused aim/projectile suite: **17 passed, 0 failed**.
- Current broad combat regression batch: **224 tests, 223 passed, 1 failed, 0 skipped/cancelled**. The failure is the existing Sky Duel assertion: “each pilot receives the opponent runway pose before the split view begins.” Its test and application startup code were not changed by this patch. It passed in earlier integrated runs during this pass; that does not erase the latest failure.
- The earlier initial source-text failure was corrected and passed; it is not the remaining failure above. The new unit test increases the preceding 222-test inventory to 224.
- Isolated Sky Duel diagnostic rerun: **1 passed, 0 failed**, including real two-player combat, reconnect, surrender, payouts and isolated AI fallback (159.191 s). Its reconnect packet trace contains the required opponent respawn poses for both pilots before launch. The broad-run assertion failure was not reproduced and remains unclassified. No assertion was removed or weakened; only diagnostic logging was added in the temporary test copy.
- `git diff --check`: **PASS**.

[Current build](combat-aim-evidence/closure/closure-build.log), [focused TAP](combat-aim-evidence/closure/closure-focused.tap), [broad TAP including failure](combat-aim-evidence/closure/complete-regressions.tap), [isolated Sky Duel diagnostics](combat-aim-evidence/closure/duel-diagnostic.tap).

### Remaining acceptance and release requirements

1. Resolve or reliably characterize the intermittent Sky Duel reconnect gate; do not silently call the latest broad run green.
2. Complete both transport objectives and verify their victory/failure presentation end to end. Actual combat damage and enemy destruction above are established; full mission completion is not.
3. Physical iPhone/Android input, supported mobile browsers, real network impairment and sustained full-city hardware performance remain required. The observed environment was headless Chrome/SwiftShader on this Mac; no physical-device approval is claimed. Previous matched component measurements are retained, not rerun or substituted for device performance.
4. The original two historical requests lack the telemetry needed for exact individual retrospective attribution. The reproduced client defects and successful post-fix runs are direct evidence; they are not invented historical logs.

**Recommendation:** keep the verified fix on QA for review; do not declare full combat/mobile release acceptance yet. No production deployment.

### Source integrity

Branch remains `qa`, HEAD `831fa674426b449f90218960831926f8667f9545`. Changes are limited to the client aim reference/timing, matching shared declarations/helpers, relevant regression tests, this report and diagnostic evidence. Server validation, Sky Duel test/source, unrelated work and the existing P8 report/evidence were preserved. Runtime instrumentation lived outside the repository and was removed after evidence export. No commit, push, merge, installation or deployment was performed.

---

# Previous combat acceptance record (retained)

# Combat upgrade — final QA and acceptance

## 1. STATUS: PARTIAL

Current QA engineering checks pass. No combat implementation defect was established, and no combat application code was changed. Full acceptance remains open for the Mission 9 rejected-intent investigation, physical-device performance/input, and complete end-to-end combat playthroughs.

Executed on `qa`, HEAD `831fa674426b449f90218960831926f8667f9545`. This section supersedes the acceptance claims in the historical implementation report below.

## 2. FIXES

- No speculative production fixes or test weakening. Existing aiming, aircraft physics, controls, objectives, rewards, progression, multiplayer economics and advertising/native code are unchanged.
- The five originally reported failures were already corrected in QA commit `831fa67`, before this pass. They concerned Hunter source matching, mobile Controls source matching, aircraft-specific visual/contact radii, remote marker source matching, and tutorial mission-lock source matching. Retained historical evidence records their pre-upgrade reproduction; the subsequent [QA repair mapping](qa-test-repair-validation.json) records their resolution. All five pass now. Their tests were not edited in this pass; they are not five outstanding baseline failures today.
- Corrected temporary diagnostic setup where needed: initialize client protocol/profile gates before synthetic events; activate the selected time card; wait for actual `RACING` and takeoff before testing mission fire; authenticate Free Fly; isolate benchmark targets from reconnect cleanup. These were fixture corrections, not demonstrated game defects.

## 3. TESTS

| Current execution | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Focused combat, historical failures, protection and live Sky Duel | 111 | 0 | 0 |
| Remaining original combat regression batch | 111 | 0 | 0 |
| **Automated total** | **222** | **0** | **0** |
| Browser client event checks (separate from Node tests) | 10 | 0 | 0 |

`npm run build`: **PASS**, client and server. Existing large-bundle warning remains; no dependencies or application bundle code were added. `git diff --check`: **PASS**.

[Exact file inventory](combat-aim-evidence/final/validation.json), [focused TAP](combat-aim-evidence/final/tests.tap), [remaining TAP](combat-aim-evidence/final/remaining.tap), [build log](combat-aim-evidence/final/build.log), [browser checks](combat-aim-evidence/final/client-events.json).

The previous 749/749 full-suite result is historical evidence at this same HEAD, not a newly executed full-suite run. Complete mission playthroughs, physical iOS/Android checks, Safari/Android browser input, real network impairment, and long-session hardware profiling were not executed.

## 4. GAMEPLAY

- **Mission 8:** actual current bundled application and isolated local server; ordinary mission/time-selection UI, intro/countdown, `RACING`, server-confirmed takeoff, throttle, climb, bank/turn while holding FIRE, and dive input. Airborne HUD and crosshair remained visible. Captured three fire intents, three projectile spawns, projectile state/removal traffic, and no JavaScript errors. Capture did not retain ownership per mission spawn, so these counts alone are not an ownership assertion.
- **Mission 9:** same flow; confirmed takeoff, multiple mission enemies, airborne crosshair and no JavaScript errors. Three fire intents produced one observed spawn and **two `shotRejected` messages**. The captured protocol does not identify the rejection reason. Do not attribute this to a definite app defect, security defect or simulator timing without another correlated trace. Smooth uninterrupted Mission 9 firing is therefore not accepted.
- **Authoritative M8/M9 encounters:** live automated tests select the transport, permit deliberate escort selection, produce traveling projectile damage, verify health reduction to 1,960, and prevent instant hits. These are targeted encounters, not complete mission wins.
- **Other combat missions:** focused transport/gunship, Rear Guard, mission engine, isolation, warning, protection and tutorial regressions pass. No claim of browser completion of every combat mission.
- **Free Fly:** authenticated local QA entry, 844×390 Chromium touch emulation. Actual FIRE press/hold/release produced **two owned authoritative projectile spawns**, then stopped sending fire on release. Portrait 390×844 retained the rotate-device overlay. [Runtime results](combat-aim-evidence/final/freefly-runtime.json).
- **Sky Duel:** full live two-player server regression passes combat, reconnect, surrender, payouts and isolated AI fallback. This is not a new physical-device or browser duel playthrough.
- **Projection/visual checks:** 20 renderer scenarios across 1536×707, 960×540, 390×844 and 844×390, plus dusk/evening captures. Shared projection checks span pitch/yaw/roll and near/behind-camera cases. Multiple-enemy selection and the fixed emitted trajectory pass. The screenshots support HUD readability; they do not prove subjective enjoyment or complete hit presentation during a full mission.

[Mission browser observations](combat-aim-evidence/final/gameplay-runtime.json). Early attempts that remained on the runway or selected a time without entering the game are not counted as successful flight checks.

## 5. PERFORMANCE

macOS 27.0.1, Apple M1, 8 GiB RAM, headless Chrome 156 with SwiftShader. Fresh sequential browser runs; same 960×540 viewport, six cloned aircraft, five logical targets, lighting, fixed simulation timestep, firing every six frames, 60-frame warmup and explicit GPU finish calls. No preceding projectile stress. Baseline/candidate/candidate/baseline short-run order. All four short runs ended with **58 draw calls / 22,716 triangles / five targets**.

The baseline uses the previously retained pre-upgrade source fixture through browser route interception and current asset imports. No repository checkout, reset, historical branch switch or whole historical build was used. This is an isolated combat-component comparison, not whole-city baseline certification. [Baseline provenance](combat-aim-evidence/final/baseline-provenance.json).

| Workload | Baseline mean / p95 | Candidate mean / p95 |
| --- | --- | --- |
| 300 measured frames, repeat 1 | 16.663 / 18.100 ms | 16.666 / 17.500 ms |
| 300 measured frames, repeat 2 | 16.665 / 18.100 ms | 16.666 / 18.100 ms |
| 1,800 measured frames, sustained firing | 20.040 / 18.400 ms | 16.851 / 18.000 ms |

Sustained runs emitted 310 predicted shots each; maximum active predictions **4**, active at end **3**, pool **1**, active after cleanup **0**. Dispatch means were 0.478 ms baseline and 0.486 ms candidate. Measured wall time was 36.071 s versus 30.332 s, reflecting scheduling variability; do not claim a candidate speedup from this one pair. The final gun-flash/tracer expiration differed by one draw call/12 triangles in the sustained endpoints.

Post-GC heap growth was 3,322,652 bytes baseline versus 3,337,744 bytes candidate. Both include fixture aircraft cloning and other setup after the initial snapshot; this is not a leak measurement. Candidate absolute post-GC heap was about 1.36 MB higher. Short repeats and the longer sample do not demonstrate unbounded projectile retention, but cannot establish long-session memory safety.

[Summary and raw measurements](combat-aim-evidence/final/performance-summary.json). No material combat regression was demonstrated in this matched component workload. The old packed-loop 2.73/18.99 ms comparison was not a valid FPS gate: it included unequal stress/pool history and queued software GPU work. Preliminary new whole-scene attempts also had unequal draw/target counts and were excluded; their retained raw files are under `final/exploratory/`. Physical-device and full-city performance remain pending. No renderer or gameplay changes were made to compensate for software rendering.

## 6. VISUAL EVIDENCE

- [Actual Mission 8 airborne turn](combat-aim-evidence/final/live-m8-flight.png)
- [Actual Mission 9 airborne turn](combat-aim-evidence/final/live-m9-flight.png)
- [Actual Free Fly mobile layout](combat-aim-evidence/final/live-freefly-touch.png)
- [Actual portrait rotation guard](combat-aim-evidence/final/live-freefly-portrait.png)
- [Controlled banking/climbing fixture](combat-aim-evidence/final/after-1536x707-bank-climb-fire.png)
- [Controlled edge fallback](combat-aim-evidence/final/after-960x540-edge.png)

Screenshots were inspected. Controlled fixture captures can include connection/identity notices because they bypass the normal launch flow; they are not full-session acceptance evidence. No new recording was made.

## 7. SECURITY

Live server checks pass authoritative launch geometry, projectile travel before damage, fixed emitted direction after aircraft steering, correct damage, replay suppression, forged damage/transform rejection, invalid aim and unaccepted-state rejection, and respawn cleanup. Shared collision tests verify earliest swept contact; aim-sample age validation was inspected in the server source. Mission and Sky Duel reward/progression tests remain green; no economy logic was changed.

Ten checks through the actual client socket handler verify prediction adoption without teleporting, immutable emitted direction, stale state rejection, no late-spawn resurrection, remove-before-spawn tombstones, rejected-shot cleanup, duplicate-impact health/feedback suppression, stale lock rejection, the 256-projectile cap and lifecycle cleanup. These use synthetic event delivery to real handlers, not an actual lossy/reordered TCP network. WebSocket connection ordering and server authority were not weakened.

## 8. REMAINING BLOCKERS

1. Correlate the two Mission 9 rejected intents with accepted state revisions and server aim-sample ages before approving continuous firing. The rejection was observed; its cause is unclassified, not a proven combat regression.
2. Complete end-to-end mission hit presentation and completion, other combat mission browser smoke coverage, browser Sky Duel input, sustained full-city play and subjective arcade/readability acceptance.
3. Physical-device input/performance and supported mobile browsers. A paired physical iPhone was listed but no current-build installation or device interaction occurred. No Android device was attached. Chromium touch emulation is not iPhone/Android approval.
4. Real network latency/loss acceptance and long-session hardware memory/frame-time evidence.

## 9. RELEASE READINESS / SOURCE INTEGRITY

**Recommendation: retain for QA; do not mark fully accepted or release to production yet.** Automated and isolated component gates are green, with the limitations above.

Application source and tests are byte-for-byte unchanged from the start of this pass. Existing local P8 report/evidence were preserved. Only this combat report and new diagnostic evidence were added/updated. Temporary servers, browser fixtures, test sessions and local profile databases were isolated from real accounts and removed/stopped after capture; retained diagnostic source is text evidence only. No native installation, commit, push, merge, deployment or production activation was performed. Branch remains `qa` at `831fa67`.

---

# Historical implementation report (superseded for current acceptance)

# Unified combat aiming and projectiles

## 1. Status — PARTIAL

The integrated local candidate is implemented. New combat checks and the live multiplayer regression pass. Full acceptance remains open: five existing regression assertions fail, and physical-device, all-mission, and sustained hardware performance coverage are incomplete. This is not a production release sign-off.

## 2. Source

- Checkout: `/Users/shiva/Documents/GitHub/airport-chaos`.
- Branch: `feature/advertising`; starting HEAD: `95a6787e9b37de3f7a50922660f3004ee71ec957`.
- Changed combat components: client aiming HUD, projectile prediction/reconciliation and impact feedback; authoritative server targeting, fire validation and collision; shared intercept, selection and swept-collision helpers; focused tests.
- Existing advertising/native work was preserved, including concurrent changes in this checkout. No branch switch, commit, push, native installation or deployment was performed.

## 3. Root causes

- The old acquisition ring used a projected angular radius and unrestricted projected coordinates. Turning or orbiting could move it outside the viewport; near/behind-camera projection had no safe homogeneous-W fallback.
- Closest-candidate selection lacked sustained switch dwell and turn grace, allowing nearby candidates to exchange priority.
- Locked shots used `createAssistedShot`: immediate server damage plus a separate visual aimed at the target's current position. Ordinary shots used simulated projectiles. These paths disagreed about travel time, trajectory and feedback.
- Predicted tracers could be rebased during adoption. Fire intents could supply a separate transform, distinct from the server's accepted flight state.

## 4. Implemented

- A fixed 38px cyan/white crosshair projects the actual muzzle ray after the current camera update. Safe edge arrows cover offscreen, near-plane and behind-camera directions. Valid lock is green; confirmed impact flashes gold. A separate small gold marker displays a feasible lead point.
- One server-selected target uses score margin, 240ms switch dwell and 300ms turn grace. Invalid targets release immediately. Mission 8/9 transport preference yields to clear escort alignment.
- Shared interception solves the existing inherited longitudinal projectile-speed model, rejecting infeasible/out-of-range solutions. Narrow assistance affects launch direction only; emitted shots never home.
- Every shot travels through the authoritative projectile system. Removed instant assisted damage and its duplicate tracer system. Moving-aircraft collisions resolve the earliest swept contact; mission-specific transport geometry remains authoritative.
- Immediate prediction uses the displayed gun direction. Reconciliation retains authoritative launch geometry and immutable direction, with smooth positional correction. Ordered state frames, bounded removal tombstones and impact IDs prevent stale resurrection and duplicate feedback.
- Fire uses accepted aircraft state, optional accepted-state revision binding, server-issued aim samples, existing cadence/damage, bounded replay protection and rejection cleanup. Lifecycle/mission transitions clear targeting and projectile visuals. Flight physics, camera behavior, prices, rewards and release gates were not redesigned.

## 5. Test results

`npm run build`: **PASS**. `git diff --check`: **PASS**.

Selected regression batch: **223 tests, 218 passed, 5 failed**. Exact file list and failures: [validation.json](combat-aim-evidence/validation.json).

Passing coverage includes:

- Stable selection with 2/3/5/12 targets, objective/escort switching, grace and invalidation.
- Stationary, approaching, retreating, lateral and fast intercepts; impossible/invalid solutions; narrow assist limits.
- Three.js projection across all four requested viewports, pitch/yaw/roll and near/behind-camera cases; ray consistency and continuous collision.
- Live server: no damage before travel, one impact, forged fire geometry ignored, duplicate shot suppression, invalid aim and unaccepted state revision rejection, fixed emitted heading, later shot following the new heading, respawn cleanup.
- Live Missions 8/9: transport selection, actual traveling projectile damage, and deliberate escort selection.
- Full live Sky Duel: two players, reconnect, combat, surrender, payouts and isolated AI fallback. Its test incorrectly assumed connection order equaled match slot; the assertion now uses the actual assignment. Packet traces confirmed correct runway pose delivery.
- Relevant authentication, protection, mission, tutorial, transport, monster, controls and competitive regression checks in the recorded batch.

The five existing failures concern Hunter source matching, mobile Controls source matching, remote visual-radius expectations, remote marker source matching and tutorial mission-lock source matching. They were reproduced against the saved starting source; they are not reported as passes.

## 6. Visual evidence

Controlled fixtures use the actual Three.js renderer and production HUD. They are not full mission playthroughs. Before/after captures include all requested sizes (1536×707, 960×540, 390×844, 844×390), straight flight, banking/climbing while firing, edge fallback, and transport/escort compositions. Portrait retains the existing rotate-device overlay. Dusk/evening captures are included.

| Scenario | Before | After |
| --- | --- | --- |
| Straight | [image](combat-aim-evidence/before-1536x707-straight.png) | [image](combat-aim-evidence/after-1536x707-straight.png) |
| Bank/climb/fire | [image](combat-aim-evidence/before-1536x707-bank-climb-fire.png) | [image](combat-aim-evidence/after-1536x707-bank-climb-fire.png) |
| Mission 8, mobile landscape | [image](combat-aim-evidence/before-844x390-mission8.png) | [image](combat-aim-evidence/after-844x390-mission8.png) |
| Mission 9, five targets | [image](combat-aim-evidence/before-960x540-mission9.png) | [image](combat-aim-evidence/after-960x540-mission9.png) |
| Edge fallback | [image](combat-aim-evidence/before-960x540-edge.png) | [image](combat-aim-evidence/after-960x540-edge.png) |

Browser fixture checks also cover duplicate spawn, reordered state, remove-before-spawn, bounded 300-spawn stress and zero active visuals after cleanup. A Chromium touch sequence was delivered to FIRE; this is not an iPhone test.

## 7. Performance

Measurements and raw samples: [baseline](combat-aim-evidence/baseline-visual.json), [candidate](combat-aim-evidence/candidate-visual.json). Both use headless Chrome/SwiftShader, the same five-target scene, continuous predicted firing, 30 warmup frames and 120 measured frames. Software rendering is unsuitable for device FPS acceptance. The shared 20-candidate/intercept microbenchmark measured approximately 0.004ms/update in the final test batch.

| Sample | Mean frame interval | p95 |
| --- | --- | --- |
| Baseline | 72.34 ms | 80.30 ms |
| Candidate | 74.75 ms | 93.00 ms |

The candidate mean was 3.3% higher in this sample, with a noisier tail. A separate packed synchronous render loop measured 2.73ms baseline versus 18.99ms candidate per dispatch; queued software GPU work and the candidate’s preceding 256-visual stress make that an unequal FPS comparison. The discrepancy remains a hardware profiling/acceptance concern. Neither measurement proves performance parity.

Projectile stress stayed within the 256-visual cap and returned to zero active visuals. These short controlled samples do not establish long-session memory behavior or city-streaming performance on hardware.

## 8. Open issues and coverage limits

- Five preexisting failing assertions prevent a fully green regression gate.
- All 24 missions were not played through; M8/M9 live encounter checks are targeted tests, not completion runs.
- Physical iPhone/Android input, real network latency/loss, live browser-versus-server impact presentation and sustained hardware FPS require acceptance QA.
- Browser renderer fixtures isolate the feature; they do not prove every existing responsive breakpoint or all city-streaming conditions.

## 9. Release readiness

Local candidate available for review; verification is **PARTIAL** for the reasons above. Protocol version is now **29**: client and server must be released together. No production or staging deployment is authorized or performed. Do not install this client against an older server. Existing multiplayer release gates remain unchanged.
