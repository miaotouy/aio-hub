// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0.

//! Transactional backend for the symlink mover.
//!
//! The old implementation copied a cross-device source and then tried to move the
//! original to the recycle bin.  If the latter failed, the operation had already
//! mutated the destination and the UI could not safely recover.  This module uses
//! a two-phase flow: build a complete plan, probe the source rename/delete gate,
//! copy to a private staging location, then commit the source swap and link.  All
//! commit steps have a rollback path; a failed cleanup never hides the source.

use crate::file_operation_types::{CopyProgress, FileValidation, OperationLog};
use fs2::available_space;
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;
use walkdir::WalkDir;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SymlinkOperationOutcome {
    pub message: String,
    pub log: OperationLog,
}

pub fn validate_file_for_link(
    source_path: String,
    target_dir: String,
    link_type: String,
) -> Result<FileValidation, String> {
    let source = PathBuf::from(source_path);
    let target = PathBuf::from(target_dir);
    let exists = source.exists();
    Ok(FileValidation {
        exists,
        is_directory: exists && source.is_dir(),
        is_cross_device: exists
            && link_type == "link"
            && target.exists()
            && !same_device(&source, &target).unwrap_or(true),
    })
}
pub fn validate_files_for_link(
    source_paths: Vec<String>,
    target_dir: String,
    link_type: String,
) -> Vec<FileValidation> {
    source_paths
        .into_iter()
        .map(|source| {
            validate_file_for_link(source, target_dir.clone(), link_type.clone()).unwrap_or(
                FileValidation {
                    exists: false,
                    is_directory: false,
                    is_cross_device: false,
                },
            )
        })
        .collect()
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SymlinkOperationPreflight {
    pub operation_mode: String,
    pub link_type: String,
    pub source_count: usize,
    pub total_size: u64,
    pub requires_copy: bool,
    pub can_execute: bool,
    pub items: Vec<SymlinkPreflightItem>,
    pub blocking_issues: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SymlinkPreflightItem {
    pub source_path: String,
    pub target_path: String,
    pub source_kind: String,
    pub size: u64,
    pub is_cross_device: bool,
    pub requires_copy: bool,
    pub blocking_issues: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Clone)]
struct PlannedItem {
    source: PathBuf,
    target: PathBuf,
    source_kind: SourceKind,
    size: u64,
    cross_device: bool,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum SourceKind {
    File,
    Directory,
}

impl SourceKind {
    fn label(self) -> &'static str {
        match self {
            Self::File => "file",
            Self::Directory => "directory",
        }
    }
}

fn now_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn unique_sibling(path: &Path, suffix: &str) -> Result<PathBuf, String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("无法获取路径父目录: {}", path.display()))?;
    let name = path
        .file_name()
        .ok_or_else(|| format!("无法获取路径名称: {}", path.display()))?
        .to_string_lossy();
    Ok(parent.join(format!(
        ".aiohub-symlink-mover-{}-{}{}",
        name,
        Uuid::new_v4(),
        suffix
    )))
}

fn metadata(path: &Path) -> Result<fs::Metadata, String> {
    fs::symlink_metadata(path)
        .map_err(|error| format!("无法读取路径 {}: {}", path.display(), error))
}

fn path_key(path: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        PathBuf::from(
            path.to_string_lossy()
                .replace('/', "\\")
                .to_ascii_lowercase(),
        )
    }
    #[cfg(not(windows))]
    {
        path.to_path_buf()
    }
}

fn resolved_path_for_compare(path: &Path) -> Result<PathBuf, String> {
    if path.exists() {
        return fs::canonicalize(path)
            .map_err(|error| format!("解析路径失败 {}: {}", path.display(), error));
    }

    let mut missing = Vec::new();
    let mut current = path;
    loop {
        match fs::symlink_metadata(current) {
            Ok(_) => {
                let mut resolved = fs::canonicalize(current)
                    .map_err(|error| format!("解析路径失败 {}: {}", current.display(), error))?;
                for component in missing.iter().rev() {
                    resolved.push(component);
                }
                return Ok(resolved);
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let name = current
                    .file_name()
                    .ok_or_else(|| format!("无法解析路径: {}", path.display()))?;
                missing.push(name.to_os_string());
                current = current
                    .parent()
                    .ok_or_else(|| format!("无法解析路径: {}", path.display()))?;
            }
            Err(error) => {
                return Err(format!("解析路径失败 {}: {}", current.display(), error));
            }
        }
    }
}

fn nearest_existing_directory(path: &Path) -> Result<PathBuf, String> {
    let mut current = path;
    loop {
        match fs::symlink_metadata(current) {
            Ok(meta) => {
                if !meta.is_dir() {
                    return Err(format!("路径组件不是目录: {}", current.display()));
                }
                return fs::canonicalize(current)
                    .map_err(|error| format!("解析目录失败 {}: {}", current.display(), error));
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                current = current
                    .parent()
                    .ok_or_else(|| format!("找不到可用的父目录: {}", path.display()))?;
            }
            Err(error) => return Err(format!("读取目录失败 {}: {}", current.display(), error)),
        }
    }
}

fn probe_directory_write(path: &Path) -> Result<(), String> {
    let probe_dir = nearest_existing_directory(path)?;
    let probe = tempfile::NamedTempFile::new_in(&probe_dir)
        .map_err(|error| format!("目录不可写 {}: {}", probe_dir.display(), error))?;
    drop(probe);
    Ok(())
}

fn is_link(meta: &fs::Metadata) -> bool {
    if meta.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        return meta.file_attributes() & 0x400 != 0;
    }
    #[cfg(not(windows))]
    {
        false
    }
}

fn check_link_components(path: &Path) -> Result<(), String> {
    if !path.is_absolute() {
        return Err(format!("路径必须是绝对路径: {}", path.display()));
    }
    let mut current = PathBuf::new();
    for component in path.components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err(format!("路径含有上级目录跳转: {}", path.display()));
        }
        current.push(component);
        match fs::symlink_metadata(&current) {
            Ok(meta) if is_link(&meta) => {
                return Err(format!("路径经过符号链接或链接点: {}", current.display()))
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("读取路径失败 {}: {}", current.display(), error)),
        }
    }
    Ok(())
}

fn source_size_and_kind(source: &Path) -> Result<(SourceKind, u64), String> {
    check_link_components(source)?;
    if source.file_name().is_none() {
        return Err(format!(
            "源路径必须是普通文件或子目录: {}",
            source.display()
        ));
    }
    let root = metadata(source)?;
    if is_link(&root) {
        return Err(format!(
            "不支持把符号链接或链接点作为源路径: {}",
            source.display()
        ));
    }
    if root.is_file() {
        return Ok((SourceKind::File, root.len()));
    }
    if !root.is_dir() {
        return Err(format!("源路径不是普通文件或目录: {}", source.display()));
    }

    let mut total = 0u64;
    for entry in WalkDir::new(source).follow_links(false) {
        let entry =
            entry.map_err(|error| format!("扫描目录失败 {}: {}", source.display(), error))?;
        let file_type = entry.file_type();
        let entry_meta = metadata(entry.path())?;
        if is_link(&entry_meta) {
            return Err(format!(
                "源目录包含符号链接或链接点，已拒绝: {}",
                entry.path().display()
            ));
        }
        if file_type.is_file() {
            total = total
                .checked_add(
                    entry
                        .metadata()
                        .map_err(|error| {
                            format!("读取文件失败 {}: {}", entry.path().display(), error)
                        })?
                        .len(),
                )
                .ok_or_else(|| format!("文件大小超出可处理范围: {}", source.display()))?;
        }
    }
    Ok((SourceKind::Directory, total))
}

fn same_device(source: &Path, target_dir: &Path) -> Result<bool, String> {
    #[cfg(windows)]
    {
        let source_prefix = source.components().find_map(|component| match component {
            std::path::Component::Prefix(prefix) => {
                Some(prefix.as_os_str().to_string_lossy().to_ascii_lowercase())
            }
            _ => None,
        });
        let target_prefix = target_dir
            .components()
            .find_map(|component| match component {
                std::path::Component::Prefix(prefix) => {
                    Some(prefix.as_os_str().to_string_lossy().to_ascii_lowercase())
                }
                _ => None,
            });
        Ok(source_prefix == target_prefix)
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let source_device = metadata(source)?.dev();
        let target_device = metadata(target_dir)?.dev();
        Ok(source_device == target_device)
    }
    #[cfg(not(any(windows, unix)))]
    {
        Ok(true)
    }
}

fn target_for_source(
    source: &Path,
    target_dir: &Path,
    base_source_dir: Option<&Path>,
) -> Result<PathBuf, String> {
    let file_name = source
        .file_name()
        .ok_or_else(|| format!("无法获取源路径名称: {}", source.display()))?;
    if let Some(base) = base_source_dir {
        let relative = source.strip_prefix(base).map_err(|_| {
            format!(
                "源路径不在基准目录内，镜像结构无法确定: {}",
                source.display()
            )
        })?;
        Ok(target_dir.join(relative))
    } else {
        Ok(target_dir.join(file_name))
    }
}

fn is_same_or_descendant(path: &Path, ancestor: &Path) -> bool {
    path_key(path).starts_with(path_key(ancestor))
}

fn build_plan(
    source_paths: &[String],
    target_dir: &str,
    link_type: &str,
    operation_mode: &str,
    base_source_dir: Option<&str>,
) -> Result<(SymlinkOperationPreflight, Vec<PlannedItem>), String> {
    let mut report = SymlinkOperationPreflight {
        operation_mode: operation_mode.to_string(),
        link_type: link_type.to_string(),
        source_count: source_paths.len(),
        total_size: 0,
        requires_copy: false,
        can_execute: false,
        items: Vec::new(),
        blocking_issues: Vec::new(),
        warnings: Vec::new(),
    };
    let mut plan = Vec::new();
    let mut required_copy_size = 0u64;

    if !matches!(operation_mode, "move" | "link-only") {
        report
            .blocking_issues
            .push(format!("不支持的操作模式: {}", operation_mode));
    }
    if !matches!(link_type, "symlink" | "link") {
        report
            .blocking_issues
            .push(format!("不支持的链接类型: {}", link_type));
    }
    if operation_mode == "link-only" && link_type == "link" {
        report
            .blocking_issues
            .push("仅创建链接模式不支持硬链接".to_string());
    }
    if source_paths.is_empty() {
        report
            .blocking_issues
            .push("没有待处理的源路径".to_string());
    }

    let target = PathBuf::from(target_dir);
    if let Err(error) = check_link_components(&target) {
        report.blocking_issues.push(error);
    }
    let target_root = if !target.is_absolute() {
        report
            .blocking_issues
            .push(format!("目标目录必须是绝对路径: {}", target.display()));
        None
    } else {
        match metadata(&target) {
            Ok(meta) if meta.is_dir() && !meta.file_type().is_symlink() => Some(target.clone()),
            Ok(_) => {
                report
                    .blocking_issues
                    .push(format!("目标路径不是普通目录: {}", target.display()));
                None
            }
            Err(error) => {
                report.blocking_issues.push(error);
                None
            }
        }
    };

    let base = base_source_dir.map(PathBuf::from);
    if let Some(base) = &base {
        if let Err(error) = check_link_components(base) {
            report.blocking_issues.push(error);
        }
        match metadata(base) {
            Ok(meta) if base.is_absolute() && meta.is_dir() && !meta.file_type().is_symlink() => {}
            Ok(_) => report
                .blocking_issues
                .push(format!("基准源目录不是普通绝对目录: {}", base.display())),
            Err(error) => report.blocking_issues.push(error),
        }
    }

    let mut source_keys = HashSet::new();
    let mut target_keys = HashSet::new();
    let mut resolved_sources = Vec::new();

    for source_string in source_paths {
        let source = PathBuf::from(source_string);
        let mut item_issues = Vec::new();
        let item_warnings = Vec::new();
        let mut kind = "unknown".to_string();
        let mut size = 0;
        let mut cross_device = false;
        let mut target_path = target.clone();

        if !source.is_absolute() {
            item_issues.push("源路径必须是绝对路径".to_string());
        } else {
            match source_size_and_kind(&source) {
                Ok((source_kind, source_size)) => {
                    kind = source_kind.label().to_string();
                    size = source_size;
                    match resolved_path_for_compare(&source) {
                        Ok(resolved) => {
                            let key = path_key(&resolved);
                            if !source_keys.insert(key) {
                                item_issues.push("源路径重复".to_string());
                            }
                            resolved_sources.push((resolved, source_kind));
                        }
                        Err(error) => item_issues.push(error),
                    }
                }
                Err(error) => item_issues.push(error),
            }
        }

        if let Some(target_root) = &target_root {
            match target_for_source(&source, target_root, base.as_deref()) {
                Ok(path) => {
                    target_path = path;
                    if let Err(error) = check_link_components(&target_path) {
                        item_issues.push(error);
                    }
                    let target_key = path_key(&target_path);
                    if !target_keys.insert(target_key) {
                        item_issues.push("多个源路径映射到了同一个目标路径".to_string());
                    }
                    if let Ok(target_meta) = fs::symlink_metadata(&target_path) {
                        let kind = if target_meta.file_type().is_symlink() {
                            "链接"
                        } else {
                            "文件或目录"
                        };
                        item_issues.push(format!(
                            "目标路径已存在（{}）: {}",
                            kind,
                            target_path.display()
                        ));
                    }
                    if let Ok(source_resolved) = resolved_path_for_compare(&source) {
                        if let Ok(target_resolved) = resolved_path_for_compare(&target_path) {
                            if let Ok(target_root_resolved) = resolved_path_for_compare(target_root)
                            {
                                if !is_same_or_descendant(&target_resolved, &target_root_resolved) {
                                    item_issues
                                        .push("目标路径经过符号链接逃逸出目标目录".to_string());
                                }
                            }
                            if path_key(&source_resolved) == path_key(&target_resolved) {
                                item_issues.push("源路径与目标路径相同".to_string());
                            }
                            if kind == "directory"
                                && operation_mode == "move"
                                && is_same_or_descendant(&target_resolved, &source_resolved)
                            {
                                item_issues.push("目标目录不能位于待搬家目录内部".to_string());
                            }
                        }
                    }
                    if let Some(parent) = target_path.parent() {
                        if let Err(error) = probe_directory_write(parent) {
                            item_issues.push(format!("目标位置不可写: {}", error));
                        }
                    }
                    if let Ok(is_same) = same_device(&source, target_root) {
                        cross_device = !is_same;
                    }
                    if link_type == "link" && kind == "directory" {
                        item_issues.push("硬链接不支持目录".to_string());
                    }
                    if link_type == "link" && cross_device {
                        item_issues.push("硬链接不支持跨分区/跨设备".to_string());
                    }
                }
                Err(error) => item_issues.push(error),
            }
        }

        report.total_size = report.total_size.saturating_add(size);
        let requires_copy = cross_device && operation_mode == "move";
        report.requires_copy |= requires_copy;
        if requires_copy {
            required_copy_size = required_copy_size.saturating_add(size);
        }
        if requires_copy {
            report.warnings.push(format!(
                "跨设备搬家将使用临时副本，完成后再提交源路径切换: {}",
                source.display()
            ));
        }
        report.items.push(SymlinkPreflightItem {
            source_path: source_string.clone(),
            target_path: target_path.to_string_lossy().to_string(),
            source_kind: kind,
            size,
            is_cross_device: cross_device,
            requires_copy,
            blocking_issues: item_issues.clone(),
            warnings: item_warnings,
        });
        for issue in item_issues {
            report
                .blocking_issues
                .push(format!("{}: {}", source.display(), issue));
        }
        if let Ok((source_kind, source_size)) = source_size_and_kind(&source) {
            plan.push(PlannedItem {
                source,
                target: target_path,
                source_kind,
                size: source_size,
                cross_device,
            });
        }
    }

    // Reject overlapping sources; otherwise the same directory could be copied twice
    // and one item could mutate the other item before it is processed.
    resolved_sources.sort_by_key(|(path, _)| path.components().count());
    for (index, (parent, parent_kind)) in resolved_sources.iter().enumerate() {
        if *parent_kind != SourceKind::Directory {
            continue;
        }
        for (child, _) in resolved_sources.iter().skip(index + 1) {
            if is_same_or_descendant(child, parent) && path_key(child) != path_key(parent) {
                report.blocking_issues.push(format!(
                    "源路径互相嵌套，无法安全批量处理: {}",
                    child.display()
                ));
            }
        }
    }

    if let Some(target_root) = &target_root {
        if report.requires_copy {
            if let Ok(space) = available_space(nearest_existing_directory(target_root)?) {
                if required_copy_size > space {
                    report.blocking_issues.push(format!(
                        "目标磁盘可用空间不足：需要至少 {} 字节，当前仅 {} 字节",
                        required_copy_size, space
                    ));
                }
            }
        }
    }

    report.can_execute = report.blocking_issues.is_empty() && plan.len() == source_paths.len();
    Ok((report, plan))
}

pub fn preflight_symlink_operation(
    source_paths: Vec<String>,
    target_dir: String,
    link_type: String,
    operation_mode: String,
    base_source_dir: Option<String>,
) -> Result<SymlinkOperationPreflight, String> {
    build_plan(
        &source_paths,
        &target_dir,
        &link_type,
        &operation_mode,
        base_source_dir.as_deref(),
    )
    .map(|(report, _)| report)
}

fn remove_path(path: &Path) -> Result<(), String> {
    let meta = metadata(path)?;
    let result = if meta.is_dir() {
        if is_link(&meta) {
            fs::remove_dir(path)
        } else {
            fs::remove_dir_all(path)
        }
    } else {
        fs::remove_file(path)
    };
    result.map_err(|error| format!("清理路径失败 {}: {}", path.display(), error))
}

fn create_link(
    source: &Path,
    target: &Path,
    kind: SourceKind,
    link_type: &str,
) -> std::io::Result<()> {
    if link_type == "link" {
        return fs::hard_link(target, source);
    }
    #[cfg(windows)]
    {
        if kind == SourceKind::Directory {
            std::os::windows::fs::symlink_dir(target, source)
        } else {
            std::os::windows::fs::symlink_file(target, source)
        }
    }
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(target, source)
    }
    #[cfg(not(any(windows, unix)))]
    {
        let _ = (source, target, kind);
        Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            "当前平台不支持符号链接",
        ))
    }
}

fn probe_source_rename(source: &Path) -> Result<(), String> {
    let probe = unique_sibling(source, ".rename-probe")?;
    fs::rename(source, &probe).map_err(|error| {
        format!(
            "执行前检查失败：源路径无法安全改名（通常表示文件正在使用或权限不足） {}: {}",
            source.display(),
            error
        )
    })?;
    if let Err(error) = fs::rename(&probe, source) {
        let restore = fs::rename(&probe, source);
        return Err(format!(
            "执行前检查失败：源路径改名回滚失败 {}: {}（恢复结果: {:?}）",
            source.display(),
            error,
            restore
        ));
    }
    Ok(())
}

fn emit_copy_progress(
    emit: &(dyn Fn(CopyProgress) + Sync),
    source: &Path,
    copied: u64,
    total: u64,
) {
    emit(CopyProgress {
        current_file: source.to_string_lossy().to_string(),
        copied_bytes: copied,
        total_bytes: total,
        progress_percentage: if total > 0 {
            copied as f64 / total as f64 * 100.0
        } else {
            100.0
        },
    });
}

fn copy_to_staging(
    emit: &(dyn Fn(CopyProgress) + Sync),
    item: &PlannedItem,
    staging_root: &Path,
    token: &CancellationToken,
) -> Result<PathBuf, String> {
    fs::create_dir_all(staging_root)
        .map_err(|error| format!("创建临时目录失败 {}: {}", staging_root.display(), error))?;
    let staged = staging_root.join(
        item.source
            .file_name()
            .ok_or_else(|| "无法获取源名称".to_string())?,
    );
    emit_copy_progress(emit, &item.source, 0, item.size);
    if item.source_kind == SourceKind::Directory {
        fs_extra::dir::copy(
            &item.source,
            staging_root,
            &fs_extra::dir::CopyOptions::new(),
        )
        .map_err(|error| {
            format!(
                "复制目录失败 {} -> {}: {}",
                item.source.display(),
                staged.display(),
                error
            )
        })?;
    } else {
        let source_name = item.source.to_string_lossy().to_string();

        let token_clone = token.clone();
        let options = fs_extra::file::CopyOptions::new();
        fs_extra::file::copy_with_progress(&item.source, &staged, &options, |progress| {
            emit_copy_progress(
                emit,
                Path::new(&source_name),
                progress.copied_bytes,
                progress.total_bytes,
            );
            let _ = token_clone.is_cancelled();
        })
        .map_err(|error| {
            format!(
                "复制文件失败 {} -> {}: {}",
                item.source.display(),
                staged.display(),
                error
            )
        })?;
    }
    if token.is_cancelled() {
        return Err("操作已被用户取消".to_string());
    }
    emit_copy_progress(emit, &item.source, item.size, item.size);
    let (kind, size) = source_size_and_kind(&staged)?;
    if kind != item.source_kind || size != item.size {
        return Err(format!(
            "复制校验失败 {} -> {}：类型或大小不一致",
            item.source.display(),
            staged.display()
        ));
    }
    Ok(staged)
}

fn move_one(
    emit: &(dyn Fn(CopyProgress) + Sync),
    item: &PlannedItem,
    link_type: &str,
    token: &CancellationToken,
    warnings: &mut Vec<String>,
    link: &dyn Fn(&Path, &Path, SourceKind, &str) -> std::io::Result<()>,
    recycle: &dyn Fn(&Path) -> Result<(), String>,
) -> Result<(), String> {
    if token.is_cancelled() {
        return Err("操作已被用户取消".to_string());
    }
    check_link_components(&item.source)?;
    check_link_components(&item.target)?;
    if fs::symlink_metadata(&item.target).is_ok() {
        return Err(format!("目标路径已存在: {}", item.target.display()));
    }
    probe_source_rename(&item.source)?;
    let target_parent = item
        .target
        .parent()
        .ok_or_else(|| "无法获取目标父目录".to_string())?;
    fs::create_dir_all(target_parent)
        .map_err(|error| format!("创建目标目录失败 {}: {}", target_parent.display(), error))?;

    if !item.cross_device {
        fs::rename(&item.source, &item.target).map_err(|error| {
            format!(
                "移动失败 {} -> {}: {}",
                item.source.display(),
                item.target.display(),
                error
            )
        })?;
        if let Err(error) = link(&item.source, &item.target, item.source_kind, link_type) {
            let rollback = fs::rename(&item.target, &item.source);
            return Err(format!(
                "创建链接失败 {} -> {}: {}；回滚结果: {:?}",
                item.target.display(),
                item.source.display(),
                error,
                rollback
            ));
        }
        return Ok(());
    }

    let staging_root = unique_sibling(&item.target, ".staging")?;
    let backup = unique_sibling(&item.source, ".backup")?;
    let staged = match copy_to_staging(emit, item, &staging_root, token) {
        Ok(path) => path,
        Err(error) => {
            let _ = remove_path(&staging_root);
            return Err(error);
        }
    };

    if let Err(error) = fs::rename(&item.source, &backup) {
        let _ = remove_path(&staging_root);
        return Err(format!(
            "提交前再次移出源路径失败 {}: {}（未删除源文件）",
            item.source.display(),
            error
        ));
    }
    if let Err(error) = fs::rename(&staged, &item.target) {
        let restore = fs::rename(&backup, &item.source);
        let _ = remove_path(&staging_root);
        return Err(format!(
            "提交目标失败 {}: {}；源恢复结果: {:?}",
            item.target.display(),
            error,
            restore
        ));
    }
    let _ = remove_path(&staging_root);

    if let Err(error) = link(&item.source, &item.target, item.source_kind, link_type) {
        let target_cleanup = remove_path(&item.target);
        let restore = fs::rename(&backup, &item.source);
        return Err(format!(
            "创建链接失败 {} -> {}: {}；目标清理: {:?}；源恢复: {:?}",
            item.target.display(),
            item.source.display(),
            error,
            target_cleanup,
            restore
        ));
    }

    if let Err(error) = recycle(&backup) {
        warnings.push(format!(
            "已完成搬家和链接，但备份清理失败（备份保留在 {}）: {}",
            backup.display(),
            error
        ));
    }
    Ok(())
}

pub fn move_and_link(
    token: CancellationToken,
    emit: &(dyn Fn(CopyProgress) + Sync),
    source_paths: Vec<String>,
    target_dir: String,
    link_type: String,
    base_source_dir: Option<String>,
) -> Result<SymlinkOperationOutcome, String> {
    let start = Instant::now();
    if token.is_cancelled() {
        return Err("操作已被用户取消".to_string());
    }
    let (report, plan) = build_plan(
        &source_paths,
        &target_dir,
        &link_type,
        "move",
        base_source_dir.as_deref(),
    )?;
    if !report.can_execute {
        return Err(format!(
            "预检未通过:\n{}",
            report.blocking_issues.join("\n")
        ));
    }

    let mut errors = Vec::new();
    let mut warnings = report.warnings;
    let mut processed_files = Vec::new();
    for item in &plan {
        match move_one(
            emit,
            item,
            &link_type,
            &token,
            &mut warnings,
            &create_link,
            &|path| trash::delete(path).map_err(|error| error.to_string()),
        ) {
            Ok(()) => processed_files.push(item.source.to_string_lossy().to_string()),
            Err(error) => errors.push(error),
        }
        if token.is_cancelled() {
            errors.push("操作已被用户取消".to_string());
            break;
        }
    }

    let processed_count = processed_files.len();
    let log = OperationLog {
        timestamp: now_timestamp(),
        operation_type: "move".to_string(),
        link_type,
        source_count: source_paths.len(),
        success_count: processed_files.len(),
        error_count: errors.len(),
        errors: errors.clone(),
        warnings: warnings.clone(),
        duration_ms: start.elapsed().as_millis(),
        target_directory: target_dir,
        source_paths,
        total_size: report.total_size,
        processed_files,
    };

    let mut message = format!("成功处理 {} 个文件", processed_count);
    if !errors.is_empty() {
        message.push_str(&format!(
            "，{} 个错误:\n- {}",
            errors.len(),
            errors.join("\n- ")
        ));
    }
    if !warnings.is_empty() {
        message.push_str(&format!("\n清理提醒:\n- {}", warnings.join("\n- ")));
    }
    Ok(SymlinkOperationOutcome { message, log })
}

pub fn create_links_only(
    token: CancellationToken,
    source_paths: Vec<String>,
    target_dir: String,
    link_type: String,
    base_source_dir: Option<String>,
) -> Result<SymlinkOperationOutcome, String> {
    let start = Instant::now();
    if token.is_cancelled() {
        return Err("操作已被用户取消".to_string());
    }
    let (report, plan) = build_plan(
        &source_paths,
        &target_dir,
        &link_type,
        "link-only",
        base_source_dir.as_deref(),
    )?;
    if !report.can_execute {
        return Err(format!(
            "预检未通过:\n{}",
            report.blocking_issues.join("\n")
        ));
    }
    let mut errors = Vec::new();
    let mut processed_files = Vec::new();
    for item in &plan {
        if token.is_cancelled() {
            errors.push("操作已被用户取消".to_string());
            break;
        }
        if let Err(error) =
            check_link_components(&item.source).and_then(|_| check_link_components(&item.target))
        {
            errors.push(error);
            continue;
        }
        let parent = item
            .target
            .parent()
            .ok_or_else(|| "无法获取目标父目录".to_string())?;
        if let Err(error) = fs::create_dir_all(parent) {
            errors.push(format!("创建目标目录失败 {}: {}", parent.display(), error));
            continue;
        }
        match create_link(&item.target, &item.source, item.source_kind, &link_type) {
            Ok(()) => processed_files.push(item.target.to_string_lossy().to_string()),
            Err(error) => errors.push(format!(
                "创建链接失败 {} -> {}: {}",
                item.source.display(),
                item.target.display(),
                error
            )),
        }
    }
    let processed_count = processed_files.len();
    let log = OperationLog {
        timestamp: now_timestamp(),
        operation_type: "link-only".to_string(),
        link_type,
        source_count: source_paths.len(),
        success_count: processed_files.len(),
        error_count: errors.len(),
        errors: errors.clone(),
        warnings: Vec::new(),
        duration_ms: start.elapsed().as_millis(),
        target_directory: target_dir,
        source_paths,
        total_size: report.total_size,
        processed_files,
    };
    let mut message = format!("成功创建 {} 个链接", processed_count);
    if !errors.is_empty() {
        message.push_str(&format!(
            "，{} 个错误:\n- {}",
            errors.len(),
            errors.join("\n- ")
        ));
    }
    Ok(SymlinkOperationOutcome { message, log })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    // Unix 合法的反斜杠文件名须按普通字符处理，预检仍需阻断真实的嵌套源。
    #[cfg(unix)]
    #[test]
    fn preflight_accepts_backslash_named_siblings() {
        let root = tempdir().unwrap();
        let parent = root.path().join("parent");
        let sibling = root.path().join(r"parent\child");
        let target = root.path().join("target");
        for dir in [&parent, &sibling, &target] {
            fs::create_dir_all(dir).unwrap();
        }
        fs::write(parent.join("file.txt"), b"parent").unwrap();
        fs::write(sibling.join("file.txt"), b"sibling").unwrap();
        let (report, _) = build_plan(
            &[
                parent.to_string_lossy().to_string(),
                sibling.to_string_lossy().to_string(),
            ],
            &target.to_string_lossy(),
            "symlink",
            "move",
            None,
        )
        .unwrap();
        assert!(report.can_execute, "{:?}", report.blocking_issues);
        assert_eq!(fs::read(parent.join("file.txt")).unwrap(), b"parent");
        assert_eq!(fs::read(sibling.join("file.txt")).unwrap(), b"sibling");
    }

    #[test]
    fn preflight_blocks_existing_target_before_mutation() {
        let root = tempdir().unwrap();
        let source = root.path().join("source.txt");
        let target_dir = root.path().join("target");
        fs::create_dir_all(&target_dir).unwrap();
        fs::write(&source, b"hello").unwrap();
        fs::write(target_dir.join("source.txt"), b"existing").unwrap();

        let (report, _) = build_plan(
            &[source.to_string_lossy().to_string()],
            &target_dir.to_string_lossy(),
            "symlink",
            "move",
            None,
        )
        .unwrap();
        assert!(!report.can_execute);
        assert!(report
            .blocking_issues
            .iter()
            .any(|issue| issue.contains("目标路径已存在")));
        assert_eq!(fs::read(&source).unwrap(), b"hello");
    }

    #[test]
    fn source_rename_probe_restores_the_original_path() {
        let root = tempdir().unwrap();
        let source = root.path().join("source.txt");
        fs::write(&source, b"hello").unwrap();

        probe_source_rename(&source).unwrap();

        assert_eq!(fs::read(&source).unwrap(), b"hello");
        assert!(!root.path().read_dir().unwrap().any(|entry| entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .contains("rename-probe")));
    }

    #[test]
    fn preflight_rejects_nested_sources() {
        let root = tempdir().unwrap();
        let parent = root.path().join("parent");
        let child = parent.join("child");
        let target = root.path().join("target");
        fs::create_dir_all(&child).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(child.join("file.txt"), b"hello").unwrap();

        let (report, _) = build_plan(
            &[
                parent.to_string_lossy().to_string(),
                child.to_string_lossy().to_string(),
            ],
            &target.to_string_lossy(),
            "symlink",
            "move",
            None,
        )
        .unwrap();
        assert!(!report.can_execute);
        assert!(report
            .blocking_issues
            .iter()
            .any(|issue| issue.contains("源路径互相嵌套")));
    }
    #[test]
    fn preflight_rejects_non_adjacent_nested_sources() {
        let root = tempdir().unwrap();
        let parent = root.path().join("a");
        let other = root.path().join("b");
        let child = parent.join("child");
        let target = root.path().join("target");
        for path in [&child, &other, &target] {
            fs::create_dir_all(path).unwrap();
        }
        fs::write(child.join("value.txt"), b"keep").unwrap();
        let (report, _) = build_plan(
            &[
                parent.to_string_lossy().into(),
                other.to_string_lossy().into(),
                child.to_string_lossy().into(),
            ],
            &target.to_string_lossy(),
            "symlink",
            "move",
            None,
        )
        .unwrap();
        assert!(!report.can_execute);
        assert!(report
            .blocking_issues
            .iter()
            .any(|issue| issue.contains("互相嵌套")));
        assert_eq!(fs::read(child.join("value.txt")).unwrap(), b"keep");
    }

    #[test]
    fn mirror_move_retains_file_contents_and_hard_link_identity() {
        let root = tempdir().unwrap();
        let base = root.path().join("source");
        let source = base.join("中文").join("model.bin");
        let target = root.path().join("target");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        fs::create_dir(&target).unwrap();
        fs::write(&source, b"original").unwrap();
        let outcome = move_and_link(
            CancellationToken::new(),
            &|_| {},
            vec![source.to_string_lossy().into()],
            target.to_string_lossy().into(),
            "link".into(),
            Some(base.to_string_lossy().into()),
        )
        .unwrap();
        assert_eq!(outcome.log.success_count, 1);
        assert_eq!(outcome.log.error_count, 0);
        let moved = target.join("中文").join("model.bin");
        assert_eq!(fs::read(&source).unwrap(), b"original");
        fs::write(&moved, b"shared").unwrap();
        assert_eq!(fs::read(&source).unwrap(), b"shared");
    }

    #[test]
    fn execution_conflict_keeps_the_entire_batch_unchanged() {
        let root = tempdir().unwrap();
        let target = root.path().join("target");
        fs::create_dir(&target).unwrap();
        let a = root.path().join("a.txt");
        let b = root.path().join("b.txt");
        fs::write(&a, b"a").unwrap();
        fs::write(&b, b"b").unwrap();
        fs::write(target.join("b.txt"), b"existing").unwrap();
        assert!(move_and_link(
            CancellationToken::new(),
            &|_| {},
            vec![a.to_string_lossy().into(), b.to_string_lossy().into()],
            target.to_string_lossy().into(),
            "link".into(),
            None
        )
        .is_err());
        assert_eq!(fs::read(&a).unwrap(), b"a");
        assert_eq!(fs::read(&b).unwrap(), b"b");
        assert!(!target.join("a.txt").exists());
        assert_eq!(fs::read(target.join("b.txt")).unwrap(), b"existing");
    }

    fn planned_file(root: &Path, cross_device: bool) -> PlannedItem {
        let source = root.join("source.txt");
        let target_dir = root.join("target");
        fs::create_dir(&target_dir).unwrap();
        fs::write(&source, b"valuable data").unwrap();
        PlannedItem {
            source,
            target: target_dir.join("source.txt"),
            source_kind: SourceKind::File,
            size: 13,
            cross_device,
        }
    }
    #[test]
    fn failed_link_creation_restores_source_for_rename_and_copy_transactions() {
        for cross_device in [false, true] {
            let root = tempdir().unwrap();
            let item = planned_file(root.path(), cross_device);
            let error = move_one(
                &|_| {},
                &item,
                "link",
                &CancellationToken::new(),
                &mut Vec::new(),
                &|_, _, _, _| {
                    Err(std::io::Error::new(
                        std::io::ErrorKind::PermissionDenied,
                        "link denied",
                    ))
                },
                &|_| panic!("failed transaction must retain its backup"),
            )
            .unwrap_err();
            assert!(error.contains("创建链接失败"));
            assert_eq!(fs::read(&item.source).unwrap(), b"valuable data");
            assert!(!item.target.exists());
            assert_eq!(root.path().read_dir().unwrap().count(), 2);
            assert_eq!(item.target.parent().unwrap().read_dir().unwrap().count(), 0);
        }
    }
    #[test]
    fn cancelling_copy_leaves_source_and_cleans_staging_before_commit() {
        let root = tempdir().unwrap();
        let item = planned_file(root.path(), true);
        let token = CancellationToken::new();
        let error = move_one(
            &|_| token.cancel(),
            &item,
            "link",
            &token,
            &mut Vec::new(),
            &create_link,
            &|_| Ok(()),
        )
        .unwrap_err();
        assert!(error.contains("已被用户取消"));
        assert_eq!(fs::read(&item.source).unwrap(), b"valuable data");
        assert!(!item.target.exists());
        assert_eq!(item.target.parent().unwrap().read_dir().unwrap().count(), 0);
    }
    #[test]
    fn failed_recycle_preserves_recoverable_backup_and_completed_links() {
        let root = tempdir().unwrap();
        let item = planned_file(root.path(), true);
        let mut warnings = Vec::new();
        move_one(
            &|_| {},
            &item,
            "link",
            &CancellationToken::new(),
            &mut warnings,
            &create_link,
            &|_| Err("recycle unavailable".into()),
        )
        .unwrap();
        assert_eq!(fs::read(&item.source).unwrap(), b"valuable data");
        assert_eq!(fs::read(&item.target).unwrap(), b"valuable data");
        let backup = root
            .path()
            .read_dir()
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .find(|path| {
                path.file_name()
                    .unwrap()
                    .to_string_lossy()
                    .ends_with(".backup")
            })
            .unwrap();
        assert_eq!(fs::read(&backup).unwrap(), b"valuable data");
        assert!(warnings[0].contains(&backup.to_string_lossy().to_string()));
    }
}
