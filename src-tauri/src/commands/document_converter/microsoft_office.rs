use std::path::{Path, PathBuf};
#[cfg(target_os = "windows")]
use std::{fs, time::Duration};
#[cfg(target_os = "windows")]
use tokio::{process::Command, time::timeout};

use super::config::DocumentConversionConfig;

#[cfg(target_os = "windows")]
fn powershell_command() -> Command {
    let mut command = Command::new("powershell.exe");
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

#[cfg(target_os = "windows")]
async fn run_powershell(script: &str, args: &[String], seconds: u64) -> Result<String, String> {
    let output = timeout(
        Duration::from_secs(seconds),
        powershell_command()
            .arg("-NoProfile")
            .arg("-NonInteractive")
            .arg("-ExecutionPolicy")
            .arg("Bypass")
            .arg("-Command")
            .arg(script)
            .args(args)
            .output(),
    )
    .await
    .map_err(|_| "检测 Microsoft Word 超时".to_string())?
    .map_err(|e| format!("无法执行 PowerShell: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Err(if stderr.is_empty() { stdout } else { stderr });
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Ok(if stdout.is_empty() { stderr } else { stdout })
}

#[cfg(target_os = "windows")]
pub async fn check_converter() -> Result<String, String> {
    let script = r#"
$ErrorActionPreference = 'Stop'
$word = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  "Microsoft Word $($word.Version)"
} finally {
  if ($null -ne $word) {
    $word.Quit() | Out-Null
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
  }
}
"#;
    run_powershell(script, &[], 8).await
}

#[cfg(not(target_os = "windows"))]
pub async fn check_converter() -> Result<String, String> {
    Err("Microsoft Word COM 转换仅支持 Windows".to_string())
}

#[cfg(target_os = "windows")]
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

    let script = r#"
param([string]$sourcePath, [string]$targetPath)
$ErrorActionPreference = 'Stop'
$word = $null
$doc = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Open($sourcePath, $false, $true, $false)
  $doc.SaveAs2($targetPath, 16)
  $doc.Close($false)
  $doc = $null
  "OK"
} finally {
  if ($null -ne $doc) {
    $doc.Close($false) | Out-Null
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null
  }
  if ($null -ne $word) {
    $word.Quit() | Out-Null
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
  }
}
"#;

    let args = vec![
        source_path.to_string_lossy().to_string(),
        target_path.to_string_lossy().to_string(),
    ];
    run_powershell(script, &args, config.timeout_seconds.max(10)).await?;

    if target_path.exists() {
        Ok(target_path)
    } else {
        Err("Microsoft Word 已结束，但未找到转换后的 DOCX 文件".to_string())
    }
}

#[cfg(not(target_os = "windows"))]
pub async fn convert_legacy_doc_to_docx(
    _source_path: &Path,
    _output_dir: &Path,
    _config: &DocumentConversionConfig,
) -> Result<PathBuf, String> {
    Err("Microsoft Word COM 转换仅支持 Windows".to_string())
}

#[cfg(target_os = "windows")]
pub async fn convert_legacy_ppt_to_pptx(
    source_path: &Path,
    output_dir: &Path,
    config: &DocumentConversionConfig,
) -> Result<PathBuf, String> {
    fs::create_dir_all(output_dir).map_err(|e| format!("创建文档转换目录失败: {}", e))?;
    let stem = source_path
        .file_stem()
        .ok_or_else(|| "无法获取 PPT 文件名".to_string())?
        .to_string_lossy();
    let target_path = output_dir.join(format!("{}.pptx", stem));

    let script = r#"
param([string]$sourcePath, [string]$targetPath)
$ErrorActionPreference = 'Stop'
$ppt = $null
$presentation = $null
try {
  $ppt = New-Object -ComObject PowerPoint.Application
  # PowerPoint Open 参数: FileName, ReadOnly, Untitled, WithWindow
  # ReadOnly = $true (1), Untitled = $false (0), WithWindow = $false (0)
  $presentation = $ppt.Presentations.Open($sourcePath, 1, 0, 0)
  # SaveAs 参数: FileName, FileFormat (24 = ppSaveAsOpenXMLPresentation)
  $presentation.SaveAs($targetPath, 24)
  $presentation.Close()
  $presentation = $null
  "OK"
} finally {
  if ($null -ne $presentation) {
    $presentation.Close() | Out-Null
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($presentation) | Out-Null
  }
  if ($null -ne $ppt) {
    $ppt.Quit() | Out-Null
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null
  }
}
"#;

    let args = vec![
        source_path.to_string_lossy().to_string(),
        target_path.to_string_lossy().to_string(),
    ];
    run_powershell(script, &args, config.timeout_seconds.max(10)).await?;

    if target_path.exists() {
        Ok(target_path)
    } else {
        Err("Microsoft PowerPoint 已结束，但未找到转换后的 PPTX 文件".to_string())
    }
}

#[cfg(not(target_os = "windows"))]
pub async fn convert_legacy_ppt_to_pptx(
    _source_path: &Path,
    _output_dir: &Path,
    _config: &DocumentConversionConfig,
) -> Result<PathBuf, String> {
    Err("Microsoft PowerPoint COM 转换仅支持 Windows".to_string())
}
