import UIKit
import WebKit

final class WebViewController: UIViewController {
    private static let homeURL = URL(string: "https://chatgpt.com/")!

    private let logger = PerformanceLogger()
    private let webView = WebViewFactory.makeWebView()
    private lazy var state = ConversationState(logger: logger)
    private let errorView = WebErrorView()
    private lazy var navigationCoordinator = NavigationCoordinator(
        presentingViewController: self,
        webView: webView,
        errorView: errorView,
        logger: logger
    )

    override func viewDidLoad() {
        super.viewDidLoad()
        configureView()
        webView.configuration.userContentController.add(state, name: "shellState")
        state.onCompatibilityFailure = { [weak self] in
            self?.errorView.show(title: "旧版 WebKit 兼容加载失败", message: "请检查网络后重试。当前网页可能使用了新的脚本语法。")
        }
        navigationCoordinator.start()
        loadHomePage()
    }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        traitCollection.userInterfaceStyle == .dark ? .lightContent : .darkContent
    }

    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        if previousTraitCollection?.userInterfaceStyle != traitCollection.userInterfaceStyle {
            setNeedsStatusBarAppearanceUpdate()
        }
    }

    private func configureView() {
        view.backgroundColor = .systemBackground

        webView.translatesAutoresizingMaskIntoConstraints = false
        errorView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        view.addSubview(errorView)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            errorView.topAnchor.constraint(equalTo: webView.topAnchor),
            errorView.leadingAnchor.constraint(equalTo: webView.leadingAnchor),
            errorView.trailingAnchor.constraint(equalTo: webView.trailingAnchor),
            errorView.bottomAnchor.constraint(equalTo: webView.bottomAnchor)
        ])

        errorView.isHidden = true
        errorView.onRetry = { [weak self] in
            self?.navigationCoordinator.retryAfterFailure()
        }

        let settingsGesture = UITapGestureRecognizer(target: self, action: #selector(showSettings))
        settingsGesture.numberOfTouchesRequired = 2
        settingsGesture.numberOfTapsRequired = 3
        settingsGesture.cancelsTouchesInView = false
        webView.addGestureRecognizer(settingsGesture)
    }

    override var keyCommands: [UIKeyCommand]? {
        [UIKeyCommand(title: "WebView Settings", action: #selector(showSettings), input: ",", modifierFlags: .command)]
    }

    @objc private func showSettings() {
        guard presentedViewController == nil else { return }
        let menu = UIAlertController(title: "WebView Settings", message: nil, preferredStyle: .alert)
        menu.addAction(UIAlertAction(title: "Lite Mode: " + (ShellSettings.liteMode ? "On" : "Off"), style: .default) { [weak self] _ in
            ShellSettings.liteMode.toggle()
            self?.webView.evaluateJavaScript("if(location.hostname==='chatgpt.com'){window.__setShellLite?.(\(ShellSettings.liteMode));}", completionHandler: nil)
        })
        menu.addAction(UIAlertAction(title: "Hide keyboard assistant: " + (ShellSettings.hideKeyboardAssistant ? "On" : "Off"), style: .default) { [weak self] _ in
            ShellSettings.hideKeyboardAssistant.toggle()
            guard let self else { return }
            KeyboardAccessoryController.setHidden(ShellSettings.hideKeyboardAssistant, for: self.webView)
        })
        #if DEBUG
        menu.addAction(UIAlertAction(title: "Performance logging: " + (ShellSettings.performanceLogging ? "On" : "Off"), style: .default) { _ in
            UserDefaults.standard.set(!ShellSettings.performanceLogging, forKey: "PerformanceLogging")
        })
        menu.addAction(UIAlertAction(title: "Toggle startup cache policy (restart)", style: .default) { _ in
            let defaults = UserDefaults.standard
            defaults.set(!defaults.bool(forKey: "DebugCacheFirstStartup"), forKey: "DebugCacheFirstStartup")
        })
        menu.addAction(UIAlertAction(title: "Debug User Agent (restart)", style: .default) { [weak self] _ in
            let prompt = UIAlertController(title: "Custom User Agent", message: "Leave blank to use the device default.", preferredStyle: .alert)
            prompt.addTextField { $0.text = UserDefaults.standard.string(forKey: "DebugCustomUserAgent") }
            prompt.addAction(UIAlertAction(title: "Save", style: .default) { _ in
                UserDefaults.standard.set(prompt.textFields?.first?.text, forKey: "DebugCustomUserAgent")
            })
            prompt.addAction(UIAlertAction(title: "Cancel", style: .cancel))
            self?.present(prompt, animated: true)
        })
        #endif
        menu.addAction(UIAlertAction(title: "Close", style: .cancel))
        present(menu, animated: true)
    }

    private func loadHomePage() {
        let url = ConversationState.lastURL ?? Self.homeURL
        var request = URLRequest(url: url, cachePolicy: ShellSettings.cachePolicy, timeoutInterval: 45)
        request.httpShouldHandleCookies = true
        logger.record("cold start", url: url)
        webView.load(request)
    }
}
