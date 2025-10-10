use serde::{Deserialize, Serialize};
use base64::{engine::general_purpose, Engine as _};

#[derive(Debug, Serialize, Deserialize)]
pub struct OcrResult {
    pub text: String,
    pub confidence: f64,
}

/// 原生 OCR 识别命令
#[tauri::command]
pub async fn native_ocr(image_data: String) -> Result<OcrResult, String> {
    // 解析 base64 图片数据
    let base64_data = image_data
        .strip_prefix("data:image/png;base64,")
        .or_else(|| image_data.strip_prefix("data:image/jpeg;base64,"))
        .or_else(|| image_data.strip_prefix("data:image/jpg;base64,"))
        .unwrap_or(&image_data);
    
    let image_bytes = general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| format!("Base64解码失败: {}", e))?;

    // 根据操作系统选择不同的 OCR 实现
    #[cfg(target_os = "windows")]
    {
        windows_ocr(&image_bytes).await
    }
    
    #[cfg(target_os = "macos")]
    {
        macos_ocr(&image_bytes).await
    }
    
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        Err("当前操作系统不支持原生OCR".to_string())
    }
}

/// Windows OCR 实现
#[cfg(target_os = "windows")]
async fn windows_ocr(image_bytes: &[u8]) -> Result<OcrResult, String> {
    use windows::{
        Graphics::Imaging::{BitmapDecoder, SoftwareBitmap},
        Media::Ocr::OcrEngine,
        Storage::Streams::{DataWriter, InMemoryRandomAccessStream},
    };

    // 创建内存流
    let stream = InMemoryRandomAccessStream::new()
        .map_err(|e| format!("创建内存流失败: {}", e))?;
    
    let writer = DataWriter::CreateDataWriter(&stream)
        .map_err(|e| format!("创建数据写入器失败: {}", e))?;
    
    writer.WriteBytes(image_bytes)
        .map_err(|e| format!("写入图片数据失败: {}", e))?;
    
    writer.StoreAsync()
        .map_err(|e| format!("存储数据失败: {}", e))?
        .get()
        .map_err(|e| format!("等待存储完成失败: {}", e))?;
    
    writer.FlushAsync()
        .map_err(|e| format!("刷新数据失败: {}", e))?
        .get()
        .map_err(|e| format!("等待刷新完成失败: {}", e))?;
    
    // 解码图片
    stream.Seek(0)
        .map_err(|e| format!("重置流位置失败: {}", e))?;
    
    let decoder = BitmapDecoder::CreateAsync(&stream)
        .map_err(|e| format!("创建图片解码器失败: {}", e))?
        .get()
        .map_err(|e| format!("等待解码器创建失败: {}", e))?;
    
    let bitmap = decoder.GetSoftwareBitmapAsync()
        .map_err(|e| format!("获取软件位图失败: {}", e))?
        .get()
        .map_err(|e| format!("等待位图获取失败: {}", e))?;
    
    // 转换为支持的格式
    let converted_bitmap = SoftwareBitmap::Convert(
        &bitmap,
        windows::Graphics::Imaging::BitmapPixelFormat::Rgba8,
    )
    .map_err(|e| format!("转换位图格式失败: {}", e))?;
    
    // 使用简体中文 OCR 引擎
    let language = windows::Globalization::Language::CreateLanguage(
        &windows::core::HSTRING::from("zh-Hans")
    ).map_err(|e| format!("创建语言对象失败: {}", e))?;
    
    let engine = OcrEngine::TryCreateFromLanguage(&language)
        .map_err(|e| format!("创建OCR引擎失败: {}", e))?;
    
    // 执行 OCR 识别
    let result = engine.RecognizeAsync(&converted_bitmap)
        .map_err(|e| format!("OCR识别失败: {}", e))?
        .get()
        .map_err(|e| format!("等待OCR结果失败: {}", e))?;
    
    let text = result.Text()
        .map_err(|e| format!("获取识别文本失败: {}", e))?
        .to_string();
    
    // Windows OCR API 不直接提供置信度，这里返回固定值
    Ok(OcrResult {
        text,
        confidence: 0.95,
    })
}

/// macOS OCR 实现（占位）
#[cfg(target_os = "macos")]
async fn macos_ocr(_image_bytes: &[u8]) -> Result<OcrResult, String> {
    // TODO: 实现 macOS Vision Framework OCR
    Err("macOS OCR 暂未实现".to_string())
}