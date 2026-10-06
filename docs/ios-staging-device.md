# Install the staging iPhone build

The Capacitor app bundles local web assets. `npm run cap:sync:ios:staging` builds those assets with the staging HTTPS API and WSS origin, then copies them into the existing iOS project. Xcode **Debug** pins the native HTTP bridge and app-bound domain to `airport-chaos-staging.onrender.com`; **Release** retains `fly.vadensoftware.com`. A mismatched JavaScript/native host fails closed for native API requests.

The staging iPhone build shows the production Hub's compact **Get Sky Tokens** panel after sign-in, using the staging catalog for pack quantities and prices. Garage also shows Sky Token aircraft and paint prices. Token purchase and unlock buttons stay disabled until Apple Sandbox commerce is configured and enabled on the staging server. The separate Store screen is not part of the approved Hub on either environment.

Staging uses a separate on-device player cache. Reinstalling the staging build over the production app therefore cannot reuse its cached pilot, Credits, or aircraft as staging data. Sign into a staging account to see its authoritative wallet and the Token preview; the original production cache remains available to a later production build.

From the repository root, with the paired iPhone connected:

```bash
npm run cap:sync:ios:staging
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination 'platform=iOS,id=00008150-001269A21132401C' -derivedDataPath /tmp/airport-chaos-staging-derived -allowProvisioningUpdates build
xcrun devicectl device install app --device 00008150-001269A21132401C /tmp/airport-chaos-staging-derived/Build/Products/Debug-iphoneos/App.app
xcrun devicectl device process launch --device 00008150-001269A21132401C com.vadensoftware.airportchaos
```

The device ID above is the paired `ShivaanggKl` iPhone; check `xcrun devicectl list devices` if it changes. This uses the existing bundle ID, so it replaces the installed Airport Chaos app on that phone. The production iOS path remains `npm run cap:sync:ios` followed by a **Release** build. Never reuse staging-synced web assets for a Release install.
