# pureTV Manager 0.3.4

基于稳定版 0.3.2，保留其 ADB 连接流程及重新下载工具功能。

- 移除左下角「本地管理／无需电视端常驻服务」，保留 Logo 和当前版本号。
- 设备连接页的 ADB 工具与 MCP 面板增加间距。
- 连接前按本机各网卡实际子网前缀检查电视 IP；均不在同一网段时弹窗提示，可继续连接。跨网段路由／VPN 可正常使用。
- 布局编辑器显示卡片实际打开的应用、包名或内置功能，并支持从已安装且可启动的用户应用更换目标。
- 关闭窗口／退出时，先取消可取消任务、等待正在修改的一项结束，再停止当前 ADB 服务。此操作会断开其他工具共用的 ADB 连接；清理超时后仍退出。
- MCP 新增 close_manager（confirmShutdown: true），与窗口退出共用清理流程，共 30 个工具。
- 全局关闭滚动回弹，并统一为细圆角滚动条。
- 启动器布局升级为版本 3 场景协议：同一 JSON 驱动电视与管理器画布，背景、时钟、天气、顶部固定功能与应用卡片共用坐标、尺寸、显示和层级属性，可拖动或输入数值调整。
- 电视启动器需更新资源目录内的 pureTV 0.3.4 APK（沿用原签名），才能使用场景布局；旧版 APK 仍可使用网格编辑。

切换默认启动器通常无需重启电视，按遥控器 Home 键进入新桌面即可。

提供 Windows x64 安装版与便携版、macOS Apple Silicon ARM64／Intel x86_64 DMG、Linux x64 DEB。校验值见 SHA256SUMS.txt。macOS 使用 ad-hoc 签名，未进行 Apple 公证；Windows 尚未使用商业代码签名。

电视端下载：[启动器 APK 与源码](https://github.com/ecojust/pureTV/tree/master/resource/launcher) · [应用 APK 与源码](https://github.com/ecojust/pureTV/tree/master/resource/apps)。Release 只发布电脑管理器。
