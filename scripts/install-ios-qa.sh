#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if [[ "$(git branch --show-current)" != qa ]]; then
  echo 'Install the iPhone QA app only from the QA branch checkout.' >&2
  exit 1
fi

lock_dir="${TMPDIR:-/tmp}/airport-chaos-qa-ios-install.lock"
if ! mkdir "$lock_dir" 2>/dev/null; then
  echo 'Another QA iPhone install is running.' >&2
  exit 1
fi
trap 'rmdir "$lock_dir"' EXIT

device_id="${QA_DEVICE_ID:-00008150-001269A21132401C}"
derived_data="${TMPDIR:-/tmp}/airport-chaos-qa-derived"
bundle_id="${QA_BUNDLE_ID:-com.vadensoftware.airportchaos}"
app_path="$derived_data/Build/Products/Debug-iphoneos/App.app"

if [[ ! -x node_modules/.bin/vite ]]; then npm ci; fi
npm run cap:sync:ios:staging
xcodebuild -quiet -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination "platform=iOS,id=$device_id" -derivedDataPath "$derived_data" \
  -allowProvisioningUpdates "PRODUCT_BUNDLE_IDENTIFIER=$bundle_id" \
  'AIRPORT_CHAOS_DISPLAY_NAME=Airport Chaos QA' build

actual_bundle_id="$(plutil -extract CFBundleIdentifier raw -o - "$app_path/Info.plist")"
if [[ "$actual_bundle_id" != "$bundle_id" ]]; then
  echo "Refusing to install unexpected app: $actual_bundle_id" >&2
  exit 1
fi

xcrun devicectl device install app --device "$device_id" "$app_path"
xcrun devicectl device process launch --device "$device_id" "$bundle_id"
