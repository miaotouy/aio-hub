use blake3::Hasher as Blake3Hasher;
use content_inspector::inspect;
use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;
use tauri::{Emitter, State};

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

/// Step 1: 遍历目录，收集文件元数据
fn collect_files(
    root: &PathBuf,
    config: &SimilarityConfig,
    cancellation: &DedupScanCancellation,
    skipped: &Mutex<Vec<SkippedFile>>,
    window: &tauri::Window,
) -> Vec<CollectedFile> {
    let max_size_bytes = config.max_file_size_mb * 1024 * 1024;
    let mut files = Vec::new();
    let mut scanned = 0usize;

    // 使用 ignore crate 遍历（默认不跟随 symlinks，支持 .gitignore）
    let mut builder = WalkBuilder::new(root);
    builder.hidden(false); // 不跳过隐藏文件（由用户决定）
    builder.follow_links(false); // 不跟随符号链接

    // 添加忽略模式
    for pattern in &config.ignore_patterns {
        let mut override_builder = ignore::overrides::OverrideBuilder::new(root);
        let _ = override_builder.add(&format!("!{}", pattern));
    }

    let walker = builder.build();

    for entry_result in walker {
        if cancellation.is_cancelled() {
            break;
        }

        let entry = match entry_result {
            Ok(e) => e,
            Err(e) => {
                skipped.lock().unwrap().push(SkippedFile {
                    path: "<unknown>".to_string(),
                    reason: format!("遍历错误: {}", e),
                });
                continue;
            }
        };

        // 只处理文件
        let file_type = match entry.file_type() {
            Some(ft) => ft,
            None => continue,
        };
        if !file_type.is_file() {
            continue;
        }

        let path = entry.path().to_path_buf();
        let name = entry.file_name().to_string_lossy().to_string();
        let extension = path
            .extension()
            .map(|e| e.to_string_lossy().to_string())
            .unwrap_or_default();

        // 扩展名过滤
        if !config.extensions.is_empty() {
            let ext_lower = extension.to_lowercase();
            if !config
                .extensions
                .iter()
                .any(|e| e.to_lowercase() == ext_lower)
            {
                continue;
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
                continue;
            }
        };

        let size = metadata.len();

        // 跳过空文件
        if size == 0 {
            continue;
        }

        // 大小限制
        if size > max_size_bytes {
            continue;
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
                continue;
            }
        };

        if !is_text {
            continue;
        }

        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        files.push(CollectedFile {
            path,
            name,
            size,
            modified,
            extension,
        });

        scanned += 1;

        // 每 50 个文件上报一次进度
        if scanned.is_multiple_of(50) {
            let _ = window.emit(
                "dedup-scan-progress",
                DedupScanProgress {
                    stage: "collecting".to_string(),
                    stage_progress: StageProgress {
                        current: scanned,
                        total: 0, // 总数未知
                    },
                    found_groups: 0,
                    current_file: Some(entry.path().to_string_lossy().to_string()),
                },
            );
        }
    }

    files
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
) -> Result<(String, String), String> {
    let mut file = File::open(path).map_err(|e| format!("打开文件失败: {}", e))?;
    let mut raw_hasher = Blake3Hasher::new();
    let mut norm_hasher = Blake3Hasher::new();

    let mut buf = [0u8; 65536]; // 64KB buffer
    let mut is_first_chunk = true;

    loop {
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

#[tauri::command]
pub async fn scan_content_duplicates(
    path: String,
    config: SimilarityConfig,
    window: tauri::Window,
    cancellation: State<'_, DedupScanCancellation>,
) -> Result<DedupAnalysisResult, String> {
    cancellation.reset();

    let root_path = PathBuf::from(&path);
    if !root_path.exists() {
        return Err(format!("路径不存在: {}", path));
    }
    if !root_path.is_dir() {
        return Err(format!("路径不是目录: {}", path));
    }

    let skipped = Mutex::new(Vec::<SkippedFile>::new());

    // ===== Step 1: 收集文件 =====
    let _ = window.emit(
        "dedup-scan-progress",
        DedupScanProgress {
            stage: "collecting".to_string(),
            stage_progress: StageProgress {
                current: 0,
                total: 0,
            },
            found_groups: 0,
            current_file: None,
        },
    );

    let all_files = collect_files(&root_path, &config, &cancellation, &skipped, &window);
    let total_files_scanned = all_files.len();

    if cancellation.is_cancelled() {
        return Err("扫描已被用户取消".to_string());
    }

    // ===== Step 2: 尺寸分桶 =====
    let _ = window.emit(
        "dedup-scan-progress",
        DedupScanProgress {
            stage: "size-filter".to_string(),
            stage_progress: StageProgress {
                current: 0,
                total: total_files_scanned,
            },
            found_groups: 0,
            current_file: None,
        },
    );

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

        let _ = window.emit(
            "dedup-scan-progress",
            DedupScanProgress {
                stage: "fingerprint".to_string(),
                stage_progress: StageProgress {
                    current: bucket_idx,
                    total: total_buckets,
                },
                found_groups: all_groups.len(),
                current_file: None,
            },
        );

        // Step 3: 快速指纹分组
        let mut fingerprint_groups: HashMap<String, Vec<&CollectedFile>> = HashMap::new();

        for file in bucket {
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

        // Step 4: 对每个指纹组计算全文哈希
        for fp_group in fp_groups {
            if cancellation.is_cancelled() {
                return Err("扫描已被用户取消".to_string());
            }

            let mut hash_map: HashMap<String, Vec<(&CollectedFile, String)>> = HashMap::new();

            for file in &fp_group {
                match compute_normalized_full_hash(&file.path, &normalize_options) {
                    Ok((raw_hash, norm_hash)) => {
                        hash_map
                            .entry(norm_hash)
                            .or_default()
                            .push((file, raw_hash));
                    }
                    Err(reason) => {
                        skipped.lock().unwrap().push(SkippedFile {
                            path: file.path.to_string_lossy().to_string(),
                            reason,
                        });
                    }
                }
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
        let _ = window.emit(
            "dedup-scan-progress",
            DedupScanProgress {
                stage: "hashing".to_string(),
                stage_progress: StageProgress {
                    current: 0,
                    total: small_files.len(),
                },
                found_groups: all_groups.len(),
                current_file: None,
            },
        );

        let mut small_hash_map: HashMap<String, Vec<(&CollectedFile, String)>> = HashMap::new();

        for (idx, file) in small_files.iter().enumerate() {
            if cancellation.is_cancelled() {
                return Err("扫描已被用户取消".to_string());
            }

            if idx % 20 == 0 {
                let _ = window.emit(
                    "dedup-scan-progress",
                    DedupScanProgress {
                        stage: "hashing".to_string(),
                        stage_progress: StageProgress {
                            current: idx,
                            total: small_files.len(),
                        },
                        found_groups: all_groups.len(),
                        current_file: Some(file.path.to_string_lossy().to_string()),
                    },
                );
            }

            match compute_normalized_full_hash(&file.path, &normalize_options) {
                Ok((raw_hash, norm_hash)) => {
                    small_hash_map
                        .entry(norm_hash)
                        .or_default()
                        .push((file, raw_hash));
                }
                Err(reason) => {
                    skipped.lock().unwrap().push(SkippedFile {
                        path: file.path.to_string_lossy().to_string(),
                        reason,
                    });
                }
            }
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

    // ===== 构建最终结果 =====
    let _ = window.emit(
        "dedup-scan-progress",
        DedupScanProgress {
            stage: "building".to_string(),
            stage_progress: StageProgress {
                current: 0,
                total: 0,
            },
            found_groups: all_groups.len(),
            current_file: None,
        },
    );

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

    Ok(DedupAnalysisResult {
        groups: all_groups,
        statistics,
        skipped_files,
    })
}

/// 获取文件内容（用于前端 diff 预览）
#[tauri::command]
pub async fn read_file_content_for_diff(
    path: String,
    max_size_kb: Option<u64>,
) -> Result<String, String> {
    let file_path = PathBuf::from(&path);
    if !file_path.exists() {
        return Err(format!("文件不存在: {}", path));
    }

    let metadata = fs::metadata(&file_path).map_err(|e| format!("读取元数据失败: {}", e))?;
    let max_bytes = max_size_kb.unwrap_or(512) * 1024;

    if metadata.len() > max_bytes {
        return Err(format!(
            "文件过大 ({} KB)，超过限制 ({} KB)",
            metadata.len() / 1024,
            max_bytes / 1024
        ));
    }

    fs::read_to_string(&file_path).map_err(|e| format!("读取文件失败: {}", e))
}

/// 停止查重扫描
#[tauri::command]
pub async fn stop_dedup_scan(cancellation: State<'_, DedupScanCancellation>) -> Result<(), String> {
    cancellation.cancel();
    Ok(())
}

/// 删除重复文件（移入回收站）
#[tauri::command]
pub async fn delete_duplicate_files(
    paths: Vec<String>,
    window: tauri::Window,
) -> Result<DedupDeleteResult, String> {
    let mut success_count = 0;
    let mut error_count = 0;
    let mut freed_space = 0u64;
    let mut errors = Vec::new();
    let total = paths.len();

    for (idx, path_str) in paths.iter().enumerate() {
        let path = PathBuf::from(path_str);

        if !path.exists() {
            errors.push(format!("文件不存在: {}", path_str));
            error_count += 1;
            continue;
        }

        let size = fs::metadata(&path).ok().map(|m| m.len()).unwrap_or(0);

        // 上报进度
        if idx % 5 == 0 {
            let _ = window.emit(
                "dedup-delete-progress",
                DedupDeleteProgress {
                    current: idx,
                    total,
                    current_file: path_str.clone(),
                },
            );
        }

        match trash::delete(&path) {
            Ok(_) => {
                success_count += 1;
                freed_space += size;
            }
            Err(e) => {
                errors.push(format!("移入回收站失败 {}: {}", path_str, e));
                error_count += 1;
            }
        }
    }

    Ok(DedupDeleteResult {
        success_count,
        error_count,
        freed_space,
        errors,
    })
}

/// 删除结果
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DedupDeleteResult {
    pub success_count: usize,
    pub error_count: usize,
    pub freed_space: u64,
    pub errors: Vec<String>,
}

/// 删除进度
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DedupDeleteProgress {
    pub current: usize,
    pub total: usize,
    pub current_file: String,
}
