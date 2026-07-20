use serde::{Deserialize, Serialize};
use std::{fs::File, io, os::fd::FromRawFd};
use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    AppHandle, Manager, Runtime,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenContentPayload<'a> {
    uri: &'a str,
    mode: &'a str,
}

#[derive(Debug, Deserialize)]
struct OpenContentResponse {
    fd: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentMetadata {
    pub display_name: Option<String>,
    pub mime_type: Option<String>,
}

struct AndroidContent<R: Runtime>(PluginHandle<R>);

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("asset-content")
        .setup(|app, api| {
            let handle = api.register_android_plugin("com.aiohub.mobile", "AssetContentPlugin")?;
            app.manage(AndroidContent(handle));
            Ok(())
        })
        .build()
}

pub fn open(app: &AppHandle, uri: &str, mode: &str) -> io::Result<File> {
    let response = app
        .state::<AndroidContent<tauri::Wry>>()
        .0
        .run_mobile_plugin::<OpenContentResponse>("openContent", OpenContentPayload { uri, mode })
        .map_err(|error| io::Error::other(format!("content URI open failed: {error}")))?;
    if response.fd < 0 {
        return Err(io::Error::other("content URI returned an invalid fd"));
    }
    Ok(unsafe { File::from_raw_fd(response.fd) })
}

pub fn metadata(app: &AppHandle, uri: &str) -> io::Result<ContentMetadata> {
    app.state::<AndroidContent<tauri::Wry>>()
        .0
        .run_mobile_plugin::<ContentMetadata>(
            "getContentMetadata",
            OpenContentPayload { uri, mode: "r" },
        )
        .map_err(|error| io::Error::other(format!("content URI metadata failed: {error}")))
}
