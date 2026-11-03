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

use super::{path_is_within, resolve_path_for_security_impl, ExternalTransferSecurityRule};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

/// 文件操作器传入的配置快照；通用文件命令的其他调用方保持原有契约。
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentFileSecurity {
    allowed_directories: Vec<String>,
    black_list_rules: Vec<ExternalTransferSecurityRule>,
    sandbox_mode: String,
    #[serde(default)]
    approval_granted: bool,
    #[serde(default = "default_max_file_size")]
    max_file_size: u64,
}

fn default_max_file_size() -> u64 {
    10 * 1024 * 1024
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileOperationInspection {
    status: &'static str,
    message: Option<String>,
}

impl AgentFileSecurity {
    pub(super) fn ensure_size(&self, size: u64) -> Result<(), String> {
        if size > self.max_file_size {
            return Err(format!(
                "文件大小超过限制：{} 字节 > {} 字节",
                size, self.max_file_size
            ));
        }
        Ok(())
    }

    pub(super) fn read_bytes(&self, path: &Path) -> Result<Vec<u8>, String> {
        use std::io::Read;
        self.ensure_path(path)?;
        let file = fs::File::open(path).map_err(|e| format!("打开文件失败: {e}"))?;
        let metadata = file
            .metadata()
            .map_err(|e| format!("读取文件信息失败: {e}"))?;
        if !metadata.is_file() {
            return Err("路径必须是普通文件".into());
        }
        self.ensure_size(metadata.len())?;
        let mut bytes = Vec::new();
        file.take(self.max_file_size.saturating_add(1))
            .read_to_end(&mut bytes)
            .map_err(|e| format!("读取文件失败: {e}"))?;
        self.ensure_size(bytes.len() as u64)?;
        Ok(bytes)
    }

    /// 返回该路径是否需要人工审批；白名单仅采纳有效授权目录，目标与安全规则解析失败时阻断。
    fn needs_approval(&self, path: &Path) -> Result<bool, String> {
        if self.sandbox_mode != "whitelist" && self.sandbox_mode != "blacklist" {
            return Err("文件安全配置无效：请选择白名单或黑名单模式".into());
        }
        let resolved = resolve_path_for_security_impl(path)?;
        if self.sandbox_mode == "whitelist" {
            let mut allowed = false;
            for directory in &self.allowed_directories {
                // 与前端一致：旧默认值及无法解析的授权目录跳过，由有效目录决定访问范围。
                let Ok(root) = resolve_path_for_security_impl(Path::new(directory)) else {
                    continue;
                };
                allowed |= path_is_within(&resolved, &root);
            }
            if !allowed {
                return Err(format!(
                    "安全沙箱拦截：路径不在白名单目录中：{}",
                    path.display()
                ));
            }
        }
        let mut approval = false;
        for rule in &self.black_list_rules {
            if rule.rule_type != "block" && rule.rule_type != "approve" {
                return Err("文件安全配置无效：规则类型应为 block 或 approve".into());
            }
            let root = resolve_path_for_security_impl(Path::new(&rule.path))?;
            if path_is_within(&resolved, &root) {
                if rule.rule_type == "block" {
                    return Err(format!(
                        "安全沙箱拦截：路径属于禁止访问的死区：{}",
                        path.display()
                    ));
                }
                approval = true;
            }
        }
        Ok(approval)
    }

    pub(super) fn ensure_path(&self, path: &Path) -> Result<(), String> {
        if self.needs_approval(path)? && !self.approval_granted {
            return Err(format!("路径需要人工审批：{}", path.display()));
        }
        Ok(())
    }

    pub(super) fn allows_child(&self, path: &Path) -> bool {
        self.ensure_path(path).is_ok()
    }

    /// 复制/移动/删除目录前检查整棵树；在产生磁盘改动前发现嵌套规则及链接。
    fn inspect_tree(
        &self,
        source: &Path,
        target: Option<&Path>,
        reject_links: bool,
        check_size: bool,
    ) -> Result<bool, String> {
        let mut approval = false;
        let mut stack = vec![(source.to_path_buf(), target.map(Path::to_path_buf))];
        while let Some((path, destination)) = stack.pop() {
            approval |= self.needs_approval(&path)?;
            if let Some(ref destination) = destination {
                approval |= self.needs_approval(destination)?;
            }
            let metadata = fs::symlink_metadata(&path)
                .map_err(|error| format!("读取目录项失败 {}: {error}", path.display()))?;
            if check_size && metadata.is_file() {
                self.ensure_size(metadata.len())?;
            }
            if metadata.file_type().is_symlink() {
                if reject_links {
                    return Err(format!(
                        "目录流转包含符号链接，请单独处理该链接：{}",
                        path.display()
                    ));
                }
                continue;
            }
            if metadata.is_dir() {
                for entry in fs::read_dir(&path)
                    .map_err(|error| format!("读取目录失败 {}: {error}", path.display()))?
                {
                    let entry = entry.map_err(|error| format!("读取目录项失败：{error}"))?;
                    stack.push((
                        entry.path(),
                        destination.as_ref().map(|d| d.join(entry.file_name())),
                    ));
                }
            }
        }
        Ok(approval)
    }

    fn inspect_operation(
        &self,
        method: &str,
        path: Option<&Path>,
        source: Option<&Path>,
        target: Option<&Path>,
    ) -> Result<bool, String> {
        match method {
            "copy_file" | "move_file" => {
                let source = source.ok_or("缺少源路径")?;
                let target = target.ok_or("缺少目标路径")?;
                let mut approval =
                    self.inspect_tree(source, Some(target), true, method == "copy_file")?;
                if fs::symlink_metadata(target).is_ok() {
                    approval |= self.inspect_tree(target, None, true, false)?;
                }
                Ok(approval)
            }
            "delete_file" => self.inspect_tree(path.ok_or("缺少删除路径")?, None, false, false),
            _ => Err("不支持的目录安全检查操作".into()),
        }
    }

    pub(super) fn ensure_operation(
        &self,
        method: &str,
        path: Option<&Path>,
        source: Option<&Path>,
        target: Option<&Path>,
    ) -> Result<(), String> {
        if self.inspect_operation(method, path, source, target)? && !self.approval_granted {
            return Err("目录中包含需要人工审批的路径，请确认后重试".into());
        }
        Ok(())
    }
}

#[tauri::command]
pub async fn inspect_file_operation(
    method_name: String,
    path: Option<String>,
    source_path: Option<String>,
    target_path: Option<String>,
    security: AgentFileSecurity,
) -> FileOperationInspection {
    match security.inspect_operation(
        &method_name,
        path.as_deref().map(Path::new),
        source_path.as_deref().map(Path::new),
        target_path.as_deref().map(Path::new),
    ) {
        Ok(approval) => FileOperationInspection {
            status: if approval { "approve" } else { "allow" },
            message: None,
        },
        Err(error) => FileOperationInspection {
            status: "block",
            message: Some(error),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn scope(root: &Path) -> AgentFileSecurity {
        AgentFileSecurity {
            allowed_directories: vec![root.to_string_lossy().into()],
            black_list_rules: vec![],
            sandbox_mode: "whitelist".into(),
            approval_granted: false,
            max_file_size: default_max_file_size(),
        }
    }

    // 保护旧配置下原生读写的兼容性，同时保持有效白名单的授权边界。
    #[tokio::test]
    async fn scoped_legacy_whitelist_entries_preserve_read_write_boundaries() {
        use crate::commands::file_operations::{read_text_file_force, write_text_file_force};
        let temp = tempdir().unwrap();
        let path = temp.path().join("note.txt");
        let arg = path.to_string_lossy().to_string();
        let mut security = scope(temp.path());
        security.allowed_directories.extend(
            ["Desktop", "Documents", "Downloads", ""]
                .map(str::to_owned),
        );
        // 有效目录位于旧条目前后时均可授权。
        for _ in 0..2 {
            fs::write(&path, "original").unwrap();
            assert_eq!(
                read_text_file_force(arg.clone(), Some(security.clone()))
                    .await
                    .unwrap(),
                "original"
            );
            write_text_file_force(
                arg.clone(),
                "updated".into(),
                Some(security.clone()),
                Some(true),
            )
            .await
            .unwrap();
            assert_eq!(fs::read_to_string(&path).unwrap(), "updated");
            security.allowed_directories.rotate_left(1);
        }

        let outside = tempdir().unwrap();
        let outside_path = outside.path().join("note.txt");
        fs::write(&outside_path, "protected").unwrap();
        let outside_arg = outside_path.to_string_lossy().to_string();
        assert!(read_text_file_force(outside_arg.clone(), Some(security.clone()))
            .await
            .is_err());
        assert!(write_text_file_force(
            outside_arg,
            "blocked".into(),
            Some(security.clone()),
            Some(true)
        )
        .await
        .is_err());
        assert_eq!(fs::read_to_string(outside_path).unwrap(), "protected");

        security.allowed_directories = vec!["Desktop".into()];
        assert!(read_text_file_force(arg, Some(security)).await.is_err());
    }

    // 保护安全规则的严格校验：跳过旧白名单条目后仍须遵守审批、死区及规则解析失败。
    #[test]
    fn scoped_legacy_whitelist_entries_keep_security_rules_strict() {
        use crate::commands::file_operations::read_file_binary;
        let temp = tempdir().unwrap();
        let path = temp.path().join("note.txt");
        fs::write(&path, "protected").unwrap();
        let arg = path.to_string_lossy().to_string();
        let mut security = scope(temp.path());
        security.allowed_directories.insert(0, "Desktop".into());
        for rule_type in ["block", "approve"] {
            security.black_list_rules = vec![ExternalTransferSecurityRule {
                path: "Documents".into(),
                rule_type: rule_type.into(),
            }];
            security.approval_granted = true;
            assert!(read_file_binary(arg.clone(), Some(security.clone())).is_err());
        }

        security.black_list_rules = vec![ExternalTransferSecurityRule {
            path: temp.path().to_string_lossy().into(),
            rule_type: "approve".into(),
        }];
        security.approval_granted = false;
        assert!(read_file_binary(arg.clone(), Some(security.clone())).is_err());
        security.approval_granted = true;
        assert_eq!(
            read_file_binary(arg.clone(), Some(security.clone())).unwrap(),
            b"protected"
        );
        security.black_list_rules[0].rule_type = "block".into();
        assert!(read_file_binary(arg, Some(security)).is_err());
    }

    // 保护 Agent 文本追加能力与通用命令的兼容边界，使用真实临时文件。
    #[tokio::test]
    async fn scoped_append_supports_markdown_and_enforces_path_policy() {
        use crate::commands::file_operations::append_file_force;
        let temp = tempdir().unwrap();
        let path = temp.path().join("note.md");
        fs::write(&path, "原文\n").unwrap();
        let arg = path.to_string_lossy().to_string();
        assert!(append_file_force(arg.clone(), b"legacy".to_vec(), None)
            .await
            .is_err());
        append_file_force(
            arg.clone(),
            "追加\n".as_bytes().to_vec(),
            Some(scope(temp.path())),
        )
        .await
        .unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "原文\n追加\n");
        let outside = tempdir().unwrap();
        assert!(
            append_file_force(arg, b"blocked".to_vec(), Some(scope(outside.path())))
                .await
                .is_err()
        );
        assert_eq!(fs::read_to_string(path).unwrap(), "原文\n追加\n");
    }

    // 保护写入、追加和复制的磁盘边界，超限检查发生在覆盖/修改之前。
    #[tokio::test]
    async fn scoped_size_limits_preserve_existing_files() {
        use crate::commands::file_operations::{
            append_file_force, copy_path_force, read_file_binary, read_text_file_force,
            write_text_file_force,
        };
        let temp = tempdir().unwrap();
        let source = temp.path().join("source");
        fs::create_dir(&source).unwrap();
        let large = source.join("large.md");
        let target = temp.path().join("target.md");
        fs::write(&large, "1234").unwrap();
        fs::write(&target, "123").unwrap();
        let mut security = scope(temp.path());
        security.max_file_size = 3;
        let arg = target.to_string_lossy().to_string();
        assert!(write_text_file_force(
            arg.clone(),
            "1234".into(),
            Some(security.clone()),
            Some(true)
        )
        .await
        .is_err());
        assert!(
            append_file_force(arg.clone(), b"4".to_vec(), Some(security.clone()))
                .await
                .is_err()
        );
        assert_eq!(fs::read_to_string(&target).unwrap(), "123");
        let large_arg = large.to_string_lossy().to_string();
        assert!(
            read_text_file_force(large_arg.clone(), Some(security.clone()))
                .await
                .is_err()
        );
        assert!(read_file_binary(large_arg.clone(), Some(security.clone())).is_err());
        assert!(
            copy_path_force(large_arg, arg.clone(), Some(true), Some(security.clone()))
                .await
                .is_err()
        );
        assert_eq!(fs::read_to_string(&target).unwrap(), "123");
        let dest = temp.path().join("copied");
        assert!(copy_path_force(
            source.to_string_lossy().into(),
            dest.to_string_lossy().into(),
            Some(true),
            Some(security.clone())
        )
        .await
        .is_err());
        assert!(!dest.exists());
        write_text_file_force(arg.clone(), "中".into(), Some(security.clone()), Some(true))
            .await
            .unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "中");
        assert!(
            write_text_file_force(arg, "a".into(), Some(security), Some(false))
                .await
                .is_err()
        );
        assert_eq!(fs::read_to_string(target).unwrap(), "中");
    }

    #[tokio::test]
    async fn directory_operations_check_nested_rules_before_mutation() {
        use crate::commands::file_operations::{
            copy_path_force, delete_file_to_trash, move_path_force,
        };
        let temp = tempdir().unwrap();
        let source = temp.path().join("source");
        let child = source.join("protected");
        let target = temp.path().join("target");
        fs::create_dir_all(&child).unwrap();
        fs::write(child.join("fixture.txt"), "unchanged").unwrap();
        let mut security = scope(temp.path());
        security
            .black_list_rules
            .push(ExternalTransferSecurityRule {
                path: child.to_string_lossy().into(),
                rule_type: "approve".into(),
            });
        let source_arg = source.to_string_lossy().to_string();
        let target_arg = target.to_string_lossy().to_string();
        assert!(copy_path_force(
            source_arg.clone(),
            target_arg.clone(),
            Some(true),
            Some(security.clone())
        )
        .await
        .is_err());
        assert!(!target.exists());
        security.approval_granted = true;
        copy_path_force(
            source_arg.clone(),
            target_arg.clone(),
            Some(true),
            Some(security.clone()),
        )
        .await
        .unwrap();
        assert_eq!(
            fs::read_to_string(target.join("protected/fixture.txt")).unwrap(),
            "unchanged"
        );
        security.black_list_rules[0].rule_type = "block".into();
        assert!(move_path_force(
            source_arg.clone(),
            target_arg,
            Some(true),
            Some(security.clone())
        )
        .await
        .is_err());
        assert!(delete_file_to_trash(source_arg, Some(security))
            .await
            .is_err());
        assert_eq!(
            fs::read_to_string(child.join("fixture.txt")).unwrap(),
            "unchanged"
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn listing_prunes_protected_descendants_and_copy_rejects_links() {
        use crate::commands::file_operations::{copy_path_force, list_directory, search_files};
        let temp = tempdir().unwrap();
        let root = temp.path().join("root");
        let outside = temp.path().join("outside");
        fs::create_dir_all(root.join("approval")).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("secret.txt"), "fixture").unwrap();
        std::os::unix::fs::symlink(&outside, root.join("link")).unwrap();
        let mut security = scope(&root);
        security
            .black_list_rules
            .push(ExternalTransferSecurityRule {
                path: root.join("approval").to_string_lossy().into(),
                rule_type: "approve".into(),
            });
        fs::write(root.join("own.txt"), "public").unwrap();
        fs::write(root.join("approval/review.txt"), "review").unwrap();
        let root_arg = root.to_string_lossy().to_string();
        let entries = list_directory(root_arg.clone(), Some(security.clone()))
            .await
            .unwrap();
        assert_eq!(entries, vec!["own.txt"]);
        let hits = search_files(
            root_arg.clone(),
            "*.txt".into(),
            Some(true),
            None,
            Some(security.clone()),
        )
        .await
        .unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].name, "own.txt");
        security.allowed_directories = vec![temp.path().to_string_lossy().into()];
        security.approval_granted = true;
        let target = temp.path().join("copy");
        assert!(copy_path_force(
            root_arg,
            target.to_string_lossy().into(),
            Some(true),
            Some(security)
        )
        .await
        .is_err());
        assert!(!target.exists());
    }
}
