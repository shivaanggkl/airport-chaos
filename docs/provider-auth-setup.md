# Google and Apple web sign-in setup

The server owns the full authorization-code exchange. Provider secrets and tokens must never be added to the client or to a `VITE_` variable. Copy the required values from `.env.example` into the server's deployment environment.

## Google

1. In Google Cloud, configure the OAuth consent screen and create an **OAuth 2.0 Client ID → Web application**.
2. Add the deployed game origin, normally `https://fly.vadensoftware.com`, as an authorized JavaScript origin.
3. Add the exact redirect URI `https://fly.vadensoftware.com/api/auth/oauth/google/callback`.
4. Set `AIRPORT_CHAOS_GOOGLE_CLIENT_ID`, `AIRPORT_CHAOS_GOOGLE_CLIENT_SECRET`, and `AIRPORT_CHAOS_GOOGLE_REDIRECT_URI` on the server.

Google login uses the authorization-code flow with S256 PKCE, state, nonce, and server-side ID-token verification. For local testing, add the exact localhost client origin and server callback URI used by the local environment to the same Web client, then change only the local server environment values.

## Apple

1. In Apple Developer, enable **Sign in with Apple** for the primary App ID and configure a **Services ID** for the web game.
2. Associate and verify the deployed domain, then register the exact return URL `https://fly.vadensoftware.com/api/auth/oauth/apple/callback`.
3. Create a Sign in with Apple private key and record its Key ID and the developer Team ID.
4. Set `AIRPORT_CHAOS_APPLE_CLIENT_ID` to the Services ID, plus `AIRPORT_CHAOS_APPLE_TEAM_ID`, `AIRPORT_CHAOS_APPLE_KEY_ID`, `AIRPORT_CHAOS_APPLE_PRIVATE_KEY`, and `AIRPORT_CHAOS_APPLE_REDIRECT_URI` on the server.

Apple requires an HTTPS return URL on a registered domain and does not accept localhost as a web return URL. Use a registered HTTPS development domain/tunnel for an end-to-end Apple test. The private key can be supplied as multiline PEM or with literal `\n` line breaks.

After configuration, test a new guest login and explicit linking from an existing email/password account for both providers. Also repeat Apple login after the first authorization because Apple may omit name/email on later responses.

Official references: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [Apple web configuration](https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple), and [Apple token validation](https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens).
