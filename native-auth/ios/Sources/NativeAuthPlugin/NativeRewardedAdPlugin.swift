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
        CAPPluginMethod(name: "showAd", returnType: CAPPluginReturnPromise)
    ]

    private var rewardedAd: RewardedAd?
    private var showCall: CAPPluginCall?
    private var qualified = false
    private var sdkStarted = false
    private var loading = false

    @objc public func loadAd(_ call: CAPPluginCall) {
        guard !loading, rewardedAd == nil, showCall == nil,
              let adUnitID = call.getString("adUnitId"), validAdUnit(adUnitID),
              let customData = call.getString("customData"), validReference(customData) else {
            call.reject("Unable to start video.")
            return
        }
        loading = true
        Task { @MainActor in
            do {
                try await ConsentInformation.shared.requestConsentInfoUpdate(with: RequestParameters())
                try await ConsentForm.loadAndPresentIfRequired(from: bridge?.viewController)
                guard ConsentInformation.shared.canRequestAds else {
                    loading = false
                    call.reject("Video privacy choices are required before loading an ad.")
                    return
                }
                if !sdkStarted {
                    sdkStarted = true
                    MobileAds.shared.requestConfiguration.publisherPrivacyPersonalizationState = .disabled
                    await MobileAds.shared.start()
                }
                let request = Request()
                let extras = Extras()
                extras.additionalParameters = ["npa": "1"]
                request.register(extras)
                let ad = try await RewardedAd.load(with: adUnitID, request: request)
                let verification = ServerSideVerificationOptions()
                verification.customRewardText = customData
                ad.serverSideVerificationOptions = verification
                rewardedAd = ad
                loading = false
                call.resolve()
            } catch {
                rewardedAd = nil
                loading = false
                call.reject("No video available right now. Try again later.")
            }
        }
    }

    @objc public func showAd(_ call: CAPPluginCall) {
        guard showCall == nil, let ad = rewardedAd, let presenter = bridge?.viewController else {
            call.reject("Unable to start video.")
            return
        }
        rewardedAd = nil
        showCall = call
        qualified = false
        ad.fullScreenContentDelegate = self
        ad.present(from: presenter) { [weak self] in
            self?.qualified = true
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
        qualified = false
        call.resolve(["state": state])
    }

    private func validAdUnit(_ value: String) -> Bool {
        value.range(of: #"^ca-app-pub-[0-9]{16}/[0-9]{10}$"#, options: .regularExpression) != nil
    }

    private func validReference(_ value: String) -> Bool {
        value.count <= 160 && value.range(of: #"^[A-Za-z0-9][A-Za-z0-9:_.-]+$"#, options: .regularExpression) != nil
    }
}
