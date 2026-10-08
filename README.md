# ChatGPT Web

面向 iOS 16 和 iPad 的 ChatGPT 网页客户端，使用 chatgpt.com 与持久 WKWebView。

- iPad 横屏与 Split View；无浏览器工具栏。
- Enter 发送，Shift+Enter 换行；禁止弹性过度滚动。
- iOS 16.0–16.3 使用公共脚本兼容加载器处理已确认的旧 WebKit 语法差异。登录和聊天接口不经过代理。
- 公共脚本复用按内容摘要核对的解析缓存；六小时内启动优先使用近期网页缓存，可在设置关闭。
- Lite Mode 和输入辅助按钮隐藏可在设置中关闭。双指连点三次或 Command+, 打开设置。
- 整条系统键盘栏及触摸侧栏拖拽仍需真机验收，见人肉测试问题.md。

构建：`bash scripts/build-unsigned-ipa.sh`。GitHub Actions 提供 unsigned IPA，供 TrollStore 安装。

工程底座：[tt-P607/ChatGPT_Web](https://github.com/tt-P607/ChatGPT_Web)，AGPL-3.0。原 fork：[Akuma1tko/ChatGPT-WebView](https://github.com/Akuma1tko/ChatGPT-WebView)，MIT notice 保留在 LICENSE-Akuma-MIT。Acorn license 位于 ChatGPTWeb/Resources/Vendor/ACORN-LICENSE。
