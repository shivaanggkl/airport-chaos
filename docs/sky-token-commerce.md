# Sky Token commerce rollout

Commerce is disabled by default. Existing Firehawk direct purchases and restores remain available until the Token feature is enabled for the relevant platform. Keep historical Stripe, Apple, and Google purchase verification configured for restores and refunds.

## Products

Create these **consumable, repeatable** products in App Store Connect and Google Play Console. Native storefront prices may be localized. Stripe test and live Price IDs are mapped to these packs in `server/src/sky-token-payments.ts`.

| Pack | Tokens | USD base | Apple product ID | Google product ID |
| --- | ---: | ---: | --- | --- |
| SKY_TOKENS_100 | 100 | $1 | `com.vadensoftware.airportchaos.skytokens100` | `sky_tokens_100` |
| SKY_TOKENS_500 | 500 | $5 | `com.vadensoftware.airportchaos.skytokens500` | `sky_tokens_500` |
| SKY_TOKENS_1200 | 1,200 | $12 | `com.vadensoftware.airportchaos.skytokens1200` | `sky_tokens_1200` |
| SKY_TOKENS_2400 | 2,400 | $24 | `com.vadensoftware.airportchaos.skytokens2400` | `sky_tokens_2400` |

The shared catalog in `shared/sky-token-economy.mjs` is the quantity and product-ID source. Keep the small native plugin product allowlists aligned with it when products change.

For a support case, run `node scripts/inspect-sky-token-purchase.mjs <profile-db> <stripe|apple|google> <provider-transaction-id>` against an authorized database copy to inspect the purchase, matching Token ledger entries, and current wallet without exposing a public history endpoint.

## Verification and enablement

### Isolated Render staging

Create a separate Render Blueprint from `render.staging.yaml` on a staging-only Git branch. Do not attach that Blueprint to the production `airport-chaos` service. The staging service has its own persistent disk and SQLite profile database; accounts, wallets, purchase records, and analytics therefore start empty and stay separate from production. Create a test account through the normal email/password signup flow.

Confirm that Render assigned `https://airport-chaos-staging.onrender.com` before using the Blueprint's configured `AIRPORT_CHAOS_WEB_ORIGIN`. If Render assigns another hostname, update **only the staging service's** origin to its actual HTTPS URL. Set `STRIPE_SECRET_KEY` to the Stripe **test** key in the staging service's secret environment settings. The staging Blueprint sets `STRIPE_MODE=test`, enables the general Sky Token flag, and keeps live/native flags false; checkout stays closed until a valid test `STRIPE_WEBHOOK_SECRET` is added. Do not copy production credentials or data to staging.

Once the staging URL is live, register its existing `/api/stripe/webhook` route as a **test-mode** Stripe destination for the four checkout/refund events listed below, then set the resulting test signing secret on staging and redeploy. Verify a fresh test account can start Checkout, both success/cancel links return to staging, and a verified webhook updates only the staging wallet. Production's feature flags and webhook configuration remain separate.

- In test/staging, set `STRIPE_MODE=test`, a test `STRIPE_SECRET_KEY`, a test `STRIPE_WEBHOOK_SECRET`, and an explicit non-production `AIRPORT_CHAOS_WEB_ORIGIN`. Register `AIRPORT_CHAOS_WEB_ORIGIN/api/stripe/webhook` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, and `charge.refunded`. Checkout returns to the same configured origin. The existing webhook verifies signatures and rejects the wrong Stripe mode.
- Production uses `STRIPE_MODE=live`, live credentials, and `AIRPORT_CHAOS_WEB_ORIGIN=https://fly.vadensoftware.com`. Keep `AIRPORT_CHAOS_SKY_TOKEN_COMMERCE_ENABLED=false` and `AIRPORT_CHAOS_SKY_TOKEN_LIVE_ENABLED=false` until test purchase and refund QA passes. Any legacy `STRIPE_SKY_TOKENS_*_PRICE_ID` environment values must match the selected catalog exactly.
- Configure Apple App Store Server Notifications V2 at `/api/store/apple/notifications`, with the existing StoreKit verification certificates and environment.
- Configure Google Play real-time developer notifications, including voided purchases, at `/api/store/google/notifications` with the existing authenticated Pub/Sub push setup and Play service account.
- Enable `AIRPORT_CHAOS_SKY_TOKEN_COMMERCE_ENABLED` only in an isolated test/staging deployment for test purchase, retry, refund, reinstall, cross-device balance, and historical Firehawk restore QA. Keep production and native platform flags off until their own provider checks pass.
- Run a production purchase/refund reconciliation through provider dashboards after rollout. The game never credits Tokens from a client-only purchase callback.
