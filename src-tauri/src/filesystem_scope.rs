// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

use std::path::Path;
use tauri::{ipc::CapabilityBuilder, Manager, Runtime};

/// The FS plugin's dynamic Scope always uses Unix dotfile matching defaults.
/// Capability scopes honor plugins.fs.requireLiteralLeadingDot, including for
/// newly created hidden descendants under a portable / isolated data root.
pub(crate) fn authorize_app_data<R: Runtime>(
    app: &tauri::AppHandle<R>,
    root: &Path,
) -> Result<(), Box<dyn std::error::Error>> {
    // get_app_data_dir uses this same physical root on Unix, including for
    // nonexistent destinations. Avoid a symlink alias in capability globs:
    // Tauri canonicalizes it and would interpret target metacharacters as globs.
    let roots = [std::fs::canonicalize(root)?];
    let mut allowed = Vec::new();
    for root in roots {
        let literal = root.to_str().ok_or("应用数据目录包含无效的 UTF-8 路径")?;
        #[cfg(windows)]
        let literal = literal.replace('\\', "/");
        // Escape glob syntax: `data[1]` must not authorize a sibling `data1`.
        // Unix backslashes remain literal filename characters.
        let mut pattern = String::new();
        for ch in literal.chars() {
            match ch {
                '[' => pattern.push_str("[[]"),
                ']' => pattern.push_str("[]]"),
                '*' => pattern.push_str("[*]"),
                '?' => pattern.push_str("[?]"),
                _ => pattern.push(ch),
            }
        }
        allowed.push(format!("{}/**", pattern.trim_end_matches('/')));
        allowed.push(pattern);
    }
    allowed.sort();
    allowed.dedup();
    app.add_capability(
        CapabilityBuilder::new("resolved-app-data")
            .window("*")
            .permission_scoped("fs:scope", allowed, Vec::<String>::new()),
    )?;
    Ok(())
}
