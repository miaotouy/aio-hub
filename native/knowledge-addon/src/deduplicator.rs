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
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

#[path = "../../../src-tauri/src/content_deduplicator.rs"]
mod core;

/// One instance belongs to one scan; cancellation before worker startup stays effective.
#[napi]
pub struct DedupRuntime {
    started: AtomicBool,
    cancellation: Arc<core::DedupScanCancellation>,
    progress: Arc<Mutex<VecDeque<core::DedupScanProgress>>>,
}
#[napi]
impl DedupRuntime {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            started: AtomicBool::new(false),
            cancellation: Arc::new(core::DedupScanCancellation::new()),
            progress: Arc::new(Mutex::new(VecDeque::new())),
        }
    }
    #[napi]
    pub fn cancel(&self) {
        self.cancellation.cancel();
    }
    #[napi]
    pub fn drain_progress(&self) -> Result<String> {
        let mut queue = self
            .progress
            .lock()
            .map_err(|_| Error::from_reason("查重进度队列已损坏"))?;
        serde_json::to_string(&queue.drain(..).collect::<Vec<_>>())
            .map_err(|error| Error::from_reason(error.to_string()))
    }
    #[napi]
    pub async fn scan(&self, path: String, configuration: String) -> Result<String> {
        if self.started.swap(true, Ordering::SeqCst) {
            return Err(Error::from_reason("查重任务已经启动，请创建新的扫描任务"));
        }
        let config: core::SimilarityConfig = serde_json::from_str(&configuration)
            .map_err(|error| Error::from_reason(error.to_string()))?;
        let cancellation = Arc::clone(&self.cancellation);
        let queue = Arc::clone(&self.progress);
        tokio::task::spawn_blocking(move || {
            let result = core::scan_content_duplicates(path, config, &cancellation, &|progress| {
                if let Ok(mut events) = queue.lock() {
                    if events.len() >= 128 {
                        events.pop_front();
                    }
                    events.push_back(progress);
                }
            })
            .map_err(Error::from_reason)?;
            serde_json::to_string(&result).map_err(|error| Error::from_reason(error.to_string()))
        })
        .await
        .map_err(|error| Error::from_reason(error.to_string()))?
    }
}
