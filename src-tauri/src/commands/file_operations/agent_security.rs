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
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileOperationInspection {
    status: &'static str,
    message: Option<String>,
}

impl AgentFileSecurity {
    /// 返回该路径是否需要人工审批；配置及路径解析错误一律阻断。
    fn needs_approval(&self, path: &Path) -> Result<bool, String> {
        if self.sandbox_mode != "whitelist" && self.sandbox_mode != "blacklist" {
            return Err("文件安全配置无效：请选择白名单或黑名单模式".into());
        }
        let resolved = resolve_path_for_security_impl(path)?;
        if self.sandbox_mode == "whitelist" {
            let mut allowed = false;
            for directory in &self.allowed_directories {
                let root = resolve_path_for_security_impl(Path::new(directory))?;
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
                let mut approval = self.inspect_tree(source, Some(target), true)?;
                if fs::symlink_metadata(target).is_ok() {
                    approval |= self.inspect_tree(target, None, true)?;
                }
                Ok(approval)
            }
            "delete_file" => self.inspect_tree(path.ok_or("缺少删除路径")?, None, false),
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
        }
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
