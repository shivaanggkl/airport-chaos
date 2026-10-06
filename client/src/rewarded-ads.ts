import { Capacitor, registerPlugin } from '@capacitor/core';

export type RewardedAdPlatform = 'ios' | 'android';
export type RewardedAdAttempt = {
  attemptId: string;
  provider: 'ADMOB';
  platform: RewardedAdPlatform;
  adUnitId: string;
  customData: string;
  expiresAt: number;
  rewardCredits: number;
};

type NativeAdResult = { state: 'qualified' | 'closed' | 'failed' };
const NativeRewardedAd = registerPlugin<{
  loadAd(options: { adUnitId: string; customData: string }): Promise<void>;
  showAd(): Promise<NativeAdResult>;
}>('NativeRewardedAd');

const platform = Capacitor.getPlatform();
export const rewardedAdPlatform: RewardedAdPlatform | undefined =
  Capacitor.isNativePlatform() && (platform === 'ios' || platform === 'android') ? platform : undefined;

export const rewardedAdProvider = rewardedAdPlatform ? {
  platform: rewardedAdPlatform,
  async load(attempt: RewardedAdAttempt): Promise<void> {
    if (attempt.platform !== rewardedAdPlatform || attempt.provider !== 'ADMOB') throw new Error('Rewarded video is unavailable.');
    await NativeRewardedAd.loadAd({ adUnitId: attempt.adUnitId, customData: attempt.customData });
  },
  show(): Promise<NativeAdResult> {
    return NativeRewardedAd.showAd();
  },
} : undefined;
