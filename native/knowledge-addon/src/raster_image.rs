// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

use image::{DynamicImage, GenericImageView, ImageDecoder, ImageFormat, ImageReader};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde::Deserialize;
use std::io::Cursor;
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;

const MAX_INPUT: usize = 64 * 1024 * 1024;
const MAX_PIXELS: u64 = 32 * 1024 * 1024;
fn error(value: impl std::fmt::Display) -> Error {
    Error::from_reason(value.to_string())
}
fn check(cancel: &CancellationToken) -> Result<()> {
    if cancel.is_cancelled() {
        return Err(error("图片操作已取消"));
    }
    Ok(())
}
#[napi(object)]
pub struct RasterDimensions {
    pub width: u32,
    pub height: u32,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EncodeOptions {
    start_y: Option<u32>,
    end_y: Option<u32>,
    width: Option<u32>,
    height: Option<u32>,
    format: Option<String>,
    quality: Option<f32>,
}

/** One decoded bitmap per operation group. All codecs and pixel loops run off the JS thread. */
#[napi]
pub struct RasterImageRuntime {
    image: Arc<Mutex<Option<DynamicImage>>>,
    cancel: CancellationToken,
}
#[napi]
impl RasterImageRuntime {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            image: Arc::new(Mutex::new(None)),
            cancel: CancellationToken::new(),
        }
    }
    #[napi]
    pub fn close(&self) {
        self.cancel.cancel();
        if let Ok(mut image) = self.image.try_lock() {
            *image = None;
        }
    }
    #[napi]
    pub async fn load(&self, input: Buffer) -> Result<RasterDimensions> {
        if input.len() > MAX_INPUT {
            return Err(error("图片超过 64 MiB，请缩小图片后重试"));
        }
        let state = self.image.clone();
        let cancel = self.cancel.clone();
        // Copy before moving into spawn_blocking so the JS-owned buffer need not outlive native work.
        let bytes = input.to_vec();
        tokio::task::spawn_blocking(move || {
            check(&cancel)?;
            let mut reader = ImageReader::new(Cursor::new(bytes))
                .with_guessed_format()
                .map_err(error)?;
            let mut limits = image::Limits::default();
            limits.max_image_width = Some(50000);
            limits.max_image_height = Some(50000);
            limits.max_alloc = Some(MAX_PIXELS * 8);
            reader.limits(limits);
            let mut decoder = reader.into_decoder().map_err(error)?;
            let (width, height) = decoder.dimensions();
            if width == 0 || height == 0 || u64::from(width) * u64::from(height) > MAX_PIXELS {
                return Err(error("图片像素过多，请缩小图片后重试"));
            }
            let orientation = decoder.orientation().map_err(error)?;
            let mut bitmap = DynamicImage::from_decoder(decoder).map_err(error)?;
            check(&cancel)?;
            bitmap.apply_orientation(orientation);
            let result = RasterDimensions {
                width: bitmap.width(),
                height: bitmap.height(),
            };
            let mut image = state.lock().map_err(error)?;
            check(&cancel)?;
            *image = Some(DynamicImage::ImageRgba8(bitmap.into_rgba8()));
            Ok(result)
        })
        .await
        .map_err(error)?
    }
    #[napi]
    pub async fn row_variances(&self) -> Result<Vec<f64>> {
        let state = self.image.clone();
        let cancel = self.cancel.clone();
        tokio::task::spawn_blocking(move || {
            check(&cancel)?;
            let guard = state.lock().map_err(error)?;
            let bitmap = guard.as_ref().ok_or_else(|| error("图片已释放"))?;
            let rgba = bitmap.as_rgba8().ok_or_else(|| error("图片像素格式无效"))?;
            let width = rgba.width() as usize;
            let mut rows = Vec::with_capacity(rgba.height() as usize);
            for (y, row) in rgba.as_raw().chunks_exact(width * 4).enumerate() {
                if y % 64 == 0 {
                    check(&cancel)?;
                }
                // Match the shared browser planner's luminance variance, including alpha handling.
                let gray = |pixel: &[u8]| {
                    0.299 * f64::from(pixel[0])
                        + 0.587 * f64::from(pixel[1])
                        + 0.114 * f64::from(pixel[2])
                };
                let mean = row.chunks_exact(4).map(gray).sum::<f64>() / width as f64;
                rows.push(
                    row.chunks_exact(4)
                        .map(|p| (gray(p) - mean).powi(2))
                        .sum::<f64>()
                        / width as f64,
                );
            }
            check(&cancel)?;
            Ok(rows)
        })
        .await
        .map_err(error)?
    }
    #[napi]
    pub async fn encode(&self, configuration: String) -> Result<Buffer> {
        let options: EncodeOptions = serde_json::from_str(&configuration).map_err(error)?;
        let state = self.image.clone();
        let cancel = self.cancel.clone();
        tokio::task::spawn_blocking(move || {
            check(&cancel)?;
            let guard = state.lock().map_err(error)?;
            let original = guard.as_ref().ok_or_else(|| error("图片已释放"))?;
            let start = options.start_y.unwrap_or(0);
            let end = options.end_y.unwrap_or(original.height());
            if start >= end || end > original.height() {
                return Err(error("图片裁剪范围无效"));
            }
            let width = options.width.unwrap_or(original.width());
            let height = options.height.unwrap_or(end - start);
            if width == 0
                || height == 0
                || width > original.width()
                || height > end - start
                || u64::from(width) * u64::from(height) > MAX_PIXELS
            {
                return Err(error("图片输出尺寸无效"));
            }
            let mut bitmap = original.crop_imm(0, start, original.width(), end - start);
            // Canvas composites JPEG over white before resampling. Resizing unassociated RGBA first
            // produces dark fringes at the boundary between transparent and opaque pixels.
            if options.format.as_deref() == Some("jpeg") {
                let mut rgba = bitmap.into_rgba8();
                for pixel in rgba.pixels_mut() {
                    let alpha = u32::from(pixel[3]);
                    for i in 0..3 {
                        pixel[i] =
                            ((u32::from(pixel[i]) * alpha + 255 * (255 - alpha) + 127) / 255) as u8;
                    }
                    pixel[3] = 255;
                }
                bitmap = DynamicImage::ImageRgba8(rgba);
            }
            if bitmap.dimensions() != (width, height) {
                if options.format.as_deref() == Some("jpeg") {
                    bitmap =
                        bitmap.resize_exact(width, height, image::imageops::FilterType::Lanczos3);
                } else {
                    // Resample associated alpha like Canvas; straight RGBA interpolation darkens edges.
                    let mut rgba = bitmap.into_rgba8();
                    for pixel in rgba.pixels_mut() {
                        let alpha = u32::from(pixel[3]);
                        for i in 0..3 {
                            pixel[i] = ((u32::from(pixel[i]) * alpha + 127) / 255) as u8;
                        }
                    }
                    let mut resized = image::imageops::resize(
                        &rgba,
                        width,
                        height,
                        image::imageops::FilterType::Lanczos3,
                    );
                    for pixel in resized.pixels_mut() {
                        let alpha = u32::from(pixel[3]);
                        for i in 0..3 {
                            pixel[i] = if alpha == 0 {
                                0
                            } else {
                                ((u32::from(pixel[i]) * 255 + alpha / 2) / alpha).min(255) as u8
                            };
                        }
                    }
                    bitmap = DynamicImage::ImageRgba8(resized);
                }
            }
            check(&cancel)?;
            let quality = options.quality.unwrap_or(0.85);
            if !quality.is_finite() || !(0.1..=1.0).contains(&quality) {
                return Err(error("图片质量需在 0.1 到 1 之间"));
            }
            let mut encoded = Vec::new();
            match options.format.as_deref().unwrap_or("png") {
                "png" => bitmap
                    .write_to(&mut Cursor::new(&mut encoded), ImageFormat::Png)
                    .map_err(error)?,
                "jpeg" => {
                    let mut rgba = bitmap.into_rgba8();
                    for pixel in rgba.pixels_mut() {
                        let alpha = u32::from(pixel[3]);
                        for i in 0..3 {
                            pixel[i] = ((u32::from(pixel[i]) * alpha + 255 * (255 - alpha) + 127)
                                / 255) as u8;
                        }
                        pixel[3] = 255;
                    }
                    let rgb = DynamicImage::ImageRgba8(rgba).into_rgb8();
                    image::codecs::jpeg::JpegEncoder::new_with_quality(
                        &mut encoded,
                        (quality * 100.0).round() as u8,
                    )
                    .encode_image(&rgb)
                    .map_err(error)?;
                }
                "webp" => {
                    let rgba = bitmap.into_rgba8();
                    encoded = webp::Encoder::from_rgba(rgba.as_raw(), width, height)
                        .encode(quality * 100.0)
                        .to_vec();
                }
                _ => return Err(error("不支持的图片输出格式")),
            }
            check(&cancel)?;
            if encoded.len() > MAX_INPUT {
                return Err(error("图片输出超过 64 MiB"));
            }
            Ok(encoded.into())
        })
        .await
        .map_err(error)?
    }
}
