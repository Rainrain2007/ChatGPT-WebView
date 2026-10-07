import UIKit
import WebKit

final class AuthenticationCoordinator {
    private weak var presentingViewController: UIViewController?
    private let navigationPolicy: NavigationPolicy
    private let downloadCoordinator: DownloadCoordinator
    private let completion: (URLRequest) -> Void
    private weak var authenticationNavigationController: UINavigationController?

    init(
        presentingViewController: UIViewController,
        navigationPolicy: NavigationPolicy,
        downloadCoordinator: DownloadCoordinator,
        completion: @escaping (URLRequest) -> Void
    ) {
        self.presentingViewController = presentingViewController
        self.navigationPolicy = navigationPolicy
        self.downloadCoordinator = downloadCoordinator
        self.completion = completion
    }

    func start(request: URLRequest) {
        let viewController = makeViewController(
            configuration: WebViewFactory.makeConfiguration(),
            initialRequest: request
        )
        present(viewController)
    }

    func openPopup(configuration: WKWebViewConfiguration, sourceURL: URL?) -> WKWebView {
        let viewController = makeViewController(
            configuration: configuration,
            initialRequest: nil,
            allowsThirdPartyAuthentication: true
        )
        present(viewController)
        return viewController.webView
    }

    private func openNestedAuthenticationPopup(
        configuration: WKWebViewConfiguration
    ) -> WKWebView {
        let viewController = makeViewController(
            configuration: configuration,
            initialRequest: nil,
            allowsThirdPartyAuthentication: true
        )
        present(viewController)
        return viewController.webView
    }

    private func makeViewController(
        configuration: WKWebViewConfiguration,
        initialRequest: URLRequest?,
        allowsThirdPartyAuthentication: Bool = true
    ) -> AuthenticationViewController {
        let viewController = AuthenticationViewController(
            configuration: configuration,
            initialRequest: initialRequest,
            navigationPolicy: navigationPolicy,
            downloadCoordinator: downloadCoordinator,
            allowsThirdPartyAuthentication: allowsThirdPartyAuthentication
        )
        viewController.onAuthenticationCallback = { [weak self] request in
            self?.finish(with: request)
        }
        viewController.onClose = { [weak self, weak viewController] in
            guard let self, let viewController else { return }
            self.close(viewController)
        }
        viewController.onOpenPopup = { [weak self] configuration in
            self?.openNestedAuthenticationPopup(configuration: configuration)
        }
        return viewController
    }

    private func present(_ viewController: AuthenticationViewController) {
        if let navigationController = authenticationNavigationController {
            navigationController.pushViewController(viewController, animated: true)
            return
        }

        let navigationController = UINavigationController(rootViewController: viewController)
        navigationController.modalPresentationStyle = .fullScreen
        authenticationNavigationController = navigationController
        presentingViewController?.present(navigationController, animated: true)
    }

    private func finish(with request: URLRequest) {
        authenticationNavigationController?.dismiss(animated: true)
        authenticationNavigationController = nil
        completion(request)
    }

    private func close(_ viewController: AuthenticationViewController) {
        guard let navigationController = authenticationNavigationController else { return }
        if navigationController.viewControllers.first === viewController {
            navigationController.dismiss(animated: true)
            authenticationNavigationController = nil
        } else {
            navigationController.setViewControllers(
                navigationController.viewControllers.filter { $0 !== viewController },
                animated: true
            )
        }
    }
}

private final class AuthenticationViewController: UIViewController {
    let webView: WKWebView
    var onAuthenticationCallback: ((URLRequest) -> Void)?
    var onClose: (() -> Void)?
    var onOpenPopup: ((WKWebViewConfiguration) -> WKWebView?)?

    private let initialRequest: URLRequest?
    private let navigationPolicy: NavigationPolicy
    private let downloadCoordinator: DownloadCoordinator
    private let allowsThirdPartyAuthentication: Bool
    private var hasVisitedExternalAuthenticationHost = false
    private let transfersCallbackToMain: Bool
    private var lastMainFrameRequest: URLRequest?

    init(
        configuration: WKWebViewConfiguration,
        initialRequest: URLRequest?,
        navigationPolicy: NavigationPolicy,
        downloadCoordinator: DownloadCoordinator,
        allowsThirdPartyAuthentication: Bool
    ) {
        self.webView = WebViewFactory.makeWebView(configuration: configuration)
        self.initialRequest = initialRequest
        self.navigationPolicy = navigationPolicy
        self.downloadCoordinator = downloadCoordinator
        self.allowsThirdPartyAuthentication = allowsThirdPartyAuthentication
        self.lastMainFrameRequest = initialRequest
        self.transfersCallbackToMain = initialRequest != nil
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("不支持通过 Interface Builder 创建认证页面。")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        configureView()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        if let initialRequest {
            webView.load(initialRequest)
        }
    }

    private func configureView() {
        view.backgroundColor = .systemBackground
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        navigationItem.leftBarButtonItem = UIBarButtonItem(
            image: UIImage(systemName: "xmark"),
            style: .plain,
            target: self,
            action: #selector(close)
        )
        navigationItem.leftBarButtonItem?.accessibilityLabel = "关闭"
        navigationItem.rightBarButtonItem = UIBarButtonItem(
            image: UIImage(systemName: "safari"),
            style: .plain,
            target: self,
            action: #selector(openInSafari)
        )
        navigationItem.rightBarButtonItem?.accessibilityLabel = "在 Safari 中打开"
    }

    private func updateDisplayedHost(for url: URL?) {
        navigationItem.title = url?.host ?? "登录"
    }

    @objc private func close() {
        onClose?()
    }

    @objc private func openInSafari() {
        guard let url = webView.url else { return }
        let alert = UIAlertController(
            title: "在 Safari 中继续",
            message: "Safari 与此 App 不共享登录 Cookie。完成登录后，登录状态可能无法自动返回。",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        alert.addAction(UIAlertAction(title: "打开 Safari", style: .default) { _ in
            UIApplication.shared.open(url)
        })
        present(alert, animated: true)
    }

    private func openExternally(_ url: URL) {
        UIApplication.shared.open(url, options: [:]) { [weak self] succeeded in
            guard !succeeded, let self, self.presentedViewController == nil else { return }
            let alert = UIAlertController(
                title: "无法打开链接",
                message: url.absoluteString,
                preferredStyle: .alert
            )
            alert.addAction(UIAlertAction(title: "确定", style: .default))
            self.present(alert, animated: true)
        }
    }
}

extension AuthenticationViewController: WKNavigationDelegate {
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

        let scheme = url.scheme?.lowercased()
        if scheme == "data" || scheme == "file" || scheme == "javascript" || scheme == nil {
            decisionHandler(.cancel)
            return
        }
        if scheme != "http" && scheme != "https" && scheme != "about" && scheme != "blob" {
            decisionHandler(.cancel)
            openExternally(url)
            return
        }

        if navigationAction.targetFrame?.isMainFrame != false {
            lastMainFrameRequest = navigationAction.request
            if !navigationPolicy.isOfficialOpenAIURL(url)
                && (scheme == "http" || scheme == "https")
                && allowsThirdPartyAuthentication {
                hasVisitedExternalAuthenticationHost = true
            }
        }

        decisionHandler(.allow)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        if !navigationResponse.canShowMIMEType || navigationResponse.isAttachment {
            decisionHandler(.download)
        } else if navigationResponse.isForMainFrame,
                  !allowsThirdPartyAuthentication,
                  let url = navigationResponse.response.url,
                  !navigationPolicy.isOfficialOpenAIURL(url) {
            decisionHandler(.cancel)
            openExternally(url)
            onClose?()
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
        updateDisplayedHost(for: webView.url)
        if transfersCallbackToMain, hasVisitedExternalAuthenticationHost,
           let url = webView.url,
           navigationPolicy.isChatGPTURL(url),
           !navigationPolicy.isAuthenticationContext(url) {
            onAuthenticationCallback?(URLRequest(url: url))
        }
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        showLoadError(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showLoadError(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if let url = webView.url ?? lastMainFrameRequest?.url {
            webView.load(URLRequest(url: url))
        }
    }

    private func showLoadError(_ error: Error) {
        guard (error as? URLError)?.code != .cancelled else { return }
        let alert = UIAlertController(
            title: "登录页面加载失败",
            message: error.localizedDescription,
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "关闭", style: .cancel) { [weak self] _ in
            self?.onClose?()
        })
        alert.addAction(UIAlertAction(title: "重试", style: .default) { [weak self, weak webView] _ in
            guard let self else { return }
            if let lastMainFrameRequest = self.lastMainFrameRequest {
                webView?.load(lastMainFrameRequest)
            } else {
                webView?.reload()
            }
        })
        if presentedViewController == nil {
            present(alert, animated: true)
        }
    }
}

extension AuthenticationViewController: WKUIDelegate {
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        guard navigationAction.targetFrame == nil else { return nil }
        return onOpenPopup?(configuration)
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

    func webViewDidClose(_ webView: WKWebView) {
        onClose?()
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
