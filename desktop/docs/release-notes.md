# pureTV Manager 0.3.3 · 0.2.0 回退验证包

本包按用户要求恢复电脑管理器 0.2.0 的原始代码，仅将版本号改为 0.3.3，验证 macOS Apple Silicon 上从 0.3.0 开始出现的 No route to host 连接回归。

- 连接、端口解析、ADB 子进程调用、工具下载安装、原版界面和 macOS 配置均来自 desktop-v0.2.0。
- 未加入 0.3.0 之后的多语言、主题、新 Logo、IP 记忆、本机 IP、重新下载、版本角标或 TCP 检测／ADB 重启代码。
- 保留 Intel Mac 构建支持；测试数据改放管理器自身测试目录，内容仍来自 0.2.0。以上均不改变原版连接行为。
- 仓库 resource/launcher 与 resource/apps 保持原目录和 APK，不回退电视端软件，也不创建电视 APK Release。

这是回退验证测试版，最新稳定版仍保留为 0.3.2。安装后请完全退出其他 pureTV 版本，再用相同的 192.168.0.191:5555 测试连接和系统信息读取；暂未在受影响的实体 Mac／电视上验证。

提供 Windows x64 安装版／便携版、macOS Apple Silicon ARM64／Intel x86_64 DMG、Linux x64 DEB，SHA256 见附件。macOS 沿用 0.2.0 的 ad-hoc 签名配置。
