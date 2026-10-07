import UIKit
import WebKit

final class NavigationCoordinator: NSObject {
    private weak var presentingViewController: UIViewController?
    private weak var webView: WKWebView?
    private weak var errorView: WebErrorView?
    private let navigationPolicy = NavigationPolicy()
    private let recoveryURL = URL(string: "https://chatgpt.com/")!
    private var failedRequest: URLRequest?
    private let logger: PerformanceLogger
    private var lastCommittedURL: URL?
    private lazy var downloadCoordinator = DownloadCoordinator(
        presentingViewController: presentingViewController!
    )
    private lazy var authenticationCoordinator = AuthenticationCoordinator(
        presentingViewController: presentingViewController!,
        navigationPolicy: navigationPolicy,
        downloadCoordinator: downloadCoordinator
    ) { [weak self] request in
        self?.webView?.load(request)
    }

    init(
        presentingViewController: UIViewController,
        webView: WKWebView,
        errorView: WebErrorView,
        logger: PerformanceLogger
    ) {
        self.presentingViewController = presentingViewController
        self.webView = webView
        self.errorView = errorView
        self.logger = logger
    }

    func start() {
        webView?.navigationDelegate = self
        webView?.uiDelegate = self
    }

    func retryAfterFailure() {
        errorView?.isHidden = true
        if let failedRequest {
            webView?.load(failedRequest)
        } else if let url = webView?.url {
            webView?.load(URLRequest(url: url))
        } else {
            webView?.load(URLRequest(url: recoveryURL))
        }
    }

    private func openExternally(_ url: URL) {
        UIApplication.shared.open(url, options: [:]) { [weak self] succeeded in
            guard !succeeded else { return }
            self?.showAlert(title: "无法打开链接", message: url.absoluteString)
        }
    }

    private func showAlert(title: String, message: String?) {
        guard let presenter = presentingViewController, presenter.presentedViewController == nil else {
            return
        }
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "确定", style: .default))
        presenter.present(alert, animated: true)
    }

    private func showLoadError(_ error: Error) {
        let urlError = error as? URLError
        guard urlError?.code != .cancelled else { return }
        failedRequest = failedRequest ?? webView?.url.map { URLRequest(url: $0) }
        errorView?.show(
            title: urlError?.code == .notConnectedToInternet ? "网络连接已断开" : "页面加载失败",
            message: "请检查网络连接后重试。"
        )
    }

    private func presentPrompt(
        title: String?,
        message: String?,
        defaultText: String?,
        completion: @escaping (String?) -> Void
    ) {
        guard let presenter = presentingViewController else {
            completion(nil)
            return
        }
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addTextField { textField in
            textField.text = defaultText
        }
        alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in completion(nil) })
        alert.addAction(UIAlertAction(title: "确定", style: .default) { _ in
            completion(alert.textFields?.first?.text)
        })
        presenter.present(alert, animated: true)
    }
}

extension NavigationCoordinator: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if navigationAction.shouldPerformDownload {
            decisionHandler(.download)
            return
        }

        if navigationAction.targetFrame == nil {
            decisionHandler(.allow)
            return
        }
        if navigationAction.targetFrame?.isMainFrame == true {
            logger.record("main frame request", url: url, mainFrameReload: true)
        }
        let decision = navigationPolicy.decision(
            for: url,
            sourceURL: webView.url,
            isMainFrame: navigationAction.targetFrame?.isMainFrame ?? true,
            navigationType: navigationAction.navigationType
        )
        switch decision {
        case .allow:
            if navigationAction.targetFrame?.isMainFrame != false {
                failedRequest = navigationAction.request
            }
            decisionHandler(.allow)
        case .authenticate:
            decisionHandler(.cancel)
            authenticationCoordinator.start(request: navigationAction.request)
        case .inspectResponse:
            decisionHandler(.allow)
        case .openExternally:
            // 登录/认证相关 URL 绝不跳到 Safari
            if navigationPolicy.isOfficialOpenAIURL(url) || navigationPolicy.isAuthenticationContext(url) {
                if navigationAction.targetFrame?.isMainFrame != false {
                    failedRequest = navigationAction.request
                }
                decisionHandler(.allow)
                return
            }
            decisionHandler(.cancel)
            openExternally(url)
        case .block:
            decisionHandler(.cancel)
        }
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        if !navigationResponse.canShowMIMEType || navigationResponse.isAttachment {
            decisionHandler(.download)
        } else if navigationResponse.isForMainFrame,
                  let url = navigationResponse.response.url,
                  !navigationPolicy.isOfficialOpenAIURL(url),
                  !navigationPolicy.isAuthenticationContext(url),
                  !navigationPolicy.isAuthenticationTransition(from: webView.url, to: url) {
            decisionHandler(.cancel)
            openExternally(url)
        } else {
            decisionHandler(.allow)
        }
    }

    func webView(
        _ webView: WKWebView,
        navigationAction: WKNavigationAction,
        didBecome download: WKDownload
    ) {
        downloadCoordinator.handle(download)
    }

    func webView(
        _ webView: WKWebView,
        navigationResponse: WKNavigationResponse,
        didBecome download: WKDownload
    ) {
        downloadCoordinator.handle(download)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        failedRequest = nil
        logger.record("finish", url: webView.url)
        if let url = webView.url { ConversationState.save(url) }
        webView.evaluateJavaScript("if(location.hostname==='chatgpt.com'){window.__setShellLite?.(\(ShellSettings.liteMode));}", completionHandler: nil)
        errorView?.isHidden = true
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        logger.record("navigation start", url: webView.url, mainFrameReload: true)
        errorView?.isHidden = true
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        showLoadError(error)
    }

    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error
    ) {
        showLoadError(error)
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        lastCommittedURL = webView.url
        logger.record("commit", url: webView.url, mainFrameReload: true)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        let current = webView.url ?? lastCommittedURL ?? ConversationState.lastURL ?? recoveryURL
        logger.record("WebContent process terminated; recovering", url: current)
        webView.load(URLRequest(url: current, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 45))
    }
}

extension NavigationCoordinator: WKUIDelegate {
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        guard navigationAction.targetFrame == nil else { return nil }
        guard let url = navigationAction.request.url else {
            return authenticationCoordinator.openPopup(configuration: configuration, sourceURL: webView.url)
        }

        switch navigationPolicy.popupDecision(for: url, sourceURL: webView.url) {
        case .allow, .authenticate, .inspectResponse:
            return authenticationCoordinator.openPopup(
                configuration: configuration,
                sourceURL: webView.url
            )
        case .openExternally:
            openExternally(url)
            return nil
        case .block:
            return nil
        }
    }

    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        var components = URLComponents()
        components.scheme = origin.protocol
        components.host = origin.host
        components.port = origin.port == 0 ? nil : origin.port
        if let url = components.url, navigationPolicy.isOfficialOpenAIURL(url) {
            decisionHandler(.prompt)
        } else {
            decisionHandler(.deny)
        }
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        guard let presenter = presentingViewController else {
            completionHandler()
            return
        }
        let alert = UIAlertController(title: webView.url?.host, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "确定", style: .default) { _ in completionHandler() })
        presenter.present(alert, animated: true)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        guard let presenter = presentingViewController else {
            completionHandler(false)
            return
        }
        let alert = UIAlertController(title: webView.url?.host, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "确定", style: .default) { _ in completionHandler(true) })
        presenter.present(alert, animated: true)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (String?) -> Void
    ) {
        presentPrompt(
            title: webView.url?.host,
            message: prompt,
            defaultText: defaultText,
            completion: completionHandler
        )
    }
}

private extension WKNavigationResponse {
    var isAttachment: Bool {
        guard let response = response as? HTTPURLResponse else { return false }
        return response.allHeaderFields.contains { key, value in
            String(describing: key).caseInsensitiveCompare("Content-Disposition") == .orderedSame
                && String(describing: value).lowercased().contains("attachment")
        }
    }
}
