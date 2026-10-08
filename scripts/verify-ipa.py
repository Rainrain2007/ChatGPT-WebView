#!/usr/bin/env python3
import plistlib
import sys
import zipfile

with zipfile.ZipFile(sys.argv[1]) as archive:
    assert archive.testzip() is None, "Damaged IPA archive"
    prefix = "Payload/ChatGPTWebView.app/"
    info = plistlib.loads(archive.read(prefix + "Info.plist"))
    assert info["CFBundleIdentifier"] == "com.safenet.chatgptwebview"
    assert info["CFBundleDisplayName"] == "ChatGPT Web"
    assert info["MinimumOSVersion"] == "16.0"
    assert set(info["UIDeviceFamily"]) == {1, 2}
    assert not info.get("UIRequiresFullScreen", False)
    assert info["CFBundleExecutable"] == "ChatGPTWebView"
    assert not any("/_CodeSignature/" in name for name in archive.namelist())
    for resource in ["chatgpt.js", "legacy-regexp.js", "legacy-module-loader.js", "acorn.js", "reduced-motion.js", "legacy-style-defaults.js"]:
        assert prefix + resource in archive.namelist(), "Missing resource: " + resource
    print("IPA verified:", info["CFBundleIdentifier"], info["CFBundleShortVersionString"],
          "build", info["CFBundleVersion"], "iOS", info["MinimumOSVersion"])
