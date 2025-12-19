//! Agent 资产管理模块
//!
//! 该模块提供 Agent 专属资产的文件操作功能，包括：
//! - 保存资产文件到 Agent 专属目录
//! - 删除 Agent 资产
//! - 列出 Agent 的所有资产
//!
//! 资产存储路径：`appdata://llm-chat/agents/{agent_id}/assets/{filename}`

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

/// 资产信息结构
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAssetInfo {
    /// 文件名
    pub filename: String,
    /// 相对路径（相对于 Agent 目录）
    pub path: String,
    /// 文件大小（字节）
    pub size: u64,
    /// MIME 类型
    pub mime_type: String,
}

/// 获取 Agent 资产目录的基础路径
///
/// 返回 `{app_data_dir}/llm-chat/agents/{agent_id}/assets` 路径
fn get_agent_assets_dir(app: &AppHandle, agent_id: &str) -> Result<PathBuf, String> {
    // 验证 agent_id，防止路径遍历攻击
    if agent_id.contains("..") || agent_id.contains('/') || agent_id.contains('\\') {
        return Err("无效的 Agent ID：包含非法字符".to_string());
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {}", e))?;

    Ok(app_data_dir
        .join("llm-chat")
        .join("agents")
        .join(agent_id)
        .join("assets"))
}

/// 根据文件扩展名推断 MIME 类型
fn guess_mime_type_from_extension(filename: &str) -> String {
    let extension = filename
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_lowercase();

    match extension.as_str() {
        // 图片
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "avif" => "image/avif",
        // 音频
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "flac" => "audio/flac",
        "aac" => "audio/aac",
        "m4a" => "audio/mp4",
        "weba" => "audio/webm",
        // 视频
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "avi" => "video/x-msvideo",
        "mov" => "video/quicktime",
        "mkv" => "video/x-matroska",
        "flv" => "video/x-flv",
        // 默认
        _ => "application/octet-stream",
    }
    .to_string()
}

/// 保存 Agent 资产文件
///
/// 将前端上传的二进制数据保存到指定 Agent 的 assets 目录。
///
/// # 参数
/// - `app`: Tauri 应用句柄
/// - `agent_id`: Agent 的唯一标识符
/// - `file_name`: 原始文件名（用于提取扩展名）
/// - `data`: 文件的二进制数据
///
/// # 返回
/// 返回保存后的相对路径（相对于 Agent 目录），格式为 `assets/{uuid}.{ext}`
#[tauri::command]
pub async fn save_agent_asset(
    app: AppHandle,
    agent_id: String,
    file_name: String,
    data: Vec<u8>,
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

    // 生成唯一文件名
    let uuid = Uuid::new_v4().to_string();
    let new_filename = format!("{}.{}", uuid, extension);
    let target_path = assets_dir.join(&new_filename);

    // 写入文件
    fs::write(&target_path, &data).map_err(|e| format!("写入文件失败: {}", e))?;

    // 构建相对路径
    let relative_path = format!("assets/{}", new_filename);

    // 推断 MIME 类型
    let mime_type = guess_mime_type_from_extension(&file_name);

    Ok(AgentAssetInfo {
        filename: new_filename,
        path: relative_path,
        size: data.len() as u64,
        mime_type,
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

    // 确保路径以 assets/ 开头
    if !asset_path.starts_with("assets/") {
        return Err("无效的资产路径：必须在 assets 目录下".to_string());
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {}", e))?;

    // 验证 agent_id
    if agent_id.contains("..") || agent_id.contains('/') || agent_id.contains('\\') {
        return Err("无效的 Agent ID：包含非法字符".to_string());
    }

    let file_path = app_data_dir
        .join("llm-chat")
        .join("agents")
        .join(&agent_id)
        .join(&asset_path);

    // 确保文件存在
    if !file_path.exists() {
        return Err(format!("文件不存在: {}", asset_path));
    }

    // 确保路径在预期目录内（二次验证）
    let canonical_path = file_path
        .canonicalize()
        .map_err(|e| format!("无法解析文件路径: {}", e))?;
    let expected_base = app_data_dir
        .join("llm-chat")
        .join("agents")
        .join(&agent_id)
        .join("assets");

    if !canonical_path.starts_with(&expected_base) {
        return Err("安全检查失败：路径超出允许范围".to_string());
    }

    // 删除文件（移动到回收站）
    trash::delete(&file_path).map_err(|e| format!("删除文件失败: {}", e))?;

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
            let mime_type = guess_mime_type_from_extension(&filename_str);

            assets.push(AgentAssetInfo {
                filename: filename_str.clone(),
                path: format!("assets/{}", filename_str),
                size,
                mime_type,
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

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {}", e))?;

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_guess_mime_type() {
        assert_eq!(guess_mime_type_from_extension("test.png"), "image/png");
        assert_eq!(guess_mime_type_from_extension("test.jpg"), "image/jpeg");
        assert_eq!(guess_mime_type_from_extension("test.mp3"), "audio/mpeg");
        assert_eq!(guess_mime_type_from_extension("test.mp4"), "video/mp4");
        assert_eq!(
            guess_mime_type_from_extension("test.unknown"),
            "application/octet-stream"
        );
    }
}