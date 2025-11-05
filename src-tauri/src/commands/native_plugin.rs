//! 原生插件执行模块
//!
//! 负责加载和管理原生动态库，通过 C ABI 调用插件函数

use libloading::{Library, Symbol};
use serde::Deserialize;
use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::sync::{Arc, Mutex};
use tauri::State;

/// 原生插件调用函数类型
type CallFunction = unsafe extern "C" fn(*const c_char, *const c_char) -> *mut c_char;

/// 原生插件释放字符串函数类型
type FreeStringFunction = unsafe extern "C" fn(*mut c_char);

/// 全局原生插件状态
pub struct NativePluginState {
    /// 已加载的插件库
    plugins: Arc<Mutex<HashMap<String, Library>>>,
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
    plugin_id: String,
    library_path: String,
    state: State<'_, NativePluginState>,
) -> Result<(), String> {
    println!(
        "[NATIVE] 开始加载插件: {}, 库路径: {}",
        plugin_id, library_path
    );

    // 检查插件是否已加载
    {
        let mut plugins = state.plugins.lock().map_err(|e| format!("获取插件锁失败: {}", e))?;
        if plugins.contains_key(&plugin_id) {
            println!("[NATIVE] 插件 {} 已加载，先卸载", plugin_id);
            // 如果已加载，先卸载
            plugins.remove(&plugin_id);
        }
    }

    // 加载动态库
    // 在 Windows 上，路径分隔符是 '\'，需要替换为 '/' 才能在 URL 中正常工作
    let normalized_path = library_path.replace('\\', "/");
    let library = unsafe { Library::new(&normalized_path) }
        .map_err(|e| format!("加载动态库失败: {}", e))?;

    // 存储插件库
    {
        let mut plugins = state.plugins.lock().map_err(|e| format!("获取插件锁失败: {}", e))?;
        plugins.insert(plugin_id.clone(), library);
    }

    println!("[NATIVE] 插件 {} 加载成功", plugin_id);
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
    println!("[NATIVE] 开始卸载插件: {}", plugin_id);

    // 从内存中移除插件库
    {
        let mut plugins = state.plugins.lock().map_err(|e| format!("获取插件锁失败: {}", e))?;
        plugins.remove(&plugin_id);
    }

    println!("[NATIVE] 插件 {} 卸载成功", plugin_id);
    Ok(())
}

/// 调用原生插件方法
///
/// 调用已加载插件中的函数
#[tauri::command]
pub async fn call_native_plugin_method(
    request: NativePluginCallRequest,
    state: State<'_, NativePluginState>,
) -> Result<String, String> {
    println!(
        "[NATIVE] 调用插件方法: {}.{}",
        request.plugin_id, request.method_name
    );

    // 获取插件库
    let plugins = state.plugins.lock().map_err(|e| format!("获取插件锁失败: {}", e))?;
    let library = plugins
        .get(&request.plugin_id)
        .ok_or_else(|| format!("插件 {} 未加载", request.plugin_id))?;

    // 获取 call 函数
    let call: Symbol<CallFunction> = unsafe {
        library
            .get(b"call\0")
            .map_err(|e| format!("获取 call 函数失败: {}", e))?
    };

    // 获取 free_string 函数（可选）
    let free_string: Result<Symbol<FreeStringFunction>, _> = unsafe {
        library.get(b"free_string\0")
    };

    // 准备参数
    let method_name_cstr = CString::new(request.method_name.as_str())
        .map_err(|e| format!("方法名转换失败: {}", e))?;
    let payload_cstr = CString::new(request.payload.as_str())
        .map_err(|e| format!("载荷转换失败: {}", e))?;

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
    match free_string {
        Ok(free_func) => {
            unsafe { free_func(result_ptr) };
            println!("[NATIVE] 已使用插件提供的 free_string 函数释放内存");
        }
        Err(_) => {
            // 如果插件没有提供 free_string 函数，使用 Rust 的方式释放
            // 注意：这只有在插件使用 CString::new().into_raw() 返回时才安全
            // 其他情况下可能导致内存泄漏或崩溃
            println!("[NATIVE] 警告：插件未提供 free_string 函数，可能存在内存泄漏");
        }
    }

    println!("[NATIVE] 插件方法调用成功，结果: {}", result_str);
    Ok(result_str)
}