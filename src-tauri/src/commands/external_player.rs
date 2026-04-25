#[cfg(windows)]
use reqwest;
#[cfg(windows)]
use serde::Serialize;
#[cfg(windows)]
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};
#[cfg(windows)]
use windows::Win32::{
    Foundation::{BOOL, HWND, LPARAM, POINT, RECT},
    Graphics::Gdi::{
        ClientToScreen, GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    },
    UI::{
        HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI},
        WindowsAndMessaging::{
            EnumWindows, GetClassNameW, GetClientRect, GetWindowTextLengthW, GetWindowTextW,
            IsWindow, IsWindowVisible, SetWindowPos, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE,
        },
    },
};

#[cfg(windows)]
const OVERLAY_WINDOW_LABEL: &str = "danmaku-overlay";

#[cfg(windows)]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerWindowInfo {
    pub hwnd: i64,
    pub title: String,
    pub class_name: String,
    pub is_visible: bool,
}

#[cfg(windows)]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowRect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub is_fullscreen: bool,
}

#[cfg(windows)]
struct EnumWindowsContext {
    target_class_names: Vec<String>,
    match_all: bool,
    windows: Vec<PlayerWindowInfo>,
}

#[cfg(windows)]
fn hwnd_from_i64(hwnd: i64) -> HWND {
    HWND(hwnd as isize as *mut std::ffi::c_void)
}

#[cfg(windows)]
fn hwnd_to_i64(hwnd: HWND) -> i64 {
    hwnd.0 as isize as i64
}

#[cfg(windows)]
fn utf16_buffer_to_string(buffer: &[u16], length: usize) -> String {
    String::from_utf16_lossy(&buffer[..length])
}

#[cfg(windows)]
fn get_window_class_name(hwnd: HWND) -> String {
    let mut buffer = [0u16; 256];
    let length = unsafe { GetClassNameW(hwnd, &mut buffer) };

    if length <= 0 {
        String::new()
    } else {
        utf16_buffer_to_string(&buffer, length as usize)
    }
}

#[cfg(windows)]
fn get_window_title(hwnd: HWND) -> String {
    let length = unsafe { GetWindowTextLengthW(hwnd) };

    if length <= 0 {
        return String::new();
    }

    let mut buffer = vec![0u16; (length + 1) as usize];
    let copied = unsafe { GetWindowTextW(hwnd, &mut buffer) };

    if copied <= 0 {
        String::new()
    } else {
        utf16_buffer_to_string(&buffer, copied as usize)
    }
}

#[cfg(windows)]
unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let context = &mut *(lparam.0 as *mut EnumWindowsContext);

    // 只处理可见窗口
    if !IsWindowVisible(hwnd).as_bool() {
        return BOOL(1);
    }

    let class_name = get_window_class_name(hwnd);
    let title = get_window_title(hwnd);

    // 标题和类名都为空则跳过
    if title.is_empty() && class_name.is_empty() {
        return BOOL(1);
    }

    let is_match = if !context.match_all {
        context
            .target_class_names
            .iter()
            .any(|target| class_name.to_lowercase() == target.to_lowercase())
    } else {
        // 全量扫描模式：只返回有标题的可见窗口，过滤掉一些系统窗口
        !title.is_empty()
            && class_name != "Progman"
            && class_name != "Shell_TrayWnd"
            && class_name != "Windows.UI.Core.CoreWindow"
    };

    if is_match {
        context.windows.push(PlayerWindowInfo {
            hwnd: hwnd_to_i64(hwnd),
            title,
            class_name,
            is_visible: true,
        });
    }

    BOOL(1)
}

#[cfg(windows)]
fn ensure_valid_window(hwnd: HWND) -> Result<(), String> {
    let valid = unsafe { IsWindow(hwnd).as_bool() };

    if valid {
        Ok(())
    } else {
        Err(format!("窗口句柄无效: {}", hwnd_to_i64(hwnd)))
    }
}

#[cfg(windows)]
fn rect_width(rect: &RECT) -> i32 {
    rect.right - rect.left
}

#[cfg(windows)]
fn rect_height(rect: &RECT) -> i32 {
    rect.bottom - rect.top
}

#[cfg(windows)]
fn get_monitor_scale_factor(hwnd: HWND) -> Result<f64, String> {
    let monitor = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) };

    if monitor.0.is_null() {
        return Ok(1.0);
    }

    let mut dpi_x = 96u32;
    let mut dpi_y = 96u32;

    unsafe {
        GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y)
            .map_err(|e| format!("获取显示器 DPI 失败: {}", e))?;
    }

    Ok(dpi_x as f64 / 96.0)
}

#[cfg(windows)]
fn get_monitor_rect(hwnd: HWND) -> Result<RECT, String> {
    let monitor = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) };

    if monitor.0.is_null() {
        return Err("无法获取窗口所在显示器".to_string());
    }

    let mut monitor_info = MONITORINFO {
        cbSize: std::mem::size_of::<MONITORINFO>() as u32,
        rcMonitor: RECT::default(),
        rcWork: RECT::default(),
        dwFlags: 0,
    };

    let ok = unsafe { GetMonitorInfoW(monitor, &mut monitor_info).as_bool() };

    if ok {
        Ok(monitor_info.rcMonitor)
    } else {
        Err("获取显示器信息失败".to_string())
    }
}

#[cfg(windows)]
fn get_player_window_rect_internal(hwnd: HWND) -> Result<WindowRect, String> {
    ensure_valid_window(hwnd)?;

    let mut client_rect = RECT::default();
    unsafe { GetClientRect(hwnd, &mut client_rect) }
        .map_err(|e| format!("获取窗口客户区失败: {}", e))?;

    let width = rect_width(&client_rect).max(0) as u32;
    let height = rect_height(&client_rect).max(0) as u32;

    let mut top_left = POINT { x: 0, y: 0 };
    let ok = unsafe { ClientToScreen(hwnd, &mut top_left).as_bool() };

    if !ok {
        return Err(format!("客户区坐标转换失败: {}", hwnd_to_i64(hwnd)));
    }

    let scale_factor = get_monitor_scale_factor(hwnd)?;
    let monitor_rect = get_monitor_rect(hwnd)?;

    let is_fullscreen = top_left.x <= monitor_rect.left
        && top_left.y <= monitor_rect.top
        && top_left.x + width as i32 >= monitor_rect.right
        && top_left.y + height as i32 >= monitor_rect.bottom;

    Ok(WindowRect {
        x: top_left.x,
        y: top_left.y,
        width,
        height,
        scale_factor,
        is_fullscreen,
    })
}

#[cfg(windows)]
fn overlay_url() -> WebviewUrl {
    // WebviewUrl::App 在 dev 模式下自动映射到 devUrl（Tauri 内置代理），
    // 在 release 模式下映射到 dist 目录，无需手动区分构建类型。
    // 切勿使用 WebviewUrl::External + localhost，那会让 overlay 窗口以独立
    // HTTP 客户端身份访问 Vite dev server，导致 ERR_CONNECTION_REFUSED。
    WebviewUrl::App("danmaku-overlay.html".into())
}

/// 遍历所有顶层窗口，查找指定 Win32 class name 的播放器窗口。
/// 若 class_name 为 None 或空字符串，则返回所有可见的顶层窗口。
#[cfg(windows)]
#[tauri::command]
pub fn find_player_windows(
    class_names: Option<Vec<String>>,
) -> Result<Vec<PlayerWindowInfo>, String> {
    let (target_names, match_all) = match class_names {
        Some(names) if !names.is_empty() => (names, false),
        _ => (Vec::new(), true),
    };

    log::info!(
        "[EXTERNAL_PLAYER] 开始查找播放器窗口: match_all={}, targets={:?}",
        match_all,
        target_names
    );

    let mut context = EnumWindowsContext {
        target_class_names: target_names,
        match_all,
        windows: Vec::new(),
    };

    unsafe {
        EnumWindows(
            Some(enum_windows_proc),
            LPARAM(&mut context as *mut EnumWindowsContext as isize),
        )
    }
    .map_err(|e| format!("枚举顶层窗口失败: {}", e))?;

    log::info!(
        "[EXTERNAL_PLAYER] 找到 {} 个匹配的播放器窗口",
        context.windows.len()
    );

    Ok(context.windows)
}

/// 获取播放器窗口客户区在屏幕上的物理像素矩形，并附带所在显示器缩放比例。
#[cfg(windows)]
#[tauri::command]
pub fn get_player_window_rect(hwnd: i64) -> Result<WindowRect, String> {
    get_player_window_rect_internal(hwnd_from_i64(hwnd))
}

/// 检查 Win32 窗口句柄是否仍然有效。
#[cfg(windows)]
#[tauri::command]
pub fn is_window_valid(hwnd: i64) -> bool {
    unsafe { IsWindow(hwnd_from_i64(hwnd)).as_bool() }
}

/// 创建或复用透明弹幕覆盖窗口，并将其初始位置同步到目标播放器客户区。
#[cfg(windows)]
#[tauri::command]
pub async fn create_danmaku_overlay_window(
    app: AppHandle,
    target_hwnd: i64,
) -> Result<String, String> {
    let target = hwnd_from_i64(target_hwnd);
    let rect = get_player_window_rect_internal(target)?;

    let logical_x = rect.x as f64 / rect.scale_factor;
    let logical_y = rect.y as f64 / rect.scale_factor;
    let logical_width = rect.width as f64 / rect.scale_factor;
    let logical_height = rect.height as f64 / rect.scale_factor;

    if let Some(existing_window) = app.get_webview_window(OVERLAY_WINDOW_LABEL) {
        log::info!("[EXTERNAL_PLAYER] 复用已有弹幕覆盖窗口");

        existing_window
            .set_ignore_cursor_events(true)
            .map_err(|e| e.to_string())?;
        existing_window
            .set_position(LogicalPosition::new(logical_x, logical_y))
            .map_err(|e| e.to_string())?;
        existing_window
            .set_size(LogicalSize::new(logical_width, logical_height))
            .map_err(|e| e.to_string())?;
        existing_window.show().map_err(|e| e.to_string())?;

        return Ok(OVERLAY_WINDOW_LABEL.to_string());
    }

    let url = overlay_url();

    log::info!(
        "[EXTERNAL_PLAYER] 创建弹幕覆盖窗口，目标 HWND: {}, rect: {}x{} @ ({}, {}), scale: {}",
        target_hwnd,
        rect.width,
        rect.height,
        rect.x,
        rect.y,
        rect.scale_factor
    );

    let window = WebviewWindowBuilder::new(&app, OVERLAY_WINDOW_LABEL, url)
        .title("Danmaku Overlay")
        .inner_size(logical_width, logical_height)
        .position(logical_x, logical_y)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;

    window
        .set_ignore_cursor_events(true)
        .map_err(|e| e.to_string())?;
    window
        .set_position(LogicalPosition::new(logical_x, logical_y))
        .map_err(|e| e.to_string())?;
    window
        .set_size(LogicalSize::new(logical_width, logical_height))
        .map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;

    // 初始强制提升层级
    let _ = bring_danmaku_overlay_to_top(app);

    Ok(OVERLAY_WINDOW_LABEL.to_string())
}

/// 强制将弹幕覆盖窗口提升到系统最顶层 (HWND_TOPMOST)。
/// 用于解决播放器全屏时普通 always_on_top 窗口可能被遮挡的问题。
#[cfg(windows)]
#[tauri::command]
pub fn bring_danmaku_overlay_to_top(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(OVERLAY_WINDOW_LABEL) {
        // 获取原生窗口句柄
        if let Ok(hwnd_ptr) = window.hwnd() {
            let hwnd = HWND(hwnd_ptr.0 as *mut _);
            unsafe {
                // 使用 SetWindowPos 强制设置 HWND_TOPMOST
                // SWP_NOMOVE | SWP_NOSIZE 表示不改变位置和大小
                let _ = SetWindowPos(
                    hwnd,
                    HWND_TOPMOST,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE,
                );
            }
            log::debug!("[EXTERNAL_PLAYER] 已通过 Win32 API 强制提升覆盖层窗口层级");
        }
    }
    Ok(())
}

/// MPC-BE 播放状态（对应前端 MpcBeStatus 类型）
#[cfg(windows)]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MpcBeStatusResult {
    pub file: String,
    pub state: String,
    pub position: u64,
    pub duration: u64,
    pub volume_level: u32,
}

/// 通过 Rust 后端代理请求 MPC-BE Web 接口，规避 Tauri CSP scope 限制。
///
/// MPC-BE `/variables.html` 返回 HTML，各字段通过 `<p id="KEY">VALUE</p>` 承载：
/// - file        : 文件名
/// - state       : 播放状态码 (0=Stopped, 1=Paused, 2=Playing)
/// - position    : 播放位置 (ms)
/// - duration    : 总时长 (ms)
/// - volumelevel : 音量 (0-100)
///
/// 使用按 id 提取值的方式，完全不依赖行序，健壮且版本无关。
// 复用同一个 reqwest Client（内置连接池），避免每次轮询都重新建立 TCP 握手。
#[cfg(windows)]
static MPC_BE_HTTP_CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();

#[cfg(windows)]
fn get_mpc_be_client() -> &'static reqwest::Client {
    MPC_BE_HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(2))
            .build()
            .expect("构建 MPC-BE HTTP 客户端失败")
    })
}

/// 从 MPC-BE HTML 响应中提取指定 `<p id="KEY">VALUE</p>` 的 VALUE 部分。
#[cfg(windows)]
fn extract_mpc_field<'a>(html: &'a str, id: &str) -> Option<&'a str> {
    let open = format!("<p id=\"{}\">", id);
    let start = html.find(open.as_str())? + open.len();
    let end = start + html[start..].find("</p>")?;
    Some(html[start..end].trim())
}

#[cfg(windows)]
#[tauri::command]
pub async fn get_mpc_be_status(port: u16) -> Result<Option<MpcBeStatusResult>, String> {
    let url = format!("http://localhost:{}/variables.html", port);
    let client = get_mpc_be_client();

    let response = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => {
            // 连接失败（MPC-BE 未运行等）视为正常情况，返回 None
            log::debug!("[EXTERNAL_PLAYER] MPC-BE 连接失败 (port={}): {}", port, e);
            return Ok(None);
        }
    };

    if !response.status().is_success() {
        log::debug!(
            "[EXTERNAL_PLAYER] MPC-BE 返回非 2xx 状态 (port={}): {}",
            port,
            response.status()
        );
        return Ok(None);
    }

    let html = response
        .text()
        .await
        .map_err(|e| format!("读取 MPC-BE 响应体失败: {}", e))?;

    // 提取各字段；任何必填字段缺失都视为响应格式异常
    let file = match extract_mpc_field(&html, "file") {
        Some(v) => v.to_string(),
        None => {
            log::warn!("[EXTERNAL_PLAYER] MPC-BE 响应缺少 'file' 字段 (port={})", port);
            return Ok(None);
        }
    };

    let state_code: u32 = extract_mpc_field(&html, "state")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

    let position: u64 = extract_mpc_field(&html, "position")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

    let duration: u64 = extract_mpc_field(&html, "duration")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

    let volume_level: u32 = extract_mpc_field(&html, "volumelevel")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

    let state = match state_code {
        2 => "Playing",
        1 => "Paused",
        _ => "Stopped",
    }
    .to_string();

    log::debug!(
        "[EXTERNAL_PLAYER] MPC-BE 状态 (port={}) file={:?} state={} pos={}ms dur={}ms vol={}",
        port, file, state, position, duration, volume_level
    );

    Ok(Some(MpcBeStatusResult {
        file,
        state,
        position,
        duration,
        volume_level,
    }))
}

/// 关闭透明弹幕覆盖窗口。
#[cfg(windows)]
#[tauri::command]
pub fn close_danmaku_overlay_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(OVERLAY_WINDOW_LABEL) {
        log::info!("[EXTERNAL_PLAYER] 关闭弹幕覆盖窗口");
        window.close().map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// 设置透明弹幕覆盖窗口是否忽略鼠标事件。
#[cfg(windows)]
#[tauri::command]
pub fn set_danmaku_overlay_ignore_cursor(app: AppHandle, ignore: bool) -> Result<(), String> {
    let window = app
        .get_webview_window(OVERLAY_WINDOW_LABEL)
        .ok_or_else(|| "弹幕覆盖窗口不存在".to_string())?;

    window
        .set_ignore_cursor_events(ignore)
        .map_err(|e| e.to_string())?;

    log::info!("[EXTERNAL_PLAYER] 设置弹幕覆盖窗口鼠标穿透: {}", ignore);
    Ok(())
}
