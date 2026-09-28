import AuthenticationServices
import Capacitor
import Foundation
import GoogleSignIn
import UIKit

@objc(AirportChaosNativeAuthPlugin)
public final class NativeAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "AirportChaosNativeAuthPlugin"
    public let jsName = "NativeIdentity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signOut", returnType: CAPPluginReturnPromise)
    ]

    private var appleCall: CAPPluginCall?
    private var appleState: String?
    private var openUrlObserver: NSObjectProtocol?

    override public func load() {
        openUrlObserver = NotificationCenter.default.addObserver(
            forName: .capacitorOpenURL,
            object: nil,
            queue: .main
        ) { notification in
            guard let values = notification.object as? [String: Any], let url = values["url"] as? URL else { return }
            _ = GIDSignIn.sharedInstance.handle(url)
        }
    }

    deinit {
        if let openUrlObserver { NotificationCenter.default.removeObserver(openUrlObserver) }
    }

    @objc public func authenticate(_ call: CAPPluginCall) {
        guard let provider = call.getString("provider"),
              let nonce = call.getString("nonce"), nonce.count >= 32,
              let state = call.getString("state"), state.count >= 32 else {
            call.reject("Native sign-in configuration is invalid.")
            return
        }
        if provider == "google" {
            authenticateGoogle(call, nonce: nonce)
        } else if provider == "apple" {
            authenticateApple(call, nonce: nonce, state: state)
        } else {
            call.reject("Native sign-in provider is unavailable.")
        }
    }

    private func authenticateGoogle(_ call: CAPPluginCall, nonce: String) {
        guard let iosClientId = call.getString("iosClientId"), !iosClientId.isEmpty,
              let serverClientId = call.getString("serverClientId"), !serverClientId.isEmpty,
              let presenter = bridge?.viewController else {
            call.reject("Google sign-in is not configured.")
            return
        }
        let expectedScheme = iosClientId.split(separator: ".").reversed().joined(separator: ".")
        let registeredSchemes = (Bundle.main.object(forInfoDictionaryKey: "CFBundleURLTypes") as? [[String: Any]] ?? [])
            .flatMap { $0["CFBundleURLSchemes"] as? [String] ?? [] }
        guard registeredSchemes.contains(expectedScheme) else {
            call.reject("Google sign-in is not configured for this iOS build.")
            return
        }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: iosClientId, serverClientID: serverClientId)
        GIDSignIn.sharedInstance.signIn(
            withPresenting: presenter,
            hint: nil,
            additionalScopes: [],
            nonce: nonce
        ) { result, error in
            if let error = error as NSError? {
                if error.domain == kGIDSignInErrorDomain && error.code == -5 {
                    call.resolve(["cancelled": true])
                } else {
                    call.reject("Google sign-in failed.")
                }
                return
            }
            guard let token = result?.user.idToken?.tokenString, !token.isEmpty else {
                call.reject("Google sign-in failed.")
                return
            }
            call.resolve(["idToken": token])
        }
    }

    private func authenticateApple(_ call: CAPPluginCall, nonce: String, state: String) {
        guard appleCall == nil else {
            call.reject("Another Apple sign-in is already active.")
            return
        }
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = nonce
        request.state = state
        let controller = ASAuthorizationController(authorizationRequests: [request])
        appleCall = call
        appleState = state
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = appleCall else { return }
        defer { appleCall = nil; appleState = nil }
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              credential.state == appleState,
              let tokenData = credential.identityToken,
              let token = String(data: tokenData, encoding: .utf8), !token.isEmpty else {
            call.reject("Apple sign-in failed.")
            return
        }
        let formatter = PersonNameComponentsFormatter()
        let name = credential.fullName.map { formatter.string(from: $0).trimmingCharacters(in: .whitespacesAndNewlines) }
        var payload: [String: Any] = ["idToken": token]
        if let name, !name.isEmpty { payload["displayName"] = name }
        call.resolve(payload)
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = appleCall else { return }
        appleCall = nil
        appleState = nil
        if let appleError = error as? ASAuthorizationError, appleError.code == .canceled {
            call.resolve(["cancelled": true])
        } else {
            call.reject("Apple sign-in failed.")
        }
    }

    @objc public func signOut(_ call: CAPPluginCall) {
        GIDSignIn.sharedInstance.signOut()
        call.resolve()
    }
}
