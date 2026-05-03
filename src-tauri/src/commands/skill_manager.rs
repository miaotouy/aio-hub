//! Skill 管理模块：后端引擎
//!
//! 负责 Skill 的扫描、YAML frontmatter 解析、安全执行脚本和资源访问。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tokio::process::Command;
use tokio::time::timeout;
use std::process::Stdio;

/// Skill 清单（与前端 SkillManifest 结构对齐）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillManifest {
    pub name: String,
    pub description: String,
    pub license: Option<String>,
    pub compatibility: Option<String>,
    pub metadata: Option<HashMap<String, String>>,
    pub allowed_tools: Option<Vec<String>>,
    pub instructions: String,
    pub base_path: String,
    pub scripts: Vec<SkillScript>,
    pub references: Vec<SkillFile>,
    pub assets: Vec<SkillFile>,
    pub source: String, // "user" | "builtin"
}

/// Skill 脚本信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillScript {
    pub name: String,
    pub relative_path: String,
    pub language: String,
    pub description: Option<String>,
}

/// Skill 资源文件信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillFile {
    pub name: String,
    pub relative_path: String,
    pub size: u64,
}

/// 脚本执行结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillScriptResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
    pub duration_ms: u128,
}

/// SKILL.md Frontmatter 结构
#[derive(Debug, Deserialize)]
struct SkillFrontmatter {
    name: String,
    description: String,
    license: Option<String>,
    compatibility: Option<String>,
    metadata: Option<HashMap<String, String>>,
    #[serde(rename = "allowed-tools")]
    allowed_tools: Option<Vec<String>>,
}

/// 扫描所有搜索路径，返回 Skill 清单列表
#[tauri::command]
pub async fn get_all_skill_manifests(
    app: AppHandle,
) -> Result<Vec<SkillManifest>, String> {
    let mut manifests = Vec::new();
    let app_data_dir = crate::get_app_data_dir(app.config());
    
    // 1. 用户目录: {appDataDir}/skills/
    let user_skills_dir = app_data_dir.join("skills");
    if user_skills_dir.exists() {
        scan_skills_in_dir(&user_skills_dir, "user", &mut manifests).await;
    }

    // 2. 内置目录: {resources}/skills/
    let builtin_skills_dir = app_data_dir.join("builtin_skills");
    if builtin_skills_dir.exists() {
        scan_skills_in_dir(&builtin_skills_dir, "builtin", &mut manifests).await;
    }

    Ok(manifests)
}

/// 扫描指定目录下的所有 Skill
async fn scan_skills_in_dir(dir: &Path, source: &str, manifests: &mut Vec<SkillManifest>) {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(manifest) = parse_skill_directory(&path, source).await {
                manifests.push(manifest);
            }
        }
    }
}

/// 解析单个 Skill 目录
async fn parse_skill_directory(path: &Path, source: &str) -> Option<SkillManifest> {
    let skill_md_path = path.join("SKILL.md");
    if !skill_md_path.exists() {
        return None;
    }

    let content = fs::read_to_string(&skill_md_path).ok()?;
    
    // 提取 Frontmatter (--- 分隔)
    let parts: Vec<&str> = content.split("---").collect();
    if parts.len() < 3 {
        return None;
    }

    let yaml_str = parts[1];
    let instructions = parts[2..].join("---").trim().to_string();

    let frontmatter: SkillFrontmatter = serde_yaml::from_str(yaml_str).ok()?;

    // 扫描 scripts/
    let mut scripts = Vec::new();
    let scripts_dir = path.join("scripts");
    if scripts_dir.exists() {
        if let Ok(entries) = fs::read_dir(scripts_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() {
                    let name = p.file_name()?.to_string_lossy().to_string();
                    let ext = p.extension()?.to_string_lossy().to_lowercase();
                    let language = match ext.as_str() {
                        "py" => "python",
                        "js" | "ts" => "javascript",
                        "sh" | "bash" => "bash",
                        "ps1" => "powershell",
                        _ => "unknown",
                    };
                    scripts.push(SkillScript {
                        name,
                        relative_path: format!("scripts/{}", p.file_name()?.to_string_lossy()),
                        language: language.to_string(),
                        description: None,
                    });
                }
            }
        }
    }

    // 扫描 references/
    let mut references = Vec::new();
    let refs_dir = path.join("references");
    if refs_dir.exists() {
        scan_files_recursive(&refs_dir, path, &mut references);
    }

    // 扫描 assets/
    let mut assets = Vec::new();
    let assets_dir = path.join("assets");
    if assets_dir.exists() {
        scan_files_recursive(&assets_dir, path, &mut assets);
    }

    Some(SkillManifest {
        name: frontmatter.name,
        description: frontmatter.description,
        license: frontmatter.license,
        compatibility: frontmatter.compatibility,
        metadata: frontmatter.metadata,
        allowed_tools: frontmatter.allowed_tools,
        instructions,
        base_path: path.to_string_lossy().to_string(),
        scripts,
        references,
        assets,
        source: source.to_string(),
    })
}

fn scan_files_recursive(dir: &Path, base: &Path, target: &mut Vec<SkillFile>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Ok(rel) = path.strip_prefix(base) {
                    target.push(SkillFile {
                        name: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
                        relative_path: rel.to_string_lossy().to_string(),
                        size: fs::metadata(&path).map(|m| m.len()).unwrap_or(0),
                    });
                }
            } else if path.is_dir() {
                scan_files_recursive(&path, base, target);
            }
        }
    }
}

/// 安全执行指定 Skill 的脚本
#[tauri::command]
pub async fn run_skill_script(
    app: AppHandle,
    skill_id: String,
    script_name: String,
    args: Option<String>,
    timeout_secs: Option<u64>,
) -> Result<SkillScriptResult, String> {
    let start_time = Instant::now();
    let timeout_duration = Duration::from_secs(timeout_secs.unwrap_or(60));

    // 查找 Skill 目录
    let manifests = get_all_skill_manifests(app).await?;
    let manifest = manifests.iter().find(|m| m.name == skill_id)
        .ok_or_else(|| format!("未找到技能: {}", skill_id))?;

    let base_path = PathBuf::from(&manifest.base_path);
    let script_path = base_path.join("scripts").join(&script_name);

    // 路径安全校验
    if !script_path.exists() || !script_path.starts_with(base_path.join("scripts")) {
        return Err(format!("非法的脚本路径: {}", script_name));
    }

    let ext = script_path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_lowercase();

    // 探测执行引擎
    let (cmd_name, mut cmd_args) = match ext.as_str() {
        "js" | "ts" => {
            if check_command_exists("bun") {
                ("bun", vec![script_path.to_string_lossy().to_string()])
            } else {
                ("node", vec![script_path.to_string_lossy().to_string()])
            }
        },
        "py" => ("python", vec![script_path.to_string_lossy().to_string()]),
        "sh" | "bash" => ("bash", vec![script_path.to_string_lossy().to_string()]),
        "ps1" => ("powershell", vec!["-File".to_string(), script_path.to_string_lossy().to_string()]),
        _ => return Err(format!("不支持的脚本类型: .{}", ext)),
    };

    // 附加参数（使用引号感知分割，避免 split_whitespace 破坏引号内参数）
    if let Some(a) = args {
        if !a.trim().is_empty() {
            let mut current = String::new();
            let mut in_quote = false;
            for c in a.chars() {
                match c {
                    '"' | '\'' => in_quote = !in_quote,
                    ' ' if !in_quote => {
                        if !current.is_empty() {
                            cmd_args.push(current.clone());
                            current.clear();
                        }
                    }
                    _ => current.push(c),
                }
            }
            if !current.is_empty() {
                cmd_args.push(current);
            }
        }
    }

    let output_result = timeout(timeout_duration, async {
        Command::new(cmd_name)
            .args(&cmd_args)
            .current_dir(&base_path)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|e| format!("执行脚本失败: {}", e))
    })
    .await;

    let output = match output_result {
        Ok(Ok(out)) => out,
        Ok(Err(e)) => return Err(e),
        Err(_) => {
            return Err(format!(
                "脚本执行超时（限 {} 秒）：{}",
                timeout_duration.as_secs(),
                script_name
            ));
        }
    };

    Ok(SkillScriptResult {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code(),
        duration_ms: start_time.elapsed().as_millis(),
    })
}

fn check_command_exists(cmd: &str) -> bool {
    #[cfg(windows)]
    let check_cmd = "where";
    #[cfg(not(windows))]
    let check_cmd = "which";

    std::process::Command::new(check_cmd)
        .arg(cmd)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// 安全读取 Skill 目录内的文本文件
#[tauri::command]
pub async fn read_skill_resource(
    app: AppHandle,
    skill_id: String,
    relative_path: String,
) -> Result<String, String> {
    let manifests = get_all_skill_manifests(app).await?;
    let manifest = manifests.iter().find(|m| m.name == skill_id)
        .ok_or_else(|| format!("未找到技能: {}", skill_id))?;
    
    let base_path = PathBuf::from(&manifest.base_path);
    let target_path = base_path.join(&relative_path);

    // 路径安全校验：防止路径穿越
    if !target_path.starts_with(&base_path) {
        return Err("不允许越权访问技能目录之外的文件".to_string());
    }

    if !target_path.exists() {
        return Err(format!("文件不存在: {}", relative_path));
    }

    fs::read_to_string(target_path).map_err(|e| format!("读取文件失败: {}", e))
}

/// 列出 Skill 目录下的文件和子目录
#[tauri::command]
pub async fn list_skill_directory(
    app: AppHandle,
    skill_id: String,
    sub_dir: Option<String>,
) -> Result<Vec<String>, String> {
    let manifests = get_all_skill_manifests(app).await?;
    let manifest = manifests.iter().find(|m| m.name == skill_id)
        .ok_or_else(|| format!("未找到技能: {}", skill_id))?;
    
    let base_path = PathBuf::from(&manifest.base_path);
    let target_dir = if let Some(sd) = sub_dir {
        base_path.join(sd)
    } else {
        base_path.clone()
    };

    if !target_dir.starts_with(&base_path) {
        return Err("不允许访问技能目录之外的路径".to_string());
    }

    let entries = fs::read_dir(target_dir).map_err(|e| format!("读取目录失败: {}", e))?;
    let mut files = Vec::new();

    for entry in entries.flatten() {
        if let Some(name) = entry.file_name().to_str() {
            files.push(name.to_string());
        }
    }

    Ok(files)
}

/// 安装 Skill（从目录复制到 appData/skills/）
#[tauri::command]
pub async fn install_skill_from_dir(
    app: AppHandle,
    source_dir: String,
    _skill_name: Option<String>,
) -> Result<SkillManifest, String> {
    let source_path = PathBuf::from(&source_dir);
    if !source_path.exists() || !source_path.is_dir() {
        return Err("源目录不存在或不是目录".to_string());
    }

    // 预检
    let manifest = parse_skill_directory(&source_path, "user").await
        .ok_or("源目录不是有效的 Skill 目录（缺少 SKILL.md 或格式错误）")?;

    let app_data_dir = crate::get_app_data_dir(app.config());
    let target_skills_dir = app_data_dir.join("skills").join(&manifest.name);

    if target_skills_dir.exists() {
        return Err(format!("技能 {} 已存在", manifest.name));
    }

    // 执行复制
    fs::create_dir_all(target_skills_dir.parent().unwrap()).map_err(|e| e.to_string())?;
    
    let mut options = fs_extra::dir::CopyOptions::new();
    options.copy_inside = true;
    fs_extra::dir::copy(&source_path, target_skills_dir.parent().unwrap(), &options)
        .map_err(|e| format!("复制失败: {}", e))?;

    Ok(manifest)
}