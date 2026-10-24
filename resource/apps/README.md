# 电视应用

每个软件目录直接包含可安装 APK、对应源码、作者、许可证及校验值。包括 Music TV、ShortVideo TV、WebTV、TV Bro 和 Jellyfin TV。完整版本、作者及封面见 [资源总表](../README.md)。

自研应用源码在各自 src/ 中，第三方源码为 source.tar.gz。启动器位于 [../launcher/](../launcher/)。

从仓库根目录进入 resource/launcher，运行 `./gradlew :music:assembleDebug :shortvideo:assembleDebug :webtv:assembleDebug` 构建三个自研应用。安装直接使用各软件目录内的已签名 APK。
