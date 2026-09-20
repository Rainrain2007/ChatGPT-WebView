import UIKit
import WebKit

/// iOS 16+ ChatGPT web shell
/// - UA matches real iOS 16 Safari (do NOT spoof iOS 18)
/// - Enter sends; Shift+Enter inserts newline
class ViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {

    private var webView: WKWebView!
    private let activityIndicator = UIActivityIndicatorView(style: .large)
    private var didShowLoadError = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        let config = makeConfig()
        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.customUserAgent = UIDevice.current.userInterfaceIdiom == .pad
            ? "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
            : "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = false
        webView.scrollView.alwaysBounceVertical = false
        webView.scrollView.alwaysBounceHorizontal = false
        webView.backgroundColor = .black
        webView.isOpaque = false
        view.addSubview(webView)

        activityIndicator.center = CGPoint(x: view.bounds.midX, y: view.bounds.midY)
        activityIndicator.color = .white
        activityIndicator.hidesWhenStopped = true
        view.addSubview(activityIndicator)
        activityIndicator.startAnimating()

        let url = URL(string: "https://chatgpt.com")!
        webView.load(URLRequest(url: url, cachePolicy: .reloadRevalidatingCacheData, timeoutInterval: 45))
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        activityIndicator.center = CGPoint(x: view.bounds.midX, y: view.bounds.midY)
    }

    private func makeConfig() -> WKWebViewConfiguration {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        if #available(iOS 14.0, *) {
            let prefs = WKWebpagePreferences()
            prefs.allowsContentJavaScript = true
            config.defaultWebpagePreferences = prefs
        }

        let ucc = WKUserContentController()
        ucc.addUserScript(WKUserScript(source: Self.injectJS, injectionTime: .atDocumentEnd, forMainFrameOnly: false))
        config.userContentController = ucc
        return config
    }

    // MARK: - Navigation

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        activityIndicator.stopAnimating()
        didShowLoadError = false
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        activityIndicator.stopAnimating()
        showLoadError(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        activityIndicator.stopAnimating()
        showLoadError(error)
    }

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.targetFrame == nil {
            webView.load(navigationAction.request)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView,
                 runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    private func showLoadError(_ error: Error) {
        guard !didShowLoadError, viewIfLoaded?.window != nil else { return }
        didShowLoadError = true
        let alert = UIAlertController(
            title: "无法打开 ChatGPT",
            message: "请确认网络或代理可以访问 chatgpt.com，然后重试。\n\n\(error.localizedDescription)",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "重试", style: .default) { [weak self] _ in
            guard let self else { return }
            self.didShowLoadError = false
            self.activityIndicator.startAnimating()
            self.webView.reload()
        })
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        present(alert, animated: true)
    }

    private static let injectJS = ##"(function(){if(window.__cgWebShell)return;window.__cgWebShell=1;var h=location.hostname;if(h==='google.com'||h==='www.google.com'){location.replace('https://notebooklm.google.com/');return}var g=/chatgpt\.com$/.test(h),n=/(notebooklm\.google\.com|notebook\.google\.com)$/.test(h),q=function(s,r){return(r||document).querySelector(s)},i=function(e){return e&&(e.tagName==='TEXTAREA'||e.isContentEditable||e.getAttribute('role')==='textbox')},send=function(){var b=q('[data-testid="send-button"]')||q('button[aria-label*="Send" i]');if(b&&!b.disabled){b.click();return 1}return 0},d=document.head||document.documentElement,m=q('meta[name="viewport"]');m||(m=document.createElement('meta'),m.name='viewport',d.appendChild(m));m.content='width=device-width,initial-scale=1,viewport-fit=cover';var s=document.createElement('style');s.textContent=(g?'html,body{background:#000!important}html [class*="transition"],html [class*="duration-"]{transition-duration:80ms!important;animation-duration:80ms!important}a[href="#main"],[data-testid="skip-to-content"]{display:none!important}':'')+(n?'html,body{background-color:#f8f7f3!important;color:#1f1f1e!important;color-scheme:light}audio,video{display:block!important;max-width:100%!important;min-height:32px!important}audio{-webkit-appearance:auto!important}@media(prefers-color-scheme:dark){html,body{background-color:#1f1f1e!important;color:#f8f7f3!important;color-scheme:dark}}':'');d.appendChild(s);if(n){var fix=function(){document.querySelectorAll('audio,video').forEach(function(e){e.controls=1;e.playsInline=1})};new MutationObserver(fix).observe(document.documentElement,{childList:true,subtree:true});fix()}if(g){document.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.isComposing&&e.keyCode!==229&&i(e.target)&&send()){e.preventDefault();e.stopImmediatePropagation()}},!0);document.addEventListener('focusin',function(e){i(e.target)&&e.target.setAttribute('enterkeyhint','send')},!0)}})();"##
}
