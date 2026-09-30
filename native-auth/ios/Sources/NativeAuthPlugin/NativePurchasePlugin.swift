import Capacitor
import Foundation
import StoreKit

@objc(AirportChaosNativePurchasePlugin)
public final class NativePurchasePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AirportChaosNativePurchasePlugin"
    public let jsName = "NativePurchase"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProduct", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise)
    ]

    @objc public func getProduct(_ call: CAPPluginCall) {
        guard let productID = validProductID(call) else { return }
        Task {
            do {
                guard let product = try await Product.products(for: [productID]).first,
                      product.type == .nonConsumable else {
                    call.reject("Firehawk is unavailable from the App Store.")
                    return
                }
                call.resolve([
                    "productId": product.id,
                    "localizedPrice": product.displayPrice,
                    "displayName": product.displayName
                ])
            } catch {
                call.reject("The App Store is unavailable.")
            }
        }
    }

    @objc public func purchase(_ call: CAPPluginCall) {
        guard let productID = validProductID(call),
              let accountTokenValue = call.getString("accountToken"),
              let accountToken = UUID(uuidString: accountTokenValue) else {
            call.reject("Purchase configuration is invalid.")
            return
        }
        Task {
            do {
                guard let product = try await Product.products(for: [productID]).first,
                      product.type == .nonConsumable else {
                    call.reject("Firehawk is unavailable from the App Store.")
                    return
                }
                switch try await product.purchase(options: [.appAccountToken(accountToken)]) {
                case .success(let verification):
                    guard case .verified(let transaction) = verification,
                          transaction.productID == productID else {
                        call.reject("Unable to verify purchase.")
                        return
                    }
                    call.resolve([
                        "state": "purchased",
                        "productId": transaction.productID,
                        "transactionId": String(transaction.id),
                        "signedTransaction": verification.jwsRepresentation
                    ])
                case .pending:
                    call.resolve(["state": "pending", "productId": productID])
                case .userCancelled:
                    call.resolve(["state": "cancelled", "productId": productID])
                @unknown default:
                    call.reject("The App Store returned an unsupported purchase result.")
                }
            } catch {
                call.reject("Unable to complete purchase.")
            }
        }
    }

    @objc public func restore(_ call: CAPPluginCall) {
        guard let productID = validProductID(call) else { return }
        Task {
            do {
                try await AppStore.sync()
                for await verification in Transaction.currentEntitlements {
                    guard case .verified(let transaction) = verification,
                          transaction.productID == productID,
                          transaction.revocationDate == nil else { continue }
                    call.resolve([
                        "state": "purchased",
                        "productId": transaction.productID,
                        "transactionId": String(transaction.id),
                        "signedTransaction": verification.jwsRepresentation
                    ])
                    return
                }
                call.resolve(["state": "notFound", "productId": productID])
            } catch {
                call.reject("Unable to restore purchases.")
            }
        }
    }

    @objc public func finish(_ call: CAPPluginCall) {
        guard let transactionID = call.getString("transactionId"),
              UInt64(transactionID) != nil else {
            call.reject("Transaction identifier is invalid.")
            return
        }
        Task {
            for await verification in Transaction.unfinished {
                guard case .verified(let transaction) = verification,
                      String(transaction.id) == transactionID else { continue }
                await transaction.finish()
                call.resolve()
                return
            }
            call.resolve()
        }
    }

    private func validProductID(_ call: CAPPluginCall) -> String? {
        guard let productID = call.getString("productId"),
              productID == "com.vadensoftware.airportchaos.firehawk" else {
            call.reject("Unknown product.")
            return nil
        }
        return productID
    }
}
