//! Git 仓库分析工具
//!
//! 本模块主要使用 git2-rs 库来与 Git 仓库交互，避免对系统 git 命令的依赖。
//!
//! ## 已迁移到 git2 的功能
//! - 分支列表获取 (`get_branches`)
//! - 提交记录获取 (`get_commits`, `get_commits_with_skip`)
//! - 提交详情获取 (`git_get_commit_detail`)
//! - 提交标签获取 (`get_commit_tags`)
//! - 提交统计信息 (`get_commit_stats`)
//! - 文件变更列表 (`get_commit_files`)
//! - 提交总数统计 (`get_total_commits`)
//!
//! ## 保留 Command 调用的功能及原因
//! - `git_cherry_pick`: Cherry-pick 涉及工作区修改和复杂的冲突处理，使用 git2 实现较复杂
//! - `git_revert`: Revert 同样涉及工作区修改和冲突处理
//! - `git_format_log`: 支持用户自定义格式模板，git2 难以灵活实现

use chrono::TimeZone;
use git2::{BranchType, Oid, Repository};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Command;
use tauri::Emitter;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitCommit {
    pub hash: String,
    pub author: String,
    pub email: String,
    pub date: String,
    pub message: String,
    pub full_message: String,
    pub parents: Vec<String>,
    pub tags: Vec<String>,
    pub branches: Vec<String>,
    pub stats: Option<CommitStats>,
    pub files: Option<Vec<FileChange>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CommitStats {
    pub additions: u32,
    pub deletions: u32,
    pub files: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileChange {
    pub path: String,
    pub status: String,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitBranch {
    pub name: String,
    pub current: bool,
    pub remote: bool,
}

#[derive(Debug, Serialize)]
pub struct RepositoryInfo {
    pub branches: Vec<GitBranch>,
    pub commits: Vec<GitCommit>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum GitProgressEvent {
    Start {
        total: usize,
        branches: Vec<GitBranch>,
    },
    Data {
        commits: Vec<GitCommit>,
        loaded: usize,
    },
    End,
    Error {
        message: String,
    },
}

#[tauri::command]
pub async fn git_get_branches(path: String) -> Result<Vec<GitBranch>, String> {
    let repo_path = if path.is_empty() { "." } else { &path };
    get_branches(repo_path)
}

#[tauri::command]
pub async fn git_load_repository(path: String, limit: usize) -> Result<RepositoryInfo, String> {
    let repo_path = if path.is_empty() { "." } else { &path };

    // 获取分支列表
    let branches = get_branches(repo_path)?;

    // 获取提交记录（不包含文件列表以提高性能）
    let commits = get_commits(repo_path, None, limit, false)?;

    Ok(RepositoryInfo { branches, commits })
}

#[tauri::command]
pub async fn git_load_repository_stream(
    window: tauri::Window,
    path: String,
    limit: usize,
    batch_size: Option<usize>,
) -> Result<(), String> {
    let repo_path = if path.is_empty() {
        ".".to_string()
    } else {
        path.clone()
    };

    // 在后台启动加载任务
    tokio::spawn(async move {
        // 获取分支列表
        let branches = match get_branches(&repo_path) {
            Ok(b) => b,
            Err(e) => {
                let _ = window.emit(
                    "git-progress",
                    GitProgressEvent::Error {
                        message: format!("获取分支失败: {}", e),
                    },
                );
                return;
            }
        };

        // 获取总提交数
        let total = match get_total_commits(&repo_path, None) {
            Ok(t) => {
                if limit == 0 {
                    t
                } else {
                    t.min(limit)
                }
            }
            Err(e) => {
                let _ = window.emit(
                    "git-progress",
                    GitProgressEvent::Error {
                        message: format!("获取提交总数失败: {}", e),
                    },
                );
                return;
            }
        };

        // 发送开始事件
        let _ = window.emit(
            "git-progress",
            GitProgressEvent::Start {
                total,
                branches: branches.clone(),
            },
        );

        // 流式加载提交记录 - 使用配置的批次大小或默认值
        // 如果 batch_size 为 0，则视为非流式加载（最后一次性发送）
        let batch_size_val = batch_size.unwrap_or(200);
        let mut loaded = 0;

        let repo = match Repository::open(&repo_path) {
            Ok(r) => r,
            Err(e) => {
                let _ = window.emit(
                    "git-progress",
                    GitProgressEvent::Error {
                        message: format!("无法打开仓库: {}", e),
                    },
                );
                return;
            }
        };

        // 性能优化：预先获取所有 Tags 和 Branch Tips
        let tags_map = get_all_tags_map(&repo).unwrap_or_default();
        let branch_tips = get_branch_tips_map(&repo).unwrap_or_default();

        let revwalk = match repo.revwalk() {
            Ok(mut rw) => {
                let head_oid = match repo.head().and_then(|h| {
                    h.target()
                        .ok_or(git2::Error::from_str("HEAD has no target"))
                }) {
                    Ok(oid) => oid,
                    Err(e) => {
                        let _ = window.emit(
                            "git-progress",
                            GitProgressEvent::Error {
                                message: format!("获取 HEAD 失败: {}", e),
                            },
                        );
                        return;
                    }
                };
                let _ = rw.push(head_oid);
                let _ = rw.set_sorting(git2::Sort::TIME);
                rw
            }
            Err(e) => {
                let _ = window.emit(
                    "git-progress",
                    GitProgressEvent::Error {
                        message: format!("创建 revwalk 失败: {}", e),
                    },
                );
                return;
            }
        };

        let mut current_batch = Vec::with_capacity(if batch_size_val == 0 {
            total
        } else {
            batch_size_val
        });
        for oid_result in revwalk {
            if limit > 0 && loaded >= limit {
                break;
            }

            let oid = match oid_result {
                Ok(o) => o,
                Err(_) => continue,
            };

            if let Ok(commit) = parse_commit_optimized(&repo, oid, false, &tags_map, &branch_tips) {
                current_batch.push(commit);
                loaded += 1;

                // 只有在 batch_size_val > 0 时才进行流式发送
                if batch_size_val > 0 && current_batch.len() >= batch_size_val {
                    let _ = window.emit(
                        "git-progress",
                        GitProgressEvent::Data {
                            commits: current_batch.clone(),
                            loaded,
                        },
                    );
                    current_batch.clear();
                }
            }
        }

        // 发送剩余的 commit
        if !current_batch.is_empty() {
            let _ = window.emit(
                "git-progress",
                GitProgressEvent::Data {
                    commits: current_batch,
                    loaded,
                },
            );
        }

        // 发送完成事件
        let _ = window.emit("git-progress", GitProgressEvent::End);
    });

    Ok(())
}

#[tauri::command]
pub async fn git_get_branch_commits(
    path: String,
    branch: String,
    limit: usize,
) -> Result<Vec<GitCommit>, String> {
    let repo_path = if path.is_empty() { "." } else { &path };
    get_commits(repo_path, Some(&branch), limit, false)
}

#[tauri::command]
pub async fn git_get_incremental_commits(
    path: String,
    branch: Option<String>,
    skip: usize,
    limit: usize,
) -> Result<Vec<GitCommit>, String> {
    let repo_path = if path.is_empty() { "." } else { &path };
    get_commits_with_skip(repo_path, branch.as_deref(), skip, limit, false)
}

#[tauri::command]
pub async fn git_load_incremental_stream(
    window: tauri::Window,
    path: String,
    branch: Option<String>,
    skip: usize,
    limit: usize,
    batch_size: Option<usize>,
) -> Result<(), String> {
    let repo_path = if path.is_empty() {
        ".".to_string()
    } else {
        path.clone()
    };

    // 在后台启动增量加载任务
    tokio::spawn(async move {
        // 发送开始事件（增量加载不需要获取分支）
        let _ = window.emit(
            "git-progress",
            GitProgressEvent::Start {
                total: skip + limit,
                branches: vec![],
            },
        );

        // 流式加载增量提交记录
        let batch_size_val = batch_size.unwrap_or(200);
        let mut loaded = skip; // 从已加载的数量开始

        let repo = match Repository::open(&repo_path) {
            Ok(r) => r,
            Err(e) => {
                let _ = window.emit(
                    "git-progress",
                    GitProgressEvent::Error {
                        message: format!("无法打开仓库: {}", e),
                    },
                );
                return;
            }
        };

        // 性能优化：预先获取所有 Tags 和 Branch Tips
        let tags_map = get_all_tags_map(&repo).unwrap_or_default();
        let branch_tips = get_branch_tips_map(&repo).unwrap_or_default();

        let revwalk = match repo.revwalk() {
            Ok(mut rw) => {
                let start_oid = if let Some(ref b) = branch {
                    repo.find_reference(&format!("refs/heads/{}", b))
                        .or_else(|_| repo.find_reference(&format!("refs/remotes/origin/{}", b)))
                        .or_else(|_| repo.find_reference(b))
                        .ok()
                        .and_then(|r| r.target())
                } else {
                    repo.head().ok().and_then(|h| h.target())
                };

                let oid = match start_oid {
                    Some(o) => o,
                    None => {
                        let _ = window.emit(
                            "git-progress",
                            GitProgressEvent::Error {
                                message: "找不到起始提交".to_string(),
                            },
                        );
                        return;
                    }
                };

                if let Err(e) = rw.push(oid) {
                    let _ = window.emit(
                        "git-progress",
                        GitProgressEvent::Error {
                            message: format!("Revwalk push 失败: {}", e),
                        },
                    );
                    return;
                }
                let _ = rw.set_sorting(git2::Sort::TIME);
                rw
            }
            Err(e) => {
                let _ = window.emit(
                    "git-progress",
                    GitProgressEvent::Error {
                        message: format!("创建 revwalk 失败: {}", e),
                    },
                );
                return;
            }
        };

        // Skip 到起始位置
        let mut skipped = 0;
        let mut it = revwalk.into_iter();
        while skipped < skip {
            if it.next().is_none() {
                break;
            }
            skipped += 1;
        }

        let mut current_batch = Vec::with_capacity(if batch_size_val == 0 {
            limit
        } else {
            batch_size_val
        });
        for oid_result in it {
            if loaded >= skip + limit {
                break;
            }

            if let Ok(oid) = oid_result {
                if let Ok(commit) =
                    parse_commit_optimized(&repo, oid, false, &tags_map, &branch_tips)
                {
                    current_batch.push(commit);
                    loaded += 1;

                    if batch_size_val > 0 && current_batch.len() >= batch_size_val {
                        let _ = window.emit(
                            "git-progress",
                            GitProgressEvent::Data {
                                commits: current_batch.clone(),
                                loaded,
                            },
                        );
                        current_batch.clear();
                    }
                }
            }
        }

        // 发送剩余数据
        if !current_batch.is_empty() {
            let _ = window.emit(
                "git-progress",
                GitProgressEvent::Data {
                    commits: current_batch,
                    loaded,
                },
            );
        }

        // 发送完成事件
        let _ = window.emit("git-progress", GitProgressEvent::End);
    });

    Ok(())
}

#[tauri::command]
pub async fn git_load_commits_with_files(
    path: String,
    branch: Option<String>,
    limit: usize,
) -> Result<Vec<GitCommit>, String> {
    let repo_path = if path.is_empty() { "." } else { &path };
    get_commits(repo_path, branch.as_deref(), limit, true)
}

#[tauri::command]
pub async fn git_get_commit_detail(path: String, hash: String) -> Result<GitCommit, String> {
    let repo_path = if path.is_empty() { "." } else { &path };

    let repo =
        Repository::open(repo_path).map_err(|e| format!("Failed to open repository: {}", e))?;

    let oid = Oid::from_str(&hash).map_err(|e| format!("Invalid commit hash: {}", e))?;

    parse_commit(&repo, oid, true)
}

#[tauri::command]
pub async fn git_cherry_pick(path: String, hash: String) -> Result<String, String> {
    let repo_path = if path.is_empty() { "." } else { &path };

    let mut cmd = Command::new("git");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let output = cmd
        .arg("-C")
        .arg(repo_path)
        .arg("cherry-pick")
        .arg(&hash)
        .output()
        .map_err(|e| format!("Failed to cherry-pick: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(format!("Successfully cherry-picked commit {}", hash))
}

#[tauri::command]
pub async fn git_revert(path: String, hash: String) -> Result<String, String> {
    let repo_path = if path.is_empty() { "." } else { &path };

    let mut cmd = Command::new("git");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let output = cmd
        .arg("-C")
        .arg(repo_path)
        .arg("revert")
        .arg("--no-edit")
        .arg(&hash)
        .output()
        .map_err(|e| format!("Failed to revert: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(format!("Successfully reverted commit {}", hash))
}

#[tauri::command]
pub async fn git_export_commits(commits: Vec<GitCommit>, format: String) -> Result<String, String> {
    match format.as_str() {
        "json" => serde_json::to_string_pretty(&commits)
            .map_err(|e| format!("Failed to serialize to JSON: {}", e)),
        "csv" => {
            let mut csv = String::from("Hash,Author,Email,Date,Message\n");
            for commit in commits {
                csv.push_str(&format!(
                    "\"{}\",\"{}\",\"{}\",\"{}\",\"{}\"\n",
                    commit.hash,
                    commit.author,
                    commit.email,
                    commit.date,
                    commit.message.replace("\"", "\"\"")
                ));
            }
            Ok(csv)
        }
        "markdown" => {
            let mut md = String::from("# Git Commits\n\n");
            for commit in commits {
                md.push_str(&format!(
                    "## {} - {}\n\n**Author:** {} <{}>\n**Date:** {}\n\n{}\n\n---\n\n",
                    &commit.hash[0..7],
                    commit.message,
                    commit.author,
                    commit.email,
                    commit.date,
                    commit.full_message
                ));
            }
            Ok(md)
        }
        "html" => {
            let mut html = String::from(
                r#"<!DOCTYPE html>
<html>
<head>
    <title>Git Commits</title>
    <style>
        body { font-family: monospace; padding: 20px; }
        .commit { margin-bottom: 20px; padding: 10px; border: 1px solid #ddd; }
        .hash { color: #0366d6; font-weight: bold; }
        .author { color: #586069; }
        .date { color: #6a737d; }
        .message { margin-top: 10px; }
    </style>
</head>
<body>
    <h1>Git Commits</h1>
"#,
            );

            for commit in commits {
                html.push_str(&format!(
                    r#"<div class="commit">
                        <span class="hash">{}</span>
                        <span class="author">{}</span>
                        <span class="date">{}</span>
                        <div class="message">{}</div>
                    </div>"#,
                    &commit.hash[0..7],
                    commit.author,
                    commit.date,
                    commit.message
                ));
            }

            html.push_str("</body></html>");
            Ok(html)
        }
        _ => Err(format!("Unsupported format: {}", format)),
    }
}

#[tauri::command]
pub async fn git_update_commit_message(
    path: String,
    hash: String,
    message: String,
) -> Result<String, String> {
    let repo_path = if path.is_empty() { "." } else { &path };

    // 检查是否是 HEAD
    let repo = Repository::open(repo_path).map_err(|e| format!("无法打开仓库: {}", e))?;

    let head = repo.head().map_err(|e| format!("获取 HEAD 失败: {}", e))?;
    let head_oid = head.target().ok_or("HEAD 没有指向任何提交")?;

    if head_oid.to_string() == hash {
        // 是 HEAD，使用 commit --amend
        let mut cmd = Command::new("git");
        #[cfg(target_os = "windows")]
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

        let output = cmd
            .arg("-C")
            .arg(repo_path)
            .arg("commit")
            .arg("--amend")
            .arg("-m")
            .arg(&message)
            .output()
            .map_err(|e| format!("执行 git commit --amend 失败: {}", e))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }

        Ok("成功修改最近一次提交的消息".to_string())
    } else {
        // 不是 HEAD，目前暂不支持修改历史提交消息
        Err("目前仅支持修改最近一次提交的消息 (HEAD)。修改历史提交涉及重写历史，风险较高，建议使用命令行进行交互式 rebase。".to_string())
    }
}

#[tauri::command]
pub async fn git_format_log(
    path: String,
    template: String,
    limit: usize,
) -> Result<String, String> {
    let repo_path = if path.is_empty() { "." } else { &path };

    let mut cmd = Command::new("git");
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let output = cmd
        .arg("-C")
        .arg(repo_path)
        .arg("log")
        .arg(format!("--pretty=format:{}", template))
        .arg(format!("-{}", limit))
        .output()
        .map_err(|e| format!("Failed to format log: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

// 辅助函数
fn get_branches(repo_path: &str) -> Result<Vec<GitBranch>, String> {
    let repo =
        Repository::open(repo_path).map_err(|e| format!("Failed to open repository: {}", e))?;

    let mut branches = Vec::new();

    // 获取当前分支
    let head = repo.head().ok();
    let current_branch = head
        .as_ref()
        .and_then(|h| h.shorthand())
        .map(|s| s.to_string());

    // 获取本地分支
    let local_branches = repo
        .branches(Some(BranchType::Local))
        .map_err(|e| format!("Failed to get local branches: {}", e))?;

    for branch_result in local_branches {
        let (branch, _) = branch_result.map_err(|e| format!("Failed to read branch: {}", e))?;
        if let Some(name) = branch
            .name()
            .map_err(|e| format!("Invalid branch name: {}", e))?
        {
            let is_current = current_branch.as_ref().map(|c| c == name).unwrap_or(false);
            branches.push(GitBranch {
                name: name.to_string(),
                current: is_current,
                remote: false,
            });
        }
    }

    // 获取远程分支
    let remote_branches = repo
        .branches(Some(BranchType::Remote))
        .map_err(|e| format!("Failed to get remote branches: {}", e))?;

    for branch_result in remote_branches {
        let (branch, _) = branch_result.map_err(|e| format!("Failed to read branch: {}", e))?;
        if let Some(name) = branch
            .name()
            .map_err(|e| format!("Invalid branch name: {}", e))?
        {
            // 移除 "origin/" 前缀
            let clean_name = name.strip_prefix("origin/").unwrap_or(name);
            branches.push(GitBranch {
                name: clean_name.to_string(),
                current: false,
                remote: true,
            });
        }
    }

    Ok(branches)
}

fn get_commits(
    repo_path: &str,
    branch: Option<&str>,
    limit: usize,
    include_files: bool,
) -> Result<Vec<GitCommit>, String> {
    get_commits_with_skip(repo_path, branch, 0, limit, include_files)
}

fn get_commits_with_skip(
    repo_path: &str,
    branch: Option<&str>,
    skip: usize,
    limit: usize,
    include_files: bool,
) -> Result<Vec<GitCommit>, String> {
    let repo =
        Repository::open(repo_path).map_err(|e| format!("Failed to open repository: {}", e))?;

    // 获取起始提交的 OID
    let start_oid = if let Some(branch_name) = branch {
        // 尝试查找分支
        let reference = repo
            .find_reference(&format!("refs/heads/{}", branch_name))
            .or_else(|_| repo.find_reference(&format!("refs/remotes/origin/{}", branch_name)))
            .or_else(|_| repo.find_reference(branch_name))
            .map_err(|e| format!("Failed to find branch '{}': {}", branch_name, e))?;

        reference
            .target()
            .ok_or_else(|| format!("Branch '{}' has no target", branch_name))?
    } else {
        // 使用 HEAD
        repo.head()
            .map_err(|e| format!("Failed to get HEAD: {}", e))?
            .target()
            .ok_or_else(|| "HEAD has no target".to_string())?
    };

    // 创建 revwalk
    let mut revwalk = repo
        .revwalk()
        .map_err(|e| format!("Failed to create revwalk: {}", e))?;

    revwalk
        .push(start_oid)
        .map_err(|e| format!("Failed to push starting commit: {}", e))?;

    // 设置排序方式（按时间倒序）
    revwalk
        .set_sorting(git2::Sort::TIME)
        .map_err(|e| format!("Failed to set sorting: {}", e))?;

    // 性能优化：预先获取所有 Tags 和 Branch Tips
    let tags_map = get_all_tags_map(&repo).unwrap_or_default();
    let branch_tips = get_branch_tips_map(&repo).unwrap_or_default();

    let mut commits = Vec::new();
    let mut count = 0;

    for oid_result in revwalk {
        let oid = oid_result.map_err(|e| format!("Failed to read commit OID: {}", e))?;

        // 跳过前面的提交
        if count < skip {
            count += 1;
            continue;
        }

        // 如果已经达到 limit，停止 (limit 为 0 表示不限制)
        if limit > 0 && commits.len() >= limit {
            break;
        }

        if let Ok(commit) =
            parse_commit_optimized(&repo, oid, include_files, &tags_map, &branch_tips)
        {
            commits.push(commit);
        }

        count += 1;
    }

    Ok(commits)
}

fn parse_commit(repo: &Repository, oid: Oid, include_files: bool) -> Result<GitCommit, String> {
    let tags_map = get_all_tags_map(repo).unwrap_or_default();
    let branch_tips = get_branch_tips_map(repo).unwrap_or_default();
    parse_commit_optimized(repo, oid, include_files, &tags_map, &branch_tips)
}

fn parse_commit_optimized(
    repo: &Repository,
    oid: Oid,
    include_files: bool,
    tags_map: &HashMap<Oid, Vec<String>>,
    branch_tips: &HashMap<Oid, Vec<String>>,
) -> Result<GitCommit, String> {
    let commit = repo
        .find_commit(oid)
        .map_err(|e| format!("Failed to find commit {}: {}", oid, e))?;

    // 获取作者信息
    let author = commit.author();
    let author_name = author.name().unwrap_or("Unknown").to_string();
    let author_email = author.email().unwrap_or("").to_string();

    // 获取时间（转换为 ISO 8601 格式）
    let time = commit.time();
    let offset = chrono::FixedOffset::east_opt(time.offset_minutes() * 60)
        .ok_or_else(|| "Invalid timezone offset".to_string())?;
    let datetime_with_tz = offset
        .timestamp_opt(time.seconds(), 0)
        .single()
        .ok_or_else(|| "Invalid timestamp".to_string())?;
    let date_str = datetime_with_tz.to_rfc3339();

    // 获取提交消息
    let message = commit.message().unwrap_or("").to_string();
    let (subject, body) = if let Some(pos) = message.find('\n') {
        let subject = message[..pos].trim().to_string();
        let body = message[pos + 1..].trim().to_string();
        (subject, body)
    } else {
        (message.trim().to_string(), String::new())
    };

    // 获取父提交
    let parents: Vec<String> = commit.parents().map(|p| p.id().to_string()).collect();

    let hash = oid.to_string();

    // 获取 tags (从预计算的 Map 中获取，极快)
    let tags = tags_map.get(&oid).cloned().unwrap_or_default();

    // 获取 branches
    let branches = if let Some(tips) = branch_tips.get(&oid) {
        tips.clone()
    } else {
        // 如果不是 Tip，则使用启发式规则查找（这里可以根据性能需求决定是否开启）
        get_commit_branches_optimized(repo, oid, branch_tips).unwrap_or_default()
    };

    // 获取 stats 和 files
    let (stats, files) = if include_files {
        let (s, f) = get_commit_diff_info(repo, &commit)?;
        (Some(s), Some(f))
    } else {
        // 优化：在列表模式下，不获取 stats 以大幅提速
        (None, None)
    };

    Ok(GitCommit {
        hash,
        author: author_name,
        email: author_email,
        date: date_str,
        message: subject.clone(),
        full_message: if body.is_empty() {
            subject
        } else {
            format!("{}\n\n{}", subject, body)
        },
        parents,
        tags,
        branches,
        stats,
        files,
    })
}

// 预先获取所有 Tags 的 Map
fn get_all_tags_map(repo: &Repository) -> Result<HashMap<Oid, Vec<String>>, String> {
    let mut tags_map: HashMap<Oid, Vec<String>> = HashMap::new();

    repo.tag_foreach(|tag_oid, name| {
        if let Some(tag_name) = std::str::from_utf8(name)
            .ok()
            .and_then(|s| s.strip_prefix("refs/tags/"))
        {
            if let Ok(obj) = repo.find_object(tag_oid, None) {
                let target_oid = match obj.kind() {
                    Some(git2::ObjectType::Commit) => Some(obj.id()),
                    Some(git2::ObjectType::Tag) => obj.as_tag().map(|t| t.target_id()),
                    _ => None,
                };

                if let Some(oid) = target_oid {
                    tags_map.entry(oid).or_default().push(tag_name.to_string());
                }
            }
        }
        true
    })
    .map_err(|e| format!("Failed to iterate tags: {}", e))?;

    Ok(tags_map)
}

// 预先获取所有分支 Tip 的 Map
fn get_branch_tips_map(repo: &Repository) -> Result<HashMap<Oid, Vec<String>>, String> {
    let mut tips_map: HashMap<Oid, Vec<String>> = HashMap::new();

    // 本地分支
    if let Ok(branches) = repo.branches(Some(BranchType::Local)) {
        for (branch, _) in branches.flatten() {
            if let (Some(name), Ok(commit)) =
                (branch.name().ok().flatten(), branch.get().peel_to_commit())
            {
                tips_map
                    .entry(commit.id())
                    .or_default()
                    .push(name.to_string());
            }
        }
    }

    // 远程分支
    if let Ok(branches) = repo.branches(Some(BranchType::Remote)) {
        for (branch, _) in branches.flatten() {
            if let (Some(name), Ok(commit)) =
                (branch.name().ok().flatten(), branch.get().peel_to_commit())
            {
                let clean_name = name.strip_prefix("origin/").unwrap_or(name);
                tips_map
                    .entry(commit.id())
                    .or_default()
                    .push(clean_name.to_string());
            }
        }
    }

    Ok(tips_map)
}

// 优化的分支查找逻辑
fn get_commit_branches_optimized(
    repo: &Repository,
    commit_oid: Oid,
    branch_tips: &HashMap<Oid, Vec<String>>,
) -> Result<Vec<String>, String> {
    // 收集所有包含该提交的分支
    let mut all_branches: Vec<(String, bool)> = Vec::new();

    // 只需要检查那些 Tip 提交是当前提交后代的分支
    for (tip_oid, names) in branch_tips {
        if *tip_oid == commit_oid
            || repo
                .graph_descendant_of(*tip_oid, commit_oid)
                .unwrap_or(false)
        {
            for name in names {
                let is_remote = name.contains('/'); // 简单的启发式判断
                all_branches.push((name.clone(), is_remote));
            }
        }
    }

    if all_branches.len() <= 2 {
        return Ok(all_branches.into_iter().map(|(name, _)| name).collect());
    }

    Ok(filter_most_relevant_branches(all_branches))
}

// 启发式规则：筛选最相关的分支
fn filter_most_relevant_branches(all_branches: Vec<(String, bool)>) -> Vec<String> {
    // 主干分支列表（优先级从低到高）
    let main_branch_patterns = [
        "origin/HEAD",
        "origin/master",
        "origin/main",
        "master",
        "main",
        "origin/develop",
        "origin/dev",
        "develop",
        "dev",
    ];

    // 1. 优先查找功能分支（非主干分支）
    let feature_branches: Vec<_> = all_branches
        .iter()
        .filter(|(name, _)| {
            // 排除主干分支
            !main_branch_patterns
                .iter()
                .any(|pattern| name == pattern || name.ends_with(pattern))
        })
        .collect();

    if !feature_branches.is_empty() {
        // 2. 在功能分支中，优先选择本地分支
        if let Some((name, _)) = feature_branches.iter().find(|(_, is_remote)| !is_remote) {
            return vec![name.clone()];
        }

        // 3. 如果没有本地功能分支，选择远程功能分支
        // 优先选择最长的分支名（通常更具体，如 feature/login > feature）
        let mut sorted_features = feature_branches.clone();
        sorted_features.sort_by(|a, b| b.0.len().cmp(&a.0.len()));

        // 最多返回2个最相关的功能分支
        return sorted_features
            .iter()
            .take(2)
            .map(|(name, _)| name.clone())
            .collect();
    }

    // 4. 如果都是主干分支，按优先级返回（develop > main > master）
    for pattern in main_branch_patterns.iter().rev() {
        if let Some((name, _)) = all_branches
            .iter()
            .find(|(name, _)| name == pattern || name.ends_with(pattern))
        {
            return vec![name.clone()];
        }
    }

    // 5. 兜底：返回前2个分支
    all_branches
        .into_iter()
        .take(2)
        .map(|(name, _)| name)
        .collect()
}

// git2 版本的获取 tags
fn get_commit_tags_git2(repo: &Repository, oid: Oid) -> Result<Vec<String>, String> {
    let mut tags = Vec::new();

    repo.tag_foreach(|tag_oid, name| {
        // name 是 refs/tags/xxx 格式
        if let Some(tag_name) = name.strip_prefix(b"refs/tags/") {
            // 尝试解析标签
            if let Ok(tag_obj) = repo.find_object(tag_oid, None) {
                // 检查是否是轻量标签
                if tag_obj.id() == oid {
                    if let Ok(name_str) = std::str::from_utf8(tag_name) {
                        tags.push(name_str.to_string());
                    } else if let Some(tag) = tag_obj.as_tag() {
                        // 附注标签
                        let target_oid = tag.target_id();
                        if target_oid == oid {
                            if let Ok(name_str) = std::str::from_utf8(tag_name) {
                                tags.push(name_str.to_string());
                            }
                        }
                    }
                }
            }
        }
        true // 继续迭代
    })
    .map_err(|e| format!("Failed to iterate tags: {}", e))?;

    Ok(tags)
}

// 保留旧版本的 get_commit_tags 用于向后兼容
#[allow(dead_code)]
fn get_commit_tags(repo_path: &str, hash: &str) -> Result<Vec<String>, String> {
    let repo =
        Repository::open(repo_path).map_err(|e| format!("Failed to open repository: {}", e))?;
    let oid = Oid::from_str(hash).map_err(|e| format!("Invalid commit hash: {}", e))?;
    get_commit_tags_git2(&repo, oid)
}

// git2 版本的获取 commit stats
fn get_commit_stats_git2(repo: &Repository, commit: &git2::Commit) -> Result<CommitStats, String> {
    let (stats, _) = get_commit_diff_info(repo, commit)?;
    Ok(stats)
}

// 获取提交的 diff 信息（stats 和 files）
fn get_commit_diff_info(
    repo: &Repository,
    commit: &git2::Commit,
) -> Result<(CommitStats, Vec<FileChange>), String> {
    let a = if commit.parents().len() > 0 {
        let parent = commit
            .parent(0)
            .map_err(|e| format!("Failed to get parent: {}", e))?;
        Some(
            parent
                .tree()
                .map_err(|e| format!("Failed to get parent tree: {}", e))?,
        )
    } else {
        None
    };

    let b = commit
        .tree()
        .map_err(|e| format!("Failed to get commit tree: {}", e))?;

    let diff = repo
        .diff_tree_to_tree(a.as_ref(), Some(&b), None)
        .map_err(|e| format!("Failed to create diff: {}", e))?;

    let stats = diff
        .stats()
        .map_err(|e| format!("Failed to get diff stats: {}", e))?;

    let commit_stats = CommitStats {
        additions: stats.insertions() as u32,
        deletions: stats.deletions() as u32,
        files: stats.files_changed() as u32,
    };

    let mut files = Vec::new();
    diff.foreach(
        &mut |delta, _| {
            let status = match delta.status() {
                git2::Delta::Added => "A",
                git2::Delta::Deleted => "D",
                git2::Delta::Modified => "M",
                git2::Delta::Renamed => "R",
                git2::Delta::Copied => "C",
                git2::Delta::Typechange => "T",
                _ => "U",
            };

            if let Some(path) = delta.new_file().path() {
                if let Some(path_str) = path.to_str() {
                    files.push(FileChange {
                        path: path_str.to_string(),
                        status: status.to_string(),
                        additions: 0, // 将在 line callback 中更新
                        deletions: 0,
                    });
                }
            }
            true
        },
        None,
        None,
        None,
    )
    .map_err(|e| format!("Failed to foreach diff: {}", e))?;

    // 获取每个文件的详细统计
    let mut file_stats: std::collections::HashMap<String, (u32, u32)> =
        std::collections::HashMap::new();

    // 先收集所有文件路径
    diff.foreach(
        &mut |delta, _| {
            if let Some(path) = delta.new_file().path() {
                if let Some(path_str) = path.to_str() {
                    file_stats.insert(path_str.to_string(), (0, 0));
                }
            }
            true
        },
        None,
        None,
        None,
    )
    .map_err(|e| format!("Failed to collect file paths: {}", e))?;

    // 然后统计每个文件的行变更
    diff.print(git2::DiffFormat::Patch, |delta, _hunk, line| {
        if let Some(path) = delta.new_file().path() {
            if let Some(path_str) = path.to_str() {
                if let Some(entry) = file_stats.get_mut(path_str) {
                    match line.origin() {
                        '+' => entry.0 += 1,
                        '-' => entry.1 += 1,
                        _ => {}
                    }
                }
            }
        }
        true
    })
    .map_err(|e| format!("Failed to get line stats: {}", e))?;

    // 更新文件的增删统计
    for file in &mut files {
        if let Some((adds, dels)) = file_stats.get(&file.path) {
            file.additions = *adds;
            file.deletions = *dels;
        }
    }

    Ok((commit_stats, files))
}

// 保留旧版本的函数用于向后兼容
#[allow(dead_code)]
fn get_commit_stats(repo_path: &str, hash: &str) -> Result<CommitStats, String> {
    let repo =
        Repository::open(repo_path).map_err(|e| format!("Failed to open repository: {}", e))?;
    let oid = Oid::from_str(hash).map_err(|e| format!("Invalid commit hash: {}", e))?;
    let commit = repo
        .find_commit(oid)
        .map_err(|e| format!("Failed to find commit: {}", e))?;
    get_commit_stats_git2(&repo, &commit)
}

// 保留旧版本的函数用于向后兼容
#[allow(dead_code)]
fn get_commit_files(repo_path: &str, hash: &str) -> Result<Vec<FileChange>, String> {
    let repo =
        Repository::open(repo_path).map_err(|e| format!("Failed to open repository: {}", e))?;
    let oid = Oid::from_str(hash).map_err(|e| format!("Invalid commit hash: {}", e))?;
    let commit = repo
        .find_commit(oid)
        .map_err(|e| format!("Failed to find commit: {}", e))?;
    let (_, files) = get_commit_diff_info(&repo, &commit)?;
    Ok(files)
}

fn get_total_commits(repo_path: &str, branch: Option<&str>) -> Result<usize, String> {
    let repo =
        Repository::open(repo_path).map_err(|e| format!("Failed to open repository: {}", e))?;

    // 获取起始提交的 OID
    let start_oid = if let Some(branch_name) = branch {
        let reference = repo
            .find_reference(&format!("refs/heads/{}", branch_name))
            .or_else(|_| repo.find_reference(&format!("refs/remotes/origin/{}", branch_name)))
            .or_else(|_| repo.find_reference(branch_name))
            .map_err(|e| format!("Failed to find branch '{}': {}", branch_name, e))?;

        reference
            .target()
            .ok_or_else(|| format!("Branch '{}' has no target", branch_name))?
    } else {
        repo.head()
            .map_err(|e| format!("Failed to get HEAD: {}", e))?
            .target()
            .ok_or_else(|| "HEAD has no target".to_string())?
    };

    // 创建 revwalk 并计数
    let mut revwalk = repo
        .revwalk()
        .map_err(|e| format!("Failed to create revwalk: {}", e))?;

    revwalk
        .push(start_oid)
        .map_err(|e| format!("Failed to push starting commit: {}", e))?;

    Ok(revwalk.count())
}
