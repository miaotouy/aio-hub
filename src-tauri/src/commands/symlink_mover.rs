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

//! Tauri ownership and event adapter for the shared transactional engine.
use crate::commands::file_operations::add_operation_log;
pub use crate::symlink_mover::SymlinkOperationPreflight;
use std::sync::Mutex;
use tauri::{Emitter, Window};
use tokio_util::sync::CancellationToken;

static CURRENT: Mutex<Option<(String, CancellationToken)>> = Mutex::new(None);

#[tauri::command]
pub async fn preflight_symlink_operation(
    source_paths: Vec<String>,
    target_dir: String,
    link_type: String,
    operation_mode: String,
    base_source_dir: Option<String>,
) -> Result<SymlinkOperationPreflight, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::symlink_mover::preflight_symlink_operation(
            source_paths,
            target_dir,
            link_type,
            operation_mode,
            base_source_dir,
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn cancel_move_operation(window: Window) {
    if let Ok(state) = CURRENT.lock() {
        if let Some((owner, token)) = state.as_ref() {
            if owner == window.label() {
                token.cancel();
            }
        }
    }
}

async fn run(
    window: Window,
    source_paths: Vec<String>,
    target_dir: String,
    link_type: String,
    base_source_dir: Option<String>,
    move_files: bool,
) -> Result<String, String> {
    let token = CancellationToken::new();
    {
        let mut state = CURRENT
            .lock()
            .map_err(|_| "文件操作状态已损坏".to_string())?;
        if state.is_some() {
            return Err("已有文件搬移或链接任务正在运行，请等待其完成".to_string());
        }
        *state = Some((window.label().to_string(), token.clone()));
    }
    let result = tauri::async_runtime::spawn_blocking(move || {
        if move_files {
            crate::symlink_mover::move_and_link(
                token,
                &|progress| {
                    let _ = window.emit("copy-progress", progress);
                },
                source_paths,
                target_dir,
                link_type,
                base_source_dir,
            )
        } else {
            crate::symlink_mover::create_links_only(
                token,
                source_paths,
                target_dir,
                link_type,
                base_source_dir,
            )
        }
    })
    .await;
    if let Ok(mut state) = CURRENT.lock() {
        *state = None;
    }
    let outcome = result.map_err(|error| error.to_string())??;
    add_operation_log(outcome.log);
    Ok(outcome.message)
}

#[tauri::command]
pub async fn move_and_link(
    window: Window,
    source_paths: Vec<String>,
    target_dir: String,
    link_type: String,
    base_source_dir: Option<String>,
) -> Result<String, String> {
    run(
        window,
        source_paths,
        target_dir,
        link_type,
        base_source_dir,
        true,
    )
    .await
}

#[tauri::command]
pub async fn create_links_only(
    window: Window,
    source_paths: Vec<String>,
    target_dir: String,
    link_type: String,
    base_source_dir: Option<String>,
) -> Result<String, String> {
    run(
        window,
        source_paths,
        target_dir,
        link_type,
        base_source_dir,
        false,
    )
    .await
}
