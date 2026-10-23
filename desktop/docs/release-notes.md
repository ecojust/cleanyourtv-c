# pureTV Manager 0.1.2

现在可在应用内下载并配置 Google 官方 Platform Tools，首次使用无需手动解压或寻找 `adb`。管理器会优先检测现有工具；缺少时点击「下载并配置 ADB」，阅读并勾选 Android SDK 许可后确认下载。

## 在线准备 ADB

- 下载当前电脑对应的 **Platform Tools 37.0.1**，显示进度及校验／解压／检查阶段，支持取消和失败后重试。
- 使用固定的 Google HTTPS 下载地址，核对预期字节数和 SHA256，解压完整官方工具集，保留 Windows DLL 及许可／NOTICE 文件，再验证 `adb version` 并自动保存路径。
- 工具保存在电脑应用数据目录 `tools/` 下的独立版本目录，选择「使用已下载 ADB」后会先校验缓存，完整时离线复用，损坏时从 Google 重新下载到新目录，不覆盖在用工具。复用也需勾选 SDK 许可，不修改系统 PATH 或 macOS 应用包。
- 保留自动检测和「选择 ADB」手动指定路径，下载不可达时仍可离线配置。更换工具前需先断开当前电视；取消或失败保留原有配置，清理临时文件。

| 电脑平台 | 首次 ZIP 下载量 | 解压后工具文件大小 |
| --- | --- | --- |
| Windows x64 | 约 7.67 MiB | 约 16.72 MiB |
| macOS Apple Silicon | 约 15.36 MiB | 约 37.02 MiB |
| Linux x64 | 约 8.63 MiB | 约 21.17 MiB |

以上是独立的 Platform Tools 下载量及工具占用，不计入下面的管理器安装包。版本随管理器发布维护，启动时不会自动下载。普通浏览器预览不能下载工具或连接电视；演示模式只模拟流程。

## 下载哪个文件

| 电脑系统 | 文件 | 说明 |
| --- | --- | --- |
| Windows x64 | `pureTV-Manager-0.1.2-windows-x64-setup.exe` | 安装版，约 1.44 MiB，首次使用推荐 |
| Windows x64 | `pureTV-Manager-0.1.2-windows-x64-portable.exe` | 便携版，约 3.96 MiB，需电脑已具备 WebView2 |
| macOS Apple Silicon（ARM64） | `pureTV-Manager-0.1.2-macos-arm64.dmg` | 约 1.78 MiB，macOS 11 或更高版本，不适用于 Intel Mac |
| Linux x64 | `pureTV-Manager-0.1.2-linux-x64.deb` | 约 2.26 MiB，需要兼容的 GTK／WebKitGTK 运行环境 |

以上为实际发布文件大小，全部附件已下载并核对 SHA256，完整性校验值见 `SHA256SUMS.txt`。本版未提供 Windows ARM64 或 Intel Mac 安装包。管理器与电视上的 pureTV 启动器、Music TV、ShortVideo TV、WebTV 分别安装，不增加电视 APK 大小，也不需要电视额外运行管理服务。

## macOS 安装与「已损坏」提示

macOS 包沿用完整 ad-hoc 签名和最低 macOS 11 的要求。**ad-hoc 签名不是 Developer ID 签名，也不代表通过 Apple 公证。** 首次打开仍可能需要确认来源。

打开 DMG，将 `pureTV Manager.app` 拖入 `Applications`，再从「应用程序」打开。

提示「无法验证开发者」时，尝试打开一次后进入「系统设置 → 隐私与安全性」，找到对应提示并选择「仍要打开」（Open Anyway）；macOS 11／12 使用「系统偏好设置 → 安全性与隐私」。

提示「已损坏，无法打开」时，先确认 DMG 与 `SHA256SUMS.txt` 均从本仓库本次发布下载。在终端进入下载目录，计算 DMG 的 SHA256：

```bash
cd ~/Downloads
shasum -a 256 pureTV-Manager-0.1.2-macos-arm64.dmg
```

将输出的完整 SHA256 与 `SHA256SUMS.txt` 中同名文件的一行比较。不一致时重新下载，不要打开该副本。校验一致后，重新将 DMG 中的应用拖入「应用程序」并覆盖旧版。

如果校验一致、确认来自本仓库，重新安装后仍因下载隔离属性被拦截，可仅对此应用解除隔离，然后再次打开：

```bash
xattr -dr com.apple.quarantine "/Applications/pureTV Manager.app"
```

此命令只移除这份可信应用的下载隔离属性，不使用 `sudo`，不关闭全局 Gatekeeper。**不适用于「将损坏电脑」或其他恶意软件警报。** 若仍无法打开，请提供完整提示和 macOS 版本，不要扩大命令作用范围。

## 主要功能

- **连接与扫描电视**：通过 IP／主机名和调试端口连接，支持无线配对；列出当前电视用户的已安装应用，区分系统、用户、停用及可恢复应用。
- **管理应用**：勾选后停用、启用、为当前用户卸载或恢复，逐项反馈结果。系统应用卸载保留数据，不删除系统分区 APK；恢复要求设备仍保有安装包。
- **安装自定义应用**：通过「添加安装包」导入普通单 APK，可多次追加去重，勾选确认后安装；移除列表项不会删除源文件。
- **切换启动器**：导入自己的启动器 APK，选择默认桌面，恢复记录的原桌面；是否允许切换取决于电视固件。
- **操作记录**：保存最近 200 项修改结果。批量变更可停止后续项，已完成项不会自动回滚。

## 首次连接与验证范围

准备好 ADB 后，电视与电脑连接到可互通的网络，电视开启 ADB／网络调试。填写电视实际 IP 和调试端口，连接后在电视上接受授权；支持无线配对的电视应先配对，再使用调试端口连接，两个端口可能不同。Windows 安装版可按需安装 WebView2，便携版需要电脑已具备该运行时。

管理器仅对当前所连设备及当前 Android 用户执行操作。关键系统包和当前默认启动器受保护；切换桌面不会自动停用原厂桌面。使用详情见 [桌面工具 README](https://github.com/ecojust/pureTV/blob/master/desktop/README.md)。

三平台构建、核心测试、各 8 项工具安装测试，以及真实官方工具下载／`adb version`／配置持久化／离线复用检查均已通过。Linux 的 15 项界面交互测试、macOS DMG／完整签名／安装副本启动检查也已通过，结果见 [0.1.2 构建记录](https://github.com/ecojust/pureTV/actions/runs/39984220050)。本地 Linux 原生窗口已验证许可确认、真实下载进度、自动配置和连接按钮启用的首次使用流程。自动化设备操作使用模拟设备，**尚未进行真实电视连接、系统应用变更或启动器切换验证**。Windows 安装器未使用商业代码签名证书；macOS 未使用 Developer ID 证书、未完成 Apple 公证。

这是独立的 **desktop-v0.1.2** 发布。Android 最新版仍为 **[v0.1.5](https://github.com/ecojust/pureTV/releases/tag/v0.1.5)**，本发布不替换或更新四个电视 APK。

本项目参考自 [Gathin23/cleanyourtv](https://github.com/Gathin23/cleanyourtv)，原作者版权和许可继续保留。
