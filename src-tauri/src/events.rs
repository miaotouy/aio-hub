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

use crate::commands;
use crate::commands::AppState;
use crate::tray::should_prevent_close;
use crate::utils::print_window_list;
use serde::Serialize;
use std::path::PathBuf;
use tauri::{DragDropEvent, Emitter, Manager, PhysicalPosition, WindowEvent};

#[derive(Clone, Serialize)]
pub struct FileDropPayload {
    pub paths: Vec<PathBuf>,
    pub position: PhysicalPosition<f64>,
}

#[derive(Clone, Serialize)]
pub struct DragPositionPayload {
    pub position: PhysicalPosition<f64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryScanProgress {
    pub current_path: String,
    pub scanned_count: usize,
    pub current_depth: usize,
    pub found_items: usize,
}

// 处理窗口事件
pub fn handle_window_event(window: &tauri::Window, event: &WindowEvent) {
    if let WindowEvent::DragDrop(event) = event {
        match event {
            DragDropEvent::Enter { paths, position } => {
                // 发送拖动进入事件
                log::debug!("Drag enter: {:?} at position {:?}", paths, position);
                window
                    .emit(
                        "custom-drag-enter",
                        DragPositionPayload {
                            position: *position,
                        },
                    )
                    .unwrap();
            }
            DragDropEvent::Over { position } => {
                // 发送拖动移动事件
                window
                    .emit(
                        "custom-drag-over",
                        DragPositionPayload {
                            position: *position,
                        },
                    )
                    .unwrap();
            }
            DragDropEvent::Leave => {
                // 发送拖动离开事件
                log::debug!("Drag leave");
                window.emit("custom-drag-leave", ()).unwrap();
            }
            DragDropEvent::Drop { paths, position } => {
                // 发送文件拖放事件到前端
                log::info!("File drop captured: {:?} at position {:?}", paths, position);
                window
                    .emit(
                        "custom-file-drop",
                        FileDropPayload {
                            paths: paths.clone(),
                            position: *position,
                        },
                    )
                    .unwrap();
            }
            _ => {}
        }
    }
}

pub fn handle_global_window_event(window: &tauri::Window, event: &WindowEvent) {
    // 先处理文件拖放事件
    handle_window_event(window, event);
    crate::frontend_monitor::record_window_event(window, event);

    // 处理窗口关闭事件（托盘功能和工具窗口）
    if let WindowEvent::CloseRequested { api, .. } = event {
        let window_label = window.label().to_string();

        // 在关闭前同步保存窗口配置
        if let Err(e) =
            commands::window_config::save_window_config_sync(window.app_handle(), &window_label)
        {
            log::error!("[WINDOW_CONFIG] 保存窗口配置失败: {}", e);
        }

        // 如果关闭的是分离窗口（非主窗口），调用统一的关闭命令
        if window_label != "main" {
            if commands::canvas_window::is_canvas_window(&window_label) {
                // 画布窗口：走画布模块的清理路径
                commands::canvas_window::handle_canvas_window_close(
                    window.app_handle(),
                    &window_label,
                );
            } else {
                // 分离窗口：走现有逻辑（不变）
                let app_handle = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = commands::close_detached_window(app_handle, window_label).await
                    {
                        log::error!("Error closing detached window: {}", e);
                    }
                });
            }
        }
        // 如果是主窗口，处理托盘逻辑
        else if let Some(app_state) = window.app_handle().try_state::<AppState>() {
            if let Ok(minimize_to_tray) = app_state.minimize_to_tray.lock() {
                if should_prevent_close(*minimize_to_tray) {
                    api.prevent_close(); // 阻止默认关闭行为

                    let app_handle = window.app_handle();
                    let windows = app_handle.webview_windows();
                    let relevant_window_count = windows.keys().count();

                    // 如果有超过一个窗口（即存在分离窗口），则不允许隐藏，而是聚焦主窗口
                    if relevant_window_count > 1 {
                        let _ = window.show();
                        let _ = window.set_focus();
                    } else {
                        // 否则，安全地隐藏窗口
                        let _ = window.hide();
                    }
                } else {
                    // 未启用最小化到托盘，发送关闭确认请求到前端
                    api.prevent_close(); // 阻止默认关闭行为
                    let _ = window.emit("request-close-confirmation", ());
                }
            }
        }
    }

    // 监听窗口销毁事件，打印窗口列表
    if let WindowEvent::Destroyed = event {
        print_window_list(window.app_handle());
    }
}
