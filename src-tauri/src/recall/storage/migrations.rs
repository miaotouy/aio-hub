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

use rusqlite::{params, Connection};

const MAIN_SCHEMA_V1: &str = r#"
CREATE TABLE recall_collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  author TEXT,
  icon TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_recall_collections_updated_at
ON recall_collections(updated_at DESC);

CREATE TABLE recall_entries (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL,
  key TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  assets_json TEXT NOT NULL DEFAULT '[]',
  priority INTEGER NOT NULL DEFAULT 100,
  enabled INTEGER NOT NULL DEFAULT 1,
  content_hash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (collection_id) REFERENCES recall_collections(id) ON DELETE CASCADE
);

CREATE INDEX idx_recall_entries_collection_updated
ON recall_entries(collection_id, updated_at DESC);
CREATE INDEX idx_recall_entries_collection_key
ON recall_entries(collection_id, key);
CREATE INDEX idx_recall_entries_collection_enabled
ON recall_entries(collection_id, enabled);
CREATE INDEX idx_recall_entries_content_hash
ON recall_entries(content_hash);

CREATE TABLE recall_workspace (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);

CREATE TABLE legacy_import_state (
  source_id TEXT PRIMARY KEY,
  source_path TEXT NOT NULL,
  source_fingerprint TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'partial', 'completed', 'failed')),
  report_json TEXT NOT NULL DEFAULT '{}',
  started_at INTEGER,
  completed_at INTEGER,
  updated_at INTEGER NOT NULL
);
"#;

const VECTOR_SCHEMA_V1: &str = r#"
CREATE TABLE recall_entry_vectors (
  collection_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  dimension INTEGER NOT NULL,
  vector_blob BLOB NOT NULL,
  tokens INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (collection_id, entry_id, model_id)
);

CREATE INDEX idx_recall_entry_vectors_model
ON recall_entry_vectors(model_id);
CREATE INDEX idx_recall_entry_vectors_entry
ON recall_entry_vectors(entry_id);

CREATE TABLE recall_models (
  collection_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  dimension INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  last_indexed_at INTEGER,
  PRIMARY KEY (collection_id, model_id)
);

CREATE TABLE recall_tag_vectors (
  model_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  tag_index INTEGER NOT NULL,
  dimension INTEGER NOT NULL,
  vector_blob BLOB NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (model_id, tag)
);

CREATE UNIQUE INDEX idx_recall_tag_vectors_model_index
ON recall_tag_vectors(model_id, tag_index);

CREATE TABLE legacy_import_state (
  source_id TEXT PRIMARY KEY,
  source_path TEXT NOT NULL,
  source_fingerprint TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'partial', 'completed', 'failed')),
  report_json TEXT NOT NULL DEFAULT '{}',
  started_at INTEGER,
  completed_at INTEGER,
  updated_at INTEGER NOT NULL
);
"#;

fn apply_migration(
    connection: &mut Connection,
    version: i64,
    name: &str,
    sql: &str,
) -> Result<(), String> {
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at INTEGER NOT NULL
            );",
        )
        .map_err(|error| format!("创建 schema_migrations 失败: {error}"))?;

    let already_applied = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = ?1)",
            [version],
            |row| row.get::<_, bool>(0),
        )
        .map_err(|error| format!("读取 schema migration 状态失败: {error}"))?;
    if already_applied {
        return Ok(());
    }

    let transaction = connection
        .transaction()
        .map_err(|error| format!("开启 schema migration 事务失败: {error}"))?;
    transaction
        .execute_batch(sql)
        .map_err(|error| format!("执行 schema migration {version} ({name}) 失败: {error}"))?;
    transaction
        .execute(
            "INSERT INTO schema_migrations(version, name, applied_at)
             VALUES (?1, ?2, unixepoch())",
            params![version, name],
        )
        .map_err(|error| format!("记录 schema migration {version} 失败: {error}"))?;
    transaction
        .commit()
        .map_err(|error| format!("提交 schema migration {version} 失败: {error}"))
}

pub fn apply_main_migrations(connection: &mut Connection) -> Result<(), String> {
    apply_migration(
        connection,
        1,
        "initialize_recall_source_schema",
        MAIN_SCHEMA_V1,
    )
}

pub fn apply_vector_migrations(connection: &mut Connection) -> Result<(), String> {
    apply_migration(
        connection,
        1,
        "initialize_recall_vector_schema",
        VECTOR_SCHEMA_V1,
    )
}
