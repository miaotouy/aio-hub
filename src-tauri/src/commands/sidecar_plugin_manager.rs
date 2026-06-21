//! 常驻 Sidecar 进程管理器
//!
//! 管理常驻 Sidecar 进程的生命周期，支持：
//! - 进程启动/关闭（生命周期管理）
//! - JSON-RPC 命令发送与响应匹配
//! - 事件流推送（转发到前端 Tauri Event）
//! - Sidecar 间中转（Broker 模式）
//!
//! ## 通信协议
//!
//! ### 请求格式（前端 → Sidecar）
//! ```json
//! { "id": 1, "method": "recognizeBatch", "params": { "images": [...] } }
//! ```
//!
//! ### 响应/事件格式（Sidecar → 前端）
//! ```json
//! { "id": 1, "type": "result", "data": { ... } }
//! { "id": 1, "type": "progress", "data": { "percent": 50 } }
//! { "id": 1, "type": "error", "data": "错误信息" }
//! { "type": "event", "event": "status", "data": { "status": "running" } }
//! ```
//!
//! ### Broker 转发格式（Sidecar → Manager → Sidecar）
//! ```json
//! { "type": "forward", "id": 100, "target": "paddle-ocr", "method": "...", "params": {...} }
//! ```

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc,
};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot, Mutex};
use uuid::Uuid;

// ============================================================================
// 数据结构
// ============================================================================

/// 常驻 Sidecar 进程句柄
pub(crate) struct ResidentProcess {
    /// 子进程句柄
    child: Option<Child>,
    /// stdin 写入器（通过 Mutex 包裹以支持 &self 共享访问）
    stdin: Option<tokio::sync::Mutex<tokio::process::ChildStdin>>,
    /// 请求 ID 自增计数器
    next_id: AtomicU64,
    /// 待处理的请求（id → oneshot::Sender）
    pending_requests: Mutex<HashMap<u64, oneshot::Sender<String>>>,
}

/// 常驻进程内部事件（用于跨任务通信）
#[derive(Debug, Clone, Serialize)]
struct ResidentEvent {
    plugin_id: String,
    event_type: String,
    event_name: Option<String>,
    data: String,
}

/// 全局常驻进程管理器状态
pub struct SidecarPluginManager {
    /// plugin_id → ResidentProcess 映射
    pub(crate) processes: Arc<Mutex<HashMap<String, ResidentProcess>>>,
}

impl Default for SidecarPluginManager {
    fn default() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// 启动常驻 Sidecar 进程
///
/// 启动进程并保持 stdin/stdout/stderr 句柄，
/// 启动异步任务持续读取 stdout 解析 JSON 事件。
#[tauri::command]
pub async fn sidecar_spawn_resident(
    app: AppHandle,
    plugin_id: String,
    executable_path: String,
    args: Vec<String>,
    state: tauri::State<'_, SidecarPluginManager>,
) -> Result<(), String> {
    log::info!(
        "[SIDECAR_RESIDENT] 启动常驻进程: {}, 可执行文件: {}",
        plugin_id,
        executable_path
    );

    // 检查是否已存在
    {
        let processes = state.processes.lock().await;
        if processes.contains_key(&plugin_id) {
            return Err(format!("插件 {} 的常驻进程已存在", plugin_id));
        }
    }

    let mut executable_full_path = PathBuf::from(&executable_path);

    // 打印当前工作目录和传入的路径，方便调试
    if let Ok(cwd) = std::env::current_dir() {
        log::info!(
            "[SIDECAR_RESIDENT] 当前工作目录 (CWD): {}, 传入的可执行文件路径: {}",
            cwd.display(),
            executable_path
        );

        // 如果是相对路径，且当前工作目录是 src-tauri，我们需要将其调整为相对于项目根目录
        if executable_full_path.is_relative() {
            if cwd.ends_with("src-tauri") {
                if let Some(parent) = cwd.parent() {
                    let resolved_path = parent.join(&executable_path);
                    log::info!(
                        "[SIDECAR_RESIDENT] 检测到 CWD 为 src-tauri，将相对路径解析为项目根目录: {}",
                        resolved_path.display()
                    );
                    executable_full_path = resolved_path;
                }
            } else {
                executable_full_path = cwd.join(&executable_path);
            }
        }
    }

    if !executable_full_path.exists() {
        return Err(format!(
            "可执行文件不存在: {} (解析后的绝对路径: {})",
            executable_path,
            executable_full_path.display()
        ));
    }

    // 启动子进程
    let mut child = Command::new(&executable_full_path)
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .current_dir(
            executable_full_path
                .parent()
                .unwrap_or_else(|| std::path::Path::new(".")),
        )
        .spawn()
        .map_err(|e| format!("启动进程失败: {}", e))?;

    log::info!("[SIDECAR_RESIDENT] 进程已启动，PID: {:?}", child.id());

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "无法获取子进程 stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法获取子进程 stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "无法获取子进程 stderr".to_string())?;

    // 创建事件通道和写入端
    let (_event_tx, mut event_rx) = mpsc::unbounded_channel::<ResidentEvent>();

    let process = ResidentProcess {
        child: Some(child),
        stdin: Some(tokio::sync::Mutex::new(stdin)),
        next_id: AtomicU64::new(1),
        pending_requests: Mutex::new(HashMap::new()),
    };

    // 插入管理器
    {
        let mut processes = state.processes.lock().await;
        processes.insert(plugin_id.clone(), process);
    }

    // 启动 stdout 读取任务
    let plugin_id_clone = plugin_id.clone();
    let app_clone = app.clone();
    let processes = state.processes.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            log::info!("[SIDECAR_RESIDENT:{}] stdout: {}", plugin_id_clone, line);

            // 尝试解析为 JSON
            if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(&line) {
                let event_type = json_val
                    .get("type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string();

                // === Broker 模式识别：type === "forward" ===
                if event_type == "forward" {
                    let processes_lock = processes.lock().await;

                    // 可能需要让自身的 pending_requests 也注入
                    // 获取源进程
                    if let Some(src_process) = processes_lock.get(&plugin_id_clone) {
                        // 解析中转请求
                        let forward_id = json_val.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
                        let target = json_val
                            .get("target")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        let method = json_val
                            .get("method")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        let params = json_val.get("params");

                        if target.is_empty() || method.is_empty() {
                            log::error!(
                                "[SIDECAR_RESIDENT:{}] broker 转发格式错误: target={}, method={}",
                                plugin_id_clone,
                                target,
                                method
                            );
                            // 推送错误事件给源进程
                            let error_event = serde_json::json!({
                                "type": "event",
                                "event": "forward_result",
                                "data": {
                                    "id": forward_id,
                                    "targetId": target,
                                    "result": null,
                                    "error": format!("Broker 转发格式错误: target/method 为空")
                                }
                            });
                            let _ = src_process
                                .write_to_stdin_internal(&error_event.to_string())
                                .await;
                            continue;
                        }

                        log::info!(
                            "[SIDECAR_RESIDENT] broker 转发: {} -> {}::{}(params={:?})",
                            plugin_id_clone,
                            target,
                            method,
                            params
                        );

                        if let Some(target_process) = processes_lock.get(target) {
                            // 生成内部 ID 并发送到目标进程
                            let internal_id = target_process.next_id.fetch_add(1, Ordering::SeqCst);
                            let cmd = serde_json::json!({
                                "id": internal_id,
                                "method": method,
                                "params": params
                            });

                            // 创建 oneshot 接收器
                            let (tx, mut rx) = oneshot::channel::<String>();
                            {
                                let mut pending = target_process.pending_requests.lock().await;
                                pending.insert(internal_id, tx);
                            }

                            // 写入目标进程 stdin
                            if let Err(e) = target_process
                                .write_to_stdin_internal(&cmd.to_string())
                                .await
                            {
                                log::error!("[SIDECAR_RESIDENT] broker 转发写入失败: {}", e);
                                // 清理 pending
                                {
                                    let mut pending = target_process.pending_requests.lock().await;
                                    pending.remove(&internal_id);
                                }
                                let error_event = serde_json::json!({
                                    "type": "event",
                                    "event": "forward_result",
                                    "data": {
                                        "id": forward_id,
                                        "targetId": target,
                                        "result": null,
                                        "error": format!("写入目标进程 stdin 失败: {}", e)
                                    }
                                });
                                // 需要重新获取 src_process 引用
                                drop(processes_lock);
                                let processes_lock2 = processes.lock().await;
                                if let Some(sp) = processes_lock2.get(&plugin_id_clone) {
                                    let _ =
                                        sp.write_to_stdin_internal(&error_event.to_string()).await;
                                }
                                continue;
                            }
                            drop(processes_lock);

                            // 等待目标进程响应（带超时）
                            let timeout = tokio::time::Duration::from_secs(120);
                            let result = tokio::time::timeout(timeout, &mut rx).await;

                            let response_str = match result {
                                Ok(Ok(resp)) => resp,
                                Ok(Err(_)) => {
                                    "{\"type\":\"error\",\"data\":\"目标进程响应通道已关闭\"}"
                                        .to_string()
                                }
                                Err(_) => {
                                    "{\"type\":\"error\",\"data\":\"目标进程响应超时\"}".to_string()
                                }
                            };

                            // 解析响应并提取 result
                            let result_data =
                                serde_json::from_str::<serde_json::Value>(&response_str)
                                    .ok()
                                    .and_then(|v| v.get("data").cloned())
                                    .unwrap_or(serde_json::Value::Null);

                            let error_str =
                                serde_json::from_str::<serde_json::Value>(&response_str)
                                    .ok()
                                    .and_then(|v| {
                                        if v.get("type").and_then(|t| t.as_str()) == Some("error") {
                                            v.get("data")
                                                .and_then(|d| d.as_str())
                                                .map(|s| s.to_string())
                                        } else {
                                            None
                                        }
                                    });

                            // 将结果推回给源进程的 stdout
                            let forward_result = serde_json::json!({
                                "type": "event",
                                "event": "forward_result",
                                "data": {
                                    "id": forward_id,
                                    "targetId": target,
                                    "result": result_data,
                                    "error": error_str
                                }
                            });

                            let processes_lock3 = processes.lock().await;
                            if let Some(sp) = processes_lock3.get(&plugin_id_clone) {
                                let _ = sp
                                    .write_to_stdin_internal(&forward_result.to_string())
                                    .await;
                            }
                        } else {
                            // 目标进程不存在
                            log::error!("[SIDECAR_RESIDENT] broker 转发目标 {} 不存在", target);
                            let error_event = serde_json::json!({
                                "type": "event",
                                "event": "forward_result",
                                "data": {
                                    "id": forward_id,
                                    "targetId": target,
                                    "result": null,
                                    "error": format!("目标常驻进程 {} 未启动", target)
                                }
                            });
                            if let Some(sp) = processes_lock.get(&plugin_id_clone) {
                                let _ = sp.write_to_stdin_internal(&error_event.to_string()).await;
                            }
                        }
                    }
                    continue;
                }

                // === 普通事件/响应处理 ===
                // 检查是否有 id 字段（响应匹配）
                let has_id = json_val.get("id").and_then(|v| v.as_u64()).is_some();

                if has_id {
                    // 尝试匹配 pending_requests
                    let id = json_val.get("id").and_then(|v| v.as_u64()).unwrap();
                    let processes_lock = processes.lock().await;
                    if let Some(process) = processes_lock.get(&plugin_id_clone) {
                        let mut pending = process.pending_requests.lock().await;
                        if let Some(tx) = pending.remove(&id) {
                            // 通过 oneshot 直接送回，不转发给前端
                            let _ = tx.send(line.clone());
                            continue;
                        }
                    }
                }

                // 没有匹配到 pending 请求，作为事件推送给前端
                let event_name = if event_type == "event" {
                    json_val
                        .get("event")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                } else {
                    None
                };

                let resident_event = ResidentEvent {
                    plugin_id: plugin_id_clone.clone(),
                    event_type,
                    event_name,
                    data: line.clone(),
                };

                let _ = app_clone.emit(
                    "sidecar-resident-event",
                    serde_json::to_value(&resident_event).unwrap_or_default(),
                );
            } else {
                // 非 JSON 输出，作为 log 事件发送
                let resident_event = ResidentEvent {
                    plugin_id: plugin_id_clone.clone(),
                    event_type: "log".to_string(),
                    event_name: None,
                    data: line,
                };
                let _ = app_clone.emit(
                    "sidecar-resident-event",
                    serde_json::to_value(&resident_event).unwrap_or_default(),
                );
            }
        }

        log::info!("[SIDECAR_RESIDENT:{}] stdout 读取循环结束", plugin_id_clone);
    });

    // 启动 stderr 读取任务
    let plugin_id_clone = plugin_id.clone();
    let app_clone = app.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            log::info!("[SIDECAR_RESIDENT:{}] stderr: {}", plugin_id_clone, line);

            let resident_event = ResidentEvent {
                plugin_id: plugin_id_clone.clone(),
                event_type: "error".to_string(),
                event_name: None,
                data: line,
            };
            let _ = app_clone.emit(
                "sidecar-resident-event",
                serde_json::to_value(&resident_event).unwrap_or_default(),
            );
        }
    });

    // 启动事件转发任务（将内部事件通道的事件转发到前端）
    let app_clone = app.clone();
    let pid_clone = plugin_id.clone();
    tokio::spawn(async move {
        while let Some(event) = event_rx.recv().await {
            let _ = app_clone.emit(
                "sidecar-resident-event",
                serde_json::to_value(&event).unwrap_or_default(),
            );
        }
        log::info!("[SIDECAR_RESIDENT:{}] 事件转发任务结束", pid_clone);
    });

    Ok(())
}

/// 向常驻 Sidecar 进程发送命令
///
/// 发送 JSON-RPC 格式的命令，等待响应并返回。
#[tauri::command]
pub async fn sidecar_send_command(
    plugin_id: String,
    method: String,
    params: serde_json::Value,
    state: tauri::State<'_, SidecarPluginManager>,
) -> Result<String, String> {
    log::info!("[SIDECAR_RESIDENT] 发送命令: {}.{}", plugin_id, method);

    // 提取 id 和 cmd_str 后立即释放 processes 锁，避免阻塞 stdout 读取任务
    let (id, _cmd_str, rx) = {
        let processes = state.processes.lock().await;
        let process = processes
            .get(&plugin_id)
            .ok_or_else(|| format!("插件 {} 的常驻进程未启动", plugin_id))?;

        // 生成唯一 ID
        let id = process.next_id.fetch_add(1, Ordering::SeqCst);

        // 构建 JSON-RPC 命令
        let cmd = serde_json::json!({
            "id": id,
            "method": method,
            "params": params
        });

        let cmd_str = cmd.to_string();

        // 创建 oneshot 接收器
        let (tx, rx) = oneshot::channel::<String>();
        {
            let mut pending = process.pending_requests.lock().await;
            pending.insert(id, tx);
        }

        // 写入 stdin（此时仍持有 processes 锁，但这是必要的——我们不能让
        // 其他线程同时修改同一个进程的 stdin）
        if let Err(e) = process.write_to_stdin(&cmd_str).await {
            // 清理 pending
            let mut pending = process.pending_requests.lock().await;
            pending.remove(&id);
            return Err(format!("写入 stdin 失败: {}", e));
        }

        (id, cmd_str, rx)
    };
    // processes 锁在此处自动 drop，stdout 任务现在可以获取锁并完成 tx.send()

    // 等待响应（带超时）
    let timeout = tokio::time::Duration::from_secs(300); // 5 分钟超时
    let result = tokio::time::timeout(timeout, rx).await;

    match result {
        Ok(Ok(response)) => Ok(response),
        Ok(Err(_)) => {
            // 发送端已关闭，清理 pending
            let processes = state.processes.lock().await;
            if let Some(p) = processes.get(&plugin_id) {
                let mut pending = p.pending_requests.lock().await;
                pending.remove(&id);
            }
            Err("进程响应通道已关闭".to_string())
        }
        Err(_) => {
            // 超时，清理 pending
            let processes = state.processes.lock().await;
            if let Some(p) = processes.get(&plugin_id) {
                let mut pending = p.pending_requests.lock().await;
                pending.remove(&id);
            }
            Err(format!("命令执行超时 ({}s): {}.{}", 300, plugin_id, method))
        }
    }
}

/// 停止常驻 Sidecar 进程
///
/// 发送 shutdown 指令，等待进程退出（超时 5s 后强制 kill）。
#[tauri::command]
pub async fn sidecar_kill_resident(
    plugin_id: String,
    state: tauri::State<'_, SidecarPluginManager>,
) -> Result<(), String> {
    log::info!("[SIDECAR_RESIDENT] 停止常驻进程: {}", plugin_id);

    let mut processes = state.processes.lock().await;
    let mut process = processes
        .remove(&plugin_id)
        .ok_or_else(|| format!("插件 {} 的常驻进程未启动", plugin_id))?;

    // 发送 shutdown 指令（优雅退出）
    let shutdown_cmd = serde_json::json!({
        "id": 0,
        "method": "shutdown",
        "params": {}
    });

    if let Some(stdin_mutex) = process.stdin.as_mut() {
        let mut stdin = stdin_mutex.lock().await;
        let cmd_str = shutdown_cmd.to_string();
        log::info!("[SIDECAR_RESIDENT:{}] 发送 shutdown 指令", plugin_id);
        let _ = stdin.write_all(cmd_str.as_bytes()).await;
        let _ = stdin.write_all(b"\n").await;
        let _ = stdin.flush().await;
    }

    // 关闭 stdin，让进程知道输入结束
    drop(process.stdin.take());

    // 等待进程退出（超时 5s）
    if let Some(child) = process.child.as_mut() {
        let timeout = tokio::time::Duration::from_secs(5);
        match tokio::time::timeout(timeout, child.wait()).await {
            Ok(Ok(status)) => {
                log::info!(
                    "[SIDECAR_RESIDENT:{}] 进程已退出，状态: {}",
                    plugin_id,
                    status
                );
            }
            Ok(Err(e)) => {
                log::warn!(
                    "[SIDECAR_RESIDENT:{}] 等待进程退出失败: {}，执行强制 kill",
                    plugin_id,
                    e
                );
                let _ = child.start_kill();
            }
            Err(_) => {
                log::warn!(
                    "[SIDECAR_RESIDENT:{}] 进程退出超时，执行强制 kill",
                    plugin_id
                );
                let _ = child.start_kill();
            }
        }
    }

    log::info!("[SIDECAR_RESIDENT] 常驻进程 {} 已停止", plugin_id);
    Ok(())
}

// ============================================================================
// ResidentProcess 内部方法
// ============================================================================

impl ResidentProcess {
    /// 写入 stdin（带换行和 flush）
    async fn write_to_stdin(&self, data: &str) -> Result<(), String> {
        if let Some(stdin_mutex) = &self.stdin {
            let mut stdin = stdin_mutex.lock().await;
            stdin
                .write_all(data.as_bytes())
                .await
                .map_err(|e| format!("写入 stdin 失败: {}", e))?;
            stdin
                .write_all(b"\n")
                .await
                .map_err(|e| format!("写入换行符失败: {}", e))?;
            stdin
                .flush()
                .await
                .map_err(|e| format!("刷新 stdin 失败: {}", e))?;
            Ok(())
        } else {
            Err("stdin 已关闭".to_string())
        }
    }

    /// 内部写 stdin（用于 broker 转发，不对外暴露）
    async fn write_to_stdin_internal(&self, data: &str) -> Result<(), String> {
        self.write_to_stdin(data).await
    }
}

// ============================================================================
// 临时文件管理 Commands
// ============================================================================

/// 临时文件数据
#[derive(Debug, Deserialize)]
pub struct FileData {
    /// 文件名（不含路径）
    pub filename: String,
    /// 文件内容（base64 编码）
    pub content_base64: String,
}

/// 写入临时文件
///
/// 将前端传来的二进制数据写入共享临时目录，返回完整路径列表。
#[tauri::command]
pub async fn write_temp_files(
    app: AppHandle,
    source: String,
    files: Vec<FileData>,
) -> Result<Vec<String>, String> {
    let temp_dir = get_shared_temp_dir(&app);
    let source_dir = temp_dir.join(&source);
    std::fs::create_dir_all(&source_dir).map_err(|e| format!("创建临时目录失败: {}", e))?;

    let mut paths = Vec::with_capacity(files.len());

    for file in &files {
        let timestamp = chrono::Utc::now().format("%Y%m%d%H%M%S");
        let file_uuid = Uuid::new_v4();
        let safe_filename = format!("{}_{}_{}", source, timestamp, file_uuid);
        // 保留原始扩展名
        let ext = std::path::Path::new(&file.filename)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("bin");
        let final_filename = format!("{}.{}", safe_filename, ext);
        let file_path = source_dir.join(&final_filename);

        // 解码 base64 并写入
        use base64::Engine as _;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(&file.content_base64)
            .map_err(|e| format!("base64 解码失败: {}", e))?;

        std::fs::write(&file_path, &bytes).map_err(|e| format!("写入文件失败: {}", e))?;

        paths.push(file_path.to_string_lossy().to_string());
    }

    log::info!(
        "[SIDECAR_RESIDENT] 写入 {} 个临时文件到 {}",
        files.len(),
        source_dir.display()
    );

    Ok(paths)
}

/// 清理临时文件
///
/// 批量删除指定的临时文件。
#[tauri::command]
pub async fn cleanup_temp_files(paths: Vec<String>) -> Result<(), String> {
    let mut deleted = 0usize;
    let mut errors = Vec::new();

    for path_str in &paths {
        let path = std::path::Path::new(path_str);
        // 安全检查：只允许删除共享临时目录下的文件
        if !is_in_shared_temp_dir(path) {
            errors.push(format!("路径不在共享临时目录内: {}", path_str));
            continue;
        }

        match std::fs::remove_file(path) {
            Ok(_) => deleted += 1,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                // 文件已不存在，忽略
                deleted += 1;
            }
            Err(e) => {
                errors.push(format!("删除文件失败 {}: {}", path_str, e));
            }
        }
    }

    log::info!(
        "[SIDECAR_RESIDENT] 清理临时文件: {}/{} 成功, {} 失败",
        deleted,
        paths.len(),
        errors.len()
    );

    if errors.is_empty() {
        Ok(())
    } else {
        Err(format!("部分文件删除失败: {}", errors.join("; ")))
    }
}

/// 启动时清理过期临时文件（超过 24 小时）
pub fn cleanup_expired_temp_files(app: &AppHandle) {
    let temp_dir = get_shared_temp_dir(app);
    if !temp_dir.exists() {
        return;
    }

    let max_age = std::time::Duration::from_secs(24 * 60 * 60); // 24 小时
    let mut cleaned = 0usize;

    if let Ok(entries) = std::fs::read_dir(&temp_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                // 递归清理子目录
                if let Ok(sub_entries) = std::fs::read_dir(&path) {
                    for sub_entry in sub_entries.flatten() {
                        let sub_path = sub_entry.path();
                        if sub_path.is_file() {
                            if let Ok(metadata) = std::fs::metadata(&sub_path) {
                                if let Ok(modified) = metadata.modified() {
                                    if let Ok(duration) = modified.elapsed() {
                                        if duration > max_age {
                                            let _ = std::fs::remove_file(&sub_path);
                                            cleaned += 1;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if cleaned > 0 {
        log::info!(
            "[SIDECAR_RESIDENT] 启动清理：已删除 {} 个过期临时文件",
            cleaned
        );
    }
}

// ============================================================================
// 辅助函数
// ============================================================================

/// 获取共享临时目录路径
fn get_shared_temp_dir(app: &AppHandle) -> PathBuf {
    let app_data_dir = crate::get_app_data_dir(app.config());
    app_data_dir.join("temp").join("aiohub-shared")
}

/// 检查路径是否在共享临时目录下（安全校验）
fn is_in_shared_temp_dir(path: &std::path::Path) -> bool {
    // 规范化路径
    let normalized = if path.is_absolute() {
        path.to_path_buf()
    } else {
        match std::env::current_dir() {
            Ok(cwd) => cwd.join(path),
            Err(_) => return false,
        }
    };

    // 使用 canonicalize 解析符号链接和相对路径
    let canonical = match normalized.canonicalize() {
        Ok(p) => p,
        Err(_) => normalized,
    };

    // 检查路径中是否包含 aiohub-shared
    canonical.to_string_lossy().contains("aiohub-shared")
}
