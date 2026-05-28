// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use clap::Parser;
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None, ignore_errors = true)]
struct Args {
    /// Enable portable mode (store data in 'data' folder next to executable)
    #[arg(short, long)]
    portable: bool,

    /// Custom data directory path
    #[arg(short, long)]
    data_dir: Option<PathBuf>,

    /// Run system diagnostics and print compatibility report (Linux)
    #[arg(long)]
    diagnose: bool,
}

fn main() {
    // 加载 .env 环境变量 (如果存在)
    dotenvy::dotenv().ok();

    let args = Args::parse();

    // 确定数据目录覆盖逻辑
    // 优先级: 命令行参数 > 环境变量 AIO_DATA_DIR > 环境变量 AIO_ID_SUFFIX (隔离模式)
    let mut data_dir_override = args.data_dir.clone();

    if data_dir_override.is_none() {
        if let Ok(env_data_dir) = std::env::var("AIO_DATA_DIR") {
            if !env_data_dir.is_empty() {
                data_dir_override = Some(PathBuf::from(env_data_dir));
            }
        }
    }

    if data_dir_override.is_none() {
        if let Ok(suffix) = std::env::var("AIO_ID_SUFFIX") {
            if !suffix.is_empty() {
                let project_root = std::env::current_dir().unwrap_or_default();
                let dev_data_dir = project_root.join(".dev-data").join(suffix);
                data_dir_override = Some(dev_data_dir);
            }
        }
    }

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
    if is_portable || data_dir_override.is_some() {
        let target_dir = if let Some(dir) = data_dir_override {
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

    // Linux: WebKitGTK 兼容性检测与环境变量智能设置
    #[cfg(target_os = "linux")]
    {
        use aio_hub_lib::webkit_check::linux;

        // --diagnose 模式：输出完整诊断信息后退出
        if args.diagnose {
            linux::print_diagnostic_info();
            std::process::exit(0);
        }

        // 启动前检测 WebKitGTK 兼容性
        match linux::check_webkit_compatibility() {
            Ok(info) => {
                eprintln!(
                    "[WebKit 检测] WebKitGTK {}.{}.{} | {} | {}",
                    info.major, info.minor, info.micro, info.display_server, info.gpu_driver
                );
                // 根据环境智能设置最优环境变量
                linux::apply_optimal_env_vars(&info);
            }
            Err(ref e) => {
                match e {
                    linux::WebKitError::LibraryNotFound(_) => {
                        // 致命错误：库缺失，显示对话框后退出
                        linux::show_error_dialog("AIO Hub - 缺少必要组件", &e.to_string());
                        std::process::exit(1);
                    }
                    linux::WebKitError::VersionTooOld { .. } => {
                        // 警告：版本过低，显示警告但允许继续
                        eprintln!(
                            "\x1b[1;33m[WebKit 警告]\x1b[0m {}",
                            e.to_string().lines().next().unwrap_or("版本过低")
                        );
                        eprintln!(
                            "\x1b[1;33m[WebKit 警告]\x1b[0m 应用将尝试继续启动，但可能出现白屏或功能异常"
                        );
                        eprintln!(
                            "\x1b[1;33m[WebKit 警告]\x1b[0m 运行 --diagnose 获取详细诊断信息"
                        );
                        // 保守设置环境变量
                        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
                        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
                    }
                    linux::WebKitError::VersionQueryFailed(_) => {
                        // 无法确定版本，保守处理
                        eprintln!(
                            "\x1b[1;33m[WebKit 警告]\x1b[0m 无法确定 WebKitGTK 版本，使用保守配置"
                        );
                        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
                    }
                }
            }
        }
    }

    // 非 Linux 平台的 --diagnose 处理
    #[cfg(not(target_os = "linux"))]
    if args.diagnose {
        eprintln!("[诊断] --diagnose 参数仅在 Linux 平台有效");
        eprintln!("[诊断] 当前平台: {}", std::env::consts::OS);
        std::process::exit(0);
    }

    aio_hub_lib::run()
}
