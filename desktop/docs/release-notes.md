# pureTV Manager 0.2.0

pureTV 专注电脑端电视系统管理。本版集中加入 Agent 调试、设备信息、应用安装队列、启动器自定义与电视画面预览。

- **MCP 全功能接入**：31 个标准 stdio 工具控制当前窗口，状态、进度、错误、布局和截图同步，沿用后端设备／用户检查与保护。
- **系统信息**：连接后首页展示 Android／SDK／安全补丁、CPU／架构、制造商、内存、`/data` 磁盘、分辨率与运行时间，可手动刷新。未知值明确标示。
- **应用管理**：已安装／待安装统一入口，本地 APK 导入后勾选安装，成功项移出队列，失败或未执行项保留；新应用可用于启动器排布。
- **安装包大小**：应用及启动器统计主 APK 与分包合计，批量读取元数据；不包含私有数据、缓存或优化文件，读不到时不编造零值。
- **独立列表滚动**：应用、启动器、待安装 APK、记录的滚动区域独立；顶部批量操作和表头固定，勾选不跳回开头。非首页仅保留顶部连接状态。
- **当前启动器布局**：探测实际支持能力后，编辑首页／应用列表、顺序、列数、名称、图标与颜色；apps.json 动态加载，写后读回复查，支持恢复默认。
- **真实封面和实时画面**：可打开当前 HOME 获取桌面封面；独立实时预览持续读取当前屏幕，目标 1–3 帧／秒并显示实际速度，支持暂停和停止，不强制跳回首页。
- **ADB 配置**：保留 Google／腾讯镜像回退、官方大小与 SHA256 校验、离线复用、取消与损坏缓存修复。

## 下载

Windows x64 提供安装版与便携版；macOS 提供 Apple Silicon ARM64 DMG（macOS 11+）；Linux x64 提供 DEB。文件大小与 SHA256 见附件及 `SHA256SUMS.txt`。Windows 便携版需要系统已有 WebView2；macOS 使用 ad-hoc 签名，尚未进行 Apple Developer ID 签名／公证。

## 配套启动器的新包名

自定义布局需安装本版配套 [pureTV Launcher 0.2.0](https://github.com/ecojust/pureTV/releases/tag/v0.2.0)，包名为 **`com.ecojust.puretv`**。旧包 `com.ecojust.cleanyourtv` 与新包是两个应用：先安装并选择新桌面，确认正常后再处理旧应用。签名证书保持不变；不同包名不能直接覆盖升级和继承私有设置。

仅对已适配且成功握手的当前启动器开放布局写入；其他启动器仍可切换、截图，并使用其自身的自定义设置。

## 验证范围

发布流程要求三平台构建、核心与界面测试、原生窗口 MCP／模拟电视联调，以及 Android 构建／布局／导航／签名验证通过。尚无真实电视硬件连接与系统应用变更的实测结果，厂商固件限制以设备返回为准。

MCP：[接入说明](https://github.com/ecojust/pureTV/blob/master/desktop/docs/mcp.md)。布局：[apps.json 文档](https://github.com/ecojust/pureTV/blob/master/desktop/docs/launcher-layout.md)。
