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

pub use crate::dir_search::*;
use tauri::{Emitter, State, Window};

#[tauri::command]
pub async fn dir_search(
    request: SearchRequest,
    window: Window,
    cancellation: State<'_, DirSearchCancellation>,
) -> Result<SearchSummary, String> {
    let search_id = request.search_id.clone();
    let token = match cancellation.begin(&search_id) {
        Ok(token) => token,
        Err(_) => {
            return Ok(SearchSummary {
                search_id,
                files_scanned: 0,
                files_matched: 0,
                total_matches: 0,
                bytes_read: 0,
                duration_ms: 0.0,
                stop_reason: SearchStopReason::Busy,
                truncated: true,
                cancelled: false,
            })
        }
    };
    let result = crate::dir_search::dir_search(request, token, &|event, payload| {
        let _ = window.emit(event, payload);
    });
    let _ = cancellation.finish(&search_id);
    result
}
#[tauri::command]
pub async fn dir_search_cancel(
    search_id: String,
    cancellation: State<'_, DirSearchCancellation>,
) -> Result<(), String> {
    cancellation.cancel(&search_id)?;
    Ok(())
}
#[tauri::command]
pub async fn dir_replace(request: ReplaceRequest) -> Result<ReplaceResult, String> {
    crate::dir_search::dir_replace(request)
}
#[tauri::command]
pub async fn dir_replace_single(
    request: ReplaceSingleRequest,
) -> Result<ReplaceSingleResult, String> {
    crate::dir_search::dir_replace_single(request)
}
#[tauri::command]
pub async fn dir_replace_preview(request: ReplaceRequest) -> Result<Vec<FileSearchResult>, String> {
    crate::dir_search::dir_replace_preview(request)
}
#[tauri::command]
pub async fn dir_search_copy_files(
    request: OrganizeFilesRequest,
) -> Result<OrganizeFilesResult, String> {
    crate::dir_search::dir_search_copy_files(request)
}
#[tauri::command]
pub async fn dir_search_move_files(
    request: OrganizeFilesRequest,
) -> Result<OrganizeFilesResult, String> {
    crate::dir_search::dir_search_move_files(request)
}
