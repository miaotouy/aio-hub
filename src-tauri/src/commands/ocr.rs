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

pub use crate::ocr::OcrResult;

#[tauri::command]
pub async fn check_native_ocr_availability() -> Result<(), String> {
    tokio::task::spawn_blocking(|| crate::ocr::check_native_ocr_availability(&Default::default()))
        .await
        .map_err(|e| format!("系统 OCR 任务失败: {e}"))?
}
#[tauri::command]
pub async fn native_ocr(image_data: String) -> Result<OcrResult, String> {
    tokio::task::spawn_blocking(move || crate::ocr::native_ocr(&image_data, &Default::default()))
        .await
        .map_err(|e| format!("系统 OCR 任务失败: {e}"))?
}
