# pureTV Manager 0.3.2

- ADB 工具区域新增「重新下载」，就绪状态下仍可主动重新获取完整官方工具包，强制跳过有效缓存。
- Google 下载失败时自动尝试腾讯镜像；全部来源验证同一字节数与 SHA256。校验和配置成功后才切换到新副本，下载失败、配置失败或取消均保留原工具与配置。
- 连接电视期间禁止更换工具；MCP 的 install_platform_tools 支持 forceDownload 参数，GUI 与 Agent 共用保护和下载流程。
- 修复同一 ADB 错误重复显示，保留不同的错误详情；成功命令的数据输出保持原样。

重新下载可排除工具副本／配置损坏，但 No route to host 的实际连接根因尚未确认。

提供 Windows x64 安装版与便携版、macOS Apple Silicon ARM64／Intel x86_64 DMG、Linux x64 DEB。校验值见 SHA256SUMS.txt。macOS 使用 ad-hoc 签名，未进行 Apple 公证；Windows 尚未使用商业代码签名。

电视端下载：[启动器 APK 与源码](https://github.com/ecojust/pureTV/tree/master/resource/launcher) · [应用 APK 与源码](https://github.com/ecojust/pureTV/tree/master/resource/apps)。Release 只发布电脑管理器。
