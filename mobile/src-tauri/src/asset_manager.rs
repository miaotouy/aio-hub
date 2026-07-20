use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{
    migrate::Migrator,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
    FromRow, QueryBuilder, Sqlite, SqlitePool,
};
use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    str::FromStr,
    time::Duration,
};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_fs::{FilePath, FsExt};
use tokio::sync::{Mutex, OnceCell};
use uuid::Uuid;

static ASSET_MIGRATOR: Migrator = sqlx::migrate!("./migrations/asset-manager");

const ASSET_DIR: &str = "assets";
const ASSET_DB: &str = "asset_manager.db";
const MAX_IMPORT_BATCH: usize = 100;
const MAX_USAGE_BATCH: usize = 1_000;

pub struct AssetManagerState {
    pool: OnceCell<SqlitePool>,
    import_lock: Mutex<()>,
}

impl Default for AssetManagerState {
    fn default() -> Self {
        Self {
            pool: OnceCell::new(),
            import_lock: Mutex::new(()),
        }
    }
}

impl AssetManagerState {
    async fn pool(&self, app: &AppHandle) -> Result<&SqlitePool, String> {
        self.pool
            .get_or_try_init(|| async {
                let paths = AssetPaths::from_app(app)?;
                tokio::fs::create_dir_all(&paths.objects)
                    .await
                    .map_err(|error| format!("ASSET_STORAGE_INIT: {error}"))?;
                tokio::fs::create_dir_all(&paths.imports)
                    .await
                    .map_err(|error| format!("ASSET_STORAGE_INIT: {error}"))?;

                let options = SqliteConnectOptions::new()
                    .filename(&paths.database)
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
                    .map_err(|error| format!("ASSET_DATABASE_OPEN: {error}"))?;
                ASSET_MIGRATOR
                    .run(&pool)
                    .await
                    .map_err(|error| format!("ASSET_DATABASE_MIGRATION: {error}"))?;
                Ok(pool)
            })
            .await
    }
}

#[derive(Clone)]
struct AssetPaths {
    root: PathBuf,
    database: PathBuf,
    objects: PathBuf,
    imports: PathBuf,
}

impl AssetPaths {
    fn from_app(app: &AppHandle) -> Result<Self, String> {
        let root = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("ASSET_APP_DATA_PATH: {error}"))?
            .join(ASSET_DIR);
        Ok(Self {
            database: root.join(ASSET_DB),
            objects: root.join("objects"),
            imports: root.join("tmp").join("imports"),
            root,
        })
    }

    fn resolve_relative(&self, relative_path: &str) -> Result<PathBuf, String> {
        let relative = Path::new(relative_path);
        if relative.is_absolute()
            || relative
                .components()
                .any(|component| !matches!(component, Component::Normal(_)))
        {
            return Err("ASSET_INVALID_RELATIVE_PATH".into());
        }
        Ok(self.root.join(relative))
    }
}

#[derive(Debug, Clone, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AssetRecord {
    pub id: String,
    pub content_hash: String,
    pub kind: String,
    pub mime_type: String,
    pub display_name: String,
    pub size_bytes: i64,
    pub storage_mode: String,
    #[serde(skip_serializing)]
    pub relative_path: Option<String>,
    pub availability: String,
    pub library_state: String,
    pub retention_policy: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetImportSource {
    reference: String,
    origin_kind: String,
    source_module: String,
    original_name: Option<String>,
    mime_type: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetImportResult {
    source_index: usize,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    asset: Option<AssetRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetListQuery {
    kind: Option<String>,
    search: Option<String>,
    include_hidden: Option<bool>,
    include_unavailable: Option<bool>,
    limit: Option<u32>,
    offset: Option<u32>,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AssetOriginSummary {
    id: i64,
    origin_kind: String,
    source_module: String,
    original_name: String,
    created_at: String,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AssetUsageSummary {
    id: i64,
    module_id: String,
    entity_type: String,
    entity_id: String,
    role: String,
    usage_policy: String,
    created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetDetail {
    #[serde(flatten)]
    asset: AssetRecord,
    origins: Vec<AssetOriginSummary>,
    usages: Vec<AssetUsageSummary>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetUsageInput {
    asset_id: String,
    role: String,
    usage_policy: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetUsageReplaceResult {
    usage_count: usize,
}

struct StagedObject {
    temp_path: PathBuf,
    content_hash: String,
    size_bytes: i64,
}

#[tauri::command]
pub async fn asset_import_sources(
    app: AppHandle,
    state: State<'_, AssetManagerState>,
    sources: Vec<AssetImportSource>,
) -> Result<Vec<AssetImportResult>, String> {
    if sources.is_empty() || sources.len() > MAX_IMPORT_BATCH {
        return Err("ASSET_INVALID_IMPORT_BATCH".into());
    }
    let pool = state.pool(&app).await?.clone();
    let paths = AssetPaths::from_app(&app)?;
    let _guard = state.import_lock.lock().await;
    let mut output = Vec::with_capacity(sources.len());

    for (source_index, source) in sources.into_iter().enumerate() {
        let result = match validate_import_source(&source) {
            Ok(()) => import_one(&app, &pool, &paths, source).await,
            Err(error) => Err(error),
        };
        match result {
            Ok((status, asset)) => output.push(AssetImportResult {
                source_index,
                status,
                asset: Some(asset),
                error_code: None,
                message: None,
            }),
            Err(error) => output.push(AssetImportResult {
                source_index,
                status: "failed".into(),
                asset: None,
                error_code: Some(error_code(&error).into()),
                message: Some("无法导入所选文件，原件未加入资产库。".into()),
            }),
        }
    }
    Ok(output)
}

#[tauri::command]
pub async fn asset_list(
    app: AppHandle,
    state: State<'_, AssetManagerState>,
    query: Option<AssetListQuery>,
) -> Result<Vec<AssetRecord>, String> {
    let query = query.unwrap_or_default();
    if let Some(kind) = query.kind.as_deref() {
        validate_kind(kind)?;
    }
    let search = query
        .search
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if search.is_some_and(|value| value.len() > 200) {
        return Err("ASSET_INVALID_SEARCH".into());
    }
    let pool = state.pool(&app).await?;
    let mut builder: QueryBuilder<'_, Sqlite> = QueryBuilder::new(
        "SELECT id, content_hash, kind, mime_type, display_name, size_bytes, storage_mode, \
         relative_path, availability, library_state, retention_policy, created_at, updated_at \
         FROM assets WHERE 1 = 1",
    );
    if !query.include_hidden.unwrap_or(false) {
        builder.push(" AND library_state = 'visible'");
    }
    if !query.include_unavailable.unwrap_or(false) {
        builder.push(" AND availability = 'ready'");
    }
    if let Some(kind) = query.kind {
        builder.push(" AND kind = ").push_bind(kind);
    }
    if let Some(search) = search {
        builder
            .push(" AND display_name LIKE ")
            .push_bind(format!("%{}%", escape_like(search)))
            .push(" ESCAPE '\\'");
    }
    builder
        .push(" ORDER BY updated_at DESC, id DESC LIMIT ")
        .push_bind(i64::from(query.limit.unwrap_or(50).clamp(1, 100)))
        .push(" OFFSET ")
        .push_bind(i64::from(query.offset.unwrap_or(0)));
    builder
        .build_query_as::<AssetRecord>()
        .fetch_all(pool)
        .await
        .map_err(|error| format!("ASSET_LIST_FAILED: {error}"))
}

#[tauri::command]
pub async fn asset_get_detail(
    app: AppHandle,
    state: State<'_, AssetManagerState>,
    asset_id: String,
) -> Result<AssetDetail, String> {
    validate_identifier("assetId", &asset_id)?;
    let pool = state.pool(&app).await?;
    let asset = find_asset_by_id(pool, &asset_id)
        .await?
        .ok_or_else(|| "ASSET_NOT_FOUND".to_string())?;
    let origins = sqlx::query_as::<_, AssetOriginSummary>(
        "SELECT id, origin_kind, source_module, original_name, created_at \
         FROM asset_origins WHERE asset_id = ? ORDER BY created_at DESC, id DESC",
    )
    .bind(&asset_id)
    .fetch_all(pool)
    .await
    .map_err(|error| format!("ASSET_ORIGINS_FAILED: {error}"))?;
    let usages = sqlx::query_as::<_, AssetUsageSummary>(
        "SELECT id, module_id, entity_type, entity_id, role, usage_policy, created_at \
         FROM asset_usages WHERE asset_id = ? ORDER BY created_at DESC, id DESC",
    )
    .bind(&asset_id)
    .fetch_all(pool)
    .await
    .map_err(|error| format!("ASSET_USAGES_FAILED: {error}"))?;
    Ok(AssetDetail {
        asset,
        origins,
        usages,
    })
}

#[tauri::command]
pub async fn asset_replace_entity_usages(
    app: AppHandle,
    state: State<'_, AssetManagerState>,
    module_id: String,
    entity_type: String,
    entity_id: String,
    usages: Vec<AssetUsageInput>,
) -> Result<AssetUsageReplaceResult, String> {
    validate_identifier("moduleId", &module_id)?;
    validate_identifier("entityType", &entity_type)?;
    validate_identifier("entityId", &entity_id)?;
    if usages.len() > MAX_USAGE_BATCH {
        return Err("ASSET_USAGE_BATCH_TOO_LARGE".into());
    }
    let mut unique = HashSet::new();
    for usage in &usages {
        validate_identifier("assetId", &usage.asset_id)?;
        validate_identifier("role", &usage.role)?;
        if !matches!(usage.usage_policy.as_str(), "advisory" | "blocking") {
            return Err("ASSET_INVALID_USAGE_POLICY".into());
        }
        if !unique.insert((usage.asset_id.as_str(), usage.role.as_str())) {
            return Err("ASSET_DUPLICATE_USAGE".into());
        }
    }

    let pool = state.pool(&app).await?;
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("ASSET_USAGE_TRANSACTION: {error}"))?;
    sqlx::query(
        "DELETE FROM asset_usages WHERE module_id = ? AND entity_type = ? AND entity_id = ?",
    )
    .bind(&module_id)
    .bind(&entity_type)
    .bind(&entity_id)
    .execute(&mut *transaction)
    .await
    .map_err(|error| format!("ASSET_USAGE_DELETE: {error}"))?;
    for usage in &usages {
        sqlx::query(
            "INSERT INTO asset_usages( \
               asset_id, module_id, entity_type, entity_id, role, usage_policy, created_at \
             ) VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        )
        .bind(&usage.asset_id)
        .bind(&module_id)
        .bind(&entity_type)
        .bind(&entity_id)
        .bind(&usage.role)
        .bind(&usage.usage_policy)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("ASSET_USAGE_INSERT: {error}"))?;
    }
    transaction
        .commit()
        .await
        .map_err(|error| format!("ASSET_USAGE_COMMIT: {error}"))?;
    Ok(AssetUsageReplaceResult {
        usage_count: usages.len(),
    })
}

async fn import_one(
    app: &AppHandle,
    pool: &SqlitePool,
    paths: &AssetPaths,
    source: AssetImportSource,
) -> Result<(String, AssetRecord), String> {
    let temp_path = paths.imports.join(format!("{}.part", Uuid::new_v4()));
    let staged = stage_source(app.clone(), source.reference.clone(), temp_path).await?;
    let result = register_staged_object(pool, paths, &source, &staged).await;
    if result.is_err() && staged.temp_path.exists() {
        let _ = fs::remove_file(&staged.temp_path);
    }
    result
}

async fn stage_source(
    app: AppHandle,
    reference: String,
    temp_path: PathBuf,
) -> Result<StagedObject, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let file_path = FilePath::from_str(&reference)
            .map_err(|_| "ASSET_INVALID_SOURCE_REFERENCE".to_string())?;
        let result = (|| {
            let input = app
                .fs()
                .open(file_path.clone(), Default::default())
                .map_err(|error| format!("ASSET_SOURCE_OPEN: {error}"))?;
            copy_and_hash(input, &temp_path)
        })();
        #[cfg(target_os = "ios")]
        {
            let _ = app.fs().stop_accessing_security_scoped_resource(file_path);
        }
        if result.is_err() && temp_path.exists() {
            let _ = fs::remove_file(&temp_path);
        }
        result.map(|(content_hash, size_bytes)| StagedObject {
            temp_path,
            content_hash,
            size_bytes,
        })
    })
    .await
    .map_err(|error| format!("ASSET_IMPORT_TASK: {error}"))?
}

fn copy_and_hash(mut input: impl Read, temp_path: &Path) -> Result<(String, i64), String> {
    let mut output = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(temp_path)
        .map_err(|error| format!("ASSET_TEMP_CREATE: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 1024 * 1024];
    let mut size_bytes = 0_i64;
    loop {
        let bytes_read = input
            .read(&mut buffer)
            .map_err(|error| format!("ASSET_SOURCE_READ: {error}"))?;
        if bytes_read == 0 {
            break;
        }
        output
            .write_all(&buffer[..bytes_read])
            .map_err(|error| format!("ASSET_TEMP_WRITE: {error}"))?;
        hasher.update(&buffer[..bytes_read]);
        size_bytes = size_bytes
            .checked_add(bytes_read as i64)
            .ok_or_else(|| "ASSET_SIZE_OVERFLOW".to_string())?;
    }
    output
        .sync_all()
        .map_err(|error| format!("ASSET_TEMP_SYNC: {error}"))?;
    Ok((format!("{:x}", hasher.finalize()), size_bytes))
}

async fn register_staged_object(
    pool: &SqlitePool,
    paths: &AssetPaths,
    source: &AssetImportSource,
    staged: &StagedObject,
) -> Result<(String, AssetRecord), String> {
    let existing = find_asset_by_hash(pool, &staged.content_hash).await?;
    if let Some(asset) = existing.as_ref() {
        if asset.availability == "ready" {
            if let Some(relative_path) = asset.relative_path.as_deref() {
                if paths.resolve_relative(relative_path)?.is_file() {
                    fs::remove_file(&staged.temp_path)
                        .map_err(|error| format!("ASSET_TEMP_CLEANUP: {error}"))?;
                    insert_origin(pool, &asset.id, source).await?;
                    return Ok((
                        "deduplicated".into(),
                        find_asset_by_id(pool, &asset.id).await?.unwrap(),
                    ));
                }
            }
        }
    }

    let original_name = normalized_display_name(source);
    let mime_type = normalized_mime(source, &original_name);
    let kind = kind_from_mime_and_name(&mime_type, &original_name).to_string();
    let relative_path = object_relative_path(
        &staged.content_hash,
        extension_for_object(&original_name, &mime_type),
    );
    let final_path = paths.resolve_relative(&relative_path)?;
    if let Some(parent) = final_path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("ASSET_OBJECT_DIR: {error}"))?;
    }
    let created_object = if final_path.exists() {
        fs::remove_file(&staged.temp_path)
            .map_err(|error| format!("ASSET_TEMP_CLEANUP: {error}"))?;
        false
    } else {
        fs::rename(&staged.temp_path, &final_path)
            .map_err(|error| format!("ASSET_OBJECT_PROMOTE: {error}"))?;
        true
    };

    let asset_id = existing
        .as_ref()
        .map(|asset| asset.id.clone())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("ASSET_IMPORT_TRANSACTION: {error}"))?;
    let database_result = async {
        if existing.is_some() {
            sqlx::query(
                "UPDATE assets SET kind = ?, mime_type = ?, display_name = ?, size_bytes = ?, \
                 relative_path = ?, availability = 'ready', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
                 WHERE id = ?",
            )
            .bind(&kind)
            .bind(&mime_type)
            .bind(&original_name)
            .bind(staged.size_bytes)
            .bind(&relative_path)
            .bind(&asset_id)
            .execute(&mut *transaction)
            .await?;
        } else {
            sqlx::query(
                "INSERT INTO assets( \
                   id, content_hash, kind, mime_type, display_name, size_bytes, storage_mode, \
                   relative_path, availability, library_state, retention_policy, created_at, updated_at \
                 ) VALUES (?, ?, ?, ?, ?, ?, 'managed', ?, 'ready', 'visible', 'reclaimable', \
                   strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
            )
            .bind(&asset_id)
            .bind(&staged.content_hash)
            .bind(&kind)
            .bind(&mime_type)
            .bind(&original_name)
            .bind(staged.size_bytes)
            .bind(&relative_path)
            .execute(&mut *transaction)
            .await?;
        }
        insert_origin_in_transaction(&mut transaction, &asset_id, source).await?;
        transaction.commit().await
    }
    .await;
    if let Err(error) = database_result {
        if created_object {
            let _ = fs::remove_file(&final_path);
        }
        return Err(format!("ASSET_IMPORT_COMMIT: {error}"));
    }
    let asset = find_asset_by_id(pool, &asset_id)
        .await?
        .ok_or_else(|| "ASSET_IMPORT_RESULT_MISSING".to_string())?;
    Ok((
        if existing.is_some() {
            "restored".into()
        } else {
            "imported".into()
        },
        asset,
    ))
}

async fn insert_origin(
    pool: &SqlitePool,
    asset_id: &str,
    source: &AssetImportSource,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO asset_origins( \
           asset_id, origin_kind, source_module, original_name, locator, created_at \
         ) VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    )
    .bind(asset_id)
    .bind(&source.origin_kind)
    .bind(&source.source_module)
    .bind(normalized_display_name(source))
    .bind(&source.reference)
    .execute(pool)
    .await
    .map_err(|error| format!("ASSET_ORIGIN_INSERT: {error}"))?;
    Ok(())
}

async fn insert_origin_in_transaction(
    transaction: &mut sqlx::Transaction<'_, Sqlite>,
    asset_id: &str,
    source: &AssetImportSource,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO asset_origins( \
           asset_id, origin_kind, source_module, original_name, locator, created_at \
         ) VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    )
    .bind(asset_id)
    .bind(&source.origin_kind)
    .bind(&source.source_module)
    .bind(normalized_display_name(source))
    .bind(&source.reference)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

async fn find_asset_by_hash(
    pool: &SqlitePool,
    content_hash: &str,
) -> Result<Option<AssetRecord>, String> {
    sqlx::query_as::<_, AssetRecord>(
        "SELECT id, content_hash, kind, mime_type, display_name, size_bytes, storage_mode, \
         relative_path, availability, library_state, retention_policy, created_at, updated_at \
         FROM assets WHERE content_hash = ?",
    )
    .bind(content_hash)
    .fetch_optional(pool)
    .await
    .map_err(|error| format!("ASSET_HASH_LOOKUP: {error}"))
}

async fn find_asset_by_id(
    pool: &SqlitePool,
    asset_id: &str,
) -> Result<Option<AssetRecord>, String> {
    sqlx::query_as::<_, AssetRecord>(
        "SELECT id, content_hash, kind, mime_type, display_name, size_bytes, storage_mode, \
         relative_path, availability, library_state, retention_policy, created_at, updated_at \
         FROM assets WHERE id = ?",
    )
    .bind(asset_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| format!("ASSET_ID_LOOKUP: {error}"))
}

fn validate_import_source(source: &AssetImportSource) -> Result<(), String> {
    if source.reference.is_empty() || source.reference.len() > 8_192 {
        return Err("ASSET_INVALID_SOURCE_REFERENCE".into());
    }
    validate_source_reference(&source.reference)?;
    if !matches!(
        source.origin_kind.as_str(),
        "file_picker" | "photo_picker" | "camera" | "share" | "network" | "generated" | "tool"
    ) {
        return Err("ASSET_INVALID_ORIGIN_KIND".into());
    }
    validate_identifier("sourceModule", &source.source_module)?;
    if source
        .original_name
        .as_ref()
        .is_some_and(|name| name.is_empty() || name.len() > 512)
    {
        return Err("ASSET_INVALID_ORIGINAL_NAME".into());
    }
    if source
        .mime_type
        .as_ref()
        .is_some_and(|mime| mime.is_empty() || mime.len() > 255 || mime.contains(['\r', '\n']))
    {
        return Err("ASSET_INVALID_MIME_TYPE".into());
    }
    Ok(())
}

fn validate_source_reference(reference: &str) -> Result<(), String> {
    match FilePath::from_str(reference).map_err(|_| "ASSET_INVALID_SOURCE_REFERENCE")? {
        FilePath::Url(url) if matches!(url.scheme(), "content" | "file") => Ok(()),
        FilePath::Path(path) if path.is_absolute() => Ok(()),
        _ => Err("ASSET_UNSUPPORTED_SOURCE_REFERENCE".into()),
    }
}

fn validate_identifier(field: &str, value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 200
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "-_.:/".contains(character))
    {
        return Err(format!("ASSET_INVALID_IDENTIFIER:{field}"));
    }
    Ok(())
}

fn validate_kind(kind: &str) -> Result<(), String> {
    if matches!(kind, "image" | "audio" | "video" | "document" | "other") {
        Ok(())
    } else {
        Err("ASSET_INVALID_KIND".into())
    }
}

fn normalized_display_name(source: &AssetImportSource) -> String {
    let candidate = source
        .original_name
        .as_deref()
        .unwrap_or(&source.reference)
        .replace('\\', "/");
    let name = candidate
        .rsplit('/')
        .next()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or("unnamed");
    name.chars().take(512).collect()
}

fn normalized_mime(source: &AssetImportSource, name: &str) -> String {
    source
        .mime_type
        .as_deref()
        .unwrap_or_else(|| mime_from_extension(name))
        .to_ascii_lowercase()
}

fn mime_from_extension(name: &str) -> &'static str {
    match name
        .rsplit('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "heic" | "heif" => "image/heic",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "m4a" => "audio/mp4",
        "ogg" => "audio/ogg",
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        "pdf" => "application/pdf",
        "txt" | "md" => "text/plain",
        "json" => "application/json",
        _ => "application/octet-stream",
    }
}

fn kind_from_mime_and_name(mime: &str, name: &str) -> &'static str {
    if mime.starts_with("image/") {
        "image"
    } else if mime.starts_with("audio/") {
        "audio"
    } else if mime.starts_with("video/") {
        "video"
    } else if mime.starts_with("text/")
        || matches!(
            mime,
            "application/pdf"
                | "application/json"
                | "application/msword"
                | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        || matches!(
            name.rsplit('.')
                .next()
                .unwrap_or_default()
                .to_ascii_lowercase()
                .as_str(),
            "pdf" | "txt" | "md" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx"
        )
    {
        "document"
    } else {
        "other"
    }
}

fn extension_for_object(name: &str, mime: &str) -> Option<String> {
    let extension = name
        .rsplit_once('.')
        .map(|(_, extension)| extension.to_ascii_lowercase())
        .filter(|extension| {
            (1..=10).contains(&extension.len())
                && extension
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric())
        });
    extension.or_else(|| {
        Some(
            match mime {
                "image/jpeg" => "jpg",
                "image/png" => "png",
                "image/webp" => "webp",
                "application/pdf" => "pdf",
                "audio/mpeg" => "mp3",
                "video/mp4" => "mp4",
                _ => return None,
            }
            .into(),
        )
    })
}

fn object_relative_path(content_hash: &str, extension: Option<String>) -> String {
    let suffix = extension
        .map(|value| format!(".{value}"))
        .unwrap_or_default();
    format!("objects/{}/{content_hash}{suffix}", &content_hash[..2])
}

fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn error_code(error: &str) -> &str {
    error
        .split([':', ' '])
        .next()
        .unwrap_or("ASSET_IMPORT_FAILED")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn hashes_while_copying_without_a_second_read() {
        let root = std::env::temp_dir().join(format!("aio-asset-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let temporary = root.join("sample.part");
        let (hash, size) = copy_and_hash(Cursor::new(b"aio-asset"), &temporary).unwrap();
        assert_eq!(size, 9);
        assert_eq!(
            hash,
            "9936261a67b27401cad988fd0c28ebd7b8649cba3f22cfb18f42568aeabbbc2e"
        );
        assert_eq!(fs::read(&temporary).unwrap(), b"aio-asset");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn generated_object_paths_cannot_escape_the_asset_root() {
        let hash = "a".repeat(64);
        assert_eq!(
            object_relative_path(&hash, Some("png".into())),
            format!("objects/aa/{hash}.png")
        );
        let paths = AssetPaths {
            root: PathBuf::from("asset-root"),
            database: PathBuf::new(),
            objects: PathBuf::new(),
            imports: PathBuf::new(),
        };
        assert!(paths.resolve_relative("../outside").is_err());
        assert!(paths.resolve_relative("objects/aa/file.png").is_ok());
    }

    #[test]
    fn only_local_picker_references_are_accepted() {
        assert!(validate_source_reference("content://provider/item/1").is_ok());
        assert!(validate_source_reference("file:///tmp/item.png").is_ok());
        assert!(validate_source_reference("https://example.com/item.png").is_err());
        assert!(validate_source_reference("relative/item.png").is_err());
    }

    #[tokio::test]
    async fn migration_creates_the_asset_domain_tables() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        ASSET_MIGRATOR.run(&pool).await.unwrap();
        let tables: Vec<String> =
            sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
                .fetch_all(&pool)
                .await
                .unwrap();
        for expected in [
            "asset_origins",
            "asset_usages",
            "asset_variants",
            "assets",
            "import_jobs",
        ] {
            assert!(tables.iter().any(|table| table == expected));
        }
    }

    #[tokio::test]
    async fn duplicate_and_reclaimed_imports_preserve_the_asset_identity() {
        let root = std::env::temp_dir().join(format!("aio-asset-test-{}", Uuid::new_v4()));
        let paths = AssetPaths {
            database: root.join(ASSET_DB),
            objects: root.join("objects"),
            imports: root.join("tmp").join("imports"),
            root: root.clone(),
        };
        fs::create_dir_all(&paths.imports).unwrap();
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        ASSET_MIGRATOR.run(&pool).await.unwrap();
        let source = AssetImportSource {
            reference: root.join("source.png").to_string_lossy().into_owned(),
            origin_kind: "file_picker".into(),
            source_module: "asset-manager-test".into(),
            original_name: Some("source.png".into()),
            mime_type: Some("image/png".into()),
        };

        let first_temp = paths.imports.join("first.part");
        let (content_hash, size_bytes) =
            copy_and_hash(Cursor::new(b"same-content"), &first_temp).unwrap();
        let first = StagedObject {
            temp_path: first_temp,
            content_hash: content_hash.clone(),
            size_bytes,
        };
        let (first_status, first_asset) = register_staged_object(&pool, &paths, &source, &first)
            .await
            .unwrap();
        assert_eq!(first_status, "imported");

        let second_temp = paths.imports.join("second.part");
        let (_, size_bytes) = copy_and_hash(Cursor::new(b"same-content"), &second_temp).unwrap();
        let second = StagedObject {
            temp_path: second_temp,
            content_hash: content_hash.clone(),
            size_bytes,
        };
        let (second_status, second_asset) = register_staged_object(&pool, &paths, &source, &second)
            .await
            .unwrap();
        assert_eq!(second_status, "deduplicated");
        assert_eq!(second_asset.id, first_asset.id);
        let origin_count: i64 =
            sqlx::query_scalar("SELECT count(*) FROM asset_origins WHERE asset_id = ?")
                .bind(&first_asset.id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(origin_count, 2);

        let managed_path = paths
            .resolve_relative(first_asset.relative_path.as_deref().unwrap())
            .unwrap();
        fs::remove_file(managed_path).unwrap();
        sqlx::query(
            "UPDATE assets SET availability = 'reclaimed', relative_path = NULL WHERE id = ?",
        )
        .bind(&first_asset.id)
        .execute(&pool)
        .await
        .unwrap();
        let third_temp = paths.imports.join("third.part");
        let (_, size_bytes) = copy_and_hash(Cursor::new(b"same-content"), &third_temp).unwrap();
        let third = StagedObject {
            temp_path: third_temp,
            content_hash,
            size_bytes,
        };
        let (third_status, third_asset) = register_staged_object(&pool, &paths, &source, &third)
            .await
            .unwrap();
        assert_eq!(third_status, "restored");
        assert_eq!(third_asset.id, first_asset.id);
        assert_eq!(third_asset.availability, "ready");

        pool.close().await;
        fs::remove_dir_all(root).unwrap();
    }
}
