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

use chrono::Local;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, Webview, WebviewWindow, Window, WindowEvent};

const WATCHDOG_INTERVAL: Duration = Duration::from_secs(10);
const NO_HEARTBEAT_AFTER: Duration = Duration::from_secs(20);
const STALE_HEARTBEAT_AFTER: Duration = Duration::from_secs(20);
const ESCALATE_HEARTBEAT_AFTER: Duration = Duration::from_secs(60);

#[derive(Debug, Default)]
pub struct FrontendMonitorState {
    inner: Mutex<FrontendMonitorInner>,
    watchdog_started: AtomicBool,
}

#[derive(Debug, Default)]
struct FrontendMonitorInner {
    windows: HashMap<String, FrontendWindowProbe>,
}

#[derive(Debug)]
struct FrontendWindowProbe {
    first_seen_at: Instant,
    first_seen_wall: String,
    ready_at: Option<Instant>,
    ready_wall: Option<String>,
    ready_phase: Option<String>,
    page_load_count: u64,
    last_page_load_event: Option<String>,
    last_page_load_url: Option<String>,
    last_page_load_wall: Option<String>,
    last_heartbeat_at: Option<Instant>,
    last_heartbeat_wall: Option<String>,
    last_heartbeat_seq: Option<u64>,
    last_frontend_path: Option<String>,
    last_frontend_route: Option<String>,
    last_visibility_state: Option<String>,
    last_document_ready_state: Option<String>,
    no_heartbeat_warned: bool,
    missed_warning_active: bool,
    missed_warning_checks: u32,
    last_eval_probe_at: Option<Instant>,
    last_eval_probe_result: Option<String>,
    last_window_event: Option<String>,
    last_window_event_wall: Option<String>,
    frontend_error_count: u64,
    last_frontend_error: Option<FrontendErrorSummary>,
    last_backend_snapshot: Option<BackendWindowSnapshot>,
    backend_snapshot_error_active: bool,
    probe_exempt_active: bool,
    last_probe_exempt_url: Option<String>,
    destroyed: bool,
}

impl FrontendWindowProbe {
    fn new() -> Self {
        Self {
            first_seen_at: Instant::now(),
            first_seen_wall: now_wall(),
            ready_at: None,
            ready_wall: None,
            ready_phase: None,
            page_load_count: 0,
            last_page_load_event: None,
            last_page_load_url: None,
            last_page_load_wall: None,
            last_heartbeat_at: None,
            last_heartbeat_wall: None,
            last_heartbeat_seq: None,
            last_frontend_path: None,
            last_frontend_route: None,
            last_visibility_state: None,
            last_document_ready_state: None,
            no_heartbeat_warned: false,
            missed_warning_active: false,
            missed_warning_checks: 0,
            last_eval_probe_at: None,
            last_eval_probe_result: None,
            last_window_event: None,
            last_window_event_wall: None,
            frontend_error_count: 0,
            last_frontend_error: None,
            last_backend_snapshot: None,
            backend_snapshot_error_active: false,
            probe_exempt_active: false,
            last_probe_exempt_url: None,
            destroyed: false,
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendViewportPayload {
    #[serde(default)]
    pub width: f64,
    #[serde(default)]
    pub height: f64,
    #[serde(default)]
    pub device_pixel_ratio: f64,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendProbePayload {
    #[serde(default)]
    pub sequence: u64,
    #[serde(default)]
    pub phase: String,
    #[serde(default)]
    pub timestamp: String,
    #[serde(default)]
    pub performance_now: f64,
    #[serde(default)]
    pub pathname: String,
    #[serde(default)]
    pub href: String,
    #[serde(default)]
    pub route: Option<String>,
    #[serde(default)]
    pub visibility_state: String,
    #[serde(default)]
    pub document_ready_state: String,
    #[serde(default)]
    pub focused: bool,
    #[serde(default)]
    pub online: bool,
    #[serde(default)]
    pub viewport: Option<FrontendViewportPayload>,
    #[serde(default)]
    pub user_agent: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendErrorPayload {
    #[serde(default)]
    pub sequence: u64,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub message: String,
    #[serde(default)]
    pub stack: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub line: Option<u32>,
    #[serde(default)]
    pub column: Option<u32>,
    #[serde(default)]
    pub context: Option<serde_json::Value>,
    #[serde(default)]
    pub snapshot: Option<FrontendProbePayload>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendProbeStatus {
    pub label: String,
    pub first_seen_wall: String,
    pub ready_wall: Option<String>,
    pub ready_phase: Option<String>,
    pub page_load_count: u64,
    pub last_page_load_event: Option<String>,
    pub last_page_load_url: Option<String>,
    pub last_page_load_wall: Option<String>,
    pub last_heartbeat_wall: Option<String>,
    pub last_heartbeat_age_ms: Option<u128>,
    pub last_heartbeat_seq: Option<u64>,
    pub last_frontend_path: Option<String>,
    pub last_frontend_route: Option<String>,
    pub last_visibility_state: Option<String>,
    pub last_document_ready_state: Option<String>,
    pub last_eval_probe_result: Option<String>,
    pub last_window_event: Option<String>,
    pub last_window_event_wall: Option<String>,
    pub frontend_error_count: u64,
    pub last_frontend_error: Option<FrontendErrorSummary>,
    pub last_backend_snapshot: Option<BackendWindowSnapshot>,
    pub destroyed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendErrorSummary {
    pub kind: String,
    pub name: Option<String>,
    pub message: String,
    pub source: Option<String>,
    pub line: Option<u32>,
    pub column: Option<u32>,
    pub wall_time: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendWindowSnapshot {
    pub visible: Option<bool>,
    pub minimized: Option<bool>,
    pub maximized: Option<bool>,
    pub focused: Option<bool>,
    pub inner_size: Option<SizeSnapshot>,
    pub outer_size: Option<SizeSnapshot>,
    pub outer_position: Option<PositionSnapshot>,
    pub scale_factor: Option<f64>,
    pub url: Option<String>,
    pub errors: Vec<String>,
}

impl BackendWindowSnapshot {
    fn has_errors(&self) -> bool {
        !self.errors.is_empty()
    }

    fn is_active_visible(&self) -> bool {
        self.visible == Some(true) && self.minimized != Some(true)
    }

    fn expects_frontend_probe(&self) -> bool {
        self.url.as_deref().is_none_or(is_aio_frontend_url)
    }

    fn summary(&self) -> String {
        format!(
            "visible={:?}, minimized={:?}, maximized={:?}, focused={:?}, inner={:?}, outer={:?}, pos={:?}, scale={:?}, url={:?}, errors={:?}",
            self.visible,
            self.minimized,
            self.maximized,
            self.focused,
            self.inner_size,
            self.outer_size,
            self.outer_position,
            self.scale_factor,
            self.url,
            self.errors
        )
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SizeSnapshot {
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionSnapshot {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Copy, Default)]
struct ProbeAction {
    eval_ping: bool,
}

fn now_wall() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string()
}

fn truncate_for_log(value: &str, limit: usize) -> String {
    let char_count = value.chars().count();
    if char_count <= limit {
        value.to_string()
    } else {
        let head: String = value.chars().take(limit).collect();
        format!("{}... [truncated, chars={}]", head, char_count)
    }
}

fn configured_dev_server_port() -> u16 {
    std::env::var("VITE_PORT")
        .ok()
        .and_then(|port| port.parse::<u16>().ok())
        .unwrap_or(1420)
}

fn is_loopback_host(host: &str) -> bool {
    host.eq_ignore_ascii_case("localhost") || host == "127.0.0.1" || host == "::1"
}

fn is_configured_dev_host(host: &str) -> bool {
    std::env::var("TAURI_DEV_HOST")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .is_some_and(|configured| configured.eq_ignore_ascii_case(host))
}

fn is_aio_frontend_url(value: &str) -> bool {
    let Ok(url) = url::Url::parse(value) else {
        return false;
    };

    match url.scheme() {
        "tauri" => return url.host_str().is_none_or(|host| host == "localhost"),
        "http" | "https" => {}
        _ => return false,
    }

    let Some(host) = url.host_str() else {
        return false;
    };

    if host.eq_ignore_ascii_case("tauri.localhost") {
        return true;
    }

    url.port() == Some(configured_dev_server_port())
        && (is_loopback_host(host) || is_configured_dev_host(host))
}

fn ensure_probe<'a>(
    inner: &'a mut FrontendMonitorInner,
    label: &str,
) -> &'a mut FrontendWindowProbe {
    inner
        .windows
        .entry(label.to_string())
        .or_insert_with(FrontendWindowProbe::new)
}

impl FrontendMonitorState {
    fn mark_watchdog_started(&self) -> bool {
        !self.watchdog_started.swap(true, Ordering::SeqCst)
    }

    fn record_page_load(&self, label: &str, url: &str, event: &str) {
        let wall = now_wall();
        match self.inner.lock() {
            Ok(mut inner) => {
                let probe = ensure_probe(&mut inner, label);
                probe.destroyed = false;
                probe.page_load_count += 1;
                probe.last_page_load_event = Some(event.to_string());
                probe.last_page_load_url = Some(url.to_string());
                probe.last_page_load_wall = Some(wall.clone());
                probe.no_heartbeat_warned = false;
                probe.missed_warning_active = false;
            }
            Err(e) => {
                log::error!("[FRONTEND_MONITOR] 状态锁损坏(page_load): {}", e);
                return;
            }
        }

        log::info!(
            "[FRONTEND_MONITOR] 页面加载事件: label={}, event={}, url={}, at={}",
            label,
            event,
            url,
            wall
        );
    }

    fn record_ready(&self, label: &str, payload: &FrontendProbePayload) {
        let wall = now_wall();
        match self.inner.lock() {
            Ok(mut inner) => {
                let probe = ensure_probe(&mut inner, label);
                probe.destroyed = false;
                probe.ready_at = Some(Instant::now());
                probe.ready_wall = Some(wall.clone());
                probe.ready_phase = Some(payload.phase.clone());
                probe.last_frontend_path = Some(payload.pathname.clone());
                probe.last_frontend_route = payload.route.clone();
                probe.last_visibility_state = Some(payload.visibility_state.clone());
                probe.last_document_ready_state = Some(payload.document_ready_state.clone());
                probe.no_heartbeat_warned = false;
                probe.missed_warning_active = false;
            }
            Err(e) => {
                log::error!("[FRONTEND_MONITOR] 状态锁损坏(ready): {}", e);
                return;
            }
        }

        log::info!(
            "[FRONTEND_MONITOR] 前端 ready: label={}, phase={}, seq={}, path={}, route={:?}, readyState={}, visibility={}, viewport={:?}, ua={:?}",
            label,
            payload.phase,
            payload.sequence,
            payload.pathname,
            payload.route,
            payload.document_ready_state,
            payload.visibility_state,
            payload.viewport,
            payload.user_agent
        );
    }

    fn record_heartbeat(&self, label: &str, payload: &FrontendProbePayload) {
        let wall = now_wall();
        match self.inner.lock() {
            Ok(mut inner) => {
                let probe = ensure_probe(&mut inner, label);
                probe.destroyed = false;

                if let Some(prev_seq) = probe.last_heartbeat_seq {
                    if payload.sequence > prev_seq + 1 {
                        log::warn!(
                            "[FRONTEND_MONITOR] 前端心跳序号跳跃: label={}, prev={}, current={}, path={}, route={:?}",
                            label,
                            prev_seq,
                            payload.sequence,
                            payload.pathname,
                            payload.route
                        );
                    }
                }

                if probe.missed_warning_active {
                    let age = probe
                        .last_heartbeat_at
                        .map(|last| last.elapsed().as_millis())
                        .unwrap_or_default();
                    log::info!(
                        "[FRONTEND_MONITOR] 前端心跳恢复: label={}, gap_ms={}, seq={}, path={}, route={:?}",
                        label,
                        age,
                        payload.sequence,
                        payload.pathname,
                        payload.route
                    );
                }

                probe.last_heartbeat_at = Some(Instant::now());
                probe.last_heartbeat_wall = Some(wall);
                probe.last_heartbeat_seq = Some(payload.sequence);
                probe.last_frontend_path = Some(payload.pathname.clone());
                probe.last_frontend_route = payload.route.clone();
                probe.last_visibility_state = Some(payload.visibility_state.clone());
                probe.last_document_ready_state = Some(payload.document_ready_state.clone());
                probe.no_heartbeat_warned = false;
                probe.missed_warning_active = false;
                probe.missed_warning_checks = 0;
            }
            Err(e) => {
                log::error!("[FRONTEND_MONITOR] 状态锁损坏(heartbeat): {}", e);
            }
        }
    }

    fn record_frontend_error(&self, label: &str, payload: &FrontendErrorPayload) {
        let wall = now_wall();
        let summary = FrontendErrorSummary {
            kind: payload.kind.clone(),
            name: payload.name.clone(),
            message: truncate_for_log(&payload.message, 800),
            source: payload.source.clone(),
            line: payload.line,
            column: payload.column,
            wall_time: wall.clone(),
        };

        match self.inner.lock() {
            Ok(mut inner) => {
                let probe = ensure_probe(&mut inner, label);
                probe.destroyed = false;
                probe.frontend_error_count += 1;
                probe.last_frontend_error = Some(summary.clone());

                if let Some(snapshot) = &payload.snapshot {
                    probe.last_frontend_path = Some(snapshot.pathname.clone());
                    probe.last_frontend_route = snapshot.route.clone();
                    probe.last_visibility_state = Some(snapshot.visibility_state.clone());
                    probe.last_document_ready_state = Some(snapshot.document_ready_state.clone());
                }
            }
            Err(e) => {
                log::error!("[FRONTEND_MONITOR] 状态锁损坏(frontend_error): {}", e);
                return;
            }
        }

        log::error!(
            "[FRONTEND_MONITOR] 前端错误: label={}, kind={}, name={:?}, message={}, source={:?}, line={:?}, column={:?}, context={:?}, stack={:?}",
            label,
            payload.kind,
            payload.name,
            truncate_for_log(&payload.message, 800),
            payload.source,
            payload.line,
            payload.column,
            payload.context,
            payload.stack.as_deref().map(|stack| truncate_for_log(stack, 1200))
        );
    }

    fn record_window_event(&self, label: &str, event_name: String, details: String) {
        let wall = now_wall();
        match self.inner.lock() {
            Ok(mut inner) => {
                let probe = ensure_probe(&mut inner, label);
                probe.last_window_event = Some(format!("{} {}", event_name, details));
                probe.last_window_event_wall = Some(wall.clone());
                probe.destroyed = event_name == "Destroyed";
            }
            Err(e) => {
                log::error!("[FRONTEND_MONITOR] 状态锁损坏(window_event): {}", e);
                return;
            }
        }

        match event_name.as_str() {
            "Moved" | "Resized" => {}
            "Focused" => {
                log::debug!(
                    "[FRONTEND_MONITOR] 窗口事件: label={}, event={}, details={}, at={}",
                    label,
                    event_name,
                    details,
                    wall
                );
            }
            _ => {
                log::info!(
                    "[FRONTEND_MONITOR] 窗口事件: label={}, event={}, details={}, at={}",
                    label,
                    event_name,
                    details,
                    wall
                );
            }
        }
    }

    fn record_watchdog_snapshot(
        &self,
        label: &str,
        snapshot: BackendWindowSnapshot,
    ) -> ProbeAction {
        let mut action = ProbeAction::default();
        let now = Instant::now();

        match self.inner.lock() {
            Ok(mut inner) => {
                let probe = ensure_probe(&mut inner, label);
                probe.destroyed = false;

                if snapshot.has_errors() {
                    if !probe.backend_snapshot_error_active {
                        log::warn!(
                            "[FRONTEND_MONITOR] 后端窗口探测出现错误: label={}, snapshot={}",
                            label,
                            snapshot.summary()
                        );
                    }
                    probe.backend_snapshot_error_active = true;
                } else if probe.backend_snapshot_error_active {
                    log::info!(
                        "[FRONTEND_MONITOR] 后端窗口探测恢复: label={}, snapshot={}",
                        label,
                        snapshot.summary()
                    );
                    probe.backend_snapshot_error_active = false;
                }

                if snapshot
                    .inner_size
                    .as_ref()
                    .is_some_and(|size| size.width == 0 || size.height == 0)
                    || snapshot
                        .outer_size
                        .as_ref()
                        .is_some_and(|size| size.width == 0 || size.height == 0)
                {
                    log::warn!(
                        "[FRONTEND_MONITOR] 窗口尺寸异常: label={}, snapshot={}",
                        label,
                        snapshot.summary()
                    );
                }

                let should_check_heartbeat =
                    snapshot.is_active_visible() && snapshot.expects_frontend_probe();
                if should_check_heartbeat {
                    if probe.probe_exempt_active {
                        log::info!(
                            "[FRONTEND_MONITOR] 窗口恢复为 AIO 前端页面，重新启用心跳检查: label={}, url={:?}",
                            label,
                            snapshot.url
                        );
                    }
                    probe.probe_exempt_active = false;
                    probe.last_probe_exempt_url = None;

                    if let Some(last_heartbeat) = probe.last_heartbeat_at {
                        let elapsed = now.saturating_duration_since(last_heartbeat);
                        if elapsed >= STALE_HEARTBEAT_AFTER {
                            probe.missed_warning_checks += 1;
                            action.eval_ping = probe.missed_warning_checks == 1
                                || elapsed >= ESCALATE_HEARTBEAT_AFTER;

                            if !probe.missed_warning_active {
                                log::warn!(
                                    "[FRONTEND_MONITOR] 前端心跳缺失: label={}, elapsed_ms={}, last_seq={:?}, last_wall={:?}, path={:?}, route={:?}, snapshot={}",
                                    label,
                                    elapsed.as_millis(),
                                    probe.last_heartbeat_seq,
                                    probe.last_heartbeat_wall,
                                    probe.last_frontend_path,
                                    probe.last_frontend_route,
                                    snapshot.summary()
                                );
                                probe.missed_warning_active = true;
                            } else if elapsed >= ESCALATE_HEARTBEAT_AFTER
                                && probe.missed_warning_checks.is_multiple_of(6)
                            {
                                log::error!(
                                    "[FRONTEND_MONITOR] 前端心跳持续缺失: label={}, elapsed_ms={}, checks={}, last_seq={:?}, last_wall={:?}, last_error={:?}, snapshot={}",
                                    label,
                                    elapsed.as_millis(),
                                    probe.missed_warning_checks,
                                    probe.last_heartbeat_seq,
                                    probe.last_heartbeat_wall,
                                    probe.last_frontend_error,
                                    snapshot.summary()
                                );
                            }
                        }
                    } else {
                        let elapsed = now.saturating_duration_since(probe.first_seen_at);
                        if elapsed >= NO_HEARTBEAT_AFTER && !probe.no_heartbeat_warned {
                            action.eval_ping = true;
                            probe.no_heartbeat_warned = true;
                            log::warn!(
                                "[FRONTEND_MONITOR] 窗口存在但从未收到前端心跳: label={}, elapsed_ms={}, first_seen={}, ready={:?}, last_page_load={:?}, snapshot={}",
                                label,
                                elapsed.as_millis(),
                                probe.first_seen_wall,
                                probe.ready_wall,
                                probe.last_page_load_event,
                                snapshot.summary()
                            );
                        }
                    }
                } else {
                    if snapshot.is_active_visible() {
                        let exempt_url = snapshot.url.clone();
                        if !probe.probe_exempt_active
                            || probe.last_probe_exempt_url.as_ref() != exempt_url.as_ref()
                        {
                            log::info!(
                                "[FRONTEND_MONITOR] 窗口当前不是 AIO 前端页面，跳过前端心跳检查: label={}, url={:?}",
                                label,
                                exempt_url
                            );
                        }
                        probe.probe_exempt_active = true;
                        probe.last_probe_exempt_url = exempt_url;
                    } else {
                        probe.probe_exempt_active = false;
                        probe.last_probe_exempt_url = None;
                    }
                    probe.no_heartbeat_warned = false;
                    probe.missed_warning_active = false;
                    probe.missed_warning_checks = 0;
                }

                probe.last_backend_snapshot = Some(snapshot);
            }
            Err(e) => {
                log::error!("[FRONTEND_MONITOR] 状态锁损坏(watchdog): {}", e);
            }
        }

        action
    }

    fn record_eval_probe(&self, label: &str, result: Result<(), String>) {
        let result_text = match result {
            Ok(()) => "ok".to_string(),
            Err(e) => format!("error: {}", e),
        };

        match self.inner.lock() {
            Ok(mut inner) => {
                let probe = ensure_probe(&mut inner, label);
                probe.last_eval_probe_at = Some(Instant::now());
                probe.last_eval_probe_result = Some(result_text.clone());
            }
            Err(e) => {
                log::error!("[FRONTEND_MONITOR] 状态锁损坏(eval_probe): {}", e);
                return;
            }
        }

        if result_text == "ok" {
            log::info!(
                "[FRONTEND_MONITOR] 后端 eval 探针已投递: label={}, result=ok",
                label
            );
        } else {
            log::error!(
                "[FRONTEND_MONITOR] 后端 eval 探针失败: label={}, result={}",
                label,
                result_text
            );
        }
    }

    fn mark_missing_windows(&self, active_labels: &HashSet<String>) {
        match self.inner.lock() {
            Ok(mut inner) => {
                for (label, probe) in inner.windows.iter_mut() {
                    if !active_labels.contains(label) && !probe.destroyed {
                        probe.destroyed = true;
                        probe.last_window_event = Some("MissingFromWebviewMap".to_string());
                        probe.last_window_event_wall = Some(now_wall());
                        log::warn!(
                            "[FRONTEND_MONITOR] 窗口记录仍存在，但已不在 webview_windows 列表中: label={}, last_heartbeat={:?}, last_page_load={:?}",
                            label,
                            probe.last_heartbeat_wall,
                            probe.last_page_load_event
                        );
                    }
                }
            }
            Err(e) => {
                log::error!("[FRONTEND_MONITOR] 状态锁损坏(missing_windows): {}", e);
            }
        }
    }

    fn statuses(&self) -> Vec<FrontendProbeStatus> {
        match self.inner.lock() {
            Ok(inner) => inner
                .windows
                .iter()
                .map(|(label, probe)| FrontendProbeStatus {
                    label: label.clone(),
                    first_seen_wall: probe.first_seen_wall.clone(),
                    ready_wall: probe.ready_wall.clone(),
                    ready_phase: probe.ready_phase.clone(),
                    page_load_count: probe.page_load_count,
                    last_page_load_event: probe.last_page_load_event.clone(),
                    last_page_load_url: probe.last_page_load_url.clone(),
                    last_page_load_wall: probe.last_page_load_wall.clone(),
                    last_heartbeat_wall: probe.last_heartbeat_wall.clone(),
                    last_heartbeat_age_ms: probe
                        .last_heartbeat_at
                        .map(|last| last.elapsed().as_millis()),
                    last_heartbeat_seq: probe.last_heartbeat_seq,
                    last_frontend_path: probe.last_frontend_path.clone(),
                    last_frontend_route: probe.last_frontend_route.clone(),
                    last_visibility_state: probe.last_visibility_state.clone(),
                    last_document_ready_state: probe.last_document_ready_state.clone(),
                    last_eval_probe_result: probe.last_eval_probe_result.clone(),
                    last_window_event: probe.last_window_event.clone(),
                    last_window_event_wall: probe.last_window_event_wall.clone(),
                    frontend_error_count: probe.frontend_error_count,
                    last_frontend_error: probe.last_frontend_error.clone(),
                    last_backend_snapshot: probe.last_backend_snapshot.clone(),
                    destroyed: probe.destroyed,
                })
                .collect(),
            Err(e) => {
                log::error!("[FRONTEND_MONITOR] 状态锁损坏(statuses): {}", e);
                Vec::new()
            }
        }
    }
}

#[tauri::command]
pub fn frontend_probe_ready(
    window: WebviewWindow,
    state: tauri::State<'_, FrontendMonitorState>,
    payload: FrontendProbePayload,
) -> Result<(), String> {
    state.record_ready(window.label(), &payload);
    Ok(())
}

#[tauri::command]
pub fn frontend_probe_heartbeat(
    window: WebviewWindow,
    state: tauri::State<'_, FrontendMonitorState>,
    payload: FrontendProbePayload,
) -> Result<(), String> {
    state.record_heartbeat(window.label(), &payload);
    Ok(())
}

#[tauri::command]
pub fn frontend_probe_error(
    window: WebviewWindow,
    state: tauri::State<'_, FrontendMonitorState>,
    payload: FrontendErrorPayload,
) -> Result<(), String> {
    state.record_frontend_error(window.label(), &payload);
    Ok(())
}

#[tauri::command]
pub fn get_frontend_probe_status(
    state: tauri::State<'_, FrontendMonitorState>,
) -> Result<Vec<FrontendProbeStatus>, String> {
    Ok(state.statuses())
}

pub fn record_page_load(webview: &Webview, payload: &tauri::webview::PageLoadPayload<'_>) {
    let Some(state) = webview.try_state::<FrontendMonitorState>() else {
        return;
    };
    state.record_page_load(
        webview.label(),
        payload.url().as_str(),
        &format!("{:?}", payload.event()),
    );
}

pub fn record_window_event(window: &Window, event: &WindowEvent) {
    let Some(state) = window.try_state::<FrontendMonitorState>() else {
        return;
    };

    match event {
        WindowEvent::Resized(size) => {
            let details = format!("{}x{}", size.width, size.height);
            if size.width == 0 || size.height == 0 {
                log::warn!(
                    "[FRONTEND_MONITOR] 窗口 Resized 为 0 尺寸: label={}, details={}",
                    window.label(),
                    details
                );
            }
            state.record_window_event(window.label(), "Resized".to_string(), details);
        }
        WindowEvent::Moved(position) => {
            state.record_window_event(
                window.label(),
                "Moved".to_string(),
                format!("{},{}", position.x, position.y),
            );
        }
        WindowEvent::CloseRequested { .. } => {
            state.record_window_event(window.label(), "CloseRequested".to_string(), "".to_string());
        }
        WindowEvent::Destroyed => {
            state.record_window_event(window.label(), "Destroyed".to_string(), "".to_string());
        }
        WindowEvent::Focused(focused) => {
            state.record_window_event(window.label(), "Focused".to_string(), focused.to_string());
        }
        WindowEvent::ScaleFactorChanged {
            scale_factor,
            new_inner_size,
            ..
        } => {
            state.record_window_event(
                window.label(),
                "ScaleFactorChanged".to_string(),
                format!(
                    "scale={}, inner={}x{}",
                    scale_factor, new_inner_size.width, new_inner_size.height
                ),
            );
        }
        WindowEvent::DragDrop(_) => {}
        WindowEvent::ThemeChanged(theme) => {
            state.record_window_event(
                window.label(),
                "ThemeChanged".to_string(),
                format!("{:?}", theme),
            );
        }
        _ => {
            state.record_window_event(
                window.label(),
                "Unknown".to_string(),
                format!("{:?}", event),
            );
        }
    }
}

pub fn start_frontend_monitor(app: AppHandle) {
    let Some(state) = app.try_state::<FrontendMonitorState>() else {
        log::warn!("[FRONTEND_MONITOR] 状态尚未注册，无法启动 watchdog");
        return;
    };

    if !state.mark_watchdog_started() {
        return;
    }

    log::info!(
        "[FRONTEND_MONITOR] 后端 watchdog 已启动: interval_ms={}, stale_after_ms={}",
        WATCHDOG_INTERVAL.as_millis(),
        STALE_HEARTBEAT_AFTER.as_millis()
    );

    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(WATCHDOG_INTERVAL);
        loop {
            interval.tick().await;
            check_windows_once(&app);
        }
    });
}

fn check_windows_once(app: &AppHandle) {
    let Some(state) = app.try_state::<FrontendMonitorState>() else {
        return;
    };

    let windows = app.webview_windows();
    let active_labels: HashSet<String> = windows.keys().cloned().collect();
    state.mark_missing_windows(&active_labels);

    for (label, window) in windows {
        let snapshot = collect_window_snapshot(&window);
        let action = state.record_watchdog_snapshot(&label, snapshot);

        if action.eval_ping {
            let js = format!(
                "window.__AIO_BACKEND_WATCHDOG_PING__ = {{ label: {:?}, at: Date.now() }};",
                label
            );
            let result = window.eval(js).map_err(|e| e.to_string());
            state.record_eval_probe(&label, result);
        }
    }
}

fn collect_window_snapshot(window: &WebviewWindow) -> BackendWindowSnapshot {
    let mut errors = Vec::new();

    let visible = capture_result(&mut errors, "is_visible", || window.is_visible());
    let minimized = capture_result(&mut errors, "is_minimized", || window.is_minimized());
    let maximized = capture_result(&mut errors, "is_maximized", || window.is_maximized());
    let focused = capture_result(&mut errors, "is_focused", || window.is_focused());
    let inner_size =
        capture_result(&mut errors, "inner_size", || window.inner_size()).map(|size| {
            SizeSnapshot {
                width: size.width,
                height: size.height,
            }
        });
    let outer_size =
        capture_result(&mut errors, "outer_size", || window.outer_size()).map(|size| {
            SizeSnapshot {
                width: size.width,
                height: size.height,
            }
        });
    let outer_position = capture_result(&mut errors, "outer_position", || window.outer_position())
        .map(|position| PositionSnapshot {
            x: position.x,
            y: position.y,
        });
    let scale_factor = capture_result(&mut errors, "scale_factor", || window.scale_factor());
    let url = capture_result(&mut errors, "url", || window.url()).map(|url| url.to_string());

    BackendWindowSnapshot {
        visible,
        minimized,
        maximized,
        focused,
        inner_size,
        outer_size,
        outer_position,
        scale_factor,
        url,
        errors,
    }
}

fn capture_result<T, F>(errors: &mut Vec<String>, name: &str, f: F) -> Option<T>
where
    F: FnOnce() -> tauri::Result<T>,
{
    match f() {
        Ok(value) => Some(value),
        Err(e) => {
            errors.push(format!("{}: {}", name, e));
            None
        }
    }
}
