# QA test repair

All 36 failures identified during feature integration are addressed. Production build passes; the complete discovered server suite passes **749/749**, with no failures or skipped tests.

## Causes and changes

- UI assertions referred to retired backgrounds, navigation paths, profile layout, settings placement and a removed reminder/promotion. Updated them against the existing implementation, retaining authentication, safe-link, responsive, preflight and routing checks.
- Mission 11/12 tests still exercised retired Gravity Drop/Sky Pendulum gate definitions. Nine obsolete route checks are replaced by eight current Armored Fortress/Final Intercept contract tests. Prerequisites, preflight, ownership, timeouts, turret/core ordering, escort gating, wallet caps and replay behavior are verified. Existing mesh collision, phase-order and live combat tests remain and pass.
- The live sponsorship HTTP test queried a hard-coded UTC date although the server correctly records current UTC. Its live campaign/report fixture now follows wall-clock time, while deterministic campaign-boundary unit tests retain their fixed clock.
- Replaced the old map-generator source-string assertion with a real temporary-data run verifying provenance, attribution and license preservation, including unchanged Near geometry. No tracked city data was regenerated.
- Redline's fixed tuned thresholds remain unchanged. Its test verifies they are positive and attainable at the actual FAST throttle stop; corrected the obsolete 75% comment. Contact-radius tests respect aircraft-specific presentation scale and floating-point precision.

No gameplay, economy, flight controls, pricing, native or server behavior changed. The edits are tests plus the obsolete speed-threshold comment. No failing test was skipped or disabled.

Detailed mapping: [qa-test-repair-validation.json](qa-test-repair-validation.json).

Earlier integration/combat reports are historical snapshots; this report records the subsequent green automated gate. This is not new physical-device or sustained hardware performance verification.
