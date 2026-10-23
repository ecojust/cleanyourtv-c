# Music TV

面向 Android TV 遥控器的独立原生音乐播放器。Android 8.0（API 26）及以上，包名 `com.ecojust.music`，首版 `0.1.0`。

![原生 TV 界面渲染预览，曲目为测试示例，非线上搜索结果或电视实机截图](docs/music-tv.png)

## 功能

- 关键词搜索 B 站音乐分区公开视频，或粘贴 BV 号／完整 BV 链接。
- 仅获取 AAC 音轨，选择较低带宽版本；交给系统 MediaPlayer 流式播放，不下载视频。
- 上一首、播放／暂停、下一首、进度调整、连续播放、全屏播放页。
- 按需打开队列；长按歌曲可加入队列、收藏或取消收藏。
- 收藏、最近播放和队列只保存在本机；不需要账号。
- 通过系统文件选择器打开本地音频，不申请整盘存储权限。
- 原生音频焦点、后台播放通知及媒体按键；离开页面后可继续播放，暂停后退出页面会释放播放器。
- 安装后，配套桌面的「音乐」优先启动此应用；未安装时桌面继续打开 SomaFM。

方向键移动焦点，确定键选择；长按确定键打开歌曲菜单，返回键关闭弹窗或退出。搜索需要系统输入法，也可从其他设备粘贴 BV 链接。电视若没有系统文件选择器，本地音频入口会明确提示。

## 轻量策略

- Java + Android 原生 View，**没有生产环境第三方依赖**，没有 WebView、跨端运行时或内置解码库。
- 一个 Activity、一个播放 Service；列表复用行视图，队列不常驻侧栏。
- 封面最多缓存 **1 MiB**，解码尺寸最多 160 × 160，单张下载最多 512 KiB；页面离开或系统要求回收时清理缓存。
- 最多 50 首队列、100 首收藏、30 条最近记录；不保存音频文件或临时音频地址。
- 网络搜索和封面下载使用有界任务队列；旧搜索结果不会覆盖新搜索，播放请求可取消，音频加载会超时退出。
- Release 启用 R8 和资源压缩；CI 检查 APK 不超过 **5 MiB**。首版已签名 Release 实测 **32,780 字节（约 32 KiB）**；安装后占用会因系统 dex 优化而增加。内存峰值及启动速度仍需在目标电视实测。

## 构建

复用仓库现有 Gradle、SDK 和签名配置，无需独立工程或第二份 Wrapper：

```bash
cd launcher
./gradlew :music:assembleDebug
./gradlew :music:verifyReleaseSize :music:lintDebug :music:testDebugUnitTest
```

Debug：`apps/music/build/outputs/apk/debug/music-debug.apk`。Release：`apps/music/build/outputs/apk/release/music-release-unsigned.apk`；设置根 README 中的签名环境变量后生成 `music-release.apk`。测试依赖只用于开发，不打进 APK。

```bash
adb install -r apps/music/build/outputs/apk/release/music-release.apk
adb shell am start -n com.ecojust.music/.MainActivity
```

## 验证边界

搜索、BV 信息和音轨来自 B 站公开接口。接口可能变化，或因网络、地区、验证、下架、登录及授权要求而不可用；应用会显示失败原因，不绕过这些限制，也不保证全部视频可播放。首版仅播放视频默认分 P 的公开 AAC 音轨。

开发环境访问 B 站搜索／视频接口返回 HTTP 412，**尚未验证真实在线播放成功**。自动测试覆盖响应解析、错误提示路径、低带宽音轨选择、本地资料上限、队列恢复及 TV 页面布局；这些测试不代表电视实机或线上音轨验证。请在电视所在网络验证搜索、音频兼容性、后台播放和遥控器按键。

## 交互参考

参考 [HanversionOvO/BiliMusic](https://github.com/HanversionOvO/BiliMusic) 和 [NaivG/bilimusic](https://github.com/NaivG/bilimusic) 的搜索、收藏、播放队列等产品思路，独立实现 TV 交互，未复制其源码或美术资源。

早期 [设计提案](docs/design-proposal.png) 中的曲目与封面仅为示意。轻量实现将常驻右侧队列改为按需弹窗。
