import { createHash, createPrivateKey, createPublicKey, sign, verify, type JsonWebKey } from 'node:crypto';

export type OAuthProvider = 'google' | 'apple';

export type OAuthProviderConfig = {
  provider: OAuthProvider;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  teamId?: string;
  keyId?: string;
  privateKey?: string;
};

export type VerifiedProviderIdentity = {
  provider: OAuthProvider;
  subject: string;
  email?: string;
  displayName?: string;
  tokenHash: string;
  expiresAt: number;
};

type JwtHeader = { alg?: unknown; kid?: unknown; typ?: unknown };
type JwtClaims = Record<string, unknown>;
type Jwks = { keys?: JsonWebKey[] };

const googleIssuer = new Set(['https://accounts.google.com', 'accounts.google.com']);
const providerMetadata = {
  google: {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
  },
  apple: {
    authorizationEndpoint: 'https://appleid.apple.com/auth/authorize',
    tokenEndpoint: 'https://appleid.apple.com/auth/token',
    jwksUri: 'https://appleid.apple.com/auth/keys',
  },
} as const;

function stringEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function privateKeyEnv(value: string | undefined): string | undefined {
  return stringEnv(value)?.replace(/\\n/g, '\n');
}

export function providerConfig(provider: OAuthProvider, environment: NodeJS.ProcessEnv = process.env): OAuthProviderConfig | undefined {
  if (provider === 'google') {
    const clientId = stringEnv(environment.AIRPORT_CHAOS_GOOGLE_CLIENT_ID);
    const redirectUri = stringEnv(environment.AIRPORT_CHAOS_GOOGLE_REDIRECT_URI);
    if (!clientId || !redirectUri) return undefined;
    return { provider, clientId, redirectUri, clientSecret: stringEnv(environment.AIRPORT_CHAOS_GOOGLE_CLIENT_SECRET) };
  }
  const clientId = stringEnv(environment.AIRPORT_CHAOS_APPLE_CLIENT_ID);
  const redirectUri = stringEnv(environment.AIRPORT_CHAOS_APPLE_REDIRECT_URI);
  const teamId = stringEnv(environment.AIRPORT_CHAOS_APPLE_TEAM_ID);
  const keyId = stringEnv(environment.AIRPORT_CHAOS_APPLE_KEY_ID);
  const privateKey = privateKeyEnv(environment.AIRPORT_CHAOS_APPLE_PRIVATE_KEY);
  if (!clientId || !redirectUri || !teamId || !keyId || !privateKey) return undefined;
  return { provider, clientId, redirectUri, teamId, keyId, privateKey };
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function parseJwtPart<T>(value: string): T {
  try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T; }
  catch { throw new Error('Provider authentication failed.'); }
}

function exactAudience(claims: JwtClaims, expected: string): boolean {
  if (claims.aud === expected) return true;
  if (!Array.isArray(claims.aud) || !claims.aud.every((entry) => typeof entry === 'string') || !claims.aud.includes(expected)) return false;
  return claims.aud.length === 1 || claims.azp === expected;
}

function verifiedEmail(claims: JwtClaims): string | undefined {
  const verified = claims.email_verified === true || claims.email_verified === 'true';
  return verified && typeof claims.email === 'string' ? claims.email : undefined;
}

/** Verifies provider signature and all identity-bearing claims. Exported for deterministic security tests. */
export function verifyProviderIdToken(
  provider: OAuthProvider,
  token: string,
  expected: { clientId: string; nonce: string; now?: number },
  jwks: Jwks,
): VerifiedProviderIdentity {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error('Provider authentication failed.');
  const header = parseJwtPart<JwtHeader>(parts[0]);
  const claims = parseJwtPart<JwtClaims>(parts[1]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('Provider authentication failed.');
  const key = jwks.keys?.find((candidate) => candidate.kid === header.kid && candidate.kty === 'RSA' && (!candidate.use || candidate.use === 'sig') && (!candidate.alg || candidate.alg === 'RS256'));
  if (!key) throw new Error('Provider authentication failed.');
  let signatureValid = false;
  try {
    signatureValid = verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
  } catch { /* generic provider failure below */ }
  if (!signatureValid) throw new Error('Provider authentication failed.');

  const nowSeconds = Math.floor((expected.now ?? Date.now()) / 1_000);
  const issuerValid = provider === 'google' ? googleIssuer.has(String(claims.iss)) : claims.iss === 'https://appleid.apple.com';
  if (!issuerValid || !exactAudience(claims, expected.clientId)) throw new Error('Provider authentication failed.');
  if (typeof claims.exp !== 'number' || claims.exp <= nowSeconds || typeof claims.iat !== 'number' || claims.iat > nowSeconds + 60) throw new Error('Provider authentication failed.');
  if (claims.nonce !== expected.nonce) throw new Error('Provider authentication failed.');
  if (typeof claims.sub !== 'string' || claims.sub.length < 1 || claims.sub.length > 255) throw new Error('Provider authentication failed.');

  return {
    provider,
    subject: claims.sub,
    email: verifiedEmail(claims),
    displayName: provider === 'google' && typeof claims.name === 'string' ? claims.name.slice(0, 200) : undefined,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    expiresAt: claims.exp * 1_000,
  };
}

export function createAuthorizationUrl(config: OAuthProviderConfig, values: { state: string; nonce: string; codeChallenge?: string }): string {
  const metadata = providerMetadata[config.provider];
  const url = new URL(metadata.authorizationEndpoint);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', config.provider === 'apple' ? 'name email' : 'openid email profile');
  url.searchParams.set('state', values.state);
  url.searchParams.set('nonce', values.nonce);
  if (config.provider === 'google') {
    if (!values.codeChallenge) throw new Error('Provider authentication failed.');
    url.searchParams.set('code_challenge', values.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('prompt', 'select_account');
  } else {
    url.searchParams.set('response_mode', 'form_post');
  }
  return url.toString();
}

function appleClientSecret(config: OAuthProviderConfig, now = Date.now()): string {
  if (!config.teamId || !config.keyId || !config.privateKey) throw new Error('Provider authentication is not configured.');
  const issuedAt = Math.floor(now / 1_000);
  const header = base64UrlJson({ alg: 'ES256', kid: config.keyId, typ: 'JWT' });
  const claims = base64UrlJson({ iss: config.teamId, iat: issuedAt, exp: issuedAt + 5 * 60, aud: 'https://appleid.apple.com', sub: config.clientId });
  const signingInput = `${header}.${claims}`;
  const signature = sign('sha256', Buffer.from(signingInput), { key: createPrivateKey(config.privateKey), dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${signature.toString('base64url')}`;
}

type CachedJwks = { value: Jwks; expiresAt: number };
const jwksCache = new Map<string, CachedJwks>();

async function fetchJwks(uri: string, fetcher: typeof fetch, forceRefresh = false): Promise<Jwks> {
  const cached = jwksCache.get(uri);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.value;
  const response = await fetcher(uri, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error('Provider authentication failed.');
  const value = await response.json() as Jwks;
  if (!Array.isArray(value.keys)) throw new Error('Provider authentication failed.');
  const maxAge = /max-age=(\d+)/i.exec(response.headers.get('cache-control') ?? '')?.[1];
  const ttl = Math.min(60 * 60_000, Math.max(60_000, Number(maxAge ?? 300) * 1_000));
  jwksCache.set(uri, { value, expiresAt: Date.now() + ttl });
  return value;
}

export async function exchangeAndVerifyProviderCode(
  config: OAuthProviderConfig,
  values: { code: string; nonce: string; codeVerifier?: string },
  fetcher: typeof fetch = fetch,
): Promise<VerifiedProviderIdentity> {
  const form = new URLSearchParams({
    grant_type: 'authorization_code', code: values.code, client_id: config.clientId,
    redirect_uri: config.redirectUri,
  });
  if (config.provider === 'google') {
    if (!values.codeVerifier) throw new Error('Provider authentication failed.');
    form.set('code_verifier', values.codeVerifier);
    if (config.clientSecret) form.set('client_secret', config.clientSecret);
  } else {
    form.set('client_secret', appleClientSecret(config));
  }
  const response = await fetcher(providerMetadata[config.provider].tokenEndpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: form, signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Provider authentication failed.');
  const payload = await response.json() as { id_token?: unknown };
  if (typeof payload.id_token !== 'string') throw new Error('Provider authentication failed.');
  const jwksUri = providerMetadata[config.provider].jwksUri;
  const expected = { clientId: config.clientId, nonce: values.nonce };
  try {
    return verifyProviderIdToken(config.provider, payload.id_token, expected, await fetchJwks(jwksUri, fetcher));
  } catch {
    // Refresh once for normal provider key rotation; the caller still receives only a generic failure.
    return verifyProviderIdToken(config.provider, payload.id_token, expected, await fetchJwks(jwksUri, fetcher, true));
  }
}

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
