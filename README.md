# pureTV

参考 [Gathin23/cleanyourtv](https://github.com/Gathin23/cleanyourtv) 实现的 Android TV / Google TV 项目，包含一个电脑端电视管理工具，以及电视端的一个桌面启动器和三个独立播放器 App。四个电视端软件支持 Android 8.0（API 26）及以上系统。

仓库：[ecojust/pureTV](https://github.com/ecojust/pureTV)

## 软件总览

**电脑端工具：安装在电脑上，通过 ADB 管理电视。**

| 软件 | 类型 | 负责什么／主要功能 | 软件版本 | 电脑端安装包大小 |
| --- | --- | --- | --- | --- |
| [pureTV Manager／电视管理器](desktop/README.md) | **电脑端桌面应用／电视管理工具** | 连接电视、扫描应用、停用／启用、为当前用户卸载／恢复、添加外部 APK 并勾选安装、选择默认启动器；在线下载并配置 ADB | 0.1.2 | Windows 安装版约 **1.20 MiB**／便携版 **3.38 MiB**；macOS **1.51 MiB**；Linux **1.93 MiB** |

表内大小为桌面版 0.1.1 的参考值，0.1.2 实际大小见发布页。不含首次按需下载的 Platform Tools 和系统 WebView 运行时，1 MiB = 1,048,576 字节。提供 Windows x64、macOS Apple Silicon（ARM64，macOS 11 及以上）和 Linux x64 构建，使用入口见[电脑端管理工具](#电脑端管理工具)。它独立于下面四个电视 APK，不捆绑进电视端安装包，也不需要在电视上安装额外常驻管理服务，因此不会增大现有电视端 APK。

**电视端软件：分别安装在电视上，负责桌面或媒体播放。**

| 软件 | 类型 | 负责什么／主要功能 | 软件版本 | 已签名 APK 大小 |
| --- | --- | --- | --- | --- |
| pureTV | **启动器（Launcher／电视桌面）** | 提供电视首页和应用入口；显示时间、日期，可设置壁纸、天气和屏保；通过遥控器打开播放器、文件管理器和应用商城 | 0.1.5 | **341.1 KiB**（349,264 字节） |
| [Music TV](apps/music/README.md) | **独立 App／音乐播放器** | B 站音乐搜索／BV 输入与音轨播放、本地音频、收藏和播放队列，支持后台音频播放 | 0.1.1 | **32.7 KiB**（33,484 字节） |
| [ShortVideo TV](apps/shortvideo/README.md) | **独立 App／短视频播放器** | 获取多平台随机短视频，打开后自动播放、连续播放，支持遥控器上下切换和播放／暂停 | 0.1.0 | **23.6 KiB**（24,160 字节） |
| [WebTV](apps/webtv/README.md) | **独立 App／电视直播播放器** | 播放卫视／央视直播，支持频道分类、收藏、全屏切台、切换线路，以及网络／本地 M3U 频道列表导入 | 0.1.0 | **33.4 KiB**（34,204 字节） |

以上大小以 [v0.1.5 发布页](https://github.com/ecojust/pureTV/releases/tag/v0.1.5) 的签名安装包为准，1 KiB = 1,024 字节；这是 APK 文件大小，安装后的存储占用和运行内存会随系统及播放内容变化。

四个软件分别打包、按需安装。只想换电视桌面，安装 **pureTV** 并在系统中选择默认桌面；只想听音乐、刷短视频或看直播，安装对应 **App** 即可，也能从原厂桌面打开。安装启动器不会自动安装三个播放器；全部安装后，可从启动器的「全部应用」页进入它们。

## 电脑端管理工具

[pureTV Manager 0.1.2](https://github.com/ecojust/pureTV/releases/tag/desktop-v0.1.2) 用于从电脑管理电视，使用方式如下：

1. 在电脑安装并打开管理器，程序会检测已有 ADB。缺少时点击「下载并配置 ADB」，阅读并勾选 Android SDK 许可后确认，从 Google 官方下载 Platform Tools 37.0.1，校验、解压并自动配置。下载完成后可离线复用，也保留手动选择 `adb.exe`／`adb` 的方式。Windows 使用系统 WebView2，便携版需电脑已安装该运行时。
2. 电视开启 ADB／网络调试，电脑与电视连接到可互通的网络。输入电视 IP 和实际调试端口，点击连接，并在电视上接受授权；支持配对码的电视可先配对再连接。
3. 扫描当前电视用户的全部已安装应用，按包名／已知名称搜索，筛选系统应用、用户应用、已停用及可恢复项目，勾选后执行停用、启用、为当前用户卸载或恢复。
4. 在「安装应用」点击「添加安装包」，从电脑添加自己的 APK，勾选后点击「安装所选」。添加文件不会立即安装；首版支持普通单 APK。
5. 在「启动器」查看已安装的桌面，也可导入自定义启动器 APK，安装后选择默认桌面；管理器记录原桌面，供恢复时使用。

系统应用的「为当前用户卸载」保留数据且不删除系统分区 APK；恢复要求设备仍保有该安装包。应用清单以真实包名为准，首版仅为已知应用提供友好名称，不保证所有应用的本地化名称和图标。实际操作结果和厂商限制会显示在界面与操作记录中。

Platform Tools 只安装在电脑的应用数据目录，不写入电视或系统 PATH；下载支持进度、取消和重试。下载量为 Windows 约 7.67 MiB、macOS 约 15.36 MiB、Linux 约 8.63 MiB，解压后分别约占 16.72／37.02／21.17 MiB。更换 ADB 前需先断开电视。

macOS 用户将 DMG 内的应用拖入「应用程序」。应用采用完整 ad-hoc 签名，最低系统版本为 macOS 11；尚未使用 Developer ID 证书或完成 Apple 公证。出现「已损坏」或开发者验证提示时，请按 [macOS 安装与首次打开](desktop/README.md#macos-安装与首次打开) 校验下载并处理。

详细连接步骤、恢复范围、运行环境和开发说明见 [desktop/README.md](desktop/README.md)。桌面程序与 Android APK 分别发布，桌面版 0.1.2 不改变 Android 最新版本 **v0.1.5**。当前尚未完成真实电视连接与操作验证。

![桌面渲染预览（Robolectric，非电视实机截图）](docs/previews/home-render.png)

## 启动器功能

- 极简深色桌面：左上时间与日期、右上文字导航、底部四个纯色卡片，细白框提示焦点。
- 桌面顺序：音乐、哔哩哔哩、文件、应用。
- 音乐：优先启动独立的 [Music TV](apps/music/README.md) 轻量播放器；未安装时通过电视浏览器打开 [SomaFM 免费网络电台](https://somafm.com/player/)。
- 哔哩哔哩：优先打开已安装的 TV 版，没有安装时明确提示。
- 文件：优先打开已安装的文件管理器；没有可用管理器时使用系统文件选择器，选中文件后交给支持它的应用打开。
- 应用：优先打开当贝市场、Google Play、小米应用商店或支持 Android 商城入口的厂商应用；不可用时打开 [当贝官网](https://www.dangbei.com/)，没有商城和浏览器时明确提示。
- 桌面按下方向键或点击底部「全部应用」，仍可进入包含音乐、短视频、WebTV 直播和 5 个占位项的独立列表页；返回键回桌面。
- 菜单键打开快捷设置；顶栏「常用」将焦点移回底部快捷入口。
- 桌面设置：减弱动画、本地壁纸、每日随机壁纸。桌面固定四列，应用页随屏幕宽度采用三列或四列。
- 时钟、日期、可选时钟屏保；可选天气、城市搜索和空气质量。
- 简体中文、繁体中文及参考项目提供的其他语言，跟随系统语言。
- 可选无障碍服务：Home 键回顶、在其他应用中打开快捷设置。

pureTV 启动器沿用包名 `com.ecojust.cleanyourtv` 和既有发布签名，可覆盖升级旧版 cleanyourtv-c 并保留设置。仓库及应用显示名已更名为 pureTV；三个独立播放器的包名保持各自独立。

## 配套应用

- [Music TV](apps/music/README.md)：B 站音乐和本地音频播放器，封面内存缓存最多 1 MiB。已按 BiliMusic 请求流程补齐 DASH 参数并验证样本 AAC 文件；开发网络的详情接口仍返回 412，完整电视播放链路待实测。
- [ShortVideo TV](apps/shortvideo/README.md)：免费免 Key 的多平台随机短视频，自动播放和遥控器上下切换；单一原生播放器，不缓存视频。
- [WebTV](apps/webtv/README.md)：卫视／央视直播、遥控器切台、收藏和多线路；支持网络或本地 M3U 导入，单播放器，无视频缓存。

三个应用与桌面分别安装，复用同一套构建工具，没有生产环境第三方依赖；CI 分别限制 Release APK 不超过 5 MiB。新版桌面的「全部应用」页提供三个播放器入口。

## 下载

[电脑端管理器 0.1.2](https://github.com/ecojust/pureTV/releases/tag/desktop-v0.1.2) · [Android 最新版 APK v0.1.5](https://github.com/ecojust/pureTV/releases/tag/v0.1.5) · [全部版本](https://github.com/ecojust/pureTV/releases)

电脑端管理器提供 Windows x64 安装版／便携版、macOS ARM64 DMG 和 Linux x64 DEB；请安装到电脑。Android v0.1.5 包含以下四个电视安装包，按用途选择：

- [pureTV-0.1.5.apk](https://github.com/ecojust/pureTV/releases/download/v0.1.5/pureTV-0.1.5.apk)：电视桌面启动器。
- [music-tv-0.1.1.apk](https://github.com/ecojust/pureTV/releases/download/v0.1.5/music-tv-0.1.1.apk)：音乐 App。
- [shortvideo-tv-0.1.0.apk](https://github.com/ecojust/pureTV/releases/download/v0.1.5/shortvideo-tv-0.1.0.apk)：短视频 App。
- [webtv-0.1.0.apk](https://github.com/ecojust/pureTV/releases/download/v0.1.5/webtv-0.1.0.apk)：电视直播 App。

仓库发布版本与各 App 的版本分别管理，因此同一发布页中的版本号可能不同。

## 构建

需要 JDK 17 或 21、Android SDK Platform 35 与 Build Tools 34.0.0。设置 `ANDROID_HOME`，或在 `launcher/local.properties` 中写入 `sdk.dir=/你的/SDK/路径`。

```bash
cd launcher
./gradlew assembleDebug
# Windows: .\gradlew.bat assembleDebug
```

安装包：`launcher/app/build/outputs/apk/debug/app-debug.apk`。首次构建需要联网下载 Gradle 和依赖。使用 Android 默认本地 debug 签名，不依赖原作者电脑上的密钥。

```bash
./gradlew assembleRelease lintDebug testDebugUnitTest
```

Release 启用 R8 和资源压缩。未提供签名配置时输出 `app/build/outputs/apk/release/app-release-unsigned.apk`；设置 `ANDROID_KEYSTORE_PATH` 与 `ANDROID_KEYSTORE_PASSWORD` 后输出已签名的 `app-release.apk`，密钥别名为 `cleanyourtv-c`。后续升级必须继续使用同一密钥，不要把密钥提交到仓库。正式发布页提供已签名的 APK。

GitHub Actions 会构建 Debug、Release 并运行 lint、壁纸下载测试及页面导航测试；仓库签名 Secrets 可用时自动签名 Release，否则输出未签名构建，APK 可在对应工作流的 Artifacts 下载。CI Debug 密钥不保证跨运行一致；需要持续覆盖升级时请在本地使用固定密钥构建。

## 安装与使用

电视启用开发者选项和 USB/网络调试，并允许电脑连接。电视与电脑在同一网络：

```bash
adb connect <电视IP>:5555
adb -s <电视IP>:5555 install -r launcher/app/build/outputs/apk/debug/app-debug.apk
adb -s <电视IP>:5555 shell cmd package set-home-activity --user 0 com.ecojust.cleanyourtv/.MainActivity
adb -s <电视IP>:5555 shell am start -n com.ecojust.cleanyourtv/.MainActivity
```

也可以把 APK 拷到电视，用文件管理器安装，再从系统设置选择默认桌面。部分厂商固件限制第三方桌面，是否可用取决于设备。

一键构建安装（需要 `adb` 在 PATH 中）：

```bash
TV_HOST=192.168.1.50 ./launcher/build-and-install.sh
```

Windows PowerShell：

```powershell
$env:TV_HOST = "192.168.1.50"
.\launcher\build-and-install.ps1
```

脚本不会禁用原厂桌面。要还原，请在系统设置中选择原桌面，或执行：

```bash
adb shell cmd package set-home-activity --user 0 <原桌面包名/Activity>
```

建议替换前先通过 `adb shell cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME` 记录原桌面组件。

## 个性化

在顶栏「桌面」中设置壁纸、动画和天气。当前应用列表包含三个播放器入口和五个占位项，尚未接入已安装应用枚举。应用页按返回键或点击「返回」回到桌面，桌面保留离开时的焦点。

天气与每日随机壁纸默认关闭，启用后需要联网。在线壁纸使用 `https://picsum.photos/1920/1080?random=1`，按需跟随 HTTPS 重定向获取 1920×1080 图片，每天最多成功更新一次；下载失败保留原壁纸。天气请求使用 Open-Meteo；手动点击城市定位时会请求 ipinfo.io。Wi-Fi 名称读取在部分 Android 版本需要位置权限，天气本身不依赖 GPS。

可选 Home 键增强：在系统「无障碍 → 已下载的服务」启用本应用的「Home 键回顶」。屏保可在系统屏保设置中选择。

进阶配置目录：`/sdcard/Android/data/com.ecojust.cleanyourtv/files/`。支持 `config.json` 和固定文件名 `wallpaper.jpg`（内容可为 JPEG、PNG 或 WebP），修改后重启桌面。背景色、输入源等默认配置见 [config.xml](launcher/app/src/main/res/values/config.xml)。旧的 Dock 和列数配置不作用于当前固定四入口桌面。

```bash
./tools/set-wallpaper.sh <电视IP> <图片路径>
```

[桌面渲染预览](docs/previews/home-render.png) · [应用页渲染预览](docs/previews/apps-render.png)（Robolectric 渲染，非电视实机截图）。完整验证记录与限制见 [VALIDATION.md](docs/VALIDATION.md)。

## 来源与许可

本项目参考自 [Gathin23/cleanyourtv](https://github.com/Gathin23/cleanyourtv)，本分支实现极简桌面与独立应用列表页，并适配独立应用标识、构建签名、安装工具及自动构建。原作者 Gathin、mclhm8182 的版权保留在 [LICENSE](LICENSE) 和 [NOTICE.md](NOTICE.md)。Outfit 字体使用 [SIL OFL](launcher/FONT-LICENSE-OFL.txt)。
