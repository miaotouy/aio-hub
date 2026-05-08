# 安装指南

## 概述

**AIO Hub** 是一个跨平台的桌面 AI 工作台，支持 Windows、macOS 和 Linux 三大操作系统。你可以直接从 GitHub Releases 页面下载对应平台的安装包，无需配置任何开发环境，开箱即用。

### 平台支持一览

| 平台        | 安装格式                 | 架构                                |
| :---------- | :----------------------- | :---------------------------------- |
| **Windows** | `.exe` 安装包            | x64                                 |
| **macOS**   | `.dmg` 镜像              | Intel (x64) / Apple Silicon (ARM64) |
| **Linux**   | `.AppImage` / `.flatpak` | x64                                 |

> 💡 **想要尝鲜？** 推荐下载 **Pre-release（预览版）**，第一时间体验最新功能。正式版更新频率较低，但更稳定。

---

## 快速上手

> ⏱️ 安装过程只需 2-3 分钟，跟着步骤走就行。

### Windows 安装

**1. 下载安装包**

打开 [GitHub Releases 页面](https://github.com/miaotouy/aio-hub/releases/latest)，找到最新的版本（正式版或预览版），下载 `AIO-Hub_版本号_x64-setup.exe`。

TODO: 截图-在 GitHub Releases 页面定位到最新版本，标注下载文件 (.exe) 的位置

**2. 运行安装程序**

双击下载的 `.exe` 文件。Windows 可能会弹出安全提示弹窗——点击 **"更多信息"** → **"仍要运行"** 即可。

TODO: 截图-Windows 安全提示弹窗，标注"更多信息"和"仍要运行"按钮

**3. 完成安装向导**

按照向导提示，一路点击 **"下一步"**。建议保持默认安装路径，安装完成后勾选 **"运行 AIO Hub"**，点击 **"完成"**。

TODO: 截图-安装向导的每一步，标注关键操作按钮

**4. 启动应用**

安装完成后 AIO Hub 会自动启动。你也可以在桌面或开始菜单中找到它的快捷方式，双击打开。

TODO: 截图-AIO Hub 启动后的主界面

### macOS 安装

**1. 下载 DMG 镜像**

从 [GitHub Releases 页面](https://github.com/miaotouy/aio-hub/releases/latest) 下载对应的 DMG 文件：

- **Apple Silicon（M 系列芯片）**：下载带有 `aarch64` 标识的版本
- **Intel 芯片**：下载带有 `x64` 标识的版本

TODO: 截图-GitHub Releases 页面标注 macOS 下载文件及架构选择

**2. 安装应用**

双击下载的 `.dmg` 文件，在打开的窗口中将 AIO Hub 的图标拖拽到 **"Applications"（应用程序）** 文件夹中。

TODO: 截图-DMG 窗口中拖拽 AIO Hub 图标到 Applications 文件夹的示意

**3. 首次运行**

打开 **启动台（Launchpad）** 或 **应用程序** 文件夹，找到 AIO Hub 并双击启动。

> ⚠️ **Gatekeeper 提示**：首次打开未经公证的应用时，系统会提示"无法验证开发者"。你需要在 **系统设置 → 隐私与安全性** 中向下滚动，找到 AIO Hub 并点击 **"仍然打开"**。
>
> 详细操作可参考 [macOS Gatekeeper 修复指南](./faq/macos-gatekeeper-fix.md)。

TODO: 截图-系统设置中"隐私与安全性"页面，标注"仍然打开"按钮

### Linux 安装

#### 使用 AppImage（推荐）

**1.** 从 [GitHub Releases](https://github.com/miaotouy/aio-hub/releases/latest) 下载 `AIO-Hub_版本号_amd64.AppImage`

**2.** 赋予执行权限：

```bash
chmod +x AIO-Hub_*_amd64.AppImage
```

也可以在文件管理器中右键文件 → **属性 → 权限**，勾选 **"允许以程序执行文件"**。

TODO: 截图-文件管理器右键属性中勾选执行权限

**3.** 双击运行，或在终端中运行：

```bash
./AIO-Hub_*_amd64.AppImage
```

#### 使用 Flatpak（沙盒模式，更安全）

```bash
# 以 Ubuntu/Debian 为例安装 flatpak
sudo apt install flatpak

# 以 Fedora 为例
sudo dnf install flatpak

# 从 Flathub 安装 AIO Hub
flatpak install flathub com.aiohub.app

# 运行
flatpak run com.aiohub.app
```

---

## 功能详解

### 系统要求

#### 最低配置

| 项目         | 要求                                              |
| :----------- | :------------------------------------------------ |
| **操作系统** | Windows 10 1803+ / macOS 12+ / Linux（GTK 3.18+） |
| **处理器**   | 双核 x64 或 ARM64                                 |
| **内存**     | 4 GB                                              |
| **存储空间** | 500 MB                                            |
| **网络**     | 使用云端 AI 服务时需要                            |

#### 推荐配置

| 项目         | 要求                                          |
| :----------- | :-------------------------------------------- |
| **操作系统** | Windows 11 / macOS 14+ / Ubuntu 22.04+        |
| **处理器**   | 四核及以上                                    |
| **内存**     | 8 GB 以上（运行大模型对话建议 16 GB）         |
| **存储空间** | 1 GB 以上（如需使用本地模型还需额外 4-32 GB） |
| **显卡**     | 支持硬件加速的 GPU                            |

> 💡 如果计划使用本地模型（如通过 Ollama），需要根据模型大小额外准备存储空间，建议至少 8 GB 空闲磁盘。

### 平台差异

同一个 AIO Hub 在不同平台上的体验略有差异，了解这些差异有助于你选择合适的使用方式：

| 特性             | Windows        | macOS    | Linux              |
| :--------------- | :------------- | :------- | :----------------- |
| **毛玻璃特效**   | Mica / Acrylic | Vibrancy | 不支持             |
| **安装方式**     | NSIS 安装包    | DMG 镜像 | AppImage / Flatpak |
| **系统原生 OCR** | 支持           | 暂未支持 | 暂未支持           |
| **自定义标题栏** | 支持           | 可能     | 可能               |

Windows 用户在 OCR 功能上有额外优势——可以使用 Windows 原生 OCR 引擎，无需额外配置即可识别图片中的文字。

### 安装后验证

安装完成后，快速验证一下是否一切正常：

1. **启动应用**：双击桌面图标，确认应用能正常打开并显示主界面
2. **检查版本号**：进入 **设置 → 关于**，确认版本号与你下载的一致（如 `v0.5.6-alpha.3`）
3. **打开开发者工具**：按 `Ctrl + Shift + D`，确认开发者工具能正常打开，控制台无红色错误信息

TODO: 截图-设置页面的"关于"中显示版本号

---

## 常见问题

### Q1：下载的安装包被杀毒软件拦截了怎么办？

AIO Hub 是开源软件，代码在 GitHub 上完全公开。部分杀毒软件可能会对未签名的新应用产生误报：

- **Windows Defender**：点击 **"更多信息" → "仍要运行"** 即可绕过
- **第三方杀毒软件**：可以暂时关闭实时保护，安装完成后再重新开启
- **文件校验**：你可以对照 GitHub Releases 页面提供的 SHA-256 校验码，确认下载的文件完整无误

> 如果仍然不放心，你完全可以自己从源码构建——项目完全开源，构建步骤请参考 [开发环境搭建指南](../guide/getting-started.md)。

### Q2：如何升级到新版本？

AIO Hub 支持多种升级方式：

- **自动提示**：启动应用时，如果有新版本会自动弹出更新提示
- **手动检查**：进入 **设置 → 关于**，点击 **"检查更新"**
- **覆盖安装**：直接下载新版本安装包，运行安装程序覆盖即可——所有数据和配置会自动保留

> 正式版更新较慢，如果你想第一时间体验新功能，推荐直接使用预览版（Pre-release）。

### Q3：安装后打不开 / 闪退怎么办？

常见原因和解决方法：

1. **系统版本太低**：确认你的操作系统满足最低要求（Windows 10 1803+ / macOS 12+）
2. **显卡驱动过旧**：更新显卡驱动到最新版本
3. **缺少 WebView2**（Windows）：如果使用的是 Windows 10，可能需要安装 [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/zh-cn/microsoft-edge/webview2/)（Windows 11 已内置）
4. **权限不足**：尝试右键 → **以管理员身份运行**

如果以上方法都无法解决，请查看日志文件并到 [GitHub Issues](https://github.com/miaotouy/aio-hub/issues) 反馈：

| 平台        | 日志路径                              |
| :---------- | :------------------------------------ |
| **Windows** | `%APPDATA%\com.mty.aiohub\logs\`      |
| **macOS**   | `~/Library/Logs/com.mty.aiohub/`      |
| **Linux**   | `~/.local/share/com.mty.aiohub/logs/` |

### Q4：不同版本之间数据兼容吗？

从 v0.4.x 版本开始，所有版本之间的用户数据和配置文件都是向前兼容的：

- **配置自动保留**：覆盖安装不会丢失之前的设置
- **聊天记录不丢失**：历史对话数据会保留
- **插件和资产不受影响**：已安装的插件和上传的文件会自动保留

> 如果你从非常古老的版本（v0.3.x 或更早）升级，建议先手动备份配置文件：
>
> - Windows：`%APPDATA%\com.mty.aiohub`
> - macOS：`~/Library/Application Support/com.mty.aiohub`
> - Linux：`~/.local/share/com.mty.aiohub`

### Q5：在 Linux 上运行提示缺少依赖怎么办？

如果你使用 AppImage 格式，通常不需要额外安装依赖——它已经打包了所有必要的运行时。但如果遇到启动失败，可能是缺少系统库：

```bash
# Ubuntu/Debian
sudo apt install libgtk-3-0 libwebkit2gtk-4.1-0 libappindicator3-1

# Fedora
sudo dnf install gtk3 webkit2gtk4.1 libappindicator-gtk3

# Arch Linux
sudo pacman -S gtk3 webkit2gtk-4.1 libappindicator-gtk3
```

> 推荐使用 Flatpak 版本，它可以自动处理所有依赖关系，无需手动安装系统库。

---

> 安装完成？接下来请阅读 [快速开始](./getting-started.md) —— 5 分钟上手 AIO Hub 的核心功能。
