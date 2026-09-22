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

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};

#[cfg(desktop)]
use tauri::utils::config::BackgroundThrottlingPolicy;

pub const BACKGROUND_JS_RUNTIME_WINDOW_LABEL: &str = "background-js";
const BACKGROUND_JS_RUNTIME_URL: &str = "background-js.html";
const BACKGROUND_JS_RUNTIME_VERSION: &str = "0.1.0-poc";

#[derive(Default)]
pub struct BackgroundJsRuntimeState {
    ready: AtomicBool,
    generation: AtomicU64,
    last_heartbeat_at: AtomicU64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundJsRuntimeStatus {
    pub available: bool,
    pub ready: bool,
    pub generation: u64,
    pub runtime_version: Option<String>,
    pub last_heartbeat_at: Option<u64>,
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

fn status_snapshot(
    state: &BackgroundJsRuntimeState,
    runtime_version: Option<String>,
) -> BackgroundJsRuntimeStatus {
    let heartbeat = state.last_heartbeat_at.load(Ordering::SeqCst);
    BackgroundJsRuntimeStatus {
        available: true,
        ready: state.ready.load(Ordering::SeqCst),
        generation: state.generation.load(Ordering::SeqCst),
        runtime_version,
        last_heartbeat_at: (heartbeat > 0).then_some(heartbeat),
    }
}

#[tauri::command]
pub fn background_runtime_ready(
    state: State<'_, BackgroundJsRuntimeState>,
    runtime_version: Option<String>,
) -> BackgroundJsRuntimeStatus {
    state.ready.store(true, Ordering::SeqCst);
    state.generation.fetch_add(1, Ordering::SeqCst);
    state
        .last_heartbeat_at
        .store(now_millis(), Ordering::SeqCst);

    let status = status_snapshot(
        &state,
        runtime_version.or_else(|| Some(BACKGROUND_JS_RUNTIME_VERSION.into())),
    );
    log::info!(
        "[BACKGROUND_JS_RUNTIME] ready, generation={}, version={:?}",
        status.generation,
        status.runtime_version
    );
    status
}

#[tauri::command]
pub fn background_runtime_heartbeat(
    state: State<'_, BackgroundJsRuntimeState>,
) -> BackgroundJsRuntimeStatus {
    state
        .last_heartbeat_at
        .store(now_millis(), Ordering::SeqCst);
    status_snapshot(&state, Some(BACKGROUND_JS_RUNTIME_VERSION.into()))
}

#[tauri::command]
pub fn background_runtime_get_status(
    app: AppHandle,
    state: State<'_, BackgroundJsRuntimeState>,
) -> BackgroundJsRuntimeStatus {
    let available = app
        .get_webview_window(BACKGROUND_JS_RUNTIME_WINDOW_LABEL)
        .is_some();
    let mut status = status_snapshot(&state, Some(BACKGROUND_JS_RUNTIME_VERSION.into()));
    status.available = available;
    status
}

/// 创建仅承载 Background JS Runtime 的隐藏窗口。
///
/// 该窗口不加载主 Vue 应用，第一阶段只用于验证 Renderer 与 Background JS Runtime
/// 的生命周期解耦。移动端暂不创建额外窗口，由对应 runtime adapter 负责降级。
#[cfg(desktop)]
pub fn create_background_runtime_window(app: &AppHandle) -> tauri::Result<()> {
    if app
        .get_webview_window(BACKGROUND_JS_RUNTIME_WINDOW_LABEL)
        .is_some()
    {
        return Ok(());
    }

    WebviewWindowBuilder::new(
        app,
        BACKGROUND_JS_RUNTIME_WINDOW_LABEL,
        WebviewUrl::App(BACKGROUND_JS_RUNTIME_URL.into()),
    )
    .title("AIO Hub Background JS Runtime")
    .inner_size(1.0, 1.0)
    .visible(false)
    .focused(false)
    .skip_taskbar(true)
    .resizable(false)
    .decorations(false)
    .background_throttling(BackgroundThrottlingPolicy::Disabled)
    .build()?;

    log::info!("[BACKGROUND_JS_RUNTIME] hidden WebView created");
    Ok(())
}
