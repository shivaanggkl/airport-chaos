// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "AirportChaosNativeAuth",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "AirportChaosNativeAuth", targets: ["AirportChaosNativeAuth"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.2"),
        .package(url: "https://github.com/google/GoogleSignIn-iOS.git", exact: "9.2.0"),
        .package(url: "https://github.com/googleads/swift-package-manager-google-mobile-ads.git", exact: "13.9.0"),
        .package(url: "https://github.com/googleads/swift-package-manager-google-user-messaging-platform.git", exact: "3.1.0")
    ],
    targets: [
        .target(
            name: "AirportChaosNativeAuth",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "GoogleSignIn", package: "GoogleSignIn-iOS"),
                .product(name: "GoogleMobileAds", package: "swift-package-manager-google-mobile-ads"),
                .product(name: "GoogleUserMessagingPlatform", package: "swift-package-manager-google-user-messaging-platform")
            ],
            path: "ios/Sources/NativeAuthPlugin")
    ]
)
