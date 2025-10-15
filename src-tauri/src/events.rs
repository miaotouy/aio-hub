use tauri::{Emitter, DragDropEvent, PhysicalPosition, WindowEvent};
use std::path::PathBuf;
use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct FileDropPayload {
    pub paths: Vec<PathBuf>,
    pub position: PhysicalPosition<f64>,
}

#[derive(Clone, Serialize)]
pub struct DragPositionPayload {
    pub position: PhysicalPosition<f64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryScanProgress {
    pub current_path: String,
    pub scanned_count: usize,
    pub total_count: Option<usize>, // None 表示未知总数
    pub current_depth: usize,
    pub found_items: usize,
}

// 处理窗口事件
pub fn handle_window_event(window: &tauri::Window, event: &WindowEvent) {
    if let WindowEvent::DragDrop(event) = event {
        match event {
            DragDropEvent::Enter { paths, position } => {
                // 发送拖动进入事件
                println!("Drag enter: {:?} at position {:?}", paths, position);
                window.emit("custom-drag-enter", DragPositionPayload {
                    position: position.clone(),
                }).unwrap();
            }
            DragDropEvent::Over { position } => {
                // 发送拖动移动事件
                window.emit("custom-drag-over", DragPositionPayload {
                    position: position.clone(),
                }).unwrap();
            }
            DragDropEvent::Leave => {
                // 发送拖动离开事件
                println!("Drag leave");
                window.emit("custom-drag-leave", {}).unwrap();
            }
            DragDropEvent::Drop { paths, position } => {
                // 发送文件拖放事件到前端
                println!("File drop captured: {:?} at position {:?}", paths, position);
                window.emit("custom-file-drop", FileDropPayload {
                    paths: paths.clone(),
                    position: position.clone(),
                }).unwrap();
            }
            _ => {}
        }
    }
}