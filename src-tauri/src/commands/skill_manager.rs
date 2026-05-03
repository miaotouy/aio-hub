//! Skill 管理模块：后端引擎
//!
//! 负责 Skill 的扫描、YAML frontmatter 解析、安全执行脚本和资源访问。

use dirs_next;
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
    pub references: Vec<SkillFile>,
    pub assets: Vec<SkillFile>,
    pub source: String, // "user" | "builtin"
}

/// 外部扫描路径配置（前端通过参数传入）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalScanPath {
    pub id: String,
    pub path: String,
    pub enabled: bool,
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
    external_paths: Option<Vec<ExternalScanPath>>,
) -> Result<Vec<SkillManifest>, String> {
    let mut manifests = Vec::new();
    let app_data_dir = crate::get_app_data_dir(app.config());

    // 1. 用户安装的 Skill（优先，可覆盖内置 skill）
    let user_skills_dir = app_data_dir.join("skills");
    if user_skills_dir.exists() {
        scan_skills_in_dir(&user_skills_dir, "user", &mut manifests).await;
    }

    // 2. 内置 Skill（从 Tauri 资源目录加载）
    //    在打包后，resources 中配置的 ../public/skills 会被复制到资源目录下的 skills/
    //    开发模式下也可以生效（tauri dev 会自动映射资源路径）
    if let Ok(resource_dir) = app.path().resource_dir() {
        let builtin_dir = resource_dir.join("skills");
        if builtin_dir.exists() {
            scan_skills_in_dir(&builtin_dir, "builtin", &mut manifests).await;
        }
    }

    // 3. 外部路径（仅 enabled 且目录存在）
    if let Some(paths) = external_paths {
        for ep in paths {
            if !ep.enabled {
                continue;
            }
            let path = std::path::PathBuf::from(&ep.path);
            if path.exists() {
                let source = format!("external:{}", ep.id);
                scan_skills_in_dir(&path, &source, &mut manifests).await;
            }
        }
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
                        name: path
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string(),
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

/// 解析运行时配置，返回实际要执行的命令和参数
fn resolve_runtime(
    ext: &str,
    script_path: &Path,
    settings: &RuntimeSettings,
) -> Result<(String, Vec<String>), String> {
    match ext {
        "js" | "ts" => {
            // 如果用户配置了自定义命令，优先使用
            let configured = settings.javascript.command.trim();
            if !configured.is_empty() {
                Ok((
                    configured.to_string(),
                    vec![script_path.to_string_lossy().to_string()],
                ))
            } else {
                // 默认逻辑：检测 bun > node
                if check_command_exists("bun") {
                    Ok(("bun".to_string(), vec![script_path.to_string_lossy().to_string()]))
                } else {
                    Ok(("node".to_string(), vec![script_path.to_string_lossy().to_string()]))
                }
            }
        }
        "py" => {
            let configured = settings.python.command.trim();
            if !configured.is_empty() {
                Ok((
                    configured.to_string(),
                    vec![script_path.to_string_lossy().to_string()],
                ))
            } else {
                Ok(("python".to_string(), vec![script_path.to_string_lossy().to_string()]))
            }
        }
        "sh" | "bash" => {
            let configured = settings.shell.command.trim();
            if !configured.is_empty() {
                Ok((
                    configured.to_string(),
                    vec![script_path.to_string_lossy().to_string()],
                ))
            } else {
                Ok(("bash".to_string(), vec![script_path.to_string_lossy().to_string()]))
            }
        }
        "ps1" => {
            let configured = settings.powershell.command.trim();
            if !configured.is_empty() {
                Ok((
                    configured.to_string(),
                    vec![
                        "-File".to_string(),
                        script_path.to_string_lossy().to_string(),
                    ],
                ))
            } else {
                Ok((
                    "powershell".to_string(),
                    vec![
                        "-File".to_string(),
                        script_path.to_string_lossy().to_string(),
                    ],
                ))
            }
        }
        _ => Err(format!("不支持的脚本类型: .{}", ext)),
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
        javascript: LanguageRuntime { command: String::new() },
        python: LanguageRuntime { command: String::new() },
        shell: LanguageRuntime { command: String::new() },
        powershell: LanguageRuntime { command: String::new() },
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
    let manifest = parse_skill_directory(&source_path, "user")
        .await
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

/// 安装 Skill（从 Git 仓库克隆到 appData/skills/）
///
/// 支持带 `.git` 后缀和不带 `.git` 后缀的 URL。
/// 示例: `https://github.com/user/skill-repo.git` 或 `https://github.com/user/skill-repo`
#[tauri::command]
pub async fn install_skill_from_git(
    app: AppHandle,
    repo_url: String,
) -> Result<SkillManifest, String> {
    let url = repo_url.trim().to_string();
    if url.is_empty() {
        return Err("仓库 URL 不能为空".to_string());
    }

    // 自动补全 .git 后缀（如果 URL 没有的话）
    let normalized_url = if !url.ends_with(".git") {
        // 确保 URL 有效且不以 .git 结尾，追加 .git
        // 但避免给裸路径或本地路径追加
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

    // 从 URL 中提取仓库名作为技能目录名
    let repo_name = extract_repo_name(&normalized_url)?;

    let app_data_dir = crate::get_app_data_dir(app.config());
    let skills_dir = app_data_dir.join("skills");
    let target_dir = skills_dir.join(&repo_name);

    if target_dir.exists() {
        return Err(format!("技能目录 {} 已存在", repo_name));
    }

    // 确保 skills 目录存在
    fs::create_dir_all(&skills_dir).map_err(|e| format!("创建 skills 目录失败: {}", e))?;

    // 使用 git2 克隆仓库（浅克隆，depth=1，节省时间和空间）
    let target_dir_clone = target_dir.clone();
    tokio::task::spawn_blocking(move || {
        let mut fetch_options = git2::FetchOptions::new();
        fetch_options.download_tags(git2::AutotagOption::None);

        // 浅克隆：只拉取最新的 commit
        let mut builder = git2::build::RepoBuilder::new();
        builder.fetch_options(fetch_options);

        // 设置克隆深度为 1（浅克隆）
        builder.branch("master"); // 默认分支，之后 checkout 会自动处理

        // 执行克隆
        match builder.clone(&normalized_url, &target_dir_clone) {
            Ok(_) => Ok(()),
            Err(e) => {
                // 如果克隆失败，清理残留目录
                let _ = fs::remove_dir_all(&target_dir_clone);
                Err(format!("Git 克隆失败: {}", e))
            }
        }
    })
    .await
    .map_err(|e| format!("克隆任务出错: {}", e))??;

    // 克隆成功后，解析 SKILL.md 验证并获取清单
    parse_skill_directory(&target_dir, "user")
        .await
        .ok_or_else(|| {
            // 克隆成功但没有 SKILL.md，清理并报错
            let _ = std::fs::remove_dir_all(&target_dir);
            "克隆成功但仓库根目录未找到有效的 SKILL.md，已清理".to_string()
        })
}

/// 从 Git URL 中提取仓库名称（去掉 .git 后缀）
fn extract_repo_name(url: &str) -> Result<String, String> {
    // 去掉末尾的 .git
    let without_git = url.strip_suffix(".git").unwrap_or(url);

    // 从 URL 中提取最后一段路径作为仓库名
    let name = without_git
        .split('/')
        .next_back()
        .ok_or_else(|| "无法从 URL 中提取仓库名称".to_string())?;

    if name.is_empty() {
        return Err("提取的仓库名称为空".to_string());
    }

    Ok(name.to_string())
}

/// 安装 Skill（从 ZIP 包下载并解压到 appData/skills/）
#[tauri::command]
pub async fn install_skill_from_zip(
    app: AppHandle,
    zip_url: String,
) -> Result<SkillManifest, String> {
    let url = zip_url.trim().to_string();
    if url.is_empty() {
        return Err("下载链接不能为空".to_string());
    }

    let app_data_dir = crate::get_app_data_dir(app.config());
    let skills_dir = app_data_dir.join("skills");
    fs::create_dir_all(&skills_dir).map_err(|e| format!("创建 skills 目录失败: {}", e))?;

    // 创建临时目录用于下载和解压
    let temp_dir = tempfile::tempdir().map_err(|e| format!("创建临时目录失败: {}", e))?;
    let temp_path = temp_dir.path().to_path_buf();

    // 下载 ZIP 文件
    let zip_path = temp_path.join("skill.zip");

    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("下载失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("下载失败，HTTP 状态码: {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("读取下载数据失败: {}", e))?;

    fs::write(&zip_path, &bytes).map_err(|e| format!("保存临时文件失败: {}", e))?;

    // 解压 ZIP
    let extract_dir = temp_path.join("extracted");
    fs::create_dir_all(&extract_dir).map_err(|e| format!("创建解压目录失败: {}", e))?;

    let zip_file = fs::File::open(&zip_path).map_err(|e| format!("打开 ZIP 文件失败: {}", e))?;
    let mut archive =
        zip::ZipArchive::new(zip_file).map_err(|e| format!("读取 ZIP 文件失败: {}", e))?;

    archive
        .extract(&extract_dir)
        .map_err(|e| format!("解压 ZIP 文件失败: {}", e))?;

    // 查找包含 SKILL.md 的目录
    let skill_dir = find_skill_directory(&extract_dir)
        .ok_or_else(|| "解压后未找到包含 SKILL.md 的目录".to_string())?;

    // 预检
    let manifest = parse_skill_directory(&skill_dir, "user")
        .await
        .ok_or("解压后的目录不是有效的 Skill 目录（缺少 SKILL.md 或格式错误）")?;

    let target_skills_dir = skills_dir.join(&manifest.name);

    if target_skills_dir.exists() {
        return Err(format!("技能 {} 已存在", manifest.name));
    }

    // 复制到目标目录
    fs::create_dir_all(target_skills_dir.parent().unwrap()).map_err(|e| e.to_string())?;

    let mut options = fs_extra::dir::CopyOptions::new();
    options.copy_inside = true;
    fs_extra::dir::copy(&skill_dir, target_skills_dir.parent().unwrap(), &options)
        .map_err(|e| format!("复制到技能目录失败: {}", e))?;

    // 清理临时目录（drop 时会自动清理）
    drop(temp_dir);

    Ok(manifest)
}

/// 递归查找包含 SKILL.md 的目录
fn find_skill_directory(base: &Path) -> Option<PathBuf> {
    // 先检查 base 目录本身
    if base.join("SKILL.md").exists() {
        return Some(base.to_path_buf());
    }

    // 检查 base 下的第一级子目录
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

/// 卸载 Skill（删除技能目录）
#[tauri::command]
pub async fn uninstall_skill(app: AppHandle, skill_id: String) -> Result<(), String> {
    // 1. 获取所有清单以定位路径
    let manifests = get_all_skill_manifests(app.clone(), None).await?;
    let manifest = manifests
        .iter()
        .find(|m| m.name == skill_id)
        .ok_or_else(|| format!("未找到技能: {}", skill_id))?;

    // 2. 权限检查：只允许删除 "user" 来源的技能
    if manifest.source != "user" {
        return Err("只能卸载用户安装的技能".to_string());
    }

    let base_path = PathBuf::from(&manifest.base_path);
    let app_data_dir = crate::get_app_data_dir(app.config());
    let user_skills_dir = app_data_dir.join("skills");

    // 3. 路径安全校验：确保在用户技能目录下
    if !base_path.starts_with(&user_skills_dir) {
        return Err("不支持的操作：试图删除系统或外部技能目录".to_string());
    }

    // 4. 执行删除
    if base_path.exists() {
        fs::remove_dir_all(&base_path).map_err(|e| format!("删除目录失败: {}", e))?;
    }

    Ok(())
}

/// 获取已知工具的默认全局路径列表（跨平台解析后）
#[tauri::command]
pub fn get_well_known_skill_paths() -> Vec<WellKnownPath> {
    let home = dirs_next::home_dir().unwrap_or_default();
    vec![
        WellKnownPath {
            id: "agents".to_string(),
            label: "通用跨平台标准 (Agents)".to_string(),
            default_path: home
                .join(".agents")
                .join("skills")
                .to_string_lossy()
                .to_string(),
        },
        WellKnownPath {
            id: "claude".to_string(),
            label: "Claude Code".to_string(),
            default_path: home
                .join(".claude")
                .join("skills")
                .to_string_lossy()
                .to_string(),
        },
        WellKnownPath {
            id: "cursor".to_string(),
            label: "Cursor".to_string(),
            default_path: home
                .join(".cursor")
                .join("skills")
                .to_string_lossy()
                .to_string(),
        },
        WellKnownPath {
            id: "gemini".to_string(),
            label: "Gemini CLI".to_string(),
            default_path: home
                .join(".gemini")
                .join("skills")
                .to_string_lossy()
                .to_string(),
        },
        WellKnownPath {
            id: "copilot".to_string(),
            label: "GitHub Copilot".to_string(),
            default_path: home
                .join(".copilot")
                .join("skills")
                .to_string_lossy()
                .to_string(),
        },
    ]
}
