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

//! 系统脉搏 Tauri 适配层。同步硬件采集在独立工作线程运行。
use crate::system_pulse::collection_loop;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

struct Task {
    token: CancellationToken,
    worker: tokio::task::JoinHandle<()>,
}
#[derive(Default)]
pub struct PulseState {
    task: Mutex<Option<Task>>,
}
#[tauri::command]
pub async fn start_pulse(app: AppHandle, state: State<'_, PulseState>) -> Result<(), String> {
    let mut task = state.task.lock().await;
    if task.as_ref().is_some_and(|task| !task.worker.is_finished()) {
        return Ok(());
    }
    let token = CancellationToken::new();
    let worker_token = token.clone();
    let handle = tokio::runtime::Handle::current();
    let worker = tokio::task::spawn_blocking(move || {
        handle.block_on(collection_loop(worker_token, |snapshot| {
            if let Err(error) = app.emit("system-pulse:snapshot", snapshot) {
                log::warn!("[SystemPulse] 事件推送失败: {}", error);
            }
        }));
    });
    *task = Some(Task { token, worker });
    Ok(())
}
#[tauri::command]
pub async fn stop_pulse(state: State<'_, PulseState>) -> Result<(), String> {
    let mut guard = state.task.lock().await;
    if let Some(task) = guard.take() {
        task.token.cancel();
        task.worker.await.map_err(|error| error.to_string())?;
    }
    Ok(())
}
