package com.vadensoftware.airportchaos.nativeauth;

import android.content.pm.ApplicationInfo;
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
import java.util.function.Consumer;

@CapacitorPlugin(name = "NativeRewardedAd")
public final class NativeRewardedAdPlugin extends Plugin {
    private RewardedAd rewardedAd;
    private PluginCall showCall;
    private PluginCall loadCall;
    private boolean qualified;
    private boolean sdkStarted;
    private boolean loading;
    private boolean privacyPrepared;
    private boolean privacyBusy;
    private int generation;
    private boolean destroyed;

    private boolean qaEnabled() {
        return (getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    private JSObject privacyStatus() {
        ConsentInformation consent = UserMessagingPlatform.getConsentInformation(getContext());
        JSObject result = new JSObject();
        result.put("required", qaEnabled() && consent.getPrivacyOptionsRequirementStatus() == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED);
        result.put("canRequestAds", qaEnabled() && consent.canRequestAds());
        return result;
    }

    private void prepareConsent(Consumer<Boolean> completion) {
        if (destroyed) { completion.accept(false); return; }
        if (privacyPrepared) { completion.accept(true); return; }
        if (privacyBusy) { completion.accept(false); return; }
        privacyBusy = true;
        ConsentInformation consent = UserMessagingPlatform.getConsentInformation(getContext());
        consent.requestConsentInfoUpdate(getActivity(), new ConsentRequestParameters.Builder().build(), () -> {
            if (destroyed) { privacyBusy = false; completion.accept(false); return; }
            UserMessagingPlatform.loadAndShowConsentFormIfRequired(getActivity(), error -> {
                privacyBusy = false;
                privacyPrepared = error == null || consent.canRequestAds();
                completion.accept(privacyPrepared);
            }); }, error -> {
                privacyBusy = false;
                // Only UMP can permit a request using a valid prior-session choice.
                privacyPrepared = consent.canRequestAds();
                completion.accept(privacyPrepared);
            });
    }

    @PluginMethod public void getPrivacyStatus(PluginCall call) {
        getActivity().runOnUiThread(() -> call.resolve(privacyStatus()));
    }

    @PluginMethod public void preparePrivacy(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (!qaEnabled()) { call.resolve(privacyStatus()); return; }
            // Keep required privacy options accessible after a failed refresh as well.
            prepareConsent(ok -> call.resolve(privacyStatus()));
        });
    }

    @PluginMethod public void showPrivacyOptions(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            ConsentInformation consent = UserMessagingPlatform.getConsentInformation(getContext());
            if (!qaEnabled() || loading || showCall != null || privacyBusy ||
                consent.getPrivacyOptionsRequirementStatus() != ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED) {
                call.reject("Video privacy options are unavailable."); return;
            }
            privacyBusy = true;
            rewardedAd = null;
            UserMessagingPlatform.showPrivacyOptionsForm(getActivity(), error -> {
                privacyBusy = false;
                if (error == null) call.resolve(privacyStatus()); else call.reject("Unable to open video privacy options.");
            });
        });
    }

    @PluginMethod public void loadAd(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            String adUnitId = call.getString("adUnitId"), customData = call.getString("customData");
            if (!qaEnabled() || loading || rewardedAd != null || showCall != null ||
                !"ca-app-pub-3940256099942544/5224354917".equals(adUnitId) ||
                customData == null || !customData.matches("^[A-Za-z0-9][A-Za-z0-9:_.-]{0,159}$")) {
                call.reject("Unable to start video."); return;
            }
            loading = true; loadCall = call;
            final int requestGeneration = generation;
            prepareConsent(ok -> {
                if (requestGeneration != generation) return;
                if (!ok || !UserMessagingPlatform.getConsentInformation(getContext()).canRequestAds()) {
                    finishLoadError("Video privacy choices are required before loading an ad."); return;
                }
                if (!sdkStarted) {
                    sdkStarted = true;
                    MobileAds.initialize(getContext(), status -> {
                        if (requestGeneration == generation) getActivity().runOnUiThread(() -> loadVerifiedAd(adUnitId, customData, requestGeneration));
                    });
                } else loadVerifiedAd(adUnitId, customData, requestGeneration);
            });
        });
    }

    private void finishLoadError(String message) { finishLoadError(message, null); }

    private void finishLoadError(String message, String code) {
        PluginCall call = loadCall; loadCall = null; loading = false; rewardedAd = null;
        if (call != null) call.reject(message, code);
    }

    private void loadVerifiedAd(String adUnitId, String customData, int requestGeneration) {
        if (requestGeneration != generation) return;
        // This SDK API requires initialize() first. Fail closed if the opt-out cannot persist.
        if (!MobileAds.putPublisherFirstPartyIdEnabled(false)) {
            finishLoadError("Video privacy settings are unavailable."); return;
        }
        Bundle nonPersonalized = new Bundle(); nonPersonalized.putString("npa", "1");
        AdRequest request = new AdRequest.Builder().addNetworkExtrasBundle(AdMobAdapter.class, nonPersonalized).build();
        RewardedAd.load(getContext(), adUnitId, request, new RewardedAdLoadCallback() {
            @Override public void onAdLoaded(RewardedAd ad) {
                if (requestGeneration != generation) return;
                ad.setServerSideVerificationOptions(new ServerSideVerificationOptions.Builder().setCustomData(customData).build());
                rewardedAd = ad; loading = false;
                PluginCall call = loadCall; loadCall = null;
                if (call != null) call.resolve();
            }
            @Override public void onAdFailedToLoad(LoadAdError error) {
                if (requestGeneration == generation) finishLoadError("No video available right now. Try again later.", error.getDomain() + ":" + error.getCode());
            }
        });
    }

    @PluginMethod public void showAd(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            // Reserve on the UI thread, before presenting, to reject rapid duplicate calls.
            if (!qaEnabled() || privacyBusy || showCall != null || rewardedAd == null || !getActivity().hasWindowFocus() ||
                !UserMessagingPlatform.getConsentInformation(getContext()).canRequestAds()) {
                rewardedAd = null; call.reject("Unable to start video."); return;
            }
            RewardedAd ad = rewardedAd; rewardedAd = null; showCall = call; qualified = false;
            ad.setFullScreenContentCallback(new FullScreenContentCallback() {
                @Override public void onAdDismissedFullScreenContent() { finishShow(qualified ? "qualified" : "closed"); }
                @Override public void onAdFailedToShowFullScreenContent(AdError error) { finishShow("failed"); }
            });
            ad.show(getActivity(), rewardItem -> qualified = true);
        });
    }

    @PluginMethod public void discardAd(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (showCall == null) { generation++; finishLoadError("Video request cancelled."); }
            call.resolve();
        });
    }

    private void finishShow(String state) {
        PluginCall call = showCall;
        if (call == null) return;
        showCall = null; qualified = false;
        JSObject result = new JSObject(); result.put("state", state); call.resolve(result);
    }

    @Override protected void handleOnDestroy() {
        destroyed = true; generation++; finishLoadError("Video interrupted."); finishShow(qualified ? "qualified" : "failed"); rewardedAd = null;
        super.handleOnDestroy();
    }
}
