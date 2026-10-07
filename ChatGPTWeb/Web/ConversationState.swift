import Foundation
import WebKit

final class ConversationState: NSObject, WKScriptMessageHandler {
    var onCompatibilityFailure: (() -> Void)?
    let logger: PerformanceLogger
    init(logger: PerformanceLogger) { self.logger = logger }

    static func restorableURL(_ url: URL) -> Bool {
        guard url.scheme == "https", url.host == "chatgpt.com", url.user == nil, url.password == nil else { return false }
        return url.path == "/" || url.path.hasPrefix("/c/") || url.path.hasPrefix("/g/") || url.path.hasPrefix("/project/")
    }

    static var lastURL: URL? {
        guard let value = UserDefaults.standard.string(forKey: "LastConversationURL"),
              let url = URL(string: value), restorableURL(url) else { return nil }
        return url
    }

    static func save(_ url: URL) {
        guard restorableURL(url), var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return }
        components.query = nil
        components.fragment = nil
        UserDefaults.standard.set(components.string, forKey: "LastConversationURL")
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.protocol == "https",
              message.frameInfo.securityOrigin.host == "chatgpt.com",
              let body = message.body as? [String: Any],
              let value = body["url"] as? String, let url = URL(string: value),
              Self.restorableURL(url), let kind = body["kind"] as? String else { return }
        Self.save(url)
        if kind == "compatibilityFailure" { onCompatibilityFailure?(); return }
        if kind == "scroll", let x = body["x"] as? Double, let y = body["y"] as? Double,
           x.isFinite, y.isFinite, x >= 0, y >= 0 {
            UserDefaults.standard.set([
                "url": UserDefaults.standard.string(forKey: "LastConversationURL") ?? "",
                "x": x, "y": y, "element": String((body["element"] as? String ?? "document").prefix(256))
            ], forKey: "LastScrollPosition")
        }
        if kind == "route" { logger.record("conversation SPA navigation", url: url, mainFrameReload: false) }
        if kind == "ready" { logger.record("DOM ready", url: url) }
    }
}
