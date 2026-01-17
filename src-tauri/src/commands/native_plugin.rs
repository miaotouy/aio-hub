//! 原生插件执行模块
//!
//! 负责加载和管理原生动态库，通过 C ABI 调用插件函数

use libloading::{Library, Symbol};
use serde::Deserialize;
use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc, Mutex,
};
use tauri::{AppHandle, State};

/// 原生插件调用函数类型
type CallFunction = unsafe extern "C" fn(*const c_char, *const c_char) -> *mut c_char;

/// 原生插件释放字符串函数类型
type FreeStringFunction = unsafe extern "C" fn(*mut c_char);

/// 插件元数据
#[derive(Clone)]
struct PluginMetadata {
    library: Arc<Library>,
    reloadable: bool,
    ref_count: Arc<AtomicUsize>,
}

/// 全局原生插件状态
pub struct NativePluginState {
    /// 已加载的插件库
    plugins: Arc<Mutex<HashMap<String, PluginMetadata>>>,
}

impl Default for NativePluginState {
    fn default() -> Self {
        Self {
            plugins: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

/// 原生插件调用请求
#[derive(Debug, Deserialize)]
pub struct NativePluginCallRequest {
    /// 插件 ID
    pub plugin_id: String,
    /// 方法名
    pub method_name: String,
    /// 参数载荷（JSON 字符串）
    pub payload: String,
}

/// 加载原生插件
///
/// 将动态库加载到内存中，并与插件 ID 关联
#[tauri::command]
pub async fn load_native_plugin(
    _app: AppHandle,
    plugin_id: String,
    library_path: String,
    reloadable: bool,
    state: State<'_, NativePluginState>,
) -> Result<(), String> {
    log::info!(
        "[NATIVE] 开始加载插件: {}, 库路径: {}",
        plugin_id,
        library_path
    );

    // 检查插件是否已加载
    {
        let mut plugins = state
            .plugins
            .lock()
            .map_err(|e| format!("获取插件锁失败: {}", e))?;
        if plugins.contains_key(&plugin_id) {
            log::info!("[NATIVE] 插件 {} 已加载，先卸载", plugin_id);
            // 如果已加载，先卸载
            plugins.remove(&plugin_id);
        }
    }

    // 在开发模式下，library_path 是相对于项目根目录的
    // 我们需要获取项目根目录来构建绝对路径
    #[cfg(debug_assertions)]
    let absolute_path = {
        // 参照 sidecar_plugin.rs 的实现
        // Tauri 开发模式下 current_dir 是 src-tauri，需要获取父目录（项目根目录）
        let current_dir =
            std::env::current_dir().map_err(|e| format!("获取当前目录失败: {}", e))?;
        let workspace_dir = current_dir
            .parent()
            .ok_or_else(|| "无法获取项目根目录".to_string())?;

        let full_path = workspace_dir.join(&library_path);
        log::debug!("[NATIVE] 开发模式，项目根目录: {:?}", workspace_dir);
        log::debug!("[NATIVE] 拼接后的路径: {:?}", full_path);

        // 验证文件是否存在
        if !full_path.exists() {
            return Err(format!("插件文件不存在: {:?}", full_path));
        }

        full_path
    };

    // 在生产模式下，library_path 应该是绝对路径
    #[cfg(not(debug_assertions))]
    let absolute_path = {
        use std::path::Path;
        let path = Path::new(&library_path);
        if !path.exists() {
            return Err(format!("插件文件不存在: {:?}", path));
        }
        path.to_path_buf()
    };

    log::info!("[NATIVE] 最终加载路径: {:?}", absolute_path);

    // 加载动态库
    let library = Arc::new(
        unsafe { Library::new(&absolute_path) }.map_err(|e| format!("加载动态库失败: {}", e))?,
    );

    // 存储插件库
    {
        let mut plugins = state
            .plugins
            .lock()
            .map_err(|e| format!("获取插件锁失败: {}", e))?;
        let metadata = PluginMetadata {
            library,
            reloadable,
            ref_count: Arc::new(AtomicUsize::new(0)),
        };
        plugins.insert(plugin_id.clone(), metadata);
    }

    log::info!("[NATIVE] 插件 {} 加载成功", plugin_id);
    Ok(())
}

/// 卸载原生插件
///
/// 从内存中卸载动态库
#[tauri::command]
pub async fn unload_native_plugin(
    plugin_id: String,
    state: State<'_, NativePluginState>,
) -> Result<(), String> {
    log::info!("[NATIVE] 请求卸载插件: {}", plugin_id);

    let plugin_to_unload = {
        let mut plugins = state
            .plugins
            .lock()
            .map_err(|e| format!("获取插件锁失败: {}", e))?;
        if let Some(metadata) = plugins.get(&plugin_id) {
            if !metadata.reloadable {
                return Err(format!("插件 {} 不支持运行时卸载，请重启应用", plugin_id));
            }
        }
        plugins.remove(&plugin_id)
    };

    if let Some(metadata) = plugin_to_unload {
        // 等待引用计数归零
        let timeout = std::time::Duration::from_secs(5);
        let start = std::time::Instant::now();
        while metadata.ref_count.load(Ordering::SeqCst) > 0 {
            if start.elapsed() > timeout {
                // 如果超时，需要将插件重新插回，因为它仍在被使用
                let mut plugins = state
                    .plugins
                    .lock()
                    .map_err(|e| format!("获取插件锁失败: {}", e))?;
                plugins.insert(plugin_id.clone(), metadata);
                return Err(format!("卸载超时: 插件 {} 仍在使用中", plugin_id));
            }
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }

        // 引用计数为 0，可以安全 drop (卸载)
        drop(metadata);
        log::info!("[NATIVE] 插件 {} 已安全卸载", plugin_id);
        Ok(())
    } else {
        Err(format!("插件 {} 未找到或已卸载", plugin_id))
    }
}

/// 调用原生插件方法
///
/// 调用已加载插件中的函数
#[tauri::command]
pub async fn call_native_plugin_method(
    request: NativePluginCallRequest,
    state: State<'_, NativePluginState>,
) -> Result<String, String> {
    log::info!(
        "[NATIVE] 调用插件方法: {}.{}",
        request.plugin_id,
        request.method_name
    );

    // 获取插件并增加引用计数
    let metadata = {
        let plugins = state
            .plugins
            .lock()
            .map_err(|e| format!("获取插件锁失败: {}", e))?;
        plugins
            .get(&request.plugin_id)
            .cloned()
            .ok_or_else(|| format!("插件 {} 未加载", request.plugin_id))?
    };

    metadata.ref_count.fetch_add(1, Ordering::SeqCst);

    // 使用 scopeguard 确保引用计数总是能被减少
    let _guard = scopeguard::guard((), |_| {
        metadata.ref_count.fetch_sub(1, Ordering::SeqCst);
    });

    // 获取 call 函数
    let call: Symbol<CallFunction> = unsafe {
        metadata
            .library
            .get(b"call\0")
            .map_err(|e| format!("获取 call 函数失败: {}", e))?
    };

    // 获取 free_string 函数（可选）
    let free_string: Result<Symbol<FreeStringFunction>, _> =
        unsafe { metadata.library.get(b"free_string\0") };

    // 准备参数
    let method_name_cstr =
        CString::new(request.method_name.as_str()).map_err(|e| format!("方法名转换失败: {}", e))?;
    let payload_cstr =
        CString::new(request.payload.as_str()).map_err(|e| format!("载荷转换失败: {}", e))?;

    // 调用插件函数
    let result_ptr = unsafe { call(method_name_cstr.as_ptr(), payload_cstr.as_ptr()) };

    // 处理返回结果
    if result_ptr.is_null() {
        return Err("插件函数返回空指针".to_string());
    }

    // 转换返回结果
    let result_str = unsafe { CStr::from_ptr(result_ptr).to_str() }
        .map_err(|e| format!("返回结果转换失败: {}", e))?
        .to_string();

    // 释放返回的字符串内存
    if let Ok(free_func) = free_string {
        unsafe { free_func(result_ptr) };
        log::debug!("[NATIVE] 已使用插件提供的 free_string 函数释放内存");
    } else {
        log::warn!("[NATIVE] 警告：插件未提供 free_string 函数，可能存在内存泄漏");
    }

    log::info!("[NATIVE] 插件方法调用成功");
    Ok(result_str)
}
