# 启动器安装、背景图与布局画布

在「启动器」添加本地 APK 后，可直接在该页面逐项安装。安装成功刷新电视列表，失败保留待安装项。不会自动更换默认桌面。

## 可选背景图

启动器卡片默认没有封面区域。提供 PNG、JPEG 或 WebP（最多 4 MiB）后，图片作为整张卡片的背景，文字和按钮位于其上。导入 APK 时优先读取同目录 `APK名.thumb.png`，再读取 `thumb.png`（也支持 jpg/jpeg/webp）。新安装启动器继承该图片。已安装卡片也可「选择背景图」或「移除背景」，本地保存，重启后仍可使用。没有电视截图或实时画面功能。

## 调整布局

管理器检测当前默认启动器的布局接口。pureTV Launcher 0.3.0 使用版本 2 接口，成功握手后，当前激活卡片显示「调整布局」；其他卡片不显示该按钮。0.2.0 旧接口或未适配的第三方启动器不可编辑。

按钮打开全局电视画布弹窗，以 16:9 画布显示卡片。Home 与 Apps 各自设置列数；拖动卡片或使用前移／后移按钮排序，可修改名称、图标和颜色、移除或添加卡片。应用来源限制为当前用户已安装、启用、具有启动入口的非系统应用，前端、管理器和电视接口都进行校验；系统应用、已卸载应用不会成为候选。启动器默认的内置导航入口保留在默认模板中。

编辑和导入只改变本地草稿，「取消」放弃草稿。「应用到电视」确认后才写入，随后两次读取核对；切换设备或默认启动器时关闭旧画布。恢复默认只移除布局覆盖，保留壁纸、天气等设置。

## layout.json

```json
{
  "version": 2,
  "home": {
    "columns": 4,
    "items": [
      {"packageName":"com.ecojust.music","label":"音乐","icon":"app","color":"#303338"}
    ]
  },
  "apps": {
    "columns": 5,
    "items": [
      {"packageName":"com.ecojust.webtv","label":"直播","icon":"app","color":"#3B4C46"}
    ]
  }
}
```

`version` 固定为 2，home/apps 必须各含 `columns`（1–6）与 `items`。首页最多 24 项，应用页最多 100 项，均可为空。同页不允许重复包名。`label` 最多 100 字；`icon` 支持 app/music/video/files/apps/picture/settings/input；`color` 是 #RRGGBB。

整个文件最多 48 KiB，不支持命令、任意 Intent 或远程图标 URL。无效写入不会覆盖有效配置。电视每次页面恢复重新加载配置。私有 `files/layout.json` 优先，其次 `Android/data/com.ecojust.puretv/files/layout.json`；默认模板在 `launcher/app/src/main/assets/layout.json`，电脑端示例在 `desktop/public/layout.json`。**不读取、不迁移旧版 apps.json**。

接口由 `android.permission.DUMP` 保护，普通应用不能改写。MCP 的 get_launcher_layout、apply_launcher_layout、reset_launcher_layout 和 choose_launcher_json 使用同一格式、设备与当前 HOME 检查；背景图通过 get_launcher_covers、set_launcher_cover 管理。
