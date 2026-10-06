# Product analytics event contract

The existing `AnalyticsStore` writes bounded events to the protected SQLite analytics tables. The authenticated `/admin/analytics` view reads those events and the authoritative account, referral, purchase, and wallet tables. Client telemetry is observational; it never grants rewards or changes game state.

| Owner | Events | Moment and properties |
| --- | --- | --- |
| Client intent | `hub_viewed`, `fly_clicked`, `rewards_viewed`, `garage_opened` | One real entry or click; no user-supplied properties. |
| Client intent | `city_selected`, `aircraft_selected`, `aircraft_viewed` | Actual selection; only bounded `cityId` or `aircraftType`. |
| Client intent | `daily_reward_claim_clicked`, `rewarded_ad_offer_viewed`, `rewarded_ad_no_fill` | Player action or provider availability; never reward proof. |
| Client intent | `referral_screen_viewed`, `referral_share_started`, `referral_link_copied`, `firehawk_purchase_clicked` | Actual player actions. |
| Server account | `account_created`, `referral_signup_attributed` | New account committed; acquisition is `referral` or `unknown`. |
| Server flight | `flight_started`, `flight_activated`, `flight_landed`, `flight_crashed`, `flight_ended` | Real normal-flight session; activation is one durable 60-second airborne milestone per pilot. `flight_ended` carries bounded duration, airborne time, distance, score, gameplay Credits, kills, landings, and missions. |
| Server rewards | `daily_reward_available`, `daily_reward_claimed`, `rewarded_ad_verified`, `rewarded_ad_reward_granted` | Available state once per claim cycle; successful wallet commit or verified provider grant. Amount and reward day are server-derived. |
| Server referral | `referral_qualified`, `referral_inviter_rewarded`, `referral_new_player_rewarded`, `referral_cap_reached` | Atomic referral payout result; emitted once, including when the inviter is offline. |
| Server ownership | `aircraft_unlocked`, `combat_kill`, `mission_completed`, `territory_captured` | Authoritative committed outcome. |
| Firehawk | `firehawk_viewed`, `firehawk_trial_started`, `firehawk_trial_completed`, `firehawk_purchase_started`, `firehawk_purchase_succeeded`, `firehawk_purchase_failed`, `firehawk_restore_succeeded` | View/click is intent; trial, purchase, and restore outcomes follow server validation. |

All names are lowercase snake case. Existing legacy event names remain queryable, and active Firehawk call sites normalize to canonical names when written. Server events use opaque pilot and flight IDs. An opaque browser visit ID links Hub and flight events in `journey_id`. Platform is `desktop_web`, `mobile_web`, `ios`, `android`, or `unknown`; city and aircraft use their existing identifiers. No email, pilot name, provider subject, token, IP, or payment credential belongs in event metadata.

Retention uses a return during hours 24–48 (D1) or days 7–8 (D7) after account creation; gameplay return requires `flight_started`. `Gameplay Earn Share` divides gameplay Credit grants by all free Credit grants, excluding migration and admin adjustments. Credit source and sink totals come from `wallet_transactions`; provider revenue comes from verified purchase records, not ad Credit grants. History before this event contract can have incomplete funnels.
