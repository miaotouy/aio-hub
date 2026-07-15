use std::{collections::HashMap, path::Path, sync::Mutex, time::Duration};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue},
    Method,
};
use serde::{Deserialize, Serialize};
use tokio_util::{io::ReaderStream, sync::CancellationToken};

const MAX_PATH_LENGTH: usize = 4096;
const MAX_CONTENT_TYPE_LENGTH: usize = 255;
const MAX_RESPONSE_SIZE: usize = 128 * 1024 * 1024;

#[derive(Default)]
pub struct NativeRequestState {
    requests: Mutex<HashMap<String, CancellationToken>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeFileRequest {
    request_id: String,
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body: NativeRequestBody,
    timeout_ms: Option<u64>,
    network: Option<NativeNetworkOptions>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeNetworkOptions {
    proxy_url: Option<String>,
    relax_invalid_certs: Option<bool>,
    http1_only: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
enum NativeRequestBody {
    Json { value: serde_json::Value },
    Multipart { parts: Vec<MultipartPart> },
    FileRef { r#ref: LocalFileRef },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LocalFileRef {
    kind: String,
    path: String,
    content_type: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MultipartPart {
    name: String,
    body: MultipartPartBody,
    filename: Option<String>,
    content_type: Option<String>,
    headers: Option<HashMap<String, String>>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
enum MultipartPartBody {
    Text { value: String },
    Bytes { base64: String },
    FileRef { r#ref: LocalFileRef },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeFileResponse {
    status: u16,
    status_text: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

#[tauri::command]
pub async fn send_llm_file_request(
    request: NativeFileRequest,
    state: tauri::State<'_, NativeRequestState>,
) -> Result<NativeFileResponse, String> {
    validate_request(&request)?;
    let cancellation = CancellationToken::new();
    {
        let mut requests = state
            .requests
            .lock()
            .map_err(|_| "Native request state is unavailable".to_string())?;
        if requests
            .insert(request.request_id.clone(), cancellation.clone())
            .is_some()
        {
            return Err("A native request with this id is already running".into());
        }
    }

    let request_id = request.request_id.clone();
    let result = tokio::select! {
        _ = cancellation.cancelled() => Err("Native file request cancelled".to_string()),
        result = execute_request(request, cancellation.clone()) => result,
    };

    if let Ok(mut requests) = state.requests.lock() {
        requests.remove(&request_id);
    }
    result
}

#[tauri::command]
pub fn cancel_llm_file_request(
    request_id: String,
    state: tauri::State<'_, NativeRequestState>,
) -> Result<bool, String> {
    let requests = state
        .requests
        .lock()
        .map_err(|_| "Native request state is unavailable".to_string())?;
    if let Some(token) = requests.get(&request_id) {
        token.cancel();
        return Ok(true);
    }
    Ok(false)
}

fn validate_request(request: &NativeFileRequest) -> Result<(), String> {
    if request.request_id.is_empty() || request.request_id.len() > 255 {
        return Err("Invalid native request id".into());
    }
    let url = reqwest::Url::parse(&request.url).map_err(|_| "Invalid upstream URL")?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Unsupported upstream URL scheme".into());
    }
    Method::from_bytes(request.method.as_bytes()).map_err(|_| "Unsupported HTTP method")?;
    parse_headers(&request.headers)?;
    Ok(())
}

async fn execute_request(
    mut request: NativeFileRequest,
    cancellation: CancellationToken,
) -> Result<NativeFileResponse, String> {
    let mut builder = reqwest::Client::builder();
    if let Some(timeout_ms) = request.timeout_ms.filter(|value| *value > 0) {
        builder = builder.timeout(Duration::from_millis(timeout_ms));
    }
    if let Some(network) = &request.network {
        if network.relax_invalid_certs.unwrap_or(false) {
            builder = builder.danger_accept_invalid_certs(true);
        }
        if network.http1_only.unwrap_or(false) {
            builder = builder.http1_only();
        }
        if let Some(proxy_url) = network
            .proxy_url
            .as_deref()
            .filter(|value| !value.is_empty())
        {
            builder = builder
                .proxy(reqwest::Proxy::all(proxy_url).map_err(|_| "Invalid native proxy URL")?);
        }
    }
    let client = builder
        .build()
        .map_err(|_| "Failed to initialize native HTTP client".to_string())?;
    let method = Method::from_bytes(request.method.as_bytes())
        .map_err(|_| "Unsupported HTTP method".to_string())?;
    let headers = parse_headers(&request.headers)?;
    let mut outgoing = client.request(method, &request.url).headers(headers);

    outgoing = match &mut request.body {
        NativeRequestBody::Json { value } => {
            expand_json_file_refs(value).await?;
            outgoing.json(value)
        }
        NativeRequestBody::FileRef { r#ref } => {
            validate_file_ref(r#ref)?;
            let file = tokio::fs::File::open(&r#ref.path)
                .await
                .map_err(|_| "Failed to read top-level local file".to_string())?;
            let body = reqwest::Body::wrap_stream(ReaderStream::new(file));
            if let Some(content_type) = &r#ref.content_type {
                outgoing = outgoing.header(reqwest::header::CONTENT_TYPE, content_type);
            }
            outgoing.body(body)
        }
        NativeRequestBody::Multipart { parts } => {
            let form = build_multipart_form(std::mem::take(parts)).await?;
            outgoing.multipart(form)
        }
    };

    let response = tokio::select! {
        _ = cancellation.cancelled() => return Err("Native file request cancelled".into()),
        result = outgoing.send() => result.map_err(|error| format!("Native file request failed: {error}"))?,
    };
    let status = response.status();
    let headers = response_headers(&response);
    let body = tokio::select! {
        _ = cancellation.cancelled() => return Err("Native file request cancelled".into()),
        result = read_limited_response(response) => result?,
    };

    Ok(NativeFileResponse {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or_default().to_string(),
        headers,
        body,
    })
}

async fn read_limited_response(mut response: reqwest::Response) -> Result<Vec<u8>, String> {
    let mut result = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("Failed to read native response: {error}"))?
    {
        if result.len().saturating_add(chunk.len()) > MAX_RESPONSE_SIZE {
            return Err("Native response exceeds the size limit".into());
        }
        result.extend_from_slice(&chunk);
    }
    Ok(result)
}

async fn expand_json_file_refs(value: &mut serde_json::Value) -> Result<(), String> {
    match value {
        serde_json::Value::Object(map) => {
            if map.get("kind").and_then(serde_json::Value::as_str) == Some("local-file-ref") {
                let file_ref =
                    serde_json::from_value::<LocalFileRef>(serde_json::Value::Object(map.clone()))
                        .map_err(|_| "Invalid tagged local file reference".to_string())?;
                validate_file_ref(&file_ref)?;
                let bytes = tokio::fs::read(&file_ref.path)
                    .await
                    .map_err(|_| "Failed to read tagged local file reference".to_string())?;
                let content_type = file_ref
                    .content_type
                    .as_deref()
                    .unwrap_or("application/octet-stream");
                *value = serde_json::Value::String(format!(
                    "data:{content_type};base64,{}",
                    STANDARD.encode(bytes)
                ));
                return Ok(());
            }
            for child in map.values_mut() {
                Box::pin(expand_json_file_refs(child)).await?;
            }
        }
        serde_json::Value::Array(values) => {
            for child in values {
                Box::pin(expand_json_file_refs(child)).await?;
            }
        }
        _ => {}
    }
    Ok(())
}

async fn build_multipart_form(
    parts: Vec<MultipartPart>,
) -> Result<reqwest::multipart::Form, String> {
    let mut form = reqwest::multipart::Form::new();
    for part in parts {
        if part.name.is_empty() || part.name.len() > 1024 {
            return Err("Invalid multipart part name".into());
        }
        let mut request_part = match part.body {
            MultipartPartBody::Text { value } => reqwest::multipart::Part::text(value),
            MultipartPartBody::Bytes { base64 } => reqwest::multipart::Part::bytes(
                STANDARD
                    .decode(base64)
                    .map_err(|_| "Invalid multipart byte payload".to_string())?,
            ),
            MultipartPartBody::FileRef { r#ref } => {
                validate_file_ref(&r#ref)?;
                let file = tokio::fs::File::open(&r#ref.path)
                    .await
                    .map_err(|_| "Failed to read multipart local file".to_string())?;
                let length = file
                    .metadata()
                    .await
                    .map_err(|_| "Failed to inspect multipart local file".to_string())?
                    .len();
                let body = reqwest::Body::wrap_stream(ReaderStream::new(file));
                let mut request_part = reqwest::multipart::Part::stream_with_length(body, length);
                if part.filename.is_none() {
                    if let Some(filename) = Path::new(&r#ref.path).file_name() {
                        request_part =
                            request_part.file_name(filename.to_string_lossy().into_owned());
                    }
                }
                if part.content_type.is_none() {
                    if let Some(content_type) = r#ref.content_type.as_deref() {
                        request_part = request_part
                            .mime_str(content_type)
                            .map_err(|_| "Invalid multipart content type".to_string())?;
                    }
                }
                request_part
            }
        };
        if let Some(filename) = part.filename {
            request_part = request_part.file_name(filename);
        }
        if let Some(content_type) = part.content_type {
            request_part = request_part
                .mime_str(&content_type)
                .map_err(|_| "Invalid multipart content type".to_string())?;
        }
        if let Some(headers) = part.headers {
            request_part = request_part.headers(parse_headers(&headers)?);
        }
        form = form.part(part.name, request_part);
    }
    Ok(form)
}

fn validate_file_ref(file_ref: &LocalFileRef) -> Result<(), String> {
    if file_ref.kind != "local-file-ref"
        || file_ref.path.is_empty()
        || file_ref.path.len() > MAX_PATH_LENGTH
        || file_ref
            .content_type
            .as_deref()
            .is_some_and(|value| value.is_empty() || value.len() > MAX_CONTENT_TYPE_LENGTH)
    {
        return Err("Invalid tagged local file reference".into());
    }
    Ok(())
}

fn parse_headers(headers: &HashMap<String, String>) -> Result<HeaderMap, String> {
    let mut parsed = HeaderMap::new();
    for (name, value) in headers {
        if matches!(
            name.to_ascii_lowercase().as_str(),
            "host" | "content-length"
        ) {
            continue;
        }
        let name = HeaderName::from_bytes(name.as_bytes())
            .map_err(|_| "Invalid native request header".to_string())?;
        let value = HeaderValue::from_bytes(value.as_bytes())
            .map_err(|_| "Invalid native request header".to_string())?;
        parsed.append(name, value);
    }
    Ok(parsed)
}

fn response_headers(response: &reqwest::Response) -> HashMap<String, String> {
    response
        .headers()
        .iter()
        .filter_map(|(name, value)| {
            value
                .to_str()
                .ok()
                .map(|value| (name.to_string(), value.to_string()))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_lookalike_file_refs_with_extra_fields() {
        let value = serde_json::json!({
            "kind": "local-file-ref",
            "path": "/tmp/image.png",
            "extra": true
        });
        let result = serde_json::from_value::<LocalFileRef>(value);
        assert!(result.is_err());
    }

    #[test]
    fn validates_request_url_and_headers() {
        let request = NativeFileRequest {
            request_id: "test".into(),
            method: "POST".into(),
            url: "file:///tmp/secret".into(),
            headers: HashMap::new(),
            body: NativeRequestBody::Json {
                value: serde_json::json!({}),
            },
            timeout_ms: None,
            network: None,
        };
        assert_eq!(
            validate_request(&request).unwrap_err(),
            "Unsupported upstream URL scheme"
        );
    }
}
