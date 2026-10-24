# pureTV 电视系统管理器

**pureTV Manager 0.2.0** 是电脑端电视系统管理工具，通过 ADB 管理 Android TV / Google TV 的设备信息、应用和默认启动器，并提供实时画面与完整 MCP 接口。

下载：[0.2.0 发布页](https://github.com/ecojust/pureTV/releases/tag/desktop-v0.2.0)。提供 Windows x64 安装版／便携版、macOS Apple Silicon DMG（macOS 11+）和 Linux x64 DEB。文件大小与 SHA256 校验清单见发布页。管理器安装在电脑，电视开启并授权 ADB 即可管理应用。

## 功能

| 页面 | 功能 |
| --- | --- |
| 设备连接 | 首页输入 IP／端口与连接／配对；展示 Android、SDK、安全补丁、CPU、内存、磁盘、分辨率、运行时间；下载或选择 ADB |
| 应用管理 · 已安装 | 搜索／分类、应用与启动器安装包大小、批量启用／停用、为当前用户卸载／恢复 |
| 应用管理 · 待安装 | 导入本地 APK、勾选安装；成功项移出队列，失败和未执行项保留 |
| 启动器 | 设置／恢复默认 HOME，查看包大小、获取实际桌面截图；支持时读取和编辑 apps.json 布局及应用图标 |
| 实时画面 | ADB 连续截图预览当前屏幕，目标 1–3 帧／秒，显示实际帧率，可暂停／继续／停止 |
| 操作记录 | 最近 200 项修改记录，包含目标设备／用户、逐项结果与错误 |

非首页仅在顶部显示当前连接状态，不重复放置 IP 和连接表单。各类列表独立滚动，表头及顶部批量操作保持可见，选择和重新渲染保留列表位置。

## macOS 安装与首次打开

当前 DMG 适用于 **Apple Silicon（M1 及后续芯片）、macOS 11 或更高版本**，不支持 Intel Mac。打开 DMG，将 `pureTV Manager.app` 拖入 `Applications`，再从「应用程序」打开。

应用对整个 `.app` 执行 ad-hoc 签名，最低系统版本为 macOS 11。**ad-hoc 签名不是 Developer ID 签名，也不代表通过 Apple 公证**；首次打开仍可能出现来源或开发者验证提示。

- 提示「无法验证开发者」：尝试打开一次后，进入「系统设置 → 隐私与安全性」，找到 pureTV Manager 的拦截信息并选择「仍要打开」（Open Anyway）。macOS 11／12 的入口为「系统偏好设置 → 安全性与隐私」。
- 提示「已损坏，无法打开」：先从本仓库的 [0.2.0 发布页](https://github.com/ecojust/pureTV/releases/tag/desktop-v0.2.0) 下载 DMG 和 `SHA256SUMS.txt`，在终端进入下载目录并计算校验值：

  ```bash
  cd ~/Downloads
  shasum -a 256 pureTV-Manager-0.2.0-macos-arm64.dmg
  ```

  将输出的完整 SHA256 与 `SHA256SUMS.txt` 中同名文件的一行比较；不一致时重新下载，不要打开该副本。校验一致后，重新将 DMG 中的应用拖入「应用程序」，覆盖旧版。

  如果校验一致、确认文件来自本仓库，重新安装后仍因下载隔离属性被拦截，可在终端对这一份可信应用解除隔离，然后再打开：

  ```bash
  xattr -dr com.apple.quarantine "/Applications/pureTV Manager.app"
  ```

  此命令仅移除上述应用的下载隔离属性，不使用 `sudo`，不关闭全局 Gatekeeper。如果仍打不开，请提供完整提示和 macOS 版本；不要扩大命令作用范围。**此方法不适用于「将损坏电脑」或其他恶意软件警报。**

## 连接与系统信息

1. 电脑与电视接入可互通的网络，在电视开发者选项开启 ADB／网络调试。
2. 首页填写 IP／主机名和调试端口，在电视上接受授权；无线配对先使用配对端口和六位码，再使用调试端口连接。配对码不保存。
3. 首页自动显示系统信息，点击「刷新信息」重新查询。内存来自 `/proc/meminfo`，存储容量来自 `/data` 分区；权限或固件限制时显示未知。

## ADB 在线配置

缺少 ADB 时点击「下载并配置 ADB」，阅读并勾选 Android SDK 许可后确认。固定版本 **Platform Tools 37.0.1** 优先 Google，失败自动切换腾讯镜像；所有来源核对同一官方字节数与 SHA256。解压完整工具集后检查 `adb version` 并保存路径。

缓存校验完整时可离线复用；损坏缓存重新下载到新目录，不覆盖在用工具。工具放在电脑应用数据目录，不修改系统 PATH 或 macOS 应用包。已有 `adb`／`adb.exe` 可手动选择。更换 ADB 前需先断开电视。下载支持取消，失败或取消保留原有配置。

## 应用安装与包大小

在「应用管理 → 待安装应用」导入本地普通 APK，勾选后确认安装。每次最多 10 个，每个不超过 2 GiB；不支持 APKS／XAPK。成功项按完整路径移出待安装队列，其他项保留；安装不会因仅导入文件而自动执行。

安装后刷新应用列表，新的可启动应用可在启动器布局中选择。具备服务或其他用途但没有启动入口的 APK 不会被假装成可点击的启动器应用。

应用和启动器的大小统计主 APK 与分包 APK 的合计字节数，不包含应用私有数据、缓存、原生库或优化文件。通过分组查询路径和文件元数据减少 ADB 往返；无法读取或结果不完整时显示「未能读取」。

## 当前启动器的自定义布局

只有当前默认启动器成功返回已适配的布局接口时才显示编辑器。当前适配电视端 **pureTV 0.2.0，包名 `com.ecojust.puretv`**；旧版 `com.ecojust.cleanyourtv` 及未适配的其他启动器不可直接写入。包名变化需要安装新 APK 并重新选择默认桌面。

支持首页／应用列表、顺序、列数、名称、原应用或内置图标、颜色、导入 apps.json、应用后读回复查与恢复默认。详情：[启动器布局文档](docs/launcher-layout.md)。

「显示当前桌面并截图」明确在电视上打开当前 HOME，再获取实际 PNG 作为封面；「实时画面」则持续读取当前屏幕，不会跳回首页。两种操作独立。

## MCP / Agent

保持管理器打开，在首页「MCP · Agent 调试」复制 JSON 到客户端。标准 stdio 代理连接同一窗口，共享当前电视、Android 用户、ADB、操作锁和记录；状态、错误、布局与画面同步显示。

**31 个工具**覆盖界面现有设备管理功能，包括系统信息、连接／配对、应用安装／卸载／启停、启动器切换／布局、ADB 下载配置、实时预览／截图、原生文件选择器、取消和历史。详见 [MCP 接入及工具](docs/mcp.md)。

## 操作范围与恢复

批量应用操作最多 100 项，逐项执行并核对，部分失败不报告为全部成功。核心组件与当前默认 HOME 受保护；切换桌面不会自动停用原厂桌面。卸载只针对当前用户，保留数据，不删除系统分区 APK；恢复要求设备仍保有安装包。

取消扫描／下载或停止后续批量项不会回滚已完成操作；正在执行的修改会完成并复查。配置、原桌面记录、工具与最近操作位于系统应用数据目录 `com.ecojust.puretv.manager`。截图临时文件及时清理；实时画面只保留内存中的最近一帧。

## 开发与验证

```bash
npm ci
npm run build
cargo test --locked --manifest-path core/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml
npm run test:ui
```

界面测试需 Playwright Chromium：`npx playwright install chromium`，或设置 `CHROMIUM_PATH`。通过 `PURETV_CAPTURE_DIR` 保存界面截图。普通浏览器预览不会连接电视；`?demo=1` 为明确的模拟模式。

原生 MCP 联调（Linux Xvfb，使用隔离的模拟 ADB，不连接真实电视）：

```bash
xvfb-run -a python scripts/verify-mcp.py --binary src-tauri/target/x86_64-unknown-linux-gnu/release/puretv-desktop
```

发布流程验证三平台构建、核心与工具安装测试、Google／腾讯实际 ADB 下载、界面交互、原生 MCP 联调、macOS DMG／签名／启动，以及 Android 包名／版本／签名证书和布局测试。自动化测试使用模拟设备／Robolectric，不替代厂商电视实机验证。

协议与实现约束：[CONTRACT.md](CONTRACT.md)。许可：[LICENSE](../LICENSE) 与 [NOTICE.md](../NOTICE.md)。
