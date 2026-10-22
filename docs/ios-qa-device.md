# iPhone staging QA

The `qa` branch is based on `staging` and holds changes for device testing before they are merged. From either checkout, run `bash scripts/install-ios-qa.sh` with the paired iPhone connected. This builds the current local web assets, points them at the existing staging backend, and installs them as `Airport Chaos QA`. A local install does not trigger a Render deploy. Server changes on `qa` are not active on the staging backend until deployed separately. Set `QA_DEVICE_ID` if the paired device changes.

The default build uses the existing signed app ID, so it replaces the staging app on the phone; a later staging install replaces QA. A side-by-side QA app needs a separately provisioned Apple app ID. After that is configured, set `QA_BUNDLE_ID` to the new ID when running the installer.

Only client changes compatible with the current staging server can be tested this way. Server code, database changes, and protocol changes need a reachable matching QA backend before phone testing. Native Apple purchases and provider sign-in may require separate Apple/Google app registration for the QA bundle ID; use email/password for ordinary gameplay QA until those integrations are configured.

For parallel Codex tasks, use a separate branch and worktree only while the task is active. Integrate completed commits into `staging`, remove the temporary branch and worktree, then run the installer once. Never let two threads edit the same staging checkout or install to the same iPhone concurrently. Pushing `staging` triggers its Render deployment, so make sure the staging backend matches the client before testing server-dependent changes on the phone.
