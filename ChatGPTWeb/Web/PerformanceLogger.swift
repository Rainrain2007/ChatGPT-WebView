import Foundation
import os

final class PerformanceLogger {
    private let launched = ProcessInfo.processInfo.systemUptime
    private var firstFinish = true
    private let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "ChatGPTWeb", category: "Performance")

    func record(_ event: String, url: URL?, mainFrameReload: Bool? = nil) {
        guard ShellSettings.performanceLogging else { return }
        // OAuth query strings and fragments must never enter the logs.
        var components = url.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false) }
        components?.query = nil
        components?.fragment = nil
        let safeURL = components?.string ?? "nil"
        let elapsed = String(format: "%.3f", ProcessInfo.processInfo.systemUptime - launched)
        let reload = mainFrameReload.map { String($0) } ?? "unknown"
        logger.notice("\(event, privacy: .public) t=\(elapsed, privacy: .public)s url=\(safeURL, privacy: .public) mainFrameReload=\(reload, privacy: .public)")
        if event == "finish", firstFinish {
            firstFinish = false
            logger.notice("coldStartToDidFinish=\(elapsed, privacy: .public)s")
        }
    }
}
