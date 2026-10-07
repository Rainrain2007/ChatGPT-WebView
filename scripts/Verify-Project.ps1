$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

function Resolve-ProjectPath {
    param([Parameter(Mandatory = $true)][string]$RelativePath)
    Join-Path $root $RelativePath
}

$requiredFiles = @(
    "codemagic.yaml",
    "ChatGPTWeb.xcodeproj/project.pbxproj",
    "ChatGPTWeb.xcodeproj/xcshareddata/xcschemes/ChatGPTWeb.xcscheme",
    "ChatGPTWeb/App/AppDelegate.swift",
    "ChatGPTWeb/App/SceneDelegate.swift",
    "ChatGPTWeb/Web/WebViewController.swift",
    "ChatGPTWeb/Web/WebViewFactory.swift",
    "ChatGPTWeb/Web/NavigationPolicy.swift",
    "ChatGPTWeb/Web/NavigationCoordinator.swift",
    "ChatGPTWeb/Authentication/AuthenticationCoordinator.swift",
    "ChatGPTWeb/Download/DownloadCoordinator.swift",
    "ChatGPTWeb/UI/WebErrorView.swift",
    "ChatGPTWeb/Resources/Info.plist",
    "ChatGPTWeb/Resources/Assets.xcassets/AppIcon.appiconset/Contents.json",
    "ChatGPTWeb/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png"
)

$missingFiles = $requiredFiles | Where-Object { -not (Test-Path (Resolve-ProjectPath $_)) }
if ($missingFiles) {
    throw "Missing project files: $($missingFiles -join ', ')"
}

$plist = [System.Xml.XmlDocument]::new()
$plist.Load((Resolve-ProjectPath "ChatGPTWeb/Resources/Info.plist"))
$scheme = [System.Xml.XmlDocument]::new()
$scheme.Load((Resolve-ProjectPath "ChatGPTWeb.xcodeproj/xcshareddata/xcschemes/ChatGPTWeb.xcscheme"))
Get-Content -Raw -Encoding UTF8 (Resolve-ProjectPath "ChatGPTWeb/Resources/Assets.xcassets/AppIcon.appiconset/Contents.json") |
    ConvertFrom-Json | Out-Null

$projectText = Get-Content -Raw -Encoding UTF8 (Resolve-ProjectPath "ChatGPTWeb.xcodeproj/project.pbxproj")
$deploymentTargetCount = [regex]::Matches(
    $projectText,
    "IPHONEOS_DEPLOYMENT_TARGET = 16\.0;"
).Count
if ($deploymentTargetCount -ne 4) {
    throw "Expected four iOS 16.0 deployment target settings, found $deploymentTargetCount."
}

$codemagicText = Get-Content -Raw -Encoding UTF8 (Resolve-ProjectPath "codemagic.yaml")
foreach ($requiredValue in @(
    "ios-trollstore:",
    "instance_type: mac_mini_m2",
    "xcode: latest",
    "bash scripts/build-unsigned-ipa.sh",
    "build/ChatGPTWeb-unsigned.ipa"
)) {
    if (-not $codemagicText.Contains($requiredValue)) {
        throw "Missing Codemagic setting: $requiredValue"
    }
}

$plistText = Get-Content -Raw -Encoding UTF8 (Resolve-ProjectPath "ChatGPTWeb/Resources/Info.plist")
foreach ($key in @(
    "NSCameraUsageDescription",
    "NSMicrophoneUsageDescription",
    "NSPhotoLibraryUsageDescription",
    "UIApplicationSceneManifest"
)) {
    if (-not $plistText.Contains("<key>$key</key>")) {
        throw "Missing Info.plist key: $key"
    }
}

$forbiddenPatterns = @(
    "WKWebsiteDataStore\.nonPersistent",
    "UIWebView",
    "setValue\(.+forKey:",
    "evaluateJavaScript"
)
$swiftFiles = Get-ChildItem (Resolve-ProjectPath "ChatGPTWeb") -Filter "*.swift" -Recurse
foreach ($pattern in $forbiddenPatterns) {
    if ($swiftFiles | Select-String -Pattern $pattern -Encoding UTF8) {
        throw "Forbidden implementation found: $pattern"
    }
}

Add-Type -AssemblyName System.Drawing
$icon = [System.Drawing.Image]::FromFile(
    (Resolve-ProjectPath "ChatGPTWeb/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png")
)
try {
    if ($icon.Width -ne 1024 -or $icon.Height -ne 1024) {
        throw "App Icon must be 1024x1024 pixels."
    }
    if ($icon.PixelFormat -ne [System.Drawing.Imaging.PixelFormat]::Format24bppRgb) {
        throw "App Icon must not contain an alpha channel."
    }
} finally {
    $icon.Dispose()
}

Write-Output "Project verification passed."
