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
