# iPhone QA without a Render deploy

The `qa` branch is the integration branch. In its own checkout, run `bash scripts/install-ios-qa.sh` with the paired iPhone connected. This builds local web assets, points them at the existing staging backend, and installs them as `Airport Chaos QA`. No Render deploy is triggered. Set `QA_DEVICE_ID` if the paired device changes.

The default build uses the existing signed app ID, so it replaces the staging app on the phone; a later staging install replaces QA. A side-by-side QA app needs a separately provisioned Apple app ID. After that is configured, set `QA_BUNDLE_ID` to the new ID when running the installer.

Only client changes compatible with the current staging server can be tested this way. Server code, database changes, and protocol changes need a reachable matching QA backend before phone testing. Native Apple purchases and provider sign-in may require separate Apple/Google app registration for the QA bundle ID; use email/password for ordinary gameplay QA until those integrations are configured.

For parallel Codex tasks, use a separate branch and worktree per thread. Integrate completed commits into `qa` one at a time, resolve conflicts there, then run the installer once. Never let two threads edit the same QA checkout or install to the same iPhone concurrently. After QA is accepted, merge `qa` into `staging`; that push triggers the staging Render deployment. Rebuild the staging iPhone app from staging when a matching native/client update is needed.
