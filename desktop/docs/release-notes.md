# pureTV Manager 0.3.0

- **macOS Intel**：新增 x86_64 DMG，与 Apple Silicon ARM64 分开发行，均检查真实安装包架构、签名与启动。
- **多语言与换肤**：简体中文、繁體中文、English；青绿、深蓝、石墨主题，保存偏好并同步 Agent。应用名称、包名和用户文件路径保持原样。
- **新 Logo**：围绕 pureTV、电视屏幕与应用排布设计，应用于管理器和配套启动器图标。
- **公共资源目录**：根目录 resource 提供实际 APK、作者、对应源码、许可证、封面与 SHA256；第三方 APK 保留上游原始签名。
- **可视化布局**：激活且支持接口的启动器显示「调整布局」，全局画布拖动排序并编辑名称、图标、颜色；layout.json 分别定义 home/apps，两页列数独立。只可添加已安装可启动的用户应用，不兼容旧 apps.json。配套 [Launcher 0.3.0](https://github.com/ecojust/pureTV/releases/tag/v0.3.0)。
- **安装与卡片**：启动器页直接安装启动器 APK，待安装应用行尾支持单独安装；卡片只在用户提供 thumb 图片或手动选择背景后显示图片，修复按钮溢出。
- **界面精简**：移除实时画面、桌面截图和无线配对入口；MCP 同步调整为 28 个工具，包含语言、主题和背景图。
- **文档**：README 内提供 layout.json 完整规范与同配置 Home/Apps 画面对照，资源按启动器／应用分别列成表格。

下载：Windows x64 安装版与便携版、macOS ARM64／Intel x86_64 DMG（macOS 11+）、Linux x64 DEB。校验值见 SHA256SUMS.txt。macOS 使用 ad-hoc 签名，未进行 Apple 公证；Windows 尚未使用商业代码签名。

验证范围包括核心与界面测试、MCP 原生管理器联调、四平台构建及 Android 布局／签名／资源校验。尚未进行电视实机测试。
