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

//! Shared physical-pixel capture and aHash deduplication.
use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureResult {
    pub changed: bool,
    pub hash: String,
    pub image_bytes: Option<Vec<u8>>,
}

fn validate_rect(
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    threshold: Option<i32>,
) -> Result<(), String> {
    if width <= 0
        || height <= 0
        || width > 32768
        || height > 32768
        || u64::try_from(width).unwrap_or(0) * u64::try_from(height).unwrap_or(0) > 64 * 1024 * 1024
        || x.checked_add(width).is_none()
        || y.checked_add(height).is_none()
    {
        return Err("截屏区域尺寸无效或过大，请重新选择区域".into());
    }
    if threshold.is_some_and(|value| !(0..=64).contains(&value)) {
        return Err("画面去重阈值需要介于 0 到 64".into());
    }
    Ok(())
}
fn encode_frame(
    image: image::RgbaImage,
    last_hash: Option<&str>,
    threshold: Option<i32>,
    cancel: &CancellationToken,
) -> Result<CaptureResult, String> {
    if cancel.is_cancelled() {
        return Err("图像任务已随窗口关闭".into());
    }
    let resized = image::imageops::resize(&image, 8, 8, image::imageops::FilterType::Triangle);
    let mut grays = [0u8; 64];
    let mut sum = 0u32;
    for (i, pixel) in resized.pixels().enumerate() {
        let gray =
            ((u32::from(pixel[0]) * 299 + u32::from(pixel[1]) * 587 + u32::from(pixel[2]) * 114)
                / 1000) as u8;
        grays[i] = gray;
        sum += u32::from(gray);
    }
    let average = (sum / 64) as u8;
    let hash: String = grays
        .into_iter()
        .map(|gray| if gray >= average { '1' } else { '0' })
        .collect();
    let changed = last_hash
        .filter(|hash| hash.len() == 64 && hash.bytes().all(|b| b == b'0' || b == b'1'))
        .map(|previous| {
            previous
                .bytes()
                .zip(hash.bytes())
                .filter(|(a, b)| a != b)
                .count() as i32
                >= threshold.unwrap_or(4)
        })
        .unwrap_or(true);
    if cancel.is_cancelled() {
        return Err("图像任务已随窗口关闭".into());
    }
    let image_bytes = if changed {
        use image::{
            codecs::png::{CompressionType, FilterType, PngEncoder},
            ImageEncoder,
        };
        let mut bytes = Vec::new();
        PngEncoder::new_with_quality(&mut bytes, CompressionType::Fast, FilterType::NoFilter)
            .write_image(
                image.as_raw(),
                image.width(),
                image.height(),
                image::ExtendedColorType::Rgba8,
            )
            .map_err(|e| format!("PNG 编码失败: {e}"))?;
        Some(bytes)
    } else {
        None
    };
    if cancel.is_cancelled() {
        return Err("图像任务已随窗口关闭".into());
    }
    Ok(CaptureResult {
        changed,
        hash,
        image_bytes,
    })
}

pub fn capture_screen_rect(
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    last_hash: Option<String>,
    threshold: Option<i32>,
    cancel: &CancellationToken,
) -> Result<CaptureResult, String> {
    validate_rect(x, y, width, height, threshold)?;
    if cancel.is_cancelled() {
        return Err("图像任务已随窗口关闭".into());
    }
    #[cfg(windows)]
    {
        encode_frame(
            windows_capture(x, y, width, height)?,
            last_hash.as_deref(),
            threshold,
            cancel,
        )
    }
    #[cfg(not(windows))]
    {
        let _ = last_hash;
        Err("屏幕区域采集需要 Windows 桌面版".into())
    }
}
#[cfg(windows)]
fn windows_capture(x: i32, y: i32, width: i32, height: i32) -> Result<image::RgbaImage, String> {
    use scopeguard::defer;
    use std::mem::size_of;
    use windows::Win32::{
        Foundation::HWND,
        Graphics::Gdi::{
            BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
            GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
            DIB_RGB_COLORS, HGDIOBJ, SRCCOPY,
        },
        UI::{
            HiDpi::{SetThreadDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2},
            WindowsAndMessaging::{
                GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN,
                SM_YVIRTUALSCREEN,
            },
        },
    };
    let previous =
        unsafe { SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) };
    if previous.0.is_null() {
        return Err("设置截屏物理坐标环境失败".into());
    }
    defer!(unsafe {
        let _ = SetThreadDpiAwarenessContext(previous);
    });
    let left = unsafe { GetSystemMetrics(SM_XVIRTUALSCREEN) };
    let top = unsafe { GetSystemMetrics(SM_YVIRTUALSCREEN) };
    let right = i64::from(left) + i64::from(unsafe { GetSystemMetrics(SM_CXVIRTUALSCREEN) });
    let bottom = i64::from(top) + i64::from(unsafe { GetSystemMetrics(SM_CYVIRTUALSCREEN) });
    if x < left
        || y < top
        || i64::from(x) + i64::from(width) > right
        || i64::from(y) + i64::from(height) > bottom
    {
        return Err("截屏区域超出显示器范围，请重新定位监控框".into());
    }
    let hwnd = HWND(std::ptr::null_mut());
    let src_dc = unsafe { GetDC(hwnd) };
    if src_dc.is_invalid() {
        return Err("获取屏幕 DC 失败".into());
    }
    defer!(unsafe {
        ReleaseDC(hwnd, src_dc);
    });
    let mem_dc = unsafe { CreateCompatibleDC(src_dc) };
    if mem_dc.is_invalid() {
        return Err("创建内存 DC 失败".into());
    }
    defer!(unsafe {
        let _ = DeleteDC(mem_dc);
    });
    let bitmap = unsafe { CreateCompatibleBitmap(src_dc, width, height) };
    if bitmap.is_invalid() {
        return Err("创建截屏位图失败".into());
    }
    defer!(unsafe {
        let _ = DeleteObject(bitmap);
    });
    let previous = unsafe { SelectObject(mem_dc, HGDIOBJ(bitmap.0)) };
    if previous.is_invalid() {
        return Err("选择截屏位图失败".into());
    }
    let selection = scopeguard::guard(previous, |previous| unsafe {
        let _ = SelectObject(mem_dc, previous);
    });
    unsafe { BitBlt(mem_dc, 0, 0, width, height, src_dc, x, y, SRCCOPY) }
        .map_err(|e| format!("屏幕区域采集失败: {e}"))?;
    drop(selection);
    let mut bitmap_info = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            ..Default::default()
        },
        ..Default::default()
    };
    let mut pixels = vec![0u8; width as usize * height as usize * 4];
    let lines = unsafe {
        GetDIBits(
            src_dc,
            bitmap,
            0,
            height as u32,
            Some(pixels.as_mut_ptr().cast()),
            &mut bitmap_info,
            DIB_RGB_COLORS,
        )
    };
    if lines != height {
        return Err("读取屏幕像素失败，请重新采集".into());
    }
    for pixel in pixels.chunks_exact_mut(4) {
        pixel.swap(0, 2);
        pixel[3] = 255;
    }
    image::RgbaImage::from_raw(width as u32, height as u32, pixels)
        .ok_or_else(|| "构造截屏图片失败".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn sample() -> image::RgbaImage {
        image::RgbaImage::from_fn(64, 32, |x, y| {
            image::Rgba([(x * 3) as u8, (y * 7) as u8, 80, 255])
        })
    }
    #[test]
    fn png_preserves_region_dimensions_and_pixels() {
        let image = sample();
        let frame = encode_frame(image.clone(), None, None, &Default::default()).unwrap();
        assert!(frame.changed);
        assert_eq!(frame.hash.len(), 64);
        let decoded = image::load_from_memory(&frame.image_bytes.unwrap())
            .unwrap()
            .to_rgba8();
        assert_eq!(decoded, image);
    }
    #[test]
    fn dedup_keeps_strict_distance_threshold_and_forced_capture() {
        let image = sample();
        let hash = encode_frame(image.clone(), None, None, &Default::default())
            .unwrap()
            .hash;
        let same = encode_frame(image.clone(), Some(&hash), None, &Default::default()).unwrap();
        assert!(!same.changed);
        assert!(same.image_bytes.is_none());
        assert!(
            encode_frame(image.clone(), Some(&hash), Some(0), &Default::default())
                .unwrap()
                .changed
        );
        let mut previous = hash.into_bytes();
        previous[0] = if previous[0] == b'0' { b'1' } else { b'0' };
        let previous = String::from_utf8(previous).unwrap();
        assert!(
            encode_frame(image.clone(), Some(&previous), Some(1), &Default::default())
                .unwrap()
                .changed
        );
        assert!(
            !encode_frame(image.clone(), Some(&previous), Some(2), &Default::default())
                .unwrap()
                .changed
        );
        assert!(
            encode_frame(image, Some(&"x".repeat(64)), None, &Default::default())
                .unwrap()
                .changed
        );
    }
    #[test]
    fn invalid_geometry_and_cancelled_work_fail_before_gdi() {
        assert!(validate_rect(-1000, 0, 500, 300, None).is_ok());
        for (x, y, width, height) in [
            (0, 0, 0, 1),
            (0, 0, 1, -1),
            (i32::MAX, 0, 100, 100),
            (0, 0, 20000, 20000),
        ] {
            assert!(
                capture_screen_rect(x, y, width, height, None, None, &Default::default()).is_err()
            );
        }
        assert!(validate_rect(0, 0, 100, 100, Some(65)).is_err());
        let cancel = CancellationToken::new();
        cancel.cancel();
        assert!(capture_screen_rect(0, 0, 100, 100, None, None, &cancel)
            .unwrap_err()
            .contains("关闭"));
    }
}
