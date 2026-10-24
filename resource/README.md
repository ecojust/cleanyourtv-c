# 电视 APK 资源目录

每个资源文件夹至少包含一个真实 APK，以及 resource.json、许可证和校验文件；可附对应源码及封面。点击软件名称进入文件夹下载。第三方 APK 保持上游原始二进制与签名。

“支持自定义”指 pureTV 管理器画布使用的 layout.json 版本 2 接口。上游截图、纯 TV 渲染示例与相关许可见各文件夹说明。

### 启动器

| 名称 | 作者 | 版本 | 支持自定义 | 封面截图 |
| --- | --- | --- | --- | --- |
| [pureTV Launcher](puretv-launcher/) | ecojust / 桔子桑 | 0.3.0 | 是 | <img src="puretv-launcher/thumb.png" width="180" alt="pureTV Launcher 界面"> |

### 电视应用

| 名称 | 作者 | 版本 | 用途 | 封面截图 |
| --- | --- | --- | --- | --- |
| [Jellyfin for Android TV](jellyfin-tv/) | Jellyfin contributors | 0.19.10 | Jellyfin 媒体服务器的 Android TV 客户端 | <img src="jellyfin-tv/thumb.png" width="180" alt="Jellyfin for Android TV 界面"> |
| [TV Bro](tvbro/) | Fedir Tsapana (truefedex) | 2.1.6 | 适配遥控器的电视浏览器，使用系统 WebView | <img src="tvbro/thumb.png" width="180" alt="TV Bro 界面"> |

维护校验：`python tools/resource_catalog.py --build-tools <Android Build Tools 34.0.0 目录>`。索引由 `python tools/update-resource-index.py` 根据资源元数据生成。
