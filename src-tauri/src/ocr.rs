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

//! Shared native OCR with bounded input and cancellable WinRT operations.
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrResult {
    pub text: String,
    pub confidence: f64,
}

fn decode_image(image_data: &str) -> Result<Vec<u8>, String> {
    if image_data.len() > 44 * 1024 * 1024 {
        return Err("图片数据过大，请缩小图片后重试".into());
    }
    let data = if image_data.starts_with("data:") {
        let (metadata, data) = image_data.split_once(',').ok_or("图片 data URL 格式无效")?;
        if !metadata.starts_with("data:image/") || !metadata.ends_with(";base64") {
            return Err("请提供 Base64 编码的图片".into());
        }
        data
    } else {
        image_data
    };
    let bytes = STANDARD.decode(data).map_err(|_| "图片 Base64 数据无效")?;
    if bytes.is_empty() || bytes.len() > 32 * 1024 * 1024 {
        return Err("图片数据为空或过大，请重新选择图片".into());
    }
    Ok(bytes)
}

pub fn check_native_ocr_availability(cancel: &CancellationToken) -> Result<(), String> {
    if cancel.is_cancelled() {
        return Err("图像任务已随窗口关闭".into());
    }
    #[cfg(windows)]
    {
        let _apartment = winrt::Apartment::new()?;
        winrt::engine().map(|_| ())
    }
    #[cfg(not(windows))]
    {
        Err("系统原生 OCR 需要 Windows 桌面版，请选择其他识别引擎".into())
    }
}
pub fn native_ocr(image_data: &str, cancel: &CancellationToken) -> Result<OcrResult, String> {
    if cancel.is_cancelled() {
        return Err("图像任务已随窗口关闭".into());
    }
    let bytes = decode_image(image_data)?;
    #[cfg(windows)]
    {
        winrt::recognize(&bytes, cancel)
    }
    #[cfg(not(windows))]
    {
        let _ = bytes;
        Err("系统原生 OCR 需要 Windows 桌面版，请选择其他识别引擎".into())
    }
}

#[cfg(windows)]
mod winrt {
    use super::*;
    use std::time::{Duration, Instant};
    use windows::{
        core::{Interface, RuntimeType, HSTRING},
        Foundation::{AsyncStatus, IAsyncOperation},
        Graphics::Imaging::{BitmapDecoder, BitmapPixelFormat, SoftwareBitmap},
        Media::Ocr::OcrEngine,
        Storage::Streams::{DataWriter, InMemoryRandomAccessStream},
        Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
    };
    pub struct Apartment;
    impl Apartment {
        pub fn new() -> Result<Self, String> {
            unsafe { RoInitialize(RO_INIT_MULTITHREADED) }
                .map_err(|e| format!("初始化系统 OCR 运行环境失败: {e}"))?;
            Ok(Self)
        }
    }
    impl Drop for Apartment {
        fn drop(&mut self) {
            unsafe { RoUninitialize() };
        }
    }
    pub fn engine() -> Result<OcrEngine, String> {
        let chinese = windows::Globalization::Language::CreateLanguage(&HSTRING::from("zh-Hans"));
        chinese
            .and_then(|language| OcrEngine::TryCreateFromLanguage(&language))
            .or_else(|_| OcrEngine::TryCreateFromUserProfileLanguages())
            .map_err(|_| "系统 OCR 引擎不可用，请在 Windows 语言设置中安装文字识别组件".into())
    }
    fn wait<T: RuntimeType + 'static>(
        operation: IAsyncOperation<T>,
        cancel: &CancellationToken,
        deadline: Instant,
    ) -> Result<T, String> {
        loop {
            if cancel.is_cancelled() || Instant::now() >= deadline {
                let _ = operation.Cancel();
                return Err(if cancel.is_cancelled() {
                    "图像任务已随窗口关闭"
                } else {
                    "系统 OCR 响应超时，请缩小图片或稍后重试"
                }
                .into());
            }
            if operation
                .Status()
                .map_err(|e| format!("读取系统 OCR 状态失败: {e}"))?
                != AsyncStatus::Started
            {
                return operation
                    .GetResults()
                    .map_err(|e| format!("系统 OCR 图像处理失败: {e}"));
            }
            std::thread::sleep(Duration::from_millis(10));
        }
    }
    pub fn recognize(bytes: &[u8], cancel: &CancellationToken) -> Result<OcrResult, String> {
        let _apartment = Apartment::new()?;
        let deadline = Instant::now() + Duration::from_secs(30);
        let stream =
            InMemoryRandomAccessStream::new().map_err(|e| format!("创建图片流失败: {e}"))?;
        let writer = DataWriter::CreateDataWriter(&stream)
            .map_err(|e| format!("创建图片写入器失败: {e}"))?;
        writer
            .WriteBytes(bytes)
            .map_err(|e| format!("写入图片失败: {e}"))?;
        wait(
            writer
                .StoreAsync()
                .map_err(|e| e.to_string())?
                .cast::<IAsyncOperation<u32>>()
                .map_err(|e| e.to_string())?,
            cancel,
            deadline,
        )?;
        wait(
            writer.FlushAsync().map_err(|e| e.to_string())?,
            cancel,
            deadline,
        )?;
        stream.Seek(0).map_err(|e| e.to_string())?;
        let decoder = wait(
            BitmapDecoder::CreateAsync(&stream).map_err(|e| e.to_string())?,
            cancel,
            deadline,
        )?;
        let maximum = OcrEngine::MaxImageDimension().map_err(|e| e.to_string())?;
        let width = decoder.PixelWidth().map_err(|e| e.to_string())?;
        let height = decoder.PixelHeight().map_err(|e| e.to_string())?;
        if width == 0 || height == 0 || width > maximum || height > maximum {
            return Err(format!(
                "图片尺寸超过系统 OCR 上限（{maximum} 像素），请缩小后重试"
            ));
        }
        let bitmap = wait(
            decoder
                .GetSoftwareBitmapAsync()
                .map_err(|e| e.to_string())?,
            cancel,
            deadline,
        )?;
        let bitmap = SoftwareBitmap::Convert(&bitmap, BitmapPixelFormat::Rgba8)
            .map_err(|e| e.to_string())?;
        let engine = engine()?;
        let result = wait(
            engine.RecognizeAsync(&bitmap).map_err(|e| e.to_string())?,
            cancel,
            deadline,
        )?;
        Ok(OcrResult {
            text: result.Text().map_err(|e| e.to_string())?.to_string(),
            confidence: 0.95,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn accepts_raw_and_image_data_urls_and_rejects_malformed_input() {
        for value in [
            "AQID",
            "data:image/png;base64,AQID",
            "data:image/jpeg;base64,AQID",
        ] {
            assert_eq!(decode_image(value).unwrap(), vec![1, 2, 3]);
        }
        for value in [
            "",
            "%%%",
            "data:text/plain;base64,AQID",
            "data:image/png,AQID",
            "data:image/png;base64",
        ] {
            assert!(decode_image(value).is_err());
        }
    }
    #[test]
    fn cancelled_work_never_enters_the_system_ocr_engine() {
        let cancel = CancellationToken::new();
        cancel.cancel();
        assert!(native_ocr("AQID", &cancel).unwrap_err().contains("关闭"));
        assert!(check_native_ocr_availability(&cancel)
            .unwrap_err()
            .contains("关闭"));
    }
}
