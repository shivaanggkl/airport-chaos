# Firehawk native purchase setup

The shared server entitlement is `REDSPEAR_FIGHTER_PREMIUM`. Store proof is
verified by the Airport Chaos server before that entitlement is granted. No
store credential belongs in the iOS or Android bundle.

## App Store Connect

- Product ID: `com.vadensoftware.airportchaos.firehawk`
- Type: Non-Consumable
- Reference name: `Firehawk Permanent Unlock`
- Display name: `Firehawk`
- Description: `Permanently unlock the Firehawk aircraft in Airport Chaos.`
- United States price: exactly `$24.00 USD`
- App Store Server Notifications V2 URL:
  `https://fly.vadensoftware.com/api/store/apple/notifications`

Create the product under the existing `com.vadensoftware.airportchaos` app,
complete its localization and review metadata, and make it available to the
Apple Sandbox/TestFlight build. If App Store Connect does not offer an exact
$24.00 price point, stop instead of substituting another price.

The server needs `AIRPORT_CHAOS_APPLE_IAP_ENVIRONMENT` (`sandbox` during
Sandbox/TestFlight validation, `production` for release), the numeric App
Apple ID in `AIRPORT_CHAOS_APPLE_IAP_APP_APPLE_ID`, and Apple's public root CA
DER certificates as comma-separated base64 in
`AIRPORT_CHAOS_APPLE_IAP_ROOT_CERTIFICATES_BASE64`.

## Google Play Console

- Product ID: `firehawk`
- Product type: one-time product, permanent/non-consumed entitlement
- Display name: `Firehawk`
- Description: `Permanently unlock the Firehawk aircraft in Airport Chaos.`
- United States price: exactly `$24.00 USD`

Activate the product for an internal-testing release, add license testers, and
grant a least-privilege service account access to verify and acknowledge
purchases with the Google Play Developer API. Configure Real-time Developer
Notifications through Pub/Sub to push to
`https://fly.vadensoftware.com/api/store/google/notifications` using an OIDC
service account.

The server needs the one-line service-account JSON in
`AIRPORT_CHAOS_GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, the exact push URL in
`AIRPORT_CHAOS_GOOGLE_PLAY_PUBSUB_AUDIENCE`, and the OIDC service-account email
in `AIRPORT_CHAOS_GOOGLE_PLAY_PUBSUB_SERVICE_ACCOUNT`.

## Web Stripe

Create new immutable test and live Stripe Prices for exactly `$24.00 USD` and
set the matching `STRIPE_FIREHAWK_PRICE_ID`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, and `STRIPE_MODE` in the server environment. Existing
$9.99 purchase rows and their entitlement sources remain valid.
