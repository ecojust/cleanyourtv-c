# TV 应用

与桌面共用 Gradle 构建、可独立安装的 Android TV 应用：

- [music](music/README.md)：B 站音乐搜索／音轨播放、本地音频、收藏及队列。
- [shortvideo](shortvideo/README.md)：多平台随机短视频，自动连播、遥控器上下切换、免费免 Key 视频源。

从 `launcher/` 运行 `./gradlew :music:assembleDebug :shortvideo:assembleDebug`。播放器独立安装，不需要捆绑安装桌面。新版桌面的「全部应用」页包含两个播放器入口。
