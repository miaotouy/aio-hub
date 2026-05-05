//! Skill 管理模块：后端引擎
//!
//! 负责 Skill 的扫描、YAML frontmatter 解析、安全执行脚本和资源访问。

use crate::utils::mime::guess_mime_type;
use dirs_next;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri::Manager;
use tokio::process::Command;
use tokio::time::timeout;

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
    pub files: Vec<SkillFile>,
    pub source: String, // "user" | "builtin"
}

/// 外部扫描路径配置（前端通过参数传入）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalScanPath {
    pub id: String,
    #[serde(default)]
    pub path: String,
    pub enabled: bool,
    #[serde(default)]
    pub label: Option<String>,
}

/// 语言运行时配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageRuntime {
    pub command: String,
}

/// 运行环境配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSettings {
    pub javascript: LanguageRuntime,
    pub python: LanguageRuntime,
    pub shell: LanguageRuntime,
    pub powershell: LanguageRuntime,
}

/// 已知工具预设路径（跨平台）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WellKnownPath {
    pub id: String,
    pub label: String,
    pub default_path: String,
}

/// Skill 脚本信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillScript {
    pub name: String,
    pub relative_path: String,
    pub language: String,
    pub description: Option<String>,
    pub size: u64,
}

/// Skill 资源文件信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillFile {
    pub name: String,
    pub relative_path: String,
    pub size: u64,
    pub mime_type: String,
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

/// SKILL.md Frontmatter 结构（严格遵循 Agent Skills 规范）
#[derive(Debug, Deserialize)]
struct SkillFrontmatter {
    name: String,
    description: String,
    license: Option<String>,
    compatibility: Option<String>,
    metadata: Option<HashMap<String, String>>,
    #[serde(rename = "allowed-tools")]
    allowed_tools: Option<serde_yaml::Value>, // 兼容字符串和数组
}

/// 扫描所有搜索路径，返回 Skill 清单列表
#[tauri::command]
pub async fn get_all_skill_manifests(
    app: AppHandle,
    external_paths: Option<Vec<ExternalScanPath>>,
) -> Result<Vec<SkillManifest>, String> {
    let app_data_dir = crate::get_app_data_dir(app.config());
    let resource_dir = app.path().resource_dir().ok();

    // 在阻塞线程中执行密集型 IO 和并行扫描
    tokio::task::spawn_blocking(move || {
        let mut manifests = Vec::new();

        // 1. 用户安装的 Skill
        let user_skills_dir = app_data_dir.join("skills");
        if user_skills_dir.exists() {
            manifests.extend(scan_skills_in_dir_parallel(&user_skills_dir, "user"));
        }

        // 2. 内置 Skill
        if let Some(res_dir) = resource_dir {
            let builtin_dir = res_dir.join("skills");
            if builtin_dir.exists() {
                manifests.extend(scan_skills_in_dir_parallel(&builtin_dir, "builtin"));
            }
        }

        // 3. 外部路径
        if let Some(paths) = external_paths {
            for ep in paths {
                if !ep.enabled || ep.path.is_empty() {
                    continue;
                }
                let path = PathBuf::from(&ep.path);
                if path.exists() {
                    let source = format!("external:{}", ep.id);
                    manifests.extend(scan_skills_in_dir_parallel(&path, &source));
                }
            }
        }

        Ok(manifests)
    })
    .await
    .map_err(|e| format!("扫描任务失败: {}", e))?
}

/// 并行扫描指定目录下的所有 Skill
fn scan_skills_in_dir_parallel(dir: &Path, source: &str) -> Vec<SkillManifest> {
    let entries: Vec<PathBuf> = fs::read_dir(dir)
        .map(|e| e.flatten().map(|entry| entry.path()).collect())
        .unwrap_or_default();

    // 使用 rayon 并行处理目录解析
    entries
        .into_par_iter()
        .filter(|path| path.is_dir())
        .filter_map(|path| {
            let res = parse_skill_directory_sync(&path, source);
            if res.is_none() {
                // 如果该目录下有 SKILL.md 但解析失败，打印日志
                if path.join("SKILL.md").exists() {
                    println!("Skill 解析失败: {:?}", path);
                }
            }
            res
        })
        .collect()
}

/// 同步解析单个 Skill 目录（内部由并行扫描调用）
fn parse_skill_directory_sync(path: &Path, source: &str) -> Option<SkillManifest> {
    let skill_md_path = path.join("SKILL.md");
    if !skill_md_path.exists() {
        return None;
    }

    let content = fs::read_to_string(&skill_md_path).ok()?;

    // 提取 Frontmatter
    let parts: Vec<&str> = content.split("---").collect();
    if parts.len() < 3 {
        return None;
    }

    let yaml_str = parts[1];
    let instructions = parts[2..].join("---");
    let frontmatter: SkillFrontmatter = serde_yaml::from_str(yaml_str).ok()?;

    // 规范校验
    if !is_valid_skill_name(&frontmatter.name) {
        println!(
            "Skill 校验失败: 名称 '{}' 不符合规范 (路径: {:?})",
            frontmatter.name, path
        );
        return None;
    }

    let allowed_tools = match frontmatter.allowed_tools {
        Some(serde_yaml::Value::String(s)) => {
            Some(s.split_whitespace().map(|s| s.to_string()).collect())
        }
        Some(serde_yaml::Value::Sequence(seq)) => Some(
            seq.into_iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect(),
        ),
        _ => None,
    };

    let mut scripts = Vec::new();
    let mut files = Vec::new();

    // 使用 ignore 库进行高性能遍历，自动处理 .gitignore 并忽略隐藏文件和依赖目录
    let walker = ignore::WalkBuilder::new(path)
        .hidden(true)
        .git_ignore(true)
        .require_git(false)
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            // 额外手动忽略常见的重依赖/构建目录，以防 Skill 目录内没有 .gitignore
            !matches!(
                name.as_ref(),
                "node_modules" | "venv" | ".venv" | "target" | "dist" | "build" | "__pycache__"
            )
        })
        .build();

    for entry in walker.flatten() {
        let p = entry.path();
        let name = p.file_name().unwrap_or_default().to_string_lossy();

        if p.is_file() {
            if name == "SKILL.md" {
                continue;
            }

            let rel_path = p.strip_prefix(path).ok()?;
            let rel_path_str = rel_path.to_string_lossy().to_string();
            let metadata = entry.metadata().ok();
            let size = metadata.map(|m| m.len()).unwrap_or(0);

            // 识别脚本 (必须在 scripts/ 目录下)
            if rel_path.starts_with("scripts") {
                let ext = p
                    .extension()
                    .map(|e| e.to_string_lossy().to_lowercase())
                    .unwrap_or_default();
                let language = match ext.as_str() {
                    "py" => "python",
                    "js" | "ts" => "javascript",
                    "sh" | "bash" => "bash",
                    "ps1" => "powershell",
                    "bat" | "cmd" => "batch",
                    "rs" => "rust",
                    "go" => "go",
                    "c" => "c",
                    "cpp" => "cpp",
                    "cs" => "csharp",
                    "java" => "java",
                    "rb" => "ruby",
                    "php" => "php",
                    "swift" => "swift",
                    _ => "",
                };

                if !language.is_empty() {
                    scripts.push(SkillScript {
                        name: name.to_string(),
                        relative_path: rel_path_str.clone(),
                        language: language.to_string(),
                        description: None,
                        size,
                    });
                }
            }

            // 添加到文件列表
            files.push(SkillFile {
                name: name.to_string(),
                relative_path: rel_path_str,
                size,
                mime_type: guess_mime_type(p),
            });
        }
    }

    Some(SkillManifest {
        name: frontmatter.name,
        description: frontmatter.description,
        license: frontmatter.license,
        compatibility: frontmatter.compatibility,
        metadata: frontmatter.metadata,
        allowed_tools,
        instructions,
        base_path: path.to_string_lossy().to_string(),
        scripts,
        files,
        source: source.to_string(),
    })
}

/// 解析单个 Skill 目录（异步包装器，用于兼容旧代码）
async fn parse_skill_directory(path: &Path, source: &str) -> Option<SkillManifest> {
    let path = path.to_path_buf();
    let source = source.to_string();
    tokio::task::spawn_blocking(move || parse_skill_directory_sync(&path, &source))
        .await
        .ok()?
}

/// 校验技能名称是否符合规范
/// 规范：1-64字符，允许字母、数字、连字符、下划线
fn is_valid_skill_name(name: &str) -> bool {
    if name.is_empty() || name.len() > 64 {
        return false;
    }
    for c in name.chars() {
        if !c.is_ascii_alphanumeric() && c != '-' && c != '_' {
            return false;
        }
    }
    true
}

/// 解析运行时配置，返回实际要执行的命令和参数
fn resolve_runtime(
    ext: &str,
    script_path: &Path,
    settings: &RuntimeSettings,
) -> Result<(String, Vec<String>), String> {
    let script_path_str = script_path.to_string_lossy().to_string();

    match ext {
        "js" | "ts" => {
            let configured = settings.javascript.command.trim();
            let cmd = if !configured.is_empty() {
                configured.to_string()
            } else if check_command_exists("bun") {
                "bun".to_string()
            } else {
                "node".to_string()
            };
            Ok((cmd, vec![script_path_str]))
        }
        "py" => {
            let cmd = pick_runtime(&settings.python.command, "python");
            Ok((cmd, vec![script_path_str]))
        }
        "sh" | "bash" => {
            let cmd = pick_runtime(&settings.shell.command, "bash");
            Ok((cmd, vec![script_path_str]))
        }
        "ps1" => {
            let cmd = pick_runtime(&settings.powershell.command, "powershell");
            Ok((cmd, vec!["-File".to_string(), script_path_str]))
        }
        _ => Err(format!("不支持的脚本类型: .{}", ext)),
    }
}

fn pick_runtime(configured: &str, fallback: &str) -> String {
    let trimmed = configured.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
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
    runtime_settings: Option<RuntimeSettings>,
) -> Result<SkillScriptResult, String> {
    let start_time = Instant::now();
    let timeout_duration = Duration::from_secs(timeout_secs.unwrap_or(60));
    let settings = runtime_settings.unwrap_or(RuntimeSettings {
        javascript: LanguageRuntime {
            command: String::new(),
        },
        python: LanguageRuntime {
            command: String::new(),
        },
        shell: LanguageRuntime {
            command: String::new(),
        },
        powershell: LanguageRuntime {
            command: String::new(),
        },
    });

    // 查找 Skill 目录
    let manifests = get_all_skill_manifests(app, None).await?;
    let manifest = manifests
        .iter()
        .find(|m| m.name == skill_id)
        .ok_or_else(|| format!("未找到技能: {}", skill_id))?;

    let base_path = PathBuf::from(&manifest.base_path);
    let script_path = base_path.join("scripts").join(&script_name);

    // 路径安全校验
    if !script_path.exists() || !script_path.starts_with(base_path.join("scripts")) {
        return Err(format!("非法的脚本路径: {}", script_name));
    }

    let ext = script_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_lowercase();

    // 根据用户配置解析执行引擎
    let (cmd_name, mut cmd_args) = resolve_runtime(&ext, &script_path, &settings)?;

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
        Command::new(&cmd_name)
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
    let manifests = get_all_skill_manifests(app, None).await?;
    let manifest = manifests
        .iter()
        .find(|m| m.name == skill_id)
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
    let manifests = get_all_skill_manifests(app, None).await?;
    let manifest = manifests
        .iter()
        .find(|m| m.name == skill_id)
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

/// 内部函数：将已准备好的技能目录安装到用户技能库
async fn install_skill_internal(
    app_handle: &AppHandle,
    source_path: &Path,
    custom_name: Option<String>,
) -> Result<SkillManifest, String> {
    // 预检并获取当前清单
    let mut manifest = parse_skill_directory(source_path, "user")
        .await
        .ok_or("该目录不是有效的 Skill 目录（缺少 SKILL.md 或格式错误）")?;

    // 如果提供了自定义名称，则更新 SKILL.md
    if let Some(name) = custom_name {
        if !is_valid_skill_name(&name) {
            return Err(format!("自定义名称 '{}' 不符合规范", name));
        }

        // 更新文件内容（直接在源目录修改，因为通常源目录是临时的或即将被复制）
        let skill_md_path = source_path.join("SKILL.md");
        let content = fs::read_to_string(&skill_md_path).map_err(|e| e.to_string())?;

        // 简单的 YAML 替换
        let re = regex::Regex::new(r#"(?m)^name:\s*['"]?([^'"]+)['"]?$"#).unwrap();
        let new_content = re.replace(&content, format!("name: {}", name)).to_string();

        fs::write(&skill_md_path, new_content).map_err(|e| e.to_string())?;

        // 更新内存中的 manifest
        manifest.name = name;
    }

    let app_data_dir = crate::get_app_data_dir(app_handle.config());
    let skills_dir = app_data_dir.join("skills");
    let target_skills_dir = skills_dir.join(&manifest.name);

    if target_skills_dir.exists() {
        return Err(format!("安装失败：目标目录 '{}' 已存在，请尝试更换技能名称", manifest.name));
    }

    // 执行复制
    fs::create_dir_all(&skills_dir).map_err(|e| format!("无法创建技能库目录: {}", e))?;

    let mut options = fs_extra::dir::CopyOptions::new();
    options.copy_inside = true;
    // 确保复制后的目录名与 manifest.name 严格一致
    fs_extra::dir::copy(source_path, &skills_dir, &options)
        .map_err(|e| format!("安装复制失败: {}", e))?;

    // 如果源目录名不等于 manifest.name，fs_extra 会按原名复制，我们需要重命名
    let source_dir_name = source_path.file_name().unwrap();
    let actual_copied_dir = skills_dir.join(source_dir_name);

    if actual_copied_dir != target_skills_dir {
        // 重命名前再次确认目标不存在
        if target_skills_dir.exists() {
            let _ = fs::remove_dir_all(&actual_copied_dir);
            return Err(format!("安装重命名失败：目标目录 '{}' 已存在", manifest.name));
        }

        fs::rename(actual_copied_dir, &target_skills_dir)
            .map_err(|e| format!("安装重命名失败: {}", e))?;
    }

    Ok(manifest)
}

/// 安装 Skill（从目录复制到 appData/skills/）
#[tauri::command]
pub async fn install_skill_from_dir(
    app: AppHandle,
    source_dir: String,
    custom_name: Option<String>,
) -> Result<SkillManifest, String> {
    let source_path = PathBuf::from(&source_dir);
    if !source_path.exists() || !source_path.is_dir() {
        return Err("源目录不存在或不是目录".to_string());
    }

    install_skill_internal(&app, &source_path, custom_name).await
}

/// 安装 Skill（从 Git 仓库克隆到 appData/skills/）
#[tauri::command]
pub async fn install_skill_from_git(
    app: AppHandle,
    repo_url: String,
    custom_name: Option<String>,
) -> Result<SkillManifest, String> {
    let url = repo_url.trim().to_string();
    if url.is_empty() {
        return Err("仓库 URL 不能为空".to_string());
    }

    let normalized_url = if !url.ends_with(".git") {
        if url.starts_with("http://")
            || url.starts_with("https://")
            || url.starts_with("git@")
            || url.starts_with("ssh://")
        {
            format!("{}.git", url)
        } else {
            url.clone()
        }
    } else {
        url.clone()
    };

    let temp_dir = tempfile::tempdir().map_err(|e| format!("创建临时目录失败: {}", e))?;
    let temp_path = temp_dir.path().to_path_buf();
    let clone_dir = temp_path.join("repo");

    let clone_dir_clone = clone_dir.clone();
    tokio::task::spawn_blocking(move || {
        let mut fetch_options = git2::FetchOptions::new();
        fetch_options.download_tags(git2::AutotagOption::None);

        let mut builder = git2::build::RepoBuilder::new();
        builder.fetch_options(fetch_options);

        match builder.clone(&normalized_url, &clone_dir_clone) {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("Git 克隆失败: {}", e)),
        }
    })
    .await
    .map_err(|e| format!("克隆任务出错: {}", e))??;

    let manifest = install_skill_internal(&app, &clone_dir, custom_name).await?;
    drop(temp_dir);
    Ok(manifest)
}

/// 安装 Skill（从本地 ZIP 文件解压到 appData/skills/）
#[tauri::command]
pub async fn install_skill_from_zip_file(
    app: AppHandle,
    zip_path: String,
    custom_name: Option<String>,
) -> Result<SkillManifest, String> {
    let source_zip_path = PathBuf::from(&zip_path);
    if !source_zip_path.exists() || !source_zip_path.is_file() {
        return Err("ZIP 文件不存在".to_string());
    }

    let temp_dir = tempfile::tempdir().map_err(|e| format!("创建临时目录失败: {}", e))?;
    let temp_path = temp_dir.path().to_path_buf();

    let extract_dir = temp_path.join("extracted");
    fs::create_dir_all(&extract_dir).map_err(|e| format!("创建解压目录失败: {}", e))?;

    let zip_file = fs::File::open(&source_zip_path).map_err(|e| format!("打开 ZIP 文件失败: {}", e))?;
    let mut archive = zip::ZipArchive::new(zip_file).map_err(|e| format!("读取 ZIP 文件失败: {}", e))?;

    archive.extract(&extract_dir).map_err(|e| format!("解压 ZIP 文件失败: {}", e))?;

    let skill_dir = find_skill_directory(&extract_dir)
        .ok_or_else(|| "解压后未找到包含 SKILL.md 的目录".to_string())?;

    let manifest = install_skill_internal(&app, &skill_dir, custom_name).await?;
    drop(temp_dir);
    Ok(manifest)
}

/// 预览技能清单
#[tauri::command]
pub async fn preview_skill_manifest(path: String) -> Result<SkillManifest, String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err("路径不存在".to_string());
    }

    let dir = if p.is_file() {
        let file_name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if file_name.to_uppercase() == "SKILL.MD" {
            p.parent().ok_or("无法获取父目录")?.to_path_buf()
        } else {
            return Err("请选择 SKILL.md 文件或技能目录".to_string());
        }
    } else {
        p
    };

    parse_skill_directory(&dir, "preview")
        .await
        .ok_or_else(|| "不是有效的技能目录（缺少 SKILL.md 或格式错误）".to_string())
}

/// 安装 Skill（从 ZIP 包下载并解压到 appData/skills/）
#[tauri::command]
pub async fn install_skill_from_zip(
    app: AppHandle,
    zip_url: String,
    custom_name: Option<String>,
) -> Result<SkillManifest, String> {
    let url = zip_url.trim().to_string();
    if url.is_empty() {
        return Err("下载链接不能为空".to_string());
    }

    let app_data_dir = crate::get_app_data_dir(app.config());
    let skills_dir = app_data_dir.join("skills");
    fs::create_dir_all(&skills_dir).map_err(|e| format!("创建 skills 目录失败: {}", e))?;

    let temp_dir = tempfile::tempdir().map_err(|e| format!("创建临时目录失败: {}", e))?;
    let temp_path = temp_dir.path().to_path_buf();

    let zip_path = temp_path.join("skill.zip");
    let response = reqwest::get(&url).await.map_err(|e| format!("下载失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("下载失败，HTTP 状态码: {}", response.status()));
    }

    let bytes = response.bytes().await.map_err(|e| format!("读取下载数据失败: {}", e))?;
    fs::write(&zip_path, &bytes).map_err(|e| format!("保存临时文件失败: {}", e))?;

    let extract_dir = temp_path.join("extracted");
    fs::create_dir_all(&extract_dir).map_err(|e| format!("创建解压目录失败: {}", e))?;

    let zip_file = fs::File::open(&zip_path).map_err(|e| format!("打开 ZIP 文件失败: {}", e))?;
    let mut archive = zip::ZipArchive::new(zip_file).map_err(|e| format!("读取 ZIP 文件失败: {}", e))?;

    archive.extract(&extract_dir).map_err(|e| format!("解压 ZIP 文件失败: {}", e))?;

    let skill_dir = find_skill_directory(&extract_dir)
        .ok_or_else(|| "解压后未找到包含 SKILL.md 的目录".to_string())?;

    let manifest = install_skill_internal(&app, &skill_dir, custom_name).await?;
    drop(temp_dir);
    Ok(manifest)
}

/// 递归查找包含 SKILL.md 的目录
fn find_skill_directory(base: &Path) -> Option<PathBuf> {
    if base.join("SKILL.md").exists() {
        return Some(base.to_path_buf());
    }

    if let Ok(entries) = fs::read_dir(base) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && path.join("SKILL.md").exists() {
                return Some(path);
            }
        }
    }

    None
}

/// 卸载 Skill
#[tauri::command]
pub async fn uninstall_skill(app: AppHandle, skill_id: String) -> Result<(), String> {
    let manifests = get_all_skill_manifests(app.clone(), None).await?;
    let manifest = manifests
        .iter()
        .find(|m| m.name == skill_id)
        .ok_or_else(|| format!("未找到技能: {}", skill_id))?;

    if manifest.source != "user" {
        return Err("只能卸载用户安装的技能".to_string());
    }

    let base_path = PathBuf::from(&manifest.base_path);
    let app_data_dir = crate::get_app_data_dir(app.config());
    let user_skills_dir = app_data_dir.join("skills");

    if !base_path.starts_with(&user_skills_dir) {
        return Err("不支持的操作：试图删除系统或外部技能目录".to_string());
    }

    if base_path.exists() {
        fs::remove_dir_all(&base_path).map_err(|e| format!("删除目录失败: {}", e))?;
    }

    Ok(())
}

/// 获取已知工具的默认全局路径列表
#[tauri::command]
pub fn get_well_known_skill_paths() -> Vec<WellKnownPath> {
    let home = dirs_next::home_dir().unwrap_or_default();
    vec![
        WellKnownPath {
            id: "agents".to_string(),
            label: "通用跨平台标准 (Agents)".to_string(),
            default_path: home.join(".agents").join("skills").to_string_lossy().to_string(),
        },
        WellKnownPath {
            id: "claude".to_string(),
            label: "Claude Code".to_string(),
            default_path: home.join(".claude").join("skills").to_string_lossy().to_string(),
        },
        WellKnownPath {
            id: "cursor".to_string(),
            label: "Cursor".to_string(),
            default_path: home.join(".cursor").join("skills").to_string_lossy().to_string(),
        },
        WellKnownPath {
            id: "gemini".to_string(),
            label: "Gemini CLI".to_string(),
            default_path: home.join(".gemini").join("skills").to_string_lossy().to_string(),
        },
        WellKnownPath {
            id: "copilot".to_string(),
            label: "GitHub Copilot".to_string(),
            default_path: home.join(".copilot").join("skills").to_string_lossy().to_string(),
        },
    ]
}
