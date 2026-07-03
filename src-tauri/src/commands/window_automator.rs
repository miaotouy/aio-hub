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

// 窗口自动化助手 (Window Automator) - 所有 Tauri Commands
//
// 实现 ImplementationPlan.md 中描述的命令集：
//   wa_get_windows / wa_get_pixel / wa_capture_window / wa_send_click
//   wa_send_keypress / wa_get_client_rect / wa_is_window_valid
//
// 本模块只在 Windows 上编译（由 commands.rs 的 #[cfg(windows)] 守卫保证）。

use scopeguard::defer;
use serde::{Deserialize, Serialize};
use std::ffi::c_void;
use std::mem::size_of;
use windows::core::PWSTR;
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, RECT, WPARAM};
use windows::Win32::Graphics::Gdi::{
    BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
    GetPixel, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CLR_INVALID, HGDIOBJ, SRCCOPY,
};
use windows::Win32::Storage::Xps::{PrintWindow, PRINT_WINDOW_FLAGS};
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows,
    GetClassNameW,
    GetClientRect,
    GetWindowTextLengthW,
    GetWindowTextW,
    GetWindowThreadProcessId,
    IsWindow,
    IsWindowVisible,
    PostMessageW, // MK_LBUTTON/MK_MBUTTON/MK_RBUTTON in Input::KeyboardAndMouse
    WM_KEYDOWN,
    WM_KEYUP,
    WM_LBUTTONDOWN,
    WM_LBUTTONUP,
    WM_MBUTTONDOWN,
    WM_MBUTTONUP,
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
#[tauri::command]
pub fn wa_get_windows(exclude_self: Option<bool>) -> Result<Vec<WaWindowInfo>, String> {
    let mut ctx = EnumAllContext {
        exclude_self_pid: exclude_self.unwrap_or(true),
        self_pid: get_self_pid(),
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

/// 后台取色：使用窗口 DC 的 GetPixel。
#[tauri::command]
pub fn wa_get_pixel(hwnd: i64, x: i32, y: i32) -> Result<[u8; 3], String> {
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
#[tauri::command]
pub fn wa_capture_window(hwnd: i64) -> Result<tauri::ipc::Response, String> {
    let h = hwnd_from_i64(hwnd);
    ensure_valid_window(h)?;

    let mut rect = RECT::default();
    unsafe { GetClientRect(h, &mut rect) }.map_err(|e| format!("获取客户区失败: {}", e))?;
    let width = (rect.right - rect.left).max(0);
    let height = (rect.bottom - rect.top).max(0);
    if width == 0 || height == 0 {
        return Err("窗口客户区尺寸为 0".to_string());
    }

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
    let ok = unsafe { PrintWindow(h, mem_dc, PRINT_WINDOW_FLAGS(0x00000002)) }.as_bool();
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
    if scan_lines == 0 {
        return Err("GetDIBits 读取像素失败".to_string());
    }

    // BGRA -> RGBA
    let mut rgba: Vec<u8> = vec![0u8; (width as usize) * (height as usize) * 4];
    for y in 0..height as usize {
        for x in 0..width as usize {
            let src = (y * width as usize + x) * 4;
            let b = pixels[src];
            let g = pixels[src + 1];
            let r = pixels[src + 2];
            let a = pixels[src + 3];
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
    Ok(tauri::ipc::Response::new(png_bytes))
}

/// 后台点击：构造 WM_*BUTTONDOWN / WM_*BUTTONUP 消息。
#[tauri::command]
pub fn wa_send_click(
    hwnd: i64,
    x: i32,
    y: i32,
    button: String,
    double_click: bool,
) -> Result<(), String> {
    let h = hwnd_from_i64(hwnd);
    ensure_valid_window(h)?;
    let lparam = lparam_from_xy(x, y);
    let (down_msg, up_msg, mk) = match button.to_ascii_lowercase().as_str() {
        "left" => (WM_LBUTTONDOWN, WM_LBUTTONUP, 0x0001usize),
        "right" => (WM_RBUTTONDOWN, WM_RBUTTONUP, 0x0002usize),
        "middle" => (WM_MBUTTONDOWN, WM_MBUTTONUP, 0x0010usize),
        other => return Err(format!("不支持的鼠标按键: {}", other)),
    };
    let wparam = WPARAM(mk);
    unsafe {
        PostMessageW(h, down_msg, wparam, lparam)
            .map_err(|e| format!("PostMessage DOWN 失败: {}", e))?;
        PostMessageW(h, up_msg, WPARAM(0), lparam)
            .map_err(|e| format!("PostMessage UP 失败: {}", e))?;
        if double_click {
            let _ = PostMessageW(
                h,
                windows::Win32::UI::WindowsAndMessaging::WM_LBUTTONDBLCLK,
                wparam,
                lparam,
            );
        }
    }
    Ok(())
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
        PostMessageW(hwnd, msg, wparam, lparam)
            .map_err(|e| format!("PostMessage {:?} 失败: {}", msg, e))?;
    }
    Ok(())
}

/// 后台按键：可选修饰键。
#[tauri::command]
pub fn wa_send_keypress(
    hwnd: i64,
    key: String,
    modifiers: Option<Vec<String>>,
) -> Result<(), String> {
    let h = hwnd_from_i64(hwnd);
    ensure_valid_window(h)?;
    let vk = vk_from_key_name(&key).ok_or_else(|| format!("无法识别的按键: {}", key))?;
    let mods = modifiers.unwrap_or_default();
    // 1. 修饰键按下
    for m in &mods {
        if let Some(mvk) = vk_for_modifier(m) {
            send_key(h, mvk, true)?;
        }
    }
    // 2. 主键 down + up
    send_key(h, vk, true)?;
    send_key(h, vk, false)?;
    // 3. 修饰键抬起（反向）
    for m in mods.iter().rev() {
        if let Some(mvk) = vk_for_modifier(m) {
            send_key(h, mvk, false)?;
        }
    }
    Ok(())
}

/// 获取窗口客户区尺寸。
#[tauri::command]
pub fn wa_get_client_rect(hwnd: i64) -> Result<WaClientRect, String> {
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
#[tauri::command]
pub fn wa_is_window_valid(hwnd: i64) -> bool {
    unsafe { IsWindow(hwnd_from_i64(hwnd)).as_bool() }
}
