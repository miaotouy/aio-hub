use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::process::Command;
use tokio::time::timeout;

use super::config::DocumentConversionConfig;

/// 将路径转换为 file:// URL（LibreOffice 需要）
fn path_to_file_url(path: &Path) -> String {
    let value = path.to_string_lossy().replace('\\', "/");
    if cfg!(target_os = "windows") {
        format!("file:///{}", value)
    } else {
        format!("file://{}", value)
    }
}

/// 创建 LibreOffice 隔离配置目录
fn make_libreoffice_profile_dir() -> Result<PathBuf, String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let dir = std::env::temp_dir().join(format!("aiohub-asset-manager-lo-{}", now));
    fs::create_dir_all(&dir).map_err(|e| format!("创建 LibreOffice 临时配置目录失败: {}", e))?;
    Ok(dir)
}

/// 运行 LibreOffice --version 获取版本信息
pub async fn run_libreoffice_version(path: &str) -> Result<String, String> {
    let mut command = Command::new(path);
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let output = timeout(Duration::from_secs(5), command.arg("--version").output())
        .await
        .map_err(|_| "检测 LibreOffice 超时".to_string())?
        .map_err(|e| format!("无法执行 LibreOffice: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Ok(if stdout.is_empty() { stderr } else { stdout })
}

/// 使用 LibreOffice 将旧版 DOC 转换为 DOCX
pub async fn convert_legacy_doc_to_docx(
    source_path: &Path,
    output_dir: &Path,
    config: &DocumentConversionConfig,
) -> Result<PathBuf, String> {
    fs::create_dir_all(output_dir).map_err(|e| format!("创建文档转换目录失败: {}", e))?;

    let mut args = vec![
        "--headless".to_string(),
        "--nologo".to_string(),
        "--nofirststartwizard".to_string(),
        "--nolockcheck".to_string(),
        "--nodefault".to_string(),
    ];

    let profile_dir = if config.isolated_profile {
        let profile_dir = make_libreoffice_profile_dir()?;
        args.push(format!(
            "--env:UserInstallation={}",
            path_to_file_url(&profile_dir)
        ));
        Some(profile_dir)
    } else {
        None
    };

    args.extend([
        "--convert-to".to_string(),
        "docx".to_string(),
        "--outdir".to_string(),
        output_dir.to_string_lossy().to_string(),
        source_path.to_string_lossy().to_string(),
    ]);

    let mut command = Command::new(config.libre_office_path.trim());
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let output = timeout(
        Duration::from_secs(config.timeout_seconds.max(10)),
        command.args(&args).output(),
    )
    .await
    .map_err(|_| "旧版 DOC 转换超时".to_string())?
    .map_err(|e| format!("执行 LibreOffice 失败: {}", e))?;

    if let Some(dir) = profile_dir {
        let _ = fs::remove_dir_all(dir);
    }

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!("LibreOffice 转换失败: {}{}", stderr, stdout));
    }

    let stem = source_path
        .file_stem()
        .ok_or_else(|| "无法获取 DOC 文件名".to_string())?
        .to_string_lossy();
    let expected_path = output_dir.join(format!("{}.docx", stem));
    if expected_path.exists() {
        return Ok(expected_path);
    }

    fs::read_dir(output_dir)
        .map_err(|e| format!("读取文档转换目录失败: {}", e))?
        .flatten()
        .map(|entry| entry.path())
        .find(|path| {
            path.extension()
                .map(|ext| ext.to_string_lossy().eq_ignore_ascii_case("docx"))
                .unwrap_or(false)
        })
        .ok_or_else(|| "LibreOffice 已结束，但未找到转换后的 DOCX 文件".to_string())
}

/// 在常见安装路径中嗅探 LibreOffice 可执行文件
pub async fn detect_libreoffice_path() -> Option<String> {
    let candidates = get_libreoffice_candidates();

    for candidate in &candidates {
        let path = Path::new(candidate);
        if path.exists() && run_libreoffice_version(candidate).await.is_ok() {
            return Some(candidate.clone());
        }
    }

    // 尝试从 PATH 中查找
    let path_candidates = if cfg!(target_os = "windows") {
        vec!["soffice.com", "soffice.exe"]
    } else {
        vec!["soffice", "libreoffice"]
    };

    for name in path_candidates {
        if run_libreoffice_version(name).await.is_ok() {
            return Some(name.to_string());
        }
    }

    None
}

fn get_libreoffice_candidates() -> Vec<String> {
    let mut candidates = Vec::new();

    #[cfg(target_os = "windows")]
    {
        let program_files =
            std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".to_string());
        let program_files_x86 = std::env::var("ProgramFiles(x86)")
            .unwrap_or_else(|_| "C:\\Program Files (x86)".to_string());

        // 标准安装路径
        for base in &[&program_files, &program_files_x86] {
            candidates.push(format!("{}\\LibreOffice\\program\\soffice.com", base));
            candidates.push(format!("{}\\LibreOffice\\program\\soffice.exe", base));
        }

        // 带版本号的安装路径 (LibreOffice 5/6/7/24/25)
        for base in &[&program_files, &program_files_x86] {
            for ver in &["5", "6", "7", "24", "25"] {
                candidates.push(format!(
                    "{}\\LibreOffice {}\\program\\soffice.com",
                    base, ver
                ));
                candidates.push(format!(
                    "{}\\LibreOffice {}\\program\\soffice.exe",
                    base, ver
                ));
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        candidates.push("/Applications/LibreOffice.app/Contents/MacOS/soffice".to_string());
        // Homebrew
        candidates.push("/opt/homebrew/bin/soffice".to_string());
        candidates.push("/usr/local/bin/soffice".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        candidates.push("/usr/bin/soffice".to_string());
        candidates.push("/usr/bin/libreoffice".to_string());
        candidates.push("/usr/local/bin/soffice".to_string());
        candidates.push("/usr/local/bin/libreoffice".to_string());
        // Snap
        candidates.push("/snap/bin/libreoffice".to_string());
        // Flatpak
        candidates.push("/var/lib/flatpak/exports/bin/org.libreoffice.LibreOffice".to_string());
    }

    candidates
}

/// 检查指定路径的 LibreOffice 是否可用
pub async fn check_converter(path: &str) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("未配置 LibreOffice 可执行文件路径".to_string());
    }
    run_libreoffice_version(trimmed).await
}
