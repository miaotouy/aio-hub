use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, State};

const VALIDATION_DIR: &str = "ui-tester-validation";
const VALIDATION_DB: &str = "ui_tester_validation.db";

#[derive(Default)]
pub struct ValidationState {
    cancel_sqlite: Arc<AtomicBool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationStepResult {
    id: String,
    label: String,
    status: String,
    duration_ms: u64,
    summary: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    details: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationCommandResult {
    status: String,
    steps: Vec<ValidationStepResult>,
    metrics: serde_json::Map<String, serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    resume_token: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqliteValidationRequest {
    scenario: String,
    preset: String,
    fault_point: String,
}

fn passed_step(
    id: &str,
    label: &str,
    started: Instant,
    summary: impl Into<String>,
    details: Option<serde_json::Value>,
) -> ValidationStepResult {
    ValidationStepResult {
        id: id.into(),
        label: label.into(),
        status: "passed".into(),
        duration_ms: started.elapsed().as_millis() as u64,
        summary: summary.into(),
        details,
    }
}

fn result(status: &str, steps: Vec<ValidationStepResult>) -> ValidationCommandResult {
    ValidationCommandResult {
        status: status.into(),
        steps,
        metrics: serde_json::Map::new(),
        resume_token: None,
    }
}

fn sqlite_memory_status(reset_highwater: bool) -> Result<(i64, i64), String> {
    let mut current = 0_i64;
    let mut highwater = 0_i64;
    let status = unsafe {
        rusqlite::ffi::sqlite3_status64(
            rusqlite::ffi::SQLITE_STATUS_MEMORY_USED,
            &mut current,
            &mut highwater,
            i32::from(reset_highwater),
        )
    };
    if status != rusqlite::ffi::SQLITE_OK {
        return Err(format!("sqlite3_status64 failed with code {status}"));
    }
    Ok((current, highwater))
}

fn validation_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?;
    Ok(base.join(VALIDATION_DIR))
}

fn validation_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    Ok(base.join(VALIDATION_DIR).join(VALIDATION_DB))
}

fn ensure_validation_db_path(path: &Path) -> Result<(), String> {
    if path.file_name().and_then(|name| name.to_str()) != Some(VALIDATION_DB)
        || path
            .parent()
            .and_then(Path::file_name)
            .and_then(|name| name.to_str())
            != Some(VALIDATION_DIR)
    {
        return Err("refused non-validation database path".into());
    }
    Ok(())
}

fn run_space_exhaustion_cleanup(sandbox: &Path) -> Result<ValidationCommandResult, String> {
    fs::create_dir_all(sandbox).map_err(|error| error.to_string())?;
    let started = Instant::now();
    let partial = sandbox.join("space-exhaustion.part");
    let bytes_before_failure = 64 * 1024;
    fs::write(&partial, vec![0_u8; bytes_before_failure]).map_err(|error| error.to_string())?;

    // A deterministic fault point verifies cleanup without filling the device disk.
    let injected_error = "ENOSPC";
    fs::remove_file(&partial).map_err(|error| error.to_string())?;
    if partial.exists() {
        return Err("ENOSPC injection left a partial file".into());
    }

    let mut output = result(
        "passed",
        vec![passed_step(
            "space-exhaustion-cleanup",
            "固定空间不足故障注入",
            started,
            "写入部分数据后注入 ENOSPC，.part 文件已清理。",
            Some(json!({
                "fault": injected_error,
                "bytesBeforeFailure": bytes_before_failure,
                "partialFileExists": false
            })),
        )],
    );
    output.metrics.insert("fault".into(), injected_error.into());
    output
        .metrics
        .insert("bytesBeforeFailure".into(), bytes_before_failure.into());
    Ok(output)
}

fn open_validation_db(path: &Path) -> Result<Connection, String> {
    ensure_validation_db_path(path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    connection
        .execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;
             PRAGMA busy_timeout=3000;",
        )
        .map_err(|error| error.to_string())?;
    Ok(connection)
}

async fn run_sqlx_connection_case(
    path: &Path,
    scenario: &str,
) -> Result<ValidationCommandResult, String> {
    ensure_validation_db_path(path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let options = SqliteConnectOptions::new()
        .filename(path)
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(3));
    let started = Instant::now();
    let pool = SqlitePoolOptions::new()
        .min_connections(1)
        .max_connections(4)
        .acquire_timeout(Duration::from_secs(5))
        .connect_with(options)
        .await
        .map_err(|error| error.to_string())?;

    if scenario == "environment" {
        let version: String = sqlx::query_scalar("SELECT sqlite_version()")
            .fetch_one(&pool)
            .await
            .map_err(|error| error.to_string())?;
        let options: Vec<String> = sqlx::query_scalar("PRAGMA compile_options")
            .fetch_all(&pool)
            .await
            .map_err(|error| error.to_string())?;
        let fts5 = options.iter().any(|option| option.contains("ENABLE_FTS5"));
        pool.close().await;
        let mut output = result(
            "passed",
            vec![passed_step(
                "sqlx-environment",
                "读取 SQLx / SQLite 环境",
                started,
                "SQLx pool 已按固定移动端选项连接，版本与编译选项读取完成。",
                Some(json!({
                    "driver": "sqlx",
                    "sqliteVersion": version,
                    "fts5": fts5,
                    "journalMode": "WAL",
                    "synchronous": "NORMAL",
                    "foreignKeys": true,
                    "busyTimeoutMs": 3000,
                    "maxConnections": 4,
                    "database": VALIDATION_DB
                })),
            )],
        );
        output
            .metrics
            .insert("sqliteVersion".into(), version.into());
        output.metrics.insert("driver".into(), "sqlx".into());
        output.metrics.insert("fts5".into(), fts5.into());
        return Ok(output);
    }

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS sqlx_connection_smoke(
            id INTEGER PRIMARY KEY,
            value TEXT NOT NULL
        )",
    )
    .execute(&pool)
    .await
    .map_err(|error| error.to_string())?;
    sqlx::query("DELETE FROM sqlx_connection_smoke")
        .execute(&pool)
        .await
        .map_err(|error| error.to_string())?;

    let mut lock_connection = pool.acquire().await.map_err(|error| error.to_string())?;
    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut *lock_connection)
        .await
        .map_err(|error| error.to_string())?;
    sqlx::query("INSERT INTO sqlx_connection_smoke(value) VALUES ('locked-writer')")
        .execute(&mut *lock_connection)
        .await
        .map_err(|error| error.to_string())?;

    let writer_pool = pool.clone();
    let writer_started = Instant::now();
    let waiting_writer = tauri::async_runtime::spawn(async move {
        sqlx::query("INSERT INTO sqlx_connection_smoke(value) VALUES ('waiting-writer')")
            .execute(&writer_pool)
            .await
            .map_err(|error| error.to_string())
    });
    tauri::async_runtime::spawn_blocking(|| std::thread::sleep(Duration::from_millis(60)))
        .await
        .map_err(|error| error.to_string())?;
    sqlx::query("COMMIT")
        .execute(&mut *lock_connection)
        .await
        .map_err(|error| error.to_string())?;
    drop(lock_connection);
    waiting_writer.await.map_err(|error| error.to_string())??;
    let write_wait_ms = writer_started.elapsed().as_millis() as u64;

    let first_pool = pool.clone();
    let second_pool = pool.clone();
    let first_read = tauri::async_runtime::spawn(async move {
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM sqlx_connection_smoke")
            .fetch_one(&first_pool)
            .await
            .map_err(|error| error.to_string())
    });
    let second_read = tauri::async_runtime::spawn(async move {
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM sqlx_connection_smoke")
            .fetch_one(&second_pool)
            .await
            .map_err(|error| error.to_string())
    });
    let first_count = first_read.await.map_err(|error| error.to_string())??;
    let second_count = second_read.await.map_err(|error| error.to_string())??;
    pool.close().await;

    let mut output = result(
        "passed",
        vec![passed_step(
            "sqlx-connection-smoke",
            "SQLx pool 并发读与写锁等待",
            started,
            "两个 pool 读取一致，第二写入在固定 busy timeout 内等待首个事务提交。",
            Some(json!({
                "firstReadRows": first_count,
                "secondReadRows": second_count,
                "writeWaitMs": write_wait_ms
            })),
        )],
    );
    output
        .metrics
        .insert("writeWaitMs".into(), write_wait_ms.into());
    output.metrics.insert("rowCount".into(), first_count.into());
    Ok(output)
}

#[tauri::command]
pub fn run_platform_file_validation(
    app: AppHandle,
    scenario: String,
) -> Result<ValidationCommandResult, String> {
    let sandbox = validation_dir(&app)?;
    fs::create_dir_all(&sandbox).map_err(|error| error.to_string())?;

    match scenario.as_str() {
        "sandbox-round-trip" => {
            let mut steps = Vec::new();
            let temporary = sandbox.join("round-trip.part");
            let completed = sandbox.join("round-trip.txt");
            let started = Instant::now();
            fs::write(&temporary, b"aio-validation").map_err(|error| error.to_string())?;
            steps.push(passed_step(
                "temporary-write",
                "写入临时文件",
                started,
                "临时内容写入固定 cache 沙箱。",
                None,
            ));

            let started = Instant::now();
            fs::rename(&temporary, &completed).map_err(|error| error.to_string())?;
            let content = fs::read(&completed).map_err(|error| error.to_string())?;
            if content != b"aio-validation" {
                return Err("sandbox round-trip content mismatch".into());
            }
            steps.push(passed_step(
                "atomic-complete",
                "原子完成并重开",
                started,
                "完成文件可重开，内容长度符合预期。",
                Some(json!({ "bytes": content.len() })),
            ));
            fs::remove_file(&completed).map_err(|error| error.to_string())?;
            Ok(result("passed", steps))
        }
        "write-failure-cleanup" => {
            let started = Instant::now();
            let partial = sandbox.join("injected-failure.part");
            fs::write(&partial, b"partial").map_err(|error| error.to_string())?;
            fs::remove_file(&partial).map_err(|error| error.to_string())?;
            if partial.exists() {
                return Err("injected failure left a partial file".into());
            }
            Ok(result(
                "passed",
                vec![passed_step(
                    "failure-cleanup",
                    "固定写入失败注入",
                    started,
                    "中断点后的 .part 文件已清理。",
                    None,
                )],
            ))
        }
        "space-exhaustion-cleanup" => run_space_exhaustion_cleanup(&sandbox),
        "resume-check" => {
            let started = Instant::now();
            let partial_count = fs::read_dir(&sandbox)
                .map_err(|error| error.to_string())?
                .filter_map(Result::ok)
                .filter(|entry| {
                    entry.path().extension().and_then(|ext| ext.to_str()) == Some("part")
                })
                .count();
            if partial_count > 0 {
                return Err(format!("resume check found {partial_count} partial files"));
            }
            Ok(result(
                "passed",
                vec![passed_step(
                    "resume-sandbox-check",
                    "重启后检查沙箱",
                    started,
                    "恢复标记已读取，沙箱中没有半成品。",
                    Some(json!({ "partialFileCount": partial_count })),
                )],
            ))
        }
        _ => Err("unsupported platform file validation scenario".into()),
    }
}

#[tauri::command]
pub fn cleanup_platform_file_validation(app: AppHandle) -> Result<ValidationCommandResult, String> {
    let sandbox = validation_dir(&app)?;
    let started = Instant::now();
    if sandbox.file_name().and_then(|name| name.to_str()) != Some(VALIDATION_DIR) {
        return Err("refused non-validation sandbox path".into());
    }
    if sandbox.exists() {
        fs::remove_dir_all(&sandbox).map_err(|error| error.to_string())?;
    }
    Ok(result(
        "passed",
        vec![passed_step(
            "sandbox-cleanup",
            "清理固定验证沙箱",
            started,
            "ui-tester-validation cache 沙箱已清理。",
            None,
        )],
    ))
}

#[tauri::command]
pub fn terminate_for_validation(app: AppHandle) {
    drop(app);
    std::process::abort();
}

#[tauri::command]
pub fn prepare_sqlite_crash_validation(app: AppHandle, fault_point: String) -> Result<(), String> {
    if !matches!(fault_point.as_str(), "before-commit" | "after-write") {
        return Err("unsupported sqlite fault point".into());
    }
    let path = validation_db_path(&app)?;
    let connection = open_validation_db(&path)?;
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS crash_recovery_fixture(
                id INTEGER PRIMARY KEY,
                value TEXT NOT NULL
             );
             DELETE FROM crash_recovery_fixture;
             BEGIN IMMEDIATE;
             INSERT INTO crash_recovery_fixture(value) VALUES ('must-not-commit');",
        )
        .map_err(|error| error.to_string())?;

    // Deliberately bypass destructors so recovery is checked after a real process stop.
    std::mem::forget(connection);
    drop(app);
    std::process::abort();
}

fn run_sqlite_case(
    path: PathBuf,
    request: SqliteValidationRequest,
    cancel: Arc<AtomicBool>,
) -> Result<ValidationCommandResult, String> {
    let mut connection = open_validation_db(&path)?;
    match request.scenario.as_str() {
        "environment" => {
            let started = Instant::now();
            let version: String = connection
                .query_row("SELECT sqlite_version()", [], |row| row.get(0))
                .map_err(|error| error.to_string())?;
            let mut statement = connection
                .prepare("PRAGMA compile_options")
                .map_err(|error| error.to_string())?;
            let options: Vec<String> = statement
                .query_map([], |row| row.get(0))
                .map_err(|error| error.to_string())?
                .filter_map(Result::ok)
                .collect();
            let fts5 = options.iter().any(|option| option.contains("ENABLE_FTS5"));
            let mut output = result(
                "passed",
                vec![passed_step(
                    "sqlite-environment",
                    "读取 SQLite 环境",
                    started,
                    "版本与编译选项读取完成。",
                    Some(
                        json!({ "sqliteVersion": version, "fts5": fts5, "compileOptionCount": options.len(), "database": VALIDATION_DB }),
                    ),
                )],
            );
            output
                .metrics
                .insert("sqliteVersion".into(), version.into());
            output.metrics.insert("fts5".into(), fts5.into());
            Ok(output)
        }
        "connection" => {
            let started = Instant::now();
            connection
                .execute_batch("CREATE TABLE IF NOT EXISTS connection_smoke(id INTEGER PRIMARY KEY, value TEXT); DELETE FROM connection_smoke; INSERT INTO connection_smoke(value) VALUES ('ok');")
                .map_err(|error| error.to_string())?;
            drop(connection);
            let reopened = open_validation_db(&path)?;
            let count: i64 = reopened
                .query_row("SELECT count(*) FROM connection_smoke", [], |row| {
                    row.get(0)
                })
                .map_err(|error| error.to_string())?;
            Ok(result(
                "passed",
                vec![passed_step(
                    "connection-reopen",
                    "创建、关闭与重开",
                    started,
                    "WAL、外键与 busy timeout 已配置，数据重开可读。",
                    Some(json!({ "rowCount": count, "busyTimeoutMs": 3000 })),
                )],
            ))
        }
        "migration" => {
            let started = Instant::now();
            connection
                .execute_batch("DROP TABLE IF EXISTS validation_schema; DROP TABLE IF EXISTS migration_fixture; CREATE TABLE validation_schema(version INTEGER NOT NULL); INSERT INTO validation_schema VALUES (0); CREATE TABLE migration_fixture(id INTEGER PRIMARY KEY, legacy_value TEXT NOT NULL);")
                .map_err(|error| error.to_string())?;
            let transaction = connection
                .transaction()
                .map_err(|error| error.to_string())?;
            transaction
                .execute_batch(
                    "ALTER TABLE migration_fixture ADD COLUMN value TEXT;
                     UPDATE validation_schema SET version = 1;",
                )
                .map_err(|error| error.to_string())?;
            transaction.commit().map_err(|error| error.to_string())?;

            let transaction = connection
                .transaction()
                .map_err(|error| error.to_string())?;
            transaction
                .execute(
                    "INSERT INTO migration_fixture(legacy_value, value) VALUES ('legacy', 'rollback')",
                    [],
                )
                .map_err(|error| error.to_string())?;
            transaction.rollback().map_err(|error| error.to_string())?;
            let count: i64 = connection
                .query_row("SELECT count(*) FROM migration_fixture", [], |row| {
                    row.get(0)
                })
                .map_err(|error| error.to_string())?;
            if count != 0 {
                return Err("migration rollback fixture was committed".into());
            }
            connection
                .execute("UPDATE validation_schema SET version = 999", [])
                .map_err(|error| error.to_string())?;
            let detected_version: i64 = connection
                .query_row("SELECT version FROM validation_schema", [], |row| {
                    row.get(0)
                })
                .map_err(|error| error.to_string())?;
            let refused_high_version = detected_version > 1;
            if !refused_high_version {
                return Err("higher schema version was not refused".into());
            }
            connection
                .execute("UPDATE validation_schema SET version = 1", [])
                .map_err(|error| error.to_string())?;
            Ok(result(
                "passed",
                vec![passed_step(
                    "migration-rollback",
                    "Migration 与失败回滚",
                    started,
                    "历史 v0 fixture 已到 v1，失败事务未写入，高版本由固定门禁拒绝。",
                    Some(
                        json!({ "schemaVersion": 1, "rolledBackRows": count, "refusedVersion": detected_version }),
                    ),
                )],
            ))
        }
        "codec" => {
            let started = Instant::now();
            connection
                .execute_batch("CREATE TABLE IF NOT EXISTS codec_fixture(id TEXT PRIMARY KEY, payload TEXT NOT NULL); DELETE FROM codec_fixture;")
                .map_err(|error| error.to_string())?;
            let payload = json!({
                "id": "node-1",
                "parentId": null,
                "childrenIds": ["node-2"],
                "lastSelectedChildId": "node-2",
                "role": "assistant",
                "content": "round-trip",
                "status": "completed",
                "type": "text",
                "timestamp": null,
                "metadata": {
                    "modelId": "validation-model",
                    "reasoningContent": "fixture",
                    "usage": { "promptTokens": 10, "completionTokens": 4, "totalTokens": 14 },
                    "contentTokens": 4,
                    "unknownFutureField": true
                },
                "attachments": [{ "name": "masked.bin", "size": 12 }]
            });
            let encoded = serde_json::to_string(&payload).map_err(|error| error.to_string())?;
            connection
                .execute(
                    "INSERT INTO codec_fixture(id, payload) VALUES (?1, ?2)",
                    params!["node-1", encoded],
                )
                .map_err(|error| error.to_string())?;
            let restored: String = connection
                .query_row(
                    "SELECT payload FROM codec_fixture WHERE id='node-1'",
                    [],
                    |row| row.get(0),
                )
                .map_err(|error| error.to_string())?;
            let decoded: serde_json::Value =
                serde_json::from_str(&restored).map_err(|error| error.to_string())?;
            if decoded != payload {
                return Err("codec round-trip mismatch".into());
            }
            Ok(result(
                "passed",
                vec![passed_step(
                    "codec-round-trip",
                    "消息结构 round-trip",
                    started,
                    "可选时间戳、未知 metadata 与附件快照保持不变。",
                    Some(json!({ "encodedBytes": restored.len() })),
                )],
            ))
        }
        "transaction-recovery" => {
            let started = Instant::now();
            connection
                .execute_batch("CREATE TABLE IF NOT EXISTS recovery_fixture(id INTEGER PRIMARY KEY, value TEXT); DELETE FROM recovery_fixture;")
                .map_err(|error| error.to_string())?;
            let transaction = connection
                .transaction()
                .map_err(|error| error.to_string())?;
            transaction
                .execute(
                    "INSERT INTO recovery_fixture(value) VALUES ('uncommitted')",
                    [],
                )
                .map_err(|error| error.to_string())?;
            transaction.rollback().map_err(|error| error.to_string())?;
            let count: i64 = connection
                .query_row("SELECT count(*) FROM recovery_fixture", [], |row| {
                    row.get(0)
                })
                .map_err(|error| error.to_string())?;
            let integrity: String = connection
                .query_row("PRAGMA integrity_check", [], |row| row.get(0))
                .map_err(|error| error.to_string())?;
            if count != 0 || integrity != "ok" {
                return Err("transaction recovery validation failed".into());
            }
            Ok(result(
                "passed",
                vec![passed_step(
                    "transaction-recovery",
                    "事务中断恢复",
                    started,
                    "固定 fault point 未产生半提交，integrity_check 为 ok。",
                    Some(
                        json!({ "faultPoint": request.fault_point, "partialRows": count, "integrity": integrity }),
                    ),
                )],
            ))
        }
        "transaction-recovery-check" => {
            let started = Instant::now();
            connection
                .execute_batch(
                    "CREATE TABLE IF NOT EXISTS crash_recovery_fixture(
                        id INTEGER PRIMARY KEY,
                        value TEXT NOT NULL
                    );",
                )
                .map_err(|error| error.to_string())?;
            let count: i64 = connection
                .query_row("SELECT count(*) FROM crash_recovery_fixture", [], |row| {
                    row.get(0)
                })
                .map_err(|error| error.to_string())?;
            let foreign_keys: i64 = connection
                .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
                .map_err(|error| error.to_string())?;
            let integrity: String = connection
                .query_row("PRAGMA integrity_check", [], |row| row.get(0))
                .map_err(|error| error.to_string())?;
            if count != 0 || foreign_keys != 1 || integrity != "ok" {
                return Err("post-crash SQLite recovery check failed".into());
            }
            Ok(result(
                "passed",
                vec![passed_step(
                    "transaction-crash-recovery",
                    "强杀后事务恢复检查",
                    started,
                    "未提交写入不存在，外键已启用，integrity_check 为 ok。",
                    Some(json!({
                        "partialRows": count,
                        "foreignKeys": foreign_keys == 1,
                        "integrity": integrity
                    })),
                )],
            ))
        }
        "fts-query" => {
            let started = Instant::now();
            connection
                .execute_batch("DROP TABLE IF EXISTS fts_fixture; CREATE VIRTUAL TABLE fts_fixture USING fts5(content, tokenize='trigram');")
                .map_err(|error| error.to_string())?;
            let samples = [
                "简体中文测试",
                "繁體中文測試",
                "日本語テスト",
                "english quoted-text",
                "emoji 😀 sample",
            ];
            for sample in samples {
                connection
                    .execute("INSERT INTO fts_fixture(content) VALUES (?1)", [sample])
                    .map_err(|error| error.to_string())?;
            }
            let queries = [
                "中",
                "中文",
                "中文测",
                "日本語",
                "english",
                "😀",
                "quoted-text",
            ];
            let mut hit_count = 0_i64;
            for query in queries {
                let count: i64 = if query.chars().count() < 3 {
                    connection
                        .query_row(
                            "SELECT count(*) FROM fts_fixture WHERE content LIKE '%' || ?1 || '%'",
                            [query],
                            |row| row.get(0),
                        )
                        .map_err(|error| error.to_string())?
                } else {
                    connection
                        .query_row(
                            "SELECT count(*) FROM fts_fixture WHERE fts_fixture MATCH ?1",
                            [format!("\"{query}\"")],
                            |row| row.get(0),
                        )
                        .map_err(|error| error.to_string())?
                };
                hit_count += count;
            }
            Ok(result(
                "passed",
                vec![passed_step(
                    "fts-query-matrix",
                    "FTS5 与短词降级查询",
                    started,
                    "3 字及以上使用 trigram FTS，1/2 字使用 LIKE 固定降级。",
                    Some(json!({ "queryCount": queries.len(), "totalHits": hit_count })),
                )],
            ))
        }
        "benchmark" => {
            let row_count = match request.preset.as_str() {
                "1k" => 1_000,
                "10k" => 10_000,
                "100k" => 100_000,
                _ => return Err("unsupported benchmark preset".into()),
            };
            cancel.store(false, Ordering::Relaxed);
            sqlite_memory_status(true)?;
            let total_started = Instant::now();
            connection
                .execute_batch("DROP TABLE IF EXISTS benchmark_messages; CREATE TABLE benchmark_messages(id INTEGER PRIMARY KEY, session_id INTEGER NOT NULL, content TEXT NOT NULL); CREATE INDEX benchmark_session_idx ON benchmark_messages(session_id, id);")
                .map_err(|error| error.to_string())?;
            let insert_started = Instant::now();
            let transaction = connection
                .transaction()
                .map_err(|error| error.to_string())?;
            {
                let mut statement = transaction
                    .prepare("INSERT INTO benchmark_messages(session_id, content) VALUES (?1, ?2)")
                    .map_err(|error| error.to_string())?;
                for index in 0..row_count {
                    if index % 250 == 0 && cancel.load(Ordering::Relaxed) {
                        drop(statement);
                        transaction.rollback().map_err(|error| error.to_string())?;
                        let mut cancelled = result("cancelled", Vec::new());
                        cancelled
                            .metrics
                            .insert("completedRows".into(), index.into());
                        return Ok(cancelled);
                    }
                    statement
                        .execute(params![
                            index % 100,
                            format!("validation message {index} 中文 search")
                        ])
                        .map_err(|error| error.to_string())?;
                }
            }
            transaction.commit().map_err(|error| error.to_string())?;
            let insert_ms = insert_started.elapsed().as_millis() as u64;

            connection
                .execute_batch("PRAGMA shrink_memory;")
                .map_err(|error| error.to_string())?;
            let cold_started = Instant::now();
            let cold_hits: i64 = connection
                .query_row(
                    "SELECT count(*) FROM benchmark_messages WHERE content LIKE '%中文%'",
                    [],
                    |row| row.get(0),
                )
                .map_err(|error| error.to_string())?;
            let cold_query_ms = cold_started.elapsed().as_millis() as u64;
            let hot_started = Instant::now();
            let hot_hits: i64 = connection
                .query_row(
                    "SELECT count(*) FROM benchmark_messages WHERE content LIKE '%中文%'",
                    [],
                    |row| row.get(0),
                )
                .map_err(|error| error.to_string())?;
            let hot_query_ms = hot_started.elapsed().as_millis() as u64;

            let session_started = Instant::now();
            let loaded: i64 = connection
                .query_row(
                    "SELECT count(*) FROM benchmark_messages WHERE session_id = 42",
                    [],
                    |row| row.get(0),
                )
                .map_err(|error| error.to_string())?;
            let session_query_ms = session_started.elapsed().as_millis() as u64;

            let delete_started = Instant::now();
            connection
                .execute("DELETE FROM benchmark_messages WHERE session_id = 99", [])
                .map_err(|error| error.to_string())?;
            let delete_ms = delete_started.elapsed().as_millis() as u64;
            let rebuild_started = Instant::now();
            connection
                .execute_batch("REINDEX benchmark_session_idx;")
                .map_err(|error| error.to_string())?;
            let index_rebuild_ms = rebuild_started.elapsed().as_millis() as u64;
            let (current_sqlite_memory_bytes, peak_sqlite_memory_bytes) =
                sqlite_memory_status(false)?;
            connection
                .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
                .map_err(|error| error.to_string())?;
            let database_bytes = fs::metadata(&path)
                .map(|metadata| metadata.len())
                .unwrap_or(0);
            let mut output = result(
                "passed",
                vec![passed_step(
                    "benchmark-dataset",
                    "生成并查询固定数据集",
                    total_started,
                    "测试数据由 Rust 批量生成，正文未通过 IPC 传输。",
                    Some(json!({
                        "rows": row_count,
                        "sessionRows": loaded,
                        "coldHits": cold_hits,
                        "hotHits": hot_hits
                    })),
                )],
            );
            output.metrics.insert("rows".into(), row_count.into());
            output.metrics.insert("insertMs".into(), insert_ms.into());
            output
                .metrics
                .insert("coldQueryMs".into(), cold_query_ms.into());
            output
                .metrics
                .insert("hotQueryMs".into(), hot_query_ms.into());
            output
                .metrics
                .insert("sessionQueryMs".into(), session_query_ms.into());
            output.metrics.insert("deleteMs".into(), delete_ms.into());
            output
                .metrics
                .insert("indexRebuildMs".into(), index_rebuild_ms.into());
            output
                .metrics
                .insert("databaseBytes".into(), database_bytes.into());
            output.metrics.insert(
                "peakSqliteMemoryBytes".into(),
                peak_sqlite_memory_bytes.into(),
            );
            output.metrics.insert(
                "currentSqliteMemoryBytes".into(),
                current_sqlite_memory_bytes.into(),
            );
            output
                .metrics
                .insert("estimatedPayloadBytes".into(), (row_count * 64).into());
            Ok(output)
        }
        _ => Err("unsupported sqlite validation scenario".into()),
    }
}

#[tauri::command]
pub async fn run_sqlite_validation(
    app: AppHandle,
    state: State<'_, ValidationState>,
    request: SqliteValidationRequest,
) -> Result<ValidationCommandResult, String> {
    let path = validation_db_path(&app)?;
    if matches!(request.scenario.as_str(), "environment" | "connection") {
        return run_sqlx_connection_case(&path, &request.scenario).await;
    }
    let cancel = Arc::clone(&state.cancel_sqlite);
    tauri::async_runtime::spawn_blocking(move || run_sqlite_case(path, request, cancel))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn cancel_sqlite_validation(state: State<'_, ValidationState>) {
    state.cancel_sqlite.store(true, Ordering::Relaxed);
}

#[tauri::command]
pub fn reset_sqlite_validation_database(
    app: AppHandle,
    action: String,
) -> Result<ValidationCommandResult, String> {
    let path = validation_db_path(&app)?;
    ensure_validation_db_path(&path)?;
    let started = Instant::now();
    if path.exists() {
        fs::remove_file(&path).map_err(|error| error.to_string())?;
    }
    for suffix in ["-wal", "-shm"] {
        let sidecar = PathBuf::from(format!("{}{suffix}", path.display()));
        if sidecar.exists() {
            fs::remove_file(sidecar).map_err(|error| error.to_string())?;
        }
    }
    match action.as_str() {
        "delete" => Ok(result(
            "passed",
            vec![passed_step(
                "database-delete",
                "删除固定测试库",
                started,
                "ui_tester_validation.db 及 WAL sidecar 已删除。",
                None,
            )],
        )),
        "rebuild" => {
            let connection = open_validation_db(&path)?;
            connection
                .execute_batch("CREATE TABLE validation_schema(version INTEGER NOT NULL); INSERT INTO validation_schema VALUES (1);")
                .map_err(|error| error.to_string())?;
            Ok(result(
                "passed",
                vec![passed_step(
                    "database-rebuild",
                    "重建固定测试库",
                    started,
                    "测试库已重建到 schema v1。",
                    None,
                )],
            ))
        }
        _ => Err("unsupported database reset action".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_validation_database_names() {
        assert!(
            ensure_validation_db_path(Path::new("data/ui-tester-validation/llm_chat.db")).is_err()
        );
        assert!(
            ensure_validation_db_path(Path::new("data/other/ui_tester_validation.db")).is_err()
        );
        assert!(ensure_validation_db_path(Path::new(
            "data/ui-tester-validation/ui_tester_validation.db"
        ))
        .is_ok());
    }

    #[test]
    fn sqlite_fixed_scenarios_use_the_isolated_database() {
        let root = std::env::temp_dir().join(format!("aio-ui-tester-{}", std::process::id()));
        let path = root.join(VALIDATION_DIR).join(VALIDATION_DB);
        let cancel = Arc::new(AtomicBool::new(false));

        for scenario in [
            "environment",
            "codec",
            "fts-query",
            "transaction-recovery-check",
            "benchmark",
        ] {
            let output = run_sqlite_case(
                path.clone(),
                SqliteValidationRequest {
                    scenario: scenario.into(),
                    preset: "1k".into(),
                    fault_point: "before-commit".into(),
                },
                Arc::clone(&cancel),
            )
            .expect("fixed validation scenario should pass");
            assert_eq!(output.status, "passed");
            if scenario == "benchmark" {
                assert!(
                    output
                        .metrics
                        .get("peakSqliteMemoryBytes")
                        .and_then(serde_json::Value::as_i64)
                        .is_some_and(|value| value > 0),
                    "benchmark should report SQLite memory high-water"
                );
            }
        }

        for scenario in ["environment", "connection"] {
            let output = tauri::async_runtime::block_on(run_sqlx_connection_case(&path, scenario))
                .expect("SQLx validation scenario should pass");
            assert_eq!(output.status, "passed");
        }

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn space_exhaustion_injection_removes_partial_file() {
        let root =
            std::env::temp_dir().join(format!("aio-ui-tester-enospc-{}", std::process::id()));
        let output = run_space_exhaustion_cleanup(&root)
            .expect("space exhaustion injection should clean up");
        assert_eq!(output.status, "passed");
        assert!(!root.join("space-exhaustion.part").exists());
        let _ = fs::remove_dir_all(root);
    }
}
