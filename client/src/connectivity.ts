import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Network } from '@capacitor/network';

export type ConnectivityListener = (connected: boolean) => void;
export type ConnectivityProbe = () => Promise<boolean>;

export async function monitorConnectivity(listener: ConnectivityListener, recoveryProbe?: ConnectivityProbe): Promise<() => void> {
  let active = true;
  let last = navigator.onLine;
  let nativeHandle: PluginListenerHandle | undefined;
  let nativeAvailable = false;
  let nativeProbeInFlight = false;
  let offlineProbeTimer: number | undefined;
  const nativeRuntime = Capacitor.isNativePlatform();
  const refreshNativeStatus = async () => {
    if (!active || !nativeAvailable || nativeProbeInFlight) return;
    nativeProbeInFlight = true;
    try {
      const status = await Network.getStatus();
      let connected = status.connected;
      if (!connected && recoveryProbe) connected = await recoveryProbe();
      publish(connected);
    } catch { /* native listener and browser events remain authoritative */ }
    finally { nativeProbeInFlight = false; }
  };
  const updateOfflineProbe = () => {
    if (!active || !nativeRuntime || last) {
      window.clearInterval(offlineProbeTimer);
      offlineProbeTimer = undefined;
      return;
    }
    offlineProbeTimer ??= window.setInterval(() => void refreshNativeStatus(), 2_000);
  };
  const publish = (connected: boolean) => {
    if (!active) return;
    const changed = connected !== last;
    last = connected;
    updateOfflineProbe();
    if (changed) listener(connected);
  };
  const online = () => publish(true);
  const offline = () => publish(false);
  const visibilityChanged = () => { if (!document.hidden) void refreshNativeStatus(); };
  window.addEventListener('online', online);
  window.addEventListener('offline', offline);
  document.addEventListener('visibilitychange', visibilityChanged);

  try {
    const status = await Network.getStatus();
    if (active) {
      nativeAvailable = true;
      let connected = status.connected;
      if (!connected && recoveryProbe) connected = await recoveryProbe();
      publish(connected);
      nativeHandle = await Network.addListener('networkStatusChange', (next) => {
        if (next.connected) publish(true);
        else void refreshNativeStatus();
      });
    }
  } catch { /* browser online/offline events remain the fallback */ }

  return () => {
    active = false;
    window.clearInterval(offlineProbeTimer);
    window.removeEventListener('online', online);
    window.removeEventListener('offline', offline);
    document.removeEventListener('visibilitychange', visibilityChanged);
    void nativeHandle?.remove();
  };
}
