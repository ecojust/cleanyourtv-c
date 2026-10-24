# pureTV Manager 0.2.1

- 移除实时画面、桌面截图与无线配对入口，并同步精简 MCP 工具。
- 启动器 APK 在启动器页直接逐项安装；待安装应用列表行尾支持单独安装，保留批量操作。
- 启动器封面改为用户图片背景：导入时读取 thumb.png／APK名.thumb.png，也可手动选择或移除；修复卡片按钮溢出。
- 当前激活且支持布局接口的启动器显示「调整布局」，打开全局电视画布，拖动或用按钮排序，编辑名称、图标与颜色。
- 新 layout.json 分别定义 home、apps 的列数与卡片，只能添加已安装可启动的用户应用；不兼容旧版 apps.json。布局需配套 [Launcher 0.2.1](https://github.com/ecojust/pureTV/releases/tag/v0.2.1)。

提供 Windows x64 安装版／便携版、macOS Apple Silicon ARM64 DMG、Linux x64 DEB。macOS 为 ad-hoc 签名，未进行 Apple 公证。SHA256 见附件。

通过核心、界面、MCP 联调、三平台构建及 Android 布局测试；尚未进行电视实机测试。
