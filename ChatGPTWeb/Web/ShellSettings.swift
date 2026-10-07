import Foundation

enum ShellSettings {
    static var liteMode: Bool {
        get { UserDefaults.standard.object(forKey: "LiteMode") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "LiteMode") }
    }
    static var hideKeyboardAssistant: Bool {
        get { UserDefaults.standard.object(forKey: "HideKeyboardAssistant") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "HideKeyboardAssistant") }
    }
    static var performanceLogging: Bool {
        #if DEBUG
        return UserDefaults.standard.object(forKey: "PerformanceLogging") as? Bool ?? true
        #else
        return false
        #endif
    }
    static var cachePolicy: URLRequest.CachePolicy {
        #if DEBUG
        if UserDefaults.standard.bool(forKey: "DebugCacheFirstStartup") { return .returnCacheDataElseLoad }
        #endif
        return .useProtocolCachePolicy
    }
}
