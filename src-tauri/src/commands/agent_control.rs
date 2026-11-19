//! Opt-in release controller over a local named pipe / Unix socket. No WebDriver or eval.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager};
use tokio::{
    io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader},
    sync::{oneshot, Semaphore},
};
use tokio_util::sync::CancellationToken;

const MAX_REQUEST: usize = 256 * 1024;
const MAX_REPLY: usize = 4 * 1024 * 1024;
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ControlStatus {
    enabled: bool,
    connected: bool,
    pid: u32,
    host: &'static str,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    protocol_version: u32,
    pid: u32,
    host: String,
    endpoint: String,
    token: String,
    data_dir: String,
}
#[derive(Deserialize)]
struct Request {
    token: String,
    window: Option<String>,
    command: Value,
}
struct Pending {
    window: String,
    reply: oneshot::Sender<Value>,
}
struct Running {
    cancel: CancellationToken,
    manifest: Manifest,
}
struct Inner {
    data_dir: PathBuf,
    discovery_dir: PathBuf,
    running: Mutex<Option<Running>>,
    ready: Mutex<HashSet<String>>,
    pending: Mutex<HashMap<String, Pending>>,
    busy: Semaphore,
    changing: tokio::sync::Mutex<()>,
}
pub struct AgentControlState(Arc<Inner>);
fn failure(code: &str, message: &str) -> Value {
    json!({"ok":false,"error":{"code":code,"message":message}})
}
impl Inner {
    fn status(&self) -> ControlStatus {
        let enabled = self.running.lock().unwrap().is_some();
        ControlStatus {
            enabled,
            connected: enabled && !self.ready.lock().unwrap().is_empty(),
            pid: std::process::id(),
            host: "tauri",
        }
    }
    fn descriptor(&self) -> PathBuf {
        self.discovery_dir
            .join(format!("{}.json", std::process::id()))
    }
    fn stop(&self) {
        if let Some(running) = self.running.lock().unwrap().take() {
            running.cancel.cancel();
            let _ = std::fs::remove_file(self.descriptor());
            let descriptor = self.data_dir.join("control.json");
            let owns = std::fs::read(&descriptor)
                .ok()
                .and_then(|v| serde_json::from_slice::<Manifest>(&v).ok())
                .is_some_and(|m| m.token == running.manifest.token);
            if owns {
                let _ = std::fs::remove_file(descriptor);
            }
            #[cfg(unix)]
            let _ = std::fs::remove_file(&running.manifest.endpoint);
        }
        self.pending.lock().unwrap().clear();
    }
}
fn private_write(path: &std::path::Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options
        .open(path)
        .and_then(|mut f| f.write_all(bytes))
        .map_err(|e| e.to_string())
}
pub fn setup(app: &tauri::App) {
    let data_dir = crate::get_app_data_dir(app.config());
    let enabled = std::fs::read(data_dir.join("control-settings.json"))
        .ok()
        .and_then(|v| serde_json::from_slice::<Value>(&v).ok())
        .is_some_and(|v| v["enabled"] == true);
    let discovery_dir = dirs_next::home_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(".aiohub")
        .join("control");
    let inner = Arc::new(Inner {
        data_dir,
        discovery_dir,
        running: Mutex::new(None),
        ready: Mutex::new(HashSet::new()),
        pending: Mutex::new(HashMap::new()),
        busy: Semaphore::new(1),
        changing: tokio::sync::Mutex::new(()),
    });
    app.manage(AgentControlState(inner.clone()));
    if enabled {
        let handle = app.handle().clone();
        tauri::async_runtime::spawn(async move {
            let _guard = inner.changing.lock().await;
            if start(&inner, &handle).await.is_err() {
                log::warn!("[AgentControl] 本机调试接管启动失败，可在日志设置中重新开启");
            }
            let _ = handle.emit("agent-control:status", inner.status());
        });
    }
}
async fn start(inner: &Arc<Inner>, app: &tauri::AppHandle) -> Result<(), String> {
    if inner.running.lock().unwrap().is_some() {
        return Ok(());
    }
    std::fs::create_dir_all(&inner.discovery_dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&inner.data_dir).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&inner.discovery_dir, std::fs::Permissions::from_mode(0o700))
            .map_err(|e| e.to_string())?;
    }
    let name = format!(
        "aiohub-control-{}-{}",
        std::process::id(),
        uuid::Uuid::new_v4()
    );
    #[cfg(windows)]
    let endpoint = format!(r"\\.\pipe\{}", name);
    #[cfg(unix)]
    let endpoint = inner
        .discovery_dir
        .join(format!("{}.sock", name))
        .to_string_lossy()
        .to_string();
    #[cfg(windows)]
    let listener = tokio::net::windows::named_pipe::ServerOptions::new()
        .first_pipe_instance(true)
        .reject_remote_clients(true)
        .create(&endpoint)
        .map_err(|e| e.to_string())?;
    #[cfg(unix)]
    let listener = {
        let listener = tokio::net::UnixListener::bind(&endpoint).map_err(|e| e.to_string())?;
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&endpoint, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| e.to_string())?;
        listener
    };
    let manifest = Manifest {
        protocol_version: 1,
        pid: std::process::id(),
        host: "tauri".into(),
        endpoint: endpoint.clone(),
        token: uuid::Uuid::new_v4().to_string(),
        data_dir: inner.data_dir.to_string_lossy().to_string(),
    };
    let cancel = CancellationToken::new();
    *inner.running.lock().unwrap() = Some(Running {
        cancel: cancel.clone(),
        manifest: manifest.clone(),
    });
    let encoded = serde_json::to_vec(&manifest).map_err(|e| e.to_string())?;
    if let Err(e) = private_write(&inner.data_dir.join("control.json"), &encoded)
        .and_then(|_| private_write(&inner.descriptor(), &encoded))
    {
        inner.stop();
        return Err(e);
    }
    let inner = inner.clone();
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let connections = Arc::new(Semaphore::new(16));
        #[cfg(windows)]
        let mut listener = listener;
        loop {
            #[cfg(windows)]
            let stream = {
                let connected = tokio::select! { _ = cancel.cancelled() => break, result = listener.connect() => result };
                if connected.is_err() {
                    break;
                }
                // Create the next pipe instance before handing the connected one to the client task.
                let next = match tokio::net::windows::named_pipe::ServerOptions::new()
                    .reject_remote_clients(true)
                    .create(&endpoint)
                {
                    Ok(next) => next,
                    Err(_) => break,
                };
                std::mem::replace(&mut listener, next)
            };
            #[cfg(unix)]
            let stream = match tokio::select! { _ = cancel.cancelled() => break, result = listener.accept() => result }
            {
                Ok((stream, _)) => stream,
                Err(_) => break,
            };
            let Ok(permit) = connections.clone().try_acquire_owned() else {
                continue;
            };
            let inner = inner.clone();
            let app = app.clone();
            let token = manifest.token.clone();
            let cancel = cancel.clone();
            tauri::async_runtime::spawn(async move {
                let _permit = permit;
                tokio::select! {
                    _ = cancel.cancelled() => {},
                    _ = tokio::time::timeout(Duration::from_secs(17), serve(stream, inner, app, token)) => {},
                }
            });
        }
        // A stale listener task must never stop a newer session.
        let owns = inner
            .running
            .lock()
            .unwrap()
            .as_ref()
            .is_some_and(|r| r.manifest.token == manifest.token);
        if owns {
            inner.stop();
            let _ = app.emit("agent-control:status", inner.status());
        }
    });
    Ok(())
}
async fn serve<S: AsyncRead + AsyncWrite + Unpin>(
    stream: S,
    inner: Arc<Inner>,
    app: tauri::AppHandle,
    token: String,
) {
    let mut stream = BufReader::new(stream);
    let mut bytes = Vec::new();
    // fill_buf bounds allocation even if a client sends a huge frame without a newline.
    let reply = loop {
        let Ok(chunk) = stream.fill_buf().await else {
            return;
        };
        if chunk.is_empty() {
            return;
        }
        let len = chunk
            .iter()
            .position(|b| *b == b'\n')
            .map(|n| n + 1)
            .unwrap_or(chunk.len());
        if bytes.len() + len > MAX_REQUEST {
            break failure("REQUEST_TOO_LARGE", "指令超过容量限制。");
        }
        let done = chunk[len - 1] == b'\n';
        bytes.extend_from_slice(&chunk[..len]);
        stream.consume(len);
        if done {
            break match serde_json::from_slice::<Request>(&bytes) {
                Ok(request) => dispatch(&inner, &app, &token, request).await,
                Err(_) => failure("INVALID_REQUEST", "指令格式无效。"),
            };
        }
    };
    let mut text = serde_json::to_vec(&reply).unwrap_or_default();
    if text.len() > MAX_REPLY {
        text = serde_json::to_vec(&failure(
            "REPLY_TOO_LARGE",
            "回复超过容量限制，请缩小观察范围。",
        ))
        .unwrap_or_default();
    }
    text.push(b'\n');
    let _ = stream.get_mut().write_all(&text).await;
    let _ = stream.get_mut().shutdown().await;
}
async fn dispatch(
    inner: &Arc<Inner>,
    app: &tauri::AppHandle,
    token: &str,
    request: Request,
) -> Value {
    let valid = inner
        .running
        .lock()
        .unwrap()
        .as_ref()
        .is_some_and(|r| r.manifest.token == token && request.token == token);
    if !valid {
        return failure("CONTROL_UNAVAILABLE", "调试接管已关闭或连接信息已过期。");
    }
    if !request.command["op"].is_string() {
        return failure("INVALID_REQUEST", "缺少 command.op。");
    }
    if request.command["op"] == "windows" {
        let ready = inner.ready.lock().unwrap();
        return json!({"ok":true,"result":app.webview_windows().keys().map(|label| json!({"label":label,"ready":ready.contains(label)})).collect::<Vec<_>>()});
    }
    let window = request.window.unwrap_or_else(|| "main".into());
    if app.get_webview_window(&window).is_none() || !inner.ready.lock().unwrap().contains(&window) {
        return failure(
            "WINDOW_NOT_READY",
            "目标窗口尚未就绪，请使用 windows 查看窗口。",
        );
    }
    let Ok(_permit) = inner.busy.try_acquire() else {
        return failure("CONTROL_BUSY", "上一条指令仍在执行，请稍后重试。");
    };
    let id = uuid::Uuid::new_v4().to_string();
    let (sender, receiver) = oneshot::channel();
    inner.pending.lock().unwrap().insert(
        id.clone(),
        Pending {
            window: window.clone(),
            reply: sender,
        },
    );
    let expires = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        + 14500;
    if app
        .emit_to(
            &window,
            "agent-control:request",
            json!({"id":id,"command":request.command,"expiresAt":expires}),
        )
        .is_err()
    {
        inner.pending.lock().unwrap().remove(&id);
        return failure("WINDOW_NOT_READY", "目标窗口已关闭。");
    }
    let result = match tokio::time::timeout(Duration::from_secs(15), receiver).await {
        Ok(Ok(reply)) => reply,
        Ok(Err(_)) => failure("CONTROL_DISABLED", "调试接管已关闭。"),
        Err(_) => failure(
            "COMMAND_TIMEOUT",
            "指令超时；请先观察当前状态，避免重复执行。",
        ),
    };
    inner.pending.lock().unwrap().remove(&id);
    result
}
#[tauri::command]
pub fn agent_control_status(state: tauri::State<AgentControlState>) -> ControlStatus {
    state.0.status()
}
#[tauri::command]
pub fn agent_control_ready(
    window: tauri::WebviewWindow,
    state: tauri::State<AgentControlState>,
) -> ControlStatus {
    state.0.ready.lock().unwrap().insert(window.label().into());
    state.0.status()
}
#[tauri::command]
pub fn agent_control_reply(
    window: tauri::WebviewWindow,
    state: tauri::State<AgentControlState>,
    id: String,
    reply: Value,
) {
    let mut pending = state.0.pending.lock().unwrap();
    if pending.get(&id).is_some_and(|p| p.window == window.label()) {
        if let Some(p) = pending.remove(&id) {
            let _ = p.reply.send(reply);
        }
    }
}
#[tauri::command]
pub async fn agent_control_configure(
    app: tauri::AppHandle,
    state: tauri::State<'_, AgentControlState>,
    enabled: bool,
) -> Result<ControlStatus, String> {
    let inner = &state.0;
    let _guard = inner.changing.lock().await;
    if enabled {
        start(inner, &app).await?;
    } else {
        inner.stop();
    }
    let saved = private_write(
        &inner.data_dir.join("control-settings.json"),
        &serde_json::to_vec(&json!({"enabled":enabled})).map_err(|e| e.to_string())?,
    );
    if saved.is_err() && enabled {
        inner.stop();
    }
    let _ = app.emit("agent-control:status", inner.status());
    saved?;
    Ok(inner.status())
}

/// Remove live descriptors and cancel the listener during a normal application exit.
pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("agent-control")
        .on_event(|app, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                if let Some(state) = app.try_state::<AgentControlState>() {
                    state.0.stop();
                }
            }
        })
        .build()
}
