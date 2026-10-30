# Reticle and nearby acquisition — QA closure

## Changes

- Reticle reduced from 112 to 96 px. Removed the separate box around a selected aircraft.
- Locked readiness colours only the circle red. Brackets stay cyan; confirmed-hit flashes affect only the circle.
- Automatic aiming now covers the existing shared acquisition cone instead of the narrower 0.10 rad assist cone. The same shared rule applies across combat missions and multiplayer; target protection remains authoritative.
- Server readiness recomputes a feasible intercept and checks aircraft alignment against the existing authoritative aircraft hit radius. The previous broad angular predicate could report a lock while the bullet would miss by a large distance.
- The client colours the circle directly from a fresh server-confirmed lock, without a duplicate geometric test against a delayed world position.

Bullet travel remains capped at 4500 world units. Current target distance alone does not prove that an escaping target can be intercepted within that travel budget. A red firing solution predicts current motion; it cannot guarantee a hit if the target subsequently dodges. Bullets remain straight, independent and server-authoritative.

## Evidence

40 unique targeted tests passed across the final runs: aim envelope, interception, nearby automatic convergence, projectile integration, mission targeting, warnings, UI contracts, protections and Sky Duel integration. An obsolete source-text range assertion failed on the first run because the range check moved into a shared helper; it was updated and rerun successfully. No gameplay assertion was weakened.

The real-server projectile test now reproduces a nearby contact 200 units sideways, 35 above and 730 ahead. It verifies selection before lock, automatic convergence beyond the old assist cone, accepted firing and actual damage on travelling-bullet arrival. Mission 8/9/10 transport-to-escort targeting and Sky Duel combat/reconnect/payout integration passed.

Client, server and native iOS builds passed. Latest QA client installed wirelessly and launched on the iPhone. Visual fixture checks: 96 px at both FOVs, red circle, cyan brackets, zero extra target boxes, no browser errors, bounded rounds and zero rounds after clearing. This fixture is not physical-device gameplay acceptance or a new 100-aircraft performance approval.

[Focused results](combat-reticle-qa-evidence/focused.tap), [off-centre server result](combat-reticle-qa-evidence/offcentre-integration.tap), [visual checks](combat-reticle-qa-evidence/visual.json), [fixture image](combat-reticle-qa-evidence/visual-fixture.png).

## Delivery

User explicitly authorized committing the current QA combat changes, pushing QA, merging into staging and deploying staging. This includes the previously uncommitted combat capacity and performance fixes documented in [the earlier bounded scale investigation](combat-scale-qa.md). Its 100-client limits remain unresolved; these reticle corrections do not constitute 100-plane readiness approval. Production is outside this deployment's scope.

## Moving-target correction

The first reticle patch was too strict: a fixed two-unit threshold ignored the real aircraft hit size, and the client independently compared a delayed lead point against its newer aircraft transform. This suppressed the red circle during ordinary movement. The duplicate client gate is removed; aircraft readiness uses the existing collision radius without modifying collisions or damage.

Follow-up validation: 19 focused tests passed, the extended real-server airborne test acquired and hit a moving target, and Mission 8/9/10 transport-to-escort integration passed (21 tests total). Client, server and iOS builds passed. Matching QA client installed wirelessly. No new controls, UI elements, firing rates, weapon range or damage rules.

## Selected-target positioning and acquisition correction

The circle previously projected the ballistic lead ray while naming the selected aircraft. It now anchors to the selected aircraft's rendered position (or selected transport objective), returning to the firing guide without a confirmed candidate. Bullets retain server-authoritative predictive lead; the circle is the target marker, not a promise that the target cannot dodge.

A fresh empty server candidate previously overwrote a newly eligible local candidate before sending its lock request. Local candidates now wake the confirmation request immediately; only a fresh server-confirmed target can turn red. Server eligibility, protection, damage and ballistics are unchanged by this correction.

Matched client runtime fixtures against `2ccadc1` reproduced a maximum 78.60 px marker offset through tested turns/banks, reduced to zero after the correction. The new-candidate request check changed from false to true; unconfirmed candidates stayed neutral in both versions. Both runs had zero browser errors. These are controlled runtime fixtures, not physical-device gameplay approval. Twenty-one focused automated tests and the client build passed.
