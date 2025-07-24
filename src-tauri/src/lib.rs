// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

// 定义一个结构体来管理监听状态
struct ClipboardMonitorState {
    should_run: Arc<atomic::AtomicBool>,
    last_content: Arc<Mutex<String>>,
}

// Tauri 命令：启动剪贴板监听
#[tauri::command]
fn start_clipboard_monitor(app_handle: AppHandle, state: State<ClipboardMonitorState>) {
    let should_run = state.should_run.clone();
    let last_content = state.last_content.clone();
    should_run.store(true, atomic::Ordering::SeqCst);

    thread::spawn(move || {
        let mut last_clipboard_text = last_content.lock().unwrap().clone();
        while should_run.load(atomic::Ordering::SeqCst) {
            if let Ok(clipboard_manager) = app_handle.clipboard_manager() {
                if let Ok(current_content) = clipboard_manager.read_text() {
                    if let Some(content) = current_content {
                        if content != last_clipboard_text {
                            last_clipboard_text = content.clone();
                            *last_content.lock().unwrap() = content.clone();
                            // 发送事件到前端
                            app_handle.emit_all("clipboard-changed", content).unwrap();
                        }
                    }
                }
            }
            thread::sleep(Duration::from_millis(500)); // 每500毫秒检查一次
        }
    });
}

// Tauri 命令：停止剪贴板监听
#[tauri::command]
fn stop_clipboard_monitor(state: State<ClipboardMonitorState>) {
    state.should_run.store(false, atomic::Ordering::SeqCst);
}

// Tauri 命令：获取剪贴板内容类型（需要更复杂的逻辑来实现）
// 暂时只返回文本类型，后续可以扩展识别 JSON, Base64, Image 等
#[tauri::command]
fn get_clipboard_content_type(state: State<ClipboardMonitorState>) -> String {
    let content = state.last_content.lock().unwrap();
    if content.starts_with("{") && content.ends_with("}") {
        "json".to_string()
    } else if content.len() > 100 && content.ends_with("==") && content.contains("/") { // 粗略判断 base64
        "base64".to_string()
    } else {
        "text".to_string()
    }
}


use std::sync::{Arc, Mutex, atomic};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager, State, SystemTrayEvent, WindowEvent}; // 导入 WindowEvent

// 定义一个结构体来管理监听状态
struct ClipboardMonitorState {
    should_run: Arc<atomic::AtomicBool>,
    last_content: Arc<Mutex<String>>,
}

// Tauri 命令：启动剪贴板监听
#[tauri::command]
fn start_clipboard_monitor(app_handle: AppHandle, state: State<ClipboardMonitorState>) {
    let should_run = state.should_run.clone();
    let last_content = state.last_content.clone();
    should_run.store(true, atomic::Ordering::SeqCst);

    thread::spawn(move || {
        let mut last_clipboard_text = last_content.lock().unwrap().clone();
        while should_run.load(atomic::Ordering::SeqCst) {
            if let Ok(clipboard_manager) = app_handle.clipboard_manager() {
                if let Ok(current_content) = clipboard_manager.read_text() {
                    if let Some(content) = current_content {
                        if content != last_clipboard_text {
                            last_clipboard_text = content.clone();
                            *last_content.lock().unwrap() = content.clone();
                            // 发送事件到前端
                            app_handle.emit_all("clipboard-changed", content).unwrap();
                        }
                    }
                }
            }
            thread::sleep(Duration::from_millis(500)); // 每500毫秒检查一次
        }
    });
}

// Tauri 命令：停止剪贴板监听
#[tauri::command]
fn stop_clipboard_monitor(state: State<ClipboardMonitorState>) {
    state.should_run.store(false, atomic::Ordering::SeqCst);
}

// Tauri 命令：获取剪贴板内容类型（需要更复杂的逻辑来实现）
// 暂时只返回文本类型，后续可以扩展识别 JSON, Base64, Image 等
#[tauri::command]
fn get_clipboard_content_type(state: State<ClipboardMonitorState>) -> String {
    let content = state.last_content.lock().unwrap();
    if content.starts_with("{") && content.ends_with("}") {
        "json".to_string()
    } else if content.len() > 100 && content.ends_with("==") && content.contains("/") { // 粗略判断 base64
        "base64".to_string()
    } else {
        "text".to_string()
    }
}


pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_path::init())
        .manage(ClipboardMonitorState {
            should_run: Arc::new(atomic::AtomicBool::new(false)),
            last_content: Arc::new(Mutex::new(String::new())),
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            start_clipboard_monitor,
            stop_clipboard_monitor,
            get_clipboard_content_type
        ])
        .on_window_event(|window, event| match event {
            WindowEvent::FileDropDropped { paths, .. } => {
                // 当文件被拖拽到窗口时，发送事件到前端
                window.emit("tauri-file-drop", paths).unwrap();
            }
            _ => {}
        })
        .setup(|app| {
            // 注册全局快捷键
            let app_handle = app.handle();
            let main_window = app_handle.get_window("main").unwrap();
            main_window.set_skip_taskbar(false).unwrap(); // 确保窗口显示在任务栏

            app_handle.global_shortcut_manager().register("CmdOrCtrl+Shift+Space", move || {
                if main_window.is_visible().unwrap() {
                    main_window.hide().unwrap();
                } else {
                    main_window.show().unwrap();
                    main_window.set_focus().unwrap(); // 确保窗口获得焦点
                }
            }).unwrap();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
