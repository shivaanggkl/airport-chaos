import { Capacitor, registerPlugin } from '@capacitor/core';

export type NativeAuthProvider = 'google' | 'apple';
export type NativeAuthPlatform = 'ios' | 'android';
export type NativeAuthChallenge = {
  provider: NativeAuthProvider;
  platform: NativeAuthPlatform;
  state: string;
  nonce: string;
  iosClientId?: string;
  serverClientId?: string;
};
export type NativeAuthCredential = { idToken: string; displayName?: string; cancelled?: false } | { cancelled: true };

const NativeIdentity = registerPlugin<{
  authenticate(options: NativeAuthChallenge): Promise<NativeAuthCredential>;
  signOut(): Promise<void>;
}>('NativeIdentity');

const platform = Capacitor.getPlatform();
export const nativeAuthPlatform: NativeAuthPlatform | undefined =
  Capacitor.isNativePlatform() && (platform === 'ios' || platform === 'android') ? platform : undefined;

export const availableNativeProviders: readonly NativeAuthProvider[] =
  nativeAuthPlatform === 'android' ? ['google'] : ['google', 'apple'];

export async function acquireNativeCredential(challenge: NativeAuthChallenge): Promise<NativeAuthCredential> {
  if (!nativeAuthPlatform || challenge.platform !== nativeAuthPlatform) throw new Error('Native sign-in is unavailable.');
  return NativeIdentity.authenticate(challenge);
}

export async function clearNativeProviderState(): Promise<void> {
  if (!nativeAuthPlatform) return;
  try { await NativeIdentity.signOut(); }
  catch { /* First-party logout remains authoritative if a provider SDK is unavailable. */ }
}
