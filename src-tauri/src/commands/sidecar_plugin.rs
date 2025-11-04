//! Sidecar 插件执行模块
//!
//! 负责启动和管理 Sidecar 插件进程，通过 stdin/stdout 进行通信

use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

/// Sidecar 插件执行请求
#[derive(Debug, Deserialize)]
pub struct SidecarExecuteRequest {
    /// 插件 ID
    pub plugin_id: String,
    /// 可执行文件路径（相对于插件目录）
    pub executable_path: String,
    /// 命令行参数
    pub args: Vec<String>,
    /// 输入数据（JSON 字符串）
    pub input: Option<String>,
    /// 是否为开发模式
    pub dev_mode: bool,
}

/// Sidecar 进程输出事件
#[derive(Debug, Clone, Serialize)]
pub struct SidecarOutputEvent {
    /// 插件 ID
    pub plugin_id: String,
    /// 输出类型：progress, result, error
    pub event_type: String,
    /// 输出数据（JSON 字符串）
    pub data: String,
}

/// 执行 Sidecar 插件
/// 
/// 启动外部进程，通过 stdin 发送输入，通过 stdout 接收输出
/// 实时将输出事件发送到前端
#[tauri::command]
pub async fn execute_sidecar(
    app: AppHandle,
    request: SidecarExecuteRequest,
) -> Result<String, String> {
    println!(
        "[SIDECAR] 开始执行插件: {}, 可执行文件: {}, 开发模式: {}",
        request.plugin_id, request.executable_path, request.dev_mode
    );

    // 获取插件目录
    let plugin_dir = if request.dev_mode {
        // 开发模式：从项目源码目录查找
        // 去掉插件 ID 的 -dev 后缀
        let original_id = request.plugin_id.trim_end_matches("-dev");
        let current_dir = std::env::current_dir()
            .map_err(|e| format!("获取当前目录失败: {}", e))?;
        
        // Tauri 开发模式下 current_dir 是 src-tauri/，需要获取父目录（项目根目录）
        let workspace_dir = current_dir
            .parent()
            .ok_or_else(|| "无法获取项目根目录".to_string())?;
        
        workspace_dir.join("plugins").join(format!("example-{}", original_id))
    } else {
        // 生产模式：从 appDataDir 查找
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("获取应用数据目录失败: {}", e))?;
        app_data_dir.join("plugins").join(&request.plugin_id)
    };

    // 构建可执行文件完整路径
    let executable_full_path = plugin_dir.join(&request.executable_path);

    if !executable_full_path.exists() {
        return Err(format!(
            "可执行文件不存在: {}",
            executable_full_path.display()
        ));
    }

    println!(
        "[SIDECAR] 可执行文件路径: {}",
        executable_full_path.display()
    );

    // 启动子进程
    let mut child = Command::new(&executable_full_path)
        .args(&request.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .current_dir(&plugin_dir)
        .spawn()
        .map_err(|e| format!("启动进程失败: {}", e))?;

    println!("[SIDECAR] 进程已启动，PID: {:?}", child.id());

    // 获取 stdin, stdout, stderr
    let mut stdin = child
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

    // 如果有输入数据，写入 stdin
    if let Some(input) = request.input {
        stdin
            .write_all(input.as_bytes())
            .await
            .map_err(|e| format!("写入 stdin 失败: {}", e))?;
        stdin
            .write_all(b"\n")
            .await
            .map_err(|e| format!("写入 stdin 换行符失败: {}", e))?;
        stdin
            .flush()
            .await
            .map_err(|e| format!("刷新 stdin 失败: {}", e))?;
        // 关闭 stdin 以通知子进程输入结束
        drop(stdin);
    }

    // 读取 stdout
    let plugin_id_clone = request.plugin_id.clone();
    let app_clone = app.clone();
    let stdout_handle = tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        let mut last_result: Option<String> = None;

        while let Ok(Some(line)) = lines.next_line().await {
            println!("[SIDECAR] stdout: {}", line);

            // 尝试解析为 JSON 事件
            if let Ok(event_data) = serde_json::from_str::<serde_json::Value>(&line) {
                let event = SidecarOutputEvent {
                    plugin_id: plugin_id_clone.clone(),
                    event_type: event_data
                        .get("type")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                        .to_string(),
                    data: line.clone(),
                };

                // 如果是 result 类型，保存结果
                if event.event_type == "result" {
                    last_result = Some(line.clone());
                }

                // 发送事件到前端
                let _ = app_clone.emit("sidecar-output", event);
            } else {
                // 非 JSON 输出，作为普通日志发送
                let event = SidecarOutputEvent {
                    plugin_id: plugin_id_clone.clone(),
                    event_type: "log".to_string(),
                    data: line,
                };
                let _ = app_clone.emit("sidecar-output", event);
            }
        }

        last_result
    });

    // 读取 stderr
    let plugin_id_clone = request.plugin_id.clone();
    let app_clone = app.clone();
    let stderr_handle = tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            println!("[SIDECAR] stderr: {}", line);

            let event = SidecarOutputEvent {
                plugin_id: plugin_id_clone.clone(),
                event_type: "error".to_string(),
                data: line,
            };

            let _ = app_clone.emit("sidecar-output", event);
        }
    });

    // 等待进程结束
    let status = child
        .wait()
        .await
        .map_err(|e| format!("等待进程结束失败: {}", e))?;

    println!("[SIDECAR] 进程已结束，状态: {:?}", status);

    // 等待输出读取完成
    let stdout_result = stdout_handle
        .await
        .map_err(|e| format!("读取 stdout 失败: {}", e))?;
    let _ = stderr_handle.await;

    // 检查进程退出状态
    if !status.success() {
        return Err(format!("进程执行失败，退出码: {:?}", status.code()));
    }

    // 返回最后的结果（如果有）
    Ok(stdout_result.unwrap_or_else(|| {
        serde_json::json!({
            "type": "result",
            "data": null
        })
        .to_string()
    }))
}