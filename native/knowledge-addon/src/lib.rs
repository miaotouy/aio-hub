use napi::bindgen_prelude::*;
use napi_derive::napi;
use serde::de::DeserializeOwned;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;

mod deduplicator;
mod dir_search;
mod symlink_mover;
mod system_pulse;
mod web_distillery;
mod image_capture;
mod raster_image;
mod window_automation;
mod code_formatter;
#[path = "../../../src-tauri/src/file_operation_types.rs"]
mod file_operation_types;
mod recall;
pub use recall::RecallRuntime;

#[path = "../../../src-tauri/src/knowledge/repository.rs"]
mod repository;
#[path = "../../../src-tauri/src/knowledge/types.rs"]
pub(crate) mod types;

mod knowledge {
    pub(crate) use crate::repository::KnowledgeRepository;
    pub(crate) use crate::types;
}
use repository::KnowledgeRepository;
use types::*;

fn error(value: impl std::fmt::Display) -> Error {
    Error::from_reason(value.to_string())
}
fn decode<T: DeserializeOwned>(value: &Value) -> Result<T> {
    serde_json::from_value(value.clone()).map_err(error)
}
fn text<'a>(value: &'a Value, key: &str) -> Result<&'a str> {
    value
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| error(format!("missing {key}")))
}
fn number(value: &Value, key: &str, default: usize) -> Result<usize> {
    let Some(value) = value.get(key) else {
        return Ok(default);
    };
    let value = value
        .as_u64()
        .ok_or_else(|| error(format!("{key} 必须是非负整数")))?;
    usize::try_from(value).map_err(|_| error(format!("{key} 超出平台范围")))
}

#[napi]
pub struct KnowledgeRuntime {
    repository: Arc<KnowledgeRepository>,
}

#[napi]
impl KnowledgeRuntime {
    #[napi(constructor)]
    pub fn new(data_directory: String) -> Self {
        Self {
            repository: Arc::new(KnowledgeRepository::new(PathBuf::from(data_directory))),
        }
    }

    #[napi]
    pub async fn initialize(&self) -> Result<()> {
        let repository = Arc::clone(&self.repository);
        tokio::task::spawn_blocking(move || repository.initialize().map_err(error))
            .await
            .map_err(error)?
    }

    #[napi]
    pub async fn execute(&self, command: String, arguments: String) -> Result<String> {
        let args: Value = serde_json::from_str(&arguments).map_err(error)?;
        let repository = Arc::clone(&self.repository);
        tokio::task::spawn_blocking(move || dispatch(&repository, &command, &args))
            .await
            .map_err(error)?
    }
}

fn dispatch(repo: &KnowledgeRepository, command: &str, a: &Value) -> Result<String> {
    let value = match command {
        "knowledge_create_library" => {
            let name = text(a, "name")?;
            if name.trim().is_empty() {
                return Err(error("Knowledge library 名称不能为空"));
            }
            let config = a
                .get("config")
                .filter(|v| !v.is_null())
                .map(decode::<KnowledgeLibraryIndexConfig>)
                .transpose()?;
            json!(repo
                .create_library(
                    name,
                    a.get("description").and_then(Value::as_str),
                    config.as_ref()
                )
                .map_err(error)?)
        }
        "knowledge_update_library" => json!(repo
            .update_library(
                text(a, "libraryId")?,
                text(a, "name")?,
                a.get("description").and_then(Value::as_str)
            )
            .map_err(error)?),
        "knowledge_apply_library_config" => json!(repo
            .apply_library_config_and_rebuild(
                text(a, "libraryId")?,
                &decode::<KnowledgeLibraryIndexConfig>(
                    a.get("config").ok_or_else(|| error("missing config"))?
                )?
            )
            .map_err(error)?),
        "knowledge_list_libraries" => json!(repo.list_libraries().map_err(error)?),
        "knowledge_delete_library" => {
            repo.delete_library(text(a, "libraryId")?).map_err(error)?;
            Value::Null
        }
        "knowledge_ingest_document" => {
            let request = decode::<KnowledgeIngestRequest>(
                a.get("request").ok_or_else(|| error("missing request"))?,
            )?;
            if request.content.trim().is_empty() {
                return Err(error("Knowledge document 内容不能为空"));
            }
            json!(repo.ingest(&request).map_err(error)?)
        }
        "knowledge_enqueue_paths" => json!(repo
            .enqueue_paths(&decode::<KnowledgeEnqueuePathsRequest>(
                a.get("request").ok_or_else(|| error("missing request"))?
            )?)
            .map_err(error)?),
        "knowledge_list_sources" => {
            json!(repo.list_sources(text(a, "libraryId")?).map_err(error)?)
        }
        "knowledge_list_ingest_tasks" => json!(repo
            .list_ingest_tasks(text(a, "libraryId")?, number(a, "limit", 200)?)
            .map_err(error)?),
        "knowledge_claim_ingest_task" => json!(repo
            .claim_ingest_task(text(a, "libraryId")?, number(a, "leaseSeconds", 30)?)
            .map_err(error)?),
        "knowledge_complete_ingest_task" => json!(repo
            .complete_ingest_task(&decode::<KnowledgeCompleteIngestTaskRequest>(
                a.get("request").ok_or_else(|| error("missing request"))?
            )?)
            .map_err(error)?),
        "knowledge_fail_ingest_task" => json!(repo
            .fail_ingest_task(&decode::<KnowledgeFailIngestTaskRequest>(
                a.get("request").ok_or_else(|| error("missing request"))?
            )?)
            .map_err(error)?),
        "knowledge_cancel_ingest_task" => {
            repo.cancel_ingest_task(text(a, "libraryId")?, text(a, "taskId")?)
                .map_err(error)?;
            Value::Null
        }
        "knowledge_retry_ingest_task" => json!(repo
            .retry_ingest_task(text(a, "libraryId")?, text(a, "taskId")?)
            .map_err(error)?),
        "knowledge_add_directory_source" => json!(repo
            .add_directory_source(&decode::<KnowledgeDirectorySourceRequest>(
                a.get("request").ok_or_else(|| error("missing request"))?
            )?)
            .map_err(error)?),
        "knowledge_rescan_directory_source" => json!(repo
            .rescan_directory_source(
                text(a, "libraryId")?,
                text(a, "sourceId")?,
                number(a, "maxFileBytes", 0)?,
                number(a, "maxAttempts", 3)?,
                text(a, "parserVersion")?
            )
            .map_err(error)?),
        "knowledge_remove_source" => {
            repo.remove_source(text(a, "libraryId")?, text(a, "sourceId")?)
                .map_err(error)?;
            Value::Null
        }
        "knowledge_list_documents" => {
            json!(repo.list_documents(text(a, "libraryId")?).map_err(error)?)
        }
        "knowledge_update_document_tags" => json!(repo
            .update_document_tags(
                text(a, "libraryId")?,
                text(a, "documentId")?,
                &decode::<Vec<String>>(a.get("tags").ok_or_else(|| error("missing tags"))?)?
            )
            .map_err(error)?),
        "knowledge_list_chunks" => json!(repo
            .list_chunks(
                text(a, "libraryId")?,
                a.get("documentId").and_then(Value::as_str)
            )
            .map_err(error)?),
        "knowledge_list_unvectorized_chunks" => json!(repo
            .list_unvectorized_chunks(text(a, "libraryId")?, text(a, "spaceId")?)
            .map_err(error)?),
        "knowledge_delete_document" => {
            repo.delete_document(text(a, "libraryId")?, text(a, "documentId")?)
                .map_err(error)?;
            Value::Null
        }
        "knowledge_rebuild_library" => {
            json!(repo.rebuild_library(text(a, "libraryId")?).map_err(error)?)
        }
        "knowledge_save_chunk_vectors" => {
            repo.save_vectors(
                text(a, "libraryId")?,
                text(a, "spaceId")?,
                text(a, "descriptorJson")?,
                text(a, "routeKey")?,
                &decode::<Vec<KnowledgeVectorRecord>>(
                    a.get("records").ok_or_else(|| error("missing records"))?,
                )?,
            )
            .map_err(error)?;
            Value::Null
        }
        "knowledge_get_index_status" => json!(repo
            .get_index_status(text(a, "libraryId")?)
            .map_err(error)?),
        "knowledge_switch_embedding_route" => {
            repo.switch_embedding_route(
                text(a, "libraryId")?,
                text(a, "spaceId")?,
                text(a, "routeKey")?,
            )
            .map_err(error)?;
            Value::Null
        }
        "knowledge_search" => {
            let request = decode::<KnowledgeSearchRequest>(
                a.get("request").ok_or_else(|| error("missing request"))?,
            )?;
            if request.query.trim().is_empty() {
                Value::Array(Vec::new())
            } else {
                json!(repo.search(&request).map_err(error)?)
            }
        }
        _ => return Err(error(format!("未知 Knowledge 命令: {command}"))),
    };
    serde_json::to_string(&value).map_err(error)
}
