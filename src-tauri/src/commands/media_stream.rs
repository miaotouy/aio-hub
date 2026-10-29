// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

//! WebKitGTK 的媒体管线通过 HTTP 流读取已授权文件，文件路径仅在 IPC 中传递。
use axum::{
    body::Body,
    extract::{Path as RoutePath, State},
    http::{header, HeaderMap, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use std::{
    collections::HashMap,
    fs::File,
    io,
    net::SocketAddr,
    os::{fd::AsRawFd, unix::fs::FileExt},
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::SystemTime,
};
use tauri::Manager;
use tokio::sync::OnceCell;

struct MediaFile {
    file: File,
    length: u64,
    modified: Option<SystemTime>,
    mime: String,
    owner: String,
    origin: String,
    active: AtomicBool,
}

type Resources = Arc<Mutex<HashMap<String, Arc<MediaFile>>>>;

#[derive(Default)]
pub struct MediaStreamState {
    resources: Resources,
    address: OnceCell<SocketAddr>,
    generations: Mutex<HashMap<String, u64>>,
}

impl MediaStreamState {
    pub fn release_window(&self, owner: &str) {
        let mut resources = self.resources.lock().unwrap();
        *self
            .generations
            .lock()
            .unwrap()
            .entry(owner.to_owned())
            .or_default() += 1;
        resources.retain(|_, file| {
            if file.owner != owner {
                return true;
            }
            file.active.store(false, Ordering::Relaxed);
            false
        });
    }

    fn release(&self, owner: &str, token: &str) {
        let mut resources = self.resources.lock().unwrap();
        if resources.get(token).is_some_and(|file| file.owner == owner) {
            if let Some(file) = resources.remove(token) {
                file.active.store(false, Ordering::Relaxed);
            }
        }
    }

    async fn address(&self) -> Result<SocketAddr, String> {
        self.address
            .get_or_try_init(|| async {
                let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
                    .await
                    .map_err(|e| format!("启动媒体读取失败: {e}"))?;
                let address = listener.local_addr().map_err(|e| e.to_string())?;
                let router = media_router(self.resources.clone(), address.to_string());
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = axum::serve(listener, router).await {
                        log::error!("[MediaStream] 媒体读取服务停止: {error}");
                    }
                });
                Ok(address)
            })
            .await
            .copied()
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaStreamLease {
    token: String,
    url: String,
}

#[tauri::command]
pub async fn acquire_media_stream(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, MediaStreamState>,
    path: String,
) -> Result<MediaStreamLease, String> {
    let owner = window.label().to_owned();
    let generation = *state
        .generations
        .lock()
        .unwrap()
        .entry(owner.clone())
        .or_default();
    let lease_owner = owner.clone();
    let url = window.url().map_err(|e| e.to_string())?;
    let origin = if url.scheme() == "tauri" && url.host_str() == Some("localhost") {
        "tauri://localhost".to_owned()
    } else {
        url.origin().ascii_serialization()
    };
    let path = tokio::fs::canonicalize(Path::new(&path))
        .await
        .map_err(|e| format!("无法访问媒体文件: {e}"))?;
    if !window.app_handle().asset_protocol_scope().is_allowed(&path) {
        return Err("此文件尚未获准读取".into());
    }
    let scope = window.app_handle().asset_protocol_scope();
    let media = tokio::task::spawn_blocking(move || {
        let media = open_media(&path, owner, origin)?;
        let opened_path = std::fs::read_link(format!("/proc/self/fd/{}", media.file.as_raw_fd()))
            .map_err(|e| e.to_string())?;
        if !scope.is_allowed(&opened_path) {
            return Err("此文件尚未获准读取".into());
        }
        Ok::<_, String>(media)
    })
    .await
    .map_err(|e| e.to_string())??;
    let address = state.address().await?;
    let token = uuid::Uuid::new_v4().to_string();
    let mut resources = state.resources.lock().unwrap();
    if state
        .generations
        .lock()
        .unwrap()
        .get(&lease_owner)
        .copied()
        .unwrap_or_default()
        != generation
    {
        return Err("媒体所在页面已关闭，请重新打开文件".into());
    }
    if resources.len() >= 512 {
        return Err("打开的媒体过多，请关闭部分预览后重试".into());
    }
    resources.insert(token.clone(), Arc::new(media));
    Ok(MediaStreamLease {
        url: format!("http://{address}/media/{token}"),
        token,
    })
}

#[tauri::command]
pub fn release_media_stream(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, MediaStreamState>,
    token: String,
) {
    state.release(window.label(), &token);
}

fn open_media(path: &Path, owner: String, origin: String) -> Result<MediaFile, String> {
    if !std::fs::metadata(path)
        .map_err(|e| e.to_string())?
        .is_file()
    {
        return Err("请选择音频或视频文件".into());
    }
    let file = File::open(path).map_err(|e| format!("无法打开媒体文件: {e}"))?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    if !metadata.is_file() {
        return Err("请选择音频或视频文件".into());
    }
    // 使用同一已打开的句柄嗅探 MIME，后续读取固定该文件，避免符号链接切换。
    let mut prefix = [0u8; 8192];
    let count = file.read_at(&mut prefix, 0).map_err(|e| e.to_string())?;
    let mime = infer::get(&prefix[..count])
        .map(|kind| kind.mime_type().to_owned())
        .unwrap_or_else(|| {
            crate::utils::mime::guess_mime_type_from_filename(&path.to_string_lossy())
        });
    if !(mime.starts_with("audio/") || mime.starts_with("video/")) {
        return Err("请选择音频或视频文件".into());
    }
    Ok(MediaFile {
        file,
        length: metadata.len(),
        modified: metadata.modified().ok(),
        mime,
        owner,
        origin,
        active: AtomicBool::new(true),
    })
}

#[derive(Debug, PartialEq)]
enum ByteRange {
    Full,
    Partial(u64, u64),
    Unsatisfiable,
}

fn parse_range(value: Option<&str>, length: u64) -> ByteRange {
    let Some(value) = value.and_then(|value| value.strip_prefix("bytes=")) else {
        return ByteRange::Full;
    };
    // 不处理多段或畸形 Range，按完整响应读取；合法但越界的范围返回 416。
    let Some((start, end)) = value.split_once('-') else {
        return ByteRange::Full;
    };
    if value.contains(',') {
        return ByteRange::Full;
    }
    if start.is_empty() {
        let Ok(suffix) = end.parse::<u64>() else {
            return ByteRange::Full;
        };
        if suffix == 0 || length == 0 {
            return ByteRange::Unsatisfiable;
        }
        return ByteRange::Partial(length.saturating_sub(suffix), length - 1);
    }
    let Ok(start) = start.parse::<u64>() else {
        return ByteRange::Full;
    };
    let end = if end.is_empty() {
        length.saturating_sub(1)
    } else {
        let Ok(end) = end.parse::<u64>() else {
            return ByteRange::Full;
        };
        if end < start {
            return ByteRange::Full;
        }
        end.min(length.saturating_sub(1))
    };
    if start >= length {
        return ByteRange::Unsatisfiable;
    }
    ByteRange::Partial(start, end)
}

#[derive(Clone)]
struct RouterState {
    resources: Resources,
    host: String,
}

fn media_router(resources: Resources, host: String) -> Router {
    Router::new()
        .route(
            "/media/:token",
            get(serve_media).head(serve_media).options(serve_media),
        )
        .with_state(RouterState { resources, host })
}

async fn serve_media(
    State(state): State<RouterState>,
    RoutePath(token): RoutePath<String>,
    method: Method,
    headers: HeaderMap,
) -> Response {
    // 核对 Host，避免通过 DNS 重绑定访问本地服务。
    if headers.get(header::HOST).and_then(|h| h.to_str().ok()) != Some(&state.host) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let media = state.resources.lock().unwrap().get(&token).cloned();
    let Some(media) = media else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if headers
        .get(header::ORIGIN)
        .is_some_and(|value| value.as_bytes() != media.origin.as_bytes())
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    if !media.active.load(Ordering::Relaxed) {
        return StatusCode::GONE.into_response();
    }
    let metadata = match media.file.metadata() {
        Ok(metadata) => metadata,
        Err(_) => return StatusCode::GONE.into_response(),
    };
    if metadata.len() != media.length || metadata.modified().ok() != media.modified {
        return StatusCode::GONE.into_response();
    }
    let response = Response::builder()
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, &media.origin)
        .header(header::ACCESS_CONTROL_ALLOW_METHODS, "GET, HEAD, OPTIONS")
        .header(header::ACCESS_CONTROL_ALLOW_HEADERS, "Range")
        .header(
            header::ACCESS_CONTROL_EXPOSE_HEADERS,
            "Content-Length, Content-Range, Accept-Ranges",
        )
        .header(header::VARY, "Origin")
        .header(header::CACHE_CONTROL, "no-store")
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_TYPE, &media.mime)
        .header("X-Content-Type-Options", "nosniff");
    if method == Method::OPTIONS {
        return response
            .status(StatusCode::NO_CONTENT)
            .body(Body::empty())
            .unwrap();
    }
    let range = if method == Method::GET {
        parse_range(
            headers.get(header::RANGE).and_then(|h| h.to_str().ok()),
            media.length,
        )
    } else {
        ByteRange::Full
    };
    let (response, start, count) = match range {
        ByteRange::Unsatisfiable => {
            return response
                .status(StatusCode::RANGE_NOT_SATISFIABLE)
                .header(header::CONTENT_RANGE, format!("bytes */{}", media.length))
                .body(Body::empty())
                .unwrap()
        }
        ByteRange::Full => (response.status(StatusCode::OK), 0, media.length),
        ByteRange::Partial(start, end) => (
            response.status(StatusCode::PARTIAL_CONTENT).header(
                header::CONTENT_RANGE,
                format!("bytes {start}-{end}/{}", media.length),
            ),
            start,
            end - start + 1,
        ),
    };
    let body = if method == Method::HEAD {
        Body::empty()
    } else {
        let stream: futures_util::stream::BoxStream<'static, Result<Vec<u8>, io::Error>> = Box::pin(
            async_stream::try_stream! {
                let mut offset = start;
                let end = start + count;
                while offset < end {
                    if !media.active.load(Ordering::Relaxed) {
                        Err(io::Error::new(io::ErrorKind::Interrupted, "媒体已关闭"))?;
                    }
                    let file = media.clone();
                    let size = (end-offset).min(64 * 1024) as usize;
                    let bytes = tokio::task::spawn_blocking(move || {
                        let mut bytes = vec![0u8; size];
                        let count = file.file.read_at(&mut bytes, offset)?;
                        if count == 0 { return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "媒体文件已更改")); }
                        bytes.truncate(count);
                        Ok::<_, io::Error>(bytes)
                    }).await.map_err(io::Error::other)??;
                    offset += bytes.len() as u64;
                    yield bytes;
                }
            },
        );
        Body::from_stream(stream)
    };
    response
        .header(header::CONTENT_LENGTH, count)
        .body(body)
        .unwrap()
}
#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::to_bytes, http::Request};
    use std::io::Write;
    use tower::ServiceExt;

    fn fixture() -> (
        tempfile::NamedTempFile,
        Arc<MediaFile>,
        MediaStreamState,
        Router,
        Vec<u8>,
    ) {
        let mut file = tempfile::Builder::new().suffix(".mp4").tempfile().unwrap();
        let bytes: Vec<u8> = (0..200_000).map(|n| (n % 251) as u8).collect();
        file.write_all(&bytes).unwrap();
        let media =
            Arc::new(open_media(file.path(), "main".into(), "tauri://localhost".into()).unwrap());
        let state = MediaStreamState::default();
        state
            .resources
            .lock()
            .unwrap()
            .insert("granted".into(), media.clone());
        let router = media_router(state.resources.clone(), "127.0.0.1:1234".into());
        (file, media, state, router, bytes)
    }

    fn request(method: &str, token: &str, range: Option<&str>) -> Request<Body> {
        let mut request = Request::builder()
            .method(method)
            .uri(format!("/media/{token}"))
            .header(header::HOST, "127.0.0.1:1234")
            .header(header::ORIGIN, "tauri://localhost");
        if let Some(range) = range {
            request = request.header(header::RANGE, range);
        }
        request.body(Body::empty()).unwrap()
    }

    // 保护 HTTP 读取与拖动进度的公开契约，断言实际字节，不耦合读取块大小。
    #[tokio::test]
    async fn streams_full_head_and_ranges_without_shared_cursors() {
        let (_file, _, _, router, bytes) = fixture();
        let response = router
            .clone()
            .oneshot(request("GET", "granted", None))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[header::CONTENT_LENGTH], "200000");
        assert_eq!(response.headers()[header::CONTENT_TYPE], "video/mp4");
        assert_eq!(
            response.headers()[header::ACCESS_CONTROL_ALLOW_ORIGIN],
            "tauri://localhost"
        );
        assert_eq!(
            to_bytes(response.into_body(), 300_000)
                .await
                .unwrap()
                .as_ref(),
            bytes
        );
        let response = router
            .clone()
            .oneshot(request("HEAD", "granted", Some("bytes=8-15")))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(response.headers()[header::CONTENT_LENGTH], "200000");
        assert!(to_bytes(response.into_body(), 1).await.unwrap().is_empty());
        let (left, right) = tokio::join!(
            router
                .clone()
                .oneshot(request("GET", "granted", Some("bytes=3-100003"))),
            router.oneshot(request("GET", "granted", Some("bytes=-99999")))
        );
        let left = left.unwrap();
        let right = right.unwrap();
        assert_eq!(left.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(
            left.headers()[header::CONTENT_RANGE],
            "bytes 3-100003/200000"
        );
        let (left, right) = tokio::join!(
            to_bytes(left.into_body(), 200_000),
            to_bytes(right.into_body(), 200_000)
        );
        assert_eq!(left.unwrap().as_ref(), &bytes[3..100004]);
        assert_eq!(right.unwrap().as_ref(), &bytes[100001..]);
    }

    #[tokio::test]
    async fn handles_open_suffix_clamped_and_invalid_ranges() {
        let (_file, _, _, router, bytes) = fixture();
        for (range, status, expected, content_range) in [
            (
                "bytes=199997-",
                206,
                &bytes[199997..],
                Some("bytes 199997-199999/200000"),
            ),
            (
                "bytes=199998-999999",
                206,
                &bytes[199998..],
                Some("bytes 199998-199999/200000"),
            ),
            ("bytes=200000-", 416, &bytes[0..0], Some("bytes */200000")),
            ("bytes=-0", 416, &bytes[0..0], Some("bytes */200000")),
            ("bytes=0-1,3-4", 200, &bytes[..], None),
            ("bytes=invalid", 200, &bytes[..], None),
        ] {
            let response = router
                .clone()
                .oneshot(request("GET", "granted", Some(range)))
                .await
                .unwrap();
            assert_eq!(response.status().as_u16(), status, "{range}");
            assert_eq!(
                response
                    .headers()
                    .get(header::CONTENT_RANGE)
                    .map(|h| h.to_str().unwrap()),
                content_range
            );
            assert_eq!(
                to_bytes(response.into_body(), 300_000)
                    .await
                    .unwrap()
                    .as_ref(),
                expected
            );
        }
        assert_eq!(parse_range(Some("bytes=0-"), 0), ByteRange::Unsatisfiable);
        assert_eq!(parse_range(None, 0), ByteRange::Full);
    }

    #[tokio::test]
    async fn rejects_ungranted_tokens_foreign_origins_and_dns_rebinding() {
        let (_file, _, _, router, _) = fixture();
        assert_eq!(
            router
                .clone()
                .oneshot(request("GET", "unknown", None))
                .await
                .unwrap()
                .status(),
            StatusCode::NOT_FOUND
        );
        for (name, value) in [
            (header::ORIGIN, "https://attacker.example"),
            (header::HOST, "attacker.example:1234"),
        ] {
            let mut req = request("GET", "granted", None);
            req.headers_mut().insert(name, value.parse().unwrap());
            assert_eq!(
                router.clone().oneshot(req).await.unwrap().status(),
                StatusCode::FORBIDDEN
            );
        }
        let mut req = request("GET", "granted", None);
        req.headers_mut().remove(header::ORIGIN);
        assert_eq!(
            router.clone().oneshot(req).await.unwrap().status(),
            StatusCode::OK
        );
        let response = router
            .oneshot(request("OPTIONS", "granted", None))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        assert_eq!(
            response.headers()[header::ACCESS_CONTROL_ALLOW_HEADERS],
            "Range"
        );
    }

    #[tokio::test]
    async fn revocation_is_owned_and_cancels_existing_streams() {
        let (_file, media, state, router, _) = fixture();
        state.release("other-window", "granted");
        let response = router
            .clone()
            .oneshot(request("GET", "granted", None))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        state.release("main", "granted");
        assert!(!media.active.load(Ordering::Relaxed));
        assert!(to_bytes(response.into_body(), 300_000).await.is_err());
        assert_eq!(
            router
                .clone()
                .oneshot(request("GET", "granted", None))
                .await
                .unwrap()
                .status(),
            StatusCode::NOT_FOUND
        );
        state
            .resources
            .lock()
            .unwrap()
            .insert("granted".into(), media.clone());
        state.release_window("main");
        assert_eq!(
            router
                .oneshot(request("GET", "granted", None))
                .await
                .unwrap()
                .status(),
            StatusCode::NOT_FOUND
        );
    }

    #[tokio::test]
    async fn file_replacement_does_not_redirect_a_lease_and_in_place_changes_expire_it() {
        let (file, _, _, router, bytes) = fixture();
        let original = file.path().with_extension("original");
        std::fs::rename(file.path(), &original).unwrap();
        std::fs::write(file.path(), b"replacement").unwrap();
        let response = router
            .clone()
            .oneshot(request("GET", "granted", Some("bytes=0-7")))
            .await
            .unwrap();
        assert_eq!(
            to_bytes(response.into_body(), 16).await.unwrap().as_ref(),
            &bytes[..8]
        );
        std::fs::write(&original, b"changed").unwrap();
        assert_eq!(
            router
                .oneshot(request("GET", "granted", None))
                .await
                .unwrap()
                .status(),
            StatusCode::GONE
        );
        std::fs::remove_file(original).unwrap();
    }

    #[test]
    fn rejects_non_media_and_directories() {
        let directory = tempfile::tempdir().unwrap();
        assert!(open_media(directory.path(), "main".into(), "tauri://localhost".into()).is_err());
        let text = directory.path().join("note.txt");
        std::fs::write(&text, "hello").unwrap();
        assert!(open_media(&text, "main".into(), "tauri://localhost".into()).is_err());
    }
}
