export const PRODUCTION_BACKEND_ORIGIN: 'https://fly.vadensoftware.com';
export const NATIVE_APP_ORIGINS: readonly ['capacitor://localhost', 'https://localhost'];

export function resolveTransport(options: {
  native: boolean;
  development: boolean;
  pageOrigin: string;
  webSocketOverride?: string;
  nativeBackendOrigin?: string;
}): { apiOrigin: string; websocketOrigin: string };

export function reconnectDelay(attempt: number, random?: () => number): number;
