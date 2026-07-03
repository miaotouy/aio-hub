// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

//! Linux WebKitGTK 兼容性检测模块
//!
//! 在应用启动前检测 WebKitGTK 库的存在性和版本，
//! 以及 GPU 环境，提供友好的错误提示而非白屏。

#[cfg(target_os = "linux")]
pub mod linux {
    use std::fmt;
    use std::process::Command;

    /// WebKitGTK 检测结果
    #[derive(Debug)]
    pub struct WebKitInfo {
        pub major: u32,
        pub minor: u32,
        pub micro: u32,
        pub display_server: DisplayServer,
        pub gpu_driver: GpuDriver,
    }

    /// 显示服务器类型
    #[derive(Debug, Clone, PartialEq)]
    pub enum DisplayServer {
        Wayland,
        X11,
        Unknown,
    }

    impl fmt::Display for DisplayServer {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            match self {
                Self::Wayland => write!(f, "Wayland"),
                Self::X11 => write!(f, "X11"),
                Self::Unknown => write!(f, "Unknown"),
            }
        }
    }

    /// GPU 驱动类型
    #[derive(Debug, Clone, PartialEq)]
    pub enum GpuDriver {
        Mesa,
        Nvidia,
        Unknown,
    }

    impl fmt::Display for GpuDriver {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            match self {
                Self::Mesa => write!(f, "Mesa (开源)"),
                Self::Nvidia => write!(f, "NVIDIA (专有)"),
                Self::Unknown => write!(f, "Unknown"),
            }
        }
    }

    /// 检测错误类型
    #[derive(Debug)]
    pub enum WebKitError {
        /// WebKitGTK 共享库未找到
        LibraryNotFound(String),
        /// 版本过低
        VersionTooOld {
            major: u32,
            minor: u32,
            required_major: u32,
            required_minor: u32,
        },
        /// 无法获取版本信息
        VersionQueryFailed(String),
    }

    impl fmt::Display for WebKitError {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            match self {
                Self::LibraryNotFound(detail) => {
                    write!(
                        f,
                        "未找到 WebKitGTK 库 (libwebkit2gtk-4.1)\n\n\
                         详细信息: {}\n\n\
                         这是 AIO Hub 运行所必需的系统组件。\n\
                         请通过包管理器安装：\n\n\
                         • Ubuntu/Debian: sudo apt install libwebkit2gtk-4.1-0\n\
                         • Fedora: sudo dnf install webkit2gtk4.1\n\
                         • Arch Linux: sudo pacman -S webkit2gtk-4.1\n\
                         • openSUSE: sudo zypper install libwebkit2gtk-4_1-0",
                        detail
                    )
                }
                Self::VersionTooOld {
                    major,
                    minor,
                    required_major,
                    required_minor,
                } => {
                    write!(
                        f,
                        "WebKitGTK 版本过低\n\n\
                         当前版本: {}.{}\n\
                         最低要求: {}.{}\n\n\
                         请通过包管理器升级 webkit2gtk 到最新版本：\n\n\
                         • Ubuntu/Debian: sudo apt update && sudo apt upgrade libwebkit2gtk-4.1-0\n\
                         • Fedora: sudo dnf update webkit2gtk4.1\n\
                         • Arch Linux: sudo pacman -Syu webkit2gtk-4.1\n\
                         • openSUSE: sudo zypper update libwebkit2gtk-4_1-0",
                        major, minor, required_major, required_minor
                    )
                }
                Self::VersionQueryFailed(detail) => {
                    write!(f, "无法查询 WebKitGTK 版本信息\n\n详细信息: {}", detail)
                }
            }
        }
    }

    /// Tauri 2 要求的最低 WebKitGTK 版本
    const REQUIRED_MAJOR: u32 = 2;
    const REQUIRED_MINOR: u32 = 38;

    /// 检测 WebKitGTK 兼容性
    ///
    /// 返回 Ok(WebKitInfo) 表示检测通过，Err(WebKitError) 表示存在问题
    pub fn check_webkit_compatibility() -> Result<WebKitInfo, WebKitError> {
        // 1. 尝试通过 dlopen 加载 WebKitGTK 库
        let lib = unsafe { libloading::Library::new("libwebkit2gtk-4.1.so.0") }.map_err(|e| {
            WebKitError::LibraryNotFound(format!(
                "dlopen 失败: {}. 可能未安装 webkit2gtk-4.1 包。",
                e
            ))
        })?;

        // 2. 获取版本查询函数
        let (major, minor, micro) = unsafe {
            let get_major: Result<libloading::Symbol<unsafe extern "C" fn() -> u32>, _> =
                lib.get(b"webkit_get_major_version");
            let get_minor: Result<libloading::Symbol<unsafe extern "C" fn() -> u32>, _> =
                lib.get(b"webkit_get_minor_version");
            let get_micro: Result<libloading::Symbol<unsafe extern "C" fn() -> u32>, _> =
                lib.get(b"webkit_get_micro_version");

            match (get_major, get_minor, get_micro) {
                (Ok(maj_fn), Ok(min_fn), Ok(mic_fn)) => (maj_fn(), min_fn(), mic_fn()),
                _ => {
                    return Err(WebKitError::VersionQueryFailed(
                        "无法从库中获取版本函数符号 (webkit_get_major/minor/micro_version)"
                            .to_string(),
                    ));
                }
            }
        };

        // 3. 版本检查
        if major < REQUIRED_MAJOR || (major == REQUIRED_MAJOR && minor < REQUIRED_MINOR) {
            return Err(WebKitError::VersionTooOld {
                major,
                minor,
                required_major: REQUIRED_MAJOR,
                required_minor: REQUIRED_MINOR,
            });
        }

        // 4. 检测显示服务器
        let display_server = detect_display_server();

        // 5. 检测 GPU 驱动
        let gpu_driver = detect_gpu_driver();

        Ok(WebKitInfo {
            major,
            minor,
            micro,
            display_server,
            gpu_driver,
        })
    }

    /// 检测当前使用的显示服务器
    fn detect_display_server() -> DisplayServer {
        if std::env::var("WAYLAND_DISPLAY").is_ok() {
            DisplayServer::Wayland
        } else if std::env::var("DISPLAY").is_ok() {
            DisplayServer::X11
        } else {
            DisplayServer::Unknown
        }
    }

    /// 检测 GPU 驱动类型
    fn detect_gpu_driver() -> GpuDriver {
        // 检查 NVIDIA 专有驱动
        if std::path::Path::new("/proc/driver/nvidia/version").exists() {
            return GpuDriver::Nvidia;
        }

        // 尝试通过 glxinfo 检测
        if let Ok(output) = Command::new("glxinfo").arg("-B").output() {
            let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
            if stdout.contains("nvidia") {
                return GpuDriver::Nvidia;
            }
            if stdout.contains("mesa")
                || stdout.contains("intel")
                || stdout.contains("amd")
                || stdout.contains("radeon")
            {
                return GpuDriver::Mesa;
            }
        }

        // 检查 lsmod 中是否有 nvidia 模块
        if let Ok(output) = Command::new("lsmod").output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if stdout.contains("nvidia") {
                return GpuDriver::Nvidia;
            }
        }

        GpuDriver::Unknown
    }

    /// 根据检测结果自动设置最优环境变量
    pub fn apply_optimal_env_vars(info: &WebKitInfo) {
        match (&info.display_server, &info.gpu_driver) {
            // Wayland + Mesa: DMA-BUF 渲染器可能与 Mesa 驱动冲突
            (DisplayServer::Wayland, GpuDriver::Mesa) => {
                std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
                eprintln!("[WebKit 检测] Wayland + Mesa 环境，已禁用 DMA-BUF 渲染器以避免潜在冲突");
            }
            // Wayland + NVIDIA: 强制回退到 X11 后端 + 禁用 DMA-BUF
            (DisplayServer::Wayland, GpuDriver::Nvidia) => {
                std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
                // 注意：不强制设置 GDK_BACKEND=x11，因为现代 NVIDIA 驱动已支持 Wayland
                // 但禁用 compositing mode 以减少渲染问题
                std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
                eprintln!("[WebKit 检测] Wayland + NVIDIA 环境，已禁用 DMA-BUF 渲染器和合成模式");
            }
            // X11 环境通常比较稳定，不需要额外设置
            (DisplayServer::X11, _) => {
                // 仅对已知有问题的旧版本设置
                if info.major == 2 && info.minor < 42 {
                    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
                    eprintln!(
                        "[WebKit 检测] X11 + WebKitGTK {}.{} (< 2.42)，已禁用 DMA-BUF 渲染器",
                        info.major, info.minor
                    );
                }
            }
            // 未知环境：保守设置
            _ => {
                std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
                eprintln!("[WebKit 检测] 未知显示环境，已保守禁用 DMA-BUF 渲染器");
            }
        }
    }

    /// 显示错误对话框（分层降级）
    ///
    /// 尝试顺序：zenity → kdialog → notify-send + 终端输出
    pub fn show_error_dialog(title: &str, message: &str) {
        // 尝试 zenity（GNOME 系桌面环境）
        let zenity_result = Command::new("zenity")
            .args([
                "--error",
                "--title",
                title,
                "--text",
                message,
                "--width=600",
                "--no-wrap",
            ])
            .status();

        if zenity_result.is_ok() {
            return;
        }

        // 尝试 kdialog（KDE 系桌面环境）
        let kdialog_result = Command::new("kdialog")
            .args(["--error", message, "--title", title])
            .status();

        if kdialog_result.is_ok() {
            return;
        }

        // 尝试 xmessage（X11 基础工具）
        let xmessage_result = Command::new("xmessage").args(["-center", message]).status();

        if xmessage_result.is_ok() {
            return;
        }

        // 最终降级：终端彩色输出 + notify-send 桌面通知
        let _ = Command::new("notify-send")
            .args(["--urgency=critical", title, message])
            .status();

        // 终端输出始终执行
        eprintln!();
        eprintln!("\x1b[1;31m╔══════════════════════════════════════════════════════╗\x1b[0m");
        eprintln!("\x1b[1;31m║  AIO Hub - 系统兼容性问题                           ║\x1b[0m");
        eprintln!("\x1b[1;31m╚══════════════════════════════════════════════════════╝\x1b[0m");
        eprintln!();
        eprintln!("\x1b[1;33m{}\x1b[0m", title);
        eprintln!();
        for line in message.lines() {
            eprintln!("  {}", line);
        }
        eprintln!();
        eprintln!("\x1b[90m如需帮助，请访问: https://github.com/miaotouy/aio-hub/issues\x1b[0m");
        eprintln!();
    }

    /// 输出完整的诊断信息（用于 --diagnose 模式）
    pub fn print_diagnostic_info() {
        eprintln!();
        eprintln!("\x1b[1;36m╔══════════════════════════════════════════════════════╗\x1b[0m");
        eprintln!("\x1b[1;36m║  AIO Hub - Linux 系统诊断报告                       ║\x1b[0m");
        eprintln!("\x1b[1;36m╚══════════════════════════════════════════════════════╝\x1b[0m");
        eprintln!();

        // 系统信息
        eprintln!("\x1b[1m[系统信息]\x1b[0m");
        if let Ok(output) = Command::new("uname").arg("-a").output() {
            eprintln!("  内核: {}", String::from_utf8_lossy(&output.stdout).trim());
        }
        if let Ok(contents) = std::fs::read_to_string("/etc/os-release") {
            for line in contents.lines() {
                if line.starts_with("PRETTY_NAME=") {
                    let name = line.trim_start_matches("PRETTY_NAME=").trim_matches('"');
                    eprintln!("  发行版: {}", name);
                    break;
                }
            }
        }
        eprintln!();

        // 显示服务器
        eprintln!("\x1b[1m[显示服务器]\x1b[0m");
        let display_server = detect_display_server();
        eprintln!("  类型: {}", display_server);
        if let Ok(val) = std::env::var("WAYLAND_DISPLAY") {
            eprintln!("  WAYLAND_DISPLAY: {}", val);
        }
        if let Ok(val) = std::env::var("DISPLAY") {
            eprintln!("  DISPLAY: {}", val);
        }
        if let Ok(val) = std::env::var("XDG_SESSION_TYPE") {
            eprintln!("  XDG_SESSION_TYPE: {}", val);
        }
        eprintln!();

        // GPU 信息
        eprintln!("\x1b[1m[GPU 驱动]\x1b[0m");
        let gpu_driver = detect_gpu_driver();
        eprintln!("  检测结果: {}", gpu_driver);
        if std::path::Path::new("/proc/driver/nvidia/version").exists() {
            if let Ok(contents) = std::fs::read_to_string("/proc/driver/nvidia/version") {
                eprintln!(
                    "  NVIDIA 版本: {}",
                    contents.lines().next().unwrap_or("N/A")
                );
            }
        }
        if let Ok(output) = Command::new("glxinfo").arg("-B").output() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                let lower = line.to_lowercase();
                if lower.contains("opengl renderer") || lower.contains("opengl version") {
                    eprintln!("  {}", line.trim());
                }
            }
        }
        eprintln!();

        // WebKitGTK 检测
        eprintln!("\x1b[1m[WebKitGTK]\x1b[0m");
        match check_webkit_compatibility() {
            Ok(info) => {
                eprintln!(
                    "  \x1b[32m✓\x1b[0m 版本: {}.{}.{} (要求 >= {}.{})",
                    info.major, info.minor, info.micro, REQUIRED_MAJOR, REQUIRED_MINOR
                );
            }
            Err(ref e) => {
                eprintln!(
                    "  \x1b[31m✗\x1b[0m {}",
                    e.to_string().lines().next().unwrap_or("检测失败")
                );
                match e {
                    WebKitError::LibraryNotFound(_) => {
                        eprintln!("  \x1b[31m  库文件未找到，请安装 webkit2gtk-4.1\x1b[0m");
                    }
                    WebKitError::VersionTooOld { major, minor, .. } => {
                        eprintln!(
                            "  \x1b[31m  当前版本 {}.{} 低于最低要求\x1b[0m",
                            major, minor
                        );
                    }
                    WebKitError::VersionQueryFailed(_) => {
                        eprintln!("  \x1b[33m  无法查询版本，库可能不完整\x1b[0m");
                    }
                }
            }
        }
        eprintln!();

        // pkg-config 信息
        eprintln!("\x1b[1m[pkg-config 查询]\x1b[0m");
        if let Ok(output) = Command::new("pkg-config")
            .args(["--modversion", "webkit2gtk-4.1"])
            .output()
        {
            if output.status.success() {
                eprintln!(
                    "  webkit2gtk-4.1: {}",
                    String::from_utf8_lossy(&output.stdout).trim()
                );
            } else {
                eprintln!("  webkit2gtk-4.1: \x1b[31m未找到\x1b[0m");
            }
        }
        if let Ok(output) = Command::new("pkg-config")
            .args(["--modversion", "gtk4"])
            .output()
        {
            if output.status.success() {
                eprintln!("  gtk4: {}", String::from_utf8_lossy(&output.stdout).trim());
            } else {
                eprintln!("  gtk4: \x1b[31m未找到\x1b[0m");
            }
        }
        if let Ok(output) = Command::new("pkg-config")
            .args(["--modversion", "gtk+-3.0"])
            .output()
        {
            if output.status.success() {
                eprintln!(
                    "  gtk+-3.0: {}",
                    String::from_utf8_lossy(&output.stdout).trim()
                );
            } else {
                eprintln!("  gtk+-3.0: \x1b[31m未找到\x1b[0m");
            }
        }
        eprintln!();

        // 相关环境变量
        eprintln!("\x1b[1m[相关环境变量]\x1b[0m");
        let env_vars = [
            "WEBKIT_DISABLE_DMABUF_RENDERER",
            "WEBKIT_DISABLE_COMPOSITING_MODE",
            "GDK_BACKEND",
            "GSK_RENDERER",
            "LIBGL_ALWAYS_SOFTWARE",
            "MESA_GL_VERSION_OVERRIDE",
        ];
        for var in &env_vars {
            match std::env::var(var) {
                Ok(val) => eprintln!("  {}: {}", var, val),
                Err(_) => eprintln!("  {}: \x1b[90m(未设置)\x1b[0m", var),
            }
        }
        eprintln!();

        // 建议
        eprintln!("\x1b[1m[建议]\x1b[0m");
        eprintln!("  如果遇到白屏问题，可以尝试以下环境变量启动：");
        eprintln!("  \x1b[36mWEBKIT_DISABLE_DMABUF_RENDERER=1 ./aio-hub\x1b[0m");
        eprintln!("  \x1b[36mWEBKIT_DISABLE_COMPOSITING_MODE=1 ./aio-hub\x1b[0m");
        if display_server == DisplayServer::Wayland {
            eprintln!("  \x1b[36mGDK_BACKEND=x11 ./aio-hub\x1b[0m  (强制使用 X11 后端)");
        }
        eprintln!();
        eprintln!("\x1b[90m请将以上信息复制并附在 issue 中: https://github.com/miaotouy/aio-hub/issues\x1b[0m");
        eprintln!();
    }
}
