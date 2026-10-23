# pureTV Manager 0.1.1

修复 macOS 发行包的应用包签名和最低系统版本配置。pureTV 电视管理器是在电脑上通过 ADB 管理 Android TV／Google TV 的独立应用，与电视上的 pureTV 启动器、Music TV、ShortVideo TV、WebTV 分别安装，不增加电视 APK 的大小，也不需要电视额外运行管理服务。

## 本次修复

- 对完整 `.app` 执行 ad-hoc 签名，补齐资源签名；0.1.0 的主程序仅有链接器生成的 ad-hoc 签名，未封装整个应用包。
- 将应用信息及构建的最低系统版本统一为 macOS 11；当前 macOS 安装包适用于 Apple Silicon（M1 及后续芯片）。
- 为 macOS CI 增加 DMG 挂载、完整应用包签名校验和原生启动检查，具体运行结果见 [Desktop build 工作流](https://github.com/ecojust/pureTV/actions/workflows/desktop.yml)。

**ad-hoc 签名不是 Developer ID 签名，也不代表通过 Apple 公证。** 首次打开仍可能被系统要求确认来源；不能仅凭「已损坏」提示判断下载文件真的损坏。

## 下载哪个文件

| 电脑系统 | 文件 | 说明 |
| --- | --- | --- |
| Windows x64 | `pureTV-Manager-0.1.1-windows-x64-setup.exe` | 安装版，首次使用推荐 |
| Windows x64 | `pureTV-Manager-0.1.1-windows-x64-portable.exe` | 便携版，需电脑已具备 WebView2 |
| macOS Apple Silicon（ARM64） | `pureTV-Manager-0.1.1-macos-arm64.dmg` | macOS 11 或更高版本，不适用于 Intel Mac |
| Linux x64 | `pureTV-Manager-0.1.1-linux-x64.deb` | 需要兼容的 GTK／WebKitGTK 运行环境 |

实际文件大小见本发布页附件列表，完整性校验值见 `SHA256SUMS.txt`。本版未提供 Windows ARM64 或 Intel Mac 安装包。

## macOS 安装与「已损坏」提示

打开 DMG，将 `pureTV Manager.app` 拖入 `Applications`，再从「应用程序」打开。

提示「无法验证开发者」时，尝试打开一次后进入「系统设置 → 隐私与安全性」，找到对应提示并选择「仍要打开」（Open Anyway）；macOS 11／12 使用「系统偏好设置 → 安全性与隐私」。

提示「已损坏，无法打开」时，先确认 DMG 与 `SHA256SUMS.txt` 均从本仓库本次发布下载。在终端进入下载目录，计算 DMG 的 SHA256：

```bash
cd ~/Downloads
shasum -a 256 pureTV-Manager-0.1.1-macos-arm64.dmg
```

将输出的完整 SHA256 与 `SHA256SUMS.txt` 中同名文件的一行比较。不一致时重新下载，不要打开该副本。校验一致后，重新将 DMG 中的应用拖入「应用程序」并覆盖旧版。

如果校验一致、确认来自本仓库，重新安装后仍因下载隔离属性被拦截，可仅对此应用解除隔离，然后再次打开：

```bash
xattr -dr com.apple.quarantine "/Applications/pureTV Manager.app"
```

此命令只移除这份可信应用的下载隔离属性，不使用 `sudo`，不关闭全局 Gatekeeper。**不适用于「将损坏电脑」或其他恶意软件警报。** 若仍无法打开，请提供完整提示和 macOS 版本，不要扩大命令作用范围。

## 主要功能

- **连接与扫描电视**：通过 IP／主机名和调试端口连接，支持无线配对；列出当前电视用户所有已安装应用，按包名／已知名称搜索，区分系统、用户、停用及可恢复应用。
- **管理应用**：勾选后停用、启用、为当前用户卸载或恢复，逐项反馈结果。系统应用卸载保留数据，不删除系统分区 APK；恢复要求设备仍保有安装包。
- **安装自定义应用**：点击「添加安装包」从电脑导入普通单 APK，可多次追加去重，勾选确认后安装；移除列表项不会删除源文件。不直接安装 APKS／XAPK 或分包集合。
- **切换启动器**：导入自己的启动器 APK，选择默认桌面，恢复记录的原桌面；是否允许切换取决于电视固件。
- **操作记录**：保存最近 200 项修改结果。批量变更可停止后续项，已完成项不会自动回滚。

## 首次连接与验证范围

电脑需准备 [Google Android Platform Tools](https://developer.android.com/tools/releases/platform-tools)，完整解压后在管理器选择 `adb.exe`（Windows）或 `adb`（macOS/Linux）。发行包不包含 ADB；Windows 的 ADB DLL 需与 `adb.exe` 位于同一目录。Windows 安装版可按需安装 WebView2，便携版需要电脑已具备该运行时。

电视与电脑位于可互通网络，电视开启 ADB／网络调试。填写电视实际 IP 和调试端口，连接后在电视上接受授权；支持无线配对的电视应先配对，再使用调试端口连接，两个端口可能不同。

管理器仅对当前所连设备及当前 Android 用户执行操作。关键系统包和当前默认启动器受保护；切换桌面不会自动停用原厂桌面。使用详情见 [桌面工具 README](https://github.com/ecojust/pureTV/blob/master/desktop/README.md)。

既有验证包含 29 项 Rust 核心测试、10 项浏览器交互场景及 Linux 原生窗口／文件导入验证。自动化设备操作使用模拟设备，**尚未进行真实电视连接、系统应用变更或启动器切换验证**；厂商固件可能拒绝某些操作。Windows 安装器未使用商业代码签名证书；macOS 未使用 Developer ID 证书、未完成 Apple 公证。

这是独立的 **desktop-v0.1.1** 发布。Android 最新版仍为 **[v0.1.5](https://github.com/ecojust/pureTV/releases/tag/v0.1.5)**，本发布不替换或更新四个电视 APK。

本项目参考自 [Gathin23/cleanyourtv](https://github.com/Gathin23/cleanyourtv)，原作者版权和许可继续保留。
