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

use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde::Deserialize;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;

#[path = "../../../src-tauri/src/symlink_mover.rs"]
mod core;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Options {
    #[serde(default)]
    source_paths: Vec<String>,
    #[serde(default)]
    source_path: String,
    target_dir: String,
    link_type: String,
    #[serde(default)]
    operation_mode: String,
    base_source_dir: Option<String>,
}

#[napi]
pub struct SymlinkMoverRuntime {
    started: AtomicBool,
    token: CancellationToken,
    events: Arc<Mutex<VecDeque<serde_json::Value>>>,
}
#[napi]
impl SymlinkMoverRuntime {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            started: AtomicBool::new(false),
            token: CancellationToken::new(),
            events: Arc::new(Mutex::new(VecDeque::new())),
        }
    }
    #[napi]
    pub fn cancel(&self) {
        self.token.cancel();
    }
    #[napi]
    pub fn drain_events(&self) -> Result<String> {
        let mut events = self
            .events
            .lock()
            .map_err(|_| Error::from_reason("复制进度队列已损坏"))?;
        serde_json::to_string(&events.drain(..).collect::<Vec<_>>())
            .map_err(|error| Error::from_reason(error.to_string()))
    }
    #[napi]
    pub async fn operate(&self, command: String, configuration: String) -> Result<String> {
        if self.started.swap(true, Ordering::SeqCst) {
            return Err(Error::from_reason("文件任务已经启动"));
        }
        let options: Options = serde_json::from_str(&configuration)
            .map_err(|error| Error::from_reason(error.to_string()))?;
        let token = self.token.clone();
        let events = Arc::clone(&self.events);
        tokio::task::spawn_blocking(move || {
            let outcome = match command.as_str() {
                "move_and_link" => core::move_and_link(
                    token,
                    &|progress| {
                        if let Ok(mut queue) = events.lock() {
                            if queue.len() >= 128 {
                                queue.pop_front();
                            }
                            if let Ok(value) = serde_json::to_value(progress) {
                                queue.push_back(value);
                            }
                        }
                    },
                    options.source_paths,
                    options.target_dir,
                    options.link_type,
                    options.base_source_dir,
                ),
                "create_links_only" => core::create_links_only(
                    token,
                    options.source_paths,
                    options.target_dir,
                    options.link_type,
                    options.base_source_dir,
                ),
                _ => Err("不支持的文件链接操作".to_string()),
            }
            .map_err(Error::from_reason)?;
            serde_json::to_string(&outcome).map_err(|error| Error::from_reason(error.to_string()))
        })
        .await
        .map_err(|error| Error::from_reason(error.to_string()))?
    }
}

#[napi]
pub async fn run_symlink_mover_query(command: String, configuration: String) -> Result<String> {
    let options: Options = serde_json::from_str(&configuration)
        .map_err(|error| Error::from_reason(error.to_string()))?;
    tokio::task::spawn_blocking(move || {
        let value = match command.as_str() {
            "preflight_symlink_operation" => serde_json::to_value(
                core::preflight_symlink_operation(
                    options.source_paths,
                    options.target_dir,
                    options.link_type,
                    options.operation_mode,
                    options.base_source_dir,
                )
                .map_err(Error::from_reason)?,
            ),
            "validate_file_for_link" => serde_json::to_value(
                core::validate_file_for_link(
                    options.source_path,
                    options.target_dir,
                    options.link_type,
                )
                .map_err(Error::from_reason)?,
            ),
            "validate_files_for_link" => serde_json::to_value(core::validate_files_for_link(
                options.source_paths,
                options.target_dir,
                options.link_type,
            )),
            _ => return Err(Error::from_reason("不支持的文件链接查询")),
        }
        .map_err(|error| Error::from_reason(error.to_string()))?;
        serde_json::to_string(&value).map_err(|error| Error::from_reason(error.to_string()))
    })
    .await
    .map_err(|error| Error::from_reason(error.to_string()))?
}
