# pureTV Manager 0.1.0

新增 **pureTV 电视管理器**，在电脑上通过 ADB 管理 Android TV／Google TV。它是独立电脑软件，与电视上的 pureTV 启动器、Music TV、ShortVideo TV、WebTV 分别安装，不会增加电视 APK 的大小，也不需要在电视上安装额外常驻管理服务。

## 主要功能

- **连接电视**：输入 IP／主机名和调试端口连接，显示等待授权、在线或离线状态；支持带无线调试配对功能的电视，配对码不保存。
- **扫描应用**：列出当前电视用户的所有已安装应用，按包名／已知名称搜索，区分系统应用、用户应用、已停用和可恢复项目。首版不保证所有应用的本地化名称和图标。
- **管理应用**：勾选后停用、启用、为当前用户卸载或恢复，逐项记录结果。系统应用卸载保留数据，不删除系统分区 APK；恢复仅在设备仍保有安装包时可用。普通第三方应用可能需要重新安装 APK。
- **安装自定义应用**：点击「添加安装包」从电脑添加外部 APK，可多次追加并去重，勾选后点击「安装所选」。添加到列表不会立即安装，从列表移除不会删除电脑上的源文件。首版支持普通单 APK，不直接安装 APKS／XAPK 或分包集合。
- **选择启动器**：列出已安装的 HOME 启动器，支持导入自己的启动器 APK、设置默认桌面和恢复记录的原桌面。是否允许切换取决于电视固件，管理器会查询结果并反馈。
- **查看操作记录**：保存最近 200 项修改结果，显示设备、用户、目标及成功／失败原因。批量变更逐项执行，可停止后续项，已完成项不会自动回滚。

## 下载哪个文件

| 电脑系统 | 文件 | 说明 |
| --- | --- | --- |
| Windows x64 | `pureTV-Manager-0.1.0-windows-x64-setup.exe` | 安装版，约 1.20 MiB，首次使用推荐 |
| Windows x64 | `pureTV-Manager-0.1.0-windows-x64-portable.exe` | 便携版，约 3.38 MiB，需电脑已具备 WebView2 |
| macOS Apple Silicon（ARM64） | `pureTV-Manager-0.1.0-macos-arm64.dmg` | 约 1.52 MiB，适用于 Apple Silicon Mac |
| Linux x64 | `pureTV-Manager-0.1.0-linux-x64.deb` | 约 1.93 MiB，需要兼容的 GTK／WebKitGTK 运行环境 |

安装包的实际大小见本发布页文件列表，完整性校验值见 `SHA256SUMS.txt`。本版未提供 Windows ARM64 或 Intel Mac 安装包。

## 首次连接

1. 电脑准备 [Google Android Platform Tools](https://developer.android.com/tools/releases/platform-tools)，完整解压后在管理器中选择 `adb.exe`（Windows）或 `adb`（macOS/Linux），也可使用已配置的系统 ADB。发行包不包含 ADB；Windows 的 ADB DLL 需与 `adb.exe` 保持在同一目录。
2. Windows 使用 Microsoft WebView2；安装版可在需要时安装该运行时，便携版需要提前准备。macOS 使用系统 WebView，Linux 需要 GTK／WebKitGTK。
3. 电视与电脑位于可互通网络，电视开启 ADB／网络调试。在管理器填写电视实际 IP 和端口，点击连接，然后在电视上接受调试授权。
4. 电视若要求无线配对，先填写配对端口及配对码，再使用电视显示的调试端口连接；两个端口可能不同。

管理器仅对当前所连设备及当前 Android 用户执行操作。关键系统包和当前默认启动器受保护；切换桌面不会自动停用原厂桌面。更详细的使用说明见 [桌面工具 README](https://github.com/ecojust/pureTV/blob/master/desktop/README.md)。

## 验证范围与版本关系

三平台安装包均构建成功，已通过 29 项 Rust 核心测试与 10 项浏览器交互测试，Linux 原生窗口及外部文件选择导入已验证。自动化设备操作使用模拟设备，**尚未进行真实电视连接、系统应用变更或启动器切换验证**；厂商固件可能拒绝某些操作，结果以界面反馈为准。安装器尚未使用商业代码签名证书，macOS 版本尚未完成 Apple 公证，系统可能显示来源或开发者验证提示。

这是独立的 **desktop-v0.1.0** 发布。Android 最新版仍为 **[v0.1.5](https://github.com/ecojust/pureTV/releases/tag/v0.1.5)**，本发布不替换或更新四个电视 APK。

本项目参考自 [Gathin23/cleanyourtv](https://github.com/Gathin23/cleanyourtv)，原作者版权和许可继续保留。
