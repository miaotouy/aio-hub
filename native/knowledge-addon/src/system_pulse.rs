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
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;

#[path = "../../../src-tauri/src/system_pulse.rs"]
mod core;

/// One-shot collector. A slow renderer retains only the most recent snapshot.
#[napi]
pub struct SystemPulseRuntime {
    started: AtomicBool,
    token: CancellationToken,
    latest: Arc<Mutex<Option<core::SystemSnapshot>>>,
}
#[napi]
impl SystemPulseRuntime {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            started: AtomicBool::new(false),
            token: CancellationToken::new(),
            latest: Arc::new(Mutex::new(None)),
        }
    }
    #[napi]
    pub fn cancel(&self) {
        self.token.cancel();
    }
    #[napi]
    pub fn drain_snapshot(&self) -> Result<String> {
        let snapshot = self
            .latest
            .lock()
            .map_err(|_| Error::from_reason("系统采集数据已损坏"))?
            .take();
        serde_json::to_string(&snapshot).map_err(|error| Error::from_reason(error.to_string()))
    }
    #[napi]
    pub async fn run(&self) -> Result<()> {
        if self.started.swap(true, Ordering::SeqCst) {
            return Err(Error::from_reason("系统采集任务已经启动"));
        }
        let token = self.token.clone();
        let latest = Arc::clone(&self.latest);
        let handle = tokio::runtime::Handle::current();
        tokio::task::spawn_blocking(move || {
            handle.block_on(core::collection_loop(token, |snapshot| {
                if let Ok(mut slot) = latest.lock() {
                    *slot = Some(snapshot);
                }
            }));
        })
        .await
        .map_err(|error| Error::from_reason(error.to_string()))
    }
}
