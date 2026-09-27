import type { PluginListenerHandle } from '@capacitor/core';
import { Network } from '@capacitor/network';

export type ConnectivityListener = (connected: boolean) => void;

export async function monitorConnectivity(listener: ConnectivityListener): Promise<() => void> {
  let active = true;
  let last = navigator.onLine;
  let nativeHandle: PluginListenerHandle | undefined;
  const publish = (connected: boolean) => {
    if (!active || connected === last) return;
    last = connected;
    listener(connected);
  };
  const online = () => publish(true);
  const offline = () => publish(false);
  window.addEventListener('online', online);
  window.addEventListener('offline', offline);

  try {
    const status = await Network.getStatus();
    if (active) {
      publish(status.connected);
      nativeHandle = await Network.addListener('networkStatusChange', (next) => publish(next.connected));
    }
  } catch { /* browser online/offline events remain the fallback */ }

  return () => {
    active = false;
    window.removeEventListener('online', online);
    window.removeEventListener('offline', offline);
    void nativeHandle?.remove();
  };
}
