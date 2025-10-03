use tauri::{Emitter, DragDropEvent, PhysicalPosition, WindowEvent};
use std::path::PathBuf;
use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct FileDropPayload {
    pub paths: Vec<PathBuf>,
    pub position: PhysicalPosition<f64>,
}

// 处理窗口事件
pub fn handle_window_event(window: &tauri::Window, event: &WindowEvent) {
    if let WindowEvent::DragDrop(event) = event {
        match event {
            DragDropEvent::Drop { paths, position } => {
                // 发送文件拖放事件到前端
                println!("File drop captured: {:?} at position {:?}", paths, position);
                window.emit("custom-file-drop", FileDropPayload {
                    paths: paths.clone(),
                    position: position.clone(),
                }).unwrap();
            }
            // 可以处理其他拖放事件
            _ => {}
        }
    }
}