# cleanyourtv-c

参考 [Gathin23/cleanyourtv](https://github.com/Gathin23/cleanyourtv) 实现的 Android TV / Google TV 项目，包含一个电视桌面启动器和三个独立播放器 App，支持 Android 8.0（API 26）及以上系统。

仓库：[ecojust/cleanyourtv-c](https://github.com/ecojust/cleanyourtv-c)

## 软件总览

| 软件 | 类型 | 负责什么／主要功能 | 软件版本 | 已签名 APK 大小 |
| --- | --- | --- | --- | --- |
| cleanyourtv-c | **启动器（Launcher／电视桌面）** | 提供电视首页和应用入口；显示时间、日期，可设置壁纸、天气和屏保；通过遥控器打开播放器、文件管理器和应用商城 | 0.1.4 | **341.1 KiB**（349,264 字节） |
| [Music TV](apps/music/README.md) | **独立 App／音乐播放器** | B 站音乐搜索／BV 输入与音轨播放、本地音频、收藏和播放队列，支持后台音频播放 | 0.1.1 | **32.7 KiB**（33,484 字节） |
| [ShortVideo TV](apps/shortvideo/README.md) | **独立 App／短视频播放器** | 获取多平台随机短视频，打开后自动播放、连续播放，支持遥控器上下切换和播放／暂停 | 0.1.0 | **23.6 KiB**（24,160 字节） |
| [WebTV](apps/webtv/README.md) | **独立 App／电视直播播放器** | 播放卫视／央视直播，支持频道分类、收藏、全屏切台、切换线路，以及网络／本地 M3U 频道列表导入 | 0.1.0 | **33.4 KiB**（34,204 字节） |

以上大小以 [v0.1.4 发布页](https://github.com/ecojust/cleanyourtv-c/releases/tag/v0.1.4) 的签名安装包为准，1 KiB = 1,024 字节；这是 APK 文件大小，安装后的存储占用和运行内存会随系统及播放内容变化。

四个软件分别打包、按需安装。只想换电视桌面，安装 **cleanyourtv-c** 并在系统中选择默认桌面；只想听音乐、刷短视频或看直播，安装对应 **App** 即可，也能从原厂桌面打开。安装启动器不会自动安装三个播放器；全部安装后，可从启动器的「全部应用」页进入它们。

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

独立包名为 `com.ecojust.cleanyourtv`，可以与参考项目同时安装。设置和壁纸各自保存。

## 配套应用

- [Music TV](apps/music/README.md)：B 站音乐和本地音频播放器，封面内存缓存最多 1 MiB。已按 BiliMusic 请求流程补齐 DASH 参数并验证样本 AAC 文件；开发网络的详情接口仍返回 412，完整电视播放链路待实测。
- [ShortVideo TV](apps/shortvideo/README.md)：免费免 Key 的多平台随机短视频，自动播放和遥控器上下切换；单一原生播放器，不缓存视频。
- [WebTV](apps/webtv/README.md)：卫视／央视直播、遥控器切台、收藏和多线路；支持网络或本地 M3U 导入，单播放器，无视频缓存。

三个应用与桌面分别安装，复用同一套构建工具，没有生产环境第三方依赖；CI 分别限制 Release APK 不超过 5 MiB。新版桌面的「全部应用」页提供三个播放器入口。

## 下载

[下载最新版 APK](https://github.com/ecojust/cleanyourtv-c/releases/latest) · [全部版本](https://github.com/ecojust/cleanyourtv-c/releases)

v0.1.4 发布包含以下四个安装包，按用途选择：

- [cleanyourtv-c-0.1.4.apk](https://github.com/ecojust/cleanyourtv-c/releases/download/v0.1.4/cleanyourtv-c-0.1.4.apk)：电视桌面启动器。
- [music-tv-0.1.1.apk](https://github.com/ecojust/cleanyourtv-c/releases/download/v0.1.4/music-tv-0.1.1.apk)：音乐 App。
- [shortvideo-tv-0.1.0.apk](https://github.com/ecojust/cleanyourtv-c/releases/download/v0.1.4/shortvideo-tv-0.1.0.apk)：短视频 App。
- [webtv-0.1.0.apk](https://github.com/ecojust/cleanyourtv-c/releases/download/v0.1.4/webtv-0.1.0.apk)：电视直播 App。

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
