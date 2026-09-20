# ChatGPT WebView for iOS 16

A lightweight iOS WebView wrapper for ChatGPT’s web app. Built with Swift and WKWebView, optimized for fast performance and speech-to-text microphone support on iOS 16.

> [!NOTE]
> This is an unofficial community fork of
> [Akuma1tko/ChatGPT-WebView](https://github.com/Akuma1tko/ChatGPT-WebView).
> It is not affiliated with or endorsed by OpenAI. ChatGPT remains a hosted
> service, so the wrapper requires network access to `chatgpt.com`.

## Features
- Persistent login
- Safari 16+ User-Agent spoofing
- Mic input (speech-to-text)
- Dark mode support
- TrollStore compatibility
- Manual or Xcode install

## Changes in this fork

- iPad landscape and Split View support
- iPad-specific Safari 16 user agent
- Reduced WebView bounce and pull-to-refresh behavior
- Enter to send and Shift+Enter for a new line
- External links remain inside the app shell
- Clear retry UI when `chatgpt.com` cannot be reached

## Privacy

The app uses the persistent WebKit website data store so ChatGPT login can
survive app restarts. Credentials and session cookies are managed by WebKit;
this repository does not include or export them.

## Build Requirements
- Xcode 14+
- Target iOS 15-16
- Swift 5.0+

## Installation
1. Open this project in Xcode
2. Choose your device or simulator
3. Hit “Run” to build

## License

MIT. The original copyright notice is preserved in [LICENSE](LICENSE).
