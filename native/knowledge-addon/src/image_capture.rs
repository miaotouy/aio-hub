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
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;
#[path = "../../../src-tauri/src/ocr.rs"]
mod ocr;
#[path = "../../../src-tauri/src/screen_capture.rs"]
mod screen_capture;
fn error(value: impl std::fmt::Display) -> Error {
    Error::from_reason(value.to_string())
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CaptureRequest {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    last_hash: Option<String>,
    threshold: Option<i32>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OcrRequest {
    image_data: String,
}
#[napi]
pub struct ImageCaptureRuntime {
    cancel: CancellationToken,
}
#[napi]
impl ImageCaptureRuntime {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            cancel: CancellationToken::new(),
        }
    }
    #[napi]
    pub fn cancel(&self) {
        self.cancel.cancel();
    }
    #[napi]
    pub async fn run(&self, command: String, configuration: String) -> Result<String> {
        if configuration.len() > 44 * 1024 * 1024 {
            return Err(error("图片请求数据过大，请缩小图片后重试"));
        }
        let cancel = self.cancel.clone();
        tokio::task::spawn_blocking(move || {
            if cancel.is_cancelled() {
                return Err(error("图像任务已随窗口关闭"));
            }
            let result = match command.as_str() {
                "capture_screen_rect" => {
                    let args: CaptureRequest =
                        serde_json::from_str(&configuration).map_err(error)?;
                    json!(screen_capture::capture_screen_rect(
                        args.x,
                        args.y,
                        args.width,
                        args.height,
                        args.last_hash,
                        args.threshold,
                        &cancel
                    )
                    .map_err(error)?)
                }
                "check_native_ocr_availability" => {
                    ocr::check_native_ocr_availability(&cancel).map_err(error)?;
                    Value::Null
                }
                "native_ocr" => {
                    let args: OcrRequest = serde_json::from_str(&configuration).map_err(error)?;
                    json!(ocr::native_ocr(&args.image_data, &cancel).map_err(error)?)
                }
                _ => return Err(error("不支持的图像操作")),
            };
            if cancel.is_cancelled() {
                return Err(error("图像任务已随窗口关闭"));
            }
            serde_json::to_string(&result).map_err(error)
        })
        .await
        .map_err(error)?
    }
}
