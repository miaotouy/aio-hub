use std::sync::{Arc, Mutex, atomic};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, State, Emitter};
use tauri_plugin_clipboard_manager::ClipboardExt;

// 定义一个结构体来管理监听状态
pub struct ClipboardMonitorState {
    pub should_run: Arc<atomic::AtomicBool>,
    pub last_content: Arc<Mutex<String>>,
}

impl ClipboardMonitorState {
    pub fn new() -> Self {
        Self {
            should_run: Arc::new(atomic::AtomicBool::new(false)),
            last_content: Arc::new(Mutex::new(String::new())),
        }
    }
}

// Tauri 命令：启动剪贴板监听
#[tauri::command]
pub fn start_clipboard_monitor(app_handle: AppHandle, state: State<ClipboardMonitorState>) {
    let should_run = state.should_run.clone();
    let last_content = state.last_content.clone();
    should_run.store(true, atomic::Ordering::SeqCst);

    thread::spawn(move || {
        let mut last_clipboard_text = last_content.lock().unwrap().clone();
        while should_run.load(atomic::Ordering::SeqCst) {
            let clipboard_manager = app_handle.clipboard();
            if let Ok(current_content) = clipboard_manager.read_text() {
                if !current_content.is_empty() && current_content != last_clipboard_text {
                    last_clipboard_text = current_content.clone();
                    *last_content.lock().unwrap() = current_content.clone();
                    // 发送事件到前端
                    app_handle.emit("clipboard-changed", current_content).unwrap();
                }
            }
            thread::sleep(Duration::from_millis(500)); // 每500毫秒检查一次
        }
    });
}

// Tauri 命令：停止剪贴板监听
#[tauri::command]
pub fn stop_clipboard_monitor(state: State<ClipboardMonitorState>) {
    state.should_run.store(false, atomic::Ordering::SeqCst);
}

// Tauri 命令：获取剪贴板内容类型
#[tauri::command]
pub fn get_clipboard_content_type(state: State<ClipboardMonitorState>) -> String {
    let content = state.last_content.lock().unwrap();
    if content.starts_with("{") && content.ends_with("}") {
        "json".to_string()
    } else if content.len() > 100 && content.ends_with("==") && content.contains("/") {
        "base64".to_string()
    } else {
        "text".to_string()
    }
}