import UIKit
import WebKit

final class DownloadCoordinator: NSObject, WKDownloadDelegate {
    private static let downloadDirectoryName = "ChatGPTWebDownloads"

    private weak var presentingViewController: UIViewController?
    private var destinations: [ObjectIdentifier: URL] = [:]
    private var pendingShareURLs: [URL] = []
    private var isPresentingShareSheet = false

    init(presentingViewController: UIViewController) {
        self.presentingViewController = presentingViewController
    }

    static func removeAbandonedDownloads() {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(downloadDirectoryName, isDirectory: true)
        try? FileManager.default.removeItem(at: directory)
    }

    func handle(_ download: WKDownload) {
        download.delegate = self
    }

    func download(
        _ download: WKDownload,
        decideDestinationUsing response: URLResponse,
        suggestedFilename: String,
        completionHandler: @escaping (URL?) -> Void
    ) {
        do {
            let directory = Self.downloadRootDirectory
                .appendingPathComponent(UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(
                at: directory,
                withIntermediateDirectories: true
            )
            let destination = directory.appendingPathComponent(
                sanitizedFilename(suggestedFilename),
                isDirectory: false
            )
            destinations[ObjectIdentifier(download)] = destination
            completionHandler(destination)
        } catch {
            completionHandler(nil)
            showError(message: "无法创建临时下载目录。")
        }
    }

    func downloadDidFinish(_ download: WKDownload) {
        let identifier = ObjectIdentifier(download)
        guard let destination = destinations.removeValue(forKey: identifier) else {
            showError(message: "下载已完成，但找不到下载文件。")
            return
        }
        pendingShareURLs.append(destination)
        presentNextShareSheetIfNeeded()
    }

    func download(
        _ download: WKDownload,
        didFailWithError error: Error,
        resumeData: Data?
    ) {
        let identifier = ObjectIdentifier(download)
        if let destination = destinations.removeValue(forKey: identifier) {
            try? FileManager.default.removeItem(at: destination.deletingLastPathComponent())
        }
        showError(message: error.localizedDescription)
    }

    func download(
        _ download: WKDownload,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (
            URLSession.AuthChallengeDisposition,
            URLCredential?
        ) -> Void
    ) {
        completionHandler(.performDefaultHandling, nil)
    }

    private static var downloadRootDirectory: URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent(downloadDirectoryName, isDirectory: true)
    }

    private func sanitizedFilename(_ filename: String) -> String {
        let invalidCharacters = CharacterSet(charactersIn: "/\\:?%*|\"<>")
            .union(.controlCharacters)
        let components = filename.components(separatedBy: invalidCharacters)
        let sanitized = components.joined(separator: "_").trimmingCharacters(in: .whitespacesAndNewlines)
        let validName = sanitized == "." || sanitized == ".." || sanitized.isEmpty
            ? "下载文件"
            : sanitized
        return String(validName.prefix(180))
    }

    private func presentNextShareSheetIfNeeded() {
        guard !isPresentingShareSheet, !pendingShareURLs.isEmpty else { return }
        let fileURL = pendingShareURLs.removeFirst()
        guard let presenter = presentingViewController?.topmostPresentedViewController else {
            try? FileManager.default.removeItem(at: fileURL.deletingLastPathComponent())
            presentNextShareSheetIfNeeded()
            return
        }

        isPresentingShareSheet = true
        let activityController = UIActivityViewController(
            activityItems: [fileURL],
            applicationActivities: nil
        )
        activityController.completionWithItemsHandler = { [weak self] _, _, _, _ in
            try? FileManager.default.removeItem(at: fileURL.deletingLastPathComponent())
            self?.isPresentingShareSheet = false
            self?.presentNextShareSheetIfNeeded()
        }
        activityController.popoverPresentationController?.sourceView = presenter.view
        activityController.popoverPresentationController?.sourceRect = CGRect(
            x: presenter.view.bounds.midX,
            y: presenter.view.bounds.midY,
            width: 1,
            height: 1
        )
        presenter.present(activityController, animated: true)
    }

    private func showError(message: String) {
        DispatchQueue.main.async { [weak self] in
            guard let presenter = self?.presentingViewController?.topmostPresentedViewController else {
                return
            }
            let alert = UIAlertController(
                title: "下载失败",
                message: message,
                preferredStyle: .alert
            )
            alert.addAction(UIAlertAction(title: "确定", style: .default))
            presenter.present(alert, animated: true)
        }
    }
}

private extension UIViewController {
    var topmostPresentedViewController: UIViewController {
        if let presentedViewController {
            return presentedViewController.topmostPresentedViewController
        }
        if let navigationController = self as? UINavigationController,
           let visibleViewController = navigationController.visibleViewController {
            return visibleViewController.topmostPresentedViewController
        }
        return self
    }
}
