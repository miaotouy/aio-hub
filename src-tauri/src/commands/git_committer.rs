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
//! 基于 git2-rs 原生实现 Commit / 文件 Diff 提取与仓库状态获取，
//! Stage / Push / Pull 使用系统 git 命令行，以保持与 Git CLI 的行为一致并处理凭据与代理。
//!
//! 与 `git_analyzer` 的关系：
//! - `git_analyzer` 偏只读历史分析，本模块偏写操作工作流。
//! - `delta_status_str`（git_analyzer.rs:1349）是私有且入参为 `git2::Delta`，
//!   与本模块基于 `git2::Status`（位标志）语义不匹配，故自行实现状态字符映射。

use git2::{BranchType, Oid, Repository, Status};
use serde::{Deserialize, Serialize};
use std::collections::{HashSet, VecDeque};
use std::path::{Component, Path, PathBuf};
use std::time::Duration;
use tauri::AppHandle;
use tokio::process::Command;

/// 限制文本 Diff 读取的最大文件大小（1MB），防止大文件导致 IPC 崩溃或内存暴涨
pub const MAX_TEXT_DIFF_SIZE: u64 = 1024 * 1024;

/// Git 快照媒体在 IPC 中载入的单侧上限。工作区媒体始终经 asset 协议流式读取。
pub const MAX_MEDIA_PREVIEW_SNAPSHOT_SIZE: u64 = 64 * 1024 * 1024;

/// 拖入工作区时最多向下扫描 4 层，避免误拖磁盘根目录后遍历失控。
const MAX_REPOSITORY_SCAN_DEPTH: usize = 4;
const MAX_SCANNED_DIRECTORIES: usize = 10_000;

const IGNORED_SCAN_DIRECTORIES: &[&str] = &[
    ".git",
    ".cache",
    ".venv",
    "build",
    "dist",
    "node_modules",
    "target",
    "venv",
];

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredRepository {
    pub path: String,
    pub name: String,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryScanResult {
    pub repositories: Vec<DiscoveredRepository>,
    pub invalid_paths: Vec<String>,
    pub scan_limit_reached: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchItem {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub upstream: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitTagItem {
    pub name: String,
    pub hash: String,
    pub message: Option<String>,
    pub tagger: Option<String>,
    pub date: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitStashItem {
    pub index: usize,
    pub name: String,
    pub message: String,
    pub hash: String,
    pub date: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitRemoteConfig {
    pub name: String,
    pub fetch_url: Option<String>,
    pub push_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitAuthorStat {
    pub name: String,
    pub email: String,
    pub commit_count: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RepoOverview {
    pub path: String,
    pub branch: String,
    pub head_hash: String,
    pub local_user_name: Option<String>,
    pub local_user_email: Option<String>,
    pub global_user_name: Option<String>,
    pub global_user_email: Option<String>,
    pub remotes: Vec<GitRemoteConfig>,
    pub branches: Vec<GitBranchItem>,
    pub tags: Vec<GitTagItem>,
    pub stashes: Vec<GitStashItem>,
    pub total_commits: usize,
    pub top_authors: Vec<GitAuthorStat>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MergeResult {
    pub success: bool,
    pub has_conflicts: bool,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RepoStatus {
    pub branch: String,
    /// 当前 HEAD 的完整提交哈希；未创建首个提交时为空。
    pub head_commit_hash: String,
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

/// 单侧文件版本的预览元数据。文本内容仅在 `GitFileDiff` 的 original/modified 字段返回。
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffSide {
    pub exists: bool,
    pub path: String,
    pub preview_kind: String,
    pub mime_type: String,
    pub byte_size: u64,
    pub snapshot_available: bool,
    pub local_path: Option<String>,
}

/// Git 文件差异及其两侧可预览版本描述。
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitFileDiff {
    pub path: String,
    pub original: String,
    pub modified: String,
    pub is_binary: bool,
    pub original_side: GitDiffSide,
    pub modified_side: GitDiffSide,
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

/// 仅允许仓库内相对路径，避免命令参数跳出工作区。
fn repository_relative_path(file_path: &str) -> Result<PathBuf, String> {
    let path = Path::new(file_path);
    if file_path.trim().is_empty()
        || path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(format!("非法仓库文件路径: {}", file_path));
    }
    Ok(path.to_path_buf())
}

fn resolve_worktree_file(workdir: &Path, file_path: &str) -> Result<PathBuf, String> {
    let relative = repository_relative_path(file_path)?;
    let workdir =
        std::fs::canonicalize(workdir).map_err(|e| format!("无法解析仓库工作区: {}", e))?;
    let candidate = workdir.join(relative);
    let target = if candidate.exists() {
        std::fs::canonicalize(&candidate)
            .map_err(|e| format!("无法解析工作区文件 {}: {}", candidate.display(), e))?
    } else {
        let parent = candidate
            .parent()
            .ok_or_else(|| format!("无法解析工作区文件: {}", file_path))?;
        let canonical_parent = std::fs::canonicalize(parent)
            .map_err(|e| format!("无法解析工作区文件父目录 {}: {}", parent.display(), e))?;
        canonical_parent.join(
            candidate
                .file_name()
                .ok_or_else(|| format!("无效文件名: {}", file_path))?,
        )
    };
    if !target.starts_with(&workdir) {
        return Err(format!("文件路径超出仓库工作区: {}", file_path));
    }
    Ok(target)
}

/// 为状态列表提供轻量二进制标记。已删除文件没有工作区实体，保留为文本默认值，
/// 其真实类型会在按需加载差异时由 Git 版本内容判定。
fn is_binary_file(workdir: &Path, file_path: &str) -> bool {
    let Ok(path) = resolve_worktree_file(workdir, file_path) else {
        return false;
    };
    path.exists() && !crate::utils::mime::is_text_file(&path)
}

fn empty_side(path: &str) -> GitDiffSide {
    GitDiffSide {
        exists: false,
        path: path.to_string(),
        preview_kind: "text".to_string(),
        mime_type: "text/plain".to_string(),
        byte_size: 0,
        snapshot_available: false,
        local_path: None,
    }
}

fn preview_kind_from_mime(mime_type: &str) -> &'static str {
    if mime_type.starts_with("image/") && mime_type != "image/svg+xml" {
        "image"
    } else if mime_type.starts_with("audio/") {
        "audio"
    } else if mime_type.starts_with("video/") {
        "video"
    } else if mime_type.starts_with("text/")
        || matches!(
            mime_type,
            "application/json" | "application/xml" | "application/javascript"
        )
    {
        "text"
    } else {
        "binary"
    }
}

fn mime_for_blob(blob: &git2::Blob<'_>, path: &str) -> String {
    if blob.size() <= 8192 {
        if let Some(kind) = infer::get(blob.content()) {
            return kind.mime_type().to_string();
        }
    }
    crate::utils::mime::guess_mime_type(Path::new(path))
}

fn blob_oid_from_head(repo: &Repository, file_path: &str) -> Option<Oid> {
    let head = repo.head().ok()?;
    let tree = head.peel_to_tree().ok()?;
    tree.get_path(Path::new(file_path))
        .ok()
        .map(|entry| entry.id())
}

fn blob_oid_from_index(repo: &Repository, file_path: &str) -> Option<Oid> {
    repo.index()
        .ok()?
        .get_path(Path::new(file_path), 0)
        .map(|entry| entry.id)
}

fn side_from_blob(repo: &Repository, oid: Option<Oid>, path: &str) -> Result<GitDiffSide, String> {
    let Some(oid) = oid.filter(|oid| !oid.is_zero()) else {
        return Ok(empty_side(path));
    };
    let blob = repo
        .find_blob(oid)
        .map_err(|e| format!("读取 Git 文件版本失败: {}", e))?;
    let mime_type = mime_for_blob(&blob, path);
    let mut preview_kind = preview_kind_from_mime(&mime_type).to_string();
    if preview_kind == "binary"
        && blob.size() <= MAX_TEXT_DIFF_SIZE as usize
        && crate::utils::mime::is_buffer_likely_text(blob.content())
    {
        preview_kind = "text".to_string();
    }
    Ok(GitDiffSide {
        exists: true,
        path: path.to_string(),
        preview_kind: preview_kind.clone(),
        mime_type,
        byte_size: blob.size() as u64,
        snapshot_available: matches!(preview_kind.as_str(), "image" | "audio" | "video")
            && blob.size() as u64 <= MAX_MEDIA_PREVIEW_SNAPSHOT_SIZE,
        local_path: None,
    })
}

fn side_from_worktree(path: &Path, display_path: &str) -> Result<GitDiffSide, String> {
    if !path.exists() {
        return Ok(empty_side(display_path));
    }
    let metadata = std::fs::metadata(path)
        .map_err(|e| format!("读取工作区文件信息失败 {}: {}", path.display(), e))?;
    let mime_type = crate::utils::mime::guess_mime_type(path);
    let mut preview_kind = preview_kind_from_mime(&mime_type).to_string();
    if preview_kind == "binary"
        && metadata.len() <= MAX_TEXT_DIFF_SIZE
        && std::fs::read(path)
            .map(|bytes| crate::utils::mime::is_buffer_likely_text(&bytes))
            .unwrap_or(false)
    {
        preview_kind = "text".to_string();
    }
    Ok(GitDiffSide {
        exists: true,
        path: display_path.to_string(),
        preview_kind: preview_kind.clone(),
        mime_type,
        byte_size: metadata.len(),
        snapshot_available: matches!(preview_kind.as_str(), "image" | "audio" | "video"),
        local_path: if matches!(preview_kind.as_str(), "image" | "audio" | "video") {
            Some(path.to_string_lossy().into_owned())
        } else {
            None
        },
    })
}

fn read_blob_text(repo: &Repository, oid: Option<Oid>) -> Result<String, String> {
    let Some(oid) = oid.filter(|oid| !oid.is_zero()) else {
        return Ok(String::new());
    };
    let blob = repo
        .find_blob(oid)
        .map_err(|e| format!("读取 Git 文件版本失败: {}", e))?;
    if blob.size() as u64 > MAX_TEXT_DIFF_SIZE {
        return Err(format!(
            "文件过大（{:.2} MB），无法直接查看文本差异",
            blob.size() as f64 / 1024.0 / 1024.0
        ));
    }
    Ok(String::from_utf8_lossy(blob.content()).to_string())
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

fn is_repository_root(path: &Path) -> bool {
    let git_marker = path.join(".git");
    git_marker.exists()
        && Repository::open(path)
            .map(|repo| repo.workdir().is_some())
            .unwrap_or(false)
}

fn repository_identity(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn should_skip_scan_directory(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };
    IGNORED_SCAN_DIRECTORIES
        .iter()
        .any(|ignored| name.eq_ignore_ascii_case(ignored))
}

fn scan_repository_paths(paths: Vec<String>) -> RepositoryScanResult {
    let mut repositories = Vec::new();
    let mut invalid_paths = Vec::new();
    let mut visited = HashSet::new();
    let mut discovered = HashSet::new();
    let mut queue = VecDeque::new();
    let mut scanned_directories = 0usize;
    let mut scan_limit_reached = false;

    for raw_path in paths {
        let path = PathBuf::from(&raw_path);
        if !path.is_dir() {
            invalid_paths.push(raw_path);
            continue;
        }
        queue.push_back((path, 0usize));
    }

    while let Some((path, depth)) = queue.pop_front() {
        if scanned_directories >= MAX_SCANNED_DIRECTORIES {
            scan_limit_reached = true;
            break;
        }

        let identity = repository_identity(&path);
        if !visited.insert(identity.clone()) {
            continue;
        }
        scanned_directories += 1;

        if is_repository_root(&path) {
            if discovered.insert(identity) {
                let name = path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .filter(|name| !name.is_empty())
                    .unwrap_or("未知仓库")
                    .to_string();
                repositories.push(DiscoveredRepository {
                    path: path.to_string_lossy().into_owned(),
                    name,
                });
            }
            // 仓库内部可能包含依赖或子模块，不继续向下扫描。
            continue;
        }

        if depth >= MAX_REPOSITORY_SCAN_DEPTH {
            continue;
        }

        let Ok(entries) = std::fs::read_dir(&path) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if !file_type.is_dir() || file_type.is_symlink() {
                continue;
            }
            let child = entry.path();
            if !should_skip_scan_directory(&child) {
                queue.push_back((child, depth + 1));
            }
        }
    }

    repositories.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));
    invalid_paths.sort();

    RepositoryScanResult {
        repositories,
        invalid_paths,
        scan_limit_reached,
    }
}

/// 扫描拖入的目录及其有限层级子目录，返回可加入提交助手的 Git 工作区。
#[tauri::command]
pub async fn git_scan_repositories(paths: Vec<String>) -> Result<RepositoryScanResult, String> {
    tokio::task::spawn_blocking(move || scan_repository_paths(paths))
        .await
        .map_err(|error| format!("扫描 Git 仓库失败: {}", error))
}

/// 获取当前分支名与完整 HEAD 哈希。未创建首个提交的仓库返回空哈希。
fn current_branch_and_head(repo: &Repository) -> (String, String) {
    match repo.head() {
        Ok(head) => (
            head.shorthand()
                .map(|name| name.to_string())
                .unwrap_or_else(|| "(detached)".to_string()),
            head.target().map(|oid| oid.to_string()).unwrap_or_default(),
        ),
        Err(_) => ("(no HEAD)".to_string(), String::new()),
    }
}

/// 获取仓库状态：分支名、暂存/未暂存文件列表、ahead/behind。
#[tauri::command]
pub async fn git_get_repo_status(path: String) -> Result<RepoStatus, String> {
    let repo = open_repo(&path)?;
    let workdir = repo_workdir(&repo, &path);

    let (branch, head_commit_hash) = current_branch_and_head(&repo);

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
        head_commit_hash,
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

/// 获取单个文件的 Diff 原始与修改后版本。
///
/// - `is_staged = true`：对比 HEAD 与 Index。
/// - `is_staged = false`：对比 Index 与工作区。
#[tauri::command]
pub async fn git_get_file_diff(
    path: String,
    file_path: String,
    is_staged: bool,
) -> Result<GitFileDiff, String> {
    repository_relative_path(&file_path)?;
    let repo = open_repo(&path)?;
    let repo_path = repo_workdir(&repo, &path);

    let original_oid = if is_staged {
        blob_oid_from_head(&repo, &file_path)
    } else {
        blob_oid_from_index(&repo, &file_path).or_else(|| blob_oid_from_head(&repo, &file_path))
    };
    let original_side = side_from_blob(&repo, original_oid, &file_path)?;

    let (modified_oid, modified_side) = if is_staged {
        let oid = blob_oid_from_index(&repo, &file_path);
        let side = side_from_blob(&repo, oid, &file_path)?;
        (oid, side)
    } else {
        let worktree_file = resolve_worktree_file(&repo_path, &file_path)?;
        (None, side_from_worktree(&worktree_file, &file_path)?)
    };

    let is_binary = [original_side.clone(), modified_side.clone()]
        .into_iter()
        .filter(|side| side.exists)
        .any(|side| side.preview_kind != "text");

    if is_binary {
        return Ok(GitFileDiff {
            path: file_path,
            original: String::new(),
            modified: String::new(),
            is_binary: true,
            original_side,
            modified_side,
        });
    }

    let original = read_blob_text(&repo, original_oid)?;
    let modified = if is_staged {
        read_blob_text(&repo, modified_oid)?
    } else if modified_side.exists {
        if modified_side.byte_size > MAX_TEXT_DIFF_SIZE {
            return Err(format!(
                "文件过大（{:.2} MB），无法直接查看文本差异: {}",
                modified_side.byte_size as f64 / 1024.0 / 1024.0,
                file_path
            ));
        }
        let worktree_file = resolve_worktree_file(&repo_path, &file_path)?;
        std::fs::read_to_string(&worktree_file)
            .map_err(|e| format!("读取工作区文件失败 {}: {}", worktree_file.display(), e))?
    } else {
        String::new()
    };

    Ok(GitFileDiff {
        path: file_path,
        original,
        modified,
        is_binary: false,
        original_side,
        modified_side,
    })
}

fn commit_preview_oids(
    repo: &Repository,
    hash: &str,
    file_path: &str,
) -> Result<(Option<Oid>, Option<Oid>), String> {
    let object = repo
        .revparse_single(hash)
        .map_err(|e| format!("无法解析提交 {}: {}", hash, e))?;
    let commit = object
        .peel_to_commit()
        .map_err(|e| format!("无法读取提交 {}: {}", hash, e))?;
    let parent_tree = if commit.parent_count() > 0 {
        Some(
            commit
                .parent(0)
                .and_then(|parent| parent.tree())
                .map_err(|e| format!("无法读取父提交: {}", e))?,
        )
    } else {
        None
    };
    let current_tree = commit
        .tree()
        .map_err(|e| format!("无法读取提交树: {}", e))?;
    let diff = repo
        .diff_tree_to_tree(parent_tree.as_ref(), Some(&current_tree), None)
        .map_err(|e| format!("无法读取提交差异: {}", e))?;

    let mut old_oid = None;
    let mut new_oid = None;
    let mut matched = false;
    let foreach_result = diff.foreach(
        &mut |delta, _| {
            let old_path = delta.old_file().path().and_then(|path| path.to_str());
            let new_path = delta.new_file().path().and_then(|path| path.to_str());
            if old_path == Some(file_path) || new_path == Some(file_path) {
                old_oid = Some(delta.old_file().id());
                new_oid = Some(delta.new_file().id());
                matched = true;
                return false;
            }
            true
        },
        None,
        None,
        None,
    );
    if !matched {
        foreach_result.map_err(|e| format!("无法检查提交差异: {}", e))?;
        return Err(format!("提交中不存在文件变更: {}", file_path));
    }
    Ok((
        old_oid.filter(|oid| !oid.is_zero()),
        new_oid.filter(|oid| !oid.is_zero()),
    ))
}

/// 读取暂存或历史版本的媒体二进制内容，供前端创建 Blob URL。
#[tauri::command]
pub async fn git_read_file_preview_binary(
    path: String,
    file_path: String,
    is_staged: bool,
    commit_hash: Option<String>,
    side: String,
) -> Result<tauri::ipc::Response, String> {
    repository_relative_path(&file_path)?;
    let repo = open_repo(&path)?;
    let oid = if let Some(hash) = commit_hash.filter(|hash| !hash.trim().is_empty()) {
        let (original, modified) = commit_preview_oids(&repo, &hash, &file_path)?;
        match side.as_str() {
            "original" => original,
            "modified" => modified,
            _ => return Err(format!("无效的文件版本侧: {}", side)),
        }
    } else if is_staged {
        match side.as_str() {
            "original" => blob_oid_from_head(&repo, &file_path),
            "modified" => blob_oid_from_index(&repo, &file_path),
            _ => return Err(format!("无效的文件版本侧: {}", side)),
        }
    } else {
        match side.as_str() {
            "original" => blob_oid_from_index(&repo, &file_path)
                .or_else(|| blob_oid_from_head(&repo, &file_path)),
            "modified" => {
                return Err("工作区文件应通过本地路径流式预览".to_string());
            }
            _ => return Err(format!("无效的文件版本侧: {}", side)),
        }
    };

    let Some(oid) = oid else {
        return Err("该版本不存在".to_string());
    };
    let blob = repo
        .find_blob(oid)
        .map_err(|e| format!("读取 Git 文件版本失败: {}", e))?;
    if blob.size() as u64 > MAX_MEDIA_PREVIEW_SNAPSHOT_SIZE {
        return Err(format!(
            "文件版本超过 {:.0} MB 的应用内预览上限",
            MAX_MEDIA_PREVIEW_SNAPSHOT_SIZE as f64 / 1024.0 / 1024.0
        ));
    }
    Ok(tauri::ipc::Response::new(blob.content().to_vec()))
}

/// 将指定文件添加到暂存区（使用系统 `git add --`）。
///
/// 不能用 `git2::Index::add_path` 替代：对工作区中已删除的文件，
/// `git add` 会正确地把删除记录写入 Index，而 `add_path` 会尝试 stat
/// 工作区文件并报 NotFound。
#[tauri::command]
pub async fn git_stage_files(
    app: AppHandle,
    path: String,
    files: Vec<String>,
) -> Result<(), String> {
    if files.is_empty() {
        return Ok(());
    }

    let mut args = Vec::with_capacity(files.len() + 1);
    args.push("add".to_string());
    args.push("--".to_string());
    args.extend(files);
    let _ = run_git_with_guard(&app, &path, args).await?;
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

/// 放弃指定文件的工作区更改（相当于 `git checkout -- <files>`）。
///
/// 已跟踪文件从暂存区还原；未跟踪的新文件（`WT_NEW`）移入系统回收站。
/// 该操作不可逆，调用方需自行向用户确认。
#[tauri::command]
pub async fn git_discard_files(path: String, files: Vec<String>) -> Result<(), String> {
    let repo = open_repo(&path)?;
    let workdir = repo_workdir(&repo, &path);
    let mut index = repo.index().map_err(|e| format!("获取暂存区失败: {}", e))?;

    let mut checkout = git2::build::CheckoutBuilder::new();
    checkout.force();
    let mut has_tracked_change = false;

    for f in &files {
        let file_status = repo
            .status_file(Path::new(f))
            .map_err(|e| format!("获取文件状态 {} 失败: {}", f, e))?;

        if file_status.contains(Status::WT_NEW) {
            // 未跟踪文件：移入系统回收站（可从回收站还原）
            let full = workdir.join(f);
            if full.exists() {
                trash::delete(&full)
                    .map_err(|e| format!("将未跟踪文件 {} 移入回收站失败: {}", f, e))?;
            }
        } else {
            checkout.path(Path::new(f));
            has_tracked_change = true;
        }
    }

    if has_tracked_change {
        repo.checkout_index(Some(&mut index), Some(&mut checkout))
            .map_err(|e| format!("放弃更改失败: {}", e))?;
    }
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
async fn run_git_with_guard<I, S>(app: &AppHandle, path: &str, args: I) -> Result<String, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<std::ffi::OsStr>,
{
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
    let _ = run_git_with_guard(&app, &path, ["push"]).await?;
    Ok(())
}

/// 从远程仓库拉取更改（系统 git pull）。
#[tauri::command]
pub async fn git_pull(app: AppHandle, path: String) -> Result<(), String> {
    let _ = run_git_with_guard(&app, &path, ["pull", "--no-edit"]).await?;
    Ok(())
}

/// 撤销最近一次提交（保留更改在暂存区，等同于 git reset --soft HEAD~1）。
#[tauri::command]
pub async fn git_undo_last_commit(app: AppHandle, path: String) -> Result<(), String> {
    let _ = run_git_with_guard(&app, &path, ["reset", "--soft", "HEAD~1"]).await?;
    Ok(())
}

/// 追加修改到上次提交（git commit --amend）。
#[tauri::command]
pub async fn git_commit_amend(app: AppHandle, path: String, message: String) -> Result<(), String> {
    let _ = run_git_with_guard(&app, &path, ["commit", "--amend", "-m", &message]).await?;
    Ok(())
}

/// 切换/检出分支。
#[tauri::command]
pub async fn git_checkout_branch(app: AppHandle, path: String, branch_name: String) -> Result<(), String> {
    let _ = run_git_with_guard(&app, &path, ["checkout", &branch_name]).await?;
    Ok(())
}

/// 新建分支（可选指定起始 commit 或分支）。
#[tauri::command]
pub async fn git_create_branch(
    app: AppHandle,
    path: String,
    branch_name: String,
    start_point: Option<String>,
) -> Result<(), String> {
    let mut args = vec!["branch", &branch_name];
    let start = start_point.unwrap_or_default();
    if !start.is_empty() {
        args.push(&start);
    }
    let _ = run_git_with_guard(&app, &path, args).await?;
    Ok(())
}

/// 删除分支（本地）。
#[tauri::command]
pub async fn git_delete_branch(
    app: AppHandle,
    path: String,
    branch_name: String,
    force: Option<bool>,
) -> Result<(), String> {
    let flag = if force.unwrap_or(false) { "-D" } else { "-d" };
    let _ = run_git_with_guard(&app, &path, ["branch", flag, &branch_name]).await?;
    Ok(())
}

/// 合并分支到当前分支。
#[tauri::command]
pub async fn git_merge_branch(
    app: AppHandle,
    path: String,
    branch_name: String,
) -> Result<MergeResult, String> {
    let repo_path = if path.is_empty() { "." } else { &path };
    let mut cmd = Command::new("git");

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);

    let proxy = crate::commands::config_manager::get_proxy_settings(&app);
    if proxy.mode == "custom" && !proxy.custom_url.is_empty() {
        cmd.env("http_proxy", &proxy.custom_url)
            .env("https_proxy", &proxy.custom_url);
    }
    cmd.env("GIT_TERMINAL_PROMPT", "0");
    cmd.arg("-C").arg(repo_path);
    cmd.arg("merge").arg(&branch_name).arg("--no-edit");

    let output = match tokio::time::timeout(Duration::from_secs(30), cmd.output()).await {
        Ok(Ok(out)) => out,
        Ok(Err(e)) => return Err(format!("启动 git 失败: {}", e)),
        Err(_) => return Err("git merge 执行超时".to_string()),
    };

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = format!("{}\n{}", stdout, stderr).trim().to_string();

    if output.status.success() {
        Ok(MergeResult {
            success: true,
            has_conflicts: false,
            message: if combined.is_empty() { "分支合并成功".to_string() } else { combined },
        })
    } else {
        let has_conflicts = combined.contains("CONFLICT") || combined.contains("Automatic merge failed");
        Ok(MergeResult {
            success: false,
            has_conflicts,
            message: combined,
        })
    }
}

/// 内部函数：读取仓库标签列表
fn read_git_tags(repo: &Repository) -> Vec<GitTagItem> {
    let mut tags = Vec::new();

    if let Ok(tag_names) = repo.tag_names(None) {
        for name_opt in tag_names.iter() {
            let Some(name) = name_opt else { continue };
            if let Ok(reference) = repo.find_reference(&format!("refs/tags/{}", name)) {
                let target_oid = reference.target();
                if let Ok(obj) = reference.peel(git2::ObjectType::Any) {
                    let (hash, msg, tagger, date) = if let Ok(tag_obj) = obj.clone().into_tag() {
                        let d = tag_obj.tagger().map(|sig| {
                            let time = sig.when();
                            chrono::DateTime::from_timestamp(time.seconds(), 0)
                                .map(|dt| dt.format("%Y-%m-%d %H:%M").to_string())
                                .unwrap_or_default()
                        });
                        (
                            tag_obj.target_id().to_string(),
                            tag_obj.message().map(|m| m.to_string()),
                            tag_obj.tagger().and_then(|t| t.name().map(|s| s.to_string())),
                            d,
                        )
                    } else {
                        let h = target_oid.map(|o| o.to_string()).unwrap_or_else(|| obj.id().to_string());
                        (h, None, None, None)
                    };

                    tags.push(GitTagItem {
                        name: name.to_string(),
                        hash,
                        message: msg,
                        tagger,
                        date,
                    });
                }
            }
        }
    }
    tags.reverse();
    tags
}

/// 获取标签列表。
#[tauri::command]
pub async fn git_get_tags(path: String) -> Result<Vec<GitTagItem>, String> {
    let repo = open_repo(&path)?;
    Ok(read_git_tags(&repo))
}

/// 创建标签。
#[tauri::command]
pub async fn git_create_tag(
    app: AppHandle,
    path: String,
    tag_name: String,
    target_hash: Option<String>,
    message: Option<String>,
) -> Result<(), String> {
    let mut args = vec!["tag"];
    let msg = message.unwrap_or_default();
    if !msg.is_empty() {
        args.push("-a");
        args.push(&tag_name);
        args.push("-m");
        args.push(&msg);
    } else {
        args.push(&tag_name);
    }
    let target = target_hash.unwrap_or_default();
    if !target.is_empty() {
        args.push(&target);
    }
    let _ = run_git_with_guard(&app, &path, args).await?;
    Ok(())
}

/// 删除标签。
#[tauri::command]
pub async fn git_delete_tag(app: AppHandle, path: String, tag_name: String) -> Result<(), String> {
    let _ = run_git_with_guard(&app, &path, ["tag", "-d", &tag_name]).await?;
    Ok(())
}

/// 获取 Stash 列表。
#[tauri::command]
pub async fn git_stash_list(path: String) -> Result<Vec<GitStashItem>, String> {
    let mut repo = open_repo(&path)?;
    let mut stashes = Vec::new();

    repo.stash_foreach(|index, name, oid| {
        stashes.push(GitStashItem {
            index,
            name: format!("stash@{{{}}}", index),
            message: name.to_string(),
            hash: oid.to_string().chars().take(7).collect(),
            date: "".to_string(),
        });
        true
    })
    .map_err(|e| format!("遍历 stash 失败: {}", e))?;

    Ok(stashes)
}

/// 保存工作区到 Stash。
#[tauri::command]
pub async fn git_stash_save(
    app: AppHandle,
    path: String,
    message: Option<String>,
    include_untracked: Option<bool>,
) -> Result<(), String> {
    let mut args = vec!["stash", "push"];
    if include_untracked.unwrap_or(false) {
        args.push("-u");
    }
    let msg = message.unwrap_or_default();
    if !msg.is_empty() {
        args.push("-m");
        args.push(&msg);
    }
    let _ = run_git_with_guard(&app, &path, args).await?;
    Ok(())
}

/// 弹出 Stash (Pop)。
#[tauri::command]
pub async fn git_stash_pop(app: AppHandle, path: String, index: Option<usize>) -> Result<(), String> {
    let idx_str = format!("stash@{{{}}}", index.unwrap_or(0));
    let _ = run_git_with_guard(&app, &path, ["stash", "pop", &idx_str]).await?;
    Ok(())
}

/// 应用 Stash (Apply)。
#[tauri::command]
pub async fn git_stash_apply(app: AppHandle, path: String, index: Option<usize>) -> Result<(), String> {
    let idx_str = format!("stash@{{{}}}", index.unwrap_or(0));
    let _ = run_git_with_guard(&app, &path, ["stash", "apply", &idx_str]).await?;
    Ok(())
}

/// 删除 Stash (Drop)。
#[tauri::command]
pub async fn git_stash_drop(app: AppHandle, path: String, index: Option<usize>) -> Result<(), String> {
    let idx_str = format!("stash@{{{}}}", index.unwrap_or(0));
    let _ = run_git_with_guard(&app, &path, ["stash", "drop", &idx_str]).await?;
    Ok(())
}

/// 在系统终端中打开当前仓库目录。
#[tauri::command]
pub async fn git_open_terminal(path: String) -> Result<(), String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("目录不存在: {}", path));
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        // 探测系统中是否存在 wt.exe（通过 where.exe）
        let has_wt = std::process::Command::new("where")
            .arg("wt")
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map(|out| out.status.success())
            .unwrap_or(false);

        if has_wt {
            let _ = std::process::Command::new("wt")
                .arg("-d")
                .arg(&path)
                .spawn()
                .or_else(|_| {
                    std::process::Command::new("powershell")
                        .arg("-NoExit")
                        .arg("-Command")
                        .arg(format!("Set-Location -LiteralPath '{}'", path))
                        .spawn()
                })
                .map_err(|e| format!("启动终端失败: {}", e))?;
        } else {
            let _ = std::process::Command::new("powershell")
                .arg("-NoExit")
                .arg("-Command")
                .arg(format!("Set-Location -LiteralPath '{}'", path))
                .spawn()
                .map_err(|e| format!("启动终端失败: {}", e))?;
        }
    }

    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg("-a")
            .arg("Terminal")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("启动终端失败: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("x-terminal-emulator")
            .arg(format!("--working-directory={}", path))
            .spawn()
            .map_err(|e| format!("启动终端失败: {}", e))?;
    }

    Ok(())
}

/// 获取仓库全景详细信息（分支、Tag、Stash、配置、远端、贡献统计）。
#[tauri::command]
pub async fn git_get_repo_overview(path: String) -> Result<RepoOverview, String> {
    let repo = open_repo(&path)?;
    let (current_branch, head_hash) = current_branch_and_head(&repo);

    // 1. 读取本地与全局配置
    let (local_user_name, local_user_email) = if let Ok(config) = repo.config() {
        (
            config.get_string("user.name").ok(),
            config.get_string("user.email").ok(),
        )
    } else {
        (None, None)
    };

    let (global_user_name, global_user_email) = if let Ok(global_config) = git2::Config::open_default() {
        (
            global_config.get_string("user.name").ok(),
            global_config.get_string("user.email").ok(),
        )
    } else {
        (None, None)
    };

    // 2. 读取 Remote
    let mut remotes = Vec::new();
    if let Ok(remote_names) = repo.remotes() {
        for name_opt in remote_names.iter() {
            let Some(name) = name_opt else { continue };
            if let Ok(r) = repo.find_remote(name) {
                remotes.push(GitRemoteConfig {
                    name: name.to_string(),
                    fetch_url: r.url().map(|s| s.to_string()),
                    push_url: r.pushurl().or_else(|| r.url()).map(|s| s.to_string()),
                });
            }
        }
    }

    // 3. 读取本地与远程分支
    let mut branches = Vec::new();
    if let Ok(branches_iter) = repo.branches(None) {
        for item in branches_iter.flatten() {
            let (branch, branch_type) = item;
            let name = branch.name().ok().flatten().unwrap_or("").to_string();
            if name.is_empty() {
                continue;
            }
            let is_remote = branch_type == BranchType::Remote;
            let is_current = !is_remote && name == current_branch;
            let upstream = branch
                .upstream()
                .ok()
                .and_then(|u| u.name().ok().flatten().map(|s| s.to_string()));

            branches.push(GitBranchItem {
                name,
                is_current,
                is_remote,
                upstream,
            });
        }
    }

    // 4. 读取标签列表（同步读取，避免跨 await 引用 non-Send 类型）
    let tags = read_git_tags(&repo);

    // 5. 读取 Stash 列表
    let mut stashes = Vec::new();
    let mut mut_repo = open_repo(&path)?;
    let _ = mut_repo.stash_foreach(|index, name, oid| {
        stashes.push(GitStashItem {
            index,
            name: format!("stash@{{{}}}", index),
            message: name.to_string(),
            hash: oid.to_string().chars().take(7).collect(),
            date: "".to_string(),
        });
        true
    });

    // 6. 统计总 Commit 数与 Top 作者（遍历 HEAD 历史，上限采样 5000 次提交保证毫秒级返回）
    let mut total_commits = 0usize;
    let mut author_counts: std::collections::HashMap<(String, String), usize> = std::collections::HashMap::new();

    if let Ok(mut revwalk) = repo.revwalk() {
        if revwalk.push_head().is_ok() {
            for oid in revwalk.take(5000).flatten() {
                total_commits += 1;
                if let Ok(commit) = repo.find_commit(oid) {
                    let author = commit.author();
                    let name = author.name().unwrap_or("Unknown").to_string();
                    let email = author.email().unwrap_or("").to_string();
                    *author_counts.entry((name, email)).or_insert(0) += 1;
                }
            }
        }
    }

    let mut top_authors: Vec<GitAuthorStat> = author_counts
        .into_iter()
        .map(|((name, email), commit_count)| GitAuthorStat {
            name,
            email,
            commit_count,
        })
        .collect();
    top_authors.sort_by_key(|a| std::cmp::Reverse(a.commit_count));
    top_authors.truncate(10);

    Ok(RepoOverview {
        path,
        branch: current_branch,
        head_hash,
        local_user_name,
        local_user_email,
        global_user_name,
        global_user_email,
        remotes,
        branches,
        tags,
        stashes,
        total_commits,
        top_authors,
    })
}

/// 仅供内部测试使用的辅助函数：将 Oid 转为短哈希字符串。保留以备后续命令复用。
#[allow(dead_code)]
fn short_oid(oid: Oid) -> String {
    oid.to_string().chars().take(7).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_tempdir() -> tempfile::TempDir {
        let target_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("target");
        std::fs::create_dir_all(&target_dir).expect("create cargo target directory");
        tempfile::tempdir_in(target_dir).expect("create temp directory")
    }

    fn create_initial_commit(repo: &Repository) -> Oid {
        let workdir = repo.workdir().expect("repository should have a workdir");
        std::fs::write(workdir.join("README.md"), "initial commit").expect("write tracked file");

        let mut index = repo.index().expect("open repository index");
        index
            .add_path(Path::new("README.md"))
            .expect("add tracked file to index");
        index.write().expect("write repository index");
        let tree_id = index.write_tree().expect("write repository tree");
        let tree = repo.find_tree(tree_id).expect("find repository tree");
        let signature = git2::Signature::now("AIO Hub Test", "test@example.com")
            .expect("create commit signature");

        repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            "initial commit",
            &tree,
            &[],
        )
        .expect("create initial commit")
    }

    #[test]
    fn rejects_paths_outside_the_repository_worktree() {
        assert!(repository_relative_path("../outside.png").is_err());
        if cfg!(windows) {
            assert!(repository_relative_path("C:\\outside.png").is_err());
        } else {
            assert!(repository_relative_path("/outside.png").is_err());
        }
        assert!(repository_relative_path("assets/logo.png").is_ok());
    }

    #[test]
    fn marks_media_snapshots_available_at_the_configured_limit() {
        assert!(MAX_MEDIA_PREVIEW_SNAPSHOT_SIZE > MAX_TEXT_DIFF_SIZE);
        assert_eq!(MAX_MEDIA_PREVIEW_SNAPSHOT_SIZE, 64 * 1024 * 1024);
    }

    #[test]
    fn reads_a_deleted_text_worktree_file_as_a_text_diff() {
        let temp = test_tempdir();
        let repo = Repository::init(temp.path()).expect("init repository");
        create_initial_commit(&repo);
        let workdir = repo.workdir().expect("workdir");
        std::fs::remove_file(workdir.join("README.md")).expect("delete tracked file");

        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime");
        let diff = runtime
            .block_on(git_get_file_diff(
                workdir.to_string_lossy().into_owned(),
                "README.md".to_string(),
                false,
            ))
            .expect("load deleted text diff");

        assert!(!diff.is_binary);
        assert_eq!(diff.original, "initial commit");
        assert!(diff.modified.is_empty());
        assert!(diff.original_side.exists);
        assert!(!diff.modified_side.exists);
    }

    #[test]
    fn describes_staged_media_as_an_image_snapshot() {
        let temp = test_tempdir();
        let repo = Repository::init(temp.path()).expect("init repository");
        let workdir = repo.workdir().expect("workdir");
        std::fs::write(workdir.join("cover.png"), [0x89, b'P', b'N', b'G', 0, 1])
            .expect("write image");
        let mut index = repo.index().expect("index");
        index.add_path(Path::new("cover.png")).expect("stage image");
        index.write().expect("write index");

        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime");
        let diff = runtime
            .block_on(git_get_file_diff(
                workdir.to_string_lossy().into_owned(),
                "cover.png".to_string(),
                true,
            ))
            .expect("load staged image diff");

        assert!(diff.is_binary);
        assert_eq!(diff.modified_side.preview_kind, "image");
        assert!(diff.modified_side.snapshot_available);
        assert!(!diff.original_side.exists);
    }

    #[test]
    fn reports_full_head_hash_for_history_refresh() {
        let temp = test_tempdir();
        let repo = Repository::init(temp.path()).expect("init repository");
        let oid = create_initial_commit(&repo);

        let (_, head_commit_hash) = current_branch_and_head(&repo);

        assert_eq!(head_commit_hash, oid.to_string());
    }

    #[test]
    fn scans_direct_and_nested_repositories_without_descending_into_worktrees() {
        let temp = test_tempdir();
        let direct = temp.path().join("direct-repo");
        let nested = temp.path().join("group").join("nested-repo");
        let ignored_nested = direct.join("packages").join("inner-repo");

        std::fs::create_dir_all(&nested).expect("create nested repository directory");
        std::fs::create_dir_all(&ignored_nested)
            .expect("create repository directory inside worktree");
        Repository::init(&direct).expect("init direct repository");
        Repository::init(&nested).expect("init nested repository");
        Repository::init(&ignored_nested).expect("init repository inside worktree");

        let result = scan_repository_paths(vec![temp.path().to_string_lossy().into_owned()]);
        let discovered_paths: HashSet<PathBuf> = result
            .repositories
            .iter()
            .map(|repo| repository_identity(Path::new(&repo.path)))
            .collect();

        assert_eq!(discovered_paths.len(), 2);
        assert!(discovered_paths.contains(&repository_identity(&direct)));
        assert!(discovered_paths.contains(&repository_identity(&nested)));
        assert!(!discovered_paths.contains(&repository_identity(&ignored_nested)));
        assert!(result.invalid_paths.is_empty());
        assert!(!result.scan_limit_reached);
    }

    #[test]
    fn reports_invalid_roots_and_deduplicates_overlapping_inputs() {
        let temp = test_tempdir();
        let repository = temp.path().join("repo");
        Repository::init(&repository).expect("init repository");
        let missing = temp.path().join("missing");

        let result = scan_repository_paths(vec![
            temp.path().to_string_lossy().into_owned(),
            repository.to_string_lossy().into_owned(),
            missing.to_string_lossy().into_owned(),
        ]);

        assert_eq!(result.repositories.len(), 1);
        assert_eq!(result.invalid_paths, vec![missing.to_string_lossy()]);
    }
}
