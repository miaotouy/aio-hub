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

use blake3::Hasher as Blake3Hasher;
use content_inspector::inspect;
use ignore::{WalkBuilder, WalkState};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;

// ==================== 取消机制 ====================

/// 查重扫描取消标志（独立于 directory-janitor 的 ScanCancellation）
pub struct DedupScanCancellation {
    cancelled: Arc<AtomicBool>,
}

impl DedupScanCancellation {
    pub fn new() -> Self {
        Self {
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    pub fn reset(&self) {
        self.cancelled.store(false, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}

impl Default for DedupScanCancellation {
    fn default() -> Self {
        Self::new()
    }
}

// ==================== 配置结构 ====================

/// 规范化选项
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizeOptions {
    /// 忽略空白字符
    pub ignore_whitespace: bool,
    /// 忽略标点
    pub ignore_punctuation: bool,
    /// 大小写敏感
    pub case_sensitive: bool,
    /// 保留换行（代码需要）
    pub preserve_line_breaks: bool,
}

impl Default for NormalizeOptions {
    fn default() -> Self {
        Self {
            ignore_whitespace: true,
            ignore_punctuation: false,
            case_sensitive: true,
            preserve_line_breaks: false,
        }
    }
}

/// 相似度配置
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimilarityConfig {
    /// 扩展名白名单（空数组表示所有文本文件）
    pub extensions: Vec<String>,
    /// glob 忽略模式
    pub ignore_patterns: Vec<String>,
    /// 最大文件大小 (MB)
    pub max_file_size_mb: u64,
    /// 尺寸差异阈值（默认 0.05 即 5%）
    pub size_diff_threshold: f32,
    /// 最小相似度阈值（默认 0.85）
    #[allow(dead_code)]
    pub min_similarity: f32,
    /// 小文件阈值 (bytes)，默认 3072 (3KB)
    pub suspicious_size_limit: u64,
    /// 预设名称
    #[allow(dead_code)]
    pub preset: String,
    /// 规范化选项
    pub normalize_options: NormalizeOptions,
}

// ==================== 结果结构 ====================

/// 文件信息
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DedupFileInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub modified: u64,
    pub extension: String,
    pub is_text: bool,
}

/// 相似文件
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimilarFile {
    pub file: DedupFileInfo,
    pub similarity: f64,
    pub match_type: String, // "exact" | "normalized" | "fuzzy"
    pub diff_summary: Option<String>,
}

/// 重复组
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroup {
    pub id: String,
    pub representative_file: DedupFileInfo,
    pub similar_files: Vec<SimilarFile>,
    pub metadata: DuplicateGroupMetadata,
}

/// 重复组元数据
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroupMetadata {
    pub is_suspicious: bool,
    pub total_wasted_bytes: u64,
    pub avg_similarity: f64,
}

/// 扫描结果
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DedupAnalysisResult {
    pub groups: Vec<DuplicateGroup>,
    pub statistics: DedupStatistics,
    pub skipped_files: Vec<SkippedFile>,
}

/// 统计信息
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DedupStatistics {
    pub total_files_scanned: usize,
    pub total_text_files: usize,
    pub total_groups: usize,
    pub total_duplicates: usize,
    pub total_wasted_bytes: u64,
}

/// 跳过的文件
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedFile {
    pub path: String,
    pub reason: String,
}

/// 扫描进度事件
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DedupScanProgress {
    pub stage: String, // "collecting" | "size-filter" | "fingerprint" | "hashing" | "building"
    pub stage_progress: StageProgress,
    pub found_groups: usize,
    pub current_file: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageProgress {
    pub current: usize,
    pub total: usize,
}

// ==================== 内部工作结构 ====================

/// 收集到的文件元数据
#[derive(Debug, Clone)]
struct CollectedFile {
    path: PathBuf,
    name: String,
    size: u64,
    modified: u64,
    extension: String,
}

// ==================== 规范化逻辑 ====================

/// 对字节流进行规范化处理
fn normalize_bytes(data: &[u8], options: &NormalizeOptions) -> Vec<u8> {
    let mut result = Vec::with_capacity(data.len());

    for &byte in data {
        // 跳过 BOM (UTF-8: EF BB BF)
        // BOM 处理在调用前已经做了，这里主要处理字符级别

        // 忽略空白字符
        if options.ignore_whitespace {
            if byte == b' ' || byte == b'\t' || byte == b'\r' {
                continue;
            }
            // 换行符特殊处理
            if byte == b'\n' && !options.preserve_line_breaks {
                continue;
            }
        } else {
            // 即使不忽略空白，也统一 \r\n -> \n
            if byte == b'\r' {
                continue;
            }
        }

        // 忽略标点
        if options.ignore_punctuation && byte.is_ascii_punctuation() {
            continue;
        }

        // 大小写不敏感
        if !options.case_sensitive && byte.is_ascii_alphabetic() {
            result.push(byte.to_ascii_lowercase());
        } else {
            result.push(byte);
        }
    }

    result
}

/// 跳过 UTF-8 BOM
fn skip_bom(data: &[u8]) -> &[u8] {
    if data.len() >= 3 && data[0] == 0xEF && data[1] == 0xBB && data[2] == 0xBF {
        &data[3..]
    } else {
        data
    }
}

// ==================== 漏斗各层实现 ====================
/// Step 1: 遍历目录，收集文件元数据（并行 walker）
fn collect_files(
    root: &PathBuf,
    config: &SimilarityConfig,
    cancellation: &DedupScanCancellation,
    skipped: &Mutex<Vec<SkippedFile>>,
    progress: &(dyn Fn(DedupScanProgress) + Sync),
) -> Vec<CollectedFile> {
    let max_size_bytes = config.max_file_size_mb * 1024 * 1024;
    let files: Arc<Mutex<Vec<CollectedFile>>> = Arc::new(Mutex::new(Vec::new()));
    let scanned = Arc::new(AtomicUsize::new(0));

    // 使用 ignore crate 遍历（默认不跟随 symlinks，支持当前根目录内的 .gitignore）
    let mut builder = WalkBuilder::new(root);
    builder.hidden(false); // 不跳过隐藏文件（由用户决定）
    builder.parents(false); // 不向上查找父目录的 ignore 文件，避免父级规则误排除扫描目录内容
    builder.git_global(false); // 不使用全局 gitignore
    builder.git_exclude(false); // 不使用 .git/info/exclude
    builder.follow_links(false); // 不跟随符号链接

    // 添加忽略模式
    if !config.ignore_patterns.is_empty() {
        let mut override_builder = ignore::overrides::OverrideBuilder::new(root);
        for pattern in &config.ignore_patterns {
            let trimmed = pattern.trim();
            if !trimmed.is_empty() {
                if let Err(e) = override_builder.add(&format!("!{}", trimmed)) {
                    skipped.lock().unwrap().push(SkippedFile {
                        path: "<config>".to_string(),
                        reason: format!("无效的忽略模式 '{}': {}", trimmed, e),
                    });
                }
            }
        }
        match override_builder.build() {
            Ok(overrides) => {
                builder.overrides(overrides);
            }
            Err(e) => {
                skipped.lock().unwrap().push(SkippedFile {
                    path: "<config>".to_string(),
                    reason: format!("构建忽略模式失败: {}", e),
                });
            }
        }
    }

    // 克隆需要在闭包中使用的数据
    let extensions = config.extensions.clone();
    let cancelled_flag = cancellation.cancelled.clone();

    // 使用并行 walker
    let walker = builder.build_parallel();
    walker.run(|| {
        let files = files.clone();
        let scanned = scanned.clone();
        let extensions = extensions.clone();
        let cancelled_flag = cancelled_flag.clone();

        Box::new(move |entry_result| {
            if cancelled_flag.load(Ordering::Relaxed) {
                return WalkState::Quit;
            }

            let entry = match entry_result {
                Ok(e) => e,
                Err(e) => {
                    skipped.lock().unwrap().push(SkippedFile {
                        path: "<unknown>".to_string(),
                        reason: format!("遍历错误: {}", e),
                    });
                    return WalkState::Continue;
                }
            };

            // 只处理文件
            if !entry.file_type().is_some_and(|ft| ft.is_file()) {
                return WalkState::Continue;
            }

            let path = entry.path().to_path_buf();
            let name = entry.file_name().to_string_lossy().to_string();
            let extension = path
                .extension()
                .map(|e| e.to_string_lossy().to_string())
                .unwrap_or_default();

            // 扩展名过滤
            if !extensions.is_empty() {
                let ext_lower = extension.to_lowercase();
                if !extensions.iter().any(|e| e.to_lowercase() == ext_lower) {
                    return WalkState::Continue;
                }
            }

            // 获取元数据
            let metadata = match fs::metadata(&path) {
                Ok(m) => m,
                Err(e) => {
                    skipped.lock().unwrap().push(SkippedFile {
                        path: path.to_string_lossy().to_string(),
                        reason: format!("无法读取元数据: {}", e),
                    });
                    return WalkState::Continue;
                }
            };

            let size = metadata.len();

            // 跳过空文件
            if size == 0 {
                return WalkState::Continue;
            }

            // 大小限制
            if size > max_size_bytes {
                return WalkState::Continue;
            }

            // 检测是否为文本文件（读取前 512 字节）
            let is_text = match File::open(&path) {
                Ok(mut f) => {
                    let mut buf = vec![0u8; 512.min(size as usize)];
                    match f.read(&mut buf) {
                        Ok(n) => !inspect(&buf[..n]).is_binary(),
                        Err(_) => false,
                    }
                }
                Err(e) => {
                    skipped.lock().unwrap().push(SkippedFile {
                        path: path.to_string_lossy().to_string(),
                        reason: format!("无法打开文件: {}", e),
                    });
                    return WalkState::Continue;
                }
            };

            if !is_text {
                return WalkState::Continue;
            }

            let modified = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);

            files.lock().unwrap().push(CollectedFile {
                path,
                name,
                size,
                modified,
                extension,
            });

            let count = scanned.fetch_add(1, Ordering::Relaxed) + 1;

            // 每 100 个文件上报一次进度
            if count.is_multiple_of(100) {
                progress(DedupScanProgress {
                    stage: "collecting".to_string(),
                    stage_progress: StageProgress {
                        current: count,
                        total: 0, // 总数未知
                    },
                    found_groups: 0,
                    current_file: Some(entry.path().to_string_lossy().to_string()),
                });
            }

            WalkState::Continue
        })
    });

    Arc::try_unwrap(files).unwrap().into_inner().unwrap()
}

/// Step 2: 按尺寸分桶（±threshold 容差）
/// 小文件 (<suspicious_size_limit) 单独分组
fn group_by_size(
    files: Vec<CollectedFile>,
    threshold: f32,
    suspicious_limit: u64,
) -> (Vec<Vec<CollectedFile>>, Vec<CollectedFile>) {
    // 分离小文件
    let mut small_files = Vec::new();
    let mut normal_files: Vec<CollectedFile> = Vec::new();

    for file in files {
        if file.size < suspicious_limit {
            small_files.push(file);
        } else {
            normal_files.push(file);
        }
    }

    // 对普通文件按大小排序
    normal_files.sort_by_key(|f| f.size);

    // 贪心分桶：相邻文件大小差异在阈值内则归为一组
    let mut buckets: Vec<Vec<CollectedFile>> = Vec::new();

    for file in normal_files {
        let fits_last = if let Some(last_bucket) = buckets.last() {
            let representative_size = last_bucket[0].size;
            let diff =
                (file.size as f64 - representative_size as f64).abs() / representative_size as f64;
            diff <= threshold as f64
        } else {
            false
        };

        if fits_last {
            buckets.last_mut().unwrap().push(file);
        } else {
            buckets.push(vec![file]);
        }
    }

    // 只保留有 2 个以上文件的桶
    let buckets: Vec<Vec<CollectedFile>> = buckets.into_iter().filter(|b| b.len() >= 2).collect();

    (buckets, small_files)
}

/// Step 3: 快速指纹（前4KB + 后4KB 的规范化哈希）
fn compute_quick_fingerprint(
    path: &PathBuf,
    size: u64,
    options: &NormalizeOptions,
) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| format!("打开文件失败: {}", e))?;
    let chunk_size = 4096u64;

    let mut buf = Vec::new();

    // 读取前 4KB
    let front_size = chunk_size.min(size) as usize;
    let mut front_buf = vec![0u8; front_size];
    file.read_exact(&mut front_buf)
        .map_err(|e| format!("读取文件头部失败: {}", e))?;
    buf.extend_from_slice(skip_bom(&front_buf));

    // 读取后 4KB（如果文件大于 4KB）
    if size > chunk_size {
        let back_start = size.saturating_sub(chunk_size);
        file.seek(SeekFrom::Start(back_start))
            .map_err(|e| format!("定位文件尾部失败: {}", e))?;
        let mut back_buf = vec![0u8; chunk_size as usize];
        let n = file
            .read(&mut back_buf)
            .map_err(|e| format!("读取文件尾部失败: {}", e))?;
        buf.extend_from_slice(&back_buf[..n]);
    }

    // 规范化后计算哈希
    let normalized = normalize_bytes(&buf, options);
    let hash = blake3::hash(&normalized);
    Ok(hash.to_hex().to_string())
}

/// Step 4: 规范化全文流式哈希
fn compute_normalized_full_hash(
    path: &PathBuf,
    options: &NormalizeOptions,
    cancellation: &DedupScanCancellation,
) -> Result<(String, String), String> {
    let mut file = File::open(path).map_err(|e| format!("打开文件失败: {}", e))?;
    let mut raw_hasher = Blake3Hasher::new();
    let mut norm_hasher = Blake3Hasher::new();

    let mut buf = [0u8; 65536]; // 64KB buffer
    let mut is_first_chunk = true;

    loop {
        if cancellation.is_cancelled() {
            return Err("扫描已被用户取消".to_string());
        }
        let n = file
            .read(&mut buf)
            .map_err(|e| format!("读取文件失败: {}", e))?;
        if n == 0 {
            break;
        }

        let chunk = &buf[..n];

        // 原始哈希
        raw_hasher.update(chunk);

        // 规范化哈希
        let data = if is_first_chunk {
            is_first_chunk = false;
            skip_bom(chunk)
        } else {
            chunk
        };
        let normalized = normalize_bytes(data, options);
        norm_hasher.update(&normalized);
    }

    let raw_hash = raw_hasher.finalize().to_hex().to_string();
    let norm_hash = norm_hasher.finalize().to_hex().to_string();

    Ok((raw_hash, norm_hash))
}

/// 选择代表文件：修改时间最新的文件
fn select_representative(files: &[&CollectedFile]) -> usize {
    files
        .iter()
        .enumerate()
        .max_by_key(|(_, f)| f.modified)
        .map(|(i, _)| i)
        .unwrap_or(0)
}

/// 构建 DedupFileInfo
fn to_file_info(file: &CollectedFile) -> DedupFileInfo {
    DedupFileInfo {
        path: file.path.to_string_lossy().to_string(),
        name: file.name.clone(),
        size: file.size,
        modified: file.modified,
        extension: file.extension.clone(),
        is_text: true,
    }
}

// ==================== 主扫描命令 ====================

pub fn scan_content_duplicates(
    path: String,
    config: SimilarityConfig,
    cancellation: &DedupScanCancellation,
    progress: &(dyn Fn(DedupScanProgress) + Sync),
) -> Result<DedupAnalysisResult, String> {
    if cancellation.is_cancelled() {
        return Err("扫描已被用户取消".to_string());
    }
    if !config.size_diff_threshold.is_finite()
        || !(0.0..=1.0).contains(&config.size_diff_threshold)
        || !config.min_similarity.is_finite()
        || !(0.0..=1.0).contains(&config.min_similarity)
    {
        return Err("尺寸差异与相似度阈值需在 0 到 1 之间".to_string());
    }
    if config.max_file_size_mb.checked_mul(1024 * 1024).is_none() {
        return Err("最大文件大小超出支持范围".to_string());
    }

    let root_path = PathBuf::from(&path);
    if !root_path.exists() {
        return Err(format!("路径不存在: {}", path));
    }
    if !root_path.is_dir() {
        return Err(format!("路径不是目录: {}", path));
    }

    let skipped = Mutex::new(Vec::<SkippedFile>::new());

    // ===== Step 1: 收集文件 =====
    progress(DedupScanProgress {
        stage: "collecting".to_string(),
        stage_progress: StageProgress {
            current: 0,
            total: 0,
        },
        found_groups: 0,
        current_file: None,
    });

    let all_files = collect_files(&root_path, &config, cancellation, &skipped, progress);
    let total_files_scanned = all_files.len();

    if cancellation.is_cancelled() {
        return Err("扫描已被用户取消".to_string());
    }

    // ===== Step 2: 尺寸分桶 =====
    progress(DedupScanProgress {
        stage: "size-filter".to_string(),
        stage_progress: StageProgress {
            current: 0,
            total: total_files_scanned,
        },
        found_groups: 0,
        current_file: None,
    });

    let (size_buckets, small_files) = group_by_size(
        all_files,
        config.size_diff_threshold,
        config.suspicious_size_limit,
    );

    if cancellation.is_cancelled() {
        return Err("扫描已被用户取消".to_string());
    }

    // ===== Step 3 & 4: 快速指纹 + 全文哈希 =====
    // 对于小文件，跳过快速指纹，直接全文哈希
    // 对于普通文件桶，先快速指纹分组，再全文哈希

    let normalize_options = config.normalize_options.clone();
    let mut all_groups: Vec<DuplicateGroup> = Vec::new();
    let mut group_counter = 0usize;

    // --- 处理普通文件桶 ---
    let total_buckets = size_buckets.len();
    for (bucket_idx, bucket) in size_buckets.iter().enumerate() {
        if cancellation.is_cancelled() {
            return Err("扫描已被用户取消".to_string());
        }

        progress(DedupScanProgress {
            stage: "fingerprint".to_string(),
            stage_progress: StageProgress {
                current: bucket_idx,
                total: total_buckets,
            },
            found_groups: all_groups.len(),
            current_file: None,
        });

        // Step 3: 快速指纹分组
        let mut fingerprint_groups: HashMap<String, Vec<&CollectedFile>> = HashMap::new();

        for file in bucket {
            if cancellation.is_cancelled() {
                return Err("扫描已被用户取消".to_string());
            }
            match compute_quick_fingerprint(&file.path, file.size, &normalize_options) {
                Ok(fp) => {
                    fingerprint_groups.entry(fp).or_default().push(file);
                }
                Err(reason) => {
                    skipped.lock().unwrap().push(SkippedFile {
                        path: file.path.to_string_lossy().to_string(),
                        reason,
                    });
                }
            }
        }

        // 只保留有 2 个以上文件的指纹组
        let fp_groups: Vec<Vec<&CollectedFile>> = fingerprint_groups
            .into_values()
            .filter(|g| g.len() >= 2)
            .collect();

        // Step 4: 对每个指纹组并行计算全文哈希
        for fp_group in fp_groups {
            if cancellation.is_cancelled() {
                return Err("扫描已被用户取消".to_string());
            }

            // 并行计算全文哈希
            let hash_results: Vec<_> = fp_group
                .par_iter()
                .filter_map(|file| {
                    if cancellation.is_cancelled() {
                        return None;
                    }
                    match compute_normalized_full_hash(&file.path, &normalize_options, cancellation)
                    {
                        Ok((raw_hash, norm_hash)) => Some((*file, raw_hash, norm_hash)),
                        Err(reason) => {
                            skipped.lock().unwrap().push(SkippedFile {
                                path: file.path.to_string_lossy().to_string(),
                                reason,
                            });
                            None
                        }
                    }
                })
                .collect();

            let mut hash_map: HashMap<String, Vec<(&CollectedFile, String)>> = HashMap::new();
            for (file, raw_hash, norm_hash) in &hash_results {
                hash_map
                    .entry(norm_hash.clone())
                    .or_default()
                    .push((file, raw_hash.clone()));
            }

            // 构建重复组
            for (_norm_hash, members) in hash_map {
                if members.len() < 2 {
                    continue;
                }

                let files_ref: Vec<&CollectedFile> = members.iter().map(|(f, _)| *f).collect();
                let raw_hashes: Vec<&str> = members.iter().map(|(_, h)| h.as_str()).collect();

                let rep_idx = select_representative(&files_ref);
                let representative = files_ref[rep_idx];

                // 判断是否所有原始哈希一致（exact）
                let all_exact = raw_hashes.iter().all(|h| *h == raw_hashes[0]);

                let mut similar_files = Vec::new();
                for (i, (file, _raw_hash)) in members.iter().enumerate() {
                    if i == rep_idx {
                        continue;
                    }
                    similar_files.push(SimilarFile {
                        file: to_file_info(file),
                        similarity: 1.0,
                        match_type: if all_exact {
                            "exact".to_string()
                        } else {
                            "normalized".to_string()
                        },
                        diff_summary: None,
                    });
                }

                let total_wasted: u64 = similar_files.iter().map(|sf| sf.file.size).sum();

                group_counter += 1;
                all_groups.push(DuplicateGroup {
                    id: format!("group-{}", group_counter),
                    representative_file: to_file_info(representative),
                    similar_files,
                    metadata: DuplicateGroupMetadata {
                        is_suspicious: false,
                        total_wasted_bytes: total_wasted,
                        avg_similarity: 1.0,
                    },
                });
            }
        }
    }

    // --- 处理小文件（跳过尺寸过滤和快速指纹，直接全文哈希）---
    if !small_files.is_empty() {
        progress(DedupScanProgress {
            stage: "hashing".to_string(),
            stage_progress: StageProgress {
                current: 0,
                total: small_files.len(),
            },
            found_groups: all_groups.len(),
            current_file: None,
        });

        // 并行计算小文件全文哈希
        let small_progress = Arc::new(AtomicUsize::new(0));
        let small_total = small_files.len();
        let groups_found = all_groups.len();

        let small_hash_results: Vec<_> = small_files
            .par_iter()
            .filter_map(|file| {
                if cancellation.is_cancelled() {
                    return None;
                }

                let idx = small_progress.fetch_add(1, Ordering::Relaxed);
                if idx.is_multiple_of(50) {
                    progress(DedupScanProgress {
                        stage: "hashing".to_string(),
                        stage_progress: StageProgress {
                            current: idx,
                            total: small_total,
                        },
                        found_groups: groups_found,
                        current_file: Some(file.path.to_string_lossy().to_string()),
                    });
                }

                match compute_normalized_full_hash(&file.path, &normalize_options, cancellation) {
                    Ok((raw_hash, norm_hash)) => Some((file, raw_hash, norm_hash)),
                    Err(reason) => {
                        skipped.lock().unwrap().push(SkippedFile {
                            path: file.path.to_string_lossy().to_string(),
                            reason,
                        });
                        None
                    }
                }
            })
            .collect();

        let mut small_hash_map: HashMap<String, Vec<(&CollectedFile, String)>> = HashMap::new();
        for (file, raw_hash, norm_hash) in &small_hash_results {
            small_hash_map
                .entry(norm_hash.clone())
                .or_default()
                .push((file, raw_hash.clone()));
        }

        // 构建小文件重复组
        for (_norm_hash, members) in small_hash_map {
            if members.len() < 2 {
                continue;
            }

            let files_ref: Vec<&CollectedFile> = members.iter().map(|(f, _)| *f).collect();
            let raw_hashes: Vec<&str> = members.iter().map(|(_, h)| h.as_str()).collect();

            let rep_idx = select_representative(&files_ref);
            let representative = files_ref[rep_idx];
            let all_exact = raw_hashes.iter().all(|h| *h == raw_hashes[0]);

            let mut similar_files = Vec::new();
            for (i, (file, _)) in members.iter().enumerate() {
                if i == rep_idx {
                    continue;
                }
                similar_files.push(SimilarFile {
                    file: to_file_info(file),
                    similarity: 1.0,
                    match_type: if all_exact {
                        "exact".to_string()
                    } else {
                        "normalized".to_string()
                    },
                    diff_summary: None,
                });
            }

            let total_wasted: u64 = similar_files.iter().map(|sf| sf.file.size).sum();

            group_counter += 1;
            all_groups.push(DuplicateGroup {
                id: format!("group-{}", group_counter),
                representative_file: to_file_info(representative),
                similar_files,
                metadata: DuplicateGroupMetadata {
                    is_suspicious: true,
                    total_wasted_bytes: total_wasted,
                    avg_similarity: 1.0,
                },
            });
        }
    }

    if cancellation.is_cancelled() {
        return Err("扫描已被用户取消".to_string());
    }
    // ===== 构建最终结果 =====
    progress(DedupScanProgress {
        stage: "building".to_string(),
        stage_progress: StageProgress {
            current: 0,
            total: 0,
        },
        found_groups: all_groups.len(),
        current_file: None,
    });

    // 按浪费空间降序排列
    all_groups.sort_by(|a, b| {
        b.metadata
            .total_wasted_bytes
            .cmp(&a.metadata.total_wasted_bytes)
    });

    let total_duplicates: usize = all_groups.iter().map(|g| g.similar_files.len()).sum();
    let total_wasted_bytes: u64 = all_groups
        .iter()
        .map(|g| g.metadata.total_wasted_bytes)
        .sum();

    let statistics = DedupStatistics {
        total_files_scanned,
        total_text_files: total_files_scanned, // 已经过滤了非文本
        total_groups: all_groups.len(),
        total_duplicates,
        total_wasted_bytes,
    };

    let skipped_files = skipped.into_inner().unwrap();

    if cancellation.is_cancelled() {
        return Err("扫描已被用户取消".to_string());
    }
    Ok(DedupAnalysisResult {
        groups: all_groups,
        statistics,
        skipped_files,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{self, FileTimes};
    use std::time::{Duration, UNIX_EPOCH};

    fn config() -> SimilarityConfig {
        SimilarityConfig {
            extensions: vec!["txt".into()],
            ignore_patterns: vec![],
            max_file_size_mb: 8,
            size_diff_threshold: 0.05,
            min_similarity: 0.85,
            suspicious_size_limit: 3072,
            preset: "test".into(),
            normalize_options: NormalizeOptions::default(),
        }
    }
    fn scan(root: &PathBuf, config: SimilarityConfig) -> DedupAnalysisResult {
        scan_content_duplicates(
            root.to_string_lossy().into(),
            config,
            &DedupScanCancellation::new(),
            &|_| {},
        )
        .unwrap()
    }
    #[test]
    fn scan_exact_and_normalized_groups_keeps_newest_representative() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        let big = "large exact text\n".repeat(5000);
        fs::write(root.join("old.txt"), &big).unwrap();
        fs::write(root.join("new.txt"), &big).unwrap();
        for (name, seconds) in [("old.txt", 1000), ("new.txt", 2000)] {
            File::options()
                .write(true)
                .open(root.join(name))
                .unwrap()
                .set_times(FileTimes::new().set_modified(UNIX_EPOCH + Duration::from_secs(seconds)))
                .unwrap();
        }
        fs::write(root.join("small-a.txt"), b"\xef\xbb\xbfHello World\r\n").unwrap();
        fs::write(root.join("small-b.txt"), "HelloWorld\n").unwrap();
        let result = scan(&root, config());
        assert_eq!(result.statistics.total_duplicates, 2);
        assert_eq!(result.groups.len(), 2);
        let exact = result
            .groups
            .iter()
            .find(|g| !g.metadata.is_suspicious)
            .unwrap();
        assert_eq!(exact.representative_file.name, "new.txt");
        assert_eq!(exact.similar_files[0].file.name, "old.txt");
        assert_eq!(exact.similar_files[0].match_type, "exact");
        let normalized = result
            .groups
            .iter()
            .find(|g| g.metadata.is_suspicious)
            .unwrap();
        assert_eq!(normalized.similar_files[0].match_type, "normalized");
        assert_eq!(
            result.statistics.total_wasted_bytes,
            exact.metadata.total_wasted_bytes + normalized.metadata.total_wasted_bytes
        );
    }
    #[test]
    fn scan_applies_text_extension_and_custom_ignore_rules() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        fs::create_dir(root.join("ignored")).unwrap();
        for name in ["a.txt", "b.txt", "ignored/c.txt", "wrong.md"] {
            fs::write(root.join(name), "same content").unwrap();
        }
        fs::write(root.join("binary.txt"), [0u8; 256]).unwrap();
        let mut options = config();
        options.ignore_patterns = vec!["ignored/**".into()];
        let result = scan(&root, options);
        assert_eq!(result.groups.len(), 1);
        let group = &result.groups[0];
        let mut names = vec![
            group.representative_file.name.as_str(),
            group.similar_files[0].file.name.as_str(),
        ];
        names.sort();
        assert_eq!(names, vec!["a.txt", "b.txt"]);
        assert_eq!(result.statistics.total_text_files, 2);
    }
    #[test]
    fn scan_respects_case_punctuation_and_retained_line_breaks() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        fs::write(root.join("a.txt"), "HELLO, WORLD!\r\nNEXT").unwrap();
        fs::write(root.join("b.txt"), "helloworld\nnext").unwrap();
        assert!(scan(&root, config()).groups.is_empty());
        let mut options = config();
        options.normalize_options.case_sensitive = false;
        options.normalize_options.ignore_punctuation = true;
        options.normalize_options.preserve_line_breaks = true;
        assert_eq!(scan(&root, options.clone()).groups.len(), 1);
        fs::write(root.join("b.txt"), "helloworldnext").unwrap();
        assert!(scan(&root, options.clone()).groups.is_empty());
        options.normalize_options.preserve_line_breaks = false;
        assert_eq!(scan(&root, options).groups.len(), 1);
    }
    #[test]
    fn scan_cancellation_before_start_and_at_progress_stages_never_returns_success() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_path_buf();
        for name in ["a.txt", "b.txt"] {
            fs::write(root.join(name), "same content").unwrap();
        }
        let token = DedupScanCancellation::new();
        token.cancel();
        assert_eq!(
            scan_content_duplicates(root.to_string_lossy().into(), config(), &token, &|_| {})
                .unwrap_err(),
            "扫描已被用户取消"
        );
        for stage in ["collecting", "size-filter", "hashing", "building"] {
            let token = DedupScanCancellation::new();
            let result = scan_content_duplicates(
                root.to_string_lossy().into(),
                config(),
                &token,
                &|event| {
                    if event.stage == stage {
                        token.cancel();
                    }
                },
            );
            assert_eq!(result.unwrap_err(), "扫描已被用户取消", "stage: {}", stage);
        }
        fs::write(root.join("a.txt"), "long text".repeat(1000)).unwrap();
        fs::write(root.join("b.txt"), "long text".repeat(1000)).unwrap();
        let token = DedupScanCancellation::new();
        assert!(scan_content_duplicates(
            root.to_string_lossy().into(),
            config(),
            &token,
            &|event| {
                if event.stage == "fingerprint" {
                    token.cancel();
                }
            }
        )
        .is_err());
    }
    #[test]
    fn scan_rejects_out_of_range_configuration() {
        let dir = tempfile::tempdir().unwrap();
        let mut options = config();
        options.max_file_size_mb = u64::MAX;
        assert!(scan_content_duplicates(
            dir.path().to_string_lossy().into(),
            options,
            &DedupScanCancellation::new(),
            &|_| {}
        )
        .unwrap_err()
        .contains("最大文件大小"));
        let mut options = config();
        options.size_diff_threshold = -1.0;
        assert!(scan_content_duplicates(
            dir.path().to_string_lossy().into(),
            options,
            &DedupScanCancellation::new(),
            &|_| {}
        )
        .unwrap_err()
        .contains("阈值"));
    }
}
