// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0 (the "License");

#[path = "../../../../src-tauri/src/recall/storage/legacy_import.rs"]
pub mod legacy_import;
#[path = "../../../../src-tauri/src/recall/storage/migrations.rs"]
pub mod migrations;
#[path = "../../../../src-tauri/src/recall/storage/repository.rs"]
pub mod repository;
#[path = "../../../../src-tauri/src/recall/storage/sqlite.rs"]
pub mod sqlite;
#[path = "../../../../src-tauri/src/recall/storage/vector_blob.rs"]
pub mod vector_blob;

pub use repository::RecallRepository;

#[cfg(test)]
pub use sqlite::SqliteRecallRepository;
