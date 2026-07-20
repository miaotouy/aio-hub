use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{
    migrate::Migrator,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous},
    FromRow, QueryBuilder, Sqlite, SqlitePool,
};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    str::FromStr,
    sync::{
        atomic::{AtomicI64, Ordering},
        Arc, Mutex as StdMutex,
    },
    time::Duration,
};
use tauri::{ipc::Channel, AppHandle, Manager, State};
use tauri_plugin_fs::{FilePath, FsExt};
use tokio::sync::{Mutex, OnceCell};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

static ASSET_MIGRATOR: Migrator = sqlx::migrate!("./migrations/asset-manager");

const ASSET_DIR: &str = "assets";
const ASSET_DB: &str = "asset_manager.db";
const MAX_IMPORT_BATCH: usize = 100;
const MAX_IMPORT_JOB_LIST: u32 = 100;
const IMPORT_PROGRESS_STEP_BYTES: i64 = 4 * 1024 * 1024;
const MAX_USAGE_BATCH: usize = 1_000;
const MAX_MUTATION_BATCH: usize = 500;

#[derive(Clone)]
pub struct AssetManagerState {
    pool: Arc<OnceCell<SqlitePool>>,
    mutation_lock: Arc<Mutex<()>>,
    active_imports: Arc<StdMutex<HashMap<String, CancellationToken>>>,
}

impl Default for AssetManagerState {
    fn default() -> Self {
        Self {
            pool: Arc::new(OnceCell::new()),
            mutation_lock: Arc::new(Mutex::new(())),
            active_imports: Arc::new(StdMutex::new(HashMap::new())),
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
                run_startup_recovery(&pool, &paths).await?;
                Ok(pool)
            })
            .await
    }
}

#[derive(Clone)]
struct AssetPaths {
    root: PathBuf,
    cache_root: PathBuf,
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
        let cache_root = app
            .path()
            .app_cache_dir()
            .map_err(|error| format!("ASSET_CACHE_PATH: {error}"))?
            .join(ASSET_DIR);
        Ok(Self {
            database: root.join(ASSET_DB),
            objects: root.join("objects"),
            imports: root.join("tmp").join("imports"),
            cache_root,
            root,
        })
    }

    fn resolve_relative(&self, relative_path: &str) -> Result<PathBuf, String> {
        resolve_beneath(&self.root, relative_path)
    }

    fn resolve_storage(&self, storage_root: &str, relative_path: &str) -> Result<PathBuf, String> {
        match storage_root {
            "app_data" => self.resolve_relative(relative_path),
            "cache" => resolve_beneath(&self.cache_root, relative_path),
            _ => Err("ASSET_INVALID_STORAGE_ROOT".into()),
        }
    }
}

fn resolve_beneath(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let relative = Path::new(relative_path);
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("ASSET_INVALID_RELATIVE_PATH".into());
    }
    Ok(root.join(relative))
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetImportSource {
    reference: String,
    origin_kind: String,
    source_module: String,
    original_name: Option<String>,
    mime_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetImportJob {
    id: String,
    source_kind: String,
    state: String,
    bytes_copied: i64,
    total_bytes: Option<i64>,
    source_count: i64,
    completed_count: i64,
    current_source_index: Option<i64>,
    results: Vec<AssetImportResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error_code: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, FromRow)]
struct AssetImportJobRow {
    id: String,
    source_kind: String,
    state: String,
    bytes_copied: i64,
    total_bytes: Option<i64>,
    source_count: i64,
    completed_count: i64,
    current_source_index: Option<i64>,
    result_json: String,
    error_code: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetImportProgressEvent {
    job_id: String,
    state: String,
    bytes_copied: i64,
    total_bytes: Option<i64>,
    source_count: i64,
    completed_count: i64,
    current_source_index: Option<i64>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetListQuery {
    kind: Option<String>,
    search: Option<String>,
    library_state: Option<String>,
    created_month: Option<String>,
    origin_kind: Option<String>,
    source_module: Option<String>,
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetMutationResult {
    updated_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetCacheClearResult {
    removed_variant_count: usize,
    reclaimed_bytes: i64,
    cleaned_file_count: usize,
    pending_cleanup_count: i64,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AssetMonthFacet {
    month: String,
    asset_count: i64,
    size_bytes: i64,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AssetSourceFacet {
    origin_kind: String,
    source_module: String,
    asset_count: i64,
    size_bytes: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetLibraryFacets {
    by_month: Vec<AssetMonthFacet>,
    by_source: Vec<AssetSourceFacet>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetDeleteAnalysis {
    items: Vec<AssetDeleteAnalysisItem>,
    can_delete_all: bool,
    requires_advisory_confirmation: bool,
    total_size_bytes: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetDeleteAnalysisItem {
    asset_id: String,
    display_name: String,
    availability: String,
    retention_policy: String,
    size_bytes: i64,
    blocking_usage_count: i64,
    advisory_usage_count: i64,
    can_delete: bool,
    requires_advisory_confirmation: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    blocked_reason: Option<String>,
}

#[derive(Debug, FromRow)]
struct AssetDeleteAnalysisRow {
    asset_id: String,
    display_name: String,
    availability: String,
    retention_policy: String,
    size_bytes: i64,
    blocking_usage_count: i64,
    advisory_usage_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetDeleteResult {
    deleted_count: usize,
    reclaimed_count: usize,
    cleaned_file_count: usize,
    pending_cleanup_count: i64,
}

#[derive(Debug, Serialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AssetKindStorageSummary {
    kind: String,
    asset_count: i64,
    size_bytes: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetStorageSummary {
    asset_count: i64,
    ready_count: i64,
    missing_count: i64,
    reclaimed_count: i64,
    original_bytes: i64,
    reclaimable_bytes: i64,
    cache_bytes: i64,
    temporary_bytes: i64,
    pending_cleanup_count: i64,
    by_kind: Vec<AssetKindStorageSummary>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetRepairReport {
    cleaned_pending_files: usize,
    cleaned_temporary_files: usize,
    cleaned_orphan_files: usize,
    marked_missing_assets: usize,
    pending_cleanup_count: i64,
}

#[derive(Debug, FromRow)]
struct PendingFileDeletion {
    id: i64,
    storage_root: String,
    relative_path: String,
}

#[derive(Debug, FromRow)]
struct RebuildableVariant {
    id: i64,
    relative_path: String,
    size_bytes: i64,
}

#[derive(Debug, Default)]
struct CleanupResult {
    cleaned_count: usize,
    pending_count: i64,
}

struct StagedObject {
    temp_path: PathBuf,
    content_hash: String,
    size_bytes: i64,
}

struct ImportJobExecution {
    app: AppHandle,
    state: AssetManagerState,
    pool: SqlitePool,
    paths: AssetPaths,
    job_id: String,
    sources: Vec<AssetImportSource>,
    cancellation: CancellationToken,
    on_event: Channel<AssetImportProgressEvent>,
}

struct ImportStageExecution {
    app: AppHandle,
    reference: String,
    temp_path: PathBuf,
    cancellation: CancellationToken,
    pool: SqlitePool,
    job_id: String,
    copied_before_source: i64,
    on_event: Channel<AssetImportProgressEvent>,
}

#[tauri::command]
pub async fn asset_import_sources(
    app: AppHandle,
    state: State<'_, AssetManagerState>,
    sources: Vec<AssetImportSource>,
) -> Result<Vec<AssetImportResult>, String> {
    validate_import_batch(&sources)?;
    let pool = state.pool(&app).await?.clone();
    let paths = AssetPaths::from_app(&app)?;
    let _guard = state.mutation_lock.lock().await;
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
pub async fn asset_start_import_job(
    app: AppHandle,
    state: State<'_, AssetManagerState>,
    sources: Vec<AssetImportSource>,
    on_event: Channel<AssetImportProgressEvent>,
) -> Result<AssetImportJob, String> {
    validate_import_batch(&sources)?;
    let pool = state.pool(&app).await?.clone();
    let paths = AssetPaths::from_app(&app)?;
    let job_id = Uuid::new_v4().to_string();
    let source_kind = import_job_source_kind(&sources);
    create_import_job(&pool, &job_id, &source_kind, sources.len()).await?;

    let cancellation = CancellationToken::new();
    state
        .active_imports
        .lock()
        .map_err(|_| "ASSET_IMPORT_STATE_UNAVAILABLE".to_string())?
        .insert(job_id.clone(), cancellation.clone());

    let worker_state = state.inner().clone();
    let worker_pool = pool.clone();
    let worker_job_id = job_id.clone();
    tauri::async_runtime::spawn(async move {
        let result = run_import_job(ImportJobExecution {
            app,
            state: worker_state.clone(),
            pool: worker_pool.clone(),
            paths,
            job_id: worker_job_id.clone(),
            sources,
            cancellation,
            on_event: on_event.clone(),
        })
        .await;
        if let Err(error) = result {
            let _ = fail_import_job(&worker_pool, &worker_job_id, error_code(&error)).await;
            if let Ok(job) = find_import_job(&worker_pool, &worker_job_id).await {
                let _ = on_event.send(import_progress_event(&job));
            }
        }
        if let Ok(mut active_imports) = worker_state.active_imports.lock() {
            active_imports.remove(&worker_job_id);
        }
    });

    find_import_job(&pool, &job_id).await
}

#[tauri::command]
pub async fn asset_get_import_job(
    app: AppHandle,
    state: State<'_, AssetManagerState>,
    job_id: String,
) -> Result<AssetImportJob, String> {
    validate_identifier("jobId", &job_id)?;
    find_import_job(state.pool(&app).await?, &job_id).await
}

#[tauri::command]
pub async fn asset_list_import_jobs(
    app: AppHandle,
    state: State<'_, AssetManagerState>,
    limit: Option<u32>,
) -> Result<Vec<AssetImportJob>, String> {
    list_import_jobs(
        state.pool(&app).await?,
        limit.unwrap_or(20).clamp(1, MAX_IMPORT_JOB_LIST),
    )
    .await
}

#[tauri::command]
pub async fn asset_cancel_import_job(
    app: AppHandle,
    state: State<'_, AssetManagerState>,
    job_id: String,
) -> Result<bool, String> {
    validate_identifier("jobId", &job_id)?;
    let job = find_import_job(state.pool(&app).await?, &job_id).await?;
    if !matches!(job.state.as_str(), "pending" | "running") {
        return Ok(false);
    }
    let active_imports = state
        .active_imports
        .lock()
        .map_err(|_| "ASSET_IMPORT_STATE_UNAVAILABLE".to_string())?;
    if let Some(cancellation) = active_imports.get(&job_id) {
        cancellation.cancel();
        return Ok(true);
    }
    Ok(false)
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
    if let Some(library_state) = query.library_state.as_deref() {
        if !matches!(library_state, "visible" | "hidden" | "all") {
            return Err("ASSET_INVALID_LIBRARY_STATE".into());
        }
    }
    if let Some(month) = query.created_month.as_deref() {
        validate_created_month(month)?;
    }
    if let Some(origin_kind) = query.origin_kind.as_deref() {
        validate_origin_kind(origin_kind)?;
    }
    if let Some(source_module) = query.source_module.as_deref() {
        validate_identifier("sourceModule", source_module)?;
    }
    let search = query
        .search
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if search.is_some_and(|value| value.len() > 200) {
        return Err("ASSET_INVALID_SEARCH".into());
    }
    list_assets(state.pool(&app).await?, query).await
}

async fn list_assets(pool: &SqlitePool, query: AssetListQuery) -> Result<Vec<AssetRecord>, String> {
    let search = query
        .search
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let mut builder: QueryBuilder<'_, Sqlite> = QueryBuilder::new(
        "SELECT id, content_hash, kind, mime_type, display_name, size_bytes, storage_mode, \
         relative_path, availability, library_state, retention_policy, created_at, updated_at \
         FROM assets WHERE 1 = 1",
    );
    match query.library_state.as_deref() {
        Some(library_state @ ("visible" | "hidden")) => {
            builder
                .push(" AND library_state = ")
                .push_bind(library_state);
        }
        Some("all") => {}
        _ if query.include_hidden.unwrap_or(false) => {}
        _ => {
            builder.push(" AND library_state = 'visible'");
        }
    }
    if !query.include_unavailable.unwrap_or(false) {
        builder.push(" AND availability = 'ready'");
    }
    if let Some(kind) = query.kind {
        builder.push(" AND kind = ").push_bind(kind);
    }
    if let Some(month) = query.created_month {
        builder
            .push(" AND substr(created_at, 1, 7) = ")
            .push_bind(month);
    }
    if query.origin_kind.is_some() || query.source_module.is_some() {
        builder.push(" AND EXISTS (SELECT 1 FROM asset_origins o WHERE o.asset_id = assets.id");
        if let Some(origin_kind) = query.origin_kind {
            builder.push(" AND o.origin_kind = ").push_bind(origin_kind);
        }
        if let Some(source_module) = query.source_module {
            builder
                .push(" AND o.source_module = ")
                .push_bind(source_module);
        }
        builder.push(")");
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
    let _guard = state.mutation_lock.lock().await;
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

#[tauri::command]
pub async fn asset_analyze_delete(
    app: AppHandle,
    state: State<'_, AssetManagerState>,
    asset_ids: Vec<String>,
) -> Result<AssetDeleteAnalysis, String> {
    validate_asset_ids(&asset_ids)?;
    let pool = state.pool(&app).await?;
    analyze_delete(pool, &asset_ids).await
}

#[tauri::command]
pub async fn asset_set_retention_policy(
    app: AppHandle,
    state: State<'_, AssetManagerState>,
    asset_ids: Vec<String>,
    retention_policy: String,
) -> Result<AssetMutationResult, String> {
    validate_asset_ids(&asset_ids)?;
    if !matches!(retention_policy.as_str(), "reclaimable" | "pinned") {
        return Err("ASSET_INVALID_RETENTION_POLICY".into());
    }
    let pool = state.pool(&app).await?;
    let _guard = state.mutation_lock.lock().await;
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("ASSET_RETENTION_TRANSACTION: {error}"))?;
    let mut updated_count = 0_usize;
    for asset_id in &asset_ids {
        let result = sqlx::query(
            "UPDATE assets SET retention_policy = ?, \
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
        )
        .bind(&retention_policy)
        .bind(asset_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("ASSET_RETENTION_UPDATE: {error}"))?;
        if result.rows_affected() != 1 {
            return Err("ASSET_NOT_FOUND".into());
        }
        updated_count += 1;
    }
    transaction
        .commit()
        .await
        .map_err(|error| format!("ASSET_RETENTION_COMMIT: {error}"))?;
    Ok(AssetMutationResult { updated_count })
}

#[tauri::command]
pub async fn asset_set_library_state(
    app: AppHandle,
    state: State<'_, AssetManagerState>,
    asset_ids: Vec<String>,
    library_state: String,
) -> Result<AssetMutationResult, String> {
    validate_asset_ids(&asset_ids)?;
    if !matches!(library_state.as_str(), "visible" | "hidden") {
        return Err("ASSET_INVALID_LIBRARY_STATE".into());
    }
    let pool = state.pool(&app).await?;
    let _guard = state.mutation_lock.lock().await;
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("ASSET_LIBRARY_STATE_TRANSACTION: {error}"))?;
    let mut updated_count = 0_usize;
    for asset_id in &asset_ids {
        let result = sqlx::query(
            "UPDATE assets SET library_state = ?, \
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
        )
        .bind(&library_state)
        .bind(asset_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| format!("ASSET_LIBRARY_STATE_UPDATE: {error}"))?;
        if result.rows_affected() != 1 {
            return Err("ASSET_NOT_FOUND".into());
        }
        updated_count += 1;
    }
    transaction
        .commit()
        .await
        .map_err(|error| format!("ASSET_LIBRARY_STATE_COMMIT: {error}"))?;
    Ok(AssetMutationResult { updated_count })
}

#[tauri::command]
pub async fn asset_get_library_facets(
    app: AppHandle,
    state: State<'_, AssetManagerState>,
    include_hidden: Option<bool>,
) -> Result<AssetLibraryFacets, String> {
    library_facets(state.pool(&app).await?, include_hidden.unwrap_or(false)).await
}

#[tauri::command]
pub async fn asset_clear_rebuildable_cache(
    app: AppHandle,
    state: State<'_, AssetManagerState>,
    asset_ids: Option<Vec<String>>,
) -> Result<AssetCacheClearResult, String> {
    if let Some(asset_ids) = asset_ids.as_deref() {
        validate_asset_ids(asset_ids)?;
    }
    let pool = state.pool(&app).await?;
    let paths = AssetPaths::from_app(&app)?;
    let _guard = state.mutation_lock.lock().await;
    clear_rebuildable_cache(pool, &paths, asset_ids.as_deref()).await
}

#[tauri::command]
pub async fn asset_delete(
    app: AppHandle,
    state: State<'_, AssetManagerState>,
    asset_ids: Vec<String>,
    confirm_advisory: bool,
) -> Result<AssetDeleteResult, String> {
    validate_asset_ids(&asset_ids)?;
    let pool = state.pool(&app).await?;
    let paths = AssetPaths::from_app(&app)?;
    let _guard = state.mutation_lock.lock().await;
    delete_assets(pool, &paths, &asset_ids, confirm_advisory).await
}

#[tauri::command]
pub async fn asset_get_storage_summary(
    app: AppHandle,
    state: State<'_, AssetManagerState>,
) -> Result<AssetStorageSummary, String> {
    let pool = state.pool(&app).await?;
    let paths = AssetPaths::from_app(&app)?;
    storage_summary(pool, &paths).await
}

#[tauri::command]
pub async fn asset_repair_library(
    app: AppHandle,
    state: State<'_, AssetManagerState>,
) -> Result<AssetRepairReport, String> {
    let pool = state.pool(&app).await?;
    let paths = AssetPaths::from_app(&app)?;
    let _guard = state.mutation_lock.lock().await;
    repair_library(pool, &paths).await
}

async fn analyze_delete(
    pool: &SqlitePool,
    asset_ids: &[String],
) -> Result<AssetDeleteAnalysis, String> {
    let mut builder: QueryBuilder<'_, Sqlite> = QueryBuilder::new(
        "SELECT a.id AS asset_id, a.display_name, a.availability, a.retention_policy, \
         a.size_bytes, \
         COALESCE(SUM(CASE WHEN u.usage_policy = 'blocking' THEN 1 ELSE 0 END), 0) \
           AS blocking_usage_count, \
         COALESCE(SUM(CASE WHEN u.usage_policy = 'advisory' THEN 1 ELSE 0 END), 0) \
           AS advisory_usage_count \
         FROM assets a LEFT JOIN asset_usages u ON u.asset_id = a.id WHERE a.id IN (",
    );
    {
        let mut separated = builder.separated(", ");
        for asset_id in asset_ids {
            separated.push_bind(asset_id);
        }
    }
    builder.push(" ) GROUP BY a.id");
    let rows = builder
        .build_query_as::<AssetDeleteAnalysisRow>()
        .fetch_all(pool)
        .await
        .map_err(|error| format!("ASSET_DELETE_ANALYSIS: {error}"))?;
    let mut by_id: HashMap<String, AssetDeleteAnalysisRow> = rows
        .into_iter()
        .map(|row| (row.asset_id.clone(), row))
        .collect();
    let mut items = Vec::with_capacity(asset_ids.len());
    for asset_id in asset_ids {
        let Some(row) = by_id.remove(asset_id) else {
            items.push(AssetDeleteAnalysisItem {
                asset_id: asset_id.clone(),
                display_name: String::new(),
                availability: "missing_record".into(),
                retention_policy: "reclaimable".into(),
                size_bytes: 0,
                blocking_usage_count: 0,
                advisory_usage_count: 0,
                can_delete: false,
                requires_advisory_confirmation: false,
                blocked_reason: Some("not_found".into()),
            });
            continue;
        };
        let blocked_reason = if row.retention_policy == "pinned" {
            Some("pinned".into())
        } else if row.blocking_usage_count > 0 {
            Some("blocking_usage".into())
        } else if row.availability == "importing" {
            Some("busy".into())
        } else {
            None
        };
        items.push(AssetDeleteAnalysisItem {
            asset_id: row.asset_id,
            display_name: row.display_name,
            availability: row.availability,
            retention_policy: row.retention_policy,
            size_bytes: row.size_bytes,
            blocking_usage_count: row.blocking_usage_count,
            advisory_usage_count: row.advisory_usage_count,
            can_delete: blocked_reason.is_none(),
            requires_advisory_confirmation: blocked_reason.is_none()
                && row.advisory_usage_count > 0,
            blocked_reason,
        });
    }
    Ok(AssetDeleteAnalysis {
        can_delete_all: items.iter().all(|item| item.can_delete),
        requires_advisory_confirmation: items
            .iter()
            .any(|item| item.requires_advisory_confirmation),
        total_size_bytes: items.iter().map(|item| item.size_bytes).sum(),
        items,
    })
}

async fn delete_assets(
    pool: &SqlitePool,
    paths: &AssetPaths,
    asset_ids: &[String],
    confirm_advisory: bool,
) -> Result<AssetDeleteResult, String> {
    let analysis = analyze_delete(pool, asset_ids).await?;
    if !analysis.can_delete_all {
        return Err("ASSET_DELETE_BLOCKED".into());
    }
    if analysis.requires_advisory_confirmation && !confirm_advisory {
        return Err("ASSET_ADVISORY_CONFIRMATION_REQUIRED".into());
    }

    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("ASSET_DELETE_TRANSACTION: {error}"))?;
    let mut deleted_count = 0_usize;
    let mut reclaimed_count = 0_usize;
    for item in &analysis.items {
        let asset = sqlx::query_as::<_, AssetRecord>(
            "SELECT id, content_hash, kind, mime_type, display_name, size_bytes, storage_mode, \
             relative_path, availability, library_state, retention_policy, created_at, updated_at \
             FROM assets WHERE id = ?",
        )
        .bind(&item.asset_id)
        .fetch_one(&mut *transaction)
        .await
        .map_err(|error| format!("ASSET_DELETE_LOOKUP: {error}"))?;
        if let Some(relative_path) = asset.relative_path.as_deref() {
            queue_file_deletion(&mut transaction, "app_data", relative_path).await?;
        }
        let variants: Vec<String> =
            sqlx::query_scalar("SELECT relative_path FROM asset_variants WHERE asset_id = ?")
                .bind(&item.asset_id)
                .fetch_all(&mut *transaction)
                .await
                .map_err(|error| format!("ASSET_DELETE_VARIANTS: {error}"))?;
        for relative_path in variants {
            queue_file_deletion(&mut transaction, "cache", &relative_path).await?;
        }
        sqlx::query("DELETE FROM asset_variants WHERE asset_id = ?")
            .bind(&item.asset_id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| format!("ASSET_DELETE_VARIANT_ROWS: {error}"))?;

        if item.advisory_usage_count > 0 {
            sqlx::query(
                "UPDATE assets SET relative_path = NULL, availability = 'reclaimed', \
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
            )
            .bind(&item.asset_id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| format!("ASSET_RECLAIM_UPDATE: {error}"))?;
            reclaimed_count += 1;
        } else {
            sqlx::query("DELETE FROM assets WHERE id = ?")
                .bind(&item.asset_id)
                .execute(&mut *transaction)
                .await
                .map_err(|error| format!("ASSET_DELETE_ROW: {error}"))?;
            deleted_count += 1;
        }
    }
    transaction
        .commit()
        .await
        .map_err(|error| format!("ASSET_DELETE_COMMIT: {error}"))?;
    let cleanup = drain_pending_file_deletions(pool, paths).await?;
    Ok(AssetDeleteResult {
        deleted_count,
        reclaimed_count,
        cleaned_file_count: cleanup.cleaned_count,
        pending_cleanup_count: cleanup.pending_count,
    })
}

async fn queue_file_deletion(
    transaction: &mut sqlx::Transaction<'_, Sqlite>,
    storage_root: &str,
    relative_path: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT OR IGNORE INTO pending_file_deletions( \
           storage_root, relative_path, created_at, updated_at \
         ) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), \
           strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
    )
    .bind(storage_root)
    .bind(relative_path)
    .execute(&mut **transaction)
    .await
    .map_err(|error| format!("ASSET_DELETE_QUEUE: {error}"))?;
    Ok(())
}

async fn run_startup_recovery(pool: &SqlitePool, paths: &AssetPaths) -> Result<(), String> {
    recover_interrupted_import_jobs(pool).await?;
    drain_pending_file_deletions(pool, paths).await?;
    cleanup_temporary_imports(paths)?;
    mark_missing_assets(pool, paths).await?;
    cleanup_orphan_objects(pool, paths).await?;
    Ok(())
}

async fn recover_interrupted_import_jobs(pool: &SqlitePool) -> Result<usize, String> {
    let result = sqlx::query(
        "UPDATE import_jobs SET state = 'failed', current_source_index = NULL, temp_path = NULL, \
         error_code = 'ASSET_IMPORT_INTERRUPTED', \
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE state IN ('pending', 'running')",
    )
    .execute(pool)
    .await
    .map_err(|error| format!("ASSET_IMPORT_JOB_RECOVERY: {error}"))?;
    Ok(result.rows_affected() as usize)
}

async fn repair_library(
    pool: &SqlitePool,
    paths: &AssetPaths,
) -> Result<AssetRepairReport, String> {
    let first_cleanup = drain_pending_file_deletions(pool, paths).await?;
    let cleaned_temporary_files = cleanup_temporary_imports(paths)?;
    let marked_missing_assets = mark_missing_assets(pool, paths).await?;
    let cleaned_orphan_files = cleanup_orphan_objects(pool, paths).await?;
    let final_cleanup = drain_pending_file_deletions(pool, paths).await?;
    Ok(AssetRepairReport {
        cleaned_pending_files: first_cleanup.cleaned_count + final_cleanup.cleaned_count,
        cleaned_temporary_files,
        cleaned_orphan_files,
        marked_missing_assets,
        pending_cleanup_count: final_cleanup.pending_count,
    })
}

async fn drain_pending_file_deletions(
    pool: &SqlitePool,
    paths: &AssetPaths,
) -> Result<CleanupResult, String> {
    let pending = sqlx::query_as::<_, PendingFileDeletion>(
        "SELECT id, storage_root, relative_path FROM pending_file_deletions \
         ORDER BY created_at, id LIMIT 1000",
    )
    .fetch_all(pool)
    .await
    .map_err(|error| format!("ASSET_CLEANUP_LIST: {error}"))?;
    let mut cleaned_count = 0_usize;
    for item in pending {
        let deletion = paths
            .resolve_storage(&item.storage_root, &item.relative_path)
            .and_then(|path| match fs::remove_file(path) {
                Ok(()) => Ok(()),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(error) => Err(format!("ASSET_FILE_DELETE: {error}")),
            });
        match deletion {
            Ok(()) => {
                sqlx::query("DELETE FROM pending_file_deletions WHERE id = ?")
                    .bind(item.id)
                    .execute(pool)
                    .await
                    .map_err(|error| format!("ASSET_CLEANUP_ACK: {error}"))?;
                cleaned_count += 1;
            }
            Err(error) => {
                sqlx::query(
                    "UPDATE pending_file_deletions SET attempt_count = attempt_count + 1, \
                     last_error = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
                     WHERE id = ?",
                )
                .bind(error_code(&error))
                .bind(item.id)
                .execute(pool)
                .await
                .map_err(|update_error| format!("ASSET_CLEANUP_RETRY: {update_error}"))?;
            }
        }
    }
    let pending_count: i64 = sqlx::query_scalar("SELECT count(*) FROM pending_file_deletions")
        .fetch_one(pool)
        .await
        .map_err(|error| format!("ASSET_CLEANUP_COUNT: {error}"))?;
    Ok(CleanupResult {
        cleaned_count,
        pending_count,
    })
}

fn cleanup_temporary_imports(paths: &AssetPaths) -> Result<usize, String> {
    if !paths.imports.exists() {
        return Ok(0);
    }
    let mut cleaned = 0_usize;
    for entry in fs::read_dir(&paths.imports)
        .map_err(|error| format!("ASSET_TEMP_SCAN: {error}"))?
        .filter_map(Result::ok)
    {
        let path = entry.path();
        if path.extension().and_then(|extension| extension.to_str()) == Some("part") {
            match fs::remove_file(path) {
                Ok(()) => cleaned += 1,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(format!("ASSET_TEMP_CLEANUP: {error}")),
            }
        }
    }
    Ok(cleaned)
}

async fn mark_missing_assets(pool: &SqlitePool, paths: &AssetPaths) -> Result<usize, String> {
    let assets = sqlx::query_as::<_, AssetRecord>(
        "SELECT id, content_hash, kind, mime_type, display_name, size_bytes, storage_mode, \
         relative_path, availability, library_state, retention_policy, created_at, updated_at \
         FROM assets WHERE availability = 'ready' AND storage_mode = 'managed'",
    )
    .fetch_all(pool)
    .await
    .map_err(|error| format!("ASSET_REPAIR_LIST: {error}"))?;
    let mut marked = 0_usize;
    for asset in assets {
        let available = asset
            .relative_path
            .as_deref()
            .and_then(|relative_path| paths.resolve_relative(relative_path).ok())
            .is_some_and(|path| path.is_file());
        if !available {
            sqlx::query(
                "UPDATE assets SET availability = 'missing', \
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
            )
            .bind(&asset.id)
            .execute(pool)
            .await
            .map_err(|error| format!("ASSET_REPAIR_MARK_MISSING: {error}"))?;
            marked += 1;
        }
    }
    Ok(marked)
}

async fn cleanup_orphan_objects(pool: &SqlitePool, paths: &AssetPaths) -> Result<usize, String> {
    if !paths.objects.exists() {
        return Ok(0);
    }
    let referenced: HashSet<String> =
        sqlx::query_scalar("SELECT relative_path FROM assets WHERE relative_path IS NOT NULL")
            .fetch_all(pool)
            .await
            .map_err(|error| format!("ASSET_REPAIR_REFERENCES: {error}"))?
            .into_iter()
            .collect();
    let mut files = Vec::new();
    collect_files(&paths.objects, &mut files)?;
    let mut cleaned = 0_usize;
    for path in files {
        let relative_path = relative_path_string(&paths.root, &path)?;
        if !referenced.contains(&relative_path) {
            match fs::remove_file(path) {
                Ok(()) => cleaned += 1,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(format!("ASSET_ORPHAN_CLEANUP: {error}")),
            }
        }
    }
    Ok(cleaned)
}

fn collect_files(directory: &Path, output: &mut Vec<PathBuf>) -> Result<(), String> {
    for entry in fs::read_dir(directory).map_err(|error| format!("ASSET_OBJECT_SCAN: {error}"))? {
        let entry = entry.map_err(|error| format!("ASSET_OBJECT_SCAN: {error}"))?;
        let path = entry.path();
        if path.is_dir() {
            collect_files(&path, output)?;
        } else if path.is_file() {
            output.push(path);
        }
    }
    Ok(())
}

fn relative_path_string(root: &Path, path: &Path) -> Result<String, String> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| "ASSET_INVALID_RELATIVE_PATH".to_string())?;
    Ok(relative
        .components()
        .filter_map(|component| match component {
            Component::Normal(value) => Some(value.to_string_lossy()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/"))
}

async fn library_facets(
    pool: &SqlitePool,
    include_hidden: bool,
) -> Result<AssetLibraryFacets, String> {
    let mut month_builder: QueryBuilder<'_, Sqlite> = QueryBuilder::new(
        "SELECT substr(created_at, 1, 7) AS month, count(*) AS asset_count, \
         COALESCE(SUM(size_bytes), 0) AS size_bytes FROM assets \
         WHERE availability = 'ready'",
    );
    if !include_hidden {
        month_builder.push(" AND library_state = 'visible'");
    }
    month_builder.push(" GROUP BY month ORDER BY month DESC");
    let by_month = month_builder
        .build_query_as::<AssetMonthFacet>()
        .fetch_all(pool)
        .await
        .map_err(|error| format!("ASSET_LIBRARY_MONTH_FACETS: {error}"))?;

    let mut source_builder: QueryBuilder<'_, Sqlite> = QueryBuilder::new(
        "SELECT origin_kind, source_module, count(*) AS asset_count, \
         COALESCE(SUM(size_bytes), 0) AS size_bytes FROM ( \
           SELECT DISTINCT a.id, a.size_bytes, o.origin_kind, o.source_module \
           FROM assets a JOIN asset_origins o ON o.asset_id = a.id \
           WHERE a.availability = 'ready'",
    );
    if !include_hidden {
        source_builder.push(" AND a.library_state = 'visible'");
    }
    source_builder.push(
        " ) source_assets GROUP BY origin_kind, source_module \
         ORDER BY size_bytes DESC, origin_kind, source_module",
    );
    let by_source = source_builder
        .build_query_as::<AssetSourceFacet>()
        .fetch_all(pool)
        .await
        .map_err(|error| format!("ASSET_LIBRARY_SOURCE_FACETS: {error}"))?;

    Ok(AssetLibraryFacets {
        by_month,
        by_source,
    })
}

async fn ensure_assets_exist(
    transaction: &mut sqlx::Transaction<'_, Sqlite>,
    asset_ids: &[String],
) -> Result<(), String> {
    let mut builder: QueryBuilder<'_, Sqlite> =
        QueryBuilder::new("SELECT count(*) FROM assets WHERE id IN (");
    {
        let mut separated = builder.separated(", ");
        for asset_id in asset_ids {
            separated.push_bind(asset_id);
        }
    }
    builder.push(")");
    let count: i64 = builder
        .build_query_scalar()
        .fetch_one(&mut **transaction)
        .await
        .map_err(|error| format!("ASSET_CACHE_ASSET_LOOKUP: {error}"))?;
    if count != asset_ids.len() as i64 {
        return Err("ASSET_NOT_FOUND".into());
    }
    Ok(())
}

async fn clear_rebuildable_cache(
    pool: &SqlitePool,
    paths: &AssetPaths,
    asset_ids: Option<&[String]>,
) -> Result<AssetCacheClearResult, String> {
    let mut transaction = pool
        .begin()
        .await
        .map_err(|error| format!("ASSET_CACHE_CLEAR_TRANSACTION: {error}"))?;
    if let Some(asset_ids) = asset_ids {
        ensure_assets_exist(&mut transaction, asset_ids).await?;
    }

    let mut builder: QueryBuilder<'_, Sqlite> = QueryBuilder::new(
        "SELECT id, relative_path, size_bytes FROM asset_variants WHERE rebuildable = 1",
    );
    if let Some(asset_ids) = asset_ids {
        builder.push(" AND asset_id IN (");
        {
            let mut separated = builder.separated(", ");
            for asset_id in asset_ids {
                separated.push_bind(asset_id);
            }
        }
        builder.push(")");
    }
    let variants = builder
        .build_query_as::<RebuildableVariant>()
        .fetch_all(&mut *transaction)
        .await
        .map_err(|error| format!("ASSET_CACHE_VARIANT_LIST: {error}"))?;
    let mut reclaimed_bytes = 0_i64;
    for variant in &variants {
        paths.resolve_storage("cache", &variant.relative_path)?;
        reclaimed_bytes = reclaimed_bytes
            .checked_add(variant.size_bytes)
            .ok_or_else(|| "ASSET_SIZE_OVERFLOW".to_string())?;
        queue_file_deletion(&mut transaction, "cache", &variant.relative_path).await?;
        sqlx::query("DELETE FROM asset_variants WHERE id = ?")
            .bind(variant.id)
            .execute(&mut *transaction)
            .await
            .map_err(|error| format!("ASSET_CACHE_VARIANT_DELETE: {error}"))?;
    }
    transaction
        .commit()
        .await
        .map_err(|error| format!("ASSET_CACHE_CLEAR_COMMIT: {error}"))?;
    let cleanup = drain_pending_file_deletions(pool, paths).await?;
    Ok(AssetCacheClearResult {
        removed_variant_count: variants.len(),
        reclaimed_bytes,
        cleaned_file_count: cleanup.cleaned_count,
        pending_cleanup_count: cleanup.pending_count,
    })
}

async fn storage_summary(
    pool: &SqlitePool,
    paths: &AssetPaths,
) -> Result<AssetStorageSummary, String> {
    let counts: (i64, i64, i64, i64, i64, i64) = sqlx::query_as(
        "SELECT count(*), \
         COALESCE(SUM(CASE WHEN availability = 'ready' THEN 1 ELSE 0 END), 0), \
         COALESCE(SUM(CASE WHEN availability = 'missing' THEN 1 ELSE 0 END), 0), \
         COALESCE(SUM(CASE WHEN availability = 'reclaimed' THEN 1 ELSE 0 END), 0), \
         COALESCE(SUM(CASE WHEN availability = 'ready' THEN size_bytes ELSE 0 END), 0), \
         COALESCE(SUM(CASE WHEN availability = 'ready' AND retention_policy = 'reclaimable' \
           AND NOT EXISTS (SELECT 1 FROM asset_usages u WHERE u.asset_id = assets.id \
             AND u.usage_policy = 'blocking') THEN size_bytes ELSE 0 END), 0) \
         FROM assets",
    )
    .fetch_one(pool)
    .await
    .map_err(|error| format!("ASSET_STORAGE_COUNTS: {error}"))?;
    let cache_bytes: i64 =
        sqlx::query_scalar("SELECT COALESCE(SUM(size_bytes), 0) FROM asset_variants")
            .fetch_one(pool)
            .await
            .map_err(|error| format!("ASSET_STORAGE_CACHE: {error}"))?;
    let pending_cleanup_count: i64 =
        sqlx::query_scalar("SELECT count(*) FROM pending_file_deletions")
            .fetch_one(pool)
            .await
            .map_err(|error| format!("ASSET_STORAGE_PENDING: {error}"))?;
    let by_kind = sqlx::query_as::<_, AssetKindStorageSummary>(
        "SELECT kind, count(*) AS asset_count, COALESCE(SUM(size_bytes), 0) AS size_bytes \
         FROM assets WHERE availability = 'ready' GROUP BY kind ORDER BY kind",
    )
    .fetch_all(pool)
    .await
    .map_err(|error| format!("ASSET_STORAGE_KINDS: {error}"))?;
    Ok(AssetStorageSummary {
        asset_count: counts.0,
        ready_count: counts.1,
        missing_count: counts.2,
        reclaimed_count: counts.3,
        original_bytes: counts.4,
        reclaimable_bytes: counts.5,
        cache_bytes,
        temporary_bytes: directory_size(&paths.imports)?,
        pending_cleanup_count,
        by_kind,
    })
}

fn directory_size(directory: &Path) -> Result<i64, String> {
    if !directory.exists() {
        return Ok(0);
    }
    let mut files = Vec::new();
    collect_files(directory, &mut files)?;
    files.into_iter().try_fold(0_i64, |total, path| {
        let size = fs::metadata(path)
            .map_err(|error| format!("ASSET_STORAGE_FILE: {error}"))?
            .len() as i64;
        total
            .checked_add(size)
            .ok_or_else(|| "ASSET_SIZE_OVERFLOW".to_string())
    })
}

fn validate_import_batch(sources: &[AssetImportSource]) -> Result<(), String> {
    if sources.is_empty() || sources.len() > MAX_IMPORT_BATCH {
        return Err("ASSET_INVALID_IMPORT_BATCH".into());
    }
    Ok(())
}

fn import_job_source_kind(sources: &[AssetImportSource]) -> String {
    if sources.iter().any(|source| {
        !matches!(
            source.origin_kind.as_str(),
            "file_picker" | "photo_picker" | "camera" | "share" | "network" | "generated" | "tool"
        )
    }) {
        return "unknown".into();
    }
    let first = sources
        .first()
        .map(|source| source.origin_kind.as_str())
        .unwrap_or("unknown");
    if sources
        .iter()
        .all(|source| source.origin_kind.as_str() == first)
    {
        first.to_string()
    } else {
        "mixed".into()
    }
}

async fn create_import_job(
    pool: &SqlitePool,
    job_id: &str,
    source_kind: &str,
    source_count: usize,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO import_jobs( \
           id, source_kind, state, bytes_copied, total_bytes, temp_path, error_code, \
           created_at, updated_at, source_count, completed_count, current_source_index, \
           result_json \
         ) VALUES (?, ?, 'pending', 0, NULL, NULL, NULL, \
           strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), \
           strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?, 0, NULL, '[]')",
    )
    .bind(job_id)
    .bind(source_kind)
    .bind(source_count as i64)
    .execute(pool)
    .await
    .map_err(|error| format!("ASSET_IMPORT_JOB_CREATE: {error}"))?;
    Ok(())
}

fn import_job_from_row(row: AssetImportJobRow) -> Result<AssetImportJob, String> {
    let results = serde_json::from_str(&row.result_json)
        .map_err(|error| format!("ASSET_IMPORT_JOB_RESULT: {error}"))?;
    Ok(AssetImportJob {
        id: row.id,
        source_kind: row.source_kind,
        state: row.state,
        bytes_copied: row.bytes_copied,
        total_bytes: row.total_bytes,
        source_count: row.source_count,
        completed_count: row.completed_count,
        current_source_index: row.current_source_index,
        results,
        error_code: row.error_code,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

async fn find_import_job(pool: &SqlitePool, job_id: &str) -> Result<AssetImportJob, String> {
    let row = sqlx::query_as::<_, AssetImportJobRow>(
        "SELECT id, source_kind, state, bytes_copied, total_bytes, source_count, \
         completed_count, current_source_index, result_json, error_code, created_at, updated_at \
         FROM import_jobs WHERE id = ?",
    )
    .bind(job_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| format!("ASSET_IMPORT_JOB_LOOKUP: {error}"))?
    .ok_or_else(|| "ASSET_IMPORT_JOB_NOT_FOUND".to_string())?;
    import_job_from_row(row)
}

async fn list_import_jobs(pool: &SqlitePool, limit: u32) -> Result<Vec<AssetImportJob>, String> {
    let rows = sqlx::query_as::<_, AssetImportJobRow>(
        "SELECT id, source_kind, state, bytes_copied, total_bytes, source_count, \
         completed_count, current_source_index, result_json, error_code, created_at, updated_at \
         FROM import_jobs ORDER BY created_at DESC, id DESC LIMIT ?",
    )
    .bind(i64::from(limit))
    .fetch_all(pool)
    .await
    .map_err(|error| format!("ASSET_IMPORT_JOB_LIST: {error}"))?;
    rows.into_iter().map(import_job_from_row).collect()
}

fn import_progress_event(job: &AssetImportJob) -> AssetImportProgressEvent {
    AssetImportProgressEvent {
        job_id: job.id.clone(),
        state: job.state.clone(),
        bytes_copied: job.bytes_copied,
        total_bytes: job.total_bytes,
        source_count: job.source_count,
        completed_count: job.completed_count,
        current_source_index: job.current_source_index,
    }
}

async fn publish_import_progress(
    pool: &SqlitePool,
    job_id: &str,
    on_event: &Channel<AssetImportProgressEvent>,
) -> Result<AssetImportJob, String> {
    let job = find_import_job(pool, job_id).await?;
    let _ = on_event.send(import_progress_event(&job));
    Ok(job)
}

async fn set_import_job_running(pool: &SqlitePool, job_id: &str) -> Result<(), String> {
    sqlx::query(
        "UPDATE import_jobs SET state = 'running', error_code = NULL, \
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
    .bind(job_id)
    .execute(pool)
    .await
    .map_err(|error| format!("ASSET_IMPORT_JOB_START: {error}"))?;
    Ok(())
}

async fn prepare_import_job_source(
    pool: &SqlitePool,
    job_id: &str,
    source_index: usize,
    temp_path: &str,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE import_jobs SET current_source_index = ?, temp_path = ?, \
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
    .bind(source_index as i64)
    .bind(temp_path)
    .bind(job_id)
    .execute(pool)
    .await
    .map_err(|error| format!("ASSET_IMPORT_JOB_SOURCE: {error}"))?;
    Ok(())
}

async fn update_import_job_bytes(
    pool: &SqlitePool,
    job_id: &str,
    bytes_copied: i64,
) -> Result<(), String> {
    sqlx::query(
        "UPDATE import_jobs SET bytes_copied = ?, \
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
    .bind(bytes_copied)
    .bind(job_id)
    .execute(pool)
    .await
    .map_err(|error| format!("ASSET_IMPORT_JOB_PROGRESS: {error}"))?;
    Ok(())
}

async fn record_import_job_result(
    pool: &SqlitePool,
    job_id: &str,
    completed_count: usize,
    bytes_copied: i64,
    results: &[AssetImportResult],
) -> Result<(), String> {
    let result_json = serde_json::to_string(results)
        .map_err(|error| format!("ASSET_IMPORT_JOB_SERIALIZE: {error}"))?;
    sqlx::query(
        "UPDATE import_jobs SET completed_count = ?, bytes_copied = ?, result_json = ?, \
         temp_path = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
    .bind(completed_count as i64)
    .bind(bytes_copied)
    .bind(result_json)
    .bind(job_id)
    .execute(pool)
    .await
    .map_err(|error| format!("ASSET_IMPORT_JOB_RESULT_UPDATE: {error}"))?;
    Ok(())
}

async fn finish_import_job(
    pool: &SqlitePool,
    job_id: &str,
    state: &str,
    completed_count: usize,
    results: &[AssetImportResult],
) -> Result<(), String> {
    let result_json = serde_json::to_string(results)
        .map_err(|error| format!("ASSET_IMPORT_JOB_SERIALIZE: {error}"))?;
    sqlx::query(
        "UPDATE import_jobs SET state = ?, completed_count = ?, current_source_index = NULL, \
         temp_path = NULL, result_json = ?, error_code = NULL, \
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
    .bind(state)
    .bind(completed_count as i64)
    .bind(result_json)
    .bind(job_id)
    .execute(pool)
    .await
    .map_err(|error| format!("ASSET_IMPORT_JOB_FINISH: {error}"))?;
    Ok(())
}

async fn fail_import_job(pool: &SqlitePool, job_id: &str, code: &str) -> Result<(), String> {
    sqlx::query(
        "UPDATE import_jobs SET state = 'failed', current_source_index = NULL, temp_path = NULL, \
         error_code = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? \
         AND state IN ('pending', 'running')",
    )
    .bind(code)
    .bind(job_id)
    .execute(pool)
    .await
    .map_err(|error| format!("ASSET_IMPORT_JOB_FAIL: {error}"))?;
    Ok(())
}

fn cancelled_import_results(start_index: usize, source_count: usize) -> Vec<AssetImportResult> {
    (start_index..source_count)
        .map(|source_index| AssetImportResult {
            source_index,
            status: "cancelled".into(),
            asset: None,
            error_code: Some("ASSET_IMPORT_CANCELLED".into()),
            message: Some("导入已取消。".into()),
        })
        .collect()
}

async fn run_import_job(execution: ImportJobExecution) -> Result<(), String> {
    let ImportJobExecution {
        app,
        state,
        pool,
        paths,
        job_id,
        sources,
        cancellation,
        on_event,
    } = execution;
    let _guard = state.mutation_lock.lock().await;
    let source_count = sources.len();
    let mut results = Vec::with_capacity(source_count);
    let mut copied_before_source = 0_i64;

    if cancellation.is_cancelled() {
        results.extend(cancelled_import_results(0, source_count));
        finish_import_job(&pool, &job_id, "cancelled", 0, &results).await?;
        publish_import_progress(&pool, &job_id, &on_event).await?;
        return Ok(());
    }

    set_import_job_running(&pool, &job_id).await?;
    publish_import_progress(&pool, &job_id, &on_event).await?;

    for (source_index, source) in sources.into_iter().enumerate() {
        if cancellation.is_cancelled() {
            results.extend(cancelled_import_results(source_index, source_count));
            finish_import_job(&pool, &job_id, "cancelled", source_index, &results).await?;
            publish_import_progress(&pool, &job_id, &on_event).await?;
            return Ok(());
        }

        let temp_path = paths.imports.join(format!("{job_id}-{source_index}.part"));
        let temp_relative_path = relative_path_string(&paths.root, &temp_path)?;
        prepare_import_job_source(&pool, &job_id, source_index, &temp_relative_path).await?;
        publish_import_progress(&pool, &job_id, &on_event).await?;

        let result = if let Err(error) = validate_import_source(&source) {
            Err(error)
        } else {
            let staged = stage_source_for_job(ImportStageExecution {
                app: app.clone(),
                reference: source.reference.clone(),
                temp_path,
                cancellation: cancellation.clone(),
                pool: pool.clone(),
                job_id: job_id.clone(),
                copied_before_source,
                on_event: on_event.clone(),
            })
            .await;
            match staged {
                Ok(staged) => {
                    copied_before_source = copied_before_source
                        .checked_add(staged.size_bytes)
                        .ok_or_else(|| "ASSET_SIZE_OVERFLOW".to_string())?;
                    let registered = register_staged_object(&pool, &paths, &source, &staged).await;
                    if registered.is_err() && staged.temp_path.exists() {
                        let _ = fs::remove_file(&staged.temp_path);
                    }
                    registered
                }
                Err(error) => {
                    copied_before_source = find_import_job(&pool, &job_id).await?.bytes_copied;
                    Err(error)
                }
            }
        };

        if matches!(&result, Err(error) if error_code(error) == "ASSET_IMPORT_CANCELLED") {
            results.extend(cancelled_import_results(source_index, source_count));
            finish_import_job(&pool, &job_id, "cancelled", source_index, &results).await?;
            publish_import_progress(&pool, &job_id, &on_event).await?;
            return Ok(());
        }

        results.push(match result {
            Ok((status, asset)) => AssetImportResult {
                source_index,
                status,
                asset: Some(asset),
                error_code: None,
                message: None,
            },
            Err(error) => AssetImportResult {
                source_index,
                status: "failed".into(),
                asset: None,
                error_code: Some(error_code(&error).into()),
                message: Some("无法导入所选文件，原件未加入资产库。".into()),
            },
        });
        record_import_job_result(
            &pool,
            &job_id,
            source_index + 1,
            copied_before_source,
            &results,
        )
        .await?;
        publish_import_progress(&pool, &job_id, &on_event).await?;
    }

    finish_import_job(&pool, &job_id, "completed", source_count, &results).await?;
    publish_import_progress(&pool, &job_id, &on_event).await?;
    Ok(())
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

async fn stage_source_for_job(execution: ImportStageExecution) -> Result<StagedObject, String> {
    let ImportStageExecution {
        app,
        reference,
        temp_path,
        cancellation,
        pool,
        job_id,
        copied_before_source,
        on_event,
    } = execution;
    let (progress_tx, mut progress_rx) = tokio::sync::mpsc::unbounded_channel::<i64>();
    let copied_from_source = Arc::new(AtomicI64::new(0));
    let copied_for_worker = copied_from_source.clone();
    let worker_cancellation = cancellation.clone();
    let worker_temp_path = temp_path.clone();
    let task = tauri::async_runtime::spawn_blocking(move || {
        let file_path = FilePath::from_str(&reference)
            .map_err(|_| "ASSET_INVALID_SOURCE_REFERENCE".to_string())?;
        let result = (|| {
            let input = app
                .fs()
                .open(file_path.clone(), Default::default())
                .map_err(|error| format!("ASSET_SOURCE_OPEN: {error}"))?;
            copy_and_hash_controlled(
                input,
                &worker_temp_path,
                &worker_cancellation,
                |bytes_copied| {
                    copied_for_worker.store(bytes_copied, Ordering::Relaxed);
                    let _ = progress_tx.send(bytes_copied);
                },
            )
        })();
        #[cfg(target_os = "ios")]
        {
            let _ = app.fs().stop_accessing_security_scoped_resource(file_path);
        }
        if result.is_err() && worker_temp_path.exists() {
            let _ = fs::remove_file(&worker_temp_path);
        }
        result.map(|(content_hash, size_bytes)| StagedObject {
            temp_path: worker_temp_path,
            content_hash,
            size_bytes,
        })
    });
    tokio::pin!(task);

    loop {
        tokio::select! {
            result = &mut task => {
                let final_bytes = copied_from_source.load(Ordering::Relaxed);
                let total_bytes = copied_before_source
                    .checked_add(final_bytes)
                    .ok_or_else(|| "ASSET_SIZE_OVERFLOW".to_string())?;
                update_import_job_bytes(&pool, &job_id, total_bytes).await?;
                publish_import_progress(&pool, &job_id, &on_event).await?;
                return result.map_err(|error| format!("ASSET_IMPORT_TASK: {error}"))?;
            }
            Some(source_bytes) = progress_rx.recv() => {
                let total_bytes = copied_before_source
                    .checked_add(source_bytes)
                    .ok_or_else(|| "ASSET_SIZE_OVERFLOW".to_string())?;
                update_import_job_bytes(&pool, &job_id, total_bytes).await?;
                publish_import_progress(&pool, &job_id, &on_event).await?;
            }
        }
    }
}

fn copy_and_hash(mut input: impl Read, temp_path: &Path) -> Result<(String, i64), String> {
    copy_and_hash_controlled(&mut input, temp_path, &CancellationToken::new(), |_| {})
}

fn copy_and_hash_controlled(
    mut input: impl Read,
    temp_path: &Path,
    cancellation: &CancellationToken,
    mut on_progress: impl FnMut(i64),
) -> Result<(String, i64), String> {
    let mut output = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(temp_path)
        .map_err(|error| format!("ASSET_TEMP_CREATE: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 1024 * 1024];
    let mut size_bytes = 0_i64;
    let mut next_progress = IMPORT_PROGRESS_STEP_BYTES;
    loop {
        if cancellation.is_cancelled() {
            return Err("ASSET_IMPORT_CANCELLED".into());
        }
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
        if size_bytes >= next_progress {
            on_progress(size_bytes);
            next_progress = size_bytes.saturating_add(IMPORT_PROGRESS_STEP_BYTES);
        }
    }
    if cancellation.is_cancelled() {
        return Err("ASSET_IMPORT_CANCELLED".into());
    }
    output
        .sync_all()
        .map_err(|error| format!("ASSET_TEMP_SYNC: {error}"))?;
    on_progress(size_bytes);
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
    validate_origin_kind(&source.origin_kind)?;
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

fn validate_origin_kind(origin_kind: &str) -> Result<(), String> {
    if matches!(
        origin_kind,
        "file_picker" | "photo_picker" | "camera" | "share" | "network" | "generated" | "tool"
    ) {
        Ok(())
    } else {
        Err("ASSET_INVALID_ORIGIN_KIND".into())
    }
}

fn validate_created_month(month: &str) -> Result<(), String> {
    let bytes = month.as_bytes();
    let valid_shape = bytes.len() == 7
        && bytes[4] == b'-'
        && bytes[..4].iter().all(u8::is_ascii_digit)
        && bytes[5..].iter().all(u8::is_ascii_digit);
    if !valid_shape {
        return Err("ASSET_INVALID_CREATED_MONTH".into());
    }
    let year = month[..4]
        .parse::<u16>()
        .map_err(|_| "ASSET_INVALID_CREATED_MONTH")?;
    let month_number = month[5..]
        .parse::<u8>()
        .map_err(|_| "ASSET_INVALID_CREATED_MONTH")?;
    if year == 0 || !(1..=12).contains(&month_number) {
        return Err("ASSET_INVALID_CREATED_MONTH".into());
    }
    Ok(())
}

fn validate_asset_ids(asset_ids: &[String]) -> Result<(), String> {
    if asset_ids.is_empty() || asset_ids.len() > MAX_MUTATION_BATCH {
        return Err("ASSET_INVALID_MUTATION_BATCH".into());
    }
    let mut unique = HashSet::with_capacity(asset_ids.len());
    for asset_id in asset_ids {
        validate_identifier("assetId", asset_id)?;
        if !unique.insert(asset_id) {
            return Err("ASSET_DUPLICATE_ID".into());
        }
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

    struct CancellingReader {
        cancellation: CancellationToken,
        emitted: bool,
    }

    impl Read for CancellingReader {
        fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
            if self.emitted {
                return Ok(0);
            }
            let content = b"partial-import";
            buffer[..content.len()].copy_from_slice(content);
            self.emitted = true;
            self.cancellation.cancel();
            Ok(content.len())
        }
    }

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
            cache_root: PathBuf::from("cache-root"),
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
            "pending_file_deletions",
        ] {
            assert!(tables.iter().any(|table| table == expected));
        }
        let import_job_columns: Vec<String> =
            sqlx::query_scalar("SELECT name FROM pragma_table_info('import_jobs') ORDER BY cid")
                .fetch_all(&pool)
                .await
                .unwrap();
        for expected in [
            "source_count",
            "completed_count",
            "current_source_index",
            "result_json",
        ] {
            assert!(import_job_columns.iter().any(|column| column == expected));
        }
    }

    #[test]
    fn controlled_copy_stops_at_a_cancellation_boundary() {
        let root = std::env::temp_dir().join(format!("aio-asset-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let temporary = root.join("cancelled.part");
        let cancellation = CancellationToken::new();
        let reader = CancellingReader {
            cancellation: cancellation.clone(),
            emitted: false,
        };

        let error = copy_and_hash_controlled(reader, &temporary, &cancellation, |_| {})
            .expect_err("copy should observe cancellation before the next read");
        assert_eq!(error, "ASSET_IMPORT_CANCELLED");
        assert_eq!(fs::read(&temporary).unwrap(), b"partial-import");
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn startup_recovery_marks_only_unfinished_import_jobs_as_interrupted() {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        ASSET_MIGRATOR.run(&pool).await.unwrap();
        create_import_job(&pool, "pending-job", "file_picker", 2)
            .await
            .unwrap();
        create_import_job(&pool, "running-job", "file_picker", 1)
            .await
            .unwrap();
        set_import_job_running(&pool, "running-job").await.unwrap();
        create_import_job(&pool, "completed-job", "file_picker", 1)
            .await
            .unwrap();
        finish_import_job(&pool, "completed-job", "completed", 1, &[])
            .await
            .unwrap();

        assert_eq!(recover_interrupted_import_jobs(&pool).await.unwrap(), 2);
        let pending = find_import_job(&pool, "pending-job").await.unwrap();
        let running = find_import_job(&pool, "running-job").await.unwrap();
        let completed = find_import_job(&pool, "completed-job").await.unwrap();
        assert_eq!(pending.state, "failed");
        assert_eq!(
            pending.error_code.as_deref(),
            Some("ASSET_IMPORT_INTERRUPTED")
        );
        assert_eq!(running.state, "failed");
        assert_eq!(completed.state, "completed");
        assert!(completed.error_code.is_none());
    }

    #[tokio::test]
    async fn library_filters_facets_and_rebuildable_cache_cleanup_share_consistent_scope() {
        let root = std::env::temp_dir().join(format!("aio-asset-test-{}", Uuid::new_v4()));
        let paths = AssetPaths {
            database: root.join(ASSET_DB),
            objects: root.join("objects"),
            imports: root.join("tmp").join("imports"),
            cache_root: root.join("cache"),
            root: root.clone(),
        };
        fs::create_dir_all(&paths.cache_root).unwrap();
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        ASSET_MIGRATOR.run(&pool).await.unwrap();

        for (id, hash, library_state, created_at, size_bytes) in [
            (
                "visible-asset",
                "a".repeat(64),
                "visible",
                "2026-07-15T00:00:00.000Z",
                100_i64,
            ),
            (
                "hidden-asset",
                "b".repeat(64),
                "hidden",
                "2026-06-15T00:00:00.000Z",
                200_i64,
            ),
        ] {
            sqlx::query(
                "INSERT INTO assets( \
                   id, content_hash, kind, mime_type, display_name, size_bytes, storage_mode, \
                   relative_path, availability, library_state, retention_policy, created_at, updated_at \
                 ) VALUES (?, ?, 'image', 'image/png', ?, ?, 'managed', ?, 'ready', ?, \
                   'reclaimable', ?, ?)",
            )
            .bind(id)
            .bind(hash)
            .bind(format!("{id}.png"))
            .bind(size_bytes)
            .bind(format!("objects/{id}.png"))
            .bind(library_state)
            .bind(created_at)
            .bind(created_at)
            .execute(&pool)
            .await
            .unwrap();
        }
        for (asset_id, origin_kind, source_module) in [
            ("visible-asset", "file_picker", "llm-chat"),
            ("visible-asset", "file_picker", "llm-chat"),
            ("hidden-asset", "tool", "media-generator"),
        ] {
            sqlx::query(
                "INSERT INTO asset_origins( \
                   asset_id, origin_kind, source_module, original_name, locator, created_at \
                 ) VALUES (?, ?, ?, 'sample.png', NULL, '2026-07-20T00:00:00.000Z')",
            )
            .bind(asset_id)
            .bind(origin_kind)
            .bind(source_module)
            .execute(&pool)
            .await
            .unwrap();
        }

        let visible = list_assets(&pool, AssetListQuery::default()).await.unwrap();
        assert_eq!(visible.len(), 1);
        assert_eq!(visible[0].id, "visible-asset");
        let hidden = list_assets(
            &pool,
            AssetListQuery {
                library_state: Some("hidden".into()),
                created_month: Some("2026-06".into()),
                origin_kind: Some("tool".into()),
                source_module: Some("media-generator".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        assert_eq!(hidden.len(), 1);
        assert_eq!(hidden[0].id, "hidden-asset");

        let visible_facets = library_facets(&pool, false).await.unwrap();
        assert_eq!(visible_facets.by_month.len(), 1);
        assert_eq!(visible_facets.by_month[0].month, "2026-07");
        assert_eq!(visible_facets.by_source.len(), 1);
        assert_eq!(visible_facets.by_source[0].asset_count, 1);
        let all_facets = library_facets(&pool, true).await.unwrap();
        assert_eq!(all_facets.by_month.len(), 2);
        assert_eq!(all_facets.by_source.len(), 2);

        let rebuildable_path = "previews/visible/thumb.webp";
        let retained_path = "previews/visible/source.bin";
        let hidden_path = "previews/hidden/thumb.webp";
        for (path, content) in [
            (rebuildable_path, b"rebuildable".as_slice()),
            (retained_path, b"retained".as_slice()),
            (hidden_path, b"hidden-cache".as_slice()),
        ] {
            let full_path = paths.cache_root.join(path);
            fs::create_dir_all(full_path.parent().unwrap()).unwrap();
            fs::write(full_path, content).unwrap();
        }
        for (asset_id, kind, path, size_bytes, rebuildable) in [
            (
                "visible-asset",
                "thumbnail",
                rebuildable_path,
                11_i64,
                1_i64,
            ),
            ("visible-asset", "source-copy", retained_path, 8_i64, 0_i64),
            ("hidden-asset", "thumbnail", hidden_path, 12_i64, 1_i64),
        ] {
            sqlx::query(
                "INSERT INTO asset_variants( \
                   asset_id, variant_kind, relative_path, size_bytes, rebuildable, created_at \
                 ) VALUES (?, ?, ?, ?, ?, '2026-07-20T00:00:00.000Z')",
            )
            .bind(asset_id)
            .bind(kind)
            .bind(path)
            .bind(size_bytes)
            .bind(rebuildable)
            .execute(&pool)
            .await
            .unwrap();
        }

        let selected_ids = vec!["visible-asset".to_string()];
        let selected = clear_rebuildable_cache(&pool, &paths, Some(&selected_ids))
            .await
            .unwrap();
        assert_eq!(selected.removed_variant_count, 1);
        assert_eq!(selected.reclaimed_bytes, 11);
        assert_eq!(selected.cleaned_file_count, 1);
        assert!(!paths.cache_root.join(rebuildable_path).exists());
        assert!(paths.cache_root.join(retained_path).exists());
        assert!(paths.cache_root.join(hidden_path).exists());

        let all = clear_rebuildable_cache(&pool, &paths, None).await.unwrap();
        assert_eq!(all.removed_variant_count, 1);
        assert_eq!(all.reclaimed_bytes, 12);
        assert!(paths.cache_root.join(retained_path).exists());
        let remaining: i64 = sqlx::query_scalar("SELECT count(*) FROM asset_variants")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(remaining, 1);

        pool.close().await;
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn duplicate_and_reclaimed_imports_preserve_the_asset_identity() {
        let root = std::env::temp_dir().join(format!("aio-asset-test-{}", Uuid::new_v4()));
        let paths = AssetPaths {
            database: root.join(ASSET_DB),
            objects: root.join("objects"),
            imports: root.join("tmp").join("imports"),
            cache_root: root.join("cache"),
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

        sqlx::query("UPDATE assets SET retention_policy = 'pinned' WHERE id = ?")
            .bind(&third_asset.id)
            .execute(&pool)
            .await
            .unwrap();
        let pinned = analyze_delete(&pool, std::slice::from_ref(&third_asset.id))
            .await
            .unwrap();
        assert!(!pinned.can_delete_all);
        assert_eq!(pinned.items[0].blocked_reason.as_deref(), Some("pinned"));
        sqlx::query("UPDATE assets SET retention_policy = 'reclaimable' WHERE id = ?")
            .bind(&third_asset.id)
            .execute(&pool)
            .await
            .unwrap();

        sqlx::query(
            "INSERT INTO asset_usages( \
               asset_id, module_id, entity_type, entity_id, role, usage_policy, created_at \
             ) VALUES (?, 'llm-chat', 'message', 'message-1', 'attachment', 'blocking', \
               strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        )
        .bind(&third_asset.id)
        .execute(&pool)
        .await
        .unwrap();
        let blocked = analyze_delete(&pool, std::slice::from_ref(&third_asset.id))
            .await
            .unwrap();
        assert!(!blocked.can_delete_all);
        assert_eq!(
            blocked.items[0].blocked_reason.as_deref(),
            Some("blocking_usage")
        );
        sqlx::query("UPDATE asset_usages SET usage_policy = 'advisory' WHERE asset_id = ?")
            .bind(&third_asset.id)
            .execute(&pool)
            .await
            .unwrap();
        let analysis = analyze_delete(&pool, std::slice::from_ref(&third_asset.id))
            .await
            .unwrap();
        assert!(analysis.can_delete_all);
        assert!(analysis.requires_advisory_confirmation);
        assert_eq!(analysis.items[0].advisory_usage_count, 1);
        let confirmation_error =
            delete_assets(&pool, &paths, std::slice::from_ref(&third_asset.id), false)
                .await
                .unwrap_err();
        assert_eq!(confirmation_error, "ASSET_ADVISORY_CONFIRMATION_REQUIRED");
        let reclaimed = delete_assets(&pool, &paths, std::slice::from_ref(&third_asset.id), true)
            .await
            .unwrap();
        assert_eq!(reclaimed.reclaimed_count, 1);
        assert_eq!(reclaimed.pending_cleanup_count, 0);
        let tombstone = find_asset_by_id(&pool, &third_asset.id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(tombstone.availability, "reclaimed");
        assert!(tombstone.relative_path.is_none());

        sqlx::query("DELETE FROM asset_usages WHERE asset_id = ?")
            .bind(&third_asset.id)
            .execute(&pool)
            .await
            .unwrap();
        let fourth_temp = paths.imports.join("fourth.part");
        let (content_hash, size_bytes) =
            copy_and_hash(Cursor::new(b"same-content"), &fourth_temp).unwrap();
        let fourth = StagedObject {
            temp_path: fourth_temp,
            content_hash,
            size_bytes,
        };
        let (_, restored_asset) = register_staged_object(&pool, &paths, &source, &fourth)
            .await
            .unwrap();
        let restored_path = paths
            .resolve_relative(restored_asset.relative_path.as_deref().unwrap())
            .unwrap();
        let deleted = delete_assets(
            &pool,
            &paths,
            std::slice::from_ref(&restored_asset.id),
            false,
        )
        .await
        .unwrap();
        assert_eq!(deleted.deleted_count, 1);
        assert!(!restored_path.exists());
        assert!(find_asset_by_id(&pool, &restored_asset.id)
            .await
            .unwrap()
            .is_none());

        pool.close().await;
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn repair_marks_missing_assets_and_cleans_temporary_and_orphan_files() {
        let root = std::env::temp_dir().join(format!("aio-asset-test-{}", Uuid::new_v4()));
        let paths = AssetPaths {
            database: root.join(ASSET_DB),
            objects: root.join("objects"),
            imports: root.join("tmp").join("imports"),
            cache_root: root.join("cache"),
            root: root.clone(),
        };
        fs::create_dir_all(&paths.imports).unwrap();
        fs::create_dir_all(paths.objects.join("ff")).unwrap();
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        ASSET_MIGRATOR.run(&pool).await.unwrap();
        let source = AssetImportSource {
            reference: root.join("missing.txt").to_string_lossy().into_owned(),
            origin_kind: "file_picker".into(),
            source_module: "asset-manager-test".into(),
            original_name: Some("missing.txt".into()),
            mime_type: Some("text/plain".into()),
        };
        let temporary = paths.imports.join("managed.part");
        let (content_hash, size_bytes) =
            copy_and_hash(Cursor::new(b"managed"), &temporary).unwrap();
        let staged = StagedObject {
            temp_path: temporary,
            content_hash,
            size_bytes,
        };
        let (_, asset) = register_staged_object(&pool, &paths, &source, &staged)
            .await
            .unwrap();
        let managed_path = paths
            .resolve_relative(asset.relative_path.as_deref().unwrap())
            .unwrap();
        fs::remove_file(managed_path).unwrap();
        fs::write(paths.imports.join("abandoned.part"), b"partial").unwrap();
        fs::write(paths.objects.join("ff").join("orphan.bin"), b"orphan").unwrap();

        let report = repair_library(&pool, &paths).await.unwrap();
        assert_eq!(report.cleaned_temporary_files, 1);
        assert_eq!(report.cleaned_orphan_files, 1);
        assert_eq!(report.marked_missing_assets, 1);
        let repaired = find_asset_by_id(&pool, &asset.id).await.unwrap().unwrap();
        assert_eq!(repaired.availability, "missing");
        let summary = storage_summary(&pool, &paths).await.unwrap();
        assert_eq!(summary.missing_count, 1);
        assert_eq!(summary.ready_count, 0);

        pool.close().await;
        fs::remove_dir_all(root).unwrap();
    }
}
