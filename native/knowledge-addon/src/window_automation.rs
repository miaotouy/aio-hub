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
#[cfg(windows)]
#[path = "../../../src-tauri/src/window_automation.rs"]
mod core;
#[cfg(windows)]
use serde::Deserialize;
#[cfg(windows)]
use serde_json::json;

#[cfg(windows)]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    #[serde(default)]
    hwnd: i64,
    #[serde(default)]
    x: i32,
    #[serde(default)]
    y: i32,
    exclude_self: Option<bool>,
    #[serde(default)]
    button: String,
    #[serde(default)]
    double_click: bool,
    mode: Option<String>,
    #[serde(default)]
    key: String,
    modifiers: Option<Vec<String>>,
}
// Runs only inside the host's killable utility process, never on Electron's main thread.
#[napi]
pub fn window_automation(command: String, configuration: String, self_pid: u32) -> Result<String> {
    #[cfg(windows)]
    {
        let args: Request =
            serde_json::from_str(&configuration).map_err(|e| Error::from_reason(e.to_string()))?;
        let result = (|| -> std::result::Result<serde_json::Value, String> {
            Ok(match command.as_str() {
                "wa_get_windows" => json!(core::wa_get_windows(args.exclude_self, self_pid)?),
                "wa_get_self_pid" => json!(self_pid),
                "wa_get_pixel" => json!(core::wa_get_pixel(args.hwnd, args.x, args.y)?),
                "wa_capture_window" => {
                    use base64::Engine;
                    json!(base64::engine::general_purpose::STANDARD
                        .encode(core::wa_capture_window(args.hwnd)?))
                }
                "wa_send_click" => json!(core::wa_send_click(
                    args.hwnd,
                    args.x,
                    args.y,
                    args.button,
                    args.double_click,
                    args.mode
                )?),
                "wa_send_keypress" => {
                    core::wa_send_keypress(args.hwnd, args.key, args.modifiers, args.mode)?;
                    serde_json::Value::Null
                }
                "wa_get_client_rect" => json!(core::wa_get_client_rect(args.hwnd)?),
                "wa_is_window_valid" => json!(core::wa_is_window_valid(args.hwnd)),
                _ => return Err("不支持的窗口操作".into()),
            })
        })()
        .map_err(Error::from_reason)?;
        serde_json::to_string(&result).map_err(|e| Error::from_reason(e.to_string()))
    }
    #[cfg(not(windows))]
    {
        let _ = (command, configuration, self_pid);
        Err(Error::from_reason("窗口自动化需要 Windows 桌面版"))
    }
}
