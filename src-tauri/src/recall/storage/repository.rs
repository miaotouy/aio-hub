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

use crate::recall::core::{RecallCollection, RecallCollectionMeta, RecallEntry};
use crate::recall::tag_pool::ModelTagPool;
use std::path::Path;
use uuid::Uuid;

pub type LoadedVectors = (Vec<(Uuid, Vec<f32>)>, usize, usize);

pub trait RecallRepository: Send + Sync {
    fn initialize(&self) -> Result<(), String>;
    fn main_db_path(&self) -> &Path;
    fn vector_db_path(&self) -> &Path;

    fn list_collections(&self) -> Result<Vec<RecallCollectionMeta>, String>;
    fn load_collection(&self, collection_id: Uuid) -> Result<Option<RecallCollection>, String>;
    fn save_collection(&self, collection: &RecallCollection) -> Result<(), String>;
    fn delete_collection(&self, collection_id: Uuid) -> Result<(), String>;

    fn load_entries(&self, collection_id: Uuid) -> Result<Vec<RecallEntry>, String>;
    fn load_entry(
        &self,
        collection_id: Uuid,
        entry_id: Uuid,
    ) -> Result<Option<RecallEntry>, String>;
    fn upsert_entry(&self, collection_id: Uuid, entry: &RecallEntry) -> Result<(), String>;
    fn upsert_entries(&self, collection_id: Uuid, entries: &[RecallEntry]) -> Result<(), String>;
    fn delete_entries(&self, collection_id: Uuid, entry_ids: &[Uuid]) -> Result<(), String>;

    #[allow(clippy::too_many_arguments)]
    fn upsert_entry_vector(
        &self,
        collection_id: Uuid,
        entry_id: Uuid,
        model_id: &str,
        vector: &[f32],
        tokens: Option<u32>,
        content_hash: Option<&str>,
        updated_at: i64,
    ) -> Result<(), String>;
    fn load_vectors(
        &self,
        collection_id: Uuid,
        model_id: &str,
    ) -> Result<Option<LoadedVectors>, String>;
    fn delete_vectors_for_entries(
        &self,
        collection_id: Uuid,
        entry_ids: &[Uuid],
    ) -> Result<(), String>;
    fn clear_vectors_except_model(
        &self,
        collection_id: Option<Uuid>,
        keep_model_id: &str,
    ) -> Result<u32, String>;

    fn load_tag_pool(&self, model_id: &str) -> Result<ModelTagPool, String>;
    fn save_tag_pool(&self, pool: &ModelTagPool) -> Result<(), String>;
}
