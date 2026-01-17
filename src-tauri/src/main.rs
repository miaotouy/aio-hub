// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use clap::Parser;
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Enable portable mode (store data in 'data' folder next to executable)
    #[arg(short, long)]
    portable: bool,

    /// Custom data directory path
    #[arg(short, long)]
    data_dir: Option<PathBuf>,
}

fn main() {
    let args = Args::parse();

    // Auto-detect portable mode:
    // 1. Explicit flag --portable
    // 2. Executable filename contains "portable" (case-insensitive)
    // 3. A file named "portable.flag" exists next to the executable
    let exe_path = std::env::current_exe().expect("Failed to get current executable path");
    let exe_dir = exe_path
        .parent()
        .expect("Failed to get executable directory");
    let exe_name = exe_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_lowercase();
    let flag_file_exists = exe_dir.join("portable.flag").exists();

    let is_portable = args.portable || exe_name.contains("portable") || flag_file_exists;

    // Handle portable mode or custom data directory
    if is_portable || args.data_dir.is_some() {
        let target_dir = if let Some(dir) = args.data_dir {
            dir
        } else {
            // Portable mode: use 'data' folder next to executable
            let exe_path = std::env::current_exe().expect("Failed to get current executable path");
            let exe_dir = exe_path
                .parent()
                .expect("Failed to get executable directory");
            exe_dir.join("data")
        };

        // Ensure directory exists
        if !target_dir.exists() {
            std::fs::create_dir_all(&target_dir).expect("Failed to create data directory");
        }

        let target_path_str = target_dir.to_string_lossy().to_string();

        // Set environment variables to redirect data
        // This affects dirs-next and other path resolution logic
        #[cfg(windows)]
        {
            std::env::set_var("APPDATA", &target_path_str);
            std::env::set_var("LOCALAPPDATA", &target_path_str);
        }

        // 设置一个自定义环境变量，记录最终确定的数据目录
        std::env::set_var("AIO_PORTABLE_DATA_DIR", &target_path_str);

        #[cfg(not(windows))]
        {
            // On Linux/macOS, we often use HOME or specific XDG vars
            std::env::set_var("HOME", &target_path_str);
            std::env::set_var(
                "XDG_DATA_HOME",
                target_dir.join("share").to_string_lossy().to_string(),
            );
            std::env::set_var(
                "XDG_CONFIG_HOME",
                target_dir.join("config").to_string_lossy().to_string(),
            );
        }

        // Mark as portable mode for lib.rs to handle (e.g. skip single instance)
        std::env::set_var("AIO_PORTABLE_MODE", "1");
    }

    #[cfg(target_os = "linux")]
    {
        // 解决 WebKitGTK 在某些 Linux 发行版（如 Arch/CachyOS + Wayland）上的渲染崩溃问题
        // 主要是因为内置图形库与宿主系统 Mesa 驱动的 ABI 冲突
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }

    aio_hub_lib::run()
}
