import Capacitor
import Foundation
import WebKit

private final class ProductionSessionDelegate: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

@objc(SecureSessionHttpPlugin)
final class SecureSessionHttpPlugin: CAPInstancePlugin, CAPBridgedPlugin {
    let identifier = "SecureSessionHttpPlugin"
    let jsName = "SecureSessionHttp"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise)
    ]

    private let backendOrigin = URL(string: "https://fly.vadensoftware.com")!
    private let nativeOrigin = "capacitor://localhost"
    private let allowedMethods = Set(["GET", "POST"])

    @objc func request(_ call: CAPPluginCall) {
        guard let value = call.getString("url"), let url = URL(string: value),
              url.scheme == backendOrigin.scheme, url.host == backendOrigin.host,
              url.port == backendOrigin.port, url.user == nil, url.password == nil else {
            call.reject("Backend request origin rejected.")
            return
        }

        let method = call.getString("method", "GET").uppercased()
        guard allowedMethods.contains(method) else {
            call.reject("Backend request method rejected.")
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpShouldHandleCookies = true
        request.setValue(nativeOrigin, forHTTPHeaderField: "Origin")
        if let headers = call.getObject("headers") {
            for name in ["Accept", "Content-Type"] {
                if let value = headers[name] as? String {
                    request.setValue(value, forHTTPHeaderField: name)
                } else if let value = headers[name.lowercased()] as? String {
                    request.setValue(value, forHTTPHeaderField: name)
                }
            }
        }
        if let body = call.getString("body") {
            request.httpBody = Data(body.utf8)
        }
        let timeoutMs = max(1_000, min(30_000, call.getInt("timeoutMs", 12_000)))
        request.timeoutInterval = TimeInterval(timeoutMs) / 1_000

        let configuration = URLSessionConfiguration.default
        configuration.httpCookieStorage = .shared
        configuration.httpShouldSetCookies = true
        let session = URLSession(configuration: configuration, delegate: ProductionSessionDelegate(), delegateQueue: nil)
        let task = session.dataTask(with: request) { [weak self] data, response, error in
            session.finishTasksAndInvalidate()
            guard let self else { return }
            if let error {
                call.reject(error.localizedDescription)
                return
            }
            guard let response = response as? HTTPURLResponse else {
                call.reject("Invalid backend response.")
                return
            }

            self.persistResponseCookies(response)
            self.syncBackendCookiesToWebView {
                var headers: [String: String] = [:]
                for (rawName, rawValue) in response.allHeaderFields {
                    let name = String(describing: rawName)
                    let lowerName = name.lowercased()
                    guard lowerName != "set-cookie" && lowerName != "set-cookie2" else { continue }
                    headers[name] = String(describing: rawValue)
                }
                call.resolve([
                    "status": response.statusCode,
                    "url": response.url?.absoluteString ?? url.absoluteString,
                    "headers": headers,
                    "body": data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                ])
            }
        }
        task.resume()
    }

    private func persistResponseCookies(_ response: HTTPURLResponse) {
        guard let url = response.url else { return }
        var fields: [String: String] = [:]
        for (key, value) in response.allHeaderFields {
            fields[String(describing: key)] = String(describing: value)
        }
        let cookies = HTTPCookie.cookies(withResponseHeaderFields: fields, for: url)
        HTTPCookieStorage.shared.setCookies(cookies, for: url, mainDocumentURL: nil)
    }

    private func syncBackendCookiesToWebView(completion: @escaping () -> Void) {
        let cookies = HTTPCookieStorage.shared.cookies(for: backendOrigin) ?? []
        guard !cookies.isEmpty else {
            DispatchQueue.main.async(execute: completion)
            return
        }
        let group = DispatchGroup()
        for cookie in cookies {
            group.enter()
            WKWebsiteDataStore.default().httpCookieStore.setCookie(cookie) {
                group.leave()
            }
        }
        group.notify(queue: .main, execute: completion)
    }
}

final class AirportChaosBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(SecureSessionHttpPlugin())
    }
}
