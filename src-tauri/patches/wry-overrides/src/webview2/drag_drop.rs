// Copyright 2020-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

// A silly implementation of file drop handling for Windows!

use crate::DragDropEvent;

use std::{
    cell::UnsafeCell,
    ffi::OsString,
    os::{raw::c_void, windows::ffi::OsStringExt},
    path::PathBuf,
    ptr,
    rc::Rc,
};

use windows::{
    core::{implement, w, BOOL},
    Win32::{
        Foundation::{DRAGDROP_E_INVALIDHWND, HGLOBAL, HWND, LPARAM, POINT, POINTL},
        Graphics::Gdi::ScreenToClient,
        System::{
            Com::{IDataObject, DVASPECT_CONTENT, FORMATETC, STGMEDIUM, TYMED_HGLOBAL},
            DataExchange::RegisterClipboardFormatW,
            Memory::{GlobalLock, GlobalSize, GlobalUnlock},
            Ole::{
                IDropTarget, IDropTarget_Impl, RegisterDragDrop, ReleaseStgMedium, RevokeDragDrop,
                CF_HDROP, CF_TEXT, CF_UNICODETEXT, DROPEFFECT, DROPEFFECT_COPY, DROPEFFECT_NONE,
            },
            SystemServices::MODIFIERKEYS_FLAGS,
        },
        UI::{
            Shell::{DragFinish, DragQueryFileW, HDROP},
            WindowsAndMessaging::EnumChildWindows,
        },
    },
};

#[derive(Default)]
pub(crate) struct DragDropController {
    drop_targets: Vec<IDropTarget>,
}

impl DragDropController {
    #[inline]
    pub(crate) fn new(hwnd: HWND, handler: Box<dyn Fn(DragDropEvent) -> bool>) -> Self {
        let mut controller = DragDropController::default();

        let handler = Rc::new(handler);

        // Enumerate child windows to find the WebView2 "window" and override!
        {
            let mut callback = |hwnd| controller.inject_in_hwnd(hwnd, handler.clone());
            let mut trait_obj: &mut dyn FnMut(HWND) -> bool = &mut callback;
            let closure_pointer_pointer: *mut c_void =
                unsafe { std::mem::transmute(&mut trait_obj) };
            let lparam = LPARAM(closure_pointer_pointer as _);
            unsafe extern "system" fn enumerate_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
                let closure = &mut *(lparam.0 as *mut c_void as *mut &mut dyn FnMut(HWND) -> bool);
                closure(hwnd).into()
            }
            let _ = unsafe { EnumChildWindows(Some(hwnd), Some(enumerate_callback), lparam) };
        }

        controller
    }

    #[inline]
    fn inject_in_hwnd(&mut self, hwnd: HWND, handler: Rc<dyn Fn(DragDropEvent) -> bool>) -> bool {
        let drag_drop_target: IDropTarget = DragDropTarget::new(hwnd, handler).into();
        if unsafe { RevokeDragDrop(hwnd) } != Err(DRAGDROP_E_INVALIDHWND.into())
            && unsafe { RegisterDragDrop(hwnd, &drag_drop_target) }.is_ok()
        {
            self.drop_targets.push(drag_drop_target);
        }

        true
    }
}

#[implement(IDropTarget)]
pub struct DragDropTarget {
    hwnd: HWND,
    listener: Rc<dyn Fn(DragDropEvent) -> bool>,
    cursor_effect: UnsafeCell<DROPEFFECT>,
    enter_is_valid: UnsafeCell<bool>, /* If the currently hovered item is not valid there must not be any `HoveredFileCancelled` emitted */
}

impl DragDropTarget {
    pub fn new(hwnd: HWND, listener: Rc<dyn Fn(DragDropEvent) -> bool>) -> DragDropTarget {
        Self {
            hwnd,
            listener,
            cursor_effect: DROPEFFECT_NONE.into(),
            enter_is_valid: false.into(),
        }
    }

    unsafe fn collect_file_paths<F>(
        data_obj: windows_core::Ref<'_, IDataObject>,
        mut callback: F,
    ) -> Option<HDROP>
    where
        F: FnMut(PathBuf),
    {
        let mut paths = Vec::new();
        let hdrop = unsafe { Self::collect_hdrop_paths(&data_obj, |path| paths.push(path)) };

        if paths.is_empty() {
            unsafe {
                Self::collect_text_format_paths(&data_obj, CF_UNICODETEXT.0, true, &mut paths);
                Self::collect_text_format_paths(&data_obj, CF_TEXT.0, false, &mut paths);
                Self::collect_registered_format_paths(&data_obj, "FileNameW", true, &mut paths);
                Self::collect_registered_format_paths(&data_obj, "FileName", false, &mut paths);
                Self::collect_registered_format_paths(
                    &data_obj,
                    "UniformResourceLocatorW",
                    true,
                    &mut paths,
                );
                Self::collect_registered_format_paths(
                    &data_obj,
                    "UniformResourceLocator",
                    false,
                    &mut paths,
                );
                Self::collect_registered_format_paths(
                    &data_obj,
                    "text/uri-list",
                    false,
                    &mut paths,
                );
            }
        }

        for path in paths {
            callback(path);
        }

        hdrop
    }

    unsafe fn collect_hdrop_paths<F>(
        data_obj: &windows_core::Ref<'_, IDataObject>,
        mut callback: F,
    ) -> Option<HDROP>
    where
        F: FnMut(PathBuf),
    {
        let drop_format = FORMATETC {
            cfFormat: CF_HDROP.0,
            ptd: ptr::null_mut(),
            dwAspect: DVASPECT_CONTENT.0,
            lindex: -1,
            tymed: TYMED_HGLOBAL.0 as u32,
        };

        match data_obj
            .as_ref()
            .expect("Received null IDataObject")
            .GetData(&drop_format)
        {
            Ok(medium) => {
                let hdrop = HDROP(medium.u.hGlobal.0 as _);

                // The second parameter (0xFFFFFFFF) instructs the function to return the item count
                let item_count = DragQueryFileW(hdrop, 0xFFFFFFFF, None);

                for i in 0..item_count {
                    // Get the length of the path string NOT including the terminating null character.
                    // Previously, this was using a fixed size array of MAX_PATH length, but the
                    // Windows API allows longer paths under certain circumstances.
                    let character_count = DragQueryFileW(hdrop, i, None) as usize;

                    // Fill path_buf with the null-terminated file name
                    let str_len = character_count + 1;
                    let mut path_buf = vec![0; str_len];
                    DragQueryFileW(hdrop, i, Some(&mut path_buf));
                    callback(OsString::from_wide(&path_buf[0..character_count]).into());
                }

                Some(hdrop)
            }
            Err(_error) => {
                #[cfg(feature = "tracing")]
                tracing::warn!(
                    "{}",
                    match _error.code() {
                        windows::Win32::Foundation::DV_E_FORMATETC => {
                            // If the dropped item is not a file this error will occur.
                            // In this case it is OK to return without taking further action.
                            "Error occurred while processing dropped/hovered item: item is not a file."
                        }
                        _ => "Unexpected error occurred while processing dropped/hovered item.",
                    }
                );
                None
            }
        }
    }

    unsafe fn collect_registered_format_paths(
        data_obj: &windows_core::Ref<'_, IDataObject>,
        format_name: &str,
        is_unicode: bool,
        paths: &mut Vec<PathBuf>,
    ) {
        let format = unsafe { register_clipboard_format(format_name) };
        if format != 0 {
            unsafe { Self::collect_text_format_paths(data_obj, format as u16, is_unicode, paths) };
        }
    }

    unsafe fn collect_text_format_paths(
        data_obj: &windows_core::Ref<'_, IDataObject>,
        cf_format: u16,
        is_unicode: bool,
        paths: &mut Vec<PathBuf>,
    ) {
        let format = FORMATETC {
            cfFormat: cf_format,
            ptd: ptr::null_mut(),
            dwAspect: DVASPECT_CONTENT.0,
            lindex: -1,
            tymed: TYMED_HGLOBAL.0 as u32,
        };

        let Ok(mut medium) = data_obj
            .as_ref()
            .expect("Received null IDataObject")
            .GetData(&format)
        else {
            return;
        };

        let text = unsafe { read_hglobal_text(medium.u.hGlobal, is_unicode) };
        unsafe { ReleaseStgMedium(&mut medium as *mut STGMEDIUM) };

        if let Some(text) = text {
            collect_paths_from_text(&text, paths);
        }
    }
}

unsafe fn register_clipboard_format(format_name: &str) -> u32 {
    match format_name {
        "FileNameW" => unsafe { RegisterClipboardFormatW(w!("FileNameW")) },
        "FileName" => unsafe { RegisterClipboardFormatW(w!("FileName")) },
        "UniformResourceLocatorW" => unsafe {
            RegisterClipboardFormatW(w!("UniformResourceLocatorW"))
        },
        "UniformResourceLocator" => unsafe {
            RegisterClipboardFormatW(w!("UniformResourceLocator"))
        },
        "text/uri-list" => unsafe { RegisterClipboardFormatW(w!("text/uri-list")) },
        _ => 0,
    }
}

unsafe fn read_hglobal_text(hglobal: HGLOBAL, is_unicode: bool) -> Option<String> {
    if hglobal.is_invalid() {
        return None;
    }

    let size = unsafe { GlobalSize(hglobal) };
    if size == 0 {
        return None;
    }

    let ptr = unsafe { GlobalLock(hglobal) };
    if ptr.is_null() {
        return None;
    }

    let text = if is_unicode {
        let len = size / std::mem::size_of::<u16>();
        let raw = unsafe { std::slice::from_raw_parts(ptr as *const u16, len) };
        let end = raw.iter().position(|ch| *ch == 0).unwrap_or(raw.len());
        String::from_utf16_lossy(&raw[..end])
    } else {
        let raw = unsafe { std::slice::from_raw_parts(ptr as *const u8, size) };
        let end = raw.iter().position(|ch| *ch == 0).unwrap_or(raw.len());
        String::from_utf8_lossy(&raw[..end]).into_owned()
    };

    let _ = unsafe { GlobalUnlock(hglobal) };

    let text = text.trim_matches(char::from(0)).trim().to_string();
    (!text.is_empty()).then_some(text)
}

fn collect_paths_from_text(text: &str, paths: &mut Vec<PathBuf>) {
    for item in text.split(|ch| ch == '\r' || ch == '\n') {
        let item = item.trim().trim_matches('"');
        if item.is_empty() || item.starts_with('#') {
            continue;
        }

        if let Some(path) = normalize_text_path(item) {
            push_unique_path(paths, path);
        }
    }
}

fn normalize_text_path(raw: &str) -> Option<PathBuf> {
    let mut text = raw.trim().trim_matches(char::from(0)).trim().to_string();
    if text.is_empty() {
        return None;
    }

    let lower = text.to_ascii_lowercase();
    if lower.starts_with("file://") {
        text = percent_decode(&text[7..]);

        if text.starts_with('/') && is_windows_drive_path(&text[1..]) {
            text.remove(0);
        } else if text.starts_with("//") {
            text = format!("\\\\{}", &text[2..]);
        }

        text = text.replace('|', ":").replace('/', "\\");
    } else if lower.starts_with("file:") {
        text = percent_decode(&text[5..])
            .replace('|', ":")
            .replace('/', "\\");
    } else {
        text = percent_decode(&text).replace('|', ":");
    }

    if is_windows_drive_path(&text) || text.starts_with("\\\\") {
        Some(PathBuf::from(text))
    } else {
        None
    }
}

fn is_windows_drive_path(path: &str) -> bool {
    let bytes = path.as_bytes();
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut i = 0;

    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(high), Some(low)) = (hex_value(bytes[i + 1]), hex_value(bytes[i + 2])) {
                decoded.push((high << 4) | low);
                i += 3;
                continue;
            }
        }

        decoded.push(bytes[i]);
        i += 1;
    }

    String::from_utf8_lossy(&decoded).into_owned()
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn push_unique_path(paths: &mut Vec<PathBuf>, path: PathBuf) {
    let key = path_to_case_folded_string(&path);
    if !paths
        .iter()
        .any(|existing| path_to_case_folded_string(existing) == key)
    {
        paths.push(path);
    }
}

fn path_to_case_folded_string(path: &PathBuf) -> String {
    path.as_os_str().to_string_lossy().to_ascii_lowercase()
}

#[allow(non_snake_case)]
impl IDropTarget_Impl for DragDropTarget_Impl {
    fn DragEnter(
        &self,
        pDataObj: windows_core::Ref<'_, IDataObject>,
        _grfKeyState: MODIFIERKEYS_FLAGS,
        pt: &POINTL,
        pdwEffect: *mut DROPEFFECT,
    ) -> windows::core::Result<()> {
        let mut pt = POINT { x: pt.x, y: pt.y };
        let _ = unsafe { ScreenToClient(self.hwnd, &mut pt) };

        let mut paths = Vec::new();
        let _hdrop =
            unsafe { DragDropTarget::collect_file_paths(pDataObj, |path| paths.push(path)) };

        let enter_is_valid = !paths.is_empty();

        if !enter_is_valid {
            return Ok(());
        };

        unsafe {
            *self.enter_is_valid.get() = enter_is_valid;
        }

        (self.listener)(DragDropEvent::Enter {
            paths,
            position: (pt.x as _, pt.y as _),
        });

        let cursor_effect = if enter_is_valid {
            DROPEFFECT_COPY
        } else {
            DROPEFFECT_NONE
        };

        unsafe {
            *pdwEffect = cursor_effect;
            *self.cursor_effect.get() = cursor_effect;
        }

        Ok(())
    }

    fn DragOver(
        &self,
        _grfKeyState: MODIFIERKEYS_FLAGS,
        pt: &POINTL,
        pdwEffect: *mut DROPEFFECT,
    ) -> windows::core::Result<()> {
        if unsafe { *self.enter_is_valid.get() } {
            let mut pt = POINT { x: pt.x, y: pt.y };
            let _ = unsafe { ScreenToClient(self.hwnd, &mut pt) };
            (self.listener)(DragDropEvent::Over {
                position: (pt.x as _, pt.y as _),
            });
        }

        unsafe { *pdwEffect = *self.cursor_effect.get() };
        Ok(())
    }

    fn DragLeave(&self) -> windows::core::Result<()> {
        if unsafe { *self.enter_is_valid.get() } {
            (self.listener)(DragDropEvent::Leave);
        }
        Ok(())
    }

    fn Drop(
        &self,
        pDataObj: windows_core::Ref<'_, IDataObject>,
        _grfKeyState: MODIFIERKEYS_FLAGS,
        pt: &POINTL,
        _pdwEffect: *mut DROPEFFECT,
    ) -> windows::core::Result<()> {
        if unsafe { *self.enter_is_valid.get() } {
            let mut pt = POINT { x: pt.x, y: pt.y };
            let _ = unsafe { ScreenToClient(self.hwnd, &mut pt) };

            let mut paths = Vec::new();
            let hdrop =
                unsafe { DragDropTarget::collect_file_paths(pDataObj, |path| paths.push(path)) };
            (self.listener)(DragDropEvent::Drop {
                paths,
                position: (pt.x as _, pt.y as _),
            });

            if let Some(hdrop) = hdrop {
                unsafe { DragFinish(hdrop) };
            }
        }

        Ok(())
    }
}
