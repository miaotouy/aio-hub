use std::path::{Path, PathBuf};
#[cfg(target_os = "macos")]
use std::{fs, time::Duration};
#[cfg(target_os = "macos")]
use tokio::{process::Command, time::timeout};

use super::config::DocumentConversionConfig;

#[cfg(target_os = "macos")]
pub async fn check_converter() -> Result<String, String> {
    let output = timeout(
        Duration::from_secs(5),
        Command::new("textutil").arg("-help").output(),
    )
    .await
    .map_err(|_| "检测 textutil 超时".to_string())?
    .map_err(|e| format!("无法执行 textutil: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok("macOS textutil".to_string())
}

#[cfg(not(target_os = "macos"))]
pub async fn check_converter() -> Result<String, String> {
    Err("textutil 转换仅支持 macOS".to_string())
}

#[cfg(target_os = "macos")]
pub async fn convert_legacy_doc_to_docx(
    source_path: &Path,
    output_dir: &Path,
    config: &DocumentConversionConfig,
) -> Result<PathBuf, String> {
    fs::create_dir_all(output_dir).map_err(|e| format!("创建文档转换目录失败: {}", e))?;
    let stem = source_path
        .file_stem()
        .ok_or_else(|| "无法获取 DOC 文件名".to_string())?
        .to_string_lossy();
    let target_path = output_dir.join(format!("{}.docx", stem));

    let output = timeout(
        Duration::from_secs(config.timeout_seconds.max(10)),
        Command::new("textutil")
            .arg("-convert")
            .arg("docx")
            .arg("-output")
            .arg(&target_path)
            .arg(source_path)
            .output(),
    )
    .await
    .map_err(|_| "旧版 DOC 转换超时".to_string())?
    .map_err(|e| format!("执行 textutil 失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!("textutil 转换失败: {}{}", stderr, stdout));
    }

    if target_path.exists() {
        Ok(target_path)
    } else {
        Err("textutil 已结束，但未找到转换后的 DOCX 文件".to_string())
    }
}

#[cfg(not(target_os = "macos"))]
pub async fn convert_legacy_doc_to_docx(
    _source_path: &Path,
    _output_dir: &Path,
    _config: &DocumentConversionConfig,
) -> Result<PathBuf, String> {
    Err("textutil 转换仅支持 macOS".to_string())
}
