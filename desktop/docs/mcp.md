# MCP：让 Agent 控制已打开的 pureTV 管理器

本功能控制电脑上正在运行的管理器。Agent 与窗口共用同一个设备、Android 用户、ADB 配置、操作锁和操作记录；无需另外启动无窗口的管理服务。

## 配置

1. 打开支持 MCP 的 pureTV 管理器，进入「设备连接」。
2. 在「MCP · Agent 调试」中复制完整 JSON，加入 Agent 客户端的 MCP 配置。
3. 在客户端重新连接 `puretv` 服务。管理器需要保持打开。

配置使用标准 **stdio**，示例（实际路径以窗口显示为准）：

```json
{
  "mcpServers": {
    "puretv": {
      "command": "/Applications/pureTV Manager.app/Contents/MacOS/puretv-desktop",
      "args": ["--mcp", "/Users/you/Library/Application Support/com.ecojust.puretv.manager/mcp-session.json"]
    }
  }
}
```

Windows 的 `command` 是已安装的管理器 EXE 或便携 EXE。Linux 使用实际可执行文件路径。不要把 `command` 设置成 DMG、安装程序或 DEB；移动应用后重新复制配置。

`--mcp` 是当前窗口的代理，不创建第二套电视连接或管理状态。管理器内部仅监听 `127.0.0.1` 的随机端口，每次启动生成随机凭据；代理自动读取受保护的本机会话文件，不需要把令牌放到 Agent 配置。拒绝浏览器 Origin 请求，不允许跨电脑访问。重启窗口后请重新连接 MCP；关闭窗口后调用会明确报错。

## 全部工具

| 工具 | 参数 | 行为 |
| --- | --- | --- |
| `get_state` | 无 | 当前设备、ADB 状态、应用、启动器、原桌面、最近 200 项记录和消息；忙碌时返回最近快照 |
| `get_status` | 无 | 是否正在操作、是否请求取消、最近下载进度和快照 |
| `set_adb_path` | `path` | 设置本机 ADB 可执行文件；空字符串自动寻找，需先断开电视 |
| `connect` | `host`, `port` | 连接电视，已授权时自动扫描；电视首次授权仍在电视上完成 |
| `pair` | `host`, `port`, `code` | 使用六位配对码及配对端口；配对后用调试端口连接，配对码不保存 |
| `disconnect` | 无 | 断开当前电视 |
| `scan` | 无 | 刷新当前 Android 用户的应用、恢复候选和启动器 |
| `set_enabled` | `packages`, `enabled` | 对明确列出的包启用／停用，最多 100 项 |
| `uninstall` | `packages` | 为当前用户卸载并保留数据，不删除系统分区 APK |
| `restore` | `packages` | 恢复设备上仍存在安装包的系统应用 |
| `install` | `paths` | 按顺序安装 1–10 个本机 APK 完整路径，不支持 APKS/XAPK |
| `set_home` | `component` | 切换已安装且声明 HOME 的组件，并记录原桌面 |
| `restore_home` | 无 | 恢复此设备／用户记录的原桌面 |
| `clear_history` | 无 | 清空保存的操作记录 |
| `cancel` | 无 | 取消扫描／下载，或跳过后续批量项；正在修改的一项会完成并复查 |
| `platform_tools_info` | 无 | 查询固定版本、大小、缓存及系统支持情况，不下载 |
| `install_platform_tools` | `acceptedLicense: true` | 校验离线缓存或从 Google／腾讯镜像下载安装并配置 ADB；需先断开电视，且用户已同意 SDK 许可 |
| `choose_apks` | 无 | 在管理器打开原生多选 APK 对话框，只返回路径，不安装 |
| `choose_adb` | 无 | 在管理器打开原生可执行文件对话框，只返回路径，不配置 |
| `open_resource` | `resource` | 打开 `releases`、`platformTools` 或 `platformToolsLicense` 对应的固定网页 |

应用筛选、搜索、查看记录可基于 `get_state` 的 `packages`、`launchers`、`history` 完成；Agent 可直接提交选定的包名或 APK 路径，不需要模拟勾选界面。文件选择器需要用户在窗口操作，自动化时直接提供本机完整路径更方便。

## 调试示例

对 Agent 说：

> 连接 192.168.1.50:5555，列出已安装的第三方应用和当前启动器。

典型调用顺序：

```text
get_state {}
connect {"host":"192.168.1.50","port":5555}
get_state {}
set_enabled {"packages":["com.vendor.recommendations"],"enabled":false}
get_state {}
```

Agent 的操作、完成状态和 ADB 下载进度会同步显示在窗口中。界面与 MCP 同时修改时，后到的操作收到「已有操作正在执行」；`get_state`、`get_status`、`cancel` 在任务执行时仍可调用。

成功结果同时提供文本 JSON 和 `structuredContent.result`。操作失败时 `isError: true`；批量部分失败时返回 `{ snapshot, failedTargets }` 并同样标记为错误，不能把部分失败说成全部成功。取消不会回滚已完成的批量项，实际结果以快照和记录为准。

MCP 沿用后端的核心组件、当前 HOME 保护、目标设备／用户复查、路径与参数校验。没有任意 shell 或绕过保护的接口。Agent 安装 Platform Tools 前，用户仍需阅读并同意 [Android SDK 许可协议](https://developer.android.com/studio/terms)。

## 开发验证

`cargo test --locked --manifest-path src-tauri/Cargo.toml` 验证协议、完整工具参数映射、令牌／Origin 校验和并发取消。`npm run test:ui` 检查配置展示、Agent 状态、下载进度和错误同步。

Linux 原生构建后，在 Xvfb 中运行：

```bash
xvfb-run -a python scripts/verify-mcp.py --binary src-tauri/target/x86_64-unknown-linux-gnu/release/puretv-desktop
```

此检查启动真实管理器与 stdio 代理，使用隔离的应用数据目录和模拟 ADB，验证设备操作、部分失败、保护、取消、关闭窗口错误和配对码不落盘；不连接真实电视。
