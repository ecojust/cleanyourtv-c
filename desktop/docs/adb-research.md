# ADB 能力调研

以下为官方文档、AOSP 源码及本机 ADB 37.0.1 帮助的只读核对，尚未连接电视验证。SERIAL 为已确认设备，U 为 `am get-current-user` 返回的当前用户，PACKAGE／COMPONENT 为从设备查询并校验后的标识。

| 操作 | 命令 |
| --- | --- |
| 网络连接 | `adb connect IP:PORT` |
| 配对式无线调试 | `adb pair IP:PAIR_PORT`（交互传入配对码），随后 `adb connect IP:DEBUG_PORT` |
| 检查授权／在线状态 | `adb devices -l` |
| 当前用户 | `adb -s SERIAL shell am get-current-user` |
| 已安装应用 | `adb -s SERIAL shell pm list packages --user U` |
| 系统应用／已停用应用 | 在以上查询中分别加 `-s`、`-d` |
| 停用／启用 | `adb -s SERIAL shell pm disable-user --user U PACKAGE` / `pm enable --user U PACKAGE` |
| 当前用户卸载并保留数据 | `adb -s SERIAL shell pm uninstall -k --user U PACKAGE` |
| 恢复仍保有安装包的应用 | `adb -s SERIAL shell cmd package install-existing --user U PACKAGE`，再恢复原启用状态 |
| 查询 HOME 启动器 | `adb -s SERIAL shell cmd package query-activities --components --user U -a android.intent.action.MAIN -c android.intent.category.HOME` |
| 当前默认 HOME | `adb -s SERIAL shell cmd package resolve-activity --brief --user U -a android.intent.action.MAIN -c android.intent.category.HOME` |
| 设置 HOME | `adb -s SERIAL shell cmd package set-home-activity --user U COMPONENT` |
| 安装 APK | `adb -s SERIAL install --user U -r FILE.apk` |

普通网络 ADB 常见端口为 5555，但以设备实际显示值为准。配对端口和调试端口可能不同，按电视是否提供配对界面处理；不能假设所有 Android 11 电视都支持配对式无线调试。当前官方文档列 TV Android 13 起支持此方式。

`connect` 输出成功不代表已授权，须再次检查设备状态。连接状态区分连接中、等待电视授权、在线、离线和失败。断开只针对当前设备。

普通应用列表不加 `-u`；该选项还会包含当前用户已卸载但设备仍保有的包，后续单独用于“可恢复”列表，不应计入已安装数量。

安装自定义启动器后先查询并验证 HOME 组件，再切换并重新解析默认桌面。保留原组件；部分厂商会拒绝设置或在重启后恢复默认值，按实际结果反馈。

任何修改都同时检查退出码、命令返回的 Success／Failure 文本与设备状态复查，不能仅凭退出码 0 宣称成功。停用撤销须区分原本 DEFAULT 与显式 ENABLED 状态，可用 `pm default-state`／`pm enable` 还原。分包安装须另用 `install-multiple`，首版文件选择只接受单 APK。

来源：

- [Android 官方 ADB 文档](https://developer.android.com/tools/adb)
- [ADB 命令手册](https://android.googlesource.com/platform/packages/modules/adb/+/refs/heads/main/docs/user/adb.1.md)
- [当前 PackageManagerShellCommand](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/java/com/android/server/pm/PackageManagerShellCommand.java)
- [Android 8.0 PackageManagerShellCommand](https://android.googlesource.com/platform/frameworks/base/+/android-8.0.0_r1/services/core/java/com/android/server/pm/PackageManagerShellCommand.java)
