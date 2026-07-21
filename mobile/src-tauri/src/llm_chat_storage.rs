use crate::asset_manager::{self, AssetManagerState, AssetUsageInput};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
    FromRow, QueryBuilder, Sqlite, SqlitePool,
};
use std::{collections::HashSet, path::Path, sync::Arc, time::Duration};
use tauri::{AppHandle, Manager, State};
use tokio::sync::{Mutex, OnceCell};
use uuid::Uuid;

static CHAT_MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations/llm-chat");
const CHAT_DB: &str = "llm_chat.db";
const CHAT_MODULE: &str = "llm-chat";
const DEFAULT_LIST_LIMIT: u32 = 50;
const MAX_LIST_LIMIT: u32 = 200;
const MAX_SEARCH_LIMIT: u32 = 100;
const MAX_OUTBOX_BATCH: u32 = 50;
const MAX_OUTBOX_ATTEMPTS: i64 = 5;
const MAX_EXTRACTED_TEXT_BYTES: usize = 2 * 1024 * 1024;

#[derive(Default)]
pub struct LlmChatStorageState {
    pool: Arc<OnceCell<SqlitePool>>,
    write_lock: Arc<Mutex<()>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSessionInput {
    pub id: String,
    pub name: String,
    pub root_node_id: String,
    pub active_leaf_id: String,
    #[serde(default)]
    pub display_agent_id: Option<String>,
    #[serde(default)]
    pub is_favorite: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageInput {
    pub id: String,
    pub session_id: String,
    pub parent_id: Option<String>,
    #[serde(default)]
    pub sibling_order: i64,
    #[serde(default)]
    pub last_selected_child_id: Option<String>,
    pub role: String,
    #[serde(rename = "type", default = "default_message_type")]
    pub message_type: String,
    #[serde(default)]
    pub content: String,
    #[serde(default = "default_message_status")]
    pub status: String,
    pub timestamp: Option<String>,
    #[serde(default)]
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatAttachmentInput {
    pub id: String,
    pub message_id: String,
    pub asset_id: String,
    pub kind: String,
    pub display_name: String,
    pub mime_type: String,
    pub size_bytes: i64,
    #[serde(default = "default_usage_policy")]
    pub usage_policy: String,
    #[serde(default)]
    pub extracted_text: Option<String>,
    #[serde(default)]
    pub sort_order: i64,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistChatChangesRequest {
    pub session: ChatSessionInput,
    #[serde(default)]
    pub upsert_messages: Vec<ChatMessageInput>,
    #[serde(default)]
    pub delete_message_ids: Vec<String>,
    #[serde(default)]
    pub upsert_attachments: Vec<ChatAttachmentInput>,
    #[serde(default)]
    pub delete_attachment_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSessionListQuery {
    #[serde(default)]
    pub limit: Option<u32>,
    #[serde(default)]
    pub before_updated_at: Option<String>,
    #[serde(default)]
    pub before_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteChatBranchRequest {
    pub session_id: String,
    pub root_message_id: String,
    pub fallback_active_leaf_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSearchQuery {
    pub query: String,
    #[serde(default)]
    pub limit: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSessionListItem {
    pub id: String,
    pub name: String,
    pub root_node_id: String,
    pub active_leaf_id: String,
    pub display_agent_id: Option<String>,
    pub message_count: i64,
    pub is_favorite: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageRecord {
    pub id: String,
    pub session_id: String,
    pub parent_id: Option<String>,
    pub sibling_order: i64,
    pub last_selected_child_id: Option<String>,
    pub role: String,
    #[serde(rename = "type")]
    pub message_type: String,
    pub content: String,
    pub status: String,
    pub timestamp: String,
    pub metadata: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatAttachmentRecord {
    pub id: String,
    pub message_id: String,
    pub asset_id: String,
    pub kind: String,
    pub display_name: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub usage_policy: String,
    pub extracted_text: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSessionSnapshot {
    pub session: ChatSessionListItem,
    pub messages: Vec<ChatMessageRecord>,
    pub attachments: Vec<ChatAttachmentRecord>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistChatChangesResult {
    pub message_count: i64,
    pub outbox_events: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteChatResult {
    pub deleted_messages: usize,
    pub queued_release_events: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatAssetTextReplacementResult {
    pub updated_attachments: usize,
    pub affected_messages: usize,
    pub outbox_events: usize,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ChatSearchResult {
    pub message_id: String,
    pub session_id: String,
    pub session_name: String,
    pub content: String,
    pub snippet: String,
    pub timestamp: String,
    pub rank: f64,
}

#[derive(Debug, FromRow)]
struct BasicSearchRow {
    message_id: String,
    session_id: String,
    session_name: String,
    content: String,
    reasoning_content: Option<String>,
    timestamp: String,
    rank: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DrainOutboxResult {
    pub inspected: usize,
    pub delivered: usize,
    pub failed: usize,
    pub dead_lettered: usize,
}

#[derive(Debug, FromRow)]
struct SessionRow {
    id: String,
    name: String,
    root_node_id: String,
    active_leaf_id: String,
    display_agent_id: Option<String>,
    message_count: i64,
    is_favorite: i64,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, FromRow)]
struct MessageRow {
    id: String,
    session_id: String,
    parent_id: Option<String>,
    sibling_order: i64,
    last_selected_child_id: Option<String>,
    role: String,
    message_type: String,
    content: String,
    status: String,
    timestamp: String,
    reasoning_content: Option<String>,
    metadata_json: Option<String>,
}

#[derive(Debug, FromRow)]
struct AttachmentRow {
    id: String,
    message_id: String,
    asset_id: String,
    kind: String,
    display_name: String,
    mime_type: String,
    size_bytes: i64,
    usage_policy: String,
    extracted_text: Option<String>,
    sort_order: i64,
    created_at: String,
}

#[derive(Debug, FromRow)]
struct OutboxRow {
    sequence: i64,
    module_id: String,
    entity_type: String,
    entity_id: String,
    payload_json: String,
}

fn default_message_type() -> String {
    "message".into()
}

fn default_message_status() -> String {
    "complete".into()
}

fn default_usage_policy() -> String {
    "advisory".into()
}

fn validate_id(label: &str, value: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > 255 || value.chars().any(char::is_control) {
        return Err(format!("CHAT_INVALID_{label}"));
    }
    Ok(())
}

fn validate_common_message(message: &ChatMessageInput) -> Result<(), String> {
    validate_id("MESSAGE_ID", &message.id)?;
    validate_id("SESSION_ID", &message.session_id)?;
    if let Some(parent_id) = &message.parent_id {
        validate_id("PARENT_ID", parent_id)?;
    }
    if message.sibling_order < 0 {
        return Err("CHAT_INVALID_SIBLING_ORDER".into());
    }
    if !matches!(message.role.as_str(), "user" | "assistant" | "system") {
        return Err("CHAT_INVALID_MESSAGE_ROLE".into());
    }
    if !matches!(message.status.as_str(), "generating" | "complete" | "error") {
        return Err("CHAT_INVALID_MESSAGE_STATUS".into());
    }
    Ok(())
}

fn validate_session(session: &ChatSessionInput) -> Result<(), String> {
    validate_id("SESSION_ID", &session.id)?;
    validate_id("ROOT_NODE_ID", &session.root_node_id)?;
    validate_id("ACTIVE_LEAF_ID", &session.active_leaf_id)?;
    if session.name.len() > 10_000 || session.created_at.is_empty() || session.updated_at.is_empty()
    {
        return Err("CHAT_INVALID_SESSION".into());
    }
    Ok(())
}

fn session_from_row(row: SessionRow) -> ChatSessionListItem {
    ChatSessionListItem {
        id: row.id,
        name: row.name,
        root_node_id: row.root_node_id,
        active_leaf_id: row.active_leaf_id,
        display_agent_id: row.display_agent_id,
        message_count: row.message_count,
        is_favorite: row.is_favorite != 0,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

fn message_from_row(row: MessageRow) -> Result<ChatMessageRecord, String> {
    let mut metadata = match row.metadata_json {
        Some(value) => serde_json::from_str::<Value>(&value)
            .map_err(|error| format!("CHAT_METADATA_DECODE: {error}"))?,
        None => Value::Object(serde_json::Map::new()),
    };
    if !metadata.is_object() {
        return Err("CHAT_METADATA_NOT_OBJECT".into());
    }
    if let Some(reasoning) = row.reasoning_content {
        metadata["reasoningContent"] = Value::String(reasoning);
    }
    Ok(ChatMessageRecord {
        id: row.id,
        session_id: row.session_id,
        parent_id: row.parent_id,
        sibling_order: row.sibling_order,
        last_selected_child_id: row.last_selected_child_id,
        role: row.role,
        message_type: row.message_type,
        content: row.content,
        status: row.status,
        timestamp: row.timestamp,
        metadata,
    })
}

fn attachment_from_row(row: AttachmentRow) -> ChatAttachmentRecord {
    ChatAttachmentRecord {
        id: row.id,
        message_id: row.message_id,
        asset_id: row.asset_id,
        kind: row.kind,
        display_name: row.display_name,
        mime_type: row.mime_type,
        size_bytes: row.size_bytes,
        usage_policy: row.usage_policy,
        extracted_text: row.extracted_text,
        sort_order: row.sort_order,
        created_at: row.created_at,
    }
}

fn metadata_columns(metadata: &Option<Value>) -> Result<(Option<String>, Option<String>), String> {
    let Some(metadata) = metadata else {
        return Ok((None, None));
    };
    if !metadata.is_object() {
        return Err("CHAT_METADATA_NOT_OBJECT".into());
    }
    let reasoning = metadata
        .get("reasoningContent")
        .and_then(Value::as_str)
        .map(str::to_owned);
    let encoded = serde_json::to_string(metadata)
        .map_err(|error| format!("CHAT_METADATA_ENCODE: {error}"))?;
    Ok((Some(encoded), reasoning))
}

async fn open_pool(path: &Path) -> Result<SqlitePool, String> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| format!("CHAT_STORAGE_DIR: {error}"))?;
    }
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(3));
    let pool = SqlitePoolOptions::new()
        .min_connections(1)
        .max_connections(4)
        .acquire_timeout(Duration::from_secs(5))
        .connect_with(options)
        .await
        .map_err(|error| format!("CHAT_STORAGE_OPEN: {error}"))?;
    CHAT_MIGRATOR
        .run(&pool)
        .await
        .map_err(|error| format!("CHAT_STORAGE_MIGRATION: {error}"))?;
    Ok(pool)
}

impl LlmChatStorageState {
    async fn pool(&self, app: &AppHandle) -> Result<&SqlitePool, String> {
        self.pool
            .get_or_try_init(|| async {
                let path = app
                    .path()
                    .app_data_dir()
                    .map_err(|error| format!("CHAT_APP_DATA_PATH: {error}"))?
                    .join(CHAT_MODULE)
                    .join(CHAT_DB);
                open_pool(&path).await
            })
            .await
    }
}

async fn load_snapshot(
    pool: &SqlitePool,
    session_id: &str,
) -> Result<Option<ChatSessionSnapshot>, String> {
    validate_id("SESSION_ID", session_id)?;
    let Some(row) = sqlx::query_as::<_, SessionRow>(
        "SELECT id, name, root_node_id, active_leaf_id, display_agent_id, message_count, \
         is_favorite, created_at, updated_at FROM chat_sessions WHERE id = ?",
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| format!("CHAT_SESSION_LOAD: {error}"))?
    else {
        return Ok(None);
    };
    let messages = sqlx::query_as::<_, MessageRow>(
        "SELECT id, session_id, parent_id, sibling_order, last_selected_child_id, role, \
         type AS message_type, content, status, timestamp, reasoning_content, metadata_json \
         FROM chat_messages WHERE session_id = ? ORDER BY sibling_order ASC, id ASC",
    )
    .bind(session_id)
    .fetch_all(pool)
    .await
    .map_err(|error| format!("CHAT_MESSAGES_LOAD: {error}"))?
    .into_iter()
    .map(message_from_row)
    .collect::<Result<Vec<_>, _>>()?;
    let attachments = sqlx::query_as::<_, AttachmentRow>(
        "SELECT id, message_id, asset_id, kind, display_name, mime_type, size_bytes, \
         usage_policy, extracted_text, sort_order, created_at FROM chat_attachments \
         WHERE message_id IN (SELECT id FROM chat_messages WHERE session_id = ?) \
         ORDER BY message_id ASC, sort_order ASC, id ASC",
    )
    .bind(session_id)
    .fetch_all(pool)
    .await
    .map_err(|error| format!("CHAT_ATTACHMENTS_LOAD: {error}"))?
    .into_iter()
    .map(attachment_from_row)
    .collect();
    Ok(Some(ChatSessionSnapshot {
        session: session_from_row(row),
        messages,
        attachments,
    }))
}

async fn persist_changes(
    pool: &SqlitePool,
    request: PersistChatChangesRequest,
) -> Result<PersistChatChangesResult, String> {
    validate_session(&request.session)?;
    for message in &request.upsert_messages {
        validate_common_message(message)?;
        if message.session_id != request.session.id {
            return Err("CHAT_SESSION_MISMATCH".into());
        }
    }
    for id in &request.delete_message_ids {
        validate_id("MESSAGE_ID", id)?;
    }
    for attachment in &request.upsert_attachments {
        validate_id("ATTACHMENT_ID", &attachment.id)?;
        validate_id("MESSAGE_ID", &attachment.message_id)?;
        validate_id("ASSET_ID", &attachment.asset_id)?;
        if attachment.size_bytes < 0 || attachment.sort_order < 0 {
            return Err("CHAT_INVALID_ATTACHMENT".into());
        }
        if !matches!(
            attachment.kind.as_str(),
            "image" | "audio" | "video" | "document" | "other"
        ) || !matches!(attachment.usage_policy.as_str(), "advisory" | "blocking")
        {
            return Err("CHAT_INVALID_ATTACHMENT".into());
        }
    }
    for id in &request.delete_attachment_ids {
        validate_id("ATTACHMENT_ID", id)?;
    }
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| format!("CHAT_TRANSACTION_BEGIN: {error}"))?;
    sqlx::query(
        "INSERT INTO chat_sessions(id, name, root_node_id, active_leaf_id, display_agent_id, \
         message_count, is_favorite, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?) \
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, root_node_id=excluded.root_node_id, \
         active_leaf_id=excluded.active_leaf_id, display_agent_id=excluded.display_agent_id, \
         is_favorite=excluded.is_favorite, created_at=excluded.created_at, updated_at=excluded.updated_at",
    )
    .bind(&request.session.id)
    .bind(&request.session.name)
    .bind(&request.session.root_node_id)
    .bind(&request.session.active_leaf_id)
    .bind(&request.session.display_agent_id)
    .bind(i64::from(request.session.is_favorite))
    .bind(&request.session.created_at)
    .bind(&request.session.updated_at)
    .execute(&mut *tx)
    .await
    .map_err(|error| format!("CHAT_SESSION_UPSERT: {error}"))?;

    let mut affected_attachment_messages = HashSet::new();
    for id in &request.delete_attachment_ids {
        let owner: Option<(String, String)> = sqlx::query_as(
            "SELECT a.message_id, m.session_id FROM chat_attachments a \
             JOIN chat_messages m ON m.id = a.message_id WHERE a.id = ?",
        )
        .bind(id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|error| format!("CHAT_ATTACHMENT_OWNER: {error}"))?;
        if let Some((message_id, session_id)) = owner {
            if session_id != request.session.id {
                return Err("CHAT_ATTACHMENT_SESSION_MISMATCH".into());
            }
            affected_attachment_messages.insert(message_id);
        }
    }

    let upsert_ids: HashSet<&str> = request
        .upsert_messages
        .iter()
        .map(|message| message.id.as_str())
        .collect();
    for message in &request.upsert_messages {
        let Some(parent_id) = message.parent_id.as_deref() else {
            continue;
        };
        if upsert_ids.contains(parent_id) {
            continue;
        }
        let parent_session: Option<String> =
            sqlx::query_scalar("SELECT session_id FROM chat_messages WHERE id = ?")
                .bind(parent_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|error| format!("CHAT_PARENT_LOOKUP: {error}"))?;
        if parent_session.as_deref() != Some(request.session.id.as_str()) {
            return Err("CHAT_PARENT_SESSION_MISMATCH".into());
        }
    }
    let mut deleted_branch_ids = HashSet::new();
    for id in &request.delete_message_ids {
        if id == &request.session.root_node_id {
            return Err("CHAT_CANNOT_DELETE_ROOT".into());
        }
        let ids = branch_message_ids(&mut tx, &request.session.id, id).await?;
        if ids.is_empty() {
            continue;
        }
        if ids.iter().any(|id| upsert_ids.contains(id.as_str())) {
            return Err("CHAT_DELETE_UPSERT_CONFLICT".into());
        }
        deleted_branch_ids.extend(ids);
    }
    let deleted_branch_ids: Vec<String> = deleted_branch_ids.into_iter().collect();
    let mut outbox_events = queue_release_events(&mut tx, &deleted_branch_ids).await?;

    for id in &request.delete_message_ids {
        sqlx::query("DELETE FROM chat_messages WHERE id = ? AND session_id = ?")
            .bind(id)
            .bind(&request.session.id)
            .execute(&mut *tx)
            .await
            .map_err(|error| format!("CHAT_MESSAGE_DELETE: {error}"))?;
    }
    for id in &request.delete_attachment_ids {
        sqlx::query(
            "DELETE FROM chat_attachments WHERE id = ? AND message_id IN \
             (SELECT id FROM chat_messages WHERE session_id = ?)",
        )
        .bind(id)
        .bind(&request.session.id)
        .execute(&mut *tx)
        .await
        .map_err(|error| format!("CHAT_ATTACHMENT_DELETE: {error}"))?;
    }

    for message in &request.upsert_messages {
        let (metadata_json, reasoning_content) = metadata_columns(&message.metadata)?;
        sqlx::query(
            "INSERT INTO chat_messages(id, session_id, parent_id, sibling_order, last_selected_child_id, \
             role, type, content, status, timestamp, reasoning_content, metadata_json) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), ?, ?) \
             ON CONFLICT(id) DO UPDATE SET session_id=excluded.session_id, parent_id=excluded.parent_id, \
             sibling_order=excluded.sibling_order, last_selected_child_id=excluded.last_selected_child_id, \
             role=excluded.role, type=excluded.type, content=excluded.content, status=excluded.status, \
             timestamp=excluded.timestamp, reasoning_content=excluded.reasoning_content, metadata_json=excluded.metadata_json",
        )
        .bind(&message.id)
        .bind(&message.session_id)
        .bind(&message.parent_id)
        .bind(message.sibling_order)
        .bind(&message.last_selected_child_id)
        .bind(&message.role)
        .bind(&message.message_type)
        .bind(&message.content)
        .bind(&message.status)
        .bind(&message.timestamp)
        .bind(&reasoning_content)
        .bind(&metadata_json)
        .execute(&mut *tx)
        .await
        .map_err(|error| format!("CHAT_MESSAGE_UPSERT: {error}"))?;
    }
    for attachment in &request.upsert_attachments {
        let message_session: Option<String> =
            sqlx::query_scalar("SELECT session_id FROM chat_messages WHERE id = ?")
                .bind(&attachment.message_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|error| format!("CHAT_ATTACHMENT_MESSAGE: {error}"))?;
        if message_session.as_deref() != Some(request.session.id.as_str()) {
            return Err("CHAT_ATTACHMENT_SESSION_MISMATCH".into());
        }
        let existing_session: Option<String> = sqlx::query_scalar(
            "SELECT m.session_id FROM chat_attachments a JOIN chat_messages m ON m.id = a.message_id \
             WHERE a.id = ?",
        )
        .bind(&attachment.id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|error| format!("CHAT_ATTACHMENT_OWNER: {error}"))?;
        if existing_session
            .as_deref()
            .is_some_and(|session_id| session_id != request.session.id)
        {
            return Err("CHAT_ATTACHMENT_SESSION_MISMATCH".into());
        }
        sqlx::query(
            "INSERT INTO chat_attachments(id, message_id, asset_id, kind, display_name, mime_type, \
             size_bytes, usage_policy, extracted_text, sort_order, created_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))) \
             ON CONFLICT(id) DO UPDATE SET message_id=excluded.message_id, asset_id=excluded.asset_id, \
             kind=excluded.kind, display_name=excluded.display_name, mime_type=excluded.mime_type, \
             size_bytes=excluded.size_bytes, usage_policy=excluded.usage_policy, extracted_text=excluded.extracted_text, \
             sort_order=excluded.sort_order, created_at=excluded.created_at",
        )
        .bind(&attachment.id)
        .bind(&attachment.message_id)
        .bind(&attachment.asset_id)
        .bind(&attachment.kind)
        .bind(&attachment.display_name)
        .bind(&attachment.mime_type)
        .bind(attachment.size_bytes)
        .bind(&attachment.usage_policy)
        .bind(&attachment.extracted_text)
        .bind(attachment.sort_order)
        .bind(&attachment.created_at)
        .execute(&mut *tx)
        .await
        .map_err(|error| format!("CHAT_ATTACHMENT_UPSERT: {error}"))?;
        affected_attachment_messages.insert(attachment.message_id.clone());
    }

    for message_id in affected_attachment_messages {
        if deleted_branch_ids.iter().any(|id| id == &message_id) {
            continue;
        }
        outbox_events +=
            queue_attachment_replacement(&mut tx, &request.session.id, &message_id).await?;
    }

    let root_exists: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM chat_messages WHERE id = ? AND session_id = ?")
            .bind(&request.session.root_node_id)
            .bind(&request.session.id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|error| format!("CHAT_ROOT_CHECK: {error}"))?;
    let active_leaf_exists: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM chat_messages WHERE id = ? AND session_id = ?")
            .bind(&request.session.active_leaf_id)
            .bind(&request.session.id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|error| format!("CHAT_ACTIVE_LEAF_CHECK: {error}"))?;
    if root_exists != 1 || active_leaf_exists != 1 {
        return Err("CHAT_INVALID_SESSION_TREE".into());
    }

    let message_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM chat_messages WHERE session_id = ? AND id <> ?")
            .bind(&request.session.id)
            .bind(&request.session.root_node_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|error| format!("CHAT_MESSAGE_COUNT: {error}"))?;
    sqlx::query("UPDATE chat_sessions SET message_count = ? WHERE id = ?")
        .bind(message_count)
        .bind(&request.session.id)
        .execute(&mut *tx)
        .await
        .map_err(|error| format!("CHAT_MESSAGE_COUNT_UPDATE: {error}"))?;
    tx.commit()
        .await
        .map_err(|error| format!("CHAT_TRANSACTION_COMMIT: {error}"))?;
    Ok(PersistChatChangesResult {
        message_count,
        outbox_events,
    })
}

async fn list_sessions(
    pool: &SqlitePool,
    query: ChatSessionListQuery,
) -> Result<Vec<ChatSessionListItem>, String> {
    let limit = query
        .limit
        .unwrap_or(DEFAULT_LIST_LIMIT)
        .clamp(1, MAX_LIST_LIMIT);
    let mut builder = QueryBuilder::<Sqlite>::new(
        "SELECT id, name, root_node_id, active_leaf_id, display_agent_id, message_count, \
         is_favorite, created_at, updated_at FROM chat_sessions",
    );
    if query.before_updated_at.is_some() || query.before_id.is_some() {
        let before_updated_at = query
            .before_updated_at
            .ok_or_else(|| "CHAT_INVALID_CURSOR".to_string())?;
        let before_id = query
            .before_id
            .ok_or_else(|| "CHAT_INVALID_CURSOR".to_string())?;
        builder
            .push(" WHERE (updated_at < ")
            .push_bind(before_updated_at.clone());
        builder
            .push(" OR (updated_at = ")
            .push_bind(before_updated_at);
        builder.push(" AND id < ").push_bind(before_id).push(") )");
    }
    builder
        .push(" ORDER BY updated_at DESC, id DESC LIMIT ")
        .push_bind(i64::from(limit));
    builder
        .build_query_as::<SessionRow>()
        .fetch_all(pool)
        .await
        .map_err(|error| format!("CHAT_SESSIONS_LIST: {error}"))
        .map(|rows| rows.into_iter().map(session_from_row).collect())
}

fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn search_snippet(content: &str, reasoning_content: Option<&str>, query: &str) -> String {
    const MAX_CHARS: usize = 120;
    const LEADING_CONTEXT: usize = 36;
    let query_lower = query.to_lowercase();
    let contains_query = |value: &str| value.to_lowercase().contains(&query_lower);
    let source = if contains_query(content) {
        content
    } else {
        reasoning_content
            .filter(|value| contains_query(value))
            .unwrap_or(content)
    };
    let source_lower = source.to_lowercase();
    let match_char_index = source_lower
        .find(&query_lower)
        .map(|byte_index| source_lower[..byte_index].chars().count())
        .unwrap_or(0);
    let chars = source.chars().collect::<Vec<_>>();
    let start = match_char_index.saturating_sub(LEADING_CONTEXT);
    let end = (start + MAX_CHARS).min(chars.len());
    let mut snippet = chars[start..end].iter().collect::<String>();
    if start > 0 {
        snippet.insert(0, '…');
    }
    if end < chars.len() {
        snippet.push('…');
    }
    snippet
}

async fn search_messages(
    pool: &SqlitePool,
    request: ChatSearchQuery,
) -> Result<Vec<ChatSearchResult>, String> {
    let query = request.query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let limit = request
        .limit
        .unwrap_or(MAX_SEARCH_LIMIT)
        .clamp(1, MAX_SEARCH_LIMIT);
    if query.chars().count() >= 3 {
        let encoded = format!("\"{}\"", query.replace('"', "\"\""));
        let fts_result = sqlx::query_as::<_, ChatSearchResult>(
            "SELECT m.id AS message_id, m.session_id, s.name AS session_name, m.content, \
             snippet(chat_messages_fts, -1, '', '', '…', 32) AS snippet, \
             m.timestamp, bm25(chat_messages_fts) AS rank FROM chat_messages_fts \
             JOIN chat_messages m ON m.rowid = chat_messages_fts.rowid \
             JOIN chat_sessions s ON s.id = m.session_id \
             WHERE chat_messages_fts MATCH ? ORDER BY rank ASC, m.timestamp DESC LIMIT ?",
        )
        .bind(encoded)
        .bind(i64::from(limit))
        .fetch_all(pool)
        .await;
        match fts_result {
            Ok(rows) => Ok(rows),
            Err(fts_error) => {
                search_messages_basic(pool, query, limit)
                    .await
                    .map_err(|basic_error| {
                        format!("CHAT_SEARCH_FTS: {fts_error}; CHAT_SEARCH_BASIC: {basic_error}")
                    })
            }
        }
    } else {
        search_messages_basic(pool, query, limit).await
    }
}

async fn search_messages_basic(
    pool: &SqlitePool,
    query: &str,
    limit: u32,
) -> Result<Vec<ChatSearchResult>, String> {
    let pattern = format!("%{}%", escape_like(query));
    sqlx::query_as::<_, BasicSearchRow>(
        "SELECT m.id AS message_id, m.session_id, s.name AS session_name, m.content, \
         m.reasoning_content, m.timestamp, 0.0 AS rank FROM chat_messages m \
         JOIN chat_sessions s ON s.id = m.session_id \
         WHERE m.content LIKE ? ESCAPE '\\' OR COALESCE(m.reasoning_content, '') LIKE ? ESCAPE '\\' \
         ORDER BY m.timestamp DESC, m.id DESC LIMIT ?",
    )
    .bind(&pattern)
    .bind(&pattern)
    .bind(i64::from(limit))
    .fetch_all(pool)
    .await
    .map_err(|error| format!("CHAT_SEARCH_BASIC: {error}"))
    .map(|rows| {
        rows.into_iter()
            .map(|row| ChatSearchResult {
                message_id: row.message_id,
                session_id: row.session_id,
                session_name: row.session_name,
                snippet: search_snippet(&row.content, row.reasoning_content.as_deref(), query),
                content: row.content,
                timestamp: row.timestamp,
                rank: row.rank,
            })
            .collect()
    })
}

async fn branch_message_ids(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    session_id: &str,
    root_message_id: &str,
) -> Result<Vec<String>, String> {
    sqlx::query_scalar(
        "WITH RECURSIVE branch(id) AS ( \
           SELECT id FROM chat_messages WHERE id = ? AND session_id = ? \
           UNION ALL SELECT m.id FROM chat_messages m JOIN branch b ON m.parent_id = b.id \
             WHERE m.session_id = ? \
         ) SELECT id FROM branch",
    )
    .bind(root_message_id)
    .bind(session_id)
    .bind(session_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(|error| format!("CHAT_BRANCH_LOOKUP: {error}"))
}

async fn queue_attachment_replacement(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    session_id: &str,
    message_id: &str,
) -> Result<usize, String> {
    let owner: Option<String> =
        sqlx::query_scalar("SELECT session_id FROM chat_messages WHERE id = ?")
            .bind(message_id)
            .fetch_optional(&mut **tx)
            .await
            .map_err(|error| format!("CHAT_ATTACHMENT_MESSAGE: {error}"))?;
    if owner.as_deref() != Some(session_id) {
        return Err("CHAT_ATTACHMENT_SESSION_MISMATCH".into());
    }
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT asset_id, usage_policy FROM chat_attachments WHERE message_id = ? \
         ORDER BY sort_order ASC, id ASC",
    )
    .bind(message_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(|error| format!("CHAT_ATTACHMENT_USAGE: {error}"))?;
    let usages = rows
        .into_iter()
        .map(|(asset_id, usage_policy)| AssetUsageInput {
            asset_id,
            role: "attachment".into(),
            usage_policy,
        })
        .collect::<Vec<_>>();
    let payload =
        serde_json::to_string(&usages).map_err(|error| format!("CHAT_OUTBOX_ENCODE: {error}"))?;
    sqlx::query(
        "INSERT INTO asset_usage_outbox(event_id, module_id, entity_type, entity_id, operation, payload_json, created_at) \
         VALUES (?, ?, 'message', ?, 'replace', ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(CHAT_MODULE)
    .bind(message_id)
    .bind(payload)
    .execute(&mut **tx)
    .await
    .map_err(|error| format!("CHAT_REPLACE_OUTBOX: {error}"))?;
    Ok(1)
}

async fn replace_asset_with_text(
    pool: &SqlitePool,
    asset_id: &str,
    extracted_text: &str,
) -> Result<ChatAssetTextReplacementResult, String> {
    validate_id("ASSET_ID", asset_id)?;
    if extracted_text.trim().is_empty() {
        return Err("CHAT_EXTRACTED_TEXT_EMPTY".into());
    }
    if extracted_text.len() > MAX_EXTRACTED_TEXT_BYTES {
        return Err("CHAT_EXTRACTED_TEXT_TOO_LARGE".into());
    }
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| format!("CHAT_TRANSACTION_BEGIN: {error}"))?;
    let owners: Vec<(String, String)> = sqlx::query_as(
        "SELECT DISTINCT m.session_id, a.message_id FROM chat_attachments a \
         JOIN chat_messages m ON m.id = a.message_id WHERE a.asset_id = ? \
         ORDER BY m.session_id ASC, a.message_id ASC",
    )
    .bind(asset_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|error| format!("CHAT_ASSET_ATTACHMENT_LOOKUP: {error}"))?;
    if owners.is_empty() {
        return Err("CHAT_ASSET_ATTACHMENT_NOT_FOUND".into());
    }
    let updated_attachments = sqlx::query(
        "UPDATE chat_attachments SET extracted_text = ?, usage_policy = 'advisory' \
         WHERE asset_id = ?",
    )
    .bind(extracted_text)
    .bind(asset_id)
    .execute(&mut *tx)
    .await
    .map_err(|error| format!("CHAT_ASSET_TEXT_UPDATE: {error}"))?
    .rows_affected() as usize;
    let mut outbox_events = 0;
    for (session_id, message_id) in &owners {
        outbox_events += queue_attachment_replacement(&mut tx, session_id, message_id).await?;
    }
    tx.commit()
        .await
        .map_err(|error| format!("CHAT_TRANSACTION_COMMIT: {error}"))?;
    Ok(ChatAssetTextReplacementResult {
        updated_attachments,
        affected_messages: owners.len(),
        outbox_events,
    })
}

async fn queue_release_events(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    message_ids: &[String],
) -> Result<usize, String> {
    let mut queued = 0;
    for message_id in message_ids {
        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM chat_attachments WHERE message_id = ?")
                .bind(message_id)
                .fetch_one(&mut **tx)
                .await
                .map_err(|error| format!("CHAT_ATTACHMENT_COUNT: {error}"))?;
        if count == 0 {
            continue;
        }
        sqlx::query(
            "INSERT INTO asset_usage_outbox(event_id, module_id, entity_type, entity_id, operation, payload_json, created_at) \
             VALUES (?, ?, 'message', ?, 'release', '[]', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(CHAT_MODULE)
        .bind(message_id)
        .execute(&mut **tx)
        .await
        .map_err(|error| format!("CHAT_RELEASE_OUTBOX: {error}"))?;
        queued += 1;
    }
    Ok(queued)
}

async fn delete_branch(
    pool: &SqlitePool,
    request: DeleteChatBranchRequest,
) -> Result<DeleteChatResult, String> {
    validate_id("SESSION_ID", &request.session_id)?;
    validate_id("MESSAGE_ID", &request.root_message_id)?;
    validate_id("ACTIVE_LEAF_ID", &request.fallback_active_leaf_id)?;
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| format!("CHAT_TRANSACTION_BEGIN: {error}"))?;
    let session_root: Option<String> =
        sqlx::query_scalar("SELECT root_node_id FROM chat_sessions WHERE id = ?")
            .bind(&request.session_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|error| format!("CHAT_SESSION_LOOKUP: {error}"))?;
    if session_root.as_deref() == Some(request.root_message_id.as_str()) {
        return Err("CHAT_CANNOT_DELETE_ROOT".into());
    }
    if session_root.is_none() {
        return Err("CHAT_SESSION_NOT_FOUND".into());
    }
    let ids = branch_message_ids(&mut tx, &request.session_id, &request.root_message_id).await?;
    if ids.is_empty() {
        return Err("CHAT_MESSAGE_NOT_FOUND".into());
    }
    if !ids.iter().any(|id| id == &request.fallback_active_leaf_id) {
        let fallback_ok: Option<String> =
            sqlx::query_scalar("SELECT id FROM chat_messages WHERE id = ? AND session_id = ?")
                .bind(&request.fallback_active_leaf_id)
                .bind(&request.session_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|error| format!("CHAT_ACTIVE_LEAF_LOOKUP: {error}"))?;
        if fallback_ok.is_none() {
            return Err("CHAT_ACTIVE_LEAF_NOT_FOUND".into());
        }
    } else {
        return Err("CHAT_ACTIVE_LEAF_IN_DELETED_BRANCH".into());
    }
    let queued_release_events = queue_release_events(&mut tx, &ids).await?;
    sqlx::query("DELETE FROM chat_messages WHERE id = ? AND session_id = ?")
        .bind(&request.root_message_id)
        .bind(&request.session_id)
        .execute(&mut *tx)
        .await
        .map_err(|error| format!("CHAT_BRANCH_DELETE: {error}"))?;
    sqlx::query("UPDATE chat_sessions SET active_leaf_id = ?, message_count = (SELECT COUNT(*) - 1 FROM chat_messages WHERE session_id = ?) WHERE id = ?")
        .bind(&request.fallback_active_leaf_id)
        .bind(&request.session_id)
        .bind(&request.session_id)
        .execute(&mut *tx)
        .await
        .map_err(|error| format!("CHAT_SESSION_UPDATE: {error}"))?;
    tx.commit()
        .await
        .map_err(|error| format!("CHAT_TRANSACTION_COMMIT: {error}"))?;
    Ok(DeleteChatResult {
        deleted_messages: ids.len(),
        queued_release_events,
    })
}

async fn delete_session(pool: &SqlitePool, session_id: String) -> Result<DeleteChatResult, String> {
    validate_id("SESSION_ID", &session_id)?;
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| format!("CHAT_TRANSACTION_BEGIN: {error}"))?;
    let ids: Vec<String> = sqlx::query_scalar("SELECT id FROM chat_messages WHERE session_id = ?")
        .bind(&session_id)
        .fetch_all(&mut *tx)
        .await
        .map_err(|error| format!("CHAT_MESSAGES_LOOKUP: {error}"))?;
    if ids.is_empty() {
        let exists: Option<String> =
            sqlx::query_scalar("SELECT id FROM chat_sessions WHERE id = ?")
                .bind(&session_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|error| format!("CHAT_SESSION_LOOKUP: {error}"))?;
        if exists.is_none() {
            return Err("CHAT_SESSION_NOT_FOUND".into());
        }
    }
    let queued_release_events = queue_release_events(&mut tx, &ids).await?;
    sqlx::query("DELETE FROM chat_sessions WHERE id = ?")
        .bind(&session_id)
        .execute(&mut *tx)
        .await
        .map_err(|error| format!("CHAT_SESSION_DELETE: {error}"))?;
    tx.commit()
        .await
        .map_err(|error| format!("CHAT_TRANSACTION_COMMIT: {error}"))?;
    Ok(DeleteChatResult {
        deleted_messages: ids.len(),
        queued_release_events,
    })
}

async fn pending_outbox(pool: &SqlitePool, limit: u32) -> Result<Vec<OutboxRow>, String> {
    sqlx::query_as::<_, OutboxRow>(
        "SELECT o.sequence, o.module_id, o.entity_type, o.entity_id, o.payload_json \
         FROM asset_usage_outbox o WHERE o.delivered_at IS NULL AND o.dead_letter_at IS NULL \
         AND NOT EXISTS (SELECT 1 FROM asset_usage_outbox earlier WHERE earlier.module_id=o.module_id \
           AND earlier.entity_type=o.entity_type AND earlier.entity_id=o.entity_id \
           AND earlier.sequence < o.sequence AND earlier.delivered_at IS NULL) \
         ORDER BY o.sequence ASC LIMIT ?",
    )
    .bind(i64::from(limit.clamp(1, MAX_OUTBOX_BATCH)))
    .fetch_all(pool)
    .await
    .map_err(|error| format!("CHAT_OUTBOX_LIST: {error}"))
}

async fn acknowledge_outbox(pool: &SqlitePool, sequence: i64) -> Result<(), String> {
    sqlx::query(
        "UPDATE asset_usage_outbox SET delivered_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_error = NULL WHERE sequence = ?",
    )
    .bind(sequence)
    .execute(pool)
    .await
    .map_err(|error| format!("CHAT_OUTBOX_ACK: {error}"))?;
    Ok(())
}

async fn record_outbox_failure(
    pool: &SqlitePool,
    sequence: i64,
    error: &str,
) -> Result<bool, String> {
    let changed = sqlx::query(
        "UPDATE asset_usage_outbox SET attempt_count = attempt_count + 1, last_error = ?, \
         dead_letter_at = CASE WHEN attempt_count + 1 >= ? THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE dead_letter_at END \
         WHERE sequence = ?",
    )
    .bind(error)
    .bind(MAX_OUTBOX_ATTEMPTS)
    .bind(sequence)
    .execute(pool)
    .await
    .map_err(|error| format!("CHAT_OUTBOX_FAILURE: {error}"))?;
    if changed.rows_affected() != 1 {
        return Ok(false);
    }
    let dead: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM asset_usage_outbox WHERE sequence = ? AND dead_letter_at IS NOT NULL",
    )
    .bind(sequence)
    .fetch_one(pool)
    .await
    .map_err(|error| format!("CHAT_OUTBOX_DEAD_LETTER: {error}"))?;
    Ok(dead == 1)
}

async fn retry_outbox(pool: &SqlitePool, event_id: &str) -> Result<bool, String> {
    let result = sqlx::query(
        "UPDATE asset_usage_outbox SET attempt_count = 0, last_error = NULL, dead_letter_at = NULL \
         WHERE event_id = ? AND delivered_at IS NULL",
    )
    .bind(event_id)
    .execute(pool)
    .await
    .map_err(|error| format!("CHAT_OUTBOX_RETRY: {error}"))?;
    Ok(result.rows_affected() == 1)
}

async fn drain_outbox(
    app: &AppHandle,
    chat_state: &LlmChatStorageState,
    asset_state: &AssetManagerState,
    limit: u32,
) -> Result<DrainOutboxResult, String> {
    let pool = chat_state.pool(app).await?;
    let events = pending_outbox(pool, limit).await?;
    let inspected = events.len();
    let mut delivered = 0;
    let mut failed = 0;
    let mut dead_lettered = 0;
    for event in events {
        let usages: Result<Vec<AssetUsageInput>, _> = serde_json::from_str(&event.payload_json);
        let result = match usages {
            Ok(usages) => {
                asset_manager::replace_entity_usages_internal(
                    app,
                    asset_state,
                    &event.module_id,
                    &event.entity_type,
                    &event.entity_id,
                    usages,
                )
                .await
            }
            Err(error) => Err(format!("CHAT_OUTBOX_DECODE: {error}")),
        };
        match result {
            Ok(_) => {
                acknowledge_outbox(pool, event.sequence).await?;
                delivered += 1;
            }
            Err(error) => {
                failed += 1;
                if record_outbox_failure(pool, event.sequence, &error).await? {
                    dead_lettered += 1;
                }
            }
        }
    }
    Ok(DrainOutboxResult {
        inspected,
        delivered,
        failed,
        dead_lettered,
    })
}

#[tauri::command]
pub async fn list_chat_sessions(
    app: AppHandle,
    state: State<'_, LlmChatStorageState>,
    query: ChatSessionListQuery,
) -> Result<Vec<ChatSessionListItem>, String> {
    list_sessions(state.pool(&app).await?, query).await
}

#[tauri::command]
pub async fn load_chat_session(
    app: AppHandle,
    state: State<'_, LlmChatStorageState>,
    session_id: String,
) -> Result<Option<ChatSessionSnapshot>, String> {
    load_snapshot(state.pool(&app).await?, &session_id).await
}

#[tauri::command]
pub async fn persist_chat_changes(
    app: AppHandle,
    state: State<'_, LlmChatStorageState>,
    request: PersistChatChangesRequest,
) -> Result<PersistChatChangesResult, String> {
    let _guard = state.write_lock.lock().await;
    persist_changes(state.pool(&app).await?, request).await
}

#[tauri::command]
pub async fn delete_chat_branch(
    app: AppHandle,
    state: State<'_, LlmChatStorageState>,
    request: DeleteChatBranchRequest,
) -> Result<DeleteChatResult, String> {
    let _guard = state.write_lock.lock().await;
    delete_branch(state.pool(&app).await?, request).await
}

#[tauri::command]
pub async fn delete_chat_session(
    app: AppHandle,
    state: State<'_, LlmChatStorageState>,
    session_id: String,
) -> Result<DeleteChatResult, String> {
    let _guard = state.write_lock.lock().await;
    delete_session(state.pool(&app).await?, session_id).await
}

#[tauri::command]
pub async fn search_chat_messages(
    app: AppHandle,
    state: State<'_, LlmChatStorageState>,
    query: ChatSearchQuery,
) -> Result<Vec<ChatSearchResult>, String> {
    search_messages(state.pool(&app).await?, query).await
}

#[tauri::command]
pub async fn replace_chat_asset_with_text(
    app: AppHandle,
    state: State<'_, LlmChatStorageState>,
    asset_id: String,
    extracted_text: String,
) -> Result<ChatAssetTextReplacementResult, String> {
    let _guard = state.write_lock.lock().await;
    replace_asset_with_text(state.pool(&app).await?, &asset_id, &extracted_text).await
}

#[tauri::command]
pub async fn drain_asset_usage_outbox(
    app: AppHandle,
    chat_state: State<'_, LlmChatStorageState>,
    asset_state: State<'_, AssetManagerState>,
    limit: Option<u32>,
) -> Result<DrainOutboxResult, String> {
    drain_outbox(
        &app,
        &chat_state,
        &asset_state,
        limit.unwrap_or(MAX_OUTBOX_BATCH),
    )
    .await
}

#[tauri::command]
pub async fn retry_asset_usage_outbox(
    app: AppHandle,
    state: State<'_, LlmChatStorageState>,
    event_id: String,
) -> Result<bool, String> {
    validate_id("EVENT_ID", &event_id)?;
    let _guard = state.write_lock.lock().await;
    retry_outbox(state.pool(&app).await?, &event_id).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    use std::fs;

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        CHAT_MIGRATOR.run(&pool).await.unwrap();
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&pool)
            .await
            .unwrap();
        pool
    }

    fn session() -> ChatSessionInput {
        ChatSessionInput {
            id: "session-1".into(),
            name: "测试会话".into(),
            root_node_id: "root".into(),
            active_leaf_id: "assistant".into(),
            display_agent_id: Some("agent-1".into()),
            is_favorite: true,
            created_at: "2026-01-01T00:00:00.000Z".into(),
            updated_at: "2026-01-01T00:00:01.000Z".into(),
        }
    }

    fn message(id: &str, parent_id: Option<&str>, order: i64, content: &str) -> ChatMessageInput {
        ChatMessageInput {
            id: id.into(),
            session_id: "session-1".into(),
            parent_id: parent_id.map(str::to_owned),
            sibling_order: order,
            last_selected_child_id: None,
            role: if id == "root" { "system" } else { "assistant" }.into(),
            message_type: "message".into(),
            content: content.into(),
            status: "complete".into(),
            timestamp: Some("2026-01-01T00:00:02.000Z".into()),
            metadata: Some(serde_json::json!({
                "modelId": "model-1",
                "unknownFuture": { "enabled": true },
                "reasoningContent": "thinking"
            })),
        }
    }

    #[tokio::test]
    async fn migration_creates_chat_schema_and_fts() {
        let pool = test_pool().await;
        for table in [
            "chat_sessions",
            "chat_messages",
            "chat_attachments",
            "asset_usage_outbox",
            "chat_messages_fts",
        ] {
            let exists: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM sqlite_master WHERE name = ?")
                    .bind(table)
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(exists, 1, "missing {table}");
        }
        let foreign_keys: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(foreign_keys, 1);
        pool.close().await;
    }

    #[tokio::test]
    async fn file_pool_uses_mobile_connection_options() {
        let path = std::env::temp_dir().join(format!("aio-llm-chat-{}.db", Uuid::new_v4()));
        let pool = open_pool(&path).await.unwrap();
        let foreign_keys: i64 = sqlx::query_scalar("PRAGMA foreign_keys")
            .fetch_one(&pool)
            .await
            .unwrap();
        let journal_mode: String = sqlx::query_scalar("PRAGMA journal_mode")
            .fetch_one(&pool)
            .await
            .unwrap();
        let synchronous: i64 = sqlx::query_scalar("PRAGMA synchronous")
            .fetch_one(&pool)
            .await
            .unwrap();
        let busy_timeout: i64 = sqlx::query_scalar("PRAGMA busy_timeout")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(foreign_keys, 1);
        assert_eq!(journal_mode.to_ascii_lowercase(), "wal");
        assert_eq!(synchronous, 1);
        assert_eq!(busy_timeout, 3_000);
        pool.close().await;
        let _ = fs::remove_file(&path);
        let _ = fs::remove_file(path.with_extension("db-wal"));
        let _ = fs::remove_file(path.with_extension("db-shm"));
    }

    #[tokio::test]
    async fn persists_loads_and_preserves_unknown_metadata() {
        let pool = test_pool().await;
        let request = PersistChatChangesRequest {
            session: session(),
            upsert_messages: vec![
                message("root", None, 0, "system"),
                message("assistant", Some("root"), 1, "三字符搜索"),
            ],
            delete_message_ids: Vec::new(),
            upsert_attachments: vec![ChatAttachmentInput {
                id: "attachment-1".into(),
                message_id: "assistant".into(),
                asset_id: "asset-1".into(),
                kind: "image".into(),
                display_name: "photo.png".into(),
                mime_type: "image/png".into(),
                size_bytes: 10,
                usage_policy: "blocking".into(),
                extracted_text: None,
                sort_order: 0,
                created_at: None,
            }],
            delete_attachment_ids: Vec::new(),
        };
        let result = persist_changes(&pool, request).await.unwrap();
        assert_eq!(result.message_count, 1);
        let snapshot = load_snapshot(&pool, "session-1").await.unwrap().unwrap();
        assert_eq!(snapshot.session.message_count, 1);
        assert_eq!(snapshot.messages.len(), 2);
        assert_eq!(snapshot.attachments.len(), 1);
        assert_eq!(
            snapshot.messages[1].metadata["unknownFuture"]["enabled"],
            true
        );
        assert_eq!(
            snapshot.messages[1].metadata["reasoningContent"],
            "thinking"
        );
        let fts: Vec<ChatSearchResult> = search_messages(
            &pool,
            ChatSearchQuery {
                query: "三字符".into(),
                limit: None,
            },
        )
        .await
        .unwrap();
        assert_eq!(fts.len(), 1);
        assert!(fts[0].snippet.contains("三字符"));
        let outbox_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM asset_usage_outbox")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(outbox_count, 1);
        let payload: String = sqlx::query_scalar("SELECT payload_json FROM asset_usage_outbox")
            .fetch_one(&pool)
            .await
            .unwrap();
        let usages: Vec<AssetUsageInput> = serde_json::from_str(&payload).unwrap();
        assert_eq!(usages[0].asset_id, "asset-1");
        assert_eq!(usages[0].role, "attachment");
        assert_eq!(usages[0].usage_policy, "blocking");
    }

    #[tokio::test]
    async fn replaces_chat_asset_with_text_before_releasing_blocking_usage() {
        let pool = test_pool().await;
        persist_changes(
            &pool,
            PersistChatChangesRequest {
                session: session(),
                upsert_messages: vec![
                    message("root", None, 0, "system"),
                    message("assistant", Some("root"), 1, "attached document"),
                ],
                delete_message_ids: Vec::new(),
                upsert_attachments: vec![ChatAttachmentInput {
                    id: "attachment-1".into(),
                    message_id: "assistant".into(),
                    asset_id: "asset-document".into(),
                    kind: "document".into(),
                    display_name: "notes.txt".into(),
                    mime_type: "text/plain".into(),
                    size_bytes: 12,
                    usage_policy: "blocking".into(),
                    extracted_text: None,
                    sort_order: 0,
                    created_at: None,
                }],
                delete_attachment_ids: Vec::new(),
            },
        )
        .await
        .unwrap();

        let result = replace_asset_with_text(&pool, "asset-document", "Extracted document text")
            .await
            .unwrap();
        assert_eq!(result.updated_attachments, 1);
        assert_eq!(result.affected_messages, 1);
        assert_eq!(result.outbox_events, 1);

        let attachment: (String, String) = sqlx::query_as(
            "SELECT extracted_text, usage_policy FROM chat_attachments WHERE asset_id = ?",
        )
        .bind("asset-document")
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(
            attachment,
            ("Extracted document text".into(), "advisory".into())
        );
        let payload: String = sqlx::query_scalar(
            "SELECT payload_json FROM asset_usage_outbox ORDER BY sequence DESC LIMIT 1",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        let usages: Vec<AssetUsageInput> = serde_json::from_str(&payload).unwrap();
        assert_eq!(usages[0].usage_policy, "advisory");

        let outbox_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM asset_usage_outbox")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(
            replace_asset_with_text(&pool, "missing-asset", "text")
                .await
                .unwrap_err(),
            "CHAT_ASSET_ATTACHMENT_NOT_FOUND"
        );
        let unchanged_outbox_count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM asset_usage_outbox")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(unchanged_outbox_count, outbox_count);
    }

    #[tokio::test]
    async fn failed_change_set_rolls_back_session_and_messages() {
        let pool = test_pool().await;
        let mut request = PersistChatChangesRequest {
            session: session(),
            upsert_messages: vec![message("root", None, 0, "system")],
            delete_message_ids: Vec::new(),
            upsert_attachments: Vec::new(),
            delete_attachment_ids: Vec::new(),
        };
        request.upsert_attachments.push(ChatAttachmentInput {
            id: "invalid-attachment".into(),
            message_id: "missing-message".into(),
            asset_id: "asset-1".into(),
            kind: "image".into(),
            display_name: "photo.png".into(),
            mime_type: "image/png".into(),
            size_bytes: 1,
            usage_policy: "advisory".into(),
            extracted_text: None,
            sort_order: 0,
            created_at: None,
        });
        assert!(persist_changes(&pool, request).await.is_err());
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM chat_sessions")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn short_search_uses_like_and_branch_delete_queues_release() {
        let pool = test_pool().await;
        let request = PersistChatChangesRequest {
            session: session(),
            upsert_messages: vec![
                message("root", None, 0, "system"),
                message("user", Some("root"), 1, "你好"),
                message("assistant", Some("user"), 2, "answer"),
            ],
            delete_message_ids: Vec::new(),
            upsert_attachments: vec![ChatAttachmentInput {
                id: "attachment-1".into(),
                message_id: "assistant".into(),
                asset_id: "asset-1".into(),
                kind: "image".into(),
                display_name: "photo.png".into(),
                mime_type: "image/png".into(),
                size_bytes: 1,
                usage_policy: "advisory".into(),
                extracted_text: None,
                sort_order: 0,
                created_at: None,
            }],
            delete_attachment_ids: Vec::new(),
        };
        persist_changes(&pool, request).await.unwrap();
        let basic = search_messages(
            &pool,
            ChatSearchQuery {
                query: "你".into(),
                limit: None,
            },
        )
        .await
        .unwrap();
        assert_eq!(basic.len(), 1);
        assert!(basic[0].snippet.contains('你'));
        let result = delete_branch(
            &pool,
            DeleteChatBranchRequest {
                session_id: "session-1".into(),
                root_message_id: "user".into(),
                fallback_active_leaf_id: "root".into(),
            },
        )
        .await
        .unwrap();
        assert_eq!(result.deleted_messages, 2);
        assert_eq!(result.queued_release_events, 1);
        let operations: Vec<String> =
            sqlx::query_scalar("SELECT operation FROM asset_usage_outbox ORDER BY sequence ASC")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(operations, vec!["replace", "release"]);
        let pending = pending_outbox(&pool, 10).await.unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].entity_id, "assistant");
    }

    #[tokio::test]
    async fn search_handles_english_and_literal_like_wildcards() {
        let pool = test_pool().await;
        persist_changes(
            &pool,
            PersistChatChangesRequest {
                session: session(),
                upsert_messages: vec![
                    message("root", None, 0, "system"),
                    message(
                        "assistant",
                        Some("root"),
                        1,
                        "long prefix before Alpha Beta and literal %_ markers",
                    ),
                ],
                delete_message_ids: Vec::new(),
                upsert_attachments: Vec::new(),
                delete_attachment_ids: Vec::new(),
            },
        )
        .await
        .unwrap();

        let english = search_messages(
            &pool,
            ChatSearchQuery {
                query: "alpha".into(),
                limit: Some(1),
            },
        )
        .await
        .unwrap();
        assert_eq!(english.len(), 1);
        assert!(english[0].snippet.contains("Alpha"));

        let literal_wildcards = search_messages(
            &pool,
            ChatSearchQuery {
                query: "%_".into(),
                limit: None,
            },
        )
        .await
        .unwrap();
        assert_eq!(literal_wildcards.len(), 1);
        assert!(literal_wildcards[0].snippet.contains("%_"));
    }

    #[tokio::test]
    async fn search_falls_back_to_basic_when_fts_is_unavailable() {
        let pool = test_pool().await;
        persist_changes(
            &pool,
            PersistChatChangesRequest {
                session: session(),
                upsert_messages: vec![
                    message("root", None, 0, "system"),
                    message(
                        "assistant",
                        Some("root"),
                        1,
                        "fallback preserves searchable message content",
                    ),
                ],
                delete_message_ids: Vec::new(),
                upsert_attachments: Vec::new(),
                delete_attachment_ids: Vec::new(),
            },
        )
        .await
        .unwrap();
        sqlx::query("DROP TABLE chat_messages_fts")
            .execute(&pool)
            .await
            .unwrap();

        let results = search_messages(
            &pool,
            ChatSearchQuery {
                query: "searchable".into(),
                limit: None,
            },
        )
        .await
        .unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].snippet.contains("searchable"));
    }

    #[tokio::test]
    async fn attachment_replacement_and_session_delete_preserve_outbox_order() {
        let pool = test_pool().await;
        let request = PersistChatChangesRequest {
            session: session(),
            upsert_messages: vec![
                message("root", None, 0, "system"),
                message("assistant", Some("root"), 1, "answer"),
            ],
            delete_message_ids: Vec::new(),
            upsert_attachments: vec![ChatAttachmentInput {
                id: "attachment-1".into(),
                message_id: "assistant".into(),
                asset_id: "asset-a".into(),
                kind: "image".into(),
                display_name: "a.png".into(),
                mime_type: "image/png".into(),
                size_bytes: 1,
                usage_policy: "advisory".into(),
                extracted_text: None,
                sort_order: 0,
                created_at: None,
            }],
            delete_attachment_ids: Vec::new(),
        };
        persist_changes(&pool, request).await.unwrap();

        let first = pending_outbox(&pool, 10).await.unwrap();
        assert_eq!(first.len(), 1);
        // An asset command can succeed while this ACK is lost. The event stays pending and is
        // intentionally selected again for idempotent redelivery.
        let redelivery = pending_outbox(&pool, 10).await.unwrap();
        assert_eq!(redelivery[0].sequence, first[0].sequence);
        acknowledge_outbox(&pool, first[0].sequence).await.unwrap();

        persist_changes(
            &pool,
            PersistChatChangesRequest {
                session: session(),
                upsert_messages: Vec::new(),
                delete_message_ids: Vec::new(),
                upsert_attachments: vec![ChatAttachmentInput {
                    id: "attachment-1".into(),
                    message_id: "assistant".into(),
                    asset_id: "asset-b".into(),
                    kind: "image".into(),
                    display_name: "b.png".into(),
                    mime_type: "image/png".into(),
                    size_bytes: 2,
                    usage_policy: "blocking".into(),
                    extracted_text: None,
                    sort_order: 0,
                    created_at: None,
                }],
                delete_attachment_ids: Vec::new(),
            },
        )
        .await
        .unwrap();
        let replacement = pending_outbox(&pool, 10).await.unwrap();
        assert_eq!(replacement.len(), 1);
        assert_eq!(replacement[0].entity_id, "assistant");
        let operation: String =
            sqlx::query_scalar("SELECT operation FROM asset_usage_outbox WHERE sequence = ?")
                .bind(replacement[0].sequence)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(operation, "replace");
        acknowledge_outbox(&pool, replacement[0].sequence)
            .await
            .unwrap();

        let deleted = delete_session(&pool, "session-1".into()).await.unwrap();
        assert_eq!(deleted.queued_release_events, 1);
        let release = pending_outbox(&pool, 10).await.unwrap();
        assert_eq!(release.len(), 1);
        assert_eq!(release[0].entity_id, "assistant");
        let release_operation: String =
            sqlx::query_scalar("SELECT operation FROM asset_usage_outbox WHERE sequence = ?")
                .bind(release[0].sequence)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(release_operation, "release");
    }

    #[tokio::test]
    async fn dead_letter_blocks_only_its_own_entity_until_retry() {
        let pool = test_pool().await;
        for (event_id, entity_id) in [
            ("broken-1", "broken-message"),
            ("healthy-1", "healthy-message"),
            ("broken-2", "broken-message"),
        ] {
            sqlx::query(
                "INSERT INTO asset_usage_outbox(event_id, module_id, entity_type, entity_id, operation, payload_json, created_at) \
                 VALUES (?, 'llm-chat', 'message', ?, 'replace', '[]', '2026-01-01')",
            )
            .bind(event_id)
            .bind(entity_id)
            .execute(&pool)
            .await
            .unwrap();
        }
        let broken_sequence: i64 = sqlx::query_scalar(
            "SELECT sequence FROM asset_usage_outbox WHERE event_id = 'broken-1'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        for attempt in 1..=MAX_OUTBOX_ATTEMPTS {
            assert_eq!(
                record_outbox_failure(&pool, broken_sequence, "injected failure")
                    .await
                    .unwrap(),
                attempt == MAX_OUTBOX_ATTEMPTS
            );
        }

        let pending = pending_outbox(&pool, 10).await.unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].entity_id, "healthy-message");
        acknowledge_outbox(&pool, pending[0].sequence)
            .await
            .unwrap();

        assert!(retry_outbox(&pool, "broken-1").await.unwrap());
        let retried = pending_outbox(&pool, 10).await.unwrap();
        assert_eq!(retried.len(), 1);
        assert_eq!(retried[0].entity_id, "broken-message");
        acknowledge_outbox(&pool, retried[0].sequence)
            .await
            .unwrap();
        let next = pending_outbox(&pool, 10).await.unwrap();
        assert_eq!(next.len(), 1);
        assert_eq!(next[0].entity_id, "broken-message");
    }
}
