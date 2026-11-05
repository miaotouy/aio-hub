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

use serde::{Deserialize, Serialize};

// 进度事件结构体
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopyProgress {
    pub current_file: String,
    pub copied_bytes: u64,
    pub total_bytes: u64,
    pub progress_percentage: f64,
}

// 操作日志条目
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationLog {
    pub timestamp: u64,
    pub operation_type: String, // "move" 或 "link-only"
    pub link_type: String,      // "symlink" 或 "link"
    pub source_count: usize,
    pub success_count: usize,
    pub error_count: usize,
    pub errors: Vec<String>,
    #[serde(default)]
    pub warnings: Vec<String>,
    pub duration_ms: u128,
    pub target_directory: String,     // 目标目录
    pub source_paths: Vec<String>,    // 源文件路径列表
    pub total_size: u64,              // 总文件大小（字节）
    pub processed_files: Vec<String>, // 成功处理的文件名列表
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileValidation {
    pub is_directory: bool,
    pub is_cross_device: bool,
    pub exists: bool,
}
