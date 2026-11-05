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

//! Explicit, lossy conversion of legacy Recall-shaped backups into Knowledge documents.

use super::backup_archive::*;
use crate::knowledge::types::KnowledgeIngestRequest;
use crate::knowledge::KnowledgeRepository;
use std::path::Path;

pub(crate) fn import_legacy_backup_to_knowledge(
    repository: &KnowledgeRepository,
    source_path: &Path,
    source_entry: Option<&str>,
) -> Result<LegacyKnowledgeImportReport, String> {
    let parsed = parse_backup_source(source_path, source_entry)?;
    if !is_legacy_recall_format(&parsed.format) {
        return Err("只有重构前的“知识库”导出可以转换到新版 Knowledge 资料库".to_string());
    }

    let source_id = parsed.library.meta.id;
    let source_name = parsed.library.meta.name.trim();
    let library_name = if source_name.is_empty() {
        "未命名旧版资料库"
    } else {
        source_name
    };
    let conversion_note = "由重构前的“知识库”导出转换而来；原格式实际使用思绪条目结构。";
    let description = parsed
        .library
        .meta
        .description
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(|value| format!("{value}\n\n{conversion_note}"))
        .unwrap_or_else(|| conversion_note.to_string());
    let library = repository.create_library(library_name, Some(&description), None)?;

    let mut document_count = 0;
    let mut skipped_entry_count = 0;
    let mut asset_count = 0;
    for entry in &parsed.library.entries {
        asset_count += entry.assets.len();
        let content = if entry.content.trim().is_empty() {
            if entry.summary.trim().is_empty() {
                skipped_entry_count += 1;
                continue;
            }
            entry.summary.clone()
        } else {
            entry.content.clone()
        };
        let title = if entry.key.trim().is_empty() {
            format!("旧版条目 {}", entry.id)
        } else {
            entry.key.clone()
        };
        let request = KnowledgeIngestRequest {
            library_id: library.id.clone(),
            source_path: format!("legacy-recall://{source_id}/{}.md", entry.id),
            title: Some(title),
            mime_type: Some("text/markdown".to_string()),
            content,
        };
        if let Err(error) = repository.ingest(&request) {
            return match repository.delete_library(&library.id) {
                Ok(()) => Err(format!(
                    "转换旧版条目 {} 到 Knowledge 失败，已回滚新资料库: {error}",
                    entry.id
                )),
                Err(cleanup_error) => Err(format!(
                    "转换旧版条目 {} 到 Knowledge 失败: {error}；清理新资料库失败: {cleanup_error}",
                    entry.id
                )),
            };
        }
        document_count += 1;
    }

    let mut warnings = vec![warning(
        "legacyKnowledgeConversion",
        "已将旧版条目的标题与 Markdown 正文转换为 Knowledge 文档；标签、优先级、启用状态和条目关联不会成为 Knowledge 字段，此转换结果无法还原完整思绪结构",
        None,
    )];
    if asset_count > 0 {
        warnings.push(warning(
            "legacyKnowledgeAssetsNotConverted",
            format!(
                "旧版条目包含 {asset_count} 个附件引用；Knowledge 转换只保留标题与正文，不导入附件"
            ),
            None,
        ));
    }
    if skipped_entry_count > 0 {
        warnings.push(warning(
            "legacyKnowledgeEmptyEntriesSkipped",
            format!("跳过 {skipped_entry_count} 个正文和摘要均为空的旧版条目"),
            None,
        ));
    }

    Ok(LegacyKnowledgeImportReport {
        status: "success".to_string(),
        library_id: library.id,
        library_name: library.name,
        document_count,
        skipped_entry_count,
        warnings,
    })
}
