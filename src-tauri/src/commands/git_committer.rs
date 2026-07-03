// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

//! Git 提交助手 (AI Committer)
//!
//! 基于 git2-rs 原生实现 Stage / Commit / 文件 Diff 提取与仓库状态获取，
//! Push / Pull 回退到系统 git 命令行以处理凭据与代理。
//!
//! 与 `git_analyzer` 的关系：
//! - `git_analyzer` 偏只读历史分析，本模块偏写操作工作流。
//! - `delta_status_str`（git_analyzer.rs:1349）是私有且入参为 `git2::Delta`，
//!   与本模块基于 `git2::Status`（位标志）语义不匹配，故自行实现状态字符映射。

use git2::{BranchType, Oid, Repository, Status};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::Duration;
use tauri::AppHandle;
use tokio::process::Command;

/// 限制文本 Diff 读取的最大文件大小（1MB），防止大文件导致 IPC 崩溃或内存暴涨
const MAX_DIFF_FILE_SIZE: u64 = 1024 * 1024;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RepoStatus {
    pub branch: String,
    pub staged: Vec<FileStatus>,
    pub unstaged: Vec<FileStatus>,
    pub ahead: usize,
    pub behind: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileStatus {
    pub path: String,
    /// 短格式："M" | "A" | "D" | "U" | "R" | "C" | "T"
    pub status: String,
    pub is_binary: bool,
}

/// 将 `git2::Status`（位标志）转换为短状态字符。
///
/// 优先判定 INDEX_*（暂存区）再判 WT_*（工作区），与 git 行为一致。
/// 注意 `git2::Status` 是 bitflags，使用 `contains`。
/// 注：git2 0.20 的 `Status` 无 `INDEX_COPIED` / `WT_COPIED` 变体，Copied 合并在 Renamed 中。
fn status_to_short(status: Status) -> &'static str {
    // 暂存区状态优先（用于 staged 列表）
    if status.contains(Status::INDEX_NEW) {
        "A"
    } else if status.contains(Status::INDEX_MODIFIED) {
        "M"
    } else if status.contains(Status::INDEX_DELETED) {
        "D"
    } else if status.contains(Status::INDEX_RENAMED) {
        "R"
    } else if status.contains(Status::INDEX_TYPECHANGE) {
        "T"
    } else if status.contains(Status::WT_NEW) {
        "A"
    } else if status.contains(Status::WT_MODIFIED) {
        "M"
    } else if status.contains(Status::WT_DELETED) {
        "D"
    } else if status.contains(Status::WT_RENAMED) {
        "R"
    } else if status.contains(Status::WT_TYPECHANGE) {
        "T"
    } else {
        // CONFLICTED 及其他未识别状态统一归为 U
        "U"
    }
}

/// 判定一个状态是否属于「暂存区」（INDEX_*）。
fn is_staged_status(status: Status) -> bool {
    status.intersects(
        Status::INDEX_NEW
            | Status::INDEX_MODIFIED
            | Status::INDEX_DELETED
            | Status::INDEX_RENAMED
            | Status::INDEX_TYPECHANGE,
    )
}

/// 判定一个状态是否属于「工作区」（WT_*）。
fn is_unstaged_status(status: Status) -> bool {
    status.intersects(
        Status::WT_NEW
            | Status::WT_MODIFIED
            | Status::WT_DELETED
            | Status::WT_RENAMED
            | Status::WT_TYPECHANGE,
    ) || status.contains(Status::CONFLICTED)
}

/// 判定文件是否为二进制：复用 `crate::utils::mime::is_text_file`，取反。
fn is_binary_file(workdir: &Path, file_path: &str) -> bool {
    let full = workdir.join(file_path);
    !crate::utils::mime::is_text_file(&full)
}

/// 打开仓库，返回 `Repository`，失败返回中文友好错误。
fn open_repo(path: &str) -> Result<Repository, String> {
    let repo_path = if path.is_empty() { "." } else { path };
    Repository::open(repo_path).map_err(|e| format!("无法打开仓库 {}: {}", repo_path, e))
}

/// 获取仓库工作区根目录（`repo.workdir()`），失败回退到传入路径。
fn repo_workdir(repo: &Repository, fallback: &str) -> std::path::PathBuf {
    repo.workdir().map(|p| p.to_path_buf()).unwrap_or_else(|| {
        Path::new(if fallback.is_empty() { "." } else { fallback }).to_path_buf()
    })
}

/// 获取仓库状态：分支名、暂存/未暂存文件列表、ahead/behind。
#[tauri::command]
pub async fn git_get_repo_status(path: String) -> Result<RepoStatus, String> {
    let repo = open_repo(&path)?;
    let workdir = repo_workdir(&repo, &path);

    // 当前分支名（detached HEAD 时返回 commit 短哈希）
    let branch = match repo.head() {
        Ok(head) => head
            .shorthand()
            .map(|s| s.to_string())
            .unwrap_or_else(|| "(detached)".to_string()),
        Err(_) => "(no HEAD)".to_string(),
    };

    // 文件状态分桶
    let statuses = repo
        .statuses(None)
        .map_err(|e| format!("获取仓库状态失败: {}", e))?;

    let mut staged: Vec<FileStatus> = Vec::new();
    let mut unstaged: Vec<FileStatus> = Vec::new();

    for entry in statuses.iter() {
        let st = entry.status();
        let file_path = entry.path().unwrap_or("").to_string();
        if file_path.is_empty() {
            continue;
        }
        let binary = is_binary_file(&workdir, &file_path);
        let short = status_to_short(st);

        if is_staged_status(st) {
            staged.push(FileStatus {
                path: file_path.clone(),
                status: short.to_string(),
                is_binary: binary,
            });
        }
        if is_unstaged_status(st) {
            unstaged.push(FileStatus {
                path: file_path.clone(),
                status: short.to_string(),
                is_binary: binary,
            });
        }
    }

    // ahead / behind：通过本地分支的 upstream 计算
    let (ahead, behind) = compute_ahead_behind(&repo);

    Ok(RepoStatus {
        branch,
        staged,
        unstaged,
        ahead,
        behind,
    })
}

/// 计算本地分支与其 upstream 之间的 ahead/behind。
///
/// 流程：head reference → shorthand 取分支名 → `find_branch(name, Local)`
/// → `branch.upstream()` → `target()` 拿 upstream oid → `graph_ahead_behind`。
/// 任一步骤失败（无 upstream 等）均归零。
fn compute_ahead_behind(repo: &Repository) -> (usize, usize) {
    let head = match repo.head() {
        Ok(h) => h,
        Err(_) => return (0, 0),
    };
    let local_oid = match head.target() {
        Some(oid) => oid,
        None => return (0, 0),
    };
    // detached HEAD 时 shorthand 是 commit 哈希，find_branch 会失败 → 归零
    let branch_name = match head.shorthand() {
        Some(s) if !s.is_empty() => s,
        _ => return (0, 0),
    };
    let local_branch = match repo.find_branch(branch_name, BranchType::Local) {
        Ok(b) => b,
        Err(_) => return (0, 0),
    };
    let upstream = match local_branch.upstream() {
        Ok(u) => u,
        Err(_) => return (0, 0),
    };
    let upstream_oid = match upstream.get().target() {
        Some(oid) => oid,
        None => return (0, 0),
    };
    repo.graph_ahead_behind(local_oid, upstream_oid)
        .unwrap_or((0, 0))
}

/// 从 HEAD 的 tree 中读取指定文件内容，不存在返回 None。
fn read_blob_from_head(repo: &Repository, file_path: &str) -> Option<String> {
    let head = repo.head().ok()?;
    let tree = head.peel_to_tree().ok()?;
    let entry = tree.get_path(Path::new(file_path)).ok()?;
    let blob = repo.find_blob(entry.id()).ok()?;
    // 二进制保护由调用方在进入此函数前完成；此处仅做 utf8 lossy
    Some(String::from_utf8_lossy(blob.content()).to_string())
}

/// 从 Index 中读取指定文件内容，不存在返回 None。
fn read_blob_from_index(repo: &Repository, file_path: &str) -> Option<String> {
    let index = repo.index().ok()?;
    let oid = index.get_path(Path::new(file_path), 0)?.id;
    let blob = repo.find_blob(oid).ok()?;
    Some(String::from_utf8_lossy(blob.content()).to_string())
}

/// 获取单个文件的 Diff 原始与修改后文本，返回 `(original, modified)`。
///
/// - `is_staged = true`：对比 HEAD 与 Index。
/// - `is_staged = false`：对比 Index 与工作区。
///
/// 二进制文件直接返回错误，避免大文件或乱码导致 IPC 崩溃。
#[tauri::command]
pub async fn git_get_file_diff(
    path: String,
    file_path: String,
    is_staged: bool,
) -> Result<(String, String), String> {
    let repo = open_repo(&path)?;
    let repo_path = repo_workdir(&repo, &path);

    // 二进制保护：先判定，避免读取大文件
    if is_binary_file(&repo_path, &file_path) {
        return Err(format!("二进制文件，无法查看文本差异: {}", file_path));
    }

    if is_staged {
        // HEAD vs Index
        let original = read_blob_from_head(&repo, &file_path).unwrap_or_default();
        let modified = read_blob_from_index(&repo, &file_path).unwrap_or_default();
        Ok((original, modified))
    } else {
        // Index vs 工作区
        let original = read_blob_from_index(&repo, &file_path)
            .or_else(|| read_blob_from_head(&repo, &file_path))
            .unwrap_or_default();
        let abs = repo_path.join(&file_path);

        // 限制读取的文件大小，防止大文件导致内存暴涨
        if let Ok(metadata) = std::fs::metadata(&abs) {
            if metadata.len() > MAX_DIFF_FILE_SIZE {
                return Err(format!(
                    "文件过大（{:.2} MB），无法直接查看文本差异: {}",
                    metadata.len() as f64 / 1024.0 / 1024.0,
                    file_path
                ));
            }
        }

        let modified = std::fs::read_to_string(&abs)
            .map_err(|e| format!("读取工作区文件失败 {}: {}", abs.display(), e))?;
        Ok((original, modified))
    }
}

/// 将指定文件添加到暂存区（相当于 `git add`）。
#[tauri::command]
pub async fn git_stage_files(path: String, files: Vec<String>) -> Result<(), String> {
    let repo = open_repo(&path)?;
    let mut index = repo.index().map_err(|e| format!("获取暂存区失败: {}", e))?;
    for f in &files {
        index
            .add_path(Path::new(f))
            .map_err(|e| format!("暂存文件 {} 失败: {}", f, e))?;
    }
    // 必须落盘，否则前端刷新后状态不变化
    index
        .write()
        .map_err(|e| format!("写入暂存区失败: {}", e))?;
    Ok(())
}

/// 将指定文件移出暂存区（相当于 `git reset HEAD`）。
#[tauri::command]
pub async fn git_unstage_files(path: String, files: Vec<String>) -> Result<(), String> {
    let repo = open_repo(&path)?;

    // 如果是全新初始化的空仓库，没有 HEAD 提交，此时 reset_default 会失败。
    // 针对空仓库，我们直接从暂存区（Index）中移除该路径，达到 unstage 的效果。
    let head_commit = repo.head().and_then(|h| h.peel_to_commit());

    match head_commit {
        Ok(commit) => {
            let paths: Vec<&Path> = files.iter().map(Path::new).collect();
            repo.reset_default(Some(commit.as_object()), paths.iter())
                .map_err(|e| format!("取消暂存失败: {}", e))?;
        }
        Err(_) => {
            // 空仓库处理：直接从 index 中移除新添加的文件
            let mut index = repo.index().map_err(|e| format!("获取暂存区失败: {}", e))?;
            for f in &files {
                // 如果是新文件，直接从暂存区移除
                let _ = index.remove_path(Path::new(f));
            }
            index
                .write()
                .map_err(|e| format!("写入暂存区失败: {}", e))?;
            return Ok(());
        }
    }

    // reset_default 不会自动落盘，需要手动 write index
    let mut index = repo.index().map_err(|e| format!("获取暂存区失败: {}", e))?;
    index
        .write()
        .map_err(|e| format!("写入暂存区失败: {}", e))?;
    Ok(())
}

/// 提交暂存区的更改。
#[tauri::command]
pub async fn git_commit(path: String, message: String) -> Result<(), String> {
    let repo = open_repo(&path)?;

    // 提交者身份：未配置时返回友好中文提示
    let sig = repo.signature().map_err(|_| {
        "该仓库未配置提交者身份，请先在终端执行 `git config user.name` 和 `git config user.email` 配置您的 Git 身份。"
            .to_string()
    })?;

    let mut index = repo.index().map_err(|e| format!("获取暂存区失败: {}", e))?;
    let tree_id = index
        .write_tree()
        .map_err(|e| format!("写入 tree 失败: {}", e))?;
    let tree = repo
        .find_tree(tree_id)
        .map_err(|e| format!("查找 tree 失败: {}", e))?;

    // 获取父提交（首次提交无父）
    let mut parents = Vec::new();
    if let Ok(head) = repo.head() {
        if let Ok(parent) = head.peel_to_commit() {
            parents.push(parent);
        }
    }

    repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        &message,
        &tree,
        parents.iter().collect::<Vec<_>>().as_slice(),
    )
    .map_err(|e| format!("提交失败: {}", e))?;

    Ok(())
}

/// 带代理 / 超时 / 隐藏窗口保护的系统 git 执行器。
async fn run_git_with_guard(app: &AppHandle, path: &str, args: &[&str]) -> Result<String, String> {
    let repo_path = if path.is_empty() { "." } else { path };
    let mut cmd = Command::new("git");

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    // 注入代理环境变量
    let proxy = crate::commands::config_manager::get_proxy_settings(app);
    if proxy.mode == "custom" && !proxy.custom_url.is_empty() {
        cmd.env("http_proxy", &proxy.custom_url)
            .env("https_proxy", &proxy.custom_url)
            .env("HTTP_PROXY", &proxy.custom_url)
            .env("HTTPS_PROXY", &proxy.custom_url);
    } else if proxy.mode == "none" {
        // none 模式显式禁用代理
        cmd.env("http_proxy", "")
            .env("https_proxy", "")
            .env("HTTP_PROXY", "")
            .env("HTTPS_PROXY", "")
            .env("ALL_PROXY", "")
            .env("all_proxy", "");
    }
    // system 模式：不注入，让 git 读取系统代理

    // 防止凭据弹窗导致进程永久挂起
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    cmd.env("GIT_ASKPASS", "");
    cmd.env("SSH_ASKPASS", "");

    cmd.arg("-C").arg(repo_path);
    for a in args {
        cmd.arg(a);
    }

    // 异步执行并设置 30 秒超时保护
    let future = cmd.output();
    let output = match tokio::time::timeout(Duration::from_secs(30), future).await {
        Ok(Ok(out)) => out,
        Ok(Err(e)) => return Err(format!("启动 git 失败: {}", e)),
        Err(_) => return Err("git 执行超时（30秒），已自动终止".to_string()),
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let mut msg = stderr.trim().to_string();
        if msg.is_empty() {
            msg = stdout.trim().to_string();
        }
        return Err(if msg.is_empty() {
            "git 命令执行失败".to_string()
        } else {
            msg
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// 推送更改到远程仓库（系统 git push）。
#[tauri::command]
pub async fn git_push(app: AppHandle, path: String) -> Result<(), String> {
    let _ = run_git_with_guard(&app, &path, &["push"]).await?;
    Ok(())
}

/// 从远程仓库拉取更改（系统 git pull）。
#[tauri::command]
pub async fn git_pull(app: AppHandle, path: String) -> Result<(), String> {
    let _ = run_git_with_guard(&app, &path, &["pull", "--no-edit"]).await?;
    Ok(())
}

/// 仅供内部测试使用的辅助函数：将 Oid 转为短哈希字符串。保留以备后续命令复用。
#[allow(dead_code)]
fn short_oid(oid: Oid) -> String {
    oid.to_string().chars().take(7).collect()
}
