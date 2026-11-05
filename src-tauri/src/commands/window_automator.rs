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

//! Thin Tauri adapters for the shared Windows implementation.
pub use crate::screen_capture::CaptureResult;
use crate::window_automation as core;
pub use core::{WaClickResult, WaClientRect, WaWindowInfo};

#[tauri::command]
pub fn wa_get_windows(exclude_self: Option<bool>) -> Result<Vec<WaWindowInfo>, String> {
    core::wa_get_windows(exclude_self, std::process::id())
}
#[tauri::command]
pub fn wa_get_self_pid() -> u32 {
    core::wa_get_self_pid()
}
#[tauri::command]
pub fn wa_get_pixel(hwnd: i64, x: i32, y: i32) -> Result<[u8; 3], String> {
    core::wa_get_pixel(hwnd, x, y)
}
#[tauri::command]
pub fn wa_capture_window(hwnd: i64) -> Result<tauri::ipc::Response, String> {
    core::wa_capture_window(hwnd).map(tauri::ipc::Response::new)
}
#[tauri::command]
pub fn wa_send_click(
    hwnd: i64,
    x: i32,
    y: i32,
    button: String,
    double_click: bool,
    mode: Option<String>,
) -> Result<WaClickResult, String> {
    core::wa_send_click(hwnd, x, y, button, double_click, mode)
}
#[tauri::command]
pub fn wa_send_keypress(
    hwnd: i64,
    key: String,
    modifiers: Option<Vec<String>>,
    mode: Option<String>,
) -> Result<(), String> {
    core::wa_send_keypress(hwnd, key, modifiers, mode)
}
#[tauri::command]
pub fn wa_get_client_rect(hwnd: i64) -> Result<WaClientRect, String> {
    core::wa_get_client_rect(hwnd)
}
#[tauri::command]
pub fn wa_is_window_valid(hwnd: i64) -> bool {
    core::wa_is_window_valid(hwnd)
}

/// 屏幕区域截屏：抓取屏幕指定物理坐标区域 (x, y, width, height) 的像素，
/// 计算 aHash 并与 last_hash 对比。若汉明距离小于 threshold，则判定为无变化，
/// 不进行 PNG 编码，直接返回 changed: false。否则进行 PNG 编码并返回 changed: true。
/// 用于“实时字幕 OCR”工具的高频低开销采样。
///
/// 注意：参数均为**物理像素**坐标（相对于主显示器左上角，跨屏时可为负值）。
#[tauri::command]
pub fn capture_screen_rect(
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    last_hash: Option<String>,
    threshold: Option<i32>,
) -> Result<CaptureResult, String> {
    crate::screen_capture::capture_screen_rect(
        x,
        y,
        width,
        height,
        last_hash,
        threshold,
        &Default::default(),
    )
}
