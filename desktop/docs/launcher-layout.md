# 当前启动器的预览与自定义布局

管理器编辑的是电视上**当前默认启动器**的布局。先连接并授权电视，然后在「启动器」点击「读取当前布局」。只有成功读取到已适配、可验证的控制接口时，才显示编辑器。

目前适配的是本仓库**加入 `LauncherLayoutProvider` 的新版 pureTV 启动器**。已经发布的电视端 0.1.5 没有该接口，需要安装包含本次改动的电视 APK；只更新电脑管理器不能给旧启动器添加自定义能力。其他启动器即使有自己的自定义设置，也需要独立适配其官方或可验证的接口，当前显示为不可编辑，不尝试猜测和改写私有配置。

## 实际桌面截图

「显示当前桌面并截图」会在电视上打开当前 HOME，执行截图并传回管理器，作为对应卡片的封面。此操作不切换默认启动器。没有截图时显示占位提示，不把示意图当作电视实机截图。

截图最大 8 MiB，临时文件使用后清理，不放入持久操作记录。电视固件限制截图时会报告实际错误。MCP 的 `capture_launcher_preview` 返回标准图片内容，Agent 可以直接查看。

## apps.json 布局

在编辑器中选择首页／全部应用列表，可添加电视中可启动的应用、上移／下移、移除、设置名称、选择图标和卡片颜色，调整每行列数。图标列表来自当前电视的 PackageManager，不需要从互联网猜图标。`app` 使用应用本身的图标，也可选择内置符号。

编辑和导入先保留在电脑端草稿；点击「应用布局」并确认后，管理器写入当前启动器，并读回两次核对结果。「恢复默认布局」移除 apps.json 覆盖，不清除壁纸、天气等其他设置。

示例：

```json
{
  "version": 1,
  "columns": 4,
  "home": [
    {"packageName":"com.ecojust.music","label":"音乐","icon":"app","color":"#303338"},
    {"packageName":"com.ecojust.webtv","label":"直播","icon":"app","color":"#3B4C46"},
    {"action":"files","icon":"files","color":"#374959"}
  ],
  "apps": [
    {"packageName":"com.ecojust.shortvideo","icon":"app"},
    {"packageName":"com.ecojust.music","icon":"music"}
  ]
}
```

- `version`：固定为 1；`columns`：1–6。
- `home`：首页有序卡片，1–24 项；多行支持遥控器上下移动并在列表中滚动。
- `apps`：「全部应用」有序卡片，0–100 项。
- 应用卡片使用 `packageName`；可选 `label` 覆盖显示名，省略时读取应用名称。
- 内置入口使用 `action`，支持 `music`、`bilibili`、`files`、`apps`（应用商城）、`shortvideo`、`webtv`、`placeholder`。不能同时指定 `packageName`。
- `icon` 支持 `app`、`music`、`video`、`files`、`apps`、`picture`、`settings`、`input`。
- `color` 为 `#RRGGBB`。同一列表不能重复相同应用或内置入口（占位项除外）。

配置最多 48 KiB；不接受 shell、任意 Intent、远程脚本或图标 URL。错误配置不会覆盖已保存的有效配置，读取损坏文件时退回默认桌面，避免首页无法打开。

电视端每次首页恢复／配置应用时重新读取 apps.json，不需要重新编译应用。管理器通过受 `android.permission.DUMP` 保护的 ContentProvider 访问私有配置；普通电视应用不能据此改写桌面。也保留外部应用目录 `Android/data/com.ecojust.cleanyourtv/files/apps.json` 的手动覆盖方式；管理器写入的私有配置优先，恢复默认会删除这两处 apps.json 覆盖。默认模板位于 `launcher/app/src/main/assets/apps.json`，管理器也提供 `desktop/public/apps.json` 示例。

## MCP

- `get_launcher_layout`：获取当前 HOME 的支持状态、布局和带图标的可启动应用列表。
- `apply_launcher_layout { layoutJson: "…JSON 文本…" }`：校验、应用并读回当前布局。
- `reset_launcher_layout`：恢复默认并读回。
- `capture_launcher_preview`：打开当前 HOME 并返回实际 PNG 图片。
- `choose_launcher_json`：打开原生 JSON 选择器，返回配置文本，不直接应用。

写入前再次检查当前设备、Android 用户与默认 HOME。操作、错误及预览结果同步到管理器窗口。未知启动器或旧版 pureTV 没有成功握手时不会写入任何配置。
