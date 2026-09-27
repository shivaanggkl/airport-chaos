import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vadensoftware.airportchaos',
  appName: 'Airport Chaos',
  webDir: 'client/dist',
  ios: {
    limitsNavigationsToAppBoundDomains: true,
  },
  plugins: {
    SystemBars: {
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
      style: 'DARK',
      hidden: true,
      animation: 'NONE',
    },
  },
};

export default config;
