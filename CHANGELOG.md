# 更新日志

每个版本发布时，GitHub Release 的说明取自本文件对应版本的小节。发版前请先在这里补充内容。

## v0.7.0

### Wails 3 架构
- 技术架构迁移到 Wails 3：界面沿用 React 前端，文件、图床、AI 生图、公众号发布、ACP Agent、菜单与托盘等系统能力用 Go 实现
- 使用系统 WebView（macOS WKWebView、Windows WebView2、Linux WebKitGTK），不再捆绑 Chromium 与 Node.js，安装包体积显著减小
- macOS 提供通用（Apple 芯片 + Intel）安装包

### 已知差异
- macOS 暂不支持自定义程序坞菜单（点击程序坞图标可重新显示窗口）；Windows / Linux 的托盘菜单不受影响
- Windows / Linux 使用无边框窗口，窗口按钮固定由应用绘制（经典或红绿灯样式切换即时生效，无需重启）
- 从文件管理器拖入的图片按文件内容上传（与粘贴图片相同）
