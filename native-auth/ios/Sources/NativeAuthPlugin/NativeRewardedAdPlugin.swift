import Capacitor
import GoogleMobileAds
import UserMessagingPlatform
import UIKit

@objc(AirportChaosNativeRewardedAdPlugin)
public final class NativeRewardedAdPlugin: CAPPlugin, CAPBridgedPlugin, FullScreenContentDelegate {
    public let identifier = "AirportChaosNativeRewardedAdPlugin"
    public let jsName = "NativeRewardedAd"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "loadAd", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showAd", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "discardAd", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPrivacyStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "preparePrivacy", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showPrivacyOptions", returnType: CAPPluginReturnPromise)
    ]

    private var presentingAd: RewardedAd?
    private var privacyPrepared = false
    private var privacyBusy = false
    private var rewardedAd: RewardedAd?
    private var showCall: CAPPluginCall?
    private var qualified = false
    private var sdkStarted = false
    private var loading = false
    private var loadGeneration = 0
    private var loadCall: CAPPluginCall?

    @objc public func loadAd(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard !loading, rewardedAd == nil, showCall == nil,
                  let adUnitID = call.getString("adUnitId"), qaAdUnit(adUnitID),
                  let customData = call.getString("customData"), validReference(customData) else {
                call.reject("Unable to start video.")
                return
            }
            loading = true
            loadCall = call
            let generation = loadGeneration
            do {
                try await prepareConsent()
                guard generation == loadGeneration else { return }
                guard ConsentInformation.shared.canRequestAds else {
                    loading = false
                    loadCall = nil
                    call.reject("Video privacy choices are required before loading an ad.")
                    return
                }
                if !sdkStarted {
                    sdkStarted = true
                    MobileAds.shared.requestConfiguration.publisherPrivacyPersonalizationState = .disabled
                    MobileAds.shared.requestConfiguration.setPublisherFirstPartyIDEnabled(false)
                    await MobileAds.shared.start()
                }
                guard generation == loadGeneration else { return }
                let request = Request()
                let extras = Extras()
                extras.additionalParameters = ["npa": "1"]
                request.register(extras)
                let ad = try await RewardedAd.load(with: adUnitID, request: request)
                guard generation == loadGeneration else { return }
                let verification = ServerSideVerificationOptions()
                verification.customRewardText = customData
                ad.serverSideVerificationOptions = verification
                rewardedAd = ad
                loading = false
                loadCall = nil
                call.resolve()
            } catch {
                guard generation == loadGeneration else { return }
                loadCall = nil
                rewardedAd = nil
                loading = false
                let providerError = error as NSError
                call.reject("No video available right now. Try again later.", "\(providerError.domain):\(providerError.code)")
            }
        }
    }

    @objc public func showAd(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard !privacyBusy, UIApplication.shared.applicationState == .active, ConsentInformation.shared.canRequestAds,
                  showCall == nil, let ad = rewardedAd, let presenter = bridge?.viewController else {
                rewardedAd = nil
                call.reject("Unable to start video.")
                return
            }
            rewardedAd = nil
            presentingAd = ad
            showCall = call
            qualified = false
            ad.fullScreenContentDelegate = self
            ad.present(from: presenter) { [weak self] in
                self?.qualified = true
            }
        }
    }

    public func adDidDismissFullScreenContent(_ ad: FullScreenPresentingAd) {
        finishShow(state: qualified ? "qualified" : "closed")
    }

    public func ad(_ ad: FullScreenPresentingAd, didFailToPresentFullScreenContentWithError error: Error) {
        finishShow(state: "failed")
    }

    private func finishShow(state: String) {
        guard let call = showCall else { return }
        showCall = nil
        presentingAd = nil
        qualified = false
        call.resolve(["state": state])
    }

    @objc public func discardAd(_ call: CAPPluginCall) {
        Task { @MainActor in
            if showCall == nil {
                loadGeneration += 1
                loadCall?.reject("Video request cancelled.")
                loadCall = nil
                loading = false
                rewardedAd = nil
            }
            call.resolve()
        }
    }

    private var qaEnabled: Bool {
#if DEBUG
        return true
#else
        return false
#endif
    }

    private func qaAdUnit(_ value: String) -> Bool {
        qaEnabled && value == "ca-app-pub-3940256099942544/1712485313"
    }

    @MainActor private func prepareConsent() async throws {
        if privacyPrepared { return }
        guard !privacyBusy else { throw NSError(domain: "VideoPrivacy", code: 1) }
        privacyBusy = true
        defer { privacyBusy = false }
        do {
            try await ConsentInformation.shared.requestConsentInfoUpdate(with: RequestParameters())
            try await ConsentForm.loadAndPresentIfRequired(from: bridge?.viewController)
            privacyPrepared = true
        } catch {
            // UMP alone decides whether a previous valid choice permits requests.
            if !ConsentInformation.shared.canRequestAds { throw error }
            privacyPrepared = true
        }
    }

    @objc public func getPrivacyStatus(_ call: CAPPluginCall) {
        Task { @MainActor in
            call.resolve(["required": qaEnabled && ConsentInformation.shared.privacyOptionsRequirementStatus == .required,
                          "canRequestAds": qaEnabled && ConsentInformation.shared.canRequestAds])
        }
    }

    @objc public func preparePrivacy(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard qaEnabled else { call.resolve(["required": false, "canRequestAds": false]); return }
            do {
                try await prepareConsent()
                call.resolve(["required": ConsentInformation.shared.privacyOptionsRequirementStatus == .required,
                              "canRequestAds": ConsentInformation.shared.canRequestAds])
            } catch {
                // Preserve an SDK-required options entry even when the refresh is unavailable.
                call.resolve(["required": ConsentInformation.shared.privacyOptionsRequirementStatus == .required,
                              "canRequestAds": ConsentInformation.shared.canRequestAds])
            }
        }
    }

    @objc public func showPrivacyOptions(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard qaEnabled, !loading, showCall == nil, !privacyBusy,
                  ConsentInformation.shared.privacyOptionsRequirementStatus == .required else {
                call.reject("Video privacy options are unavailable."); return
            }
            privacyBusy = true
            rewardedAd = nil
            defer { privacyBusy = false }
            do {
                try await ConsentForm.presentPrivacyOptionsForm(from: bridge?.viewController)
                call.resolve(["required": ConsentInformation.shared.privacyOptionsRequirementStatus == .required,
                              "canRequestAds": ConsentInformation.shared.canRequestAds])
            } catch { call.reject("Unable to open video privacy options.") }
        }
    }

    private func validReference(_ value: String) -> Bool {
        value.count <= 160 && value.range(of: #"^[A-Za-z0-9][A-Za-z0-9:_.-]+$"#, options: .regularExpression) != nil
    }
}
