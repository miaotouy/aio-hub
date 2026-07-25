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

//! Narrow, crash-safe persistence primitive for llm-chat session files.
//! The command deliberately accepts only logical llm-chat identifiers rather
//! than arbitrary filesystem paths.

use crate::utils::get_app_data_dir;
use fs2::FileExt;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::AppHandle;
use uuid::Uuid;

const MODULE_NAME: &str = "llm-chat";
const LOCK_TIMEOUT: Duration = Duration::from_secs(5);

static PATH_LOCKS: Lazy<Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmChatAtomicWriteRequest {
    pub kind: LlmChatFileKind,
    pub session_id: Option<String>,
    pub content: String,
    pub revision: u64,
    pub expected_min_revision: Option<u64>,
    pub keep_last_valid_backup: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LlmChatFileKind {
    Session,
    Index,
    CorruptionManifest,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmChatAtomicWriteResult {
    pub outcome: String,
    pub revision: u64,
    pub bytes: usize,
    pub write_ms: u128,
    pub sync_ms: u128,
    pub replace_ms: u128,
}

fn path_lock(path: &Path) -> Arc<Mutex<()>> {
    let mut locks = PATH_LOCKS.lock().unwrap_or_else(|error| error.into_inner());
    locks
        .entry(path.to_path_buf())
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone()
}

fn validate_session_id(session_id: &str) -> Result<(), String> {
    if session_id.is_empty()
        || session_id.len() > 180
        || session_id.contains("..")
        || session_id.contains(['/', '\\', ':'])
        || Path::new(session_id).is_absolute()
    {
        return Err("Invalid llm-chat session id".to_string());
    }
    Ok(())
}

fn resolve_target(app: &AppHandle, request: &LlmChatAtomicWriteRequest) -> Result<PathBuf, String> {
    let module_dir = get_app_data_dir(app.config()).join(MODULE_NAME);
    match request.kind {
        LlmChatFileKind::Session => {
            let session_id = request
                .session_id
                .as_deref()
                .ok_or_else(|| "sessionId is required for session persistence".to_string())?;
            validate_session_id(session_id)?;
            Ok(module_dir
                .join("sessions")
                .join(format!("{session_id}.json")))
        }
        LlmChatFileKind::Index => {
            if request.session_id.is_some() {
                return Err("sessionId is not allowed for index persistence".to_string());
            }
            Ok(module_dir.join("sessions-index.json"))
        }
        LlmChatFileKind::CorruptionManifest => {
            if request.session_id.is_some() {
                return Err(
                    "sessionId is not allowed for corruption manifest persistence".to_string(),
                );
            }
            Ok(module_dir
                .join("sessions-corrupt")
                .join("corruption-manifest.json"))
        }
    }
}

fn content_revision(value: &Value) -> u64 {
    value
        .get("_persistence")
        .and_then(|meta| meta.get("revision"))
        .and_then(Value::as_u64)
        .unwrap_or(0)
}

fn parse_and_validate_content(request: &LlmChatAtomicWriteRequest) -> Result<Value, String> {
    let value: Value = serde_json::from_str(&request.content)
        .map_err(|error| format!("llm-chat persistence content is invalid JSON: {error}"))?;
    if !value.is_object() {
        return Err("llm-chat persistence content must be a JSON object".to_string());
    }
    if content_revision(&value) != request.revision {
        return Err("_persistence.revision must match the requested revision".to_string());
    }
    if matches!(request.kind, LlmChatFileKind::Session) {
        let session_id = request
            .session_id
            .as_deref()
            .expect("validated by target resolution");
        if value.get("id").and_then(Value::as_str) != Some(session_id) {
            return Err("session content id must match sessionId".to_string());
        }
    }
    Ok(value)
}

fn read_valid_revision(path: &Path) -> Option<u64> {
    let content = fs::read_to_string(path).ok()?;
    let value: Value = serde_json::from_str(&content).ok()?;
    if !value.is_object() {
        return None;
    }
    Some(content_revision(&value))
}

fn acquire_process_lock(lock_path: &Path) -> Result<File, String> {
    let file = OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .open(lock_path)
        .map_err(|error| format!("open persistence lock failed: {error}"))?;
    let started = Instant::now();
    loop {
        match file.try_lock_exclusive() {
            Ok(()) => return Ok(file),
            Err(error) if started.elapsed() < LOCK_TIMEOUT => {
                if error.kind() != std::io::ErrorKind::WouldBlock {
                    return Err(format!("acquire persistence lock failed: {error}"));
                }
                thread::sleep(Duration::from_millis(25));
            }
            Err(error) => return Err(format!("persistence lock timed out: {error}")),
        }
    }
}

fn unique_temp_path(target: &Path) -> PathBuf {
    let file_name = target
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("llm-chat.json");
    target.with_file_name(format!(".{file_name}.{}.tmp", Uuid::new_v4()))
}

fn write_synced_temp(target: &Path, content: &[u8]) -> Result<(PathBuf, u128, u128), String> {
    let parent = target
        .parent()
        .ok_or_else(|| "persistence target has no parent directory".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("create persistence directory failed: {error}"))?;
    let temp_path = unique_temp_path(target);
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp_path)
        .map_err(|error| format!("create persistence temporary file failed: {error}"))?;

    let write_started = Instant::now();
    if let Err(error) = file.write_all(content).and_then(|_| file.flush()) {
        let _ = fs::remove_file(&temp_path);
        return Err(format!("write persistence temporary file failed: {error}"));
    }
    let write_ms = write_started.elapsed().as_millis();
    let sync_started = Instant::now();
    if let Err(error) = file.sync_all() {
        let _ = fs::remove_file(&temp_path);
        return Err(format!("sync persistence temporary file failed: {error}"));
    }
    Ok((temp_path, write_ms, sync_started.elapsed().as_millis()))
}

#[cfg(windows)]
fn replace_file(temp_path: &Path, target: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{ReplaceFileW, REPLACE_FILE_FLAGS};

    if !target.exists() {
        return fs::rename(temp_path, target)
            .map_err(|error| format!("create persistence target failed: {error}"));
    }
    let target_wide: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    let temp_wide: Vec<u16> = temp_path.as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe {
        ReplaceFileW(
            PCWSTR(target_wide.as_ptr()),
            PCWSTR(temp_wide.as_ptr()),
            None,
            REPLACE_FILE_FLAGS(0),
            None,
            None,
        )
    }
    .map_err(|error| format!("replace persistence target failed: {error}"))
}

#[cfg(not(windows))]
fn replace_file(temp_path: &Path, target: &Path) -> Result<(), String> {
    fs::rename(temp_path, target)
        .map_err(|error| format!("replace persistence target failed: {error}"))
}

fn replace_with_synced_content(
    target: &Path,
    content: &[u8],
) -> Result<(u128, u128, u128), String> {
    let (temp_path, write_ms, sync_ms) = write_synced_temp(target, content)?;
    let replace_started = Instant::now();
    if let Err(error) = replace_file(&temp_path, target) {
        let _ = fs::remove_file(&temp_path);
        return Err(error);
    }
    Ok((write_ms, sync_ms, replace_started.elapsed().as_millis()))
}

fn rotate_valid_backup(target: &Path) -> Result<(), String> {
    let content = match fs::read(target) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("read index backup source failed: {error}")),
    };
    let parsed: Value = match serde_json::from_slice::<Value>(&content) {
        Ok(value) if value.is_object() => value,
        _ => return Ok(()), // Never overwrite a valid backup with a damaged primary.
    };
    let _ = parsed;
    let backup = target.with_extension("json.bak");
    replace_with_synced_content(&backup, &content).map(|_| ())
}

#[tauri::command]
pub fn llm_chat_atomic_write(
    app: AppHandle,
    request: LlmChatAtomicWriteRequest,
) -> Result<LlmChatAtomicWriteResult, String> {
    let target = resolve_target(&app, &request)?;
    let _content = parse_and_validate_content(&request)?;
    let in_process_lock = path_lock(&target);
    let _guard = in_process_lock
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let lock_path = target.with_extension("json.lock");
    let process_lock = acquire_process_lock(&lock_path)?;

    let current_revision = read_valid_revision(&target).unwrap_or(0);
    if request.revision <= current_revision
        || request
            .expected_min_revision
            .is_some_and(|expected| current_revision < expected)
    {
        let _ = process_lock.unlock();
        return Ok(LlmChatAtomicWriteResult {
            outcome: "staleRejected".to_string(),
            revision: current_revision,
            bytes: 0,
            write_ms: 0,
            sync_ms: 0,
            replace_ms: 0,
        });
    }

    if request.keep_last_valid_backup {
        rotate_valid_backup(&target)?;
    }
    let (write_ms, sync_ms, replace_ms) =
        replace_with_synced_content(&target, request.content.as_bytes())?;
    let _ = process_lock.unlock();
    Ok(LlmChatAtomicWriteResult {
        outcome: "committed".to_string(),
        revision: request.revision,
        bytes: request.content.len(),
        write_ms,
        sync_ms,
        replace_ms,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn content(revision: u64) -> Vec<u8> {
        format!(r#"{{"_persistence":{{"revision":{revision}}}}}"#).into_bytes()
    }

    #[test]
    fn rejects_unsafe_session_id() {
        for session_id in ["", "../session", "a/b", "a\\b", "C:session"] {
            assert!(validate_session_id(session_id).is_err(), "{session_id}");
        }
        assert!(validate_session_id("session-123").is_ok());
    }

    #[test]
    fn atomic_replacement_keeps_valid_json() {
        let directory = tempdir().unwrap();
        let target = directory.path().join("session.json");
        replace_with_synced_content(&target, &content(1)).unwrap();
        replace_with_synced_content(&target, &content(2)).unwrap();
        assert_eq!(read_valid_revision(&target), Some(2));
    }

    #[test]
    fn damaged_primary_does_not_replace_backup() {
        let directory = tempdir().unwrap();
        let target = directory.path().join("sessions-index.json");
        let backup = directory.path().join("sessions-index.json.bak");
        fs::write(&target, b"\0not-json").unwrap();
        fs::write(&backup, content(9)).unwrap();
        rotate_valid_backup(&target).unwrap();
        assert_eq!(read_valid_revision(&backup), Some(9));
    }
}
