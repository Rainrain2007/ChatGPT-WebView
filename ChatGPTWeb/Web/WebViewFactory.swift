import UIKit
import WebKit

enum WebViewFactory {
    static func makeConfiguration() -> WKWebViewConfiguration {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.ignoresViewportScaleLimits = false
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.preferences.isFraudulentWebsiteWarningEnabled = true
        if let url = Bundle.main.url(forResource: "reduced-motion", withExtension: "js"),
           let source = try? String(contentsOf: url, encoding: .utf8) {
            let options = "window.__webShellReduceMotion = \(ShellSettings.liteMode);\n"
            configuration.userContentController.addUserScript(WKUserScript(
                source: "if(window===window.top && location.protocol==='https:' && location.hostname==='chatgpt.com'){" + options + source + "}",
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            ))
        }
        if let url = Bundle.main.url(forResource: "chatgpt", withExtension: "js"),
           let source = try? String(contentsOf: url, encoding: .utf8) {
            let options = "window.__webShellOptions = {lite: \(ShellSettings.liteMode), debug: \(ShellSettings.performanceLogging)};\n"
            configuration.userContentController.addUserScript(WKUserScript(
                source: "if(window===window.top && location.protocol==='https:' && location.hostname==='chatgpt.com'){" + options + source + "}",
                injectionTime: .atDocumentEnd,
                forMainFrameOnly: true
            ))
        }
        if #available(iOS 16.4, *) {
            // The system engine can parse the current site's syntax.
        } else {
            let names = ["legacy-regexp", "acorn", "legacy-module-loader"]
            let source = names.compactMap { name -> String? in
                guard let url = Bundle.main.url(forResource: name, withExtension: "js") else { return nil }
                return try? String(contentsOf: url, encoding: .utf8)
            }.joined(separator: "\n")
            configuration.userContentController.addUserScript(WKUserScript(
                source: "if(window===window.top && location.protocol==='https:' && location.hostname==='chatgpt.com'){" + source + "}",
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            ))
        }
        return configuration
    }

    static func makeWebView(configuration: WKWebViewConfiguration? = nil) -> WKWebView {
        let webView = WKWebView(frame: .zero, configuration: configuration ?? makeConfiguration())
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsLinkPreview = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.keyboardDismissMode = .interactive
        webView.scrollView.bounces = false
        webView.scrollView.alwaysBounceVertical = false
        webView.scrollView.alwaysBounceHorizontal = false
        webView.scrollView.refreshControl = nil
        webView.isOpaque = true
        webView.backgroundColor = .systemBackground
        webView.scrollView.backgroundColor = .systemBackground
        KeyboardAccessoryController.setHidden(ShellSettings.hideKeyboardAssistant, for: webView)
        #if DEBUG
        if let ua = UserDefaults.standard.string(forKey: "DebugCustomUserAgent"), !ua.isEmpty {
            webView.customUserAgent = ua
        }
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif
        return webView
    }
}
