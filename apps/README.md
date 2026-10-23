# TV 应用

此目录包含三个可独立安装的 Android TV 播放器 App，负责音乐、短视频和电视直播。电视桌面启动器位于 [`launcher/`](../launcher/)，负责首页与应用入口；完整对比见[根 README 的软件总览](../README.md#软件总览)。

| 目录／软件 | 类型与职责 | 主要功能 | 软件版本 | 已签名 APK 大小 |
| --- | --- | --- | --- | --- |
| [music／Music TV](music/README.md) | 音乐播放器 App | B 站音乐搜索／BV 输入与音轨播放、本地音频、收藏及队列、后台音频播放 | 0.1.1 | 32.7 KiB（33,484 字节） |
| [shortvideo／ShortVideo TV](shortvideo/README.md) | 短视频播放器 App | 免费免 Key 的多平台随机短视频、自动连播、遥控器上下切换和播放／暂停 | 0.1.0 | 23.6 KiB（24,160 字节） |
| [webtv／WebTV](webtv/README.md) | 电视直播播放器 App | 卫视／央视直播、分类、收藏、全屏切台、线路切换、网络和本地 M3U 导入 | 0.1.0 | 33.4 KiB（34,204 字节） |

大小来自 [v0.1.4 发布](https://github.com/ecojust/cleanyourtv-c/releases/tag/v0.1.4)，1 KiB = 1,024 字节，表示安装包文件大小，不代表安装后占用或运行内存。网络接口与直播线路的可用性及验证限制见各 App 的 README。

三个 App 按需分别安装，均可在原厂桌面打开，也可从本项目启动器的「全部应用」页打开。启动器安装包不包含这些 App。它们共用 Gradle 构建工具，没有生产环境第三方依赖。

从 `launcher/` 运行 `./gradlew :music:assembleDebug :shortvideo:assembleDebug :webtv:assembleDebug` 可构建三个 App。新版桌面的「全部应用」页包含三个播放器入口和五个占位项。
