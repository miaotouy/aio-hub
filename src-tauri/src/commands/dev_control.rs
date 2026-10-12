use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevControlIdentity {
    protocol_version: u32,
    instance_id: String,
    // Launcher identity remains stable when Tauri dev replaces the app process.
    startup_id: String,
    window_label: String,
    pid: u32,
}

/// Returns identity only for an explicitly opted-in debug process.
/// Release builds never read development environment variables.
#[tauri::command]
pub fn dev_control_identity(window: tauri::WebviewWindow) -> Option<DevControlIdentity> {
    #[cfg(debug_assertions)]
    {
        if std::env::var("AIO_DEV_CONTROL").as_deref() != Ok("1") {
            return None;
        }
        let instance_id = std::env::var("AIO_DEV_CONTROL_INSTANCE").ok()?;
        let startup_id = std::env::var("AIO_DEV_CONTROL_STARTUP").ok()?;
        if instance_id.is_empty() || startup_id.is_empty() {
            return None;
        }
        Some(DevControlIdentity {
            protocol_version: 1,
            instance_id,
            startup_id,
            window_label: window.label().to_string(),
            pid: std::process::id(),
        })
    }
    #[cfg(not(debug_assertions))]
    {
        let _ = window;
        None
    }
}

/// All development WebViews sharing a profile need the same environment options.
pub fn configure_webview<'a, R: tauri::Runtime, M: tauri::Manager<R>>(
    builder: tauri::WebviewWindowBuilder<'a, R, M>,
) -> tauri::WebviewWindowBuilder<'a, R, M> {
    #[cfg(all(debug_assertions, target_os = "windows"))]
    {
        if std::env::var("AIO_DEV_CONTROL").as_deref() == Ok("1") {
            if let Ok(arguments) = std::env::var("AIO_WEBVIEW2_ADDITIONAL_BROWSER_ARGS") {
                if !arguments.trim().is_empty() {
                    return builder.additional_browser_args(&arguments);
                }
            }
        }
    }
    builder
}
