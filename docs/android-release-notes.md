# pureTV Launcher 0.2.0

配套 pureTV Manager 0.2.0，提供真正生效的 apps.json 启动器布局接口：修改首页／全部应用的列数、卡片顺序、名称、图标与颜色，支持添加电视中实际安装且具备启动入口的应用。配置动态读取，不需要为调整排布重新编译。

**新包名为 `com.ecojust.puretv`。** 旧版使用 `com.ecojust.cleanyourtv`，Android 将它们视为两个应用。先保留原桌面，安装新版 APK，再在管理器中设为默认；确认运行正常后再处理旧应用。签名证书保持不变，但不同包名不能直接覆盖升级和继承旧应用私有设置。

自定义控制接口仅向持有系统 DUMP 权限的 Shell／系统调用开放，普通应用无法改写布局。不支持任意命令、任意 Intent 或远程脚本。无效配置不会覆盖已保存的有效配置；读取损坏配置时退回默认桌面。多行布局包含遥控器导航与焦点恢复。

管理器可读取布局、显示应用实际图标、应用并读回复查、恢复默认，以及获取电视上的实际画面。未适配的其他启动器继续使用自身设置，管理器不会尝试写入未知配置。

附件包括新 pureTV 启动器及可选的 Music TV、ShortVideo TV、WebTV；播放器包名与自身版本不因启动器更名而改变。签名、包名、版本与 SHA256 记录见 `release-metadata.json`，下载校验见 `SHA256SUMS.txt`。

电脑端管理器单独下载：[pureTV Manager 0.2.0](https://github.com/ecojust/pureTV/releases/tag/desktop-v0.2.0)。
