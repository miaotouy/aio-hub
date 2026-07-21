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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShareContentPayload<'a> {
    path: &'a str,
    mime_type: &'a str,
    file_name: &'a str,
}

#[derive(Debug, Deserialize)]
struct ShareContentResponse {
    started: bool,
}

#[derive(Debug, Serialize)]
struct CapturePhotoPayload {}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CapturePhotoResponse {
    cancelled: bool,
    reference: Option<String>,
    original_name: Option<String>,
    mime_type: Option<String>,
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

pub fn share(app: &AppHandle, path: &str, mime_type: &str, file_name: &str) -> io::Result<()> {
    let response = app
        .state::<AndroidContent<tauri::Wry>>()
        .0
        .run_mobile_plugin::<ShareContentResponse>(
            "shareContent",
            ShareContentPayload {
                path,
                mime_type,
                file_name,
            },
        )
        .map_err(|error| io::Error::other(format!("content share failed: {error}")))?;
    if !response.started {
        return Err(io::Error::other("content share did not start"));
    }
    Ok(())
}

#[derive(Debug)]
pub struct CapturedPhoto {
    pub reference: String,
    pub original_name: String,
    pub mime_type: String,
}

pub fn capture_photo(app: &AppHandle) -> io::Result<Option<CapturedPhoto>> {
    let response = app
        .state::<AndroidContent<tauri::Wry>>()
        .0
        .run_mobile_plugin::<CapturePhotoResponse>("capturePhoto", CapturePhotoPayload {})
        .map_err(|error| io::Error::other(format!("photo capture failed: {error}")))?;
    if response.cancelled {
        return Ok(None);
    }
    Ok(Some(CapturedPhoto {
        reference: response
            .reference
            .ok_or_else(|| io::Error::other("photo capture returned no reference"))?,
        original_name: response
            .original_name
            .ok_or_else(|| io::Error::other("photo capture returned no name"))?,
        mime_type: response
            .mime_type
            .ok_or_else(|| io::Error::other("photo capture returned no MIME type"))?,
    }))
}
