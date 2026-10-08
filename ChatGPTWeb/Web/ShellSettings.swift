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
    static var cacheFirstStartup: Bool {
        get { UserDefaults.standard.object(forKey: "CacheFirstStartup") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "CacheFirstStartup") }
    }
    static func noteSuccessfulWebLoad() {
        UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: "LastSuccessfulWebLoad")
    }
    static func invalidateStartupCache() {
        UserDefaults.standard.removeObject(forKey: "LastSuccessfulWebLoad")
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
        if UserDefaults.standard.bool(forKey: "DebugProtocolCacheStartup") { return .useProtocolCachePolicy }
        #endif
        let age = Date().timeIntervalSince1970 - UserDefaults.standard.double(forKey: "LastSuccessfulWebLoad")
        if cacheFirstStartup, age >= 0, age < 6 * 60 * 60 { return .returnCacheDataElseLoad }
        return .useProtocolCachePolicy
    }
}
