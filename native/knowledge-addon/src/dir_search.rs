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
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;

#[path = "../../../src-tauri/src/dir_search.rs"]
mod core;

/// One runtime per scan. Bounded transport retains every batch until consumed or cancelled.
#[napi]
pub struct DirSearchRuntime {
    started: AtomicBool,
    cancelled: Arc<AtomicBool>,
    sender: mpsc::SyncSender<Value>,
    receiver: Mutex<mpsc::Receiver<Value>>,
}
#[napi]
impl DirSearchRuntime {
    #[napi(constructor)]
    pub fn new() -> Self {
        let (sender, receiver) = mpsc::sync_channel(8);
        Self {
            started: AtomicBool::new(false),
            cancelled: Arc::new(AtomicBool::new(false)),
            sender,
            receiver: Mutex::new(receiver),
        }
    }
    #[napi]
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }
    #[napi]
    pub fn drain_events(&self) -> Result<String> {
        let receiver = self
            .receiver
            .lock()
            .map_err(|_| Error::from_reason("搜索事件队列已损坏"))?;
        serde_json::to_string(&receiver.try_iter().collect::<Vec<_>>())
            .map_err(|error| Error::from_reason(error.to_string()))
    }
    #[napi]
    pub async fn search(&self, configuration: String) -> Result<String> {
        if self.started.swap(true, Ordering::SeqCst) {
            return Err(Error::from_reason("搜索任务已经启动"));
        }
        let request: core::SearchRequest = serde_json::from_str(&configuration)
            .map_err(|error| Error::from_reason(error.to_string()))?;
        let cancelled = Arc::clone(&self.cancelled);
        let sender = self.sender.clone();
        tokio::task::spawn_blocking(move || {
            let result = core::dir_search(request, Arc::clone(&cancelled), &|event, payload| {
                let mut message = serde_json::json!({ "event": event, "payload": payload });
                loop {
                    match sender.try_send(message) {
                        Ok(()) => break,
                        Err(mpsc::TrySendError::Disconnected(_)) => {
                            cancelled.store(true, Ordering::SeqCst);
                            break;
                        }
                        Err(mpsc::TrySendError::Full(pending)) => {
                            if cancelled.load(Ordering::SeqCst) {
                                break;
                            }
                            message = pending;
                            std::thread::sleep(Duration::from_millis(5));
                        }
                    }
                }
            })
            .map_err(Error::from_reason)?;
            serde_json::to_string(&result).map_err(|error| Error::from_reason(error.to_string()))
        })
        .await
        .map_err(|error| Error::from_reason(error.to_string()))?
    }
}

#[napi]
pub async fn run_dir_search_operation(command: String, configuration: String) -> Result<String> {
    tokio::task::spawn_blocking(move || {
        fn run(command: &str, configuration: &str) -> std::result::Result<Value, String> {
            macro_rules! execute {
                ($function:ident) => {{
                    let request =
                        serde_json::from_str(configuration).map_err(|error| error.to_string())?;
                    let result = core::$function(request)?;
                    serde_json::to_value(result).map_err(|error| error.to_string())
                }};
            }
            match command {
                "dir_replace" => execute!(dir_replace),
                "dir_replace_single" => execute!(dir_replace_single),
                "dir_replace_preview" => execute!(dir_replace_preview),
                "dir_search_copy_files" => execute!(dir_search_copy_files),
                "dir_search_move_files" => execute!(dir_search_move_files),
                _ => Err("不支持的目录搜索操作".into()),
            }
        }
        let result = run(&command, &configuration).map_err(Error::from_reason)?;
        serde_json::to_string(&result).map_err(|error| Error::from_reason(error.to_string()))
    })
    .await
    .map_err(|error| Error::from_reason(error.to_string()))?
}
