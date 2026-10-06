package com.vadensoftware.airportchaos.nativeauth;

import android.os.Bundle;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.ads.mediation.admob.AdMobAdapter;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.gms.ads.rewarded.ServerSideVerificationOptions;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

@CapacitorPlugin(name = "NativeRewardedAd")
public final class NativeRewardedAdPlugin extends Plugin {
    private RewardedAd rewardedAd;
    private PluginCall showCall;
    private boolean qualified;
    private boolean sdkStarted;
    private boolean loading;

    @PluginMethod
    public void loadAd(PluginCall call) {
        String adUnitId = call.getString("adUnitId");
        String customData = call.getString("customData");
        if (loading || rewardedAd != null || showCall != null || adUnitId == null || !adUnitId.matches("^ca-app-pub-[0-9]{16}/[0-9]{10}$") ||
            customData == null || !customData.matches("^[A-Za-z0-9][A-Za-z0-9:_.-]{0,159}$")) {
            call.reject("Unable to start video.");
            return;
        }
        loading = true;
        getActivity().runOnUiThread(() -> {
            ConsentInformation consent = UserMessagingPlatform.getConsentInformation(getContext());
            consent.requestConsentInfoUpdate(getActivity(), new ConsentRequestParameters.Builder().build(),
                () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(getActivity(), formError -> {
                    if (formError != null || !consent.canRequestAds()) {
                        loading = false;
                        call.reject("Video privacy choices are required before loading an ad.");
                        return;
                    }
                    loadVerifiedAd(call, adUnitId, customData);
                }),
                requestConsentError -> {
                    loading = false;
                    call.reject("Unable to load video privacy choices.");
                });
        });
    }

    private void loadVerifiedAd(PluginCall call, String adUnitId, String customData) {
        if (!sdkStarted) {
            sdkStarted = true;
            MobileAds.initialize(getContext());
        }
        Bundle nonPersonalized = new Bundle();
        nonPersonalized.putString("npa", "1");
        AdRequest request = new AdRequest.Builder().addNetworkExtrasBundle(AdMobAdapter.class, nonPersonalized).build();
        RewardedAd.load(getContext(), adUnitId, request, new RewardedAdLoadCallback() {
            @Override public void onAdLoaded(RewardedAd ad) {
                ServerSideVerificationOptions options = new ServerSideVerificationOptions.Builder().setCustomData(customData).build();
                ad.setServerSideVerificationOptions(options);
                rewardedAd = ad;
                loading = false;
                call.resolve();
            }

            @Override public void onAdFailedToLoad(LoadAdError error) {
                rewardedAd = null;
                loading = false;
                call.reject("No video available right now. Try again later.");
            }
        });
    }

    @PluginMethod
    public void showAd(PluginCall call) {
        if (showCall != null || rewardedAd == null) {
            call.reject("Unable to start video.");
            return;
        }
        getActivity().runOnUiThread(() -> {
            RewardedAd ad = rewardedAd;
            rewardedAd = null;
            showCall = call;
            qualified = false;
            ad.setFullScreenContentCallback(new FullScreenContentCallback() {
                @Override public void onAdDismissedFullScreenContent() {
                    finishShow(qualified ? "qualified" : "closed");
                }

                @Override public void onAdFailedToShowFullScreenContent(AdError error) {
                    finishShow("failed");
                }
            });
            ad.show(getActivity(), rewardItem -> qualified = true);
        });
    }

    private void finishShow(String state) {
        PluginCall call = showCall;
        if (call == null) return;
        showCall = null;
        qualified = false;
        JSObject result = new JSObject();
        result.put("state", state);
        call.resolve(result);
    }
}
