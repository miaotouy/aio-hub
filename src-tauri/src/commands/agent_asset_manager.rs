//! Agent 资产管理模块
//!
//! 该模块提供 Agent 专属资产的文件操作功能，包括：
//! - 保存资产文件到 Agent 专属目录
//! - 删除 Agent 资产
//! - 列出 Agent 的所有资产
//!
//! 资产存储路径：`appdata://llm-chat/agents/{agent_id}/assets/{filename}`

use crate::utils::mime;
use image::ImageFormat;
use lofty::file::TaggedFileExt;
use lofty::probe::Probe;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use uuid::Uuid;

/// 资产信息结构
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAssetInfo {
    /// 文件名（存储时的实际文件名）
    pub filename: String,
    /// 相对路径（相对于 Agent 目录）
    pub path: String,
    /// 文件大小（字节）
    pub size: u64,
    /// MIME 类型
    pub mime_type: String,
    /// 缩略图相对路径（如果有）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_path: Option<String>,
}

/// 获取 Agent 资产目录的基础路径
///
/// 返回 `{app_data_dir}/llm-chat/agents/{agent_id}/assets` 路径
fn get_agent_assets_dir(app: &AppHandle, agent_id: &str) -> Result<PathBuf, String> {
    // 验证 agent_id，防止路径遍历攻击
    if agent_id.contains("..") || agent_id.contains('/') || agent_id.contains('\\') {
        return Err("无效的 Agent ID：包含非法字符".to_string());
    }

    let app_data_dir = crate::get_app_data_dir(app.config());

    Ok(app_data_dir
        .join("llm-chat")
        .join("agents")
        .join(agent_id)
        .join("assets"))
}

/// 清理 ID 字符串，移除不安全的字符
///
/// 只保留字母、数字、下划线、连字符和点号
fn sanitize_id(id: &str) -> String {
    id.chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-' || *c == '.')
        .collect()
}

/// 从文件名提取不带扩展名的基础名称
fn extract_base_name(file_name: &str) -> String {
    // 找到最后一个点的位置
    if let Some(dot_pos) = file_name.rfind('.') {
        if dot_pos > 0 {
            return file_name[..dot_pos].to_string();
        }
    }
    file_name.to_string()
}

/// 生成唯一的文件名
///
/// 如果目标文件已存在，会在文件名后添加数字后缀
fn generate_unique_filename(assets_dir: &Path, base_name: &str, extension: &str) -> String {
    let initial_filename = format!("{}.{}", base_name, extension);
    let initial_path = assets_dir.join(&initial_filename);

    if !initial_path.exists() {
        return initial_filename;
    }

    // 文件已存在，添加数字后缀
    let mut counter = 1;
    loop {
        let new_filename = format!("{}-{}.{}", base_name, counter, extension);
        let new_path = assets_dir.join(&new_filename);
        if !new_path.exists() {
            return new_filename;
        }
        counter += 1;
        // 防止无限循环
        if counter > 1000 {
            // 回退到 UUID
            return format!("{}-{}.{}", base_name, Uuid::new_v4(), extension);
        }
    }
}

/// 生成音频封面缩略图
///
/// 从音频文件的元数据中提取封面图片并生成缩略图
fn generate_audio_thumbnail(
    source_path: &Path,
    assets_dir: &Path,
    base_name: &str,
) -> Result<Option<String>, String> {
    // 使用 Probe 读取文件
    let tagged_file = match Probe::open(source_path) {
        Ok(probe) => match probe.read() {
            Ok(tf) => tf,
            Err(_) => return Ok(None),
        },
        Err(_) => return Ok(None),
    };

    // 尝试获取标签
    let tag = match tagged_file.primary_tag() {
        Some(tag) => tag,
        None => match tagged_file.first_tag() {
            Some(tag) => tag,
            None => return Ok(None),
        },
    };

    // 获取图片列表
    let pictures = tag.pictures();
    if pictures.is_empty() {
        return Ok(None);
    }

    // 取第一张图片
    let picture = &pictures[0];
    let data = picture.data();

    // 加载图片数据
    let img = match image::load_from_memory(data) {
        Ok(img) => img,
        Err(_) => return Ok(None),
    };

    // 如果图片已经很小了，没必要生成缩略图
    if img.width() <= 400 && img.height() <= 400 {
        return Ok(None);
    }

    // 生成缩略图
    // 使用 resize_to_fill 确保音频封面也是规整的正方形且不模糊
    let thumbnail = img.resize_to_fill(400, 400, image::imageops::FilterType::Lanczos3);

    // 确保缩略图目录存在
    let thumbnails_dir = assets_dir.join(".thumbnails");
    fs::create_dir_all(&thumbnails_dir).map_err(|e| format!("创建缩略图目录失败: {}", e))?;

    let thumbnail_filename = format!("{}.jpg", base_name);
    let thumbnail_path = thumbnails_dir.join(&thumbnail_filename);

    // 保存缩略图
    thumbnail
        .to_rgb8()
        .save_with_format(&thumbnail_path, ImageFormat::Jpeg)
        .map_err(|e| format!("保存音频封面失败: {}", e))?;

    Ok(Some(format!("assets/.thumbnails/{}", thumbnail_filename)))
}

/// 生成图片缩略图
fn generate_image_thumbnail(
    source_path: &Path,
    assets_dir: &Path,
    base_name: &str,
) -> Result<Option<String>, String> {
    // 加载图片
    let img = match image::open(source_path) {
        Ok(img) => img,
        Err(_) => return Ok(None),
    };

    // 如果图片已经很小了，没必要生成缩略图
    if img.width() <= 400 && img.height() <= 400 {
        return Ok(None);
    }

    // 生成缩略图
    // 使用 resize_to_fill 替代 thumbnail
    // 它会自动按比例缩放并从中间裁剪，确保输出正好是 400x400
    let thumbnail = img.resize_to_fill(400, 400, image::imageops::FilterType::Lanczos3);

    // 确保缩略图目录存在
    let thumbnails_dir = assets_dir.join(".thumbnails");
    fs::create_dir_all(&thumbnails_dir).map_err(|e| format!("创建缩略图目录失败: {}", e))?;

    let thumbnail_filename = format!("{}.jpg", base_name);
    let thumbnail_path = thumbnails_dir.join(&thumbnail_filename);

    // 保存缩略图
    thumbnail
        .to_rgb8()
        .save_with_format(&thumbnail_path, ImageFormat::Jpeg)
        .map_err(|e| format!("保存缩略图失败: {}", e))?;

    Ok(Some(format!("assets/.thumbnails/{}", thumbnail_filename)))
}

/// 保存 Agent 资产文件
///
/// 将前端上传的二进制数据保存到指定 Agent 的 assets 目录。
///
/// # 参数
/// - `app`: Tauri 应用句柄
/// - `agent_id`: Agent 的唯一标识符
/// - `file_name`: 原始文件名（用于提取扩展名和默认 ID）
/// - `data`: 文件的二进制数据
/// - `custom_id`: 可选的自定义 ID，如果不提供则使用原始文件名（去扩展名）
///
/// # 返回
/// 返回保存后的资产信息
#[tauri::command]
pub async fn save_agent_asset(
    app: AppHandle,
    agent_id: String,
    file_name: String,
    data: Vec<u8>,
    custom_id: Option<String>,
) -> Result<AgentAssetInfo, String> {
    // 获取 Agent 资产目录
    let assets_dir = get_agent_assets_dir(&app, &agent_id)?;

    // 确保目录存在
    fs::create_dir_all(&assets_dir).map_err(|e| format!("创建资产目录失败: {}", e))?;

    // 提取原始扩展名
    let extension = file_name
        .rsplit('.')
        .next()
        .filter(|ext| !ext.is_empty() && ext.len() <= 10)
        .unwrap_or("bin");

    // 确定基础文件名
    let base_name = if let Some(id) = custom_id {
        let sanitized = sanitize_id(&id);
        if sanitized.is_empty() {
            // 如果清理后为空，使用原始文件名
            sanitize_id(&extract_base_name(&file_name))
        } else {
            sanitized
        }
    } else {
        // 使用原始文件名（去扩展名）
        sanitize_id(&extract_base_name(&file_name))
    };

    // 如果基础名称仍为空，使用 UUID
    let base_name = if base_name.is_empty() {
        Uuid::new_v4().to_string()
    } else {
        base_name
    };

    // 生成唯一文件名（处理重名）
    let new_filename = generate_unique_filename(&assets_dir, &base_name, extension);
    let target_path = assets_dir.join(&new_filename);

    // 写入文件
    fs::write(&target_path, &data).map_err(|e| format!("写入文件失败: {}", e))?;

    // 构建相对路径
    let relative_path = format!("assets/{}", new_filename);

    // 推断 MIME 类型
    let mime_type = mime::guess_mime_type(&target_path);

    // 生成缩略图（针对图片和音频）
    let actual_base_name = new_filename
        .rsplit('.')
        .skip(1)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join(".");
    let actual_base_name = if actual_base_name.is_empty() {
        new_filename.clone()
    } else {
        actual_base_name
    };

    let thumbnail_path = if mime_type.starts_with("image/") {
        generate_image_thumbnail(&target_path, &assets_dir, &actual_base_name)?
    } else if mime_type.starts_with("audio/") {
        generate_audio_thumbnail(&target_path, &assets_dir, &actual_base_name)?
    } else {
        None
    };

    Ok(AgentAssetInfo {
        filename: new_filename,
        path: relative_path,
        size: data.len() as u64,
        mime_type,
        thumbnail_path,
    })
}

/// 删除 Agent 资产文件
///
/// 删除指定 Agent 的资产文件。
///
/// # 参数
/// - `app`: Tauri 应用句柄
/// - `agent_id`: Agent 的唯一标识符
/// - `asset_path`: 资产的相对路径（相对于 Agent 目录，如 `assets/xxx.png`）
#[tauri::command]
pub async fn delete_agent_asset(
    app: AppHandle,
    agent_id: String,
    asset_path: String,
) -> Result<(), String> {
    // 验证 asset_path，防止路径遍历攻击
    if asset_path.contains("..") {
        return Err("无效的资产路径：包含非法字符".to_string());
    }

    let app_data_dir = crate::get_app_data_dir(app.config());

    // 验证 agent_id
    if agent_id.contains("..") || agent_id.contains('/') || agent_id.contains('\\') {
        return Err("无效的 Agent ID：包含非法字符".to_string());
    }

    let agent_dir = app_data_dir.join("llm-chat").join("agents").join(&agent_id);

    let assets_dir = agent_dir.join("assets");
    let file_path = agent_dir.join(&asset_path);

    // 安全检查：确保路径在 assets 目录下且不包含 ..
    if !file_path.starts_with(&assets_dir) {
        return Err("无效的资产路径：必须在 assets 目录下且不能越权访问".to_string());
    }

    // 确保文件存在
    if !file_path.exists() {
        return Err(format!("文件不存在: {}", asset_path));
    }

    // 尝试获取缩略图路径并一并删除
    // 缩略图路径规则：assets/.thumbnails/{base_name}.jpg
    if let Some(filename) = file_path.file_name() {
        let filename_str = filename.to_string_lossy();
        let base_name = extract_base_name(&filename_str);
        let thumbnail_path = assets_dir
            .join(".thumbnails")
            .join(format!("{}.jpg", base_name));
        if thumbnail_path.exists() {
            let _ = trash::delete(&thumbnail_path);
        }
    }

    // 删除文件（移动到回收站）
    trash::delete(&file_path).map_err(|e| format!("删除文件失败: {}", e))?;

    Ok(())
}

/// 批量删除 Agent 资产文件
///
/// # 参数
/// - `app`: Tauri 应用句柄
/// - `agent_id`: Agent 的唯一标识符
/// - `asset_paths`: 资产的相对路径列表
#[tauri::command]
pub async fn batch_delete_agent_assets(
    app: AppHandle,
    agent_id: String,
    asset_paths: Vec<String>,
) -> Result<(), String> {
    // 验证 agent_id
    if agent_id.contains("..") || agent_id.contains('/') || agent_id.contains('\\') {
        return Err("无效的 Agent ID：包含不允许的字符".to_string());
    }

    let app_data_dir = crate::get_app_data_dir(app.config());
    let agent_dir = app_data_dir.join("llm-chat").join("agents").join(&agent_id);
    let assets_dir = agent_dir.join("assets");

    let mut errors = Vec::new();

    for asset_path in asset_paths {
        // 验证 asset_path
        if asset_path.contains("..") {
            errors.push(format!("{}: 无效路径", asset_path));
            continue;
        }

        let file_path = agent_dir.join(&asset_path);

        // 安全检查
        if !file_path.starts_with(&assets_dir) {
            errors.push(format!("{}: 越权访问", asset_path));
            continue;
        }

        if !file_path.exists() {
            continue; // 文件不存在则跳过，不报错
        }

        // 删除缩略图
        if let Some(filename) = file_path.file_name() {
            let filename_str = filename.to_string_lossy();
            let base_name = extract_base_name(&filename_str);
            let thumbnail_path = assets_dir
                .join(".thumbnails")
                .join(format!("{}.jpg", base_name));
            if thumbnail_path.exists() {
                let _ = trash::delete(&thumbnail_path);
            }
        }

        // 删除原文件
        if let Err(e) = trash::delete(&file_path) {
            errors.push(format!("{}: {}", asset_path, e));
        }
    }

    if !errors.is_empty() {
        return Err(format!("部分文件删除失败: {}", errors.join("; ")));
    }

    Ok(())
}

/// 列出 Agent 的所有资产
///
/// 返回指定 Agent 资产目录下的所有文件信息。
///
/// # 参数
/// - `app`: Tauri 应用句柄
/// - `agent_id`: Agent 的唯一标识符
///
/// # 返回
/// 返回资产文件信息列表
#[tauri::command]
pub async fn list_agent_assets(
    app: AppHandle,
    agent_id: String,
) -> Result<Vec<AgentAssetInfo>, String> {
    let assets_dir = get_agent_assets_dir(&app, &agent_id)?;

    // 如果目录不存在，返回空列表
    if !assets_dir.exists() {
        return Ok(vec![]);
    }

    let mut assets = Vec::new();

    let entries = fs::read_dir(&assets_dir).map_err(|e| format!("读取资产目录失败: {}", e))?;

    // 检查缩略图目录
    let thumbnails_dir = assets_dir.join(".thumbnails");

    for entry in entries.flatten() {
        let path = entry.path();

        // 跳过目录
        if !path.is_file() {
            continue;
        }

        if let Some(filename) = path.file_name() {
            let filename_str = filename.to_string_lossy().to_string();

            // 跳过隐藏文件
            if filename_str.starts_with('.') {
                continue;
            }

            let metadata = path.metadata().ok();
            let size = metadata.map(|m| m.len()).unwrap_or(0);
            let mime_type = mime::guess_mime_type(&path);

            // 检查是否有对应的缩略图
            let base_name = extract_base_name(&filename_str);
            let thumbnail_filename = format!("{}.jpg", base_name);
            let thumbnail_path = thumbnails_dir.join(&thumbnail_filename);
            let thumbnail_relative = if thumbnail_path.exists() {
                Some(format!("assets/.thumbnails/{}", thumbnail_filename))
            } else {
                None
            };

            assets.push(AgentAssetInfo {
                filename: filename_str.clone(),
                path: format!("assets/{}", filename_str),
                size,
                mime_type,
                thumbnail_path: thumbnail_relative,
            });
        }
    }

    Ok(assets)
}

/// 删除 Agent 的所有资产
///
/// 当删除 Agent 时，清理其所有关联的资产文件。
///
/// # 参数
/// - `app`: Tauri 应用句柄
/// - `agent_id`: Agent 的唯一标识符
#[tauri::command]
pub async fn delete_all_agent_assets(app: AppHandle, agent_id: String) -> Result<(), String> {
    let assets_dir = get_agent_assets_dir(&app, &agent_id)?;

    // 如果目录不存在，直接返回成功
    if !assets_dir.exists() {
        return Ok(());
    }

    // 删除整个 assets 目录
    trash::delete(&assets_dir).map_err(|e| format!("删除资产目录失败: {}", e))?;

    Ok(())
}

/// 获取 Agent 资产的完整路径
///
/// 返回资产文件在系统中的完整路径，用于前端通过 convertFileSrc 转换。
///
/// # 参数
/// - `app`: Tauri 应用句柄
/// - `agent_id`: Agent 的唯一标识符
/// - `asset_path`: 资产的相对路径（相对于 Agent 目录，如 `assets/xxx.png`）
///
/// # 返回
/// 返回文件的完整系统路径
#[tauri::command]
pub async fn get_agent_asset_path(
    app: AppHandle,
    agent_id: String,
    asset_path: String,
) -> Result<String, String> {
    // 验证参数
    if asset_path.contains("..") {
        return Err("无效的资产路径：包含非法字符".to_string());
    }

    if agent_id.contains("..") || agent_id.contains('/') || agent_id.contains('\\') {
        return Err("无效的 Agent ID：包含非法字符".to_string());
    }

    let app_data_dir = crate::get_app_data_dir(app.config());

    let file_path = app_data_dir
        .join("llm-chat")
        .join("agents")
        .join(&agent_id)
        .join(&asset_path);

    // 确保文件存在
    if !file_path.exists() {
        return Err(format!("文件不存在: {}", asset_path));
    }

    Ok(file_path.to_string_lossy().to_string())
}

/// 读取 Agent 资产的二进制内容
///
/// # 参数
/// - `app`: Tauri 应用句柄
/// - `agent_id`: Agent 的唯一标识符
/// - `asset_path`: 资产的相对路径（相对于 Agent 目录，如 `assets/xxx.png`）
///
/// # 返回
/// 返回文件的二进制数据
#[tauri::command]
pub async fn read_agent_asset_binary(
    app: AppHandle,
    agent_id: String,
    asset_path: String,
) -> Result<Vec<u8>, String> {
    // 验证参数
    if asset_path.contains("..") {
        return Err("无效的资产路径：包含非法字符".to_string());
    }

    if agent_id.contains("..") || agent_id.contains('/') || agent_id.contains('\\') {
        return Err("无效的 Agent ID：包含非法字符".to_string());
    }

    let app_data_dir = crate::get_app_data_dir(app.config());

    let file_path = app_data_dir
        .join("llm-chat")
        .join("agents")
        .join(&agent_id)
        .join(&asset_path);

    // 确保文件存在
    if !file_path.exists() {
        return Err(format!("文件不存在: {}", asset_path));
    }

    // 读取文件内容
    fs::read(&file_path).map_err(|e| format!("读取文件失败: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_guess_mime_type() {
        assert_eq!(mime::guess_mime_type_from_filename("test.png"), "image/png");
        assert_eq!(
            mime::guess_mime_type_from_filename("test.jpg"),
            "image/jpeg"
        );
        assert_eq!(
            mime::guess_mime_type_from_filename("test.mp3"),
            "audio/mpeg"
        );
        assert_eq!(mime::guess_mime_type_from_filename("test.mp4"), "video/mp4");
        assert_eq!(
            mime::guess_mime_type_from_filename("test.unknown"),
            "application/octet-stream"
        );
    }
}
