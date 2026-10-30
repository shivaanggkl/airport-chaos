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

type VideoPrivacyStatus = { required: boolean; canRequestAds: boolean };
type NativeAdResult = { state: 'qualified' | 'closed' | 'failed' };
const NativeRewardedAd = registerPlugin<{
  loadAd(options: { adUnitId: string; customData: string }): Promise<void>;
  showAd(): Promise<NativeAdResult>;
  discardAd(): Promise<void>;
  getPrivacyStatus(): Promise<VideoPrivacyStatus>;
  preparePrivacy(): Promise<VideoPrivacyStatus>;
  showPrivacyOptions(): Promise<VideoPrivacyStatus>;
}>('NativeRewardedAd');

const platform = Capacitor.getPlatform();
export const rewardedAdPlatform: RewardedAdPlatform | undefined =
  Capacitor.isNativePlatform() && (platform === 'ios' || platform === 'android') ? platform : undefined;

export const rewardedAdProvider = rewardedAdPlatform ? {
  platform: rewardedAdPlatform,
  async load(attempt: RewardedAdAttempt): Promise<void> {
    if (!Number.isFinite(attempt.expiresAt) || attempt.expiresAt <= Date.now() || attempt.platform !== rewardedAdPlatform || attempt.provider !== 'ADMOB') throw new Error('Rewarded video is unavailable.');
    await rewardedAdPrivacy?.prepare();
    await NativeRewardedAd.loadAd({ adUnitId: attempt.adUnitId, customData: attempt.customData });
    privacyRequest = NativeRewardedAd.preparePrivacy().catch(() => ({ required: false, canRequestAds: false }));
  },
  discard(): Promise<void> { return NativeRewardedAd.discardAd(); },
  show(): Promise<NativeAdResult> {
    return NativeRewardedAd.showAd();
  },
} : undefined;

// One nonblocking launch refresh. No ad request or SDK startup occurs here.
let privacyRequest: Promise<VideoPrivacyStatus> | undefined;
export const rewardedAdPrivacy = rewardedAdPlatform ? {
  prepare(): Promise<VideoPrivacyStatus> {
    return privacyRequest ??= NativeRewardedAd.discardAd().catch(() => undefined).then(() => NativeRewardedAd.preparePrivacy()).catch(() => ({ required: false, canRequestAds: false }));
  },
  current(): Promise<VideoPrivacyStatus> { return NativeRewardedAd.getPrivacyStatus(); },
  async open(): Promise<VideoPrivacyStatus> {
    const status = await NativeRewardedAd.showPrivacyOptions();
    privacyRequest = Promise.resolve(status);
    return status;
  },
} : undefined;
void rewardedAdPrivacy?.prepare();
