# 🖥️ 壁纸探测器 (Wallpaper Detector) 施工计划与设计方案

本文件记录了“壁纸探测器”工具的设计方案、跨平台技术实现细节以及具体的施工步骤，用于存档和后续开发指引。

---

## 1. 背景与痛点

在日常使用中，许多用户（包括设计师和摄影爱好者）喜欢使用系统自带的“幻灯片壁纸”功能，将一个包含成百上千张精美图片的目录设为壁纸源，让系统随机播放。
当系统随机到一张非常惊艳的壁纸时，用户往往会有以下需求：

1. **获取当前壁纸的绝对路径**：知道这张图叫什么，存在哪里。
2. **一键定位到文件所在目录**：在资源管理器/Finder 中打开该目录，并**自动高亮选中**该壁纸文件，以便进行复制、移动、收藏或编辑。
3. **多屏支持**：在多显示器环境下，每个屏幕可能显示不同的壁纸，需要支持分别获取和定位。

目前系统没有提供直接右键获取当前壁纸路径的入口，本工具旨在提供一键探测、预览和定位当前多屏壁纸的完美解决方案。

---

## 2. 跨平台技术方案设计

由于不同操作系统的壁纸管理机制差异巨大，我们采用针对性的跨平台实现方案：

### 2.1. Windows 平台 (核心支持)

Windows 10/11 支持多屏幕独立壁纸和幻灯片播放。

- **技术选型**：调用 Windows Shell 的 **`IDesktopWallpaper` COM 接口**。
- **原理**：
  - 通过 `CoCreateInstance` 创建 `IDesktopWallpaper` 实例。
  - 调用 `GetMonitorDevicePathCount` 获取当前活动的显示器数量。
  - 遍历显示器，调用 `GetMonitorDevicePathAt(index)` 获取显示器设备 ID。
  - 调用 `GetWallpaper(monitor_id)` 获取该显示器当前显示的壁纸文件绝对路径。
- **优势**：这是 Windows 官方最稳定、最完美的 API，即使在幻灯片随机播放模式下，也能实时、精准地拿到当前那张图的物理路径，绝非读取注册表死值可比。

### 2.2. macOS 平台

macOS 同样支持多屏幕独立壁纸。

- **技术选型**：执行 **JavaScript for Automation (JXA)**，并返回 JSON。
- **原理**：
  - 在 Rust 中通过 `std::process::Command` 执行 `osascript -l JavaScript`。
  - 读取 `System Events` 暴露的桌面壁纸路径。
  - 使用 `JSON.stringify` 返回路径数组，避免逗号等合法文件名字符破坏结果边界。
- **优势**：无需引入复杂的 Objective-C/Cocoa 运行时依赖，执行效率高，且原生支持多屏幕。

### 2.3. Linux 平台

Linux 桌面环境众多，我们针对最主流的两个桌面环境进行适配，其余环境优雅降级：

- **GNOME 桌面**：
  - 执行 `gsettings get org.gnome.desktop.background picture-uri` 获取当前壁纸 URI。
  - 针对深色模式，同时读取 `picture-uri-dark`。
  - 将 `file://` 协议的 URI 转换为本地绝对路径。
- **KDE Plasma 桌面**：
  - 读取并解析 KDE 的配置文件 `~/.config/plasma-org.kde.plasma.desktop-appletsrc`。
  - 匹配 `Image=` 键值获取壁纸路径。
- **其他桌面**：
  - 若无法自动探测，返回友好提示，告知当前桌面环境暂不支持自动获取。

实现会根据 `XDG_CURRENT_DESKTOP` / `DESKTOP_SESSION` 调整 GNOME 与 KDE 探测顺序；首选方案失败后会自动尝试另一方案，并汇总具体失败原因。

---

## 3. 接口与数据结构设计

### 3.1. 后端 Rust 结构体

```rust
#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WallpaperInfo {
    pub monitor_index: u32,
    pub monitor_name: String,
    pub path: String,
}
```

### 3.2. Tauri Commands

1. **`get_system_wallpapers`**：
   - **接口签名**：`pub async fn get_system_wallpapers() -> Result<Vec<WallpaperInfo>, String>`
   - **作用**：获取当前系统所有屏幕的壁纸信息。
2. **`open_file_directory`** (复用已有命令)：
   - **接口签名**：`pub fn open_file_directory(file_path: String) -> Result<String, String>`
   - **作用**：在系统文件管理器中打开指定路径，并自动高亮选中该文件。

---

## 4. 前端 UI 与交互设计

### 4.1. 视觉风格

遵循项目的 `theme-appearance` 规范，采用通透的毛玻璃质感：

- 背景使用 `var(--card-bg)`。
- 边框使用 `var(--border-width) solid var(--border-color)`。
- 模糊效果使用 `backdrop-filter: blur(var(--ui-blur))`。

### 4.2. 界面布局

- **顶部工具栏**：
  - 工具标题（配以 `Monitor` 图标）。
  - “手动刷新”按钮（配以旋转动画）。
- **壁纸网格 (Grid)**：
  - 采用原生 CSS Grid 响应式布局，自适应单屏、多屏和窄窗口。
  - 每个屏幕展示为一个精美的卡片：
    - **屏幕标识**：如“屏幕 1 (主屏)”、“屏幕 2”。
    - **壁纸预览图**：使用 Tauri 的 `convertFileSrc(path)` 协议将本地绝对路径转换为安全 URL，直接在前端渲染。图片加上优雅的悬浮放大和阴影效果。
    - **路径展示**：使用只读的 `el-input` 展示绝对路径，方便复制。
    - **操作按钮组**：
      - **定位文件**（主按钮）：点击调用 `open_file_directory`，在资源管理器中弹出并高亮选中。
      - **复制路径**：一键复制绝对路径到剪贴板，并弹出 `customMessage.success` 提示。

---

## 5. 施工计划与步骤

### 步骤 1：修改后端依赖

在 `src-tauri/Cargo.toml` 中，为 `windows` crate 启用 `"Win32_UI_Shell"` 和 `"Win32_System_Com"` 特性。

### 步骤 2：实现 Rust 后端命令

在 `src-tauri/src/commands/system.rs` 中实现 `get_system_wallpapers` 命令，包含 Windows、macOS 和 Linux 的跨平台实现。所有阻塞式系统调用均放入 Tokio 阻塞任务池；Windows 使用 RAII 管理 COM apartment、接口和 `CoTaskMem` 字符串。

### 步骤 3：注册 Rust 命令

在 `src-tauri/src/commands.rs` 的 `register_commands` 函数中注册 `get_system_wallpapers`。

### 步骤 4：创建前端工具注册文件

创建 `src/tools/wallpaper-detector/wallpaper-detector.registry.ts`，配置工具元数据、图标（使用 `markRaw` 包裹）和路由。

### 步骤 5：创建前端主界面

创建 `src/tools/wallpaper-detector/WallpaperDetector.vue`，实现精美的多屏壁纸卡片网格、预览、一键定位和复制功能。

### 步骤 6：编译与测试

1. 运行 `bun run check:frontend` 进行前端类型检查。
2. 运行 `bun run check:backend` 进行后端 Rust 检查。
3. 启动 `bun run tauri:dev` 进行真实运行态调试，验证多屏壁纸获取和定位功能。

---

## 6. 实施状态（2026-07-16）

- [x] Windows `IDesktopWallpaper` 多屏探测。
- [x] Windows COM 初始化、接口释放和 `PWSTR` 内存释放使用确定性生命周期管理。
- [x] macOS 使用 JXA + JSON 无歧义传输路径。
- [x] Linux GNOME 明暗模式壁纸 URI 探测。
- [x] Linux KDE Plasma 配置探测与重复路径过滤。
- [x] 前端预览失败回退、失败状态清理、键盘操作和窄窗口布局。
- [x] 前端类型检查、Rust Clippy、Vite 生产构建和仓库测试集。
- [ ] 在 macOS、GNOME 和 KDE 真机环境验证系统 API 返回值；当前开发环境为 Windows。

### 已知平台边界

- GNOME 的标准设置只提供当前桌面会话的壁纸 URI，通常不会区分物理显示器。
- KDE 的配置结构可能随 Plasma 版本和第三方壁纸插件变化；未发现标准 `Image=` 条目时会返回包含配置路径的错误。
- macOS 首次读取桌面信息时可能要求用户授予“自动化”权限，拒绝权限会作为明确错误返回前端。
