import { Capacitor } from '@capacitor/core';

const nativeBackendOrigin = import.meta.env.VITE_NATIVE_BACKEND_ORIGIN;

// Capacitor keeps the same WebView origin when a production app is replaced by
// a staging build. Keep the authoritative profile cache separate by backend.
export const PLAYER_STORAGE_KEY = Capacitor.isNativePlatform() && nativeBackendOrigin
  ? `airport-chaos-player-v1:${new URL(nativeBackendOrigin).host}`
  : 'airport-chaos-player-v1';
