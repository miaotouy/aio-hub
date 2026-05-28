use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::process::Command;
use tokio::time::timeout;

use super::config::DocumentConversionConfig;

fn command_with_no_window(path: &str) -> Command {
    let mut command = Command::new(path);
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

pub async fn run_abiword_version(path: &str) -> Result<String, String> {
    let output = timeout(
        Duration::from_secs(5),
        command_with_no_window(path).arg("--version").output(),
    )
    .await
    .map_err(|_| "检测 AbiWord 超时".to_string())?
    .map_err(|e| format!("无法执行 AbiWord: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Ok(if stdout.is_empty() { stderr } else { stdout })
}

pub async fn convert_legacy_doc_to_docx(
    source_path: &Path,
    output_dir: &Path,
    config: &DocumentConversionConfig,
) -> Result<PathBuf, String> {
    let executable = config.abi_word_path.trim();
    if executable.is_empty() {
        return Err("未配置 AbiWord 可执行文件路径".to_string());
    }

    fs::create_dir_all(output_dir).map_err(|e| format!("创建文档转换目录失败: {}", e))?;
    let stem = source_path
        .file_stem()
        .ok_or_else(|| "无法获取 DOC 文件名".to_string())?
        .to_string_lossy();
    let target_path = output_dir.join(format!("{}.docx", stem));

    let output = timeout(
        Duration::from_secs(config.timeout_seconds.max(10)),
        command_with_no_window(executable)
            .arg("--to=docx")
            .arg(format!("--to-name={}", target_path.to_string_lossy()))
            .arg(source_path)
            .output(),
    )
    .await
    .map_err(|_| "旧版 DOC 转换超时".to_string())?
    .map_err(|e| format!("执行 AbiWord 失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!("AbiWord 转换失败: {}{}", stderr, stdout));
    }

    if target_path.exists() {
        return Ok(target_path);
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
        .ok_or_else(|| "AbiWord 已结束，但未找到转换后的 DOCX 文件".to_string())
}

pub async fn detect_abiword_path() -> Option<String> {
    for candidate in get_abiword_candidates() {
        let path = Path::new(&candidate);
        if path.exists() && run_abiword_version(&candidate).await.is_ok() {
            return Some(candidate);
        }
    }

    let path_candidates = if cfg!(target_os = "windows") {
        vec!["AbiWord.exe", "abiword.exe"]
    } else {
        vec!["abiword"]
    };

    for name in path_candidates {
        if run_abiword_version(name).await.is_ok() {
            return Some(name.to_string());
        }
    }

    None
}

fn get_abiword_candidates() -> Vec<String> {
    let mut candidates = Vec::new();

    #[cfg(target_os = "windows")]
    {
        let program_files =
            std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".to_string());
        let program_files_x86 = std::env::var("ProgramFiles(x86)")
            .unwrap_or_else(|_| "C:\\Program Files (x86)".to_string());

        for base in &[&program_files, &program_files_x86] {
            candidates.push(format!("{}\\AbiWord\\bin\\AbiWord.exe", base));
            candidates.push(format!("{}\\AbiWord\\AbiWord.exe", base));
        }
    }

    #[cfg(target_os = "macos")]
    {
        candidates.push("/Applications/AbiWord.app/Contents/MacOS/AbiWord".to_string());
        candidates.push("/opt/homebrew/bin/abiword".to_string());
        candidates.push("/usr/local/bin/abiword".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        candidates.push("/usr/bin/abiword".to_string());
        candidates.push("/usr/local/bin/abiword".to_string());
        candidates.push("/snap/bin/abiword".to_string());
    }

    candidates
}

pub async fn check_converter(path: &str) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("未配置 AbiWord 可执行文件路径".to_string());
    }
    run_abiword_version(trimmed).await
}
