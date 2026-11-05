// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

//! Windows 窗口自动化共享核心，供 Tauri 与隔离的 Electron 原生工作进程使用。
//
// 实现 ImplementationPlan.md 中描述的命令集：
//   wa_get_windows / wa_get_pixel / wa_capture_window / wa_send_click
//   wa_send_keypress / wa_get_client_rect / wa_is_window_valid / wa_get_self_pid
//
// 本模块仅在 Windows 编译，两个宿主入口分别提供 cfg 守卫。

use scopeguard::defer;
use std::sync::Mutex;
use windows::Win32::UI::HiDpi::{
    SetThreadDpiAwarenessContext, DPI_AWARENESS_CONTEXT, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
};

// Foreground injection changes global focus/cursor; keep complete actions indivisible.
static INPUT_LOCK: Mutex<()> = Mutex::new(());
struct PhysicalDpi(DPI_AWARENESS_CONTEXT);
impl PhysicalDpi {
    fn enter() -> Result<Self, String> {
        let previous =
            unsafe { SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) };
        if previous.0.is_null() {
            return Err("切换物理像素坐标环境失败".into());
        }
        Ok(Self(previous))
    }
}
impl Drop for PhysicalDpi {
    fn drop(&mut self) {
        unsafe {
            SetThreadDpiAwarenessContext(self.0);
        }
    }
}
fn validate_dimensions(width: i32, height: i32) -> Result<(), String> {
    if width <= 0
        || height <= 0
        || width > 32768
        || height > 32768
        || i64::from(width) * i64::from(height) > 64 * 1024 * 1024
    {
        return Err("窗口客户区尺寸无效或过大，请调整窗口后重试".into());
    }
    Ok(())
}
use serde::{Deserialize, Serialize};
use std::ffi::c_void;
use std::mem::size_of;
use windows::core::PWSTR;
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    BitBlt, ClientToScreen, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject,
    GetDC, GetDIBits, GetPixel, ScreenToClient, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
    CLR_INVALID, HGDIOBJ, SRCCOPY,
};
use windows::Win32::Storage::Xps::{PrintWindow, PRINT_WINDOW_FLAGS};
use windows::Win32::System::Threading::{
    AttachThreadInput, GetCurrentThreadId, OpenProcess, QueryFullProcessImageNameW,
    PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    IsWindowEnabled, MapVirtualKeyW, SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE,
    KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, MAPVK_VK_TO_VSC,
    MOUSEEVENTF_ABSOLUTE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_MIDDLEDOWN,
    MOUSEEVENTF_MIDDLEUP, MOUSEEVENTF_MOVE, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP,
    MOUSEEVENTF_VIRTUALDESK, MOUSEINPUT,
};
use windows::Win32::UI::WindowsAndMessaging::{
    ChildWindowFromPointEx,
    EnumWindows,
    GetClassNameW,
    GetClientRect,
    GetCursorPos,
    GetForegroundWindow,
    GetSystemMetrics,
    GetWindowTextLengthW,
    GetWindowTextW,
    GetWindowThreadProcessId,
    IsIconic,
    IsWindow,
    IsWindowVisible,
    PostMessageW, // MK_LBUTTON/MK_MBUTTON/MK_RBUTTON in Input::KeyboardAndMouse
    SetCursorPos,
    SetForegroundWindow,
    ShowWindow,
    CWP_SKIPINVISIBLE,
    CWP_SKIPTRANSPARENT,
    SM_CXVIRTUALSCREEN,
    SM_CYVIRTUALSCREEN,
    SM_XVIRTUALSCREEN,
    SM_YVIRTUALSCREEN,
    SW_RESTORE,
    WM_KEYDOWN,
    WM_KEYUP,
    WM_LBUTTONDOWN,
    WM_LBUTTONUP,
    WM_MBUTTONDOWN,
    WM_MBUTTONUP,
    WM_MOUSEMOVE,
    WM_RBUTTONDOWN,
    WM_RBUTTONUP,
};

// =============================================================================
// 公共类型
// =============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaWindowInfo {
    pub hwnd: i64,
    pub title: String,
    pub class_name: String,
    pub process_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaClientRect {
    pub width: i32,
    pub height: i32,
}

/// 后台点击的诊断返回：消息实际投递到的窗口（可能是坐标命中的子窗口，而非绑定的顶层窗口）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaClickResult {
    /// 实际使用的点击模式（background = 窗口消息 / foreground = SendInput 真实输入）
    pub mode: String,
    pub target_hwnd: i64,
    pub target_class: String,
    pub target_title: String,
}

// =============================================================================
// 辅助函数
// =============================================================================

fn hwnd_from_i64(hwnd: i64) -> HWND {
    HWND(hwnd as isize as *mut c_void)
}

fn hwnd_to_i64(hwnd: HWND) -> i64 {
    hwnd.0 as isize as i64
}

fn utf16_buffer_to_string(buffer: &[u16]) -> String {
    let len = buffer.iter().position(|c| *c == 0).unwrap_or(buffer.len());
    String::from_utf16_lossy(&buffer[..len])
}

fn get_window_class_name(hwnd: HWND) -> String {
    let mut buffer = [0u16; 256];
    let length = unsafe { GetClassNameW(hwnd, &mut buffer) };
    if length <= 0 {
        return String::new();
    }
    utf16_buffer_to_string(&buffer)
}

fn get_window_title(hwnd: HWND) -> String {
    let length = unsafe { GetWindowTextLengthW(hwnd) };
    if length <= 0 {
        return String::new();
    }
    let mut buffer = vec![0u16; (length + 1) as usize];
    let copied = unsafe { GetWindowTextW(hwnd, &mut buffer) };
    if copied <= 0 {
        return String::new();
    }
    utf16_buffer_to_string(&buffer)
}

fn get_process_name(hwnd: HWND) -> String {
    let mut pid: u32 = 0;
    unsafe {
        GetWindowThreadProcessId(hwnd, Some(&mut pid as *mut u32));
    }
    if pid == 0 {
        return String::new();
    }
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) };
    let Ok(handle) = handle else {
        return String::new();
    };
    // OpenProcess 句柄需要显式关闭，scopeguard 关闭避免泄漏
    defer!({
        unsafe {
            let _ = windows::Win32::Foundation::CloseHandle(handle);
        }
    });
    let mut buffer = [0u16; 512];
    let mut size = buffer.len() as u32;
    let ok = unsafe {
        QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(buffer.as_mut_ptr()),
            &mut size as *mut u32,
        )
    };
    if ok.is_err() || size == 0 {
        return String::new();
    }
    let full_path = utf16_buffer_to_string(&buffer);
    std::path::Path::new(&full_path)
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string())
        .unwrap_or(full_path)
}

fn get_self_pid() -> u32 {
    std::process::id()
}

fn lparam_from_xy(x: i32, y: i32) -> LPARAM {
    // 标准 MAKELPARAM: ((y << 16) | (x & 0xFFFF))
    LPARAM(((y as u32) << 16 | (x as u32 & 0xFFFF)) as isize)
}

fn ensure_valid_window(hwnd: HWND) -> Result<(), String> {
    let valid = unsafe { IsWindow(hwnd).as_bool() };
    if valid {
        Ok(())
    } else {
        Err(format!("窗口句柄无效: {}", hwnd_to_i64(hwnd)))
    }
}

/// 沿客户区坐标向下命中测试，返回实际接收鼠标消息的窗口及其客户区坐标。
///
/// 真实鼠标点击由系统路由到坐标处的子窗口（按钮、编辑框、网页子 HWND 等），
/// 合成消息也必须发给该子窗口；发给顶层窗口通常无人处理。
/// `ChildWindowFromPointEx` 只查直接子级，因此递归下钻，
/// 跳过不可见与透明窗口（它们不接收真实点击）。
fn hit_test_child_window(top: HWND, x: i32, y: i32) -> (HWND, POINT) {
    let mut cur = top;
    let mut pt = POINT { x, y };
    for _ in 0..64 {
        let child =
            unsafe { ChildWindowFromPointEx(cur, pt, CWP_SKIPINVISIBLE | CWP_SKIPTRANSPARENT) };
        // 无子窗口命中时返回父窗口自身；点落到客户区外时返回 NULL
        if child.is_invalid() || child == cur {
            return (cur, pt);
        }
        // 把坐标从当前窗口客户区转换到子窗口客户区
        let converted = unsafe {
            ClientToScreen(cur, &mut pt).as_bool() && ScreenToClient(child, &mut pt).as_bool()
        };
        if !converted {
            return (child, pt);
        }
        cur = child;
    }
    (cur, pt)
}

// =============================================================================
// 前台模拟（SendInput）：生成真实系统输入，对 raw input / DirectInput 游戏同样生效
// =============================================================================

/// 把目标窗口临时切换到前台。
///
/// 非前台进程直接调用 SetForegroundWindow 会被系统拒绝，
/// 因此先用 AttachThreadInput 借用当前前台线程的输入队列权限。
/// 返回切换前的前台窗口，供 `restore_foreground` 恢复。
fn acquire_foreground(hwnd: HWND) -> Result<HWND, String> {
    unsafe {
        if IsIconic(hwnd).as_bool() {
            let _ = ShowWindow(hwnd, SW_RESTORE);
        }
        let prev = GetForegroundWindow();
        if prev == hwnd {
            return Ok(prev);
        }
        let prev_thread = if prev.is_invalid() {
            0
        } else {
            GetWindowThreadProcessId(prev, None)
        };
        let cur_thread = GetCurrentThreadId();
        let attached = prev_thread != 0 && prev_thread != cur_thread;
        if attached {
            let _ = AttachThreadInput(cur_thread, prev_thread, true);
        }
        let ok = SetForegroundWindow(hwnd).as_bool();
        if attached {
            let _ = AttachThreadInput(cur_thread, prev_thread, false);
        }
        if !ok {
            return Err(
                "无法将目标窗口切换到前台（可能被系统前台锁定策略或安全软件拦截）".to_string(),
            );
        }
        // 等待目标真正成为前台窗口（游戏窗口激活/恢复渲染需要时间），最多 500ms
        let deadline = std::time::Instant::now() + std::time::Duration::from_millis(500);
        while std::time::Instant::now() < deadline {
            if GetForegroundWindow() == hwnd {
                return Ok(prev);
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        Err("目标窗口未能在 500ms 内完成前台切换，请确认窗口未被全屏独占".to_string())
    }
}

// SendInput queues input asynchronously. Keep the target active across activation and
// dispatch, before the RAII guard restores the previous window/cursor.
fn settle_foreground_input() {
    std::thread::sleep(std::time::Duration::from_millis(50));
}

/// 恢复前台窗口与光标位置，减少前台模拟对用户的干扰。
fn restore_foreground(prev: HWND, prev_cursor: POINT) {
    unsafe {
        let _ = SetCursorPos(prev_cursor.x, prev_cursor.y);
        if !prev.is_invalid() {
            let _ = SetForegroundWindow(prev);
        }
    }
}

/// 方向键/翻页/编辑键等注入时必须携带扩展键标志，否则收到的 VK 码不对。
fn is_extended_vk(vk: u16) -> bool {
    matches!(vk, 0x21..=0x28 | 0x2D | 0x2E | 0x5B..=0x5D)
}

/// 用 SendInput 注入一次鼠标点击：光标移动到屏幕绝对坐标 -> 按下 -> 抬起。
/// 坐标按虚拟桌面矩形归一化到 0~65535，多屏环境同样正确。
fn send_input_click(pt_screen: POINT, button: &str) -> Result<(), String> {
    let (down_flag, up_flag) = match button {
        "left" => (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
        "right" => (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
        "middle" => (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
        other => return Err(format!("不支持的鼠标按键: {other}")),
    };
    unsafe {
        let vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
        let vw = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        let vh = GetSystemMetrics(SM_CYVIRTUALSCREEN);
        if vw <= 0 || vh <= 0 {
            return Err("获取虚拟桌面尺寸失败".to_string());
        }
        let nx = (((pt_screen.x - vx) as f64 / vw as f64) * 65535.0).round() as i32;
        let ny = (((pt_screen.y - vy) as f64 / vh as f64) * 65535.0).round() as i32;
        let click_input =
            |dw_flags: windows::Win32::UI::Input::KeyboardAndMouse::MOUSE_EVENT_FLAGS,
             dx: i32,
             dy: i32| INPUT {
                r#type: INPUT_MOUSE,
                Anonymous: INPUT_0 {
                    mi: MOUSEINPUT {
                        dx,
                        dy,
                        mouseData: 0,
                        dwFlags: dw_flags,
                        time: 0,
                        dwExtraInfo: 0,
                    },
                },
            };
        let inputs = [
            click_input(
                MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK,
                nx,
                ny,
            ),
            click_input(down_flag, 0, 0),
            click_input(up_flag, 0, 0),
        ];
        let sent = SendInput(&inputs, size_of::<INPUT>() as i32);
        if sent != inputs.len() as u32 {
            return Err(format!(
                "SendInput 注入失败（{sent}/{}），可能被安全软件拦截",
                inputs.len()
            ));
        }
    }
    Ok(())
}

/// 用 SendInput 注入一次按键（VK + scan code，兼容读扫描码的输入框架）。
fn send_input_key(vk: u16, is_down: bool) -> Result<(), String> {
    let scan = unsafe { MapVirtualKeyW(vk as u32, MAPVK_VK_TO_VSC) } as u16;
    let base_flags = if is_down {
        KEYBD_EVENT_FLAGS(0)
    } else {
        KEYEVENTF_KEYUP
    };
    let dw_flags = if is_extended_vk(vk) {
        base_flags | KEYEVENTF_EXTENDEDKEY
    } else {
        base_flags
    };
    let input = INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY(vk),
                wScan: scan,
                dwFlags: dw_flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    };
    unsafe {
        let sent = SendInput(&[input], size_of::<INPUT>() as i32);
        if sent != 1 {
            return Err(format!(
                "SendInput 按键注入失败 (vk 0x{vk:02X})，可能被安全软件拦截"
            ));
        }
    }
    Ok(())
}

// =============================================================================
// 枚举窗口回调
// =============================================================================

struct EnumAllContext {
    exclude_self_pid: bool,
    self_pid: u32,
    result: Vec<WaWindowInfo>,
}

unsafe extern "system" fn enum_all_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let ctx = &mut *(lparam.0 as *mut EnumAllContext);
    if !IsWindowVisible(hwnd).as_bool() {
        return BOOL(1);
    }
    let title = get_window_title(hwnd);
    let class_name = get_window_class_name(hwnd);
    if title.is_empty() && class_name.is_empty() {
        return BOOL(1);
    }
    if matches!(
        class_name.as_str(),
        "Progman" | "Shell_TrayWnd" | "Windows.UI.Core.CoreWindow" | "TaskbarWindow"
    ) {
        return BOOL(1);
    }
    if ctx.exclude_self_pid {
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid as *mut u32));
        if pid == ctx.self_pid {
            return BOOL(1);
        }
    }
    ctx.result.push(WaWindowInfo {
        hwnd: hwnd_to_i64(hwnd),
        title,
        class_name,
        process_name: get_process_name(hwnd),
    });
    BOOL(1)
}

// =============================================================================
// Tauri Commands
// =============================================================================

/// 列出所有可见顶层窗口（默认排除自身进程）。
pub fn wa_get_windows(
    exclude_self: Option<bool>,
    self_pid: u32,
) -> Result<Vec<WaWindowInfo>, String> {
    let mut ctx = EnumAllContext {
        exclude_self_pid: exclude_self.unwrap_or(true),
        self_pid,
        result: Vec::new(),
    };
    unsafe {
        EnumWindows(
            Some(enum_all_windows_proc),
            LPARAM(&mut ctx as *mut EnumAllContext as isize),
        )
    }
    .map_err(|e| format!("枚举窗口失败: {}", e))?;
    Ok(ctx.result)
}

/// 返回当前 AIO Hub 进程 ID，供窗口绑定和原生测试精确限定实例。
pub fn wa_get_self_pid() -> u32 {
    get_self_pid()
}

/// 后台取色：使用窗口 DC 的 GetPixel。
pub fn wa_get_pixel(hwnd: i64, x: i32, y: i32) -> Result<[u8; 3], String> {
    let _dpi = PhysicalDpi::enter()?;
    let h = hwnd_from_i64(hwnd);
    ensure_valid_window(h)?;
    let hdc = unsafe { GetDC(h) };
    if hdc.is_invalid() {
        return Err("获取窗口 DC 失败".to_string());
    }
    defer!(unsafe {
        windows::Win32::Graphics::Gdi::ReleaseDC(h, hdc);
    });
    let color = unsafe { GetPixel(hdc, x, y) };
    if color.0 == CLR_INVALID {
        return Err("坐标超出窗口范围或窗口不可访问".to_string());
    }
    let v = color.0;
    let r = (v & 0xFF) as u8;
    let g = ((v >> 8) & 0xFF) as u8;
    let b = ((v >> 16) & 0xFF) as u8;
    Ok([r, g, b])
}

/// 后台截图：优先 PrintWindow，失败回退 BitBlt。最大 2048 像素等比缩放。返回 PNG 字节流。
pub fn wa_capture_window(hwnd: i64) -> Result<Vec<u8>, String> {
    let _dpi = PhysicalDpi::enter()?;
    let h = hwnd_from_i64(hwnd);
    ensure_valid_window(h)?;

    let mut rect = RECT::default();
    unsafe { GetClientRect(h, &mut rect) }.map_err(|e| format!("获取客户区失败: {}", e))?;
    let width = (rect.right - rect.left).max(0);
    let height = (rect.bottom - rect.top).max(0);
    validate_dimensions(width, height)?;

    let src_dc = unsafe { GetDC(h) };
    if src_dc.is_invalid() {
        return Err("获取窗口 DC 失败".to_string());
    }
    defer!(unsafe {
        windows::Win32::Graphics::Gdi::ReleaseDC(h, src_dc);
    });

    let mem_dc = unsafe { CreateCompatibleDC(src_dc) };
    if mem_dc.is_invalid() {
        return Err("创建内存 DC 失败".to_string());
    }
    defer!(unsafe {
        let _ = DeleteDC(mem_dc);
    });

    let bitmap = unsafe { CreateCompatibleBitmap(src_dc, width, height) };
    if bitmap.is_invalid() {
        return Err("创建位图失败".to_string());
    }
    defer!(unsafe {
        let _ = DeleteObject(bitmap);
    });

    let prev: HGDIOBJ = unsafe { SelectObject(mem_dc, HGDIOBJ(bitmap.0)) };
    defer!(unsafe {
        let _ = SelectObject(mem_dc, prev);
    });

    // 优先 PrintWindow，失败回退 BitBlt
    let ok = unsafe { PrintWindow(h, mem_dc, PRINT_WINDOW_FLAGS(0x00000003)) }.as_bool();
    if !ok {
        let blt = unsafe { BitBlt(mem_dc, 0, 0, width, height, src_dc, 0, 0, SRCCOPY) };
        if blt.is_err() {
            return Err("PrintWindow 与 BitBlt 都失败".to_string());
        }
    }

    // 读取像素（BGRA Top-down）
    let mut bmi = BITMAPINFO {
        bmiHeader: BITMAPINFOHEADER {
            biSize: size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height, // top-down
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB.0,
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        },
        bmiColors: [windows::Win32::Graphics::Gdi::RGBQUAD::default(); 1],
    };
    let row_bytes = (width as usize) * 4;
    let mut pixels: Vec<u8> = vec![0u8; row_bytes * height as usize];
    // GetDIBits requires that the bitmap is no longer selected into a DC.
    unsafe {
        SelectObject(mem_dc, prev);
    }
    let scan_lines = unsafe {
        GetDIBits(
            mem_dc,
            bitmap,
            0,
            height as u32,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut bmi,
            windows::Win32::Graphics::Gdi::DIB_RGB_COLORS,
        )
    };
    if scan_lines != height {
        return Err("GetDIBits 读取像素失败".to_string());
    }

    // BGRA -> RGBA
    let mut rgba = pixels;
    for y in 0..height as usize {
        for x in 0..width as usize {
            let src = (y * width as usize + x) * 4;
            let b = rgba[src];
            let g = rgba[src + 1];
            let r = rgba[src + 2];
            let a = rgba[src + 3];
            let dst = (y * width as usize + x) * 4;
            rgba[dst] = r;
            rgba[dst + 1] = g;
            rgba[dst + 2] = b;
            rgba[dst + 3] = if a == 0 { 255 } else { a };
        }
    }

    // 等比缩放到最大 2048
    const MAX_DIM: i32 = 2048;
    let (out_w, out_h, out_pixels) = if width > MAX_DIM || height > MAX_DIM {
        let scale = (MAX_DIM as f32 / width.max(height) as f32).min(1.0);
        let new_w = ((width as f32) * scale).round().max(1.0) as i32;
        let new_h = ((height as f32) * scale).round().max(1.0) as i32;
        let src_img = image::RgbaImage::from_raw(width as u32, height as u32, rgba)
            .ok_or_else(|| "构造图像失败".to_string())?;
        let resized = image::imageops::resize(
            &src_img,
            new_w as u32,
            new_h as u32,
            image::imageops::FilterType::Triangle,
        );
        (new_w, new_h, resized.into_raw())
    } else {
        (width, height, rgba)
    };

    // PNG 编码
    let mut png_bytes: Vec<u8> = Vec::new();
    {
        use image::ImageEncoder;
        image::codecs::png::PngEncoder::new(&mut png_bytes)
            .write_image(
                &out_pixels,
                out_w as u32,
                out_h as u32,
                image::ExtendedColorType::Rgba8,
            )
            .map_err(|e| format!("PNG 编码失败: {}", e))?;
    }
    Ok(png_bytes)
}

/// 点击：mode = "background"（默认）向坐标命中的实际子窗口投递窗口消息，
/// 不抢焦点、不动真实光标；mode = "foreground" 用 SendInput 注入真实系统输入，
/// 对 raw input / DirectInput 游戏（不处理合成消息的程序）同样生效，
/// 注入前临时前台化目标窗口、注入后恢复焦点与光标。
///
/// 机制限制：background 只对处理标准消息循环的程序有效（SDL/GLFW 框架游戏如
/// 泰拉瑞亚、Minecraft 的窗口过程会处理标准消息，通常直接可用）；
/// 完全不读窗口消息的程序请改用 foreground。
pub fn wa_send_click(
    hwnd: i64,
    x: i32,
    y: i32,
    button: String,
    double_click: bool,
    mode: Option<String>,
) -> Result<WaClickResult, String> {
    let _input = INPUT_LOCK.lock().map_err(|_| "输入服务锁定失败")?;
    let _dpi = PhysicalDpi::enter()?;
    let top = hwnd_from_i64(hwnd);
    ensure_valid_window(top)?;

    let title = get_window_title(top);
    if !unsafe { IsWindowVisible(top) }.as_bool() {
        return Err(format!(
            "目标窗口不可见（可能已最小化或关闭显示），无法投递点击: hwnd {hwnd} 「{title}」"
        ));
    }
    if !unsafe { IsWindowEnabled(top) }.as_bool() {
        return Err(format!(
            "目标窗口处于禁用（无响应）状态，无法投递点击: hwnd {hwnd} 「{title}」"
        ));
    }

    // 客户区范围校验：越界坐标在真实点击下不可能出现，直接报错避免静默无效
    let mut client = RECT::default();
    unsafe { GetClientRect(top, &mut client) }.map_err(|e| format!("获取客户区失败: {e}"))?;
    let client_w = client.right - client.left;
    let client_h = client.bottom - client.top;
    if x < 0 || y < 0 || x >= client_w || y >= client_h {
        return Err(format!(
            "点击坐标 ({x}, {y}) 超出窗口「{title}」客户区 {client_w}×{client_h}，请重新拾取坐标或改用百分比模式"
        ));
    }

    let click_mode = mode
        .map(|m| m.to_ascii_lowercase())
        .unwrap_or_else(|| "background".to_string());

    let (target_hwnd, target_class) = match click_mode.as_str() {
        "background" => {
            let (down_msg, up_msg, mk) = match button.to_ascii_lowercase().as_str() {
                "left" => (WM_LBUTTONDOWN, WM_LBUTTONUP, 0x0001usize),
                "right" => (WM_RBUTTONDOWN, WM_RBUTTONUP, 0x0002usize),
                "middle" => (WM_MBUTTONDOWN, WM_MBUTTONUP, 0x0010usize),
                other => return Err(format!("不支持的鼠标按键: {other}")),
            };

            // 消息必须发给坐标处的实际子窗口，发给顶层窗口通常无人处理
            let (target, target_pt) = hit_test_child_window(top, x, y);
            let lparam = lparam_from_xy(target_pt.x, target_pt.y);
            let wparam = WPARAM(mk);

            unsafe {
                // 先发 MOUSEMOVE 建立悬停状态，部分控件依赖它才接受 BUTTONDOWN
                PostMessageW(target, WM_MOUSEMOVE, WPARAM(0), lparam)
                    .map_err(|e| format!("投递 WM_MOUSEMOVE 失败: {e}"))?;
                PostMessageW(target, down_msg, wparam, lparam)
                    .map_err(|e| format!("投递鼠标按下消息失败: {e}"))?;
                PostMessageW(target, up_msg, WPARAM(0), lparam)
                    .map_err(|e| format!("投递鼠标抬起消息失败: {e}"))?;
                if double_click {
                    // 双击 = 两轮完整按下/抬起，兼容未注册 CS_DBLCLKS 风格的窗口类
                    PostMessageW(target, down_msg, wparam, lparam)
                        .map_err(|e| format!("投递鼠标按下消息失败: {e}"))?;
                    PostMessageW(target, up_msg, WPARAM(0), lparam)
                        .map_err(|e| format!("投递鼠标抬起消息失败: {e}"))?;
                }
            }
            (hwnd_to_i64(target), get_window_class_name(target))
        }
        "foreground" => {
            let mut prev_cursor = POINT::default();
            unsafe { GetCursorPos(&mut prev_cursor) }
                .map_err(|e| format!("获取光标位置失败: {e}"))?;
            let prev_fore = unsafe { GetForegroundWindow() };
            defer!(restore_foreground(prev_fore, prev_cursor));
            acquire_foreground(top)?;
            settle_foreground_input();
            defer!(settle_foreground_input());
            let result = (|| -> Result<(), String> {
                let mut pt = POINT { x, y };
                let converted = unsafe { ClientToScreen(top, &mut pt) }.as_bool();
                if !converted {
                    return Err("窗口坐标转换失败（窗口可能已关闭）".to_string());
                }
                send_input_click(pt, &button)?;
                if double_click {
                    send_input_click(pt, &button)?;
                }
                Ok(())
            })();
            result?;
            (hwnd, get_window_class_name(top))
        }
        other => {
            return Err(format!(
                "不支持的点击模式: {other}（可选 background / foreground）"
            ))
        }
    };

    Ok(WaClickResult {
        mode: click_mode,
        target_hwnd,
        target_class,
        target_title: title,
    })
}

fn vk_for_modifier(name: &str) -> Option<u16> {
    let lower = name.trim().to_ascii_lowercase();
    match lower.as_str() {
        "ctrl" | "control" => Some(0x11),
        "shift" => Some(0x10),
        "alt" | "menu" => Some(0x12),
        _ => None,
    }
}

// Virtual-Key 码表（覆盖实现计划中列出的常用键）
fn vk_from_key_name(name: &str) -> Option<u16> {
    let key = name.trim();
    let lower = key.to_ascii_lowercase();
    if lower.len() == 1 {
        let c = lower.chars().next().unwrap();
        if c.is_ascii_alphabetic() {
            return Some(0x41 + (c as u16 - 'a' as u16));
        }
        if c.is_ascii_digit() {
            return Some(0x30 + (c as u16 - '0' as u16));
        }
    }
    Some(match lower.as_str() {
        "f1" => 0x70,
        "f2" => 0x71,
        "f3" => 0x72,
        "f4" => 0x73,
        "f5" => 0x74,
        "f6" => 0x75,
        "f7" => 0x76,
        "f8" => 0x77,
        "f9" => 0x78,
        "f10" => 0x79,
        "f11" => 0x7A,
        "f12" => 0x7B,
        "enter" | "return" => 0x0D,
        "space" | "spacebar" => 0x20,
        "tab" => 0x09,
        "escape" | "esc" => 0x1B,
        "backspace" | "bs" => 0x08,
        "delete" | "del" => 0x2E,
        "home" => 0x24,
        "end" => 0x23,
        "pageup" | "pgup" => 0x21,
        "pagedown" | "pgdn" => 0x22,
        "insert" | "ins" => 0x2D,
        "up" => 0x26,
        "down" => 0x28,
        "left" => 0x25,
        "right" => 0x27,
        "-" | "minus" => 0xBD,
        "=" | "equals" => 0xBB,
        "[" | "lbracket" => 0xDB,
        "]" | "rbracket" => 0xDD,
        "\\" | "backslash" => 0xDC,
        ";" | "semicolon" => 0xBA,
        "'" | "quote" => 0xDE,
        "," | "comma" => 0xBC,
        "." | "period" => 0xBE,
        "/" | "slash" => 0xBF,
        "`" | "backquote" => 0xC0,
        "ctrl" | "control" => 0x11,
        "shift" => 0x10,
        "alt" | "menu" => 0x12,
        _ => return None,
    })
}

fn send_key(hwnd: HWND, vk: u16, is_down: bool) -> Result<(), String> {
    let msg = if is_down { WM_KEYDOWN } else { WM_KEYUP };
    let lparam = LPARAM(0);
    let wparam = WPARAM(vk as usize);
    unsafe {
        PostMessageW(hwnd, msg, wparam, lparam).map_err(|e| {
            format!(
                "后台按键投递失败 (vk 0x{vk:02X}, {}): {e}",
                if is_down { "按下" } else { "抬起" }
            )
        })?;
    }
    Ok(())
}

/// 后台按键：可选修饰键。
/// mode = "background"（默认）投递 WM_KEYDOWN/UP 消息；
/// mode = "foreground" 用 SendInput 注入真实键盘输入并临时前台化，对游戏生效。
pub fn wa_send_keypress(
    hwnd: i64,
    key: String,
    modifiers: Option<Vec<String>>,
    mode: Option<String>,
) -> Result<(), String> {
    let _input = INPUT_LOCK.lock().map_err(|_| "输入服务锁定失败")?;
    let _dpi = PhysicalDpi::enter()?;
    let h = hwnd_from_i64(hwnd);
    ensure_valid_window(h)?;
    let vk = vk_from_key_name(&key).ok_or_else(|| format!("无法识别的按键: {key}"))?;
    let mods: Vec<u16> = modifiers
        .unwrap_or_default()
        .iter()
        .map(|name| vk_for_modifier(name).ok_or_else(|| format!("无法识别的修饰键: {name}")))
        .collect::<Result<_, _>>()?;
    let mode = mode
        .unwrap_or_else(|| "background".into())
        .to_ascii_lowercase();
    match mode.as_str() {
        "background" => press_sequence(vk, &mods, |key, down| send_key(h, key, down)),
        "foreground" => {
            let mut prev_cursor = POINT::default();
            unsafe { GetCursorPos(&mut prev_cursor) }
                .map_err(|e| format!("获取光标位置失败: {e}"))?;
            let prev_fore = unsafe { GetForegroundWindow() };
            defer!(restore_foreground(prev_fore, prev_cursor));
            acquire_foreground(h)?;
            settle_foreground_input();
            defer!(settle_foreground_input());
            press_sequence(vk, &mods, send_input_key)
        }
        other => Err(format!(
            "不支持的按键模式: {other}（可选 background / foreground）"
        )),
    }
}

// Always attempt key-up for every successfully pressed key, including partial failures.
fn press_sequence(
    vk: u16,
    modifiers: &[u16],
    mut send: impl FnMut(u16, bool) -> Result<(), String>,
) -> Result<(), String> {
    let mut pressed = Vec::new();
    let result = (|| {
        for &key in modifiers.iter().chain(std::iter::once(&vk)) {
            send(key, true)?;
            pressed.push(key);
        }
        Ok(())
    })();
    let mut released = Ok(());
    for key in pressed.into_iter().rev() {
        if let Err(error) = send(key, false) {
            released = Err(error);
        }
    }
    result.and(released)
}

/// 获取窗口客户区尺寸。
pub fn wa_get_client_rect(hwnd: i64) -> Result<WaClientRect, String> {
    let _dpi = PhysicalDpi::enter()?;
    let h = hwnd_from_i64(hwnd);
    ensure_valid_window(h)?;
    let mut rect = RECT::default();
    unsafe { GetClientRect(h, &mut rect) }.map_err(|e| format!("获取客户区失败: {}", e))?;
    Ok(WaClientRect {
        width: (rect.right - rect.left).max(0),
        height: (rect.bottom - rect.top).max(0),
    })
}

/// 检查窗口句柄是否仍然有效。
pub fn wa_is_window_valid(hwnd: i64) -> bool {
    unsafe { IsWindow(hwnd_from_i64(hwnd)).as_bool() }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn input_failure_releases_all_pressed_keys_in_reverse_order() {
        let mut events = Vec::new();
        let result = press_sequence(0x41, &[0x11, 0x10], |key, down| {
            events.push((key, down));
            if key == 0x41 && down {
                Err("injected failure".into())
            } else {
                Ok(())
            }
        });
        assert!(result.is_err());
        assert_eq!(
            events,
            vec![
                (0x11, true),
                (0x10, true),
                (0x41, true),
                (0x10, false),
                (0x11, false)
            ]
        );
        events.clear();
        let result = press_sequence(0x41, &[0x11], |key, down| {
            events.push((key, down));
            if key == 0x41 && !down {
                Err("key-up failed".into())
            } else {
                Ok(())
            }
        });
        assert!(result.is_err());
        assert_eq!(events.last(), Some(&(0x11, false)));
    }
    #[test]
    fn capture_dimensions_reject_unbounded_allocation() {
        assert!(validate_dimensions(3840, 2160).is_ok());
        for (width, height) in [(0, 10), (10, -1), (32769, 2), (16384, 16384)] {
            assert!(validate_dimensions(width, height).is_err());
        }
    }
}
