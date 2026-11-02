# 壁纸探测器（Wallpaper Detector）：架构与设计规范

> 状态：Active | 最后更新：2026-10-18
> 关联模块：`src/tools/wallpaper-detector`、`src-tauri/src/commands/system.rs`、`src-tauri/src/commands/file_operations.rs`
> 参考方案：[`wallpaper-detector-plan.md`](./docs/Plan/wallpaper-detector-plan.md)（已实施，保留验收历史）

---

## 1. 模块定位与核心价值

`wallpaper-detector` 是一个轻量系统工具，用于解决「系统正在显示的壁纸是哪张图、存在哪里」的问题，尤其在幻灯片壁纸随机播放场景下，系统设置界面不直接暴露当前壁纸文件路径。

核心能力：

1. **多屏壁纸探测**：获取每个显示器当前显示的壁纸文件绝对路径（Windows 支持真实多屏独立壁纸；macOS/Linux 按桌面环境能力返回）。
2. **预览与查看**：将本地路径转换为 WebView 可加载的安全 URL，卡片内直接预览，点击进入全局图片查看器。
3. **一键定位**：在系统文件管理器中打开壁纸所在目录并高亮选中该文件（Linux 除外，见第 4 节）。
4. **复制路径**：一键复制壁纸绝对路径到剪贴板。

模块为纯 UI 工具，不参与工具调用（VCP）链路，无持久化状态，每次进入页面或手动刷新时实时探测。

---

## 2. 核心架构与数据流

```
┌──────────────────────────────────────────────────────────┐
│              WallpaperDetector.vue（单文件视图）           │
│  工具栏（刷新） / 壁纸卡片网格 / 空状态 / 错误提示          │
└───────────────┬───────────────────────────┬──────────────┘
                │ invoke("get_system_wallpapers") │ invoke("open_file_directory")
                ▼                           ▼
┌───────────────────────────────┐ ┌──────────────────────────────┐
│ system.rs: get_system_wallpapers│ │ file_operations.rs:          │
│ 按平台编译分发，阻塞调用放      │ │ open_file_directory          │
│ Tokio spawn_blocking           │ │ 复用的共享命令（非本模块私有）│
└───────────────────────────────┘ └──────────────────────────────┘
```

- 后端统一返回 `WallpaperInfo { monitorIndex, monitorName, path }`（`#[serde(rename_all = "camelCase")]`），定义于 [`system.rs`](../../../src-tauri/src/commands/system.rs:123)。
- 前端在返回结果上追加 `previewUrl`（`convertFileSrc()` 生成）与 `previewFailed` 两个仅存在于视图层的字段。
- `open_file_directory` 是 `file_operations.rs` 中的共享命令，本模块只作调用方，不改其行为。

---

## 3. 平台探测矩阵

以 [`system.rs`](../../../src-tauri/src/commands/system.rs:131) 当前实现为准。所有平台的阻塞式系统调用均通过 `tokio::task::spawn_blocking` 执行，避免阻塞 Tauri 异步运行时。

| 平台 / 桌面环境 | 探测方式 | 多屏语义 | 关键实现细节 |
| --- | --- | --- | --- |
| Windows 10/11 | Shell `IDesktopWallpaper` COM 接口 | 真实逐屏：`GetMonitorDevicePathCount` + `GetMonitorDevicePathAt` + `GetWallpaper` | RAII 管理 COM apartment（`CoInitializeEx` 失败且为 `RPC_E_CHANGED_MODE` 时跳过 `CoUninitialize`）、接口实例与 `CoTaskMem` 宽字符串释放；幻灯片模式下返回的是当前实际显示的那张图 |
| macOS | `osascript -l JavaScript` 执行 JXA，读取 `System Events` 的 `desktops().picture()` | 按 `desktops()` 顺序逐项映射为「屏幕 N」 | 结果经 `JSON.stringify` 以 JSON 数组传输，避免逗号等文件名字符破坏边界；过滤空路径 |
| Linux + GNOME | `gsettings get org.gnome.desktop.background picture-uri[-dark]` | 单条结果（GNOME 不按物理显示器区分） | 先读 `org.gnome.desktop.interface color-scheme`，深色模式优先 `picture-uri-dark`，失败再尝试另一键；`file://` URI 经 `url::Url::to_file_path()` 转本地路径，也接受绝对路径 |
| Linux + KDE Plasma | 解析 `plasma-org.kde.plasma.desktop-appletsrc` 的 `Image=` 行 | 每条去重后的路径映射为「屏幕 N」，不保证对应物理显示器 | 配置目录优先 `XDG_CONFIG_HOME`，回退 `$HOME/.config`；仅匹配行首 `Image=`（`PreviewImage=` 不会被误提取），路径去重 |
| Linux 其他桌面 | 依赖 `XDG_CURRENT_DESKTOP` / `DESKTOP_SESSION` 判断 KDE/Plasma 关键词决定 GNOME、KDE 的探测顺序 | — | 首选失败自动尝试另一方案；两者都失败时把两条失败原因合并为一条错误返回 |
| 其他平台 | 编译期 `cfg` 兜底分支直接返回「当前系统暂不支持获取壁纸」 | — | — |

路径归一化由 [`normalize_linux_wallpaper_path`](../../../src-tauri/src/commands/system.rs:311) 统一处理：剥离包裹引号（仅成对匹配）、`file:` 协议转本地路径、拒绝非绝对路径。

---

## 4. 预览与定位流程

### 4.1 探测与预览

1. 页面挂载（`onMounted`）或点击「刷新壁纸」触发 `fetchWallpapers()`，期间按钮进入 loading 并附带旋转动画，内容区显示 `v-loading`。
2. `invoke("get_system_wallpapers")` 成功后，对每个壁纸调用 Tauri 的 `convertFileSrc(path)` 生成本地资产安全 URL，赋给 `previewUrl`。
3. 卡片内以 `<img>` 懒加载预览；预览容器是 `<button>` 元素（带 `aria-label` 与 `focus-visible` 样式），可用时点击调用 `useImageViewer().show()` 打开全局图片查看器。
4. 布局为原生 CSS Grid（`minmax(340px, 1fr)` 自适应），≤640px 窄窗口切单列并调整工具栏排布。

### 4.2 定位（打开所在位置）

点击「打开所在位置」调用共享命令 [`open_file_directory`](../../../src-tauri/src/commands/file_operations.rs:1469)，该命令的平台行为决定定位语义：

- **Windows**：文件走 `reveal_item_in_dir`（Explorer 中高亮选中；路径 `/` 先替换为 `\`），目录走 `open_path`。
- **macOS**：文件走 `open -R`（Finder 中显示），目录直接 `open`。
- **Linux**：没有标准的「显示并选中」机制，只 `xdg-open` 打开父目录，**不会高亮选中文件**。

前端在定位成功后弹出 `customMessage.success`；路径为空时先行警告拦截。

### 4.3 复制路径

通过 `navigator.clipboard.writeText()` 写入剪贴板，成功后 `customMessage.success` 提示。复制入口在只读路径 `el-input` 的 append 槽内。

---

## 5. 错误降级策略

错误处理遵循项目规范：模块级 `createModuleLogger` + `createModuleErrorHandler`，同一 `catch` 块内单一记录方式。

| 失败环节 | 行为 |
| --- | --- |
| `get_system_wallpapers` 整体失败 | 清空列表，置 `loadFailed = true`，空状态描述切换为「壁纸探测失败，请检查系统权限或桌面环境后重试」，保留「重新探测」按钮；错误经 `errorHandler.error` 记录并提示 |
| `convertFileSrc()` 抛异常 | 该条 `previewUrl` 置空字符串，仅记录日志，不影响其他屏幕 |
| 预览图 `@error`（WebView 不支持的格式） | 置 `previewFailed = true`，卡片显示「此格式暂不支持预览」占位；图片查看按钮同步禁用 |
| 预览不可用时的能力保留 | 「打开所在位置」与「复制路径」始终可用，预览失败只降级查看能力，不阻塞定位 |
| 后端部分路径无效 | Windows 过滤空路径；macOS/Linux 由 `wallpaper_infos_from_paths` 过滤空路径；全部为空时返回明确错误（如「系统未返回任何有效的壁纸路径」） |
| Linux 桌面环境不识别 | GNOME、KDE 双方案顺序尝试后，合并各方案的具体失败原因（含 KDE 配置文件路径）返回，便于用户自查 |
| macOS 自动化权限被拒 | `osascript` 非零退出，stderr 内容作为错误信息返回前端 |
| 定位失败 | `errorHandler.error` 记录并提示「定位壁纸文件失败」 |

---

## 6. 组件结构与代码地图

```
src/tools/wallpaper-detector/
├── ARCHITECTURE.md              # 本文档
├── wallpaper-detector.registry.ts  # 工具注册（名称/路由/图标 markRaw/分类）
├── WallpaperDetector.vue        # 唯一视图：工具栏 + 卡片网格 + 全部交互逻辑
└── docs/Plan/
    └── wallpaper-detector-plan.md  # 施工计划与验收历史（已实施）
```

相关后端实现（跨模块依赖，归共享层所有）：

- [`src-tauri/src/commands/system.rs`](../../../src-tauri/src/commands/system.rs)：`WallpaperInfo` 结构体、`get_system_wallpapers` 命令、各平台探测器及 `cfg(test)` 单测（引号剥离、KDE `Image=` 提取、屏幕元数据生成）。
- [`src-tauri/src/commands/file_operations.rs`](../../../src-tauri/src/commands/file_operations.rs:1469)：`open_file_directory` 共享定位命令。
- [`src-tauri/src/commands.rs`](../../../src-tauri/src/commands.rs)：命令注册（`get_system_wallpapers`、`open_file_directory`）。

---

## 7. 验收状态与已知平台边界

- **已验证**：Windows 多屏探测与定位在真实运行态验收通过；前端类型检查、Rust 检查、Vite 生产构建与仓库测试集通过。
- **待收口**：macOS、GNOME、KDE 真机验证尚未执行（开发环境为 Windows），上述平台的探测矩阵以代码与单元测试为准。

已知边界（详见[施工计划](./docs/Plan/wallpaper-detector-plan.md)「已知平台边界」一节）：

- GNOME 标准设置只提供当前桌面会话的壁纸 URI，通常不区分物理显示器，返回结果恒为单条。
- KDE 配置结构可能随 Plasma 版本与第三方壁纸插件变化；未发现有效 `Image=` 条目时报错信息会包含配置文件路径。
- macOS 首次读取桌面信息可能触发系统「自动化」权限请求，拒绝后作为明确错误返回。
- Linux 下定位仅打开父目录，无法高亮选中文件（平台机制限制，见第 4.2 节）。

---

## 8. 相关文档

- [施工计划与设计方案（含验收历史）](./docs/Plan/wallpaper-detector-plan.md)
- [添加新工具指南](../../../docs/guide/adding-new-tool.md)
- [工具注册指南](../../../docs/guide/tool-registry-guide.md)
- [日志与错误处理指南](../../../docs/guide/logging-error-handling.md)
