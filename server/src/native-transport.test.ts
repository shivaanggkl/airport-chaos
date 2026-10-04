import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { NATIVE_APP_ORIGINS, PRODUCTION_BACKEND_ORIGIN, reconnectDelay, resolveTransport } from '../../shared/native-transport.mjs';
import { isTrustedRequestOrigin, nativePlatformForOrigin } from './request-origin.js';

test('native transport uses the single secure production backend while web remains same-origin', () => {
  assert.equal(PRODUCTION_BACKEND_ORIGIN, 'https://fly.vadensoftware.com');
  assert.deepEqual(resolveTransport({ native: true, development: false, pageOrigin: 'capacitor://localhost' }), {
    apiOrigin: 'https://fly.vadensoftware.com', websocketOrigin: 'wss://fly.vadensoftware.com',
  });
  assert.deepEqual(resolveTransport({ native: true, development: false, pageOrigin: 'https://localhost' }), {
    apiOrigin: 'https://fly.vadensoftware.com', websocketOrigin: 'wss://fly.vadensoftware.com',
  });
  assert.deepEqual(resolveTransport({ native: false, development: false, pageOrigin: 'https://fly.vadensoftware.com' }), {
    apiOrigin: 'https://fly.vadensoftware.com', websocketOrigin: 'wss://fly.vadensoftware.com',
  });
  assert.throws(() => resolveTransport({ native: false, development: false, pageOrigin: 'http://production.example' }), /requires HTTPS/);
});

test('native and web origin allowlist is exact', () => {
  assert.deepEqual(NATIVE_APP_ORIGINS, ['capacitor://localhost', 'https://localhost']);
  for (const origin of NATIVE_APP_ORIGINS) {
    assert.equal(isTrustedRequestOrigin(origin, 'fly.vadensoftware.com', PRODUCTION_BACKEND_ORIGIN), true);
  }
  assert.equal(isTrustedRequestOrigin(PRODUCTION_BACKEND_ORIGIN, 'fly.vadensoftware.com', PRODUCTION_BACKEND_ORIGIN), true);
  assert.equal(isTrustedRequestOrigin('https://attacker.example', 'fly.vadensoftware.com', PRODUCTION_BACKEND_ORIGIN), false);
  assert.equal(isTrustedRequestOrigin('capacitor://attacker.example', 'fly.vadensoftware.com', PRODUCTION_BACKEND_ORIGIN), false);
  assert.equal(isTrustedRequestOrigin(undefined, 'fly.vadensoftware.com', PRODUCTION_BACKEND_ORIGIN), false);
  assert.equal(nativePlatformForOrigin('capacitor://localhost'), 'ios');
  assert.equal(nativePlatformForOrigin('https://localhost'), 'android');
  assert.equal(nativePlatformForOrigin(PRODUCTION_BACKEND_ORIGIN), undefined);
  assert.equal(nativePlatformForOrigin('capacitor://attacker.example'), undefined);
});

test('native auth uses official SDK adapters and never accepts client account authority', () => {
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../../client/src/native-auth.ts', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const swift = readFileSync(new URL('../../native-auth/ios/Sources/NativeAuthPlugin/NativeAuthPlugin.swift', import.meta.url), 'utf8');
  const java = readFileSync(new URL('../../native-auth/android/src/main/java/com/vadensoftware/airportchaos/nativeauth/NativeAuthPlugin.java', import.meta.url), 'utf8');
  const gradle = readFileSync(new URL('../../native-auth/android/build.gradle', import.meta.url), 'utf8');
  const packageSwift = readFileSync(new URL('../../native-auth/Package.swift', import.meta.url), 'utf8');
  const entitlement = readFileSync(new URL('../../ios/App/App/App.entitlements', import.meta.url), 'utf8');
  const nativeRoutes = server.slice(server.indexOf("if (requestUrl.pathname === '/api/auth/native/start')"), server.indexOf("if (requestUrl.pathname === '/api/auth/oauth/start')"));

  assert.match(nativeRoutes, /nativeAuthPlatform\(request\)/);
  assert.match(nativeRoutes, /verifyNativeProviderToken\(config, idToken, flow\.nonce\)/);
  assert.match(nativeRoutes, /flow\.session\.tokenHash !== identity\.session\.tokenHash/);
  assert.match(nativeRoutes, /completeProviderAuth\(flow, verified\)/);
  assert.match(nativeRoutes, /closeSessionConnections\(flow\.session\.tokenHash\)/);
  assert.doesNotMatch(nativeRoutes, /payload\.(?:accountId|pilotId)/);
  assert.match(client, /nativeAuthPlatform === 'android' \? \['google'\] : \['google', 'apple'\]/);
  assert.doesNotMatch(client, /localStorage|sessionStorage/);
  assert.match(main, /credential\.idToken = ''/);
  assert.match(swift, /import GoogleSignIn/);
  assert.match(swift, /import AuthenticationServices/);
  assert.match(swift, /additionalScopes: \[\]/);
  assert.match(swift, /request\.nonce = nonce/);
  assert.match(swift, /credential\.state == appleState/);
  assert.match(java, /CredentialManager/);
  assert.match(java, /GetSignInWithGoogleOption/);
  assert.match(java, /\.setNonce\(nonce\)/);
  assert.match(gradle, /androidx\.credentials:credentials:1\.6\.0/);
  assert.match(gradle, /googleid:1\.2\.1/);
  assert.match(packageSwift, /GoogleSignIn-iOS\.git", exact: "9\.2\.0"/);
  assert.match(entitlement, /com\.apple\.developer\.applesignin/);
});

test('web and native provider-link API requests are rejected before OAuth starts', () => {
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  const nativeStart = server.slice(server.indexOf("if (requestUrl.pathname === '/api/auth/native/start')"), server.indexOf("if (requestUrl.pathname === '/api/auth/native/complete')"));
  const oauthStart = server.slice(server.indexOf("if (requestUrl.pathname === '/api/auth/oauth/start')"), server.indexOf("if (requestUrl.pathname === '/api/auth/signup'"));
  for (const route of [nativeStart, oauthStart]) {
    assert.match(route, /if \(action === 'link'\) \{ jsonResponse\(response, 409, \{ error: 'ACCOUNT_LINKING_DISABLED' \}\); return; \}/);
    assert.ok(route.indexOf("action === 'link'") < route.indexOf('beginOAuthFlow('));
  }
});

test('reconnect backoff is bounded and jittered', () => {
  assert.equal(reconnectDelay(0, () => 0), 600);
  assert.equal(reconnectDelay(0, () => 1), 900);
  assert.ok(reconnectDelay(4, () => 0.5) > reconnectDelay(1, () => 0.5));
  assert.equal(reconnectDelay(20, () => 1), 30_000);
});

test('client uses one transport for REST and WebSocket and has no Capacitor server URL', () => {
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const transport = readFileSync(new URL('../../client/src/transport.ts', import.meta.url), 'utf8');
  const bootstrap = readFileSync(new URL('../../client/src/bootstrap.ts', import.meta.url), 'utf8');
  const checkout = readFileSync(new URL('../../client/src/firehawk-checkout.ts', import.meta.url), 'utf8');
  const capacitor = readFileSync(new URL('../../capacitor.config.ts', import.meta.url), 'utf8');
  assert.match(main, /await realtimeUrl\(\)/);
  assert.match(main, /apiFetch\(apiUrl\(/);
  assert.match(bootstrap, /apiFetch/);
  assert.match(checkout, /apiFetch/);
  assert.match(transport, /Capacitor\.getPlatform\(\) === 'ios'/);
  assert.match(transport, /SecureSessionHttp\.request/);
  assert.match(transport, /apiFetch\('\/api\/realtime-ticket'/);
  assert.doesNotMatch(transport, /localStorage|sessionStorage/);
  assert.match(transport, /fetch\(url, \{ \.\.\.init, credentials: 'include'/);
  assert.doesNotMatch(main, /new URL\(import\.meta\.env\.VITE_WS_URL/);
  assert.doesNotMatch(capacitor, /server:\s*\{[^}]*url:/s);
});

test('iOS secure session transport keeps cookies native and constrains its production boundary', () => {
  const swift = readFileSync(new URL('../../ios/App/App/SecureSessionTransport.swift', import.meta.url), 'utf8');
  const plist = readFileSync(new URL('../../ios/App/App/Info.plist', import.meta.url), 'utf8');
  const capacitor = readFileSync(new URL('../../capacitor.config.ts', import.meta.url), 'utf8');
  assert.match(swift, /https:\/\/fly\.vadensoftware\.com/);
  assert.match(swift, /private let nativeOrigin = "capacitor:\/\/localhost"/);
  assert.match(swift, /lowerName != "set-cookie" && lowerName != "set-cookie2"/);
  assert.match(swift, /WKWebsiteDataStore\.default\(\)\.httpCookieStore\.setCookie/);
  assert.doesNotMatch(swift, /call\.resolve\([^)]*(?:cookie|token)/is);
  assert.match(plist, /<key>WKAppBoundDomains<\/key>[\s\S]*<string>fly\.vadensoftware\.com<\/string>/);
  assert.match(capacitor, /limitsNavigationsToAppBoundDomains:\s*true/);
  assert.doesNotMatch(capacitor, /CapacitorHttp|CapacitorCookies/);
});

test('realtime ticket issuance accepts a secure account or guest session', () => {
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  const route = server.slice(server.indexOf("if (requestUrl.pathname === '/api/realtime-ticket')"), server.indexOf('const publicPolicy'));
  assert.match(route, /pilotSessions\.resolveSession\(request\.headers\.cookie\)/);
  assert.match(route, /if \(!session\)[\s\S]*jsonResponse\(response, 401, \{ error: 'Secure session required\.' \}\)/);
  assert.doesNotMatch(route, /authenticatedIdentity\(/);
});

test('account and guest gameplay derive identity from a secure server session', () => {
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  const sessionIdentity = server.slice(server.indexOf('function sessionIdentity('), server.indexOf('function closeSessionConnections('));
  const profileRoute = server.slice(server.indexOf("if (requestUrl.pathname === '/api/profile')"), server.indexOf("if (request.method !== 'GET' && request.method !== 'HEAD')"));
  const identityResolver = server.slice(server.indexOf('function authenticatedIdentity('), server.indexOf('function sessionIdentity('));
  assert.match(sessionIdentity, /return session \? \{ pilotId: session\.pilotId/);
  assert.doesNotMatch(profileRoute, /Sign in to continue\./);
  assert.doesNotMatch(profileRoute, /payload\?\.(?:pilotId|accountId|userId)/);
  assert.match(identityResolver, /if \(resolved\) return \{ pilotId: resolved\.pilotId/);
});

test('new password accounts are disabled while historical password records remain untouched', () => {
  const server = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  const signup = server.slice(server.indexOf("if (requestUrl.pathname === '/api/auth/signup')"), server.indexOf("if (requestUrl.pathname === '/api/auth/login')"));
  assert.match(signup, /jsonResponse\(response, 410,[\s\S]*Use Google or Apple to save progress across devices\./);
});

test('native offline recovery probes only while connectivity remains down', () => {
  const connectivity = readFileSync(new URL('../../client/src/connectivity.ts', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  assert.match(connectivity, /const nativeRuntime = Capacitor\.isNativePlatform\(\)/);
  assert.match(connectivity, /if \(!active \|\| !nativeRuntime \|\| last\)/);
  assert.match(connectivity, /window\.setInterval\(\(\) => void refreshNativeStatus\(\), 2_000\)/);
  assert.match(connectivity, /if \(!connected && recoveryProbe\) connected = await recoveryProbe\(\)/);
  assert.match(connectivity, /if \(next\.connected\) publish\(true\);[\s\S]*else void refreshNativeStatus\(\)/);
  assert.match(connectivity, /window\.clearInterval\(offlineProbeTimer\)/);
  assert.match(main, /apiFetch\(apiUrl\('\/api\/auth\/status'\), \{ cache: 'no-store' \}\)/);
  assert.match(main, /REALTIME_WELCOME_TIMEOUT_MS = 10_000/);
  assert.match(main, /replaceRealtimeSocket\('Realtime handshake timed out'\)/);
  assert.match(main, /window\.clearTimeout\(welcomeTimeout\)/);
});

test('gameplay bootstrap is not blocked by the initial realtime ticket request', () => {
  const main = readFileSync(new URL('../../client/src/main.ts', import.meta.url), 'utf8');
  const bootstrap = readFileSync(new URL('../../client/src/bootstrap.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /new WebSocket\(await realtimeSocketUrl\(\)\)/);
  assert.match(main, /let socket!: WebSocket/);
  assert.match(main, /setConnectionWarning\(true\);\s*void replaceRealtimeSocket\('Initial connection'\)/);
  assert.match(bootstrap, /enterCity\(city, preset\)\.catch/);
  assert.match(bootstrap, /showSelector\('Unable to load this city\.'\)/);
});
