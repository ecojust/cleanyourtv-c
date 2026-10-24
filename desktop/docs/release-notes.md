# pureTV Manager 0.3.1

- 管理器 Logo 移至左侧栏底部，保留语言和主题切换。
- 资源目录统一为 resource/launcher 与 resource/apps，原启动器和应用源码整体移入，每个软件目录直接提供可安装 APK。
- README 按新目录生成启动器与应用表格，更新 layout.json 示例、源码和下载链接。
- 以后 Release 仅发布管理器；电视端 APK 从仓库对应资源文件夹下载。Android CI 保留构建、测试、签名与资源校验，取消独立 APK Release。

提供 Windows x64 安装版与便携版、macOS Apple Silicon ARM64／Intel x86_64 DMG、Linux x64 DEB。校验值见 SHA256SUMS.txt。macOS 使用 ad-hoc 签名，未进行 Apple 公证；Windows 尚未使用商业代码签名。尚未进行电视实机测试。
